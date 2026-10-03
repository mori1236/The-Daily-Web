const mongoose = require('mongoose');
const argon2 = require('argon2');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['writer', 'editor'], default: 'writer' },
}, { timestamps: true });

// Hash a plain password and store it (the plain password is never saved).
userSchema.methods.setPassword = async function (password) {
    this.passwordHash = await argon2.hash(password);
};

userSchema.methods.checkPassword = function (password) {
    return argon2.verify(this.passwordHash, password);
};

// Never send the hash to the client.
userSchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret.passwordHash;
        return ret;
    },
});

module.exports = mongoose.model('User', userSchema);
