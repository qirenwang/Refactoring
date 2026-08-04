const assert = require('node:assert/strict');
const test = require('node:test');

const {
    encryptRecoveryPayload,
    hashResetToken
} = require('../utils/account-recovery');

test('durable recovery outbox claims with a lease and clears encrypted payloads', async t => {
    const emailModulePath = require.resolve('../services/emailService');
    const workerModulePath = require.resolve('../services/accountRecoveryOutbox');
    const originalEmailModule = require.cache[emailModulePath];
    const originalEncryptionKey = process.env.ACCOUNT_RECOVERY_ENCRYPTION_KEY;

    require.cache[emailModulePath] = {
        id: emailModulePath,
        filename: emailModulePath,
        loaded: true,
        exports: {
            async sendPasswordResetEmail() {
                throw new Error('Test must inject the email sender');
            }
        }
    };
    delete require.cache[workerModulePath];
    process.env.ACCOUNT_RECOVERY_ENCRYPTION_KEY = 'outbox-worker-test-encryption-key';

    t.after(() => {
        delete require.cache[workerModulePath];

        if (originalEmailModule) {
            require.cache[emailModulePath] = originalEmailModule;
        } else {
            delete require.cache[emailModulePath];
        }

        if (originalEncryptionKey === undefined) {
            delete process.env.ACCOUNT_RECOVERY_ENCRYPTION_KEY;
        } else {
            process.env.ACCOUNT_RECOVERY_ENCRYPTION_KEY = originalEncryptionKey;
        }
    });

    const {
        claimNextRecoveryEmail,
        processRecoveryEmailJob
    } = require('../services/accountRecoveryOutbox');

    const rawToken = 'a'.repeat(64);
    const eventId = '11111111-2222-4333-8444-555555555555';
    const payloadCiphertext = encryptRecoveryPayload({
        rawToken,
        publicBaseUrl: 'https://public.example.test',
        to: 'registered@example.test',
        account: {
            username: 'ExampleUser',
            email: 'registered@example.test',
            first_name: 'Example'
        }
    });
    const baseJob = {
        id: 9,
        event_id: eventId,
        reset_token_id: 7,
        payload_ciphertext: payloadCiphertext,
        attempt_count: 1,
        claim_token: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        email: 'registered@example.test',
        token_hash: hashResetToken(rawToken),
        used: 0,
        token_is_valid: 1
    };

    assert.doesNotMatch(payloadCiphertext, new RegExp(rawToken));

    const claimStatements = [];
    const claimPool = {
        async execute(sql, params) {
            claimStatements.push({ sql, params });
            if (sql.startsWith('UPDATE account_recovery_outbox')) {
                return [{ affectedRows: 1 }];
            }
            if (sql.includes('FROM account_recovery_outbox AS outbox')) {
                return [[{ ...baseJob, claim_token: params[0] }]];
            }
            throw new Error(`Unexpected claim SQL: ${sql}`);
        }
    };

    const claimedJob = await claimNextRecoveryEmail(claimPool);
    assert.ok(claimedJob);
    assert.equal(claimedJob.claim_token, claimStatements[0].params[0]);
    assert.match(claimStatements[0].sql, /lease_until/);
    assert.match(claimStatements[0].sql, /ORDER BY next_attempt_at, id/);
    assert.match(claimStatements[0].sql, /LIMIT 1/);

    let sentEmail;
    let sentUpdate;
    const successPool = {
        async execute(sql, params) {
            sentUpdate = { sql, params };
            return [{ affectedRows: 1 }];
        }
    };

    const sent = await processRecoveryEmailJob(baseJob, {
        pool: successPool,
        async sendEmail(to, resetLink, account, options) {
            sentEmail = { to, resetLink, account, options };
            return { success: true, messageId: options.messageId };
        }
    });

    assert.equal(sent, true);
    assert.equal(sentEmail.to, baseJob.email);
    assert.equal(new URL(sentEmail.resetLink).searchParams.get('token'), rawToken);
    assert.equal(
        sentEmail.options.messageId,
        `<account-recovery-${eventId}@public.example.test>`
    );
    assert.match(sentUpdate.sql, /status = 'sent'/);
    assert.match(sentUpdate.sql, /payload_ciphertext = NULL/);
    assert.deepEqual(sentUpdate.params, [baseJob.id, baseJob.claim_token]);

    let retryUpdate;
    const retryPool = {
        async execute(sql, params) {
            retryUpdate = { sql, params };
            return [{ affectedRows: 1 }];
        }
    };

    const retried = await processRecoveryEmailJob(baseJob, {
        pool: retryPool,
        async sendEmail() {
            return { success: false, error: 'temporary failure' };
        }
    });

    assert.equal(retried, true);
    assert.match(retryUpdate.sql, /status = 'retry'/);
    assert.equal(retryUpdate.params[0], 30);

    const deadStatements = [];
    const deadConnection = {
        async beginTransaction() {},
        async commit() {},
        async rollback() {},
        release() {},
        async execute(sql, params) {
            deadStatements.push({ sql, params });
            return [{ affectedRows: 1 }];
        }
    };
    const deadPool = {
        async getConnection() {
            return deadConnection;
        }
    };

    const dead = await processRecoveryEmailJob(
        { ...baseJob, attempt_count: 5 },
        {
            pool: deadPool,
            async sendEmail() {
                return { success: false, error: 'permanent failure' };
            }
        }
    );

    assert.equal(dead, true);
    assert.match(deadStatements[0].sql, /status = 'dead'/);
    assert.match(deadStatements[0].sql, /payload_ciphertext = NULL/);
    assert.match(deadStatements[1].sql, /UPDATE password_reset_tokens/);
});
