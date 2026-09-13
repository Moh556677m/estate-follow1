/// <reference path="../pb_data/types.d.ts" />

// Internal support chat between Super Admin / staff and a user (owner, broker, company).
// One thread per user pair; messages store body + sender.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');

    let threads;
    try {
      threads = app.findCollectionByNameOrId('internal_chat_threads');
    } catch (_) {
      threads = null;
    }

    if (!threads) {
      threads = new Collection({
        type: 'base',
        name: 'internal_chat_threads',
        listRule:
          "@request.auth.id != '' && (@request.auth.id = participant || @request.auth.is_super_admin = true || @request.auth.role = 'admin' || @request.auth.role = 'editor' || @request.auth.role = 'support' || @request.auth.role = 'custom')",
        viewRule:
          "@request.auth.id != '' && (@request.auth.id = participant || @request.auth.is_super_admin = true || @request.auth.role = 'admin' || @request.auth.role = 'editor' || @request.auth.role = 'support' || @request.auth.role = 'custom')",
        createRule:
          "@request.auth.id != '' && (@request.auth.is_super_admin = true || @request.auth.role = 'admin' || @request.auth.role = 'editor' || @request.auth.role = 'support' || @request.auth.role = 'custom' || @request.auth.id = @request.body.participant)",
        updateRule:
          "@request.auth.id != '' && (@request.auth.id = participant || @request.auth.is_super_admin = true || @request.auth.role = 'admin' || @request.auth.role = 'editor' || @request.auth.role = 'support' || @request.auth.role = 'custom')",
        deleteRule: '@request.auth.is_super_admin = true',
        fields: [
          {
            name: 'participant',
            type: 'relation',
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          {
            name: 'created_by',
            type: 'relation',
            required: false,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: false,
          },
          { name: 'participant_name', type: 'text', max: 200 },
          { name: 'participant_email', type: 'text', max: 200 },
          {
            name: 'participant_type',
            type: 'select',
            maxSelect: 1,
            values: ['owner', 'broker', 'company', 'staff', 'other'],
          },
          { name: 'subject', type: 'text', max: 300 },
          { name: 'context_type', type: 'text', max: 60 },
          { name: 'context_id', type: 'text', max: 60 },
          { name: 'last_message', type: 'text', max: 2000 },
          { name: 'last_message_at', type: 'date' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_chat_threads_participant ON internal_chat_threads (participant)',
          'CREATE INDEX idx_chat_threads_context ON internal_chat_threads (context_type, context_id)',
        ],
      });
      app.save(threads);
    }

    let messages;
    try {
      messages = app.findCollectionByNameOrId('internal_chat_messages');
    } catch (_) {
      messages = null;
    }

    if (!messages) {
      const thr = app.findCollectionByNameOrId('internal_chat_threads');
      messages = new Collection({
        type: 'base',
        name: 'internal_chat_messages',
        listRule:
          "@request.auth.id != '' && (thread.participant = @request.auth.id || @request.auth.is_super_admin = true || @request.auth.role = 'admin' || @request.auth.role = 'editor' || @request.auth.role = 'support' || @request.auth.role = 'custom')",
        viewRule:
          "@request.auth.id != '' && (thread.participant = @request.auth.id || @request.auth.is_super_admin = true || @request.auth.role = 'admin' || @request.auth.role = 'editor' || @request.auth.role = 'support' || @request.auth.role = 'custom')",
        createRule: "@request.auth.id != '' && @request.auth.id = @request.body.sender",
        updateRule: null,
        deleteRule: '@request.auth.is_super_admin = true',
        fields: [
          {
            name: 'thread',
            type: 'relation',
            required: true,
            maxSelect: 1,
            collectionId: thr.id,
            cascadeDelete: true,
          },
          {
            name: 'sender',
            type: 'relation',
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: false,
          },
          { name: 'body', type: 'text', required: true, max: 5000 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_chat_messages_thread ON internal_chat_messages (thread, created)',
        ],
      });
      app.save(messages);
    }
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('internal_chat_messages'));
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('internal_chat_threads'));
    } catch (_) {}
  },
);
