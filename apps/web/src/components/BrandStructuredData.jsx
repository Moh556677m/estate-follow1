import React from 'react';
import { Helmet } from 'react-helmet';
import { useBrandEntity, buildOrganizationJsonLd, buildWebSiteJsonLd } from '@/lib/brandEntity';

/**
 * Global Brand Identity structured data.
 *
 * Mounted once in App.jsx (outside auth) so EVERY page — current and future,
 * public or authenticated — inherits the official Estate Follow Organization
 * and WebSite Schema.org JSON-LD automatically from the central Brand Entity.
 *
 * The static Organization block in index.html covers first-paint crawlers;
 * this component augments/refreshes it at runtime with the live Brand Entity
 * (alternateName, sameAs, contact) edited by the Super Admin in
 * SEO & AI Search > Brand Entity.
 */
const BrandStructuredData = () => {
  const { brand } = useBrandEntity();
  const org = buildOrganizationJsonLd(brand);
  const site = buildWebSiteJsonLd(brand);

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(org)}</script>
      <script type="application/ld+json">{JSON.stringify(site)}</script>
    </Helmet>
  );
};

export default BrandStructuredData;
