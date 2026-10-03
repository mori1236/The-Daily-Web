// Creates a user from the command line (needed for the first editor).
// Usage: node scripts/create-user.js "<name>" <email> <password> [writer|editor]
const mongoose = require('mongoose');
const config = require('../server/config');
const User = require('../server/models/user');

async function main() {
    const [name, email, password, role = 'writer'] = process.argv.slice(2);
    if (!name || !email || !password) {
        console.log('Usage: node scripts/create-user.js "<name>" <email> <password> [writer|editor]');
        process.exit(1);
    }

    await mongoose.connect(config.mongoUri);
    try {
        const user = new User({ name, email, role });
        await user.setPassword(password);
        await user.save();
        console.log(`Created ${user.role}: ${user.email}`);
    } catch (error) {
        console.error(error);
    }
    finally {
        await mongoose.disconnect();
    }
}

main().catch(err => {
    console.error(err.message);
    process.exit(1);
});
