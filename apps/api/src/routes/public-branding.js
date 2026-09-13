import { Router } from 'express';
import { pocketbaseClient } from '../utils/pocketbaseClient.js';
import logger from '../utils/logger.js';

// Public (no-auth) branding endpoint — VISUAL CHROME ONLY (colors, favicon,
// fonts, the platform_settings app logo, tab title). SEO metadata (page
// title/description fallback, OG image, canonical domain, per-page SEO,
// robots.txt content, Brand Entity for structured data) already has its own
// public route: PocketBase's `GET /ef/public-seo` hook
// (apps/pocketbase/pb_hooks/public-seo.pb.js), consumed via
// lib/brandEntity.js — this endpoint intentionally does not duplicate that.
//
// `platform_settings` in PocketBase requires an authenticated session to
// read (listRule/viewRule: "@request.auth.id != ''"), so anonymous visitors
// (the majority of real production traffic — the public marketing pages,
// guests browsing before login, search-engine crawlers) never received the
// Super Admin's uploaded logo/favicon/brand colors. Only signed-in users did
// (via the app's authenticated PocketBase session, see App.jsx's
// applyPlatformSettings). This route closes that specific gap.
//
// This route uses the API's own superuser PocketBase session (see
// utils/pocketbaseClient.js) — which bypasses collection rules — to read the
// record once, then re-emits ONLY the safe, public-facing subset. No
// secrets live in `platform_settings` (payment gateway keys and AI provider
// keys are stored/encrypted in separate collections), but this still
// deliberately allow-lists fields rather than passing the raw record
// through, so a future sensitive field added to platform_settings does not
// silently become public just because this endpoint exists.
const router = Router();

router.get('/', async (_req, res) => {
  try {
    const rows = await pocketbaseClient
      .collection('platform_settings')
      .getFullList({ sort: 'created' });
    const s = rows[0];

    if (!s) {
      res.set('Cache-Control', 'public, max-age=30');
      return res.json({ ok: true, data: null });
    }

    const logoUrl =
      (s.logo_file && pocketbaseClient.files.getURL(s, s.logo_file)) ||
      s.logo_url ||
      '';
    const iconUrl =
      s.site_icon_url ||
      (s.favicon_file && pocketbaseClient.files.getURL(s, s.favicon_file)) ||
      '';

    res.set('Cache-Control', 'public, max-age=60');
    return res.json({
      ok: true,
      data: {
        brand_name: s.brand_name || '',
        brand_name_ar: s.brand_name_ar || '',
        tagline: s.tagline || '',
        tagline_ar: s.tagline_ar || '',
        primary_color: s.primary_color || '',
        accent_color: s.accent_color || '',
        font_family: s.font_family || '',
        font_arabic: s.font_arabic || '',
        logo_url: logoUrl,
        site_icon_url: iconUrl,
        site_icon_version: s.site_icon_version || s.updated || '',
        social_links: s.social_links || {},
      },
    });
  } catch (err) {
    logger.error('public-branding fetch failed:', err);
    // Fail soft — the frontend falls back to its built-in defaults.
    return res.json({ ok: false, data: null });
  }
});

export default router;
