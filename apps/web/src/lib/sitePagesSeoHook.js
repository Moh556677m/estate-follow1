import { useEffect, useState } from 'react';
import { fetchCorePageSeoByRoute } from './sitePagesClient';

/**
 * Task #22 Site Editor — optional Super-Admin-set social-preview override for
 * one of the two hardcoded public pages (About / What-is-Estate-Follow).
 * Returns { title, description, image } (each possibly undefined) meant ONLY
 * for that page's <Seo> component props (og:/twitter: tags) — never for the
 * page's own literal <Helmet><title>/<meta name="description"> below it,
 * which must stay literal in source (see Seo.jsx's comment: the llms.txt
 * build step reads those two tags straight out of the page file).
 */
export function useCorePageSeoOverride(route, lang) {
  const [override, setOverride] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchCorePageSeoByRoute(route).then((rec) => {
      if (cancelled || !rec) return;
      setOverride(rec);
    });
    return () => {
      cancelled = true;
    };
  }, [route]);

  if (!override) return {};
  const isAr = lang === 'ar';
  return {
    title: (isAr ? override.meta_title_ar : override.meta_title_en) || undefined,
    description: (isAr ? override.meta_description_ar : override.meta_description_en) || undefined,
    image: override.og_image_url || undefined,
  };
}
