// Turns a failed article action into a JSON answer. Used by the writer and the editor controllers.

const { ArticleTransitionError } = require('../errors');

// Which HTTP status each ArticleTransitionError reason becomes (see server/errors.js).
const ERROR_STATUS = { forbidden: 403, 'invalid-state': 409, 'invalid-input': 400 };

// Sends the error of a failed action as JSON. Unexpected errors become a general 500 message.
function sendApiError(res, err, logMessage) {
    if (err instanceof ArticleTransitionError) {
        console.warn(`${logMessage}: ${err.message}`);
        return res.status(ERROR_STATUS[err.reason] || 400).json({ error: err.message, reason: err.reason, missingFields: err.details.missingFields });
    }
    console.error(`${logMessage}:`, err);
    res.status(500).json({ error: 'אירעה שגיאה בשרת' });
}

module.exports = { sendApiError };
