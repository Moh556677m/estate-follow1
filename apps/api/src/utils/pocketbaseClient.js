import Pocketbase from 'pocketbase';
import logger from './logger.js';

// Reads POCKETBASE_URL from the environment so this client keeps working if the
// API and PocketBase ever run on separate hosts (Hostinger, Docker, etc). Falls
// back to the previous hardcoded value for backward compatibility with any
// deployment that hasn't set the variable yet.
const POCKETBASE_HOST = process.env.POCKETBASE_URL || 'http://localhost:8090';

// 30 retries x 1s = 30s grace period for PocketBase to come up (it can take a
// few seconds after `server.cjs` spawns it) before the API gives up. If
// PocketBase genuinely isn't there, the real error still surfaces below via
// logger.error() rather than being hidden.
async function waitForHealth({ retries = 30, delayMs = 1000 } = {}) {
    for (let i = 1; i <= retries; i++) {
        try {
            const response = await fetch(`${POCKETBASE_HOST}/api/health`, { method: 'HEAD' });

            if (response.ok) {
                return;
            }
        } catch {
            // PocketBase not reachable yet; retry below
        }

        logger.warn(`PocketBase not ready, retrying (${i}/${retries})...`);

        await new Promise((r) => setTimeout(r, delayMs));
    }

    throw new Error(`PocketBase health check failed after ${retries} retries`);
}

const pocketbaseClient = new Pocketbase(POCKETBASE_HOST);

pocketbaseClient.autoCancellation(false);

let authPromise = null;

pocketbaseClient.beforeSend = async function (url, options) {
    if (url.includes('/api/collections/_superusers/auth-with-password')) {
        return { url, options };
    }

    if (!pocketbaseClient.authStore.isValid && !authPromise) {
        authPromise = pocketbaseClient.collection('_superusers').authWithPassword(
            process.env.PB_SUPERUSER_EMAIL,
            process.env.PB_SUPERUSER_PASSWORD,
        ).finally(() => {
            authPromise = null;
        });
    }

    if (authPromise) {
        await authPromise;
    }

    if (pocketbaseClient.authStore.isValid && pocketbaseClient.authStore.token) {
        options.headers = options.headers || {};
        options.headers['Authorization'] = pocketbaseClient.authStore.token;
    }

    return { url, options };
};

(async () => {
    try {
        await waitForHealth();

        if (!pocketbaseClient.authStore.isValid && !authPromise) {
            authPromise = pocketbaseClient.collection('_superusers').authWithPassword(
                process.env.PB_SUPERUSER_EMAIL,
                process.env.PB_SUPERUSER_PASSWORD,
            ).finally(() => {
                authPromise = null;
            });
        }

        if (authPromise) {
            await authPromise;
        }

        logger.info('PocketBase client initialized successfully');
    } catch (err) {
        // Deliberately NOT calling process.exit() here — this runs
        // asynchronously, well after server.cjs has already started the API
        // listening (see server.cjs's own Step 3 comment for the identical
        // reasoning). A transient PocketBase startup delay or a momentary
        // auth blip would otherwise kill the entire process — API, static
        // site and the PocketBase reverse proxy together — for a condition
        // that resolves itself on the very next request anyway: every call
        // already goes through beforeSend() above, which re-authenticates
        // on demand whenever authStore.isValid is false. Logging here is
        // purely diagnostic; it never turns a fixable hiccup into a full
        // outage.
        logger.error('PocketBase client failed to authenticate at startup (will retry lazily on the next request):', err);
    }
})();

export default pocketbaseClient;
export { pocketbaseClient };
