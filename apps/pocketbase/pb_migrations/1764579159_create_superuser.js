/// <reference path="../pb_data/types.d.ts" />
// Hardened to be idempotent: only ever creates the PocketBase superuser
// record if one does not already exist for this email. Without this guard,
// re-running this migration path against a database that somehow already
// has the record (e.g. a partially-applied migration run interrupted by a
// crash/SIGTERM) would throw and could block every later migration from
// running. This never overwrites an existing superuser's password.
migrate((app) => {
    const email = $os.getenv("PB_SUPERUSER_EMAIL")
    if (!email) return // nothing safe to do without a configured identity

    const superusers = app.findCollectionByNameOrId("_superusers")

    let existing = null
    try {
        existing = app.findAuthRecordByEmail("_superusers", email)
    } catch (_) {
        existing = null
    }
    if (existing) return // already present — never touch its password here

    const password = $os.getenv("PB_SUPERUSER_PASSWORD")
    if (!password) return // never create a superuser with a guessed/blank password

    const record = new Record(superusers)
    record.set("email", email)
    record.set("password", password)
    app.save(record)
})
