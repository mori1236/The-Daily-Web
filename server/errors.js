// Thrown by the Article model when an action is not allowed.
// `details` says what went wrong so controllers can pick the right HTTP status and message:
//   reason 'forbidden'     -> 403 (wrong role, or not the owner of the article)
//   reason 'invalid-state' -> 409 (the transition is not allowed from the current state)
//   reason 'invalid-input' -> 400 (missing or bad data, e.g. an empty reject note)
const TRANSITION_ERROR_REASONS = /** @type {const} */ (['forbidden', 'invalid-state', 'invalid-input']);

/** @typedef {(typeof TRANSITION_ERROR_REASONS)[number]} TransitionErrorReason */

class ArticleTransitionError extends Error {
    /**
     * @param {string} message
     * @param {{ reason: TransitionErrorReason, [key: string]: any }} details
     */
    constructor(message, details) {
        super(message);
        this.name = 'ArticleTransitionError';
        this.reason = details.reason;
        this.details = details;
    }
}

module.exports = { ArticleTransitionError, TRANSITION_ERROR_REASONS };
