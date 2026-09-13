import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// apps/api/src/middleware -> apps/web/dist
const webIndexPath = path.resolve(__dirname, '../../../web/dist/index.html');

export const globalRateLimit = rateLimit({
	windowMs: 5 * 60 * 1000,
	max: 100,
	standardHeaders: true,
	legacyHeaders: false,
	validate: { trustProxy: false },
	// This is mounted before EVERYTHING else in main.js — including
	// express.static() and the SPA index.html fallback — so once the limit
	// is hit, express-rate-limit's own response is genuinely the first and
	// only thing any request gets back. Its default behavior (a bare JSON
	// body) is correct for a real API/XHR call, but a plain browser page
	// navigation (e.g. opening or refreshing /dashboard/ai) has the same
	// Accept: text/html as every other page request, and one hitting the
	// limit at exactly this middleware used to render as a blank white page
	// with literal `{"error":"..."}` text — the app never even got a chance
	// to load. Mirror the exact same html-vs-json decision the real SPA
	// fallback further down in main.js already makes (req.accepts('html')),
	// so a rate-limited page load still gets the SPA shell (still with a
	// real 429 status, so it's never mistaken for a successful response) —
	// React Router then renders the page normally, and the app's own
	// subsequent API calls still receive the normal JSON 429 body, handled
	// by its existing error/toast UI instead of a raw browser render.
	handler: (req, res) => {
		if (req.method === 'GET' && req.accepts('html')) {
			res.status(429).sendFile(webIndexPath, (err) => {
				if (err && !res.headersSent) {
					res.status(429).json({ error: 'Too many requests, please try again later' });
				}
			});
			return;
		}
		res.status(429).json({ error: 'Too many requests, please try again later' });
	},
});
