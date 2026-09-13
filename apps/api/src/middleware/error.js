import logger from '../utils/logger.js';
import { NodeEnv } from '../constants/common.js';
import { logSiteIssue } from '../routes/site-issues.js';

const errorMiddleware = (err, req, res, next) => {
	logger.error(err.message, err.stack);

	// Task #23 — Site Issues: every unhandled API error is also recorded so
	// it shows up in the admin's Site Issues panel, not just the server log.
	// Fire-and-forget and never awaited — logging must never delay or affect
	// the actual error response below, and a failure here is swallowed
	// inside logSiteIssue itself (see its own try/catch).
	logSiteIssue({
		source: 'api_error',
		severity: 'critical',
		title: `${req.method} ${req.originalUrl || req.url} failed`,
		message: err.message,
		details: { stack: err.stack, status: err.status || 500 },
		context: { url: req.originalUrl || req.url, method: req.method },
	});

	if (res.headersSent) {
		return next(err);
	}

	res.status(500).json({
		message: 'Something went wrong!',
		...(process.env.NODE_ENV !== NodeEnv.Production && {
			error: {
				name: err.name,
				message: err.message,
				stack: err.stack,
			},
		}),
	});
};

export default errorMiddleware;
export { errorMiddleware };
