const { MongoClient } = require('mongodb');

async function ensureAdmin() {
    const uri = process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME || 'bot_control';
    const collectionName = process.env.MONGO_AUTH_COLLECTION || 'users';
    const adminEmail = process.env.ADMIN_EMAIL;

    if (!uri || !adminEmail) {
        throw new Error('Missing MONGO_URI or ADMIN_EMAIL environment variables');
    }

    const client = new MongoClient(uri);
    await client.connect();
    const collection = client.db(dbName).collection(collectionName);

    await collection.updateOne(
        { email: adminEmail.toLowerCase() },
        {
            $set: {
                email: adminEmail.toLowerCase(),
                role: 'admin',
                updatedAt: new Date()
            },
            $setOnInsert: {
                createdAt: new Date()
            }
        },
        { upsert: true }
    );

    await client.close();
}

ensureAdmin()
    .then(() => {
        console.log('Admin user ensured successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Failed to ensure admin user:', error);
        process.exit(1);
    });
