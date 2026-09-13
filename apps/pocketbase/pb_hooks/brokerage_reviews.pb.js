/// <reference path="../pb_data/types.d.ts" />

// Brokerage reviews: enforce one review per user per target, block self-review,
// and keep rating_avg / rating_count on the target broker/company in sync.

function targetCollectionName(targetType) {
  return targetType === 'company' ? 'brokerage_companies' : 'brokers';
}

// Recompute and persist aggregate rating for a broker/company target.
function recomputeRating(targetType, targetId) {
  if (!targetType || !targetId) return;
  const colName = targetCollectionName(targetType);
  let target;
  try {
    target = $app.findRecordById(colName, targetId);
  } catch (_) {
    return;
  }
  let reviews = [];
  try {
    reviews = $app.findRecordsByFilter(
      'brokerage_reviews',
      'target_type = "' + targetType + '" && target_id = "' + targetId + '"',
      '',
      1000,
      0,
    );
  } catch (_) {
    reviews = [];
  }
  let sum = 0;
  let count = 0;
  for (let i = 0; i < reviews.length; i++) {
    const r = reviews[i];
    let val = r.get('rating');
    if (typeof val !== 'number') val = Number(val);
    if (val > 0) {
      sum += val;
      count++;
    }
  }
  const avg = count > 0 ? Math.round((sum / count) * 10) / 10 : 0;
  target.set('rating_avg', avg);
  target.set('rating_count', count);
  $app.save(target);
}

// Before create: force user = caller, block duplicates and self-review.
onRecordCreateRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth || !auth.id) {
    throw new BadRequestError('You must be signed in to leave a review.');
  }
  e.record.set('user', auth.id);

  const targetType = e.record.getString('target_type');
  const targetId = e.record.getString('target_id');
  if (!targetType || !targetId) {
    throw new BadRequestError('Invalid review target.');
  }

  // Block self-review: a broker/company owner cannot review their own profile.
  try {
    const target = $app.findRecordById(targetCollectionName(targetType), targetId);
    const ownerId = target.getString('owner');
    if (ownerId && ownerId === auth.id) {
      throw new BadRequestError('You cannot review your own profile.');
    }
  } catch (err) {
    if (String(err).indexOf('own profile') !== -1) throw err;
    // missing target — let it through, will just not match anything
  }

  // Block duplicate: one review per user per target.
  let existing = [];
  try {
    existing = $app.findRecordsByFilter(
      'brokerage_reviews',
      'target_type = "' + targetType + '" && target_id = "' + targetId + '" && user = "' + auth.id + '"',
      '',
      1,
      0,
    );
  } catch (_) {}
  if (existing && existing.length > 0) {
    throw new BadRequestError('You have already reviewed this profile.');
  }

  e.next();
}, 'brokerage_reviews');

// After create/update/delete: recompute the target's aggregate rating.
onRecordAfterCreateSuccess((e) => {
  recomputeRating(e.record.getString('target_type'), e.record.getString('target_id'));
  e.next();
}, 'brokerage_reviews');

onRecordAfterUpdateSuccess((e) => {
  recomputeRating(e.record.getString('target_type'), e.record.getString('target_id'));
  e.next();
}, 'brokerage_reviews');

onRecordAfterDeleteSuccess((e) => {
  recomputeRating(e.record.getString('target_type'), e.record.getString('target_id'));
  e.next();
}, 'brokerage_reviews');
