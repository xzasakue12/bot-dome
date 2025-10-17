const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { createStore } = require('./store');
const tokens = require('./tokens');
const mailer = require('./mailer');
const bcrypt = require('bcryptjs');

const PORT = process.env.PORT || 4000;

const app = express();
app.use(cors());
app.use(bodyParser.json());

let storePromise = createStore().catch((error) => {
    console.error('Failed to initialise auth store:', error);
    process.exit(1);
});

app.post('/auth/request-code', async (req, res) => {
    const store = await storePromise;
    const { email } = req.body || {};
    if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: 'Invalid email' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (process.env.ADMIN_EMAIL) {
        await store.ensureRole(process.env.ADMIN_EMAIL, 'admin');
    }

    let profile = await store.getProfile(normalizedEmail);

    if (!profile && process.env.AUTH_ALLOW_AUTO_PROVISION === 'true') {
        const defaultRole = process.env.AUTH_DEFAULT_ROLE || 'user';
        profile = await store.ensureRole(normalizedEmail, defaultRole);
    }

    if (!profile || !profile.role) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    const code = tokens.issueCode(normalizedEmail);
    try {
        const devMode = (process.env.AUTH_DEV_MODE || '').toLowerCase() === 'true';

        if (devMode) {
            console.warn(`[AUTH DEV MODE] Verification code for ${normalizedEmail}: ${code}`);
            return res.json({ success: true, code, role: profile.role });
        }

        await mailer.sendCode({
            to: normalizedEmail,
            code,
            appName: process.env.APP_NAME || 'Discord Bot Control'
        });
    } catch (error) {
        console.error('Failed to send code:', error);
        const devMode = (process.env.AUTH_DEV_MODE || '').toLowerCase() === 'true';
        if (devMode) {
            return res.json({ success: true, code, role: profile.role });
        }
        return res.status(500).json({ error: 'Failed to send code' });
    }

    return res.json({ success: true });
});

app.post('/auth/verify-code', async (req, res) => {
    const store = await storePromise;
    const { email, code } = req.body || {};
    if (!email || !code) {
        return res.status(400).json({ error: 'Missing email or code' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (process.env.ADMIN_EMAIL) {
        await store.ensureRole(process.env.ADMIN_EMAIL, 'admin');
    }

    let profile = await store.getProfile(normalizedEmail);

    if (!profile && process.env.AUTH_ALLOW_AUTO_PROVISION === 'true') {
        const defaultRole = process.env.AUTH_DEFAULT_ROLE || 'user';
        profile = await store.ensureRole(normalizedEmail, defaultRole);
    }

    if (!profile || !profile.role) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    const token = tokens.exchangeCode(normalizedEmail, code.trim());
    if (!token) {
        return res.status(400).json({ error: 'Invalid or expired code' });
    }

    const sessionToken = tokens.issueSession(normalizedEmail);
    return res.json({ token: sessionToken, role: profile.role });
});

app.post('/auth/login', async (req, res) => {
    const store = await storePromise;
    const { email, password } = req.body || {};
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const profile = await store.getProfileWithSecret(normalizedEmail);

    if (!profile || profile.role !== 'admin' || !profile.passwordHash) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    const matches = await bcrypt.compare(password, profile.passwordHash);
    if (!matches) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    const token = tokens.exchangeCode(normalizedEmail, tokens.issueCode(normalizedEmail));
    if (!token) {
        return res.status(500).json({ error: 'Failed to generate token' });
    }

    return res.json({ token, role: profile.role });
});

app.get('/auth/profile', async (req, res) => {
    const store = await storePromise;
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing token' });
    }

    const token = authHeader.slice('Bearer '.length);
    const session = tokens.validateToken(token);
    if (!session) {
        return res.status(401).json({ error: 'Invalid token' });
    }

    const profile = await store.getProfile(session.email);
    if (!profile) {
        return res.status(404).json({ error: 'Profile not found' });
    }

    return res.json({ email: session.email, role: profile.role });
});

app.listen(PORT, () => {
    console.log(`Auth API listening on port ${PORT}`);
});
