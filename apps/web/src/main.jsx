import '@/lib/tabSession';
import * as Sentry from '@sentry/react';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App';
import '@/index.css';
import { loadEnabledIntegrationScripts } from '@/lib/integrationScriptLoader';

Sentry.init({
	dsn: 'https://6cff79ac8bd249b2e0ccf9df31926b91@o4512064391413760.ingest.de.sentry.io/4512064424575056',
});

// GA4 / Clarity / OneSignal now load conditionally (see
// lib/integrationScriptLoader.js) instead of the previous unconditional
// static <script> tags in index.html, so the Integration Registry's
// Enable/Disable (Admin → External Tools) genuinely controls whether they
// run. Sentry must still `init()` synchronously above — it needs to be armed
// before the app renders to catch early crashes — so if the Admin has
// disabled it, we stop it from transmitting a moment later instead (the
// small window between init and this check is an inherent trade-off of
// needing crash capture from the very first tick).
loadEnabledIntegrationScripts().then((status) => {
	if (!status.sentry) {
		Sentry.close(0);
	}
});

ReactDOM.createRoot(document.getElementById('root')).render(
	<App />
);
