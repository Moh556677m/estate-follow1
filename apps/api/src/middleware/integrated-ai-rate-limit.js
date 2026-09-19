import rateLimit from 'express-rate-limit';
import { rateLimitHandler } from './rateLimitLogger.js';

export const integratedAiRateLimit = rateLimit({
	windowMs: 60 * 1000,
	max: 10,
	standardHeaders: true,
	legacyHeaders: false,
	validate: { trustProxy: false },
	handler: rateLimitHandler('integratedAiRateLimit', { error: 'Too many AI requests, please try again later' }),
});
