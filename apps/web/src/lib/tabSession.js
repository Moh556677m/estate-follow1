// Tab-scoped authentication for Estate Follow.
//
// Problem
// -------
// PocketBase SDK's `LocalAuthStore` (and the read-only integrated-AI client)
// persist the auth token under the localStorage key `pocketbase_auth`.
// localStorage is shared across every tab of the same browser, and the SDK
// binds a `storage` event listener so that a login in tab B overwrites the
// session of tab A. That makes it impossible to keep several accounts
// (Super Admin, Owner, Broker, Company, Staff) open at the same time on the
// same browser — exactly the conflict the user is reporting.
//
// Fix
// ---
// Transparently redirect the single shared key `pocketbase_auth` on
// `localStorage` to `sessionStorage`. sessionStorage is isolated per tab and
// survives a refresh within the same tab, so:
//   - each tab keeps its own independent auth token (no cross-tab overwrite),
//   - refreshing a tab restores that tab's session,
//   - logging out in one tab never logs out the others,
//   - opening the same account in multiple tabs works without conflict.
//
// Only the `pocketbase_auth` key is redirected. Every other localStorage key
// (device id, theme, language, preferences, ...) keeps its normal shared
// behaviour. sessionStorage writes do NOT fire `storage` events, so the SDK's
// cross-tab sync listener becomes a harmless no-op — which is exactly what we
// want: tabs are fully independent.
//
// This module must be imported as the very first import in the app entry
// (main.jsx), before anything reads or writes the auth token.

const REDIRECT_KEY = 'pocketbase_auth';
const TAB_STORE_KEY = 'ef_tab_auth';

function install() {
  if (typeof window === 'undefined' || typeof Storage === 'undefined') return;
  if (window.__EF_TAB_SESSION_PATCHED__) return;
  window.__EF_TAB_SESSION_PATCHED__ = true;

  const proto = Storage.prototype;
  const origGetItem = proto.getItem;
  const origSetItem = proto.setItem;
  const origRemoveItem = proto.removeItem;

  // One-time upgrade migration: if this tab has no tab-scoped session yet but
  // the old shared localStorage key still holds a token (from before this fix),
  // adopt it into this tab's sessionStorage so an already-logged-in tab does
  // not get logged out on the first refresh after the upgrade. New tabs and
  // fresh logins are unaffected. Uses the original methods to bypass the patch
  // we are about to install.
  try {
    const existingTab = origGetItem.call(window.sessionStorage, TAB_STORE_KEY);
    if (!existingTab) {
      const legacy = origGetItem.call(window.localStorage, REDIRECT_KEY);
      if (legacy) {
        origSetItem.call(window.sessionStorage, TAB_STORE_KEY, legacy);
      }
    }
  } catch {
    /* ignore migration errors */
  }

  const isLocalStorage = (instance) => {
    try {
      return instance === window.localStorage;
    } catch {
      return false;
    }
  };

  const patchedGetItem = function getItem(key) {
    if (key === REDIRECT_KEY && isLocalStorage(this)) {
      try {
        // Read from this tab's sessionStorage. Calls the patched getter again
        // with a different key, so it falls through to the original — no loop.
        return origGetItem.call(window.sessionStorage, TAB_STORE_KEY);
      } catch {
        return null;
      }
    }
    return origGetItem.call(this, key);
  };

  const patchedSetItem = function setItem(key, value) {
    if (key === REDIRECT_KEY && isLocalStorage(this)) {
      try {
        origSetItem.call(window.sessionStorage, TAB_STORE_KEY, String(value));
      } catch {
        /* private mode / quota — ignore */
      }
      return;
    }
    return origSetItem.call(this, key, value);
  };

  const patchedRemoveItem = function removeItem(key) {
    if (key === REDIRECT_KEY && isLocalStorage(this)) {
      try {
        origRemoveItem.call(window.sessionStorage, TAB_STORE_KEY);
      } catch {
        /* ignore */
      }
      return;
    }
    return origRemoveItem.call(this, key);
  };

  const define = (name, fn) => {
    try {
      Object.defineProperty(proto, name, {
        value: fn,
        writable: true,
        configurable: true,
      });
    } catch {
      try {
        proto[name] = fn;
      } catch {
        /* cannot patch — give up silently */
      }
    }
  };

  define('getItem', patchedGetItem);
  define('setItem', patchedSetItem);
  define('removeItem', patchedRemoveItem);
}

install();

export default {};
export { REDIRECT_KEY, TAB_STORE_KEY };
