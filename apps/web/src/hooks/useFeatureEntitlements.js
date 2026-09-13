import { useCallback, useEffect, useMemo, useState } from 'react';
import pb from '@/lib/pocketbaseClient';

// Task #17 — the single hook every "feature-driven" piece of UI (nav,
// dashboard cards, page guards) should use instead of hardcoding a
// condition per page. Wraps GET /ef/my-entitlements (the same route
// SubscriptionPanel/MonthlyReportsPanel already poll) and additionally
// exposes the nav-driving fields (visible/route/icon/sort_order/name)
// added to that response in this task.
//
// Usage:
//   const { features, loading, isAvailable, navFeatures, refetch } = useFeatureEntitlements();
//   if (!isAvailable('net_property_profit')) return <FeatureLockedNotice ... />;
export default function useFeatureEntitlements() {
	const [state, setState] = useState({ loading: true, error: '', data: null });

	const refetch = useCallback(async () => {
		setState((s) => ({ ...s, loading: true, error: '' }));
		try {
			const res = await pb.send('/ef/my-entitlements', { method: 'GET' });
			setState({ loading: false, error: '', data: res });
		} catch (err) {
			setState({ loading: false, error: err?.message || 'failed', data: null });
		}
	}, []);

	useEffect(() => {
		refetch();
	}, [refetch]);

	// Stable across renders unless the underlying entitlements payload
	// actually changed — several callers (nav useMemo deps, panel effects)
	// depend on referential stability here, not just value equality.
	const features = useMemo(() => state.data?.features || {}, [state.data]);

	const isAvailable = useCallback(
		(key) => !!features[key]?.available,
		[features],
	);

	// Sorted list of features that should appear in navigation (visible !==
	// false), regardless of whether they're currently entitled — a locked
	// nav entry still shows (so the owner discovers the feature exists) but
	// routes to an "upgrade" notice instead of the real panel.
	const navFeatures = useMemo(
		() => Object.entries(features)
			.filter(([, f]) => f.visible !== false && f.route)
			.map(([key, f]) => ({ key, ...f }))
			.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
		[features],
	);

	return {
		loading: state.loading,
		error: state.error,
		raw: state.data,
		features,
		isAvailable,
		navFeatures,
		refetch,
	};
}
