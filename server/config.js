const path = require('path');

// Load .env from the project root (built into Node >= 20.12, no dotenv needed).
// Variables already set in the real environment take precedence.
try {
    process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch (err) {
    if (err.code !== 'ENOENT') throw err;
}

const errors = [];

function parsePort(value) {
    if (!value) return 3000;
    const port = Number(value);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        errors.push(`SERVER_PORT must be an integer between 1 and 65535 (got "${value}")`);
        return;
    }
    return port;
}

function parseMongoUri(value) {
    if (!value) return 'mongodb://localhost:27017/the-daily-web';
    if (!/^mongodb(\+srv)?:\/\//.test(value)) {
        errors.push('MONGO_URI must start with mongodb:// or mongodb+srv://');
        return;
    }
    try {
        // Replica-set URIs list several comma-separated hosts, which URL rejects,
        // so validate using only the first host.
        const [scheme, rest] = value.split('://');
        const [hosts, ...tail] = rest.split('/');
        const firstHost = hosts.split(',')[0];
        new URL(`${scheme}://${[firstHost, ...tail].join('/')}`);
    } catch {
        errors.push(`MONGO_URI is not a valid URI (got "${value}")`);
        return;
    }
    return value;
}

// Optional flag: "true" or "false" (default false).
function parseBoolean(name, value) {
    if (value === undefined || value === '') return false;
    if (value === 'true') return true;
    if (value === 'false') return false;
    errors.push(`${name} must be "true" or "false" (got "${value}")`);
}

const config = {
    port: parsePort(process.env.SERVER_PORT),
    mongoUri: parseMongoUri(process.env.MONGO_URI),
    seedDemoData: parseBoolean('SEED_DEMO_DATA', process.env.SEED_DEMO_DATA),
};

try {
    const siteUrl = new URL(process.env.SITE_URL || `http://localhost:${config.port}`);
    if (!['http:', 'https:'].includes(siteUrl.protocol) || siteUrl.username || siteUrl.password) throw new Error();
    config.siteUrl = siteUrl.origin;
} catch {
    errors.push('SITE_URL must be an absolute http:// or https:// URL');
}

if (errors.length) {
    throw new Error(`Invalid configuration:\n  - ${errors.join('\n  - ')}`);
}

module.exports = Object.freeze(config);
