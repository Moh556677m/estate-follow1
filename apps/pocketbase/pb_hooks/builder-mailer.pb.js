
/// <reference path="../pb_data/types.d.ts" />
onMailerSend((e) => {
    if (e.app.settings().smtp.enabled) {
        return e.next()
    }

    const senderAddress = $os.getenv("BUILDER_MAILER_SENDER_ADDRESS");
    const apiUrl = $os.getenv("BUILDER_MAILER_API_URL");
    const apiKey = $os.getenv("BUILDER_MAILER_API_KEY");

    // Guard: without a real base URL, $http.send() below throws a raw Go
    // transport error ("unsupported protocol scheme \"\""), which is not
    // catchable in a useful way by callers and surfaces as an opaque 500.
    // Fail with a clear, actionable message instead — this relay is only
    // reached when SMTP is disabled AND the Resend hooks (0-resend-mailer.pb.js)
    // could not deliver either, so at this point NO mail channel is usable.
    if (!apiUrl || String(apiUrl).trim() === "" || !apiKey || String(apiKey).trim() === "") {
        $app.logger().error(
            "builder-mailer: no fallback mail channel configured (BUILDER_MAILER_API_URL / BUILDER_MAILER_API_KEY unset) — email not sent",
        );
        throw new ApiError(500, "Email service is not configured. Please contact support.");
    }

    const payload = {
        "subject": e.message.subject,
        "content": {
            ...(e.message.html ? {
                "html": e.message.html,
            } : {
                "text": e.message.text,
            }),
            "type": "plain",
        },
        "from": senderAddress,
        "fromName": e.message.from?.name,
        "replyTo": senderAddress,
        "to": e.message.to[0].address,
    }

    const response = $http.send({
        url: `${$os.getenv("BUILDER_MAILER_API_URL")}/api/v2/email`,
        method: "POST",
        headers: {
            "Authorization": `Bearer ${$os.getenv("BUILDER_MAILER_API_KEY")}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });
    
    if (response.statusCode !== 200) {
        $app.logger().error("Failed to send email", "error", response.json);

        throw new ApiError(500, response.json?.message || 'Failed to send email');
    }
})
