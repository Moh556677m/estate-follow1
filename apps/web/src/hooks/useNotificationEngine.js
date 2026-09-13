// useNotificationEngine — runs the client-side notification reconciliation:
// loads the owner's settings + global config + templates + sounds, computes
// notifications from real property/payment data, creates missing ones
// idempotently, fires push + sound, handles inactivity, and cancels stale
// reminders when payments are paid or dates change.
//
// Runs while the owner is signed in. No server scheduler required.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import pb from '@/lib/pocketbaseClient';
import {
  loadSettings,
  loadConfig,
  loadSounds,
  touchLastActive,
  reconcileNotifications,
  presentNewNotifications,
  maybeInactivityNotification,
  pushPermission,
  dataSignature,
} from '@/lib/notifications';

export default function useNotificationEngine({ properties, payments, ready }) {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const [settings, setSettings] = useState(null);
  const [config, setConfig] = useState(null);
  const [sounds, setSounds] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [engineBusy, setEngineBusy] = useState(false);

  const settingsRef = useRef(null);
  settingsRef.current = settings;
  const dataRef = useRef({ properties, payments, ready });
  dataRef.current = { properties, payments, ready };

  // Load settings / config / sounds / templates once per user.
  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    (async () => {
      const [s, c, snd, tpl] = await Promise.all([
        loadSettings(user.id),
        loadConfig().catch(() => null),
        loadSounds(),
        pb
          .collection('notification_templates')
          .getFullList()
          .catch(() => []),
      ]);
      if (cancelled) return;
      setSettings(s);
      setConfig(c);
      setSounds(snd);
      setTemplates(tpl);
      // Stamp last active on load.
      const stamped = await touchLastActive(user.id, s);
      if (!cancelled) setSettings(stamped);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Keep push_permission in sync with the browser.
  useEffect(() => {
    if (!settings || !user) return;
    const perm = pushPermission();
    if (perm !== settings.push_permission) {
      setSettings((prev) => ({ ...prev, push_permission: perm }));
    }
  }, [user, settings?.id]);

  // Reconcile whenever data or settings change (debounced).
  const runEngine = useCallback(async () => {
    const s = settingsRef.current;
    const { properties: props, payments: pays, ready: rdy } = dataRef.current;
    if (!user || !s || !rdy) return;
    setEngineBusy(true);
    try {
      const created = await reconcileNotifications({
        properties: props,
        payments: pays,
        settings: s,
        config,
        templates,
        lang,
        userId: user.id,
      });
      if (created.length > 0) {
        await presentNewNotifications({
          notifications: created,
          settings: s,
          sounds,
          lang,
          config,
        });
      }
      // Inactivity check.
      const inact = await maybeInactivityNotification({
        settings: s,
        config,
        templates,
        lang,
        userId: user.id,
      });
      if (inact) {
        await presentNewNotifications({
          notifications: [inact],
          settings: s,
          sounds,
          lang,
          config,
        });
      }
    } catch {
      /* ignore engine errors — never break the dashboard */
    } finally {
      setEngineBusy(false);
    }
  }, [user, config, templates, sounds, lang]);

  // Reconcile whenever data or settings change (debounced).
  // A content signature guards the expensive reconcile: the engine only
  // re-runs (which does a getFullList on `notifications` + creates) when the
  // due-relevant slice of properties/payments actually changes — not on every
  // dashboard reload that just produces a new array reference with identical
  // data. This removes the cascade of redundant notification refetches that
  // fired after every realtime-driven dashboard refresh.
  const lastSigRef = useRef('');
  useEffect(() => {
    if (!settings || !ready) return undefined;
    const sig = dataSignature({ properties, payments, settings });
    if (sig === lastSigRef.current) return undefined;
    const id = setTimeout(() => {
      lastSigRef.current = sig;
      runEngine();
    }, 600);
    return () => clearTimeout(id);
  }, [settings, ready, properties, payments, runEngine]);

  // Periodic re-stamp of last active (heartbeat) while the owner is on the app.
  useEffect(() => {
    if (!user || !settings?.id) return undefined;
    const id = setInterval(() => {
      touchLastActive(user.id, settingsRef.current).catch(() => {});
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [user, settings?.id]);

  return { settings, setSettings, config, setConfig, sounds, templates, engineBusy, runEngine };
}
