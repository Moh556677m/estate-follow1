// Google reCAPTCHA v3 — frontend helper.
//
// Used ONLY by the three pre-auth surfaces: login, signup, forgot-password.
// The reCAPTCHA v3 script is loaded lazily on first use (never injected site-
// wide), so it never runs on any other page. Each form requests a token for a
// specific action, then asks the backend (/hcgi/api/recaptcha/verify) to
// verify it with the secret key. The form proceeds only when the backend says
// the token is valid, the action matches, and the score is above the bot
// threshold.
import apiServerClient from '@/lib/apiServerClient';

// Site key is public by design — it is safe in the browser.
export const RECAPTCHA_SITE_KEY = '6Lc85rQtAAAAAkEGfPylZWb5nbz027NRyDVYKOI';

const SCRIPT_ID = 'ef-recaptcha-v3';

let loadPromise = null;

// Lazily inject the reCAPTCHA v3 script (render=SITE_KEY). Cached so repeated
// submits on the same page reuse the same script. Resolves with the
// grecaptcha global; rejects on timeout / load failure.
function loadRecaptcha() {
    if (loadPromise) return loadPromise;
    if (typeof window !== 'undefined' && window.grecaptcha && window.grecaptcha.execute) {
        return Promise.resolve(window.grecaptcha);
    }

    loadPromise = new Promise((resolve, reject) => {
        const existing = document.getElementById(SCRIPT_ID);
        if (existing) {
            // Script tag present but grecaptcha not ready yet — wait for it.
            const wait = () => {
                if (window.grecaptcha && window.grecaptcha.execute) {
                    resolve(window.grecaptcha);
                } else {
                    setTimeout(wait, 120);
                }
            };
            wait();
            return;
        }

        const script = document.createElement('script');
        script.id = SCRIPT_ID;
        script.src = `https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`;
        script.async = true;
        script.defer = true;

        const timeoutId = setTimeout(() => {
            reject(new Error('recaptcha_load_timeout'));
        }, 12000);

        script.onload = () => {
            clearTimeout(timeoutId);
            const wait = () => {
                if (window.grecaptcha && window.grecaptcha.execute) {
                    resolve(window.grecaptcha);
                } else {
                    setTimeout(wait, 120);
                }
            };
            wait();
        };
        script.onerror = () => {
            clearTimeout(timeoutId);
            loadPromise = null;
            reject(new Error('recaptcha_load_failed'));
        };

        document.head.appendChild(script);
    });

    return loadPromise;
}

// Request a reCAPTCHA v3 token for the given action (e.g. 'login').
//
// grecaptcha.execute() is assumed elsewhere (see the fail-open comment
// below) to always either resolve or reject — but for a domain Google's
// reCAPTCHA admin console doesn't recognize (a staging/preview domain, a
// CI sandbox, a fresh custom domain not added yet), it can also just never
// settle at all, with no error and no timeout of its own. Without a race
// against a timeout here, that hangs the ENTIRE login/signup/forgot-
// password submit forever — the exact opposite of this module's whole
// fail-open purpose. loadRecaptcha() above already guards the script-load
// phase (12s); this guards the execute() call itself the same way.
const EXECUTE_TIMEOUT_MS = 8000;

async function getToken(action) {
    const grecaptcha = await loadRecaptcha();
    return Promise.race([
        grecaptcha.execute(RECAPTCHA_SITE_KEY, { action }),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('recaptcha_execute_timeout')), EXECUTE_TIMEOUT_MS),
        ),
    ]);
}

/**
 * Run reCAPTCHA v3 verification for a form action.
 *
 * FAIL-OPEN POLICY (important):
 * reCAPTCHA v3 is a risk *scorer*, not a hard gate. A real human must NEVER be
 * locked out of login / signup / password-reset because reCAPTCHA's own
 * infrastructure is unavailable — and there are many ways it can be: the
 * google.com script blocked by an ad blocker or corporate firewall, the CDN
 * timing out, the API backend down, or (the most common cause of "every login
 * is rejected") the site domain not yet registered in the reCAPTCHA admin
 * console, which makes grecaptcha.execute() throw.
 *
 * So we BLOCK only on an explicit bot signal returned in a verified 200
 * response — a low score, or an action mismatch (a token minted for one form
 * replayed against another). Everything else — script load failure, network
 * error, backend 5xx, Google unreachable, verification_failed (domain not
 * registered / expired / duplicate token) — fails OPEN: the form proceeds,
 * and the bot protection engages automatically once reCAPTCHA is reachable
 * and the domain is registered.
 *
 * @param {string} action — one of: 'login' | 'signup' | 'forgot_password'
 * @returns {Promise<{ok: boolean, score?: number, reason?: string}>}
 *   ok=true  → safe to proceed with the form submission.
 *   ok=false → explicit bot signal; block the form and surface a message.
 */
async function runVerification(action) {
    // 1. Mint a token. If the script can't load or execute (ad blocker,
    //    network, domain not registered in the reCAPTCHA admin), fail OPEN.
    let token = null;
    try {
        token = await getToken(action);
    } catch {
        return { ok: true, score: null, reason: 'script_unavailable' };
    }
    if (!token) {
        return { ok: true, score: null, reason: 'no_token' };
    }

    // 2. Ask the backend to verify the token with Google's siteverify.
    let res;
    try {
        res = await apiServerClient.fetch('/recaptcha/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, action }),
        });
    } catch {
        // Network error reaching the backend — fail open.
        return { ok: true, score: null, reason: 'backend_unreachable' };
    }

    // 503 INTEGRATION_NOT_CONFIGURED — backend secret not set yet. Fail open.
    if (res.status === 503) {
        return { ok: true, score: null, reason: 'not_configured' };
    }

    // Any other non-OK response (502 Google outage, 422 bad request, 500).
    // Fail open — only a verified 200 body with a low score blocks (below).
    if (!res.ok) {
        return { ok: true, score: null, reason: 'backend_error' };
    }

    let data;
    try {
        data = await res.json();
    } catch {
        return { ok: true, score: null, reason: 'bad_response' };
    }

    // 3. Google verified the token. Allow unless the score is low or the
    //    action was replayed from a different form — those are the only
    //    explicit bot signals, and the only cases that block a real user.
    if (data && data.success === true) {
        return { ok: true, score: data.score, reason: data.reason || 'ok' };
    }

    const reason = data?.reason || 'verification_failed';
    if (reason === 'low_score' || reason === 'action_mismatch') {
        return { ok: false, score: data?.score ?? null, reason };
    }

    // verification_failed — Google could not verify the token (domain not
    // registered, expired/duplicate token, invalid key). Configuration or
    // transient issue, not a bot signal. Fail open.
    return { ok: true, score: data?.score ?? null, reason };
}

// Absolute outer deadline for the whole flow (script load + execute() +
// backend verify), on top of every individual timeout already inside
// runVerification(). This is deliberately redundant: a live CI run proved
// that even with the internal getToken()/loadRecaptcha() timeouts in place,
// the observed hang was still real — some stage of this chain can outlast
// its own supposed timeout in a specific network environment (e.g. Google's
// reCAPTCHA backend behaving differently for a data-center/CI IP range than
// a residential one). Rather than keep chasing the exact internal stage,
// this guarantees the one contract that actually matters: verifyRecaptcha()
// NEVER makes a caller wait more than this long, full stop — a real human
// must never be stuck on a spinner because of this module, for any reason.
const ABSOLUTE_TIMEOUT_MS = 10000;

export async function verifyRecaptcha(action) {
    try {
        return await Promise.race([
            runVerification(action),
            new Promise((resolve) =>
                setTimeout(() => resolve({ ok: true, score: null, reason: 'verification_timeout' }), ABSOLUTE_TIMEOUT_MS),
            ),
        ]);
    } catch {
        // Belt-and-suspenders — runVerification() already catches everything
        // it knows how to, but this function must never throw regardless.
        return { ok: true, score: null, reason: 'unexpected_error' };
    }
}

export default verifyRecaptcha;
