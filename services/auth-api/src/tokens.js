const crypto = require('crypto');

const CODE_TTL_MS = 5 * 60 * 1000;
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

const pendingCodes = new Map();
const activeTokens = new Map();

function issueCode(email) {
    const code = crypto.randomInt(100000, 999999).toString();
    pendingCodes.set(email, {
        code,
        expiresAt: Date.now() + CODE_TTL_MS
    });
    return code;
}

function exchangeCode(email, code) {
    const entry = pendingCodes.get(email);
    if (!entry || entry.code !== code || entry.expiresAt < Date.now()) {
        return null;
    }

    pendingCodes.delete(email);

    const token = crypto.randomBytes(24).toString('hex');
    activeTokens.set(token, {
        email,
        expiresAt: Date.now() + TOKEN_TTL_MS
    });

    return token;
}

function issueSession(email) {
    const token = crypto.randomBytes(24).toString('hex');
    activeTokens.set(token, {
        email,
        expiresAt: Date.now() + TOKEN_TTL_MS
    });
    return token;
}

function validateToken(token) {
    const session = activeTokens.get(token);
    if (!session) return null;
    if (session.expiresAt < Date.now()) {
        activeTokens.delete(token);
        return null;
    }
    return session;
}

module.exports = {
    issueCode,
    exchangeCode,
    issueSession,
    validateToken
};
