// Health endpoint for external monitoring (e.g. UptimeRobot).
//
// Reports both this API process AND PocketBase (the app's only database),
// since "the site is up" from a monitoring tool's point of view has to mean
// both are reachable — an API that responds 200 while PocketBase is down
// still fails every real request the site makes. Returns:
//   200  — API + PocketBase both healthy
//   503  — API is up but PocketBase is not reachable (degraded)
//
// JSON body so a monitoring tool / a human can see exactly which component
// is down, not just "site down".
const POCKETBASE_HEALTH_URL = 'http://localhost:8090/api/health';

export default async (req, res) => {
    const startedAt = Date.now();
    let pocketbase = { ok: false };

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        const response = await fetch(POCKETBASE_HEALTH_URL, {
            method: 'GET',
            signal: controller.signal,
        });
        clearTimeout(timeout);
        pocketbase = { ok: response.ok, statusCode: response.status };
    } catch (err) {
        pocketbase = { ok: false, error: err?.name === 'AbortError' ? 'timeout' : 'unreachable' };
    }

    const healthy = pocketbase.ok;

    res.status(healthy ? 200 : 503).json({
        status: healthy ? 'ok' : 'degraded',
        api: { ok: true },
        pocketbase,
        checkedInMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
    });
};
