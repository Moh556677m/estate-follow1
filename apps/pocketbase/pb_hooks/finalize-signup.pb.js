/// <reference path="../pb_data/types.d.ts" />

// Finalize signup — server-side password + profile commit.
//
// WHY THIS EXISTS:
// The signup flow creates a placeholder auth record (random password,
// pending_signup = true) so PocketBase can email an OTP code. After the user
// verifies the OTP they are authenticated as that placeholder. The frontend
// then needs to set the REAL password and profile fields. But PocketBase
// rejects password changes via the REST API unless `oldPassword` is supplied
// (and the client never knows the placeholder's random password). That left
// accounts stuck with pending_signup = true and an unknown password — the
// "disappearing accounts" bug.
//
// This route runs INSIDE PocketBase, where record.setPassword() sets the
// hashed password directly with no oldPassword requirement. It is the only
// safe way to finalize a signup without deleting or recreating the account.
//
// Non-destructive: it only updates the authenticated user's own record. It
// never deletes, never recreates, never touches other users, and never drops
// the stable User ID. Existing completed accounts are left untouched.
//
// Each callback is self-contained (PB JSVM isolated scope).

routerAdd(
  'POST',
  '/ef/auth/finalize-signup',
  (e) => {
    const auth = e.auth;
    if (!auth || !auth.id) {
      throw new UnauthorizedError('Authentication required.');
    }

    const body = (e.requestInfo && e.requestInfo() ? e.requestInfo().body : null) || {};
    const name = String(body.name || body['name'] || '').trim();
    const nationality = String(body.nationality || body['nationality'] || '').trim();
    const gender = String(body.gender || body['gender'] || '').trim();
    const phone = String(body.phone || body['phone'] || '').trim();
    const password = String(body.password || body['password'] || '');
    const passwordConfirm = String(body.passwordConfirm || body['passwordConfirm'] || '');
    // Referral attribution — the referrer user id captured from the signup
    // link (?ref=<id>). Persisted on the user record and as a referral row so
    // the count only increments when the referred account is later approved.
    const referredBy = String(body.referred_by || body['referred_by'] || '').trim();

    // Password is OPTIONAL here: a Supabase-bridged account (see
    // apps/api/src/routes/supabase-auth-bridge.js) never logs into
    // PocketBase directly — its PocketBase password is a random throwaway
    // set once at bridge time and never used again, so there is nothing
    // useful to "finalize" here for that case. The legacy PocketBase-OTP
    // signup flow still sends a real password and gets it set as before.
    if (password || passwordConfirm) {
      if (!password || password.length < 10) {
        throw new BadRequestError('Password must be at least 10 characters.');
      }
      if (password !== passwordConfirm) {
        throw new BadRequestError('Passwords do not match.');
      }
    }
    if (gender && gender !== 'male' && gender !== 'female') {
      throw new BadRequestError('Invalid gender value.');
    }

    // Load the fresh DB record for the authenticated user. Never recreate it —
    // the stable User ID must survive every signup/deploy/refresh cycle.
    let rec = null;
    try {
      rec = $app.findRecordById('users', auth.id);
    } catch (_) {
      rec = null;
    }
    if (!rec) {
      throw new BadRequestError('Account not found. Please restart the registration.');
    }

    // Set the real password server-side (no oldPassword needed here) — only
    // when one was actually provided (see comment above).
    if (password) {
      rec.setPassword(password);
    }

    // Commit profile fields. Only overwrite what was provided.
    if (name) rec.set('name', name);
    if (nationality) rec.set('nationality', nationality);
    if (gender) rec.set('gender', gender);
    if (phone) rec.set('phone', phone);

    // Account type: owner | broker | company (default owner)
    const accountTypeRaw = String(body.account_type || body['account_type'] || 'owner')
      .trim()
      .toLowerCase();
    const accountType =
      accountTypeRaw === 'broker' || accountTypeRaw === 'company' ? accountTypeRaw : 'owner';
    try {
      rec.set('account_type', accountType);
    } catch (_) {}
    // Owners must complete & verify their account before full access; their
    // account starts "incomplete" and moves to "pending_review" only after they
    // submit verification, then "approved" after Super Admin review. Brokers and
    // companies keep their existing profile-approval flow (account_state active,
    // profile_complete false until their public profile is approved).
    try {
      rec.set('profile_complete', false);
    } catch (_) {}
    // role stays owner for property ACL; account_type drives product surface.
    try {
      if (!rec.getBool('is_super_admin')) {
        rec.set('role', 'owner');
      }
    } catch (_) {}

    // Clear the pending flag so the account is permanently usable.
    rec.set('pending_signup', false);

    // ---- Auto-assign the free trial (Free Plan) on account finalization ----
    // The auto-start trial hook in subscription-enforcement.pb.js uses
    // onRecordCreateRequest, which only fires for REST API creates. The signup
    // placeholder is created programmatically (e.app.save) inside the OTP hook,
    // so that hook never runs and the placeholder is left with
    // subscription_package = "" (none). Without a package, isPackageActive()
    // returns false and the owner sees "subscription inactive" and cannot add
    // any property — even though a free trial is supposed to be the default.
    //
    // Fix: assign the trial here, at the moment the account becomes real. Only
    // assign when the user has no package yet (never overwrite an existing
    // paid/assigned package). The trial gives trial_properties free properties
    // (default 3, always >= 1) for trial_days (default 10). When trial is
    // disabled in settings, fall back to a permanent 1-property free allowance
    // so a brand-new owner can always add at least one property.
    var currentPkg = String(rec.get('subscription_package') || '').trim().toLowerCase();
    var efFsTrialPlan = null;
    var efFsTrialEndForSub = null;
    if (currentPkg === '' || currentPkg === 'none') {
      // `plans` (Dynamic, Admin-editable) is the real source of truth for
      // trial length now — replaces the old `subscription_settings`
      // singleton (see 1789400000_create_plans_and_entitlements.js).
      try {
        var efFsRows = $app.findRecordsByFilter('plans', "key = 'trial'", '', 1, 0);
        if (efFsRows && efFsRows.length > 0) efFsTrialPlan = efFsRows[0];
      } catch (_) {
        efFsTrialPlan = null;
      }

      var trialOn = true;
      var trialDays = 10;
      var trialUnit = 'days';
      if (efFsTrialPlan) {
        trialOn = efFsTrialPlan.get('active') !== false;
        try { trialDays = Math.max(1, Number(efFsTrialPlan.get('trial_value')) || 10); } catch (_) {}
        try { trialUnit = String(efFsTrialPlan.get('trial_unit') || 'days'); } catch (_) {}
      }

      var fsNow = new Date();
      if (trialOn) {
        var fsEnd = new Date(fsNow.getTime());
        if (trialUnit === 'years') {
          fsEnd.setFullYear(fsEnd.getFullYear() + trialDays);
        } else if (trialUnit === 'months') {
          fsEnd.setMonth(fsEnd.getMonth() + trialDays);
        } else if (trialUnit === 'weeks') {
          fsEnd.setTime(fsEnd.getTime() + trialDays * 7 * 24 * 60 * 60 * 1000);
        } else {
          fsEnd.setTime(fsEnd.getTime() + trialDays * 24 * 60 * 60 * 1000);
        }
        try { rec.set('subscription_package', 'trial'); } catch (_) {}
        try { rec.set('trial_start', fsNow.toISOString()); } catch (_) {}
        try { rec.set('trial_end', fsEnd.toISOString()); } catch (_) {}
        try { rec.set('extra_properties_purchased', 0); } catch (_) {}
        efFsTrialEndForSub = fsEnd.toISOString();
      } else {
        // Trial disabled — grant a permanent free allowance (no trial_end) so a
        // new owner is never fully blocked. isPackageActive treats a trial with
        // no trial_end as active.
        try { rec.set('subscription_package', 'trial'); } catch (_) {}
        try { rec.set('trial_start', fsNow.toISOString()); } catch (_) {}
        try { rec.set('extra_properties_purchased', 0); } catch (_) {}
        efFsTrialEndForSub = null;
      }
    }

    // Ensure the account is not suspended. Owners start incomplete; brokers and
    // companies start active (their restriction is profile_complete, handled by
    // the brokerage profile approval flow).
    try {
      if (accountType === 'owner') {
        rec.set('account_state', 'incomplete');
      } else {
        rec.set('account_state', 'active');
      }
    } catch (_) {}
    try {
      rec.set('suspended', false);
    } catch (_) {}

    // Email is proven by the signup OTP; mirror it into `verified` so the
    // Complete & Verify page can show Email Verified = true immediately.
    try {
      rec.set('verified', true);
    } catch (_) {}

    // Persist referral attribution on the user record. `referred_by` is a
    // relation field to another `users` record — rec.set() doesn't validate
    // immediately, so a bad/unknown id here (e.g. a typo, or a stray value
    // sent by something other than the real referral flow) would otherwise
    // only surface as an uncaught save() failure below. Confirm the target
    // actually exists first and skip silently if not, rather than failing
    // the whole signup over an optional attribution field.
    if (referredBy) {
      try {
        $app.findRecordById('users', referredBy);
        rec.set('referred_by', referredBy);
      } catch (_) {
        // Unknown/invalid referrer id — not fatal, just skip the attribution.
      }
    }

    try {
      $app.save(rec);
    } catch (saveErr) {
      $app.logger().error('finalize-signup save failed', 'err', String(saveErr));
      throw new BadRequestError(
        'Could not complete the signup. Please check your details and try again.',
      );
    }

    // Dual-write the real per-user Subscription record (requirement #4) —
    // same trial decision as above, mirrored into user_subscriptions so it
    // has a real row from the moment the account exists, never a second
    // divergent source of truth.
    if (currentPkg === '' || currentPkg === 'none') {
      try {
        const subCol = $app.findCollectionByNameOrId('user_subscriptions');
        const subRows = $app.findRecordsByFilter('user_subscriptions', 'user = {:uid}', '', 1, 0, { uid: rec.id });
        const subRec = subRows && subRows.length > 0 ? subRows[0] : new Record(subCol);
        subRec.set('user', rec.id);
        if (efFsTrialPlan) subRec.set('plan', efFsTrialPlan.id);
        subRec.set('status', 'trial');
        subRec.set('trial_start', rec.get('trial_start') || new Date().toISOString());
        subRec.set('trial_end', efFsTrialEndForSub || null);
        subRec.set('extra_properties_purchased', 0);
        $app.save(subRec);
      } catch (_) {}
    }

    // Create the referral row (status pending). The count only increments when
    // the referred account is later approved by Super Admin — never on click,
    // registration, or pending review.
    if (referredBy) {
      try {
        const refCol = $app.findCollectionByNameOrId('referrals');
        const existing = $app.findRecordsByFilter(
          'referrals',
          'referred_user = {:uid}',
          '',
          1,
          0,
          { uid: rec.id },
        );
        if (!existing.length) {
          const rrow = new Record(refCol);
          rrow.set('referrer', referredBy);
          rrow.set('referred_user', rec.id);
          rrow.set('referred_email', rec.getString('email'));
          rrow.set('status', 'pending');
          rrow.set('account_type', accountType);
          rrow.set('country', nationality);
          $app.save(rrow);
        }
      } catch (err) {
        $app.logger().error('referral row create failed', 'err', String(err));
      }
    }

    return e.json(200, { ok: true, id: rec.id });
  },
  $apis.requireAuth('users'),
);
