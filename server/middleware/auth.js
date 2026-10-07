const Session = require('../models/session');

const COOKIE_NAME = 'sessionToken';

// Read one cookie value from the request's Cookie header.
function getCookie(req, name) {
    const header = req.headers.cookie || '';
    for (const part of header.split(';')) {
        const [key, ...value] = part.trim().split('=');
        if (key === name) return decodeURIComponent(value.join('='));
    }
    return null;
}

// Runs on every request: if the session cookie is valid, puts the user on req.user.
async function loadUser(req, res, next) {
    req.user = null;
    const token = getCookie(req, COOKIE_NAME);
    if (token) {
        const session = await Session.findOne({ token, expiresAt: { $gt: new Date() } }).populate('user');
        if (session && session.user) req.user = session.user;
    }
    res.locals.user = req.user; // available in every EJS view
    next();
}

/**
 * Route guard: only users with the given role may continue.
 * Guests are sent to the login page, other roles get a 403 page.
 * @param {import('../models/user.js').UserRole} role
 */
function requireRoleHandler(role) {
    return (req, res, next) => {
        if (!req.user) return res.redirect('/login');
        if (req.user.role !== role) {
            console.warn(`Forbidden: ${req.user.email} (${req.user.role}) tried ${req.method} ${req.originalUrl}`);
            return res.status(403).render('auth-error', {
                message: 'אין לך הרשאה לדף הזה',
                details: 'הדף הזה שמור לתפקיד אחר במערכת.',
                retryUrl: '/',
                retryLabel: 'חזרה לדף הבית',
            });
        }
        next();
    };
}

module.exports = { COOKIE_NAME, getCookie, loadUser, requireRoleHandler };
