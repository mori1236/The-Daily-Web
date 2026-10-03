const mongoose = require('mongoose');

// A login session. Stored in Mongo so users stay logged in after a server restart.
const sessionSchema = new mongoose.Schema({
    token: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Mongo deletes the document automatically once this date passes.
    expiresAt: { type: Date, required: true, expires: 0 },
});

module.exports = mongoose.model('Session', sessionSchema);
