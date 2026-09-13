/// <reference path="../pb_data/types.d.ts" />

// PocketBase doesn't send a verification email on record creation, so trigger it
// here. Runs post-commit, so a mail failure never blocks signup.
onRecordAfterCreateSuccess((e) => {
    if (!e.record.getBool("verified")) {
        try {
            $mails.sendRecordVerification($app, e.record)
        } catch (err) {
            $app.logger().error("Failed to send signup verification email", "error", String(err))
        }
    }

    e.next()
}, "users")
