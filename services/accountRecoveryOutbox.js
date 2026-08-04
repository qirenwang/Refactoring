const crypto = require('crypto');

const { pool } = require('../config/database');
const { sendPasswordResetEmail } = require('./emailService');
const {
    buildPasswordResetUrl,
    decryptRecoveryPayload,
    hashResetToken
} = require('../utils/account-recovery');

const MAX_DELIVERY_ATTEMPTS = 5;
const OUTBOX_LEASE_SECONDS = 90;
const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_BATCH_SIZE = 5;
const RETRY_DELAYS_SECONDS = [30, 120, 300, 900];

let workerTimer = null;
let workerStopped = true;
let workerRunPromise = null;
let lastMaintenanceAt = 0;
let lastLoggedWorkerError = null;

function deliveryMessageId(eventId, publicBaseUrl) {
    const hostname = new URL(publicBaseUrl).hostname || 'localhost';
    return `<account-recovery-${eventId}@${hostname}>`;
}

function isValidPayload(payload, job) {
    return payload
        && typeof payload === 'object'
        && typeof payload.rawToken === 'string'
        && /^[a-f0-9]{64}$/i.test(payload.rawToken)
        && hashResetToken(payload.rawToken) === job.token_hash
        && typeof payload.publicBaseUrl === 'string'
        && typeof payload.to === 'string'
        && payload.to === job.email
        && payload.account
        && typeof payload.account === 'object'
        && payload.account.email === job.email;
}

async function claimNextRecoveryEmail(dbPool = pool) {
    const claimToken = crypto.randomUUID();
    const [claimResult] = await dbPool.execute(
        `UPDATE account_recovery_outbox
         SET status = 'processing',
             claim_token = ?,
             lease_until = CURRENT_TIMESTAMP(6) + INTERVAL ${OUTBOX_LEASE_SECONDS} SECOND,
             attempt_count = attempt_count + 1
         WHERE (
            (status IN ('pending', 'retry') AND next_attempt_at <= CURRENT_TIMESTAMP(6))
            OR
            (status = 'processing' AND lease_until < CURRENT_TIMESTAMP(6))
         )
           AND attempt_count < ?
         ORDER BY next_attempt_at, id
         LIMIT 1`,
        [claimToken, MAX_DELIVERY_ATTEMPTS]
    );

    if (claimResult.affectedRows !== 1) {
        return null;
    }

    const [jobs] = await dbPool.execute(
        `SELECT
            outbox.id,
            outbox.event_id,
            outbox.reset_token_id,
            outbox.payload_ciphertext,
            outbox.attempt_count,
            outbox.claim_token,
            reset_token.email,
            reset_token.token AS token_hash,
            reset_token.used,
            reset_token.expires_at > CURRENT_TIMESTAMP(6) AS token_is_valid
         FROM account_recovery_outbox AS outbox
         INNER JOIN password_reset_tokens AS reset_token
            ON reset_token.id = outbox.reset_token_id
         WHERE outbox.claim_token = ?
           AND outbox.status = 'processing'
         LIMIT 1`,
        [claimToken]
    );

    return jobs[0] || null;
}

async function markRecoveryEmailSent(job, dbPool = pool) {
    const [result] = await dbPool.execute(
        `UPDATE account_recovery_outbox
         SET status = 'sent',
             payload_ciphertext = NULL,
             claim_token = NULL,
             lease_until = NULL,
             last_error_code = NULL,
             sent_at = CURRENT_TIMESTAMP(6)
         WHERE id = ?
           AND claim_token = ?
           AND status = 'processing'`,
        [job.id, job.claim_token]
    );

    return result.affectedRows === 1;
}

async function markRecoveryEmailDead(job, errorCode, dbPool = pool) {
    const connection = await dbPool.getConnection();
    let transactionStarted = false;

    try {
        await connection.beginTransaction();
        transactionStarted = true;

        const [outboxResult] = await connection.execute(
            `UPDATE account_recovery_outbox
             SET status = 'dead',
                 payload_ciphertext = NULL,
                 claim_token = NULL,
                 lease_until = NULL,
                 last_error_code = ?
             WHERE id = ?
               AND claim_token = ?
               AND status = 'processing'`,
            [errorCode, job.id, job.claim_token]
        );

        if (outboxResult.affectedRows === 1) {
            await connection.execute(
                `UPDATE password_reset_tokens
                 SET used = 1
                 WHERE id = ? AND used = 0`,
                [job.reset_token_id]
            );
        }

        await connection.commit();
        transactionStarted = false;
        return outboxResult.affectedRows === 1;
    } catch (error) {
        if (transactionStarted) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error('Failed to roll back dead recovery email job:', rollbackError);
            }
        }
        throw error;
    } finally {
        connection.release();
    }
}

async function retryRecoveryEmail(job, dbPool = pool) {
    const delayIndex = Math.min(
        Math.max(Number(job.attempt_count) - 1, 0),
        RETRY_DELAYS_SECONDS.length - 1
    );
    const delaySeconds = RETRY_DELAYS_SECONDS[delayIndex];
    const [result] = await dbPool.execute(
        `UPDATE account_recovery_outbox
         SET status = 'retry',
             next_attempt_at = TIMESTAMPADD(SECOND, ?, CURRENT_TIMESTAMP(6)),
             claim_token = NULL,
             lease_until = NULL,
             last_error_code = 'smtp_delivery_failed'
         WHERE id = ?
           AND claim_token = ?
           AND status = 'processing'`,
        [delaySeconds, job.id, job.claim_token]
    );

    return result.affectedRows === 1;
}

async function processRecoveryEmailJob(job, options = {}) {
    const dbPool = options.pool || pool;
    const sendEmail = options.sendEmail || sendPasswordResetEmail;

    if (!job) {
        return false;
    }

    if (Number(job.used) !== 0 || Number(job.token_is_valid) !== 1) {
        return markRecoveryEmailDead(job, 'token_invalid', dbPool);
    }

    let payload;
    try {
        payload = decryptRecoveryPayload(job.payload_ciphertext);
    } catch (error) {
        console.error(`Account recovery job ${job.event_id} could not be decrypted`);
        return markRecoveryEmailDead(job, 'payload_decryption_failed', dbPool);
    }

    if (!isValidPayload(payload, job)) {
        console.error(`Account recovery job ${job.event_id} has an invalid payload`);
        return markRecoveryEmailDead(job, 'payload_invalid', dbPool);
    }

    let resetLink;
    let messageId;
    try {
        resetLink = buildPasswordResetUrl(payload.publicBaseUrl, payload.rawToken);
        messageId = deliveryMessageId(job.event_id, payload.publicBaseUrl);
    } catch (error) {
        console.error(`Account recovery job ${job.event_id} has an invalid public URL`);
        return markRecoveryEmailDead(job, 'public_url_invalid', dbPool);
    }

    let emailResult;
    try {
        emailResult = await sendEmail(
            payload.to,
            resetLink,
            payload.account,
            { messageId }
        );
    } catch (error) {
        emailResult = { success: false, error: error.message };
    }

    if (emailResult && emailResult.success) {
        return markRecoveryEmailSent(job, dbPool);
    }

    console.error(`Account recovery job ${job.event_id} delivery failed`);
    if (Number(job.attempt_count) >= MAX_DELIVERY_ATTEMPTS) {
        return markRecoveryEmailDead(job, 'delivery_attempts_exhausted', dbPool);
    }

    return retryRecoveryEmail(job, dbPool);
}

async function performOutboxMaintenance(dbPool = pool) {
    await dbPool.execute(
        `UPDATE account_recovery_outbox AS outbox
         INNER JOIN password_reset_tokens AS reset_token
            ON reset_token.id = outbox.reset_token_id
         SET outbox.status = 'dead',
             outbox.payload_ciphertext = NULL,
             outbox.claim_token = NULL,
             outbox.lease_until = NULL,
             outbox.last_error_code = 'token_invalid'
         WHERE outbox.status IN ('pending', 'retry')
           AND (reset_token.used = 1 OR reset_token.expires_at <= CURRENT_TIMESTAMP(6))`
    );

    await dbPool.execute(
        `UPDATE password_reset_tokens AS reset_token
         INNER JOIN account_recovery_outbox AS outbox
            ON outbox.reset_token_id = reset_token.id
         SET reset_token.used = 1
         WHERE outbox.status = 'processing'
           AND outbox.attempt_count >= ?
           AND outbox.lease_until < CURRENT_TIMESTAMP(6)
           AND reset_token.used = 0`,
        [MAX_DELIVERY_ATTEMPTS]
    );

    await dbPool.execute(
        `UPDATE account_recovery_outbox
         SET status = 'dead',
             payload_ciphertext = NULL,
             claim_token = NULL,
             lease_until = NULL,
             last_error_code = 'delivery_lease_exhausted'
         WHERE status = 'processing'
           AND attempt_count >= ?
           AND lease_until < CURRENT_TIMESTAMP(6)`,
        [MAX_DELIVERY_ATTEMPTS]
    );

    await dbPool.execute(
        `DELETE FROM account_recovery_cooldowns
         WHERE updated_at < CURRENT_TIMESTAMP(6) - INTERVAL 2 DAY
         LIMIT 1000`
    );

    await dbPool.execute(
        `DELETE FROM account_recovery_outbox
         WHERE (
            status = 'sent'
            AND sent_at < CURRENT_TIMESTAMP(6) - INTERVAL 7 DAY
         ) OR (
            status = 'dead'
            AND updated_at < CURRENT_TIMESTAMP(6) - INTERVAL 1 DAY
         )
         LIMIT 1000`
    );
}

async function processRecoveryOutboxBatch(options = {}) {
    const dbPool = options.pool || pool;
    const batchSize = options.batchSize || DEFAULT_BATCH_SIZE;

    if (Date.now() - lastMaintenanceAt >= 60 * 60 * 1000) {
        await performOutboxMaintenance(dbPool);
        lastMaintenanceAt = Date.now();
    }

    let processedJobs = 0;
    while (processedJobs < batchSize) {
        const job = await claimNextRecoveryEmail(dbPool);
        if (!job) break;

        await processRecoveryEmailJob(job, options);
        processedJobs += 1;
    }

    return processedJobs;
}

function logWorkerErrorOnce(error) {
    const errorKey = `${error.code || ''}:${error.message || error}`;
    if (errorKey !== lastLoggedWorkerError) {
        console.error('Account recovery outbox worker failed:', error);
        lastLoggedWorkerError = errorKey;
    }
}

function startAccountRecoveryOutboxWorker(options = {}) {
    if (!workerStopped) {
        return;
    }

    const pollIntervalMs = options.pollIntervalMs
        || Number.parseInt(process.env.ACCOUNT_RECOVERY_POLL_INTERVAL_MS, 10)
        || DEFAULT_POLL_INTERVAL_MS;
    workerStopped = false;

    const runAndSchedule = async () => {
        if (workerStopped) return;

        workerRunPromise = processRecoveryOutboxBatch(options)
            .then(() => {
                lastLoggedWorkerError = null;
            })
            .catch(logWorkerErrorOnce);
        await workerRunPromise;
        workerRunPromise = null;

        if (!workerStopped) {
            workerTimer = setTimeout(runAndSchedule, pollIntervalMs);
            workerTimer.unref?.();
        }
    };

    void runAndSchedule();
}

async function stopAccountRecoveryOutboxWorker() {
    workerStopped = true;
    if (workerTimer) {
        clearTimeout(workerTimer);
        workerTimer = null;
    }

    if (workerRunPromise) {
        await workerRunPromise;
    }
}

module.exports = {
    claimNextRecoveryEmail,
    performOutboxMaintenance,
    processRecoveryEmailJob,
    processRecoveryOutboxBatch,
    startAccountRecoveryOutboxWorker,
    stopAccountRecoveryOutboxWorker
};
