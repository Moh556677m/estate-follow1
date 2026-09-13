import { useCallback, useEffect, useMemo, useState } from 'react';
import pb from '@/lib/pocketbaseClient';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Per-user sidebar order + default landing page, persisted to the user's
 * PocketBase record (sidebar_order / default_landing JSON fields, keyed by
 * surface scope). Order is stored by item KEY — language-independent — so a
 * language switch never reshuffles the menu.
 *
 * New nav items (added in code after a user already customized their order)
 * are merged safely: they append after the saved keys in their default
 * relative order, never deleting the user's existing arrangement.
 *
 * Optional collapsible groups: pass `groups = { management: childNavItems }`
 * to let the user reorder a group's children WITHIN that group only. The
 * group itself is a single top-level key (draggable as one unit); its
 * children's order is persisted separately under
 * `sidebar_order[scope + '__children']` so no schema migration is needed.
 *
 * @param {object}   opts
 * @param {string}   opts.scope     'owner' | 'broker' | 'company' | 'admin'
 * @param {Array}    opts.navItems  full permission-filtered nav list for this surface
 * @param {object}   [opts.groups]  map of groupKey -> child nav items (collapsible groups)
 */
export default function useSidebarOrder({ scope, navItems, groups = {} }) {
  const { user } = useAuth();

  const defaultKeys = useMemo(() => navItems.map((n) => n.key), [navItems]);
  const allMap = useMemo(
    () => Object.fromEntries(navItems.map((n) => [n.key, n])),
    [navItems],
  );

  // ---- collapsible group children ----
  const groupDefaults = useMemo(() => {
    const m = {};
    Object.entries(groups).forEach(([gk, children]) => {
      m[gk] = children.map((c) => c.key);
    });
    return m;
  }, [groups]);

  const groupChildMaps = useMemo(() => {
    const m = {};
    Object.entries(groups).forEach(([gk, children]) => {
      m[gk] = Object.fromEntries(children.map((c) => [c.key, c]));
    });
    return m;
  }, [groups]);

  const savedOrderRaw = user?.sidebar_order;
  const savedOrder =
    savedOrderRaw && typeof savedOrderRaw === 'object'
      ? savedOrderRaw[scope]
      : null;
  const savedChildrenRaw =
    savedOrderRaw && typeof savedOrderRaw === 'object'
      ? savedOrderRaw[`${scope}__children`]
      : null;
  const savedChildren =
    savedChildrenRaw && typeof savedChildrenRaw === 'object'
      ? savedChildrenRaw
      : {};

  // Merge saved order with any new items appended in default order.
  const orderedKeys = useMemo(() => {
    if (!savedOrder || !Array.isArray(savedOrder) || savedOrder.length === 0) {
      return defaultKeys;
    }
    const valid = savedOrder.filter((k) => allMap[k]);
    const newKeys = defaultKeys.filter((k) => !valid.includes(k));
    return [...valid, ...newKeys];
  }, [savedOrder, defaultKeys, allMap]);

  const orderedItems = useMemo(
    () => orderedKeys.map((k) => allMap[k]).filter(Boolean),
    [orderedKeys, allMap],
  );

  const orderedChildrenKeys = useMemo(() => {
    const m = {};
    Object.keys(groupDefaults).forEach((gk) => {
      const saved = savedChildren[gk];
      const def = groupDefaults[gk];
      const childMap = groupChildMaps[gk] || {};
      if (saved && Array.isArray(saved) && saved.length) {
        const valid = saved.filter((k) => childMap[k]);
        const newKeys = def.filter((k) => !valid.includes(k));
        m[gk] = [...valid, ...newKeys];
      } else {
        m[gk] = def;
      }
    });
    return m;
  }, [savedChildren, groupDefaults, groupChildMaps]);

  const orderedChildren = useMemo(() => {
    const m = {};
    Object.keys(groupDefaults).forEach((gk) => {
      const childMap = groupChildMaps[gk] || {};
      m[gk] = (orderedChildrenKeys[gk] || [])
        .map((k) => childMap[k])
        .filter(Boolean);
    });
    return m;
  }, [orderedChildrenKeys, groupChildMaps, groupDefaults]);

  const [reorderMode, setReorderMode] = useState(false);
  const [localOrder, setLocalOrder] = useState(orderedKeys);
  const [localChildren, setLocalChildren] = useState(orderedChildrenKeys);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    setLocalOrder(orderedKeys);
  }, [orderedKeys]);
  useEffect(() => {
    setLocalChildren(orderedChildrenKeys);
  }, [orderedChildrenKeys]);

  const move = useCallback((key, dir) => {
    setLocalOrder((prev) => {
      const idx = prev.indexOf(key);
      if (idx === -1) return prev;
      const target = dir === 'up' ? idx - 1 : idx + 1;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const tmp = next[idx];
      next[idx] = next[target];
      next[target] = tmp;
      return next;
    });
  }, []);

  const moveToIndex = useCallback((fromIdx, toIdx) => {
    setLocalOrder((prev) => {
      if (
        fromIdx === toIdx ||
        fromIdx < 0 ||
        toIdx < 0 ||
        fromIdx >= prev.length ||
        toIdx >= prev.length
      ) {
        return prev;
      }
      const next = [...prev];
      const [item] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, item);
      return next;
    });
  }, []);

  const moveChild = useCallback((gk, key, dir) => {
    setLocalChildren((prev) => {
      const arr = prev[gk] ? [...prev[gk]] : [];
      const idx = arr.indexOf(key);
      if (idx === -1) return prev;
      const target = dir === 'up' ? idx - 1 : idx + 1;
      if (target < 0 || target >= arr.length) return prev;
      const nextArr = [...arr];
      const tmp = nextArr[idx];
      nextArr[idx] = nextArr[target];
      nextArr[target] = tmp;
      return { ...prev, [gk]: nextArr };
    });
  }, []);

  const moveChildToIndex = useCallback((gk, fromIdx, toIdx) => {
    setLocalChildren((prev) => {
      const arr = prev[gk] ? [...prev[gk]] : [];
      if (
        fromIdx === toIdx ||
        fromIdx < 0 ||
        toIdx < 0 ||
        fromIdx >= arr.length ||
        toIdx >= arr.length
      ) {
        return prev;
      }
      const nextArr = [...arr];
      const [item] = nextArr.splice(fromIdx, 1);
      nextArr.splice(toIdx, 0, item);
      return { ...prev, [gk]: nextArr };
    });
  }, []);

  const refreshAuth = useCallback(async (reqKey) => {
    try {
      await pb.collection('users').authRefresh({ requestKey: reqKey });
    } catch {
      /* keep session */
    }
  }, []);

  const persistOrder = useCallback(
    async (orderToSave, childrenToSave) => {
      if (!user) return false;
      setSaving(true);
      setFeedback('');
      try {
        const current =
          user.sidebar_order && typeof user.sidebar_order === 'object'
            ? user.sidebar_order
            : {};
        const next = { ...current, [scope]: orderToSave };
        if (childrenToSave) {
          next[`${scope}__children`] = childrenToSave;
        }
        await pb.collection('users').update(user.id, { sidebar_order: next }, {
          requestKey: `sidebar-order-${user.id}-${Date.now()}`,
        });
        await refreshAuth(`sidebar-order-refresh-${user.id}-${Date.now()}`);
        setFeedback('saved');
        setTimeout(() => setFeedback(''), 3000);
        return true;
      } catch {
        setFeedback('error');
        setTimeout(() => setFeedback(''), 3000);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [user, scope, refreshAuth],
  );

  const saveOrder = useCallback(async () => {
    const ok = await persistOrder(localOrder, localChildren);
    if (ok) setReorderMode(false);
  }, [localOrder, localChildren, persistOrder]);

  const resetOrder = useCallback(async () => {
    setLocalOrder(defaultKeys);
    setLocalChildren(groupDefaults);
    const ok = await persistOrder(defaultKeys, groupDefaults);
    if (ok) setReorderMode(false);
  }, [defaultKeys, groupDefaults, persistOrder]);

  const cancelReorder = useCallback(() => {
    setLocalOrder(orderedKeys);
    setLocalChildren(orderedChildrenKeys);
    setReorderMode(false);
  }, [orderedKeys, orderedChildrenKeys]);

  const localItems = useMemo(
    () => localOrder.map((k) => allMap[k]).filter(Boolean),
    [localOrder, allMap],
  );

  const localChildrenItems = useMemo(() => {
    const m = {};
    Object.keys(groupDefaults).forEach((gk) => {
      const childMap = groupChildMaps[gk] || {};
      m[gk] = (localChildren[gk] || [])
        .map((k) => childMap[k])
        .filter(Boolean);
    });
    return m;
  }, [localChildren, groupChildMaps, groupDefaults]);

  return {
    orderedItems,
    orderedChildren,
    localItems,
    localChildrenItems,
    reorderMode,
    setReorderMode,
    move,
    moveToIndex,
    moveChild,
    moveChildToIndex,
    saveOrder,
    resetOrder,
    cancelReorder,
    saving,
    feedback,
    defaultKeys,
    groupDefaults,
  };
}
