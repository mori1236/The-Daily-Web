const fs = require('node:fs/promises');
const path = require('node:path');
const { formatWithOptions } = require('node:util');

const logDirectory = path.resolve(__dirname, '../../logs');
const originalError = console.error.bind(console);
let activeHour;
let pendingWrites = Promise.resolve();

// Wrap the existing console methods so all server code keeps using console as usual.
for (const level of ['log', 'info', 'debug', 'warn', 'error']) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
        original(...args);
        const timestamp = new Date().toISOString();
        const hour = timestamp.slice(0, 13).replace('T', '_'); // UTC; safe in Windows filenames
        const message = formatWithOptions({ colors: false }, ...args);
        const line = `${timestamp} [${level.toUpperCase()}] ${message}\n`;

        // Write in order without blocking requests. Append also preserves logs after a restart.
        pendingWrites = pendingWrites.then(async () => {
            const errorsFile = path.join(logDirectory, `${hour}.errors.log`);
            if (activeHour !== hour) {
                await fs.mkdir(logDirectory, { recursive: true });
                await fs.appendFile(errorsFile, '', 'utf8');
                activeHour = hour;
            }
            await fs.appendFile(path.join(logDirectory, `${hour}.vebose.log`), line, 'utf8');
            if (level === 'warn' || level === 'error') {
                await fs.appendFile(errorsFile, line, 'utf8');
            }
        }).catch(error => {
            // Use the original method to avoid recursively logging a file-writing failure.
            originalError('Could not write log file:', error);
        });
    };
}
