// Basic responsive + admin-interactivity smoke check, run against a real
// booted server.cjs (see .github/workflows/ci.yml's `responsive-smoke` job)
// with Playwright's Chromium.
//
// Two things this exists to catch, because both have broken production more
// than once on this project without CI noticing:
//   1) A page that doesn't render usably at phone/tablet/desktop widths.
//   2) The admin dashboard sidebar being frozen/unclickable — every prior
//      fix for this (Radix pointer-events cleanup, the CSS z-index/
//      pointer-events hardening in index.css, the /admin vs /dashboard
//      basePath routing bug) had no automated check behind it, so a later
//      change could silently reintroduce the freeze and nothing would fail.
//      The admin check below actually clicks a real sidebar link and
//      requires real navigation to occur — not just "the element exists".
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:4173';
const PB_SUPERUSER_EMAIL = process.env.PB_SUPERUSER_EMAIL || 'ci-admin@example.com';
const PB_SUPERUSER_PASSWORD = process.env.PB_SUPERUSER_PASSWORD || '';

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];

// Pages that must render for an anonymous visitor with no console errors and
// no horizontal overflow, at every viewport above.
const PUBLIC_PAGES = ['/login', '/signup'];

let failures = 0;

function fail(message) {
  console.error(`FAIL: ${message}`);
  failures += 1;
}

function ok(message) {
  console.log(`OK: ${message}`);
}

// Known-benign console noise that has nothing to do with an actual
// regression — expected in ANY environment other than the real production
// domain, not just CI. Mirrors the same kind of allowlist vite.config.js's
// own BENIGN_FETCH_ERRORS already uses for the same reason: a blanket
// "any console error fails" check must never produce a false positive that
// trains everyone to ignore this smoke test's real failures.
const BENIGN_CONSOLE_PATTERNS = [
  // OneSignal's SDK refuses to initialize outside its configured domain —
  // fires on any host that isn't the real production domain.
  /Can only be used on:/i,
];

function isBenignConsoleMessage(text) {
  return BENIGN_CONSOLE_PATTERNS.some((pattern) => pattern.test(text));
}

async function checkPublicPages(browser) {
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    for (const path of PUBLIC_PAGES) {
      const page = await context.newPage();
      const consoleErrors = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error' && !isBenignConsoleMessage(msg.text())) consoleErrors.push(msg.text());
      });
      page.on('pageerror', (err) => {
        const text = String(err);
        if (!isBenignConsoleMessage(text)) consoleErrors.push(text);
      });

      const response = await page.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle', timeout: 30000 });
      if (!response || !response.ok()) {
        fail(`${path} at ${viewport.name} (${viewport.width}px) did not load (status ${response?.status()}).`);
        await page.close();
        continue;
      }

      // No horizontal scroll — a real, common mobile-layout regression.
      const hasHorizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      if (hasHorizontalOverflow) {
        fail(`${path} at ${viewport.name} (${viewport.width}px) has horizontal overflow (a layout regression).`);
      } else {
        ok(`${path} at ${viewport.name} (${viewport.width}px): no horizontal overflow.`);
      }

      if (consoleErrors.length) {
        fail(`${path} at ${viewport.name} (${viewport.width}px) logged console errors: ${consoleErrors.slice(0, 3).join(' | ')}`);
      } else {
        ok(`${path} at ${viewport.name} (${viewport.width}px): no console errors.`);
      }

      await page.close();
    }
    await context.close();
  }
}

// Seeds a throwaway admin `users` record directly via PocketBase's own
// superuser API (bypassing the UI, since this only needs a working account
// to exist, not to test account creation) and returns its credentials.
async function seedAdminUser() {
  if (!PB_SUPERUSER_PASSWORD) {
    throw new Error('PB_SUPERUSER_PASSWORD must be set to seed a test admin account.');
  }
  const authRes = await fetch(`${BASE_URL}/hcgi/platform/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: PB_SUPERUSER_EMAIL, password: PB_SUPERUSER_PASSWORD }),
  });
  if (!authRes.ok) {
    throw new Error(`Could not authenticate as PocketBase superuser (status ${authRes.status}).`);
  }
  const { token } = await authRes.json();

  const email = `smoke-admin-${Date.now()}@example.com`;
  const password = 'Sm0ke-Admin-Password-123!';
  const createRes = await fetch(`${BASE_URL}/hcgi/platform/api/collections/users/records`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify({
      email,
      password,
      passwordConfirm: password,
      role: 'admin',
      is_super_admin: true,
      pending_signup: false,
      verified: true,
      suspended: false,
      // Required fields on the users collection (see
      // 1787862388_signup_otp_fields.js) — real values don't matter here.
      nationality: 'PENDING',
      gender: 'male',
    }),
  });
  if (!createRes.ok) {
    const body = await createRes.text();
    throw new Error(`Could not create the smoke-test admin user (status ${createRes.status}): ${body}`);
  }
  return { email, password };
}

async function checkAdminSidebar(browser) {
  let admin;
  try {
    admin = await seedAdminUser();
  } catch (err) {
    fail(`Could not seed a test admin account: ${err.message}`);
    return;
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !isBenignConsoleMessage(msg.text())) consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    const text = String(err);
    if (!isBenignConsoleMessage(text)) consoleErrors.push(text);
  });

  await page.goto(`${BASE_URL}/admin/login`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.fill('#admin-email', admin.email);
  await page.fill('#admin-password', admin.password);
  await page.click('button[type="submit"]');

  try {
    await page.waitForURL(/\/admin\/overview/, { timeout: 15000 });
  } catch {
    const bodyText = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
    fail(
      `Admin login did not reach /admin/overview (still on ${page.url()}). ` +
        `Console errors: ${consoleErrors.slice(0, 5).join(' | ') || '(none)'} ` +
        `Visible page text: ${bodyText.slice(0, 300).replace(/\s+/g, ' ')}`,
    );
    await context.close();
    return;
  }
  ok('Admin login succeeded and reached /admin/overview.');

  // The sidebar must actually be there and actually be clickable — not just
  // present in the DOM. Wait for it, then read its live pointer-events.
  const sidebar = page.locator('[data-ef-sidebar="desktop"]');
  try {
    await sidebar.waitFor({ state: 'visible', timeout: 10000 });
  } catch {
    fail('The admin desktop sidebar never became visible.');
    await context.close();
    return;
  }

  const pointerEvents = await sidebar.evaluate((el) => getComputedStyle(el).pointerEvents);
  if (pointerEvents === 'none') {
    fail('The admin sidebar is present but has pointer-events: none — this IS the freeze bug.');
  } else {
    ok('The admin sidebar accepts pointer events.');
  }

  // The real regression test: click an actual sidebar link and require real
  // navigation. A frozen sidebar would leave the URL unchanged.
  //
  // Regression (false positive, root-caused via temporary timestamped CI
  // diagnostics): this used to always click the FIRST matching link
  // (`.first()`) without checking where it actually pointed. The admin
  // dashboard's first sidebar item is "Overview", i.e. /admin/overview —
  // exactly the page /admin/login already redirects to after a successful
  // login. Clicking a link to the page you are ALREADY on correctly does
  // not change the URL; that is not a frozen sidebar, it's clicking a link
  // to here. This was never a real freeze — it was this test clicking the
  // one link guaranteed to look like a no-op. Now picks the first link
  // that actually points somewhere else.
  const beforeUrl = page.url();
  const links = sidebar.locator('a[href^="/admin/"]');
  const linkCount = await links.count();
  let targetLink = null;
  for (let i = 0; i < linkCount; i += 1) {
    const candidate = links.nth(i);
    // eslint-disable-next-line no-await-in-loop
    const href = await candidate.getAttribute('href');
    if (href && !beforeUrl.endsWith(href)) {
      targetLink = candidate;
      break;
    }
  }
  if (!targetLink) {
    fail('No sidebar link pointing to a different section was found (cannot test real navigation).');
  } else {
    await targetLink.click({ timeout: 10000 });
    await page.waitForTimeout(500);
    const afterUrl = page.url();
    if (afterUrl === beforeUrl) {
      fail('Clicking a sidebar link did not navigate anywhere — the sidebar is frozen.');
    } else {
      ok(`Sidebar navigation works (${beforeUrl} -> ${afterUrl}).`);
    }
  }

  if (consoleErrors.length) {
    fail(`Admin dashboard logged console errors: ${consoleErrors.slice(0, 3).join(' | ')}`);
  } else {
    ok('Admin dashboard: no console errors.');
  }

  await context.close();
}

const browser = await chromium.launch();
try {
  await checkPublicPages(browser);
  await checkAdminSidebar(browser);
} finally {
  await browser.close();
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll responsive/admin-interactivity checks passed.');
