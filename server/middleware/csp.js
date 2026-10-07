// Content-Security-Policy header: a second layer against XSS.
// The browser only runs scripts that come from our own server, so a script that
// slips into the page text is not executed. This is why pages must not use
// inline <script> blocks or onclick="..." attributes.
const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", // the design uses a few inline styles
    "font-src https://fonts.gstatic.com",
    "img-src * data:", // article images can come from any site
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
].join('; ');

function contentSecurityPolicy(req, res, next) {
    res.setHeader('Content-Security-Policy', policy);
    next();
}

module.exports = { contentSecurityPolicy };
