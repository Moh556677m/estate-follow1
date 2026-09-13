/// <reference path="../pb_data/types.d.ts" />

// Feature Management batch — feature #3: Security Deposit Management.
// `tenancies` is a pre-existing, multi-purpose collection (leases, rent
// checks, occupancy) used by features that have nothing to do with
// deposits — so this hook can't gate the WHOLE collection like
// task17-hooks.pb.js does for the single-purpose owner_expenses/owner_tasks
// collections (that would wrongly block an unrelated tenancy edit, e.g.
// ending a lease, when the deposit feature is disabled). Instead it only
// checks when the update actually touches one of the 4 deposit fields this
// batch added — same "un-bypassable even via a raw API call" guarantee,
// scoped to just the fields this feature owns.
onRecordUpdateRequest((e) => {
  const info = e.requestInfo();
  const body = info.body || {};
  const depositFields = ['deposit_status', 'deposit_returned_amount', 'deposit_return_date', 'deposit_deduction_notes'];
  const touchesDeposit = depositFields.some((f) => Object.prototype.hasOwnProperty.call(body, f));
  if (touchesDeposit) {
    const auth = info.auth;
    if (!auth) throw new BadRequestError('unauthorized');
    const { requireFeature } = require(`${__hooks}/lib-feature-gate.js`);
    const gate = requireFeature($app, auth, 'security_deposit_management');
    if (!gate.available) throw new BadRequestError(gate.reason || 'feature_not_available');
  }
  e.next();
}, 'tenancies');
