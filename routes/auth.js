const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const canvas = require('@napi-rs/canvas');
const { pool } = require('../config/database');
const { redirectIfLoggedIn } = require('../middleware/auth');
const { sendPasswordResetConfirmationEmail } = require('../services/emailService');
const {
    GENERIC_RECOVERY_MESSAGE,
    PASSWORD_REQUIREMENTS_MESSAGE,
    encryptRecoveryPayload,
    getResetTokenCandidates,
    hashResetToken,
    isStrongPassword,
    normalizeAccountIdentifier,
    resolveRecoveryEncryptionSecret,
    resolvePublicBaseUrl
} = require('../utils/account-recovery');

const router = express.Router();
const RECOVERY_IDENTIFIER_LIMIT = 5;
const RECOVERY_RESPONSE_FLOOR_MS = 300;

function sendGenericRecoveryResponse(res, requestStartedAt) {
    const elapsed = Date.now() - requestStartedAt;
    const remainingDelay = Math.max(0, RECOVERY_RESPONSE_FLOOR_MS - elapsed);

    if (remainingDelay === 0) {
        return res.json({
            success: true,
            message: GENERIC_RECOVERY_MESSAGE
        });
    }

    return setTimeout(() => {
        res.json({
            success: true,
            message: GENERIC_RECOVERY_MESSAGE
        });
    }, remainingDelay);
}

function createRecoveryCooldownKey(scope, value) {
    const normalizedValue = String(value).normalize('NFKC').toLowerCase();
    return crypto
        .createHmac('sha256', resolveRecoveryEncryptionSecret())
        .update(`account-recovery:${scope}\0${normalizedValue}`)
        .digest();
}

async function consumeRecoveryCooldown(connection, scope, keyHash) {
    await connection.execute(
        `INSERT IGNORE INTO account_recovery_cooldowns (
            scope, key_hash, window_started_at, attempt_count
         ) VALUES (?, ?, CURRENT_TIMESTAMP(6), 0)`,
        [scope, keyHash]
    );

    const [cooldownRows] = await connection.execute(
        `SELECT
            attempt_count,
            window_started_at <= CURRENT_TIMESTAMP(6) - INTERVAL 15 MINUTE AS window_expired,
            blocked_until IS NOT NULL
                AND blocked_until > CURRENT_TIMESTAMP(6) AS currently_blocked
         FROM account_recovery_cooldowns
         WHERE scope = ? AND key_hash = ?
         FOR UPDATE`,
        [scope, keyHash]
    );

    if (cooldownRows.length === 0) {
        throw new Error('Account recovery cooldown could not be created');
    }

    const cooldown = cooldownRows[0];
    if (Number(cooldown.currently_blocked) === 1) {
        return true;
    }

    if (Number(cooldown.window_expired) === 1) {
        await connection.execute(
            `UPDATE account_recovery_cooldowns
             SET window_started_at = CURRENT_TIMESTAMP(6),
                 attempt_count = 1,
                 blocked_until = NULL
             WHERE scope = ? AND key_hash = ?`,
            [scope, keyHash]
        );
        return false;
    }

    const nextAttemptCount = Number(cooldown.attempt_count) + 1;
    const isLimited = nextAttemptCount > RECOVERY_IDENTIFIER_LIMIT;

    await connection.execute(
        `UPDATE account_recovery_cooldowns
         SET attempt_count = ?,
             blocked_until = CASE
                WHEN ? = 1 THEN CURRENT_TIMESTAMP(6) + INTERVAL 15 MINUTE
                ELSE NULL
             END
         WHERE scope = ? AND key_hash = ?`,
        [nextAttemptCount, isLimited ? 1 : 0, scope, keyHash]
    );

    return isLimited;
}

async function enqueueAccountRecoveryRequest(identifier, req) {
    const connection = await pool.getConnection();
    let transactionStarted = false;

    try {
        await connection.beginTransaction();
        transactionStarted = true;

        const identifierKey = createRecoveryCooldownKey('identifier', identifier);
        if (await consumeRecoveryCooldown(connection, 'identifier', identifierKey)) {
            await connection.commit();
            transactionStarted = false;
            return false;
        }

        const [users] = await connection.execute(
            `SELECT User_UniqueID, username, email, first_name, last_name
             FROM users
             WHERE username = ? OR email = ?
             LIMIT 1`,
            [identifier, identifier]
        );

        if (users.length === 0) {
            await connection.commit();
            transactionStarted = false;
            return false;
        }

        const user = users[0];
        const accountKey = createRecoveryCooldownKey('account', user.User_UniqueID);
        if (await consumeRecoveryCooldown(connection, 'account', accountKey)) {
            await connection.commit();
            transactionStarted = false;
            return false;
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        const storedTokenHash = hashResetToken(resetToken);
        const eventId = crypto.randomUUID();
        const publicBaseUrl = resolvePublicBaseUrl(req);
        const encryptedPayload = encryptRecoveryPayload({
            rawToken: resetToken,
            publicBaseUrl,
            to: user.email,
            account: {
                username: user.username,
                email: user.email,
                first_name: user.first_name,
                last_name: user.last_name
            }
        });

        const [tokenResult] = await connection.execute(
            `INSERT INTO password_reset_tokens (user_id, email, token, expires_at)
             VALUES (?, ?, ?, CURRENT_TIMESTAMP + INTERVAL 1 HOUR)`,
            [user.User_UniqueID, user.email, storedTokenHash]
        );

        await connection.execute(
            `INSERT INTO account_recovery_outbox (
                event_id, user_id, reset_token_id, payload_ciphertext
             ) VALUES (?, ?, ?, ?)`,
            [eventId, user.User_UniqueID, tokenResult.insertId, encryptedPayload]
        );

        await connection.commit();
        transactionStarted = false;
        return true;
    } catch (error) {
        if (transactionStarted) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error('Failed to roll back account recovery enqueue:', rollbackError);
            }
        }

        throw error;
    } finally {
        connection.release();
    }
}

function normalizeLocalReturnUrl(value) {
    if (typeof value !== 'string'
        || !value.startsWith('/')
        || value.startsWith('//')
        || value.includes('\\')) {
        return '/home';
    }

    try {
        const parsedUrl = new URL(value, 'http://local.invalid');
        return parsedUrl.origin === 'http://local.invalid'
            ? `${parsedUrl.pathname}${parsedUrl.search}`
            : '/home';
    } catch (error) {
        return '/home';
    }
}

// Helper function to generate captcha
function generateCaptcha() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Helper function to create captcha image
function createCaptchaImage(text) {
    const width = 150;
    const height = 50;
    const canvas_obj = canvas.createCanvas(width, height);
    const ctx = canvas_obj.getContext('2d');

    // Background
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, width, height);

    // Add noise lines
    ctx.strokeStyle = '#ccc';
    for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(Math.random() * width, Math.random() * height);
        ctx.lineTo(Math.random() * width, Math.random() * height);
        ctx.stroke();
    }

    // Draw text
    ctx.fillStyle = '#333';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(text, width / 2, height / 2 + 8);

    return canvas_obj.toBuffer('image/png');
}

// Captcha route
router.get('/captcha', (req, res) => {
    const captchaText = generateCaptcha();
    req.session.captcha_code = captchaText;
    
    const imageBuffer = createCaptchaImage(captchaText);
    
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.send(imageBuffer);
});

// Login route
router.post('/login', 
    redirectIfLoggedIn,
    [
        body('login').notEmpty().withMessage('Username or email is required'),
        body('password').notEmpty().withMessage('Password is required'),
        body('captcha').notEmpty().withMessage('Verification code is required')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: errors.array()[0].msg
                });
            }

            const { login, password, captcha, remember, returnUrl } = req.body;

            // Check captcha
            if (!req.session.captcha_code) {
                return res.status(400).json({
                    success: false,
                    message: 'Verification code has expired. Please try again.'
                });
            }

            if (captcha.toLowerCase() !== req.session.captcha_code.toLowerCase()) {
                delete req.session.captcha_code;
                return res.status(400).json({
                    success: false,
                    message: 'Verification code is incorrect'
                });
            }

            // Clear captcha after use
            delete req.session.captcha_code;

            // Check user credentials
            const [rows] = await pool.execute(
                'SELECT User_UniqueID as id, username, email, password FROM users WHERE username = ? OR email = ?',
                [login, login]
            );

            if (rows.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'User not found'
                });
            }

            const user = rows[0];
            const passwordMatch = await bcrypt.compare(password, user.password);

            if (!passwordMatch) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid password'
                });
            }

            // Create session
            req.session.user_id = user.id;
            req.session.username = user.username;
            req.session.email = user.email;
            req.session.last_activity = Date.now();

            // Set remember cookie if requested
            if (remember) {
                res.cookie('remember_user', user.username, {
                    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production'
                });
            }

            const redirectUrl = normalizeLocalReturnUrl(returnUrl || req.session.returnUrl);
            delete req.session.returnUrl;

            res.json({
                success: true,
                message: 'Login successful',
                redirectUrl
            });

        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred during login'
            });
        }
    }
);

// Signup route
router.post('/signup',
    redirectIfLoggedIn,
    [
        body('username').trim().isLength({ min: 3, max: 50 }).withMessage('Username must be between 3 and 50 characters'),
        body('email').trim().isEmail().withMessage('Valid email is required'),
        body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
        body('confirm_password').custom((value, { req }) => {
            if (value !== req.body.password) {
                throw new Error('Passwords do not match');
            }
            return true;
        }),
        body('first_name').trim().notEmpty().withMessage('First name is required').bail()
            .isLength({ max: 50 }).withMessage('First name is too long'),
        body('last_name').trim().notEmpty().withMessage('Last name is required').bail()
            .isLength({ max: 50 }).withMessage('Last name is too long'),
        body('organization').trim().notEmpty().withMessage('Organization is required').bail()
            .isLength({ max: 100 }).withMessage('Organization is too long'),
        body('organization_type_num').notEmpty().withMessage('Organization type is required').bail()
            .isInt({ min: 1 }).withMessage('Invalid organization type'),
        body('organization_type_other').optional({ checkFalsy: true }).trim().isLength({ max: 255 }).withMessage('Other organization type is too long'),
        body('job_title').trim().notEmpty().withMessage('Job / Position Title is required').bail()
            .isLength({ max: 100 }).withMessage('Job / Position Title is too long'),
        body('country_num').notEmpty().withMessage('Country is required').bail()
            .isInt({ min: 1 }).withMessage('Invalid country'),
        body('state_num').optional({ checkFalsy: true }).isInt({ min: 1 }).withMessage('Invalid state'),
        body('captcha').notEmpty().withMessage('Verification code is required')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: errors.array()[0].msg
                });
            }

            const {
                username,
                email,
                password,
                captcha,
                first_name,
                last_name,
                organization,
                organization_type_num,
                organization_type_other,
                job_title,
                country_num,
                state_num
            } = req.body;

            if (username.toLowerCase() === email.toLowerCase()) {
                return res.status(400).json({
                    success: false,
                    message: 'Username and email must be different'
                });
            }

            // Check captcha
            if (!req.session.captcha_code) {
                return res.status(400).json({
                    success: false,
                    message: 'Verification code has expired. Please try again.'
                });
            }

            if (captcha.toLowerCase() !== req.session.captcha_code.toLowerCase()) {
                delete req.session.captcha_code;
                return res.status(400).json({
                    success: false,
                    message: 'Verification code is incorrect'
                });
            }

            // Clear captcha after use
            delete req.session.captcha_code;

            const optionalText = value => {
                if (typeof value !== 'string') return null;
                const trimmedValue = value.trim();
                return trimmedValue || null;
            };
            const optionalId = value => value ? Number.parseInt(value, 10) : null;

            const organizationTypeId = optionalId(organization_type_num);
            const countryId = optionalId(country_num);
            const stateId = optionalId(state_num);
            let organizationTypeOther = optionalText(organization_type_other);

            if (organizationTypeId) {
                const [organizationTypeRows] = await pool.execute(
                    `SELECT OrganizationType
                     FROM OrganizationType_Ref
                     WHERE OrganizationTypeUniqueID = ?`,
                    [organizationTypeId]
                );

                if (organizationTypeRows.length === 0) {
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid organization type'
                    });
                }

                if (organizationTypeRows[0].OrganizationType === 'Other (please specify)') {
                    if (!organizationTypeOther) {
                        return res.status(400).json({
                            success: false,
                            message: 'Other organization type is required'
                        });
                    }
                } else {
                    organizationTypeOther = null;
                }
            } else {
                organizationTypeOther = null;
            }

            let selectedCountry = null;
            if (countryId) {
                const [countryRows] = await pool.execute(
                    'SELECT CountryUniqueID, ISOAlpha2 FROM Country_Ref WHERE CountryUniqueID = ?',
                    [countryId]
                );

                if (countryRows.length === 0) {
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid country'
                    });
                }

                [selectedCountry] = countryRows;
            }

            if (stateId && !countryId) {
                return res.status(400).json({
                    success: false,
                    message: 'Select a country before selecting a state'
                });
            }

            const isUnitedStates = selectedCountry && selectedCountry.ISOAlpha2 === 'US';
            if (isUnitedStates && !stateId) {
                return res.status(400).json({
                    success: false,
                    message: 'State is required when United States is selected'
                });
            }

            if (!isUnitedStates && stateId) {
                return res.status(400).json({
                    success: false,
                    message: 'State can only be selected for United States'
                });
            }

            if (stateId) {
                const [stateRows] = await pool.execute(
                    `SELECT StateUniqueID
                     FROM State_Ref
                     WHERE StateUniqueID = ? AND Country_Num = ?`,
                    [stateId, countryId]
                );

                if (stateRows.length === 0) {
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid state for the selected country'
                    });
                }
            }

            // Check both login namespaces so username and email cannot conflict.
            const [existingUsers] = await pool.execute(
                `SELECT User_UniqueID AS id
                 FROM users
                 WHERE username IN (?, ?) OR email IN (?, ?)
                 LIMIT 1`,
                [username, email, username, email]
            );

            if (existingUsers.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Username or email already exists'
                });
            }

            // Hash password
            const hashedPassword = await bcrypt.hash(password, 12);

            // Insert new user
            const [result] = await pool.execute(
                `INSERT INTO users (
                    username, email, password, first_name, last_name, organization,
                    OrganizationType_Num, OrganizationTypeOther, job_title,
                    Country_Num, State_Num, created_at
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
                [
                    username,
                    email,
                    hashedPassword,
                    optionalText(first_name),
                    optionalText(last_name),
                    optionalText(organization),
                    organizationTypeId,
                    organizationTypeOther,
                    optionalText(job_title),
                    countryId,
                    stateId
                ]
            );

            // Create session for new user
            req.session.user_id = result.insertId;
            req.session.username = username;
            req.session.email = email;
            req.session.last_activity = Date.now();

            res.json({
                success: true,
                message: 'Account created successfully',
                redirectUrl: '/home'
            });

        } catch (error) {
            console.error('Signup error:', error);

            if (error.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({
                    success: false,
                    message: 'Username or email already exists'
                });
            }

            if (error.code === 'ER_NO_REFERENCED_ROW_2') {
                return res.status(400).json({
                    success: false,
                    message: 'One of the selected signup options is invalid'
                });
            }

            res.status(500).json({
                success: false,
                message: 'An error occurred during signup'
            });
        }
    }
);

// Logout route
router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Session destruction error:', err);
            return res.status(500).json({
                success: false,
                message: 'Error during logout'
            });
        }
        
        res.clearCookie('sessionId');
        res.clearCookie('remember_user');
        
        res.json({
            success: true,
            message: 'Logged out successfully',
            redirectUrl: '/login'
        });
    });
});

// Check session status (for AJAX requests)
router.get('/check-session', (req, res) => {
    const sessionTimeout = parseInt(process.env.SESSION_TIMEOUT) * 1000 || 1800000;
    
    if (!req.session.user_id) {
        return res.json({
            logged_in: false,
            timeout: false
        });
    }

    const now = Date.now();
    const inactiveTime = now - (req.session.last_activity || now);
    
    if (inactiveTime >= sessionTimeout) {
        req.session.destroy((err) => {
            if (err) console.error('Session destruction error:', err);
        });
        
        return res.json({
            logged_in: false,
            timeout: true,
            message: 'Session expired due to inactivity'
    });
    }

    // Update last activity
    req.session.last_activity = now;
    
    res.json({
        logged_in: true,
        timeout: false,
        username: req.session.username
    });
});

// Account recovery request route. Accept the legacy "email" field for older clients.
router.post('/reset-password-request',
    redirectIfLoggedIn,
    (req, res, next) => {
        req.body = req.body || {};
        req.body.identifier =
            normalizeAccountIdentifier(req.body.identifier)
            || normalizeAccountIdentifier(req.body.email);
        next();
    },
    [
        body('identifier')
            .isLength({ min: 1, max: 100 })
            .withMessage('Please enter your username or email address'),
        body('captcha').trim().notEmpty().withMessage('Verification code is required')
    ],
    async (req, res) => {
        const requestStartedAt = Date.now();
        let requestPassedCaptcha = false;

        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: errors.array()[0].msg
                });
            }

            const { identifier, captcha } = req.body;

            if (!req.session.captcha_code) {
                return res.status(400).json({
                    success: false,
                    message: 'Verification code has expired. Please try again.'
                });
            }

            if (captcha.toLowerCase() !== req.session.captcha_code.toLowerCase()) {
                delete req.session.captcha_code;
                return res.status(400).json({
                    success: false,
                    message: 'Verification code is incorrect'
                });
            }

            delete req.session.captcha_code;
            requestPassedCaptcha = true;

            // Cooldown consumption, account lookup, token creation, and the
            // durable email job are committed atomically.
            await enqueueAccountRecoveryRequest(identifier, req);

            return sendGenericRecoveryResponse(res, requestStartedAt);
        } catch (error) {
            console.error('Error in password reset request:', error);

            // Once CAPTCHA succeeds, status and body must not reveal whether
            // the identifier exists or which internal operation failed.
            if (requestPassedCaptcha) {
                return sendGenericRecoveryResponse(res, requestStartedAt);
            }

            return res.status(500).json({
                success: false,
                message: 'An error occurred while processing your request. Please try again.'
            });
        }
    }
);

// Password reset form route (GET)
router.get('/reset-password', redirectIfLoggedIn, async (req, res) => {
    try {
        const token = normalizeAccountIdentifier(req.query.token);

        // No token is the normal entry point for requesting account recovery.
        if (!token) {
            return res.render('reset_password', {
                title: 'Account Recovery',
                error: null,
                token: null
            });
        }

        if (!/^[a-f0-9]{64}$/i.test(token)) {
            return res.redirect('/reset-password-expired');
        }

        const [hashedToken, legacyRawToken] = getResetTokenCandidates(token);
        const [tokens] = await pool.execute(
            `SELECT id
             FROM password_reset_tokens
             WHERE token IN (?, ?)
               AND used = 0
               AND expires_at > CURRENT_TIMESTAMP
             LIMIT 1`,
            [hashedToken, legacyRawToken]
        );

        if (tokens.length === 0) {
            return res.redirect('/reset-password-expired');
        }

        return res.render('reset_password', {
            title: 'Reset Password',
            token,
            error: null
        });
    } catch (error) {
        console.error('Error in password reset form:', error);
        return res.status(500).render('reset_password', {
            title: 'Account Recovery',
            error: 'We could not load account recovery right now. Please try again.',
            token: null
        });
    }
});

// Password reset submit route (POST)
router.post('/reset-password',
    redirectIfLoggedIn,
    [
        body('token')
            .matches(/^[a-f0-9]{64}$/i)
            .withMessage('Reset token is invalid'),
        body('password').custom(value => {
            if (!isStrongPassword(value)) {
                throw new Error(PASSWORD_REQUIREMENTS_MESSAGE);
            }
            return true;
        }),
        body('confirmPassword').custom((value, { req }) => {
            if (value !== req.body.password) {
                throw new Error('Password confirmation does not match password');
            }
            return true;
        })
        // No captcha is required here because the user has proved email access.
    ],
    async (req, res) => {
        let connection;
        let transactionStarted = false;

        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: errors.array()[0].msg
                });
            }

            const { token, password } = req.body;
            const [hashedToken, legacyRawToken] = getResetTokenCandidates(token);

            connection = await pool.getConnection();
            await connection.beginTransaction();
            transactionStarted = true;

            // Resolve the owner first without a lock, then consistently lock the
            // user row before the token row. This serializes concurrent reset
            // attempts for one account and avoids cross-token lock inversion.
            const [candidateTokens] = await connection.execute(
                `SELECT user_id
                 FROM password_reset_tokens
                 WHERE token IN (?, ?)
                   AND used = 0
                   AND expires_at > CURRENT_TIMESTAMP
                 LIMIT 1`,
                [hashedToken, legacyRawToken]
            );

            if (candidateTokens.length === 0) {
                await connection.rollback();
                transactionStarted = false;
                return res.status(400).json({
                    success: false,
                    message: 'This password reset link has expired or has already been used.',
                    redirect: '/reset-password-expired'
                });
            }

            const [users] = await connection.execute(
                `SELECT User_UniqueID AS user_id, username, email, first_name, last_name
                 FROM users
                 WHERE User_UniqueID = ?
                 LIMIT 1
                 FOR UPDATE`,
                [candidateTokens[0].user_id]
            );

            if (users.length === 0) {
                await connection.rollback();
                transactionStarted = false;
                return res.status(400).json({
                    success: false,
                    message: 'This password reset link has expired or has already been used.',
                    redirect: '/reset-password-expired'
                });
            }

            const user = users[0];
            const [tokens] = await connection.execute(
                `SELECT id
                 FROM password_reset_tokens
                 WHERE user_id = ?
                   AND token IN (?, ?)
                   AND used = 0
                   AND expires_at > CURRENT_TIMESTAMP
                 LIMIT 1
                 FOR UPDATE`,
                [user.user_id, hashedToken, legacyRawToken]
            );

            if (tokens.length === 0) {
                await connection.rollback();
                transactionStarted = false;
                return res.status(400).json({
                    success: false,
                    message: 'This password reset link has expired or has already been used.',
                    redirect: '/reset-password-expired'
                });
            }

            const hashedPassword = await bcrypt.hash(password, 12);

            await connection.execute(
                'UPDATE users SET password = ? WHERE User_UniqueID = ?',
                [hashedPassword, user.user_id]
            );

            const [tokenUpdate] = await connection.execute(
                'UPDATE password_reset_tokens SET used = 1 WHERE user_id = ? AND used = 0',
                [user.user_id]
            );

            if (tokenUpdate.affectedRows < 1) {
                throw new Error('Password reset token could not be consumed');
            }

            await connection.commit();
            transactionStarted = false;

            let confirmationEmailSent = false;
            try {
                const confirmationResult = await sendPasswordResetConfirmationEmail(user.email, user);
                confirmationEmailSent = Boolean(confirmationResult && confirmationResult.success);

                if (!confirmationEmailSent) {
                    console.error('Failed to send password reset confirmation email:', confirmationResult && confirmationResult.error);
                }
            } catch (emailError) {
                console.error('Failed to send password reset confirmation email:', emailError);
            }

            return res.json({
                success: true,
                message: 'Your password has been reset successfully. You can now log in with your new password.',
                redirectUrl: '/login',
                confirmationEmailSent
            });
        } catch (error) {
            if (connection && transactionStarted) {
                try {
                    await connection.rollback();
                } catch (rollbackError) {
                    console.error('Error rolling back password reset:', rollbackError);
                }
            }

            console.error('Error resetting password:', error);
            return res.status(500).json({
                success: false,
                message: 'An error occurred while resetting your password. Please try again.'
            });
        } finally {
            if (connection) {
                connection.release();
            }
        }
    }
);

module.exports = router;
