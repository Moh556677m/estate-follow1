/// <reference path="../pb_data/types.d.ts" />

// Modular Broker System — Phase 1: Broker Account Type
//
// Extends the existing `brokers` collection with the account-tracking fields
// required by the modular broker system (last_login, public_visibility,
// profile_completion) and expands the status enum to include `inactive` and
// `suspended`. Existing status values are preserved so current features keep
// working. Backend access rules are tightened so authorization is enforced
// server-side, not just in the frontend.
//
// Non-destructive: only adds fields / values / rules. Never drops data.

migrate(
  (app) => {
    const brokers = app.findCollectionByNameOrId('brokers');
    const users = app.findCollectionByNameOrId('users');

    const addField = (field) => {
      try {
        if (!brokers.fields.getByName(field.name)) {
          brokers.fields.add(field);
        }
      } catch (_) {
        brokers.fields.add(field);
      }
    };

    // last_login — timestamp of the broker's most recent sign-in
    addField(new DateField({ name: 'last_login' }));

    // public_visibility — whether the broker appears in the public directory.
    // Defaults to false; flipped to true only after Super Admin approval.
    addField(new BoolField({ name: 'public_visibility' }));

    // profile_completion — 0–100 percentage of completed profile fields.
    addField(new NumberField({ name: 'profile_completion', min: 0, max: 100 }));

    // approval_status — explicit approval workflow status, separate from the
    // legacy `status` field so the modular system can track approval without
    // disturbing existing directory logic.
    addField(
      new SelectField({
        name: 'approval_status',
        maxSelect: 1,
        values: [
          'pending_review',
          'approved',
          'changes_required',
          'rejected',
          'inactive',
          'suspended',
        ],
      }),
    );

    // verification_status — tracks identity/license verification independently.
    addField(
      new SelectField({
        name: 'verification_status',
        maxSelect: 1,
        values: ['unverified', 'pending', 'verified', 'rejected'],
      }),
    );

    // broker_id — human-readable stable broker identifier (auto-filled server-side).
    addField(new TextField({ name: 'broker_id', max: 60 }));

    // whatsapp_same — convenience flag stored for the registration form.
    addField(new BoolField({ name: 'whatsapp_same' }));

    // residence_country / residence_city — explicit residence (separate from
    // the working country/city already on the record).
    addField(new TextField({ name: 'residence_country', max: 10 }));
    addField(new TextField({ name: 'residence_city', max: 120 }));

    // rejected_reason / changes_reason — admin review feedback messages.
    addField(new TextField({ name: 'rejected_reason', max: 2000 }));
    addField(new TextField({ name: 'changes_reason', max: 2000 }));

    // reviewed_by — relation to the admin who last reviewed the broker.
    addField(
      new RelationField({
        name: 'reviewed_by',
        maxSelect: 1,
        collectionId: users.id,
        cascadeDelete: false,
      }),
    );

    // reviewed_at — timestamp of the last admin review action.
    addField(new DateField({ name: 'reviewed_at' }));

    // Expand the legacy `status` enum with inactive / suspended (keep existing).
    try {
      const st = brokers.fields.getByName('status');
      if (st) {
        const existing = (st.values || []).slice();
        ['inactive', 'suspended'].forEach((v) => {
          if (!existing.includes(v)) existing.push(v);
        });
        st.values = existing;
      }
    } catch (_) {}

    // ---- Backend access rules (authorization enforced server-side) ----
    // Public directory: only approved + publicly visible brokers are listed
    // anonymously. The owner can always see their own record. Super Admin sees
    // everything.
    brokers.listRule =
      "(@request.auth.id != '' && @request.auth.id = owner) || " +
      "(@request.auth.is_super_admin = true) || " +
      "(status = 'approved' && public_visibility = true)";
    brokers.viewRule =
      "(@request.auth.id != '' && @request.auth.id = owner) || " +
      "(@request.auth.is_super_admin = true) || " +
      "(status = 'approved' && public_visibility = true)";
    // Create: a broker can create only their own profile.
    brokers.createRule =
      "@request.auth.is_super_admin = true || " +
      "(@request.auth.id != '' && @request.auth.id = @request.body.owner)";
    // Update: owner can update their own profile but CANNOT escalate status,
    // approval_status, verification_status, or public_visibility — those are
    // admin-only. Super Admin can update anything.
    brokers.updateRule =
      "@request.auth.is_super_admin = true || " +
      "(@request.auth.id != '' && @request.auth.id = owner && " +
      "(@request.body.status:isset = false || @request.body.status = status) && " +
      "(@request.body.approval_status:isset = false || @request.body.approval_status = approval_status) && " +
      "(@request.body.verification_status:isset = false || @request.body.verification_status = verification_status) && " +
      "(@request.body.public_visibility:isset = false || @request.body.public_visibility = public_visibility))";
    // Delete: Super Admin only.
    brokers.deleteRule = '@request.auth.is_super_admin = true';

    app.save(brokers);
  },
  (app) => {
    // Non-destructive down: leave the added fields in place so no data is lost.
    // Removing select values or fields would risk orphaning records.
  },
);
