/// <reference path="../pb_data/types.d.ts" />

// Validate brokerage analytics events and force owner/viewer from the server.
// Clients may suggest owner/target; we re-resolve from the listing so stats
// cannot be spoofed onto another broker's dashboard.

onRecordCreateRequest((e) => {
  const info = e.requestInfo();
  const auth = info && info.auth ? info.auth : null;
  if (!auth || !auth.id) {
    throw new ForbiddenError('Authentication required.');
  }

  const targetType = String(e.record.get('target_type') || '').trim();
  const targetId = String(e.record.get('target_id') || '').trim();
  const eventName = String(e.record.get('event') || '').trim();

  const allowedEvents = {
    profile_view: true,
    whatsapp: true,
    call: true,
    email: true,
    website: true,
    instagram: true,
    facebook: true,
    tiktok: true,
    other: true,
  };

  if (targetType !== 'broker' && targetType !== 'company') {
    throw new BadRequestError('Invalid target type.');
  }
  if (!targetId) {
    throw new BadRequestError('Target is required.');
  }
  if (!allowedEvents[eventName]) {
    throw new BadRequestError('Invalid event type.');
  }

  const collectionName = targetType === 'company' ? 'brokerage_companies' : 'brokers';
  let listing = null;
  try {
    listing = $app.findRecordById(collectionName, targetId);
  } catch (_) {
    listing = null;
  }
  if (!listing) {
    throw new BadRequestError('Listing not found.');
  }

  const ownerId = String(listing.get('owner') || '');
  if (!ownerId) {
    throw new BadRequestError('Listing has no owner.');
  }

  // Do not count a broker viewing/clicking their own profile.
  if (ownerId === auth.id) {
    throw new BadRequestError('Self events are not tracked.');
  }

  e.record.set('owner', ownerId);
  e.record.set('viewer', auth.id);
  e.record.set('target_type', targetType);
  e.record.set('target_id', targetId);
  e.record.set('event', eventName);

  // Keep per-link key for custom social platforms; default built-ins.
  let linkKey = String(e.record.get('link_key') || '').trim().toLowerCase();
  if (!linkKey) {
    if (
      eventName === 'instagram' ||
      eventName === 'facebook' ||
      eventName === 'tiktok' ||
      eventName === 'website'
    ) {
      linkKey = eventName;
    } else if (eventName === 'other') {
      linkKey = 'other';
    }
  }
  if (linkKey) {
    e.record.set('link_key', linkKey.slice(0, 120));
  }

  e.next();
}, 'brokerage_events');
