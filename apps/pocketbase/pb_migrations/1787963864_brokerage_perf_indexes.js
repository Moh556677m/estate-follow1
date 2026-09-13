/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // Brokers — country + status lookups (directory search)
    try {
      const brokers = app.findCollectionByNameOrId('brokers');
      const has = (name) => (brokers.indexes || []).some((i) => String(i).includes(name));
      if (!has('idx_brokers_country_status')) {
        brokers.addIndex('idx_brokers_country_status', false, 'country, status', '');
      }
      if (!has('idx_brokers_owner')) {
        brokers.addIndex('idx_brokers_owner', false, 'owner', '');
      }
      app.save(brokers);
    } catch (_) {
      /* ignore */
    }

    // Companies — country + status
    try {
      const cos = app.findCollectionByNameOrId('brokerage_companies');
      const has = (name) => (cos.indexes || []).some((i) => String(i).includes(name));
      if (!has('idx_brokerage_co_country_status')) {
        cos.addIndex('idx_brokerage_co_country_status', false, 'country, status', '');
      }
      if (!has('idx_brokerage_co_owner')) {
        cos.addIndex('idx_brokerage_co_owner', false, 'owner', '');
      }
      app.save(cos);
    } catch (_) {
      /* ignore */
    }

    // Branches — country filter for directory
    try {
      const br = app.findCollectionByNameOrId('brokerage_branches');
      const has = (name) => (br.indexes || []).some((i) => String(i).includes(name));
      if (!has('idx_brokerage_branches_country')) {
        br.addIndex('idx_brokerage_branches_country', false, 'country', '');
      }
      if (!has('idx_brokerage_branches_country_company')) {
        br.addIndex('idx_brokerage_branches_country_company', false, 'country, company', '');
      }
      app.save(br);
    } catch (_) {
      /* ignore */
    }

    // Users — account_type for routing / recovery
    try {
      const users = app.findCollectionByNameOrId('users');
      const has = (name) => (users.indexes || []).some((i) => String(i).includes(name));
      if (!has('idx_users_account_type')) {
        users.addIndex('idx_users_account_type', false, 'account_type', '');
      }
      app.save(users);
    } catch (_) {
      /* ignore */
    }
  },
  (app) => {
    const drop = (colName, idx) => {
      try {
        const c = app.findCollectionByNameOrId(colName);
        c.removeIndex(idx);
        app.save(c);
      } catch (_) {
        /* ignore */
      }
    };
    drop('brokers', 'idx_brokers_country_status');
    drop('brokers', 'idx_brokers_owner');
    drop('brokerage_companies', 'idx_brokerage_co_country_status');
    drop('brokerage_companies', 'idx_brokerage_co_owner');
    drop('brokerage_branches', 'idx_brokerage_branches_country');
    drop('brokerage_branches', 'idx_brokerage_branches_country_company');
    drop('users', 'idx_users_account_type');
  },
);
