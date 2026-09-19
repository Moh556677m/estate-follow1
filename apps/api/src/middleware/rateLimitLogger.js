import logger from '../utils/logger.js';

/**
 * Shared, safe logging for every scoped rate limiter in the app (see
 * user-otp.js, site-issues.js, integrated-ai-rate-limit.js). Each limiter
 * passes its own name so a 429 in the logs always says WHICH limiter fired
 * and on WHICH route — the actual diagnosability gap the old single
 * app-wide globalRateLimit had (every 429 looked identical, with no way to
 * tell a login attempt from an asset request from an OTP resend).
 *
 * Logs ONLY: limiter name, method, path, status. NEVER the request body,
 * headers, query string, or IP-derived identity — this must never become a
 * place a password, token, API key, or OTP code could leak into logs.
 */
export function rateLimitHandler(limiterName, responseBody) {
	return (req, res) => {
		logger.warn('rate limit exceeded', {
			limiter: limiterName,
			method: req.method,
			path: req.path,
			status: 429,
		});
		res.status(429).json(responseBody || { error: 'Too many requests, please try again later.' });
	};
}
