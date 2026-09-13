// Shared "is this owner's profile complete enough to perform a restricted
// action" check. Mirrors the exact three mandatory fields already used by
// OwnerProfileEditor.jsx's first-run completion screen and (historically)
// OwnerDashboard.jsx's access gate: date of birth, gender, and at least one
// uploaded identity document (Passport OR Residence ID, in either the
// legacy passport_file/residence_file fields or the newer unified
// document_file/document_type/document_number fields).
//
// IMPORTANT: this only gates specific SENSITIVE actions (adding a property,
// uploading a document, submitting a request that requires a complete
// account) — it must never be used to block general navigation/browsing.
// See OwnerDashboard.jsx and DocumentsCenter.jsx for where this is applied.
export function hasIdentityDocument(user) {
  return !!(
    (user?.passport_file && user?.passport_number) ||
    (user?.residence_file && user?.residence_number) ||
    (user?.document_file && user?.document_type && user?.document_number)
  );
}

export function hasMandatoryProfileData(user) {
  return !!user?.date_of_birth && !!user?.gender && hasIdentityDocument(user);
}

// True when the account still needs the owner to (re)visit the profile
// completion screen: either the mandatory basic data is genuinely missing,
// or the Super Admin explicitly rejected previously submitted documents.
export function needsProfileCompletion(user) {
  const accountState = String(user?.account_state || '').toLowerCase();
  return accountState === 'rejected' || (!hasMandatoryProfileData(user) && accountState !== 'approved');
}
