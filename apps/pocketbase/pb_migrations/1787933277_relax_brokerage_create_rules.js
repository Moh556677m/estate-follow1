/// <reference path="../pb_data/types.d.ts" />

// Relax the createRule on `brokers` and `brokerage_companies` so a stale or
// missing `account_type` on the auth record no longer blocks profile
// creation with a generic "Failed to create record" 403.
//
// Before: create required @request.auth.account_type = 'broker'/'company'.
// After:  create only requires the authenticated user to own the record
//         (@request.auth.id = @request.body.owner). Super Admin still allowed.
//
// The account_type is still set by finalize-signup and a client-side guard
// before save, so only broker-typed users reach the broker form in practice.
// update/delete rules are unchanged (still owner + super admin scoped).

migrate(
  (app) => {
    const brokers = app.findCollectionByNameOrId('brokers');
    brokers.createRule =
      "@request.auth.is_super_admin = true || (@request.auth.id != '' && @request.auth.id = @request.body.owner)";
    app.save(brokers);

    const companies = app.findCollectionByNameOrId('brokerage_companies');
    companies.createRule =
      "@request.auth.is_super_admin = true || (@request.auth.id != '' && @request.auth.id = @request.body.owner)";
    app.save(companies);
  },
  (app) => {
    // Revert to the previous account_type-gated create rules.
    const brokers = app.findCollectionByNameOrId('brokers');
    brokers.createRule =
      "@request.auth.is_super_admin = true || (@request.auth.id != '' && @request.auth.account_type = 'broker' && @request.auth.id = @request.body.owner)";
    app.save(brokers);

    const companies = app.findCollectionByNameOrId('brokerage_companies');
    companies.createRule =
      "@request.auth.is_super_admin = true || (@request.auth.id != '' && @request.auth.account_type = 'company' && @request.auth.id = @request.body.owner)";
    app.save(companies);
  },
);
