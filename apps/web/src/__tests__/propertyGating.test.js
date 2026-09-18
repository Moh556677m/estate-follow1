import { describe, it, expect } from 'vitest';
import {
  isPackageActive,
  packagePropertyLimit,
  resolvePropertyAccess,
  DEFAULT_SETTINGS,
} from '@/lib/subscriptionUtils';

// Regression guards for the "Add Property" gate (lib/subscriptionUtils.js,
// mirrored server-side by pb_hooks/subscription-enforcement.pb.js). This is
// the exact logic that decides whether the Add Property button/action is
// allowed — it must never false-block a legitimate owner (e.g. a zero/
// missing settings row collapsing the trial limit to 0) and must never
// silently let a genuinely expired/exhausted account keep adding properties.

describe('isPackageActive', () => {
  it('is false for a user with no package', () => {
    expect(isPackageActive({ subscription_package: 'none' }, DEFAULT_SETTINGS)).toBe(false);
    expect(isPackageActive({}, DEFAULT_SETTINGS)).toBe(false);
    expect(isPackageActive(null, DEFAULT_SETTINGS)).toBe(false);
  });

  it('trial is active before trial_end and inactive after it', () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const past = new Date(Date.now() - 86400000).toISOString();
    expect(isPackageActive({ subscription_package: 'trial', trial_end: future }, DEFAULT_SETTINGS)).toBe(true);
    expect(isPackageActive({ subscription_package: 'trial', trial_end: past }, DEFAULT_SETTINGS)).toBe(false);
  });

  it('a paid package with no dates at all (legacy/partial write) is treated as active, never false-blocked', () => {
    expect(isPackageActive({ subscription_package: 'annual' }, DEFAULT_SETTINGS)).toBe(true);
  });

  it('a paid package past its subscription_end is inactive', () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    expect(
      isPackageActive({ subscription_package: 'premium', subscription_end: past }, DEFAULT_SETTINGS),
    ).toBe(false);
  });
});

describe('packagePropertyLimit', () => {
  it('trial always allows at least 1 property, even with a zero/broken settings row', () => {
    expect(packagePropertyLimit('trial', { trial_properties: 0 })).toBeGreaterThanOrEqual(1);
    expect(packagePropertyLimit('trial', {})).toBeGreaterThanOrEqual(1);
    expect(packagePropertyLimit('trial', null)).toBeGreaterThanOrEqual(1);
  });

  it('unlimited package returns -1 (Infinity sentinel)', () => {
    expect(packagePropertyLimit('unlimited', DEFAULT_SETTINGS)).toBe(-1);
  });

  it('no package returns 0', () => {
    expect(packagePropertyLimit('none', DEFAULT_SETTINGS)).toBe(0);
  });
});

describe('resolvePropertyAccess (the actual Add Property gate)', () => {
  it('blocks a user with no package at all', () => {
    const result = resolvePropertyAccess({ subscription_package: 'none' }, DEFAULT_SETTINGS, 0, null);
    expect(result.active).toBe(false);
    expect(result.source).toBe('none');
  });

  it('allows a fresh trial user with zero properties so far', () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const user = { subscription_package: 'trial', trial_end: future };
    const result = resolvePropertyAccess(user, DEFAULT_SETTINGS, 0, null);
    expect(result.active).toBe(true);
    expect(result.source).toBe('subscription');
    expect(result.remaining).toBeGreaterThan(0);
  });

  it('blocks once the trial property limit is reached', () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const user = { subscription_package: 'trial', trial_end: future };
    const limit = packagePropertyLimit('trial', DEFAULT_SETTINGS);
    const result = resolvePropertyAccess(user, DEFAULT_SETTINGS, limit, null);
    expect(result.active).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('distinguishes an expired package (packageActive=false) from a reached limit', () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    const user = { subscription_package: 'trial', trial_end: past };
    const result = resolvePropertyAccess(user, DEFAULT_SETTINGS, 0, null);
    expect(result.active).toBe(false);
    expect(result.packageActive).toBe(false);
  });

  it('Special Access takes priority over an expired/absent subscription while it has remaining slots', () => {
    const user = { subscription_package: 'none' };
    const specialAccess = { active: true, grant_type: 'limited', property_limit: 5 };
    const result = resolvePropertyAccess(user, DEFAULT_SETTINGS, 2, specialAccess);
    expect(result.active).toBe(true);
    expect(result.source).toBe('special');
    expect(result.remaining).toBe(3);
  });

  it('falls through to the subscription check once Special Access is exhausted — never mixes the two systems', () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const user = { subscription_package: 'trial', trial_end: future };
    const specialAccess = { active: true, grant_type: 'limited', property_limit: 2 };
    const result = resolvePropertyAccess(user, DEFAULT_SETTINGS, 2, specialAccess);
    expect(result.source).toBe('subscription');
  });

  it('unlimited Special Access always allows, regardless of current count', () => {
    const user = { subscription_package: 'none' };
    const specialAccess = { active: true, grant_type: 'unlimited' };
    const result = resolvePropertyAccess(user, DEFAULT_SETTINGS, 999, specialAccess);
    expect(result.active).toBe(true);
    expect(result.remaining).toBe(Infinity);
  });
});
