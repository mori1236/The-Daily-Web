function sendErrorPage(req, res, statusCode) {
    const message = statusCode === 404 ? 'הדף לא נמצא' : 'לא ניתן להשלים את הבקשה כרגע';
    res.status(statusCode);
    if (req.path === '/api' || req.path.startsWith('/api/')) {
        return res.json({ error: message });
    }
    // Even an error in a shared EJS partial must not expose a stack trace.
    res.render('error', { statusCode }, (error, html) => {
        if (error) {
            console.error('Error rendering error page:', error);
            return res.type('text').send(`${statusCode} — ${message}`);
        }
        res.send(html);
    });
}

function notFound(req, res) {
    return sendErrorPage(req, res, 404);
}

function errorHandler(error, req, res, next) {
    console.error('Unhandled request error:', error);
    if (res.headersSent) return next(error);
    const status = error.status || error.statusCode;
    const statusCode = Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
    return sendErrorPage(req, res, statusCode);
}

module.exports = { notFound, errorHandler };
