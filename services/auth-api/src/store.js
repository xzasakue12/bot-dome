const { MongoClient } = require('mongodb');

async function createStore() {
    const uri = process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME || 'bot_control';
    const collectionName = process.env.MONGO_AUTH_COLLECTION || 'users';

    if (!uri) {
        throw new Error('Missing MONGO_URI for auth store');
    }

    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    await client.connect();

    const collection = client.db(dbName).collection(collectionName);

    return {
        async getProfile(email) {
            const doc = await collection.findOne({ email: email.toLowerCase() });
            return doc ? { email: doc.email, role: doc.role } : null;
        },
        async getProfileWithSecret(email) {
            return collection.findOne({ email: email.toLowerCase() });
        },
        async ensureRole(email, role) {
            if (!email) return null;
            const normalized = email.toLowerCase();
            const result = await collection.findOneAndUpdate(
                { email: normalized },
                {
                    $set: {
                        role,
                        updatedAt: new Date()
                    },
                    $setOnInsert: {
                        email: normalized,
                        createdAt: new Date()
                    }
                },
                { upsert: true, returnDocument: 'after' }
            );
            return result.value;
        },
        async setPassword(email, passwordHash) {
            if (!email || !passwordHash) return null;
            const normalized = email.toLowerCase();
            const result = await collection.findOneAndUpdate(
                { email: normalized },
                {
                    $set: {
                        passwordHash,
                        updatedAt: new Date()
                    },
                    $setOnInsert: {
                        email: normalized,
                        role: 'admin',
                        createdAt: new Date()
                    }
                },
                { upsert: true, returnDocument: 'after' }
            );
            return result.value;
        },
        async close() {
            await client.close();
        }
    };
}

module.exports = { createStore };
