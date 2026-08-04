const crypto = require('crypto');

const GENERIC_RECOVERY_MESSAGE =
    'If an account matches that username or email, an email with the account username and password reset instructions has been sent to its registered email address.';

const PASSWORD_REQUIREMENTS_MESSAGE =
    'Password must be at least 8 characters and include uppercase, lowercase, number, and special character.';

function normalizeAccountIdentifier(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function hashResetToken(token) {
    return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function resolveRecoveryEncryptionSecret(env = process.env) {
    const secret = env.ACCOUNT_RECOVERY_ENCRYPTION_KEY || env.SESSION_SECRET;

    if (secret) {
        return secret;
    }

    if (env.NODE_ENV === 'production') {
        throw new Error(
            'ACCOUNT_RECOVERY_ENCRYPTION_KEY or SESSION_SECRET is required in production'
        );
    }

    return 'development-only-account-recovery-key';
}

function deriveRecoveryEncryptionKey(secret) {
    return crypto.createHash('sha256').update(String(secret)).digest();
}

function encryptRecoveryPayload(payload, secret = resolveRecoveryEncryptionSecret()) {
    const initializationVector = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(
        'aes-256-gcm',
        deriveRecoveryEncryptionKey(secret),
        initializationVector
    );
    const ciphertext = Buffer.concat([
        cipher.update(JSON.stringify(payload), 'utf8'),
        cipher.final()
    ]);
    const authenticationTag = cipher.getAuthTag();

    return [
        'v1',
        initializationVector.toString('hex'),
        authenticationTag.toString('hex'),
        ciphertext.toString('base64')
    ].join(':');
}

function decryptRecoveryPayload(encryptedPayload, secret = resolveRecoveryEncryptionSecret()) {
    const [version, initializationVectorHex, authenticationTagHex, ciphertextBase64] =
        String(encryptedPayload).split(':');

    if (version !== 'v1'
        || !/^[a-f0-9]{24}$/i.test(initializationVectorHex || '')
        || !/^[a-f0-9]{32}$/i.test(authenticationTagHex || '')
        || !ciphertextBase64) {
        throw new Error('Account recovery payload is invalid');
    }

    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        deriveRecoveryEncryptionKey(secret),
        Buffer.from(initializationVectorHex, 'hex')
    );
    decipher.setAuthTag(Buffer.from(authenticationTagHex, 'hex'));
    const plaintext = Buffer.concat([
        decipher.update(Buffer.from(ciphertextBase64, 'base64')),
        decipher.final()
    ]);

    return JSON.parse(plaintext.toString('utf8'));
}

function getResetTokenCandidates(token) {
    const rawToken = normalizeAccountIdentifier(token);
    return [hashResetToken(rawToken), rawToken];
}

function isStrongPassword(value) {
    return typeof value === 'string'
        && value.length >= 8
        && /[a-z]/.test(value)
        && /[A-Z]/.test(value)
        && /\d/.test(value)
        && /[^A-Za-z0-9]/.test(value);
}

function normalizePublicBaseUrl(value) {
    const parsedUrl = new URL(value);

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('PUBLIC_BASE_URL must use http or https');
    }

    parsedUrl.hash = '';
    parsedUrl.search = '';
    parsedUrl.pathname = parsedUrl.pathname.replace(/\/+$/, '') || '/';

    return parsedUrl.toString().replace(/\/$/, '');
}

function resolvePublicBaseUrl(req, env = process.env) {
    if (env.PUBLIC_BASE_URL) {
        return normalizePublicBaseUrl(env.PUBLIC_BASE_URL);
    }

    if (env.NODE_ENV === 'production') {
        throw new Error('PUBLIC_BASE_URL is required in production');
    }

    return normalizePublicBaseUrl(`${req.protocol}://${req.get('host')}`);
}

function buildPasswordResetUrl(baseUrl, token) {
    const resetUrl = new URL('/reset-password', `${normalizePublicBaseUrl(baseUrl)}/`);
    resetUrl.searchParams.set('token', token);
    return resetUrl.toString();
}

module.exports = {
    GENERIC_RECOVERY_MESSAGE,
    PASSWORD_REQUIREMENTS_MESSAGE,
    buildPasswordResetUrl,
    decryptRecoveryPayload,
    encryptRecoveryPayload,
    getResetTokenCandidates,
    hashResetToken,
    isStrongPassword,
    normalizeAccountIdentifier,
    normalizePublicBaseUrl,
    resolveRecoveryEncryptionSecret,
    resolvePublicBaseUrl
};
