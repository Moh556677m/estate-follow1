// OneSignal Web SDK helper — thin wrapper around the global OneSignalDeferred
// queue initialized in index.html. All calls are queued and execute only once
// the v16 SDK (OneSignalSDK.page.js) has finished loading, so they are safe to
// fire at any time, including before the SDK is ready. Every call is wrapped in
// a try/catch so a OneSignal failure can never break auth or the SPA.
//
// The App ID is public and lives in index.html; no secrets are handled here.
//
// Reference: https://documentation.onesignal.com/docs/en/web-sdk-setup

const ONESIGNAL_APP_ID = 'af6c81b2-a757-457f-9d46-50477b7ba31e';

function push(fn) {
    try {
        if (typeof window === 'undefined') return;
        window.OneSignalDeferred = window.OneSignalDeferred || [];
        window.OneSignalDeferred.push(async (OneSignal) => {
            try {
                await fn(OneSignal);
            } catch (err) {
                console.warn('OneSignal call failed', err);
            }
        });
    } catch (err) {
        console.warn('OneSignal queue failed', err);
    }
}

/**
 * Identify the signed-in user to OneSignal so their push subscription is
 * linked to their backend user id across devices/channels. Also tags the
 * user's role for segmentation. Safe to call repeatedly — OneSignal.login
 * is idempotent for the same external id.
 */
export function loginOnesignalUser(user) {
    if (!user?.id) return;
    const externalId = user.id;
    const role = String(user.role || (user.is_super_admin ? 'super-admin' : 'owner'));
    push(async (OneSignal) => {
        await OneSignal.login(externalId);
        await OneSignal.addTags({
            user_role: role,
            account_type: String(user.account_type || 'owner'),
            app_id: ONESIGNAL_APP_ID,
        });
    });
}

/** Remove the OneSignal external-id association on logout. */
export function logoutOnesignalUser() {
    push(async (OneSignal) => {
        await OneSignal.logout();
    });
}

export { ONESIGNAL_APP_ID };
