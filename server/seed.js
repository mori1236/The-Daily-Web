const User = require('./models/user');

// Demo data for local development. Enabled with SEED_DEMO_DATA=true in .env.
// Every demo user has the password "123456".
const demoPassword = '123456';

const demoUsers = [
    { name: 'Dana Cohen', email: 'editor@dailyweb.test', role: 'editor' },
    { name: 'Yossi Levi', email: 'editor2@dailyweb.test', role: 'editor' },
    { name: 'Noa Mizrahi', email: 'writer@dailyweb.test', role: 'writer' },
    { name: 'Avi Peretz', email: 'writer2@dailyweb.test', role: 'writer' },
    { name: 'Maya Friedman', email: 'writer3@dailyweb.test', role: 'writer' },
];

// Adds the demo data only when the database has no users yet,
// so real data is never overwritten and restarts are safe.
async function seedDemoData() {
    const userCount = await User.countDocuments();
    if (userCount > 0) return;

    for (const data of demoUsers) {
        const user = new User(data);
        await user.setPassword(demoPassword);
        await user.save();
    }
    console.log(`Seeded ${demoUsers.length} demo users (password: ${demoPassword})`);
}

module.exports = { seedDemoData };
