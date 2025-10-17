const { MongoClient } = require('mongodb');

let client;
let collection;

async function init() {
    if (collection) {
        return collection;
    }

    const uri = process.env.AUTH_MONGO_URI || process.env.MONGO_URI;
    if (!uri) {
        throw new Error('Missing AUTH_MONGO_URI or MONGO_URI for auth user store');
    }

    const dbName = process.env.AUTH_MONGO_DB_NAME || 'bot_control';
    const collName = process.env.AUTH_MONGO_COLLECTION || 'users';

    client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    collection = client.db(dbName).collection(collName);
    return collection;
}

async function ensureAdminUser(email) {
    if (!email) return null;

    const coll = await init();
    const lowerEmail = email.toLowerCase();
    const result = await coll.findOneAndUpdate(
        { email: lowerEmail },
        {
            $setOnInsert: {
                email: lowerEmail,
                role: 'admin',
                createdAt: new Date()
            }
        },
        { upsert: true, returnDocument: 'after' }
    );

    return result.value;
}

async function close() {
    if (client) {
        await client.close();
        client = null;
        collection = null;
    }
}

module.exports = {
    ensureAdminUser,
    close
};
