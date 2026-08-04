const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');

const express = require('express');
const ejs = require('ejs');
const session = require('express-session');

const {
    GENERIC_RECOVERY_MESSAGE,
    buildPasswordResetUrl,
    decryptRecoveryPayload,
    encryptRecoveryPayload,
    getResetTokenCandidates,
    hashResetToken,
    isStrongPassword,
    normalizeAccountIdentifier,
    normalizePublicBaseUrl,
    resolvePublicBaseUrl
} = require('../utils/account-recovery');

test('account recovery utilities normalize identifiers and protect reset tokens', () => {
    assert.equal(normalizeAccountIdentifier('  ExampleUser  '), 'ExampleUser');
    assert.equal(normalizeAccountIdentifier(null), '');

    const rawToken = 'raw-reset-token';
    const hashedToken = hashResetToken(rawToken);
    assert.equal(hashedToken.length, 64);
    assert.notEqual(hashedToken, rawToken);
    assert.deepEqual(getResetTokenCandidates(rawToken), [hashedToken, rawToken]);

    assert.equal(
        buildPasswordResetUrl('https://accounts.example.test/base', rawToken),
        'https://accounts.example.test/reset-password?token=raw-reset-token'
    );
    assert.equal(normalizePublicBaseUrl('https://example.test///'), 'https://example.test');
    assert.throws(() => normalizePublicBaseUrl('javascript:alert(1)'), /http or https/);
    assert.equal(
        resolvePublicBaseUrl(
            { protocol: 'http', get: () => 'attacker.invalid' },
            { NODE_ENV: 'production', PUBLIC_BASE_URL: 'https://trusted.example.test' }
        ),
        'https://trusted.example.test'
    );
    assert.throws(
        () => resolvePublicBaseUrl(
            { protocol: 'http', get: () => 'attacker.invalid' },
            { NODE_ENV: 'production' }
        ),
        /PUBLIC_BASE_URL is required/
    );

    assert.equal(isStrongPassword('GoodPass1!'), true);
    assert.equal(isStrongPassword('weakpass'), false);

    const recoveryPayload = {
        rawToken,
        to: 'registered@example.test'
    };
    const encryptedPayload = encryptRecoveryPayload(recoveryPayload, 'test-encryption-secret');
    assert.deepEqual(
        decryptRecoveryPayload(encryptedPayload, 'test-encryption-secret'),
        recoveryPayload
    );
    assert.doesNotMatch(encryptedPayload, new RegExp(rawToken));
    assert.throws(
        () => decryptRecoveryPayload(encryptedPayload, 'wrong-secret'),
        /authenticate data|unable to authenticate/i
    );
});

test('account recovery page displays server-side errors', async () => {
    const html = await ejs.renderFile(
        path.join(__dirname, '..', 'views', 'reset_password.ejs'),
        {
            title: 'Account Recovery',
            token: null,
            error: 'Recovery service is temporarily unavailable.'
        }
    );

    assert.match(html, /Recovery service is temporarily unavailable\./);
    assert.match(html, /role="alert"/);
    assert.match(html, /Username or Email/);
});

test('account recovery supports username lookup and consumes each token once', async t => {
    const databaseModulePath = require.resolve('../config/database');
    const emailModulePath = require.resolve('../services/emailService');
    const authModulePath = require.resolve('../routes/auth');
    const originalDatabaseModule = require.cache[databaseModulePath];
    const originalEmailModule = require.cache[emailModulePath];
    const originalPublicBaseUrl = process.env.PUBLIC_BASE_URL;
    const originalNodeEnv = process.env.NODE_ENV;
    const originalRecoveryEncryptionKey = process.env.ACCOUNT_RECOVERY_ENCRYPTION_KEY;

    const sentConfirmationEmails = [];
    let storedToken;
    let storedOutbox;
    let passwordHash;
    let tokenConsumed = false;
    let resetTokenInsertSql;
    let failOutboxInsert = false;
    let outboxInsertCount = 0;
    const cooldowns = new Map();
    const transactionStatements = [];

    const user = {
        User_UniqueID: 42,
        username: 'ExampleUser',
        email: 'user@example.test',
        first_name: 'Example',
        last_name: 'User'
    };

    let transactionSnapshot;
    const connection = {
        async beginTransaction() {
            transactionSnapshot = {
                storedToken: storedToken ? { ...storedToken } : storedToken,
                storedOutbox: storedOutbox ? { ...storedOutbox } : storedOutbox,
                passwordHash,
                tokenConsumed,
                cooldowns: new Map(
                    [...cooldowns].map(([key, value]) => [key, { ...value }])
                )
            };
        },
        async rollback() {
            if (!transactionSnapshot) return;

            storedToken = transactionSnapshot.storedToken;
            storedOutbox = transactionSnapshot.storedOutbox;
            passwordHash = transactionSnapshot.passwordHash;
            tokenConsumed = transactionSnapshot.tokenConsumed;
            cooldowns.clear();
            for (const [key, value] of transactionSnapshot.cooldowns) {
                cooldowns.set(key, value);
            }
            transactionSnapshot = null;
        },
        async commit() {
            transactionSnapshot = null;
        },
        release() {},
        async execute(sql, params = []) {
            transactionStatements.push(sql);

            if (sql.includes('INSERT IGNORE INTO account_recovery_cooldowns')) {
                const key = `${params[0]}:${Buffer.from(params[1]).toString('hex')}`;
                if (!cooldowns.has(key)) {
                    cooldowns.set(key, { attempt_count: 0 });
                }
                return [{ affectedRows: 1 }];
            }

            if (sql.includes('FROM account_recovery_cooldowns') && sql.includes('FOR UPDATE')) {
                const key = `${params[0]}:${Buffer.from(params[1]).toString('hex')}`;
                const cooldown = cooldowns.get(key);
                return [[{
                    attempt_count: cooldown.attempt_count,
                    window_expired: 0,
                    currently_blocked: cooldown.currently_blocked ? 1 : 0
                }]];
            }

            if (sql.includes('UPDATE account_recovery_cooldowns')
                && sql.includes('SET attempt_count = ?')) {
                const key = `${params[2]}:${Buffer.from(params[3]).toString('hex')}`;
                cooldowns.set(key, {
                    attempt_count: params[0],
                    currently_blocked: params[1] === 1
                });
                return [{ affectedRows: 1 }];
            }

            if (sql.includes('UPDATE account_recovery_cooldowns')
                && sql.includes('SET window_started_at')) {
                const key = `${params[0]}:${Buffer.from(params[1]).toString('hex')}`;
                cooldowns.set(key, { attempt_count: 1 });
                return [{ affectedRows: 1 }];
            }

            if (sql.includes('FROM users') && sql.includes('WHERE username = ? OR email = ?')) {
                return [[
                    params[0] === user.username || params[0] === user.email
                        ? user
                        : undefined
                ].filter(Boolean)];
            }

            if (sql.includes('INSERT INTO password_reset_tokens')) {
                resetTokenInsertSql = sql;
                storedToken = {
                    id: 7,
                    userId: params[0],
                    email: params[1],
                    token: params[2]
                };
                tokenConsumed = false;
                return [{ insertId: 7 }];
            }

            if (sql.includes('INSERT INTO account_recovery_outbox')) {
                if (failOutboxInsert) {
                    throw new Error('simulated outbox insert failure');
                }

                storedOutbox = {
                    eventId: params[0],
                    userId: params[1],
                    resetTokenId: params[2],
                    payloadCiphertext: params[3]
                };
                outboxInsertCount += 1;
                return [{ insertId: 9 }];
            }

            if (sql.includes('SELECT user_id') && sql.includes('FROM password_reset_tokens')) {
                const tokenMatches = storedToken && params.includes(storedToken.token);
                return [tokenMatches && !tokenConsumed ? [{
                    user_id: user.User_UniqueID
                }] : []];
            }

            if (sql.includes('FROM users') && sql.includes('FOR UPDATE')) {
                return [params[0] === user.User_UniqueID ? [{
                    user_id: user.User_UniqueID,
                    username: user.username,
                    email: user.email,
                    first_name: user.first_name,
                    last_name: user.last_name
                }] : []];
            }

            if (sql.includes('SELECT id') && sql.includes('FROM password_reset_tokens')) {
                const tokenMatches = storedToken && params.includes(storedToken.token);
                return [tokenMatches && !tokenConsumed ? [{ id: 7 }] : []];
            }

            if (sql.startsWith('UPDATE users SET password')) {
                passwordHash = params[0];
                return [{ affectedRows: 1 }];
            }

            if (sql.startsWith('UPDATE password_reset_tokens SET used')) {
                if (tokenConsumed) return [{ affectedRows: 0 }];
                tokenConsumed = true;
                return [{ affectedRows: 1 }];
            }

            throw new Error(`Unexpected transaction SQL: ${sql}`);
        }
    };

    const pool = {
        async execute(sql, params = []) {
            if (sql.includes('SELECT id') && sql.includes('FROM password_reset_tokens')) {
                return [[storedToken && params.includes(storedToken.token) && !tokenConsumed ? { id: 7 } : undefined].filter(Boolean)];
            }

            throw new Error(`Unexpected pool SQL: ${sql}`);
        },
        async getConnection() {
            return connection;
        }
    };

    require.cache[databaseModulePath] = {
        id: databaseModulePath,
        filename: databaseModulePath,
        loaded: true,
        exports: { pool }
    };
    require.cache[emailModulePath] = {
        id: emailModulePath,
        filename: emailModulePath,
        loaded: true,
        exports: {
            async sendPasswordResetConfirmationEmail(to, account) {
                sentConfirmationEmails.push({ to, account });
                return { success: true, messageId: 'confirmation-message' };
            }
        }
    };
    delete require.cache[authModulePath];

    process.env.NODE_ENV = 'test';
    process.env.PUBLIC_BASE_URL = 'https://public.example.test';
    process.env.ACCOUNT_RECOVERY_ENCRYPTION_KEY = 'account-recovery-test-encryption-key';

    const authRouter = require('../routes/auth');
    const app = express();
    app.use(express.json());
    app.use(session({
        secret: 'account-recovery-test-secret',
        resave: false,
        saveUninitialized: false
    }));
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, '..', 'views'));
    app.get('/seed-captcha', (req, res) => {
        req.session.captcha_code = 'ABC123';
        res.json({ success: true });
    });
    app.use('/auth', authRouter);

    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const origin = `http://127.0.0.1:${address.port}`;

    t.after(async () => {
        await new Promise(resolve => server.close(resolve));
        delete require.cache[authModulePath];

        if (originalDatabaseModule) {
            require.cache[databaseModulePath] = originalDatabaseModule;
        } else {
            delete require.cache[databaseModulePath];
        }

        if (originalEmailModule) {
            require.cache[emailModulePath] = originalEmailModule;
        } else {
            delete require.cache[emailModulePath];
        }

        if (originalPublicBaseUrl === undefined) {
            delete process.env.PUBLIC_BASE_URL;
        } else {
            process.env.PUBLIC_BASE_URL = originalPublicBaseUrl;
        }

        if (originalNodeEnv === undefined) {
            delete process.env.NODE_ENV;
        } else {
            process.env.NODE_ENV = originalNodeEnv;
        }

        if (originalRecoveryEncryptionKey === undefined) {
            delete process.env.ACCOUNT_RECOVERY_ENCRYPTION_KEY;
        } else {
            process.env.ACCOUNT_RECOVERY_ENCRYPTION_KEY = originalRecoveryEncryptionKey;
        }
    });

    const seedResponse = await fetch(`${origin}/seed-captcha`);
    const cookie = seedResponse.headers.get('set-cookie').split(';')[0];

    const recoveryResponse = await fetch(`${origin}/auth/reset-password-request`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Cookie: cookie
        },
        body: JSON.stringify({
            identifier: `  ${user.username}  `,
            captcha: 'ABC123'
        })
    });
    const recoveryBody = await recoveryResponse.json();

    assert.equal(recoveryResponse.status, 200);
    assert.deepEqual(recoveryBody, {
        success: true,
        message: GENERIC_RECOVERY_MESSAGE
    });
    assert.ok(storedOutbox);
    const queuedPayload = decryptRecoveryPayload(
        storedOutbox.payloadCiphertext,
        process.env.ACCOUNT_RECOVERY_ENCRYPTION_KEY
    );
    assert.equal(queuedPayload.to, user.email);
    assert.equal(queuedPayload.account.username, user.username);
    assert.equal(queuedPayload.publicBaseUrl, 'https://public.example.test');

    const rawToken = queuedPayload.rawToken;
    assert.equal(storedToken.token, hashResetToken(rawToken));
    assert.notEqual(storedToken.token, rawToken);
    assert.doesNotMatch(storedOutbox.payloadCiphertext, new RegExp(rawToken));
    assert.match(resetTokenInsertSql, /CURRENT_TIMESTAMP \+ INTERVAL 1 HOUR/);

    const tokenPageResponse = await fetch(`${origin}/auth/reset-password?token=${encodeURIComponent(rawToken)}`);
    const tokenPageHtml = await tokenPageResponse.text();
    assert.equal(tokenPageResponse.status, 200);
    assert.match(tokenPageHtml, new RegExp(`value="${rawToken}"`));
    assert.match(tokenPageHtml, /Set New Password/);

    const weakPasswordResponse = await fetch(`${origin}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            token: rawToken,
            password: 'weakpass',
            confirmPassword: 'weakpass'
        })
    });
    assert.equal(weakPasswordResponse.status, 400);

    const resetResponse = await fetch(`${origin}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            token: rawToken,
            password: 'GoodPass1!',
            confirmPassword: 'GoodPass1!'
        })
    });
    const resetBody = await resetResponse.json();
    assert.equal(resetResponse.status, 200);
    assert.equal(resetBody.success, true);
    assert.equal(resetBody.confirmationEmailSent, true);
    assert.match(passwordHash, /^\$2[aby]\$/);
    assert.equal(sentConfirmationEmails.length, 1);
    assert.equal(sentConfirmationEmails[0].account.username, user.username);
    assert.ok(
        transactionStatements.some(sql =>
            sql.includes('UPDATE password_reset_tokens SET used = 1 WHERE user_id = ?')
        )
    );

    const reusedTokenResponse = await fetch(`${origin}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            token: rawToken,
            password: 'Another1!',
            confirmPassword: 'Another1!'
        })
    });
    assert.equal(reusedTokenResponse.status, 400);

    const secondSeedResponse = await fetch(`${origin}/seed-captcha`, {
        headers: { Cookie: cookie }
    });
    assert.equal(secondSeedResponse.status, 200);

    const unknownResponse = await fetch(`${origin}/auth/reset-password-request`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Cookie: cookie
        },
        body: JSON.stringify({
            identifier: 'missing-user',
            captcha: 'ABC123'
        })
    });
    assert.deepEqual(await unknownResponse.json(), {
        success: true,
        message: GENERIC_RECOVERY_MESSAGE
    });
    const originalTokenHash = storedToken.token;
    const originalOutboxEventId = storedOutbox.eventId;

    const thirdSeedResponse = await fetch(`${origin}/seed-captcha`, {
        headers: { Cookie: cookie }
    });
    assert.equal(thirdSeedResponse.status, 200);

    failOutboxInsert = true;
    const failedEnqueueResponse = await fetch(`${origin}/auth/reset-password-request`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Cookie: cookie
        },
        body: JSON.stringify({
            identifier: user.email,
            captcha: 'ABC123'
        })
    });
    const failedEnqueueBody = await failedEnqueueResponse.json();

    assert.equal(failedEnqueueResponse.status, unknownResponse.status);
    assert.deepEqual(failedEnqueueBody, {
        success: true,
        message: GENERIC_RECOVERY_MESSAGE
    });
    assert.equal(storedToken.token, originalTokenHash);
    assert.equal(storedOutbox.eventId, originalOutboxEventId);

    failOutboxInsert = false;
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const captchaResponse = await fetch(`${origin}/seed-captcha`, {
            headers: { Cookie: cookie }
        });
        assert.equal(captchaResponse.status, 200);

        const limitedResponse = await fetch(`${origin}/auth/reset-password-request`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Cookie: cookie
            },
            body: JSON.stringify({
                identifier: user.username,
                captcha: 'ABC123'
            })
        });
        assert.equal(limitedResponse.status, 200);
        assert.deepEqual(await limitedResponse.json(), {
            success: true,
            message: GENERIC_RECOVERY_MESSAGE
        });
    }
    assert.equal(outboxInsertCount, 5);

    const requestPageResponse = await fetch(`${origin}/auth/reset-password`);
    const requestPageHtml = await requestPageResponse.text();
    assert.equal(requestPageResponse.status, 200);
    assert.match(requestPageHtml, /Username or Email/);
    assert.doesNotMatch(requestPageHtml, /Invalid or missing reset token/);
});
