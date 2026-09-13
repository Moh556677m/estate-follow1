/// <reference path="../pb_data/types.d.ts" />

// Safe, additive data migration for the property-management rebuild.
//
// BEFORE this migration: a property's `type` field was a mutually-exclusive
// classification ("cash" | "installment" | "rented"). Renting a cash/
// installment property overwrote its `type` to "rented", which destroyed
// the original cash/installment classification on that same row (see
// openConvert()/PropertyForm.jsx in the frontend, now fixed to never do
// this again — see RentPropertyModal.jsx).
//
// AFTER this migration: `type` only ever holds "cash" or "installment" (the
// real, permanent ownership classification). Whether a property is
// currently rented is expressed by a linked `tenancies` row instead
// (property_id + owner_id), which can be added/ended without ever touching
// the property's own type.
//
// This migration reconciles EXISTING data to the new model without losing
// anything:
//   1. For every property with type = "rented", infer what its underlying
//      classification must have been (installment if it has installment
//      payments/financing fields, cash otherwise) and set `type` to that.
//      All of the property's own fields (building, unit, country, the old
//      flat tenant_name/lease_contract/etc.) are left exactly as they were
//      — nothing is deleted.
//   2. A `tenants` + `tenancies` row is created from the property's existing
//      flat rental fields, so the rental relationship keeps working through
//      the new relational model.
//   3. Any existing `payments` rows with kind = "rent" for that property are
//      copied (not moved — the originals are left in place) into the new
//      `rent_payments` ("checks") collection, linked to the new tenancy.
//
// This migration is intentionally NOT reversed on down() — reverting would
// mean guessing which properties used to say "rented", which cannot be done
// safely. The additive collections it populates can still be removed by
// rolling back the collection-creation migrations if ever needed; the
// `properties.type` reclassification here is a one-way data fix.
migrate((app) => {
  let properties;
  try {
    properties = app.findRecordsByFilter('properties', 'type = "rented"', '', 5000, 0, {});
  } catch (_) {
    return; // properties collection not present yet (fresh/partial DB) — nothing to backfill.
  }
  if (!properties || properties.length === 0) return;

  let tenantsCollection;
  let tenanciesCollection;
  let rentPaymentsCollection;
  try {
    tenantsCollection = app.findCollectionByNameOrId('tenants');
    tenanciesCollection = app.findCollectionByNameOrId('tenancies');
    rentPaymentsCollection = app.findCollectionByNameOrId('rent_payments');
  } catch (_) {
    return; // new collections not created yet — this migration runs after them by filename order.
  }

  const todayIso = new Date().toISOString().slice(0, 10);

  properties.forEach((p) => {
    try {
      const propId = p.id;
      const ownerId = p.get('owner');

      // 1) Infer the real underlying classification and fix `type`.
      let legacyInstallmentPays = [];
      try {
        legacyInstallmentPays = app.findRecordsByFilter(
          'payments',
          'property = "' + propId + '" && kind = "installment"',
          '',
          1,
          0,
          {},
        );
      } catch (_) {
        legacyInstallmentPays = [];
      }
      const hasInstallmentData =
        legacyInstallmentPays.length > 0 ||
        Number(p.get('installment_amount')) > 0 ||
        Number(p.get('down_payment')) > 0 ||
        Number(p.get('total_paid')) > 0;
      const baseType = hasInstallmentData ? 'installment' : 'cash';
      p.set('type', baseType);
      app.save(p);

      // 2) Create a tenant + tenancy from the property's existing flat fields.
      const tenantName = p.get('tenant_name') || '';
      const tenantPhone = p.get('tenant_phone') || '';
      const tenantEmail = p.get('tenant_email') || '';

      let tenantId = null;
      if (tenantName || tenantPhone || tenantEmail) {
        const tenantRec = new Record(tenantsCollection);
        tenantRec.set('owner', ownerId);
        tenantRec.set('name', tenantName || 'Tenant');
        tenantRec.set('phone', tenantPhone);
        tenantRec.set('email', tenantEmail);
        app.save(tenantRec);
        tenantId = tenantRec.id;
      }

      const endDate = p.get('contract_end_date') || '';
      const status = endDate && String(endDate).slice(0, 10) < todayIso ? 'ended' : 'active';

      const tenancyRec = new Record(tenanciesCollection);
      tenancyRec.set('property', propId);
      tenancyRec.set('owner', ownerId);
      if (tenantId) tenancyRec.set('tenant', tenantId);
      tenancyRec.set('tenant_name', tenantName);
      tenancyRec.set('tenant_phone', tenantPhone);
      tenancyRec.set('tenant_email', tenantEmail);
      tenancyRec.set('start_date', p.get('contract_start_date') || '');
      tenancyRec.set('end_date', endDate);
      tenancyRec.set('security_deposit', Number(p.get('security_deposit')) || 0);
      tenancyRec.set('status', status);
      tenancyRec.set(
        'notes',
        'Migrated automatically from the legacy type="rented" property record.',
      );

      // 3) Copy legacy rent payments (kind="rent") into rent_payments/checks.
      let legacyRentPays = [];
      try {
        legacyRentPays = app.findRecordsByFilter(
          'payments',
          'property = "' + propId + '" && kind = "rent"',
          'due_date',
          2000,
          0,
          {},
        );
      } catch (_) {
        legacyRentPays = [];
      }
      tenancyRec.set('payments_count', legacyRentPays.length);
      app.save(tenancyRec);

      legacyRentPays.forEach((pay) => {
        const checkRec = new Record(rentPaymentsCollection);
        checkRec.set('tenancy', tenancyRec.id);
        checkRec.set('property', propId);
        checkRec.set('owner', ownerId);
        checkRec.set('amount', Number(pay.get('amount')) || 0);
        checkRec.set('due_date', pay.get('due_date') || '');
        const payStatus = pay.get('status');
        checkRec.set('status', payStatus === 'paid' ? 'collected' : 'pending');
        if (payStatus === 'paid') {
          checkRec.set('collected_at', pay.get('paid_at') || pay.get('due_date') || '');
        }
        checkRec.set('note', pay.get('label') || '');
        app.save(checkRec);
      });
    } catch (_) {
      // Never let one bad legacy row abort the whole migration/boot.
    }
  });
}, (_app) => {
  // Intentionally irreversible — see comment above.
});
