// OneSignal — server-side push sending helper.
//
// The client-side half of this integration (apps/web/src/lib/onesignal.js +
// apps/web/index.html + apps/web/public/OneSignalSDKWorker.js) already works:
// it subscribes devices and links them to the signed-in user's id. That half
// needed no fix.
//
// What did NOT exist anywhere in the project was a way for the SERVER to
// actually trigger a push — there was no code path that ever called
// OneSignal's Notifications API, so no push notification could ever be sent,
// regardless of how many devices were subscribed. This file adds that
// missing capability as a small, reusable helper — it is intentionally NOT
// wired into any specific event (signup, new lead, payment, etc.) here,
// since deciding which product events should trigger a push is a product
// decision, not a bug fix. Call `sendPushToUser(...)` from any route/hook
// once you decide what should notify whom.
//
// ONESIGNAL_REST_API_KEY is a real secret (it can send to your entire
// audience) — it must only ever live in an environment variable on the
// server, never in the frontend bundle or in source control.
import logger from './logger.js';
import { isIntegrationConfigured } from './integrationConfig.js';

const ONESIGNAL_API_URL = 'https://api.onesignal.com/notifications';
// Public app id — safe to keep alongside the frontend's copy in
// apps/web/src/lib/onesignal.js (OneSignal app ids are not secret).
const ONESIGNAL_APP_ID = 'af6c81b2-a757-457f-9d46-50477b7ba31e';

/**
 * Send a push notification to one or more users by their OneSignal external
 * id (the same id passed to OneSignal.login() on the frontend — i.e. the
 * PocketBase user id).
 *
 * Returns { ok: true, id } on success, or { ok: false, reason } when the
 * REST API key is not configured or the request fails. Never throws — a
 * notification failure must never break the action that triggered it.
 */
export async function sendPushToUser(userIds, { title, message, url } = {}) {
    const ids = Array.isArray(userIds) ? userIds.filter(Boolean) : [userIds].filter(Boolean);
    if (!ids.length) return { ok: false, reason: 'no_recipients' };
    if (!message) return { ok: false, reason: 'no_message' };

    if (!isIntegrationConfigured('ONESIGNAL_REST_API_KEY')) {
        logger.warn('OneSignal push skipped: ONESIGNAL_REST_API_KEY is not set.');
        return { ok: false, reason: 'not_configured' };
    }

    const payload = {
        app_id: ONESIGNAL_APP_ID,
        include_aliases: { external_id: ids },
        target_channel: 'push',
        headings: { en: title || 'Estate Follow' },
        contents: { en: message },
        ...(url ? { url } : {}),
    };

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(ONESIGNAL_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Key ${process.env.ONESIGNAL_REST_API_KEY}`,
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });
        clearTimeout(timeout);
        const data = await res.json().catch(() => null);
        if (!res.ok) {
            logger.error('OneSignal push failed', res.status, data);
            return { ok: false, reason: `http_${res.status}` };
        }
        return { ok: true, id: data?.id };
    } catch (err) {
        logger.error('OneSignal push request failed', err?.message || err);
        return { ok: false, reason: 'network_error' };
    }
}

export default { sendPushToUser, ONESIGNAL_APP_ID };
