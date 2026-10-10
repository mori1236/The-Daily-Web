const mongoose = require('mongoose');
const config = require('../server/config');
const { seedAnalytics } = require('../server/seed');

async function main() {
    try {
        await mongoose.connect(config.mongoUri);
        await seedAnalytics();
    } finally {
        await mongoose.disconnect();
    }
}

main().catch(error => { console.error('Analytics seed failed:', error); process.exitCode = 1; });
