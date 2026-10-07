// Methods that change data. GET/HEAD/OPTIONS are read-only, so they are not checked.
const CHANGING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

// Blocks cross-site requests (CSRF). The session cookie is already sameSite=lax;
// this adds two server-side checks on every request that changes data.
function csrfProtection(req, res, next) {
    if (!CHANGING_METHODS.includes(req.method)) return next();

    // 1. The browser sets Origin on cross-site requests. It must be our own host.
    const origin = req.headers.origin;
    if (origin) {
        let originHost = '';
        try {
            originHost = new URL(origin).host;
        } catch {
            // Not a valid URL (for example the string "null"): originHost stays empty and is rejected below.
        }
        if (originHost !== req.headers.host) {
            return rejectRequest(req, res);
        }
    }

    // 2. API calls must be JSON. A cross-site HTML form cannot send application/json.
    if (req.path.startsWith('/api/') && !req.is('application/json')) {
        return rejectRequest(req, res);
    }

    next();
}

function rejectRequest(req, res) {
    console.warn(`CSRF check failed: ${req.method} ${req.originalUrl} (origin: ${req.headers.origin || 'none'})`);
    res.status(403).json({ error: 'הבקשה נדחתה' });
}

module.exports = { csrfProtection };
