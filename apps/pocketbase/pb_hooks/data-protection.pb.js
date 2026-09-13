/// <reference path="../pb_data/types.d.ts" />

// Data protection safeguard.
//
// Deleting a user cascades to every property they own (cascadeDelete on the
// owner relation), which in turn cascades to payments, documents, and uploaded
// files. A single accidental user delete can wipe an owner's entire portfolio.
//
// This hook blocks user deletion while the account still owns properties,
// forcing the admin to explicitly reassign or remove those properties first.
// Empty accounts (no properties) can still be deleted normally.
//
// Non-destructive: never deletes, never modifies records. Only guards deletes.
// Each callback is self-contained (PB JSVM isolated scope).

onRecordDeleteRequest((e) => {
  try {
    const owned = $app.findRecordsByFilter(
      'properties',
      'owner = {:uid}',
      '-created',
      1,
      0,
      { uid: e.record.id },
    );
    if (owned.length > 0) {
      throw new BadRequestError(
        'DATA_PROTECTED: This account still owns properties. Reassign or delete those properties first before removing the user. / هذا الحساب يملك عقارات. أعد تعيين أو احذف العقارات أولاً قبل حذف المستخدم.',
      );
    }
  } catch (err) {
    if (String(err).indexOf('DATA_PROTECTED') >= 0) throw err;
    // If the filter lookup itself failed, do NOT block the delete — fail open
    // so a transient query error never locks the admin out. Log and continue.
    $app.logger().error('data-protection check failed', 'user', e.record.id, 'err', String(err));
  }
  e.next();
}, 'users');
