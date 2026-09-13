// Google reCAPTCHA v3 server-side verification.
//
// Used by the three pre-auth surfaces only: login, signup, forgot-password.
// The frontend (apps/web/src/lib/recaptcha.js) loads the reCAPTCHA v3 script
// on those pages, runs grecaptcha.execute() with an action name, and posts
// the resulting token here. We verify the token + action against Google's
// siteverify endpoint using the RECAPTCHA_SECRET_KEY env var (never shipped
// to the browser) and return the score. The frontend blocks the form when
// verification fails or the score is below the bot threshold.
//
// No auth middleware — these endpoints are hit before the user is signed in.
import { Router } from 'express';
import {
    isIntegrationConfigured,
    respondNotConfigured,
} from '../utils/integrationConfig.js';

const router = Router();

// reCAPTCHA v3 scores range 0.0 (bot) to 1.0 (human). 0.5 is the standard
// threshold recommended by Google for the login/signup/reset flows.
const MIN_SCORE = 0.5;

// Allowed action names — the action sent to grecaptcha.execute() must match
// the action Google returns from siteverify, and must be one we issue. This
// prevents a token minted for one action being replayed against another.
const ALLOWED_ACTIONS = new Set(['login', 'signup', 'forgot_password']);

router.post('/verify', async (req, res) => {
    const token = String(req.body?.token ?? '').trim();
    const action = String(req.body?.action ?? '').trim();

    // Input validation — a 4xx is correct here.
    if (!token) {
        return res.status(422).json({ error: 'token is required' });
    }
    if (!action || !ALLOWED_ACTIONS.has(action)) {
        return res.status(422).json({ error: 'invalid action' });
    }

    // RECAPTCHA_SECRET_KEY is a user-supplied secret. If it is not set yet,
    // report the setup state — do NOT throw (that would 500 on every login).
    if (!isIntegrationConfigured('RECAPTCHA_SECRET_KEY')) {
        return respondNotConfigured(res, {
            integration: 'reCAPTCHA',
            envKeys: 'RECAPTCHA_SECRET_KEY',
        });
    }

    const secret = process.env.RECAPTCHA_SECRET_KEY;
    const params = new URLSearchParams({ secret, response: token });

    // Timeout the Google call so a slow / unreachable siteverify never hangs
    // the login flow. siteverify normally responds in well under 1s; 5s is a
    // generous ceiling. On timeout or network failure we return 502 so the
    // frontend can fail OPEN (a human can still log in; protection re-engages
    // once Google is reachable again). Never surface the secret.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    let upstream;
    try {
        upstream = await fetch('https://www.google.com/recaptcha/api/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString(),
            signal: controller.signal,
        });
    } catch {
        clearTimeout(timeout);
        return res.status(502).json({
            success: false,
            reason: 'google_unreachable',
            errorCodes: [],
        });
    }
    clearTimeout(timeout);

    if (!upstream.ok) {
        // Google returned a non-200 (rare). Fail open with a clear reason
        // rather than throwing to errorMiddleware as an unhandled 500.
        return res.status(502).json({
            success: false,
            reason: 'google_error',
            errorCodes: [],
        });
    }

    const data = await upstream.json();

    // Google returns { success, score, action, error-codes, ... }.
    const verified = !!data.success;
    const score = typeof data.score === 'number' ? data.score : 0;
    const actionMatch = String(data.action ?? '') === action;
    const passed = verified && actionMatch && score >= MIN_SCORE;

    return res.json({
        success: passed,
        score,
        action: data.action ?? action,
        // Surface Google's verdict + any error codes for client messaging /
        // debugging. Never surface the secret.
        reason: !verified
            ? 'verification_failed'
            : !actionMatch
              ? 'action_mismatch'
              : score < MIN_SCORE
                ? 'low_score'
                : 'ok',
        errorCodes: Array.isArray(data['error-codes']) ? data['error-codes'] : [],
    });
});

export default router;
