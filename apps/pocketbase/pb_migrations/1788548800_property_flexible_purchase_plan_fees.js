/// <reference path="../pb_data/types.d.ts" />

// Adds flexible, country-agnostic fields to the `properties` collection:
//  - Purchase fees (json array of {name, amount, type})
//  - Payment / financing method + duration (years + months)
//  - Payment-plan percentages (down / construction / handover / post)
//  - Post-handover duration (years + months)
//  - Service-charge value type (fixed/percent) + paid status (paid/unpaid/partial)
//  - Extended service-charge frequency options (none/semi_annual/quarterly/on_handover/custom)
//  - Additional property documents (multi-file) + their names (json)
// All optional / backward compatible — existing properties are unaffected.

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('properties');

    // --- Purchase fees (multiple line items) ---
    if (!collection.fields.getByName('purchase_fees')) {
      collection.fields.add(
        new JSONField({ name: 'purchase_fees', maxSize: 200000 }),
      );
    }

    // --- Payment / financing method ---
    if (!collection.fields.getByName('payment_method')) {
      collection.fields.add(
        new SelectField({
          name: 'payment_method',
          maxSelect: 1,
          values: ['full', 'company_installments', 'bank_installments'],
        }),
      );
    }
    if (!collection.fields.getByName('payment_duration_years')) {
      collection.fields.add(new NumberField({ name: 'payment_duration_years', min: 0 }));
    }
    if (!collection.fields.getByName('payment_duration_months')) {
      collection.fields.add(new NumberField({ name: 'payment_duration_months', min: 0 }));
    }

    // --- Payment-plan percentages ---
    if (!collection.fields.getByName('plan_down_pct')) {
      collection.fields.add(new NumberField({ name: 'plan_down_pct', min: 0, max: 100 }));
    }
    if (!collection.fields.getByName('plan_construction_pct')) {
      collection.fields.add(new NumberField({ name: 'plan_construction_pct', min: 0, max: 100 }));
    }
    if (!collection.fields.getByName('plan_handover_pct')) {
      collection.fields.add(new NumberField({ name: 'plan_handover_pct', min: 0, max: 100 }));
    }
    if (!collection.fields.getByName('plan_post_pct')) {
      collection.fields.add(new NumberField({ name: 'plan_post_pct', min: 0, max: 100 }));
    }

    // --- Post-handover duration ---
    if (!collection.fields.getByName('post_handover_years')) {
      collection.fields.add(new NumberField({ name: 'post_handover_years', min: 0 }));
    }
    if (!collection.fields.getByName('post_handover_months')) {
      collection.fields.add(new NumberField({ name: 'post_handover_months', min: 0 }));
    }

    // --- Service-charge flexibility ---
    // Extend the existing frequency select with new country-agnostic options.
    const freq = collection.fields.getByName('service_charge_frequency');
    if (freq) {
      const existing = Array.isArray(freq.values) ? freq.values.slice() : [];
      const merged = Array.from(
        new Set([...existing, 'none', 'semi_annual', 'quarterly', 'on_handover', 'custom']),
      );
      freq.values = merged;
    }
    if (!collection.fields.getByName('service_charge_value_type')) {
      collection.fields.add(
        new SelectField({
          name: 'service_charge_value_type',
          maxSelect: 1,
          values: ['fixed', 'percent'],
        }),
      );
    }
    if (!collection.fields.getByName('service_charge_paid_status')) {
      collection.fields.add(
        new SelectField({
          name: 'service_charge_paid_status',
          maxSelect: 1,
          values: ['unpaid', 'paid', 'partial'],
        }),
      );
    }

    // --- Additional property documents (multi-file) + names ---
    if (!collection.fields.getByName('additional_documents')) {
      collection.fields.add(
        new FileField({
          name: 'additional_documents',
          maxSelect: 20,
          maxSize: 536870912,
          mimeTypes: [
            'application/pdf',
            'image/jpeg',
            'image/png',
            'image/webp',
          ],
        }),
      );
    }
    if (!collection.fields.getByName('additional_doc_names')) {
      collection.fields.add(
        new JSONField({ name: 'additional_doc_names', maxSize: 200000 }),
      );
    }

    app.save(collection);
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('properties');
      [
        'purchase_fees',
        'payment_method',
        'payment_duration_years',
        'payment_duration_months',
        'plan_down_pct',
        'plan_construction_pct',
        'plan_handover_pct',
        'plan_post_pct',
        'post_handover_years',
        'post_handover_months',
        'service_charge_value_type',
        'service_charge_paid_status',
        'additional_documents',
        'additional_doc_names',
      ].forEach((name) => {
        const f = collection.fields.getByName(name);
        if (f) collection.fields.remove(f);
      });
      // Restore original frequency values.
      const freq = collection.fields.getByName('service_charge_frequency');
      if (freq) freq.values = ['yearly', 'one_time'];
      app.save(collection);
    } catch (e) {
      if (e.message.includes('no rows in result set')) return;
      throw e;
    }
  },
);
