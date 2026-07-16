// components/PageMeta.tsx
//
// A single reusable Helmet wrapper for per-page SEO tags. Two jobs:
//   1. Indexable pages get a real title/description/canonical/OG set instead
//      of silently inheriting index.html's landing-page defaults (which,
//      before this, is what every page without its own Helmet block did —
//      diluting the site's title/description signals across many URLs).
//   2. Auth-gated / internal pages get an explicit noindex, so Google isn't
//      left to crawl and index a login-walled or empty-shell page under a
//      generic title — that counts against overall site quality, not just
//      wasted crawl budget.
//
// `canonical` is a path (e.g. "/price"), not a full URL — this component
// owns the site origin so it can never drift out of sync across pages the
// way the old hand-written Helmet blocks did (some pointed at
// leveluppedu.app, others at a stale levelup-snowy.vercel.app).

import { Helmet } from "react-helmet-async";

const SITE_URL = "https://leveluppedu.app";
const DEFAULT_OG_IMAGE = `${SITE_URL}/logo.png`;

interface PageMetaProps {
  title: string;
  description?: string;
  /** Path only, e.g. "/price" — omit for pages that shouldn't claim a canonical (e.g. noindexed ones). */
  canonical?: string;
  noindex?: boolean;
  ogImage?: string;
}

export function PageMeta({ title, description, canonical, noindex = false, ogImage }: PageMetaProps) {
  const fullTitle = /level ?up/i.test(title) ? title : `${title} | Level Up AI`;
  const canonicalUrl = canonical ? `${SITE_URL}${canonical}` : undefined;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      {description && <meta name="description" content={description} />}
      <meta name="robots" content={noindex ? "noindex, nofollow" : "index, follow"} />
      {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}

      {!noindex && (
        <>
          <meta property="og:type" content="website" />
          <meta property="og:site_name" content="Level Up AI" />
          <meta property="og:title" content={fullTitle} />
          {description && <meta property="og:description" content={description} />}
          {canonicalUrl && <meta property="og:url" content={canonicalUrl} />}
          <meta property="og:image" content={ogImage || DEFAULT_OG_IMAGE} />

          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content={fullTitle} />
          {description && <meta name="twitter:description" content={description} />}
          <meta name="twitter:image" content={ogImage || DEFAULT_OG_IMAGE} />
        </>
      )}
    </Helmet>
  );
}
