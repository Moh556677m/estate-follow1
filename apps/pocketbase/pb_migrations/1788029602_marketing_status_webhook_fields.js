/// <reference path="../pb_data/types.d.ts" />

// Marketing — real campaign status vocabulary + error surfacing + webhook
// event fields.
//
// Campaign status gains:
//   queued            — recipients resolved, sending not started yet
//   partially_failed  — some sent, some failed
// (existing: draft, scheduled, sending, sent, failed, cancelled)
//
// marketing_campaigns.last_error stores the real backend reason a campaign
// failed/stalled (e.g. "No recipients resolved", mailer error) so the admin
// sees WHY instead of an infinite "Sending".
//
// marketing_sends gains webhook-driven fields:
//   message_id    — provider message id for webhook matching
//   delivered_at  — provider "delivered" event timestamp
//   bounced       — provider bounce/drop flag
//   bounce_reason — provider bounce reason
// and status values: queued, delivered, bounced, dropped, complained
// (existing: sent, failed, opened, clicked, unsubscribed)

migrate(
  (app) => {
    // ---- marketing_campaigns ----
    const campaigns = app.findCollectionByNameOrId('marketing_campaigns');
    const statusF = campaigns.fields.getByName('status');
    if (statusF) {
      statusF.values = [
        'draft',
        'scheduled',
        'queued',
        'sending',
        'sent',
        'partially_failed',
        'failed',
        'cancelled',
      ];
    }
    if (!campaigns.fields.getByName('last_error')) {
      campaigns.fields.add(new TextField({ name: 'last_error', max: 2000 }));
    }
    app.save(campaigns);

    // ---- marketing_sends ----
    const sends = app.findCollectionByNameOrId('marketing_sends');
    const sendStatusF = sends.fields.getByName('status');
    if (sendStatusF) {
      sendStatusF.values = [
        'queued',
        'sent',
        'delivered',
        'failed',
        'bounced',
        'dropped',
        'opened',
        'clicked',
        'complained',
        'unsubscribed',
      ];
    }
    if (!sends.fields.getByName('message_id')) {
      sends.fields.add(new TextField({ name: 'message_id', max: 200 }));
    }
    if (!sends.fields.getByName('delivered_at')) {
      sends.fields.add(new DateField({ name: 'delivered_at' }));
    }
    if (!sends.fields.getByName('bounced')) {
      sends.fields.add(new BoolField({ name: 'bounced' }));
    }
    if (!sends.fields.getByName('bounce_reason')) {
      sends.fields.add(new TextField({ name: 'bounce_reason', max: 500 }));
    }
    app.save(sends);
  },
  (app) => {
    try {
      const campaigns = app.findCollectionByNameOrId('marketing_campaigns');
      const sf = campaigns.fields.getByName('status');
      if (sf) {
        sf.values = ['draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled'];
      }
      if (campaigns.fields.getByName('last_error')) {
        campaigns.fields.removeByName('last_error');
      }
      app.save(campaigns);
    } catch (_) {}
    try {
      const sends = app.findCollectionByNameOrId('marketing_sends');
      const ssf = sends.fields.getByName('status');
      if (ssf) {
        ssf.values = ['sent', 'failed', 'opened', 'clicked', 'unsubscribed'];
      }
      ['message_id', 'delivered_at', 'bounced', 'bounce_reason'].forEach((n) => {
        if (sends.fields.getByName(n)) sends.fields.removeByName(n);
      });
      app.save(sends);
    } catch (_) {}
  },
);
