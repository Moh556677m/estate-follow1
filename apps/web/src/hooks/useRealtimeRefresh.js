// useRealtimeRefresh — subscribe to a set of PocketBase collections and
// re-run `load` (debounced) whenever any of them changes (create/update/delete),
// so a panel stays live without a manual page refresh.
//
// This is the shared implementation of the debounced-subscribe pattern already
// used by OwnerDashboard / AdminDashboard. Centralising it lets every admin
// sub-panel and owner section opt into real-time auto-refresh with one line.
//
// - `load` is kept in a ref so a rapidly-changing callback (e.g. one that
//   closes over filter state) never re-subscribes the realtime client.
// - Subscriptions are scoped to the collection list; cleanup unsubscribes all.
// - `enabled` lets callers gate the subscription (e.g. only when a tab is
//   active or a permission is present) without unmounting.
import { useEffect, useRef } from 'react';
import pb from '@/lib/pocketbaseClient';

export default function useRealtimeRefresh(
  load,
  collections,
  { enabled = true, debounceMs = 350, deps = [] } = {},
) {
  const loadRef = useRef(load);
  loadRef.current = load;

  // Stable key for the collection set so the effect only re-subscribes when
  // the actual list of watched collections changes, not on every render.
  const key = Array.isArray(collections) ? collections.filter(Boolean).join(',') : '';

  useEffect(() => {
    if (!enabled || !key) return undefined;
    const cols = key.split(',');
    let timer = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          loadRef.current();
        } catch {
          /* ignore — never break the panel on a refresh error */
        }
      }, debounceMs);
    };
    cols.forEach((c) => {
      void pb.collection(c).subscribe('*', schedule).catch(() => {});
    });
    return () => {
      if (timer) clearTimeout(timer);
      cols.forEach((c) => {
        void pb.collection(c).unsubscribe('*').catch(() => {});
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, debounceMs, key, ...deps]);
}
