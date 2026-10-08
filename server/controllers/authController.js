const crypto = require('crypto');
const User = require('../models/user');
const Session = require('../models/session');
const { COOKIE_NAME, getCookie } = require('../middleware/auth');

const SESSION_DAYS = 7;

/**
 * 
 * @param {import('../models/user').UserDocument} user 
 * @returns {string}
 */
// Where a user lands after login/register.
function homeFor(user) {
    return user.role === 'writer' ? '/writer' : '/editor';
}

// Create a session in the DB and send its token as a cookie.
async function startSession(res, user, remember) {
    // Random token that can't be guessed; the cookie holds only this token.
    const token = crypto.randomBytes(32).toString('hex');
    const maxAge = SESSION_DAYS * 24 * 60 * 60 * 1000;
    await Session.create({ token, user: user._id, expiresAt: new Date(Date.now() + maxAge) });

    res.cookie(COOKIE_NAME, token, {
        httpOnly: true, // browser JS can't read it
        sameSite: 'lax',
        // Without "remember me" the cookie ends when the browser closes.
        maxAge: remember ? maxAge : undefined,
    });
}

// GET /login
function showLogin(req, res) {
    if (req.user) return res.redirect(homeFor(req.user));
    res.render('login', { error: null });
}

// POST /login
async function login(req, res) {
    try {
        await tryLogin(req, res);
    } catch (err) {
        console.error('Login error:', err);
        res.redirect('/login/error');
    }
}

async function tryLogin(req, res) {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    // Same error for every failure, so the form doesn't reveal which emails exist.
    const user = email && password ? await User.findOne({ email }) : null;
    if (!user || !(await user.checkPassword(password))) {
        console.warn(`Failed login for "${email}"`);
        return res.status(401).render('login', { error: 'דוא״ל או סיסמה שגויים', values: { email } });
    }

    await startSession(res, user, Boolean(req.body.remember));
    console.log(`User logged in: ${user.email} (${user.role})`);
    res.redirect(homeFor(user));
}

// GET /register
function showRegister(req, res) {
    if (req.user) return res.redirect(homeFor(req.user));
    res.render('register', { error: null, values: {} });
}

// POST /register
async function register(req, res) {
    try {
        await tryRegister(req, res);
    } catch (err) {
        console.error('Register error:', err);
        res.redirect('/register/error');
    }
}

async function tryRegister(req, res) {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const confirmPassword = String(req.body.confirmPassword || '');
    const role = User.ROLES.includes(req.body.role) ? req.body.role : 'writer';
    const values = { name, email, role }; // refill the form on error (never the passwords)

    let error = null;
    if (!name || !email || !password) error = 'יש למלא את כל השדות';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) error = 'כתובת דוא״ל לא תקינה';
    else if (password.length < 8) error = 'הסיסמה חייבת להכיל לפחות 8 תווים';
    else if (password !== confirmPassword) error = 'הסיסמאות אינן תואמות';
    else if (await User.exists({ email })) error = 'כתובת הדוא״ל כבר רשומה במערכת';

    if (error) return res.status(400).render('register', { error, values });

    const user = new User({ name, email, role });
    await user.setPassword(password);
    await user.save();
    console.log(`User registered: ${user.email} (${user.role})`);

    await startSession(res, user, false);
    res.redirect(homeFor(user));
}

// GET /login/error and /register/error — a general message, the real error is only in the log.
function showLoginError(req, res) {
    res.status(500).render('auth-error', { message: 'אירעה שגיאה בהתחברות', retryUrl: '/login' });
}

function showRegisterError(req, res) {
    res.status(500).render('auth-error', { message: 'אירעה שגיאה בהרשמה', retryUrl: '/register' });
}

// POST /logout
async function logout(req, res) {
    const token = getCookie(req, COOKIE_NAME);
    if (token) await Session.deleteOne({ token });
    res.clearCookie(COOKIE_NAME);
    res.redirect('/');
}

module.exports = { showLogin, login, showLoginError, showRegister, register, showRegisterError, logout };
