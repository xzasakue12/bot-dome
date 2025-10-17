const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.resolve(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'subscriptions.json');

let store = {
    subscriptions: []
};

function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

function load() {
    ensureDataDir();
    if (!fs.existsSync(DATA_FILE)) {
        save();
        return;
    }

    try {
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.subscriptions)) {
            store.subscriptions = parsed.subscriptions;
        }
    } catch (error) {
        console.error('❌ Failed to load subscriptions:', error);
    }
}

function save() {
    ensureDataDir();
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf8');
    } catch (error) {
        console.error('❌ Failed to save subscriptions:', error);
    }
}

function list() {
    return store.subscriptions.map((entry) => ({ ...entry }));
}

function create({ name, inviteUrl, notes }) {
    if (!name || !inviteUrl) {
        throw new Error('Name and invite URL are required.');
    }

    const entry = {
        id: crypto.randomUUID(),
        code: crypto.randomBytes(6).toString('hex'),
        name: name.trim(),
        inviteUrl: inviteUrl.trim(),
        notes: notes ? String(notes).trim() : '',
        createdAt: new Date().toISOString()
    };

    store.subscriptions.push(entry);
    save();
    return { ...entry };
}

function remove(id) {
    const before = store.subscriptions.length;
    store.subscriptions = store.subscriptions.filter((entry) => entry.id !== id);
    if (store.subscriptions.length === before) {
        throw new Error('Subscription not found.');
    }
    save();
    return true;
}

function lookup(code) {
    if (!code) return null;
    const normalized = String(code).trim().toLowerCase();
    const entry = store.subscriptions.find((item) => item.code.toLowerCase() === normalized);
    if (!entry) return null;
    const { name, inviteUrl, notes, createdAt } = entry;
    return { name, inviteUrl, notes, createdAt };
}

load();

module.exports = {
    list,
    create,
    remove,
    lookup
};
