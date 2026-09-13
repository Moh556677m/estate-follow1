/// <reference path="../pb_data/types.d.ts" />

// Ensure the permanent Super Admin account is correctly flagged and active.
migrate(
  (app) => {
    const email = 'admin@estatefollow.com';
    let admin = null;
    try {
      admin = app.findAuthRecordByEmail('users', email);
    } catch (_) {
      admin = null;
    }
    if (!admin) {
      // Try case-insensitive scan if exact lookup fails.
      try {
        const all = app.findAllRecords('users');
        for (let i = 0; i < all.length; i++) {
          const e = String(all[i].getString('email') || '')
            .trim()
            .toLowerCase();
          if (e === email) {
            admin = all[i];
            break;
          }
        }
      } catch (_) {
        /* ignore */
      }
    }
    if (!admin) return;

    admin.set('is_super_admin', true);
    admin.set('role', 'admin');
    admin.set('suspended', false);
    try {
      admin.set('account_state', 'active');
    } catch (_) {
      /* ignore */
    }
    try {
      admin.set('can_view_revenue', true);
    } catch (_) {
      /* ignore */
    }
    // Normalize stored email casing.
    try {
      admin.setEmail(email);
    } catch (_) {
      try {
        admin.set('email', email);
      } catch (__) {
        /* ignore */
      }
    }
    app.save(admin);
  },
  (app) => {
    // no-op down — do not strip super admin
  },
);
