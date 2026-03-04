import { Helmet } from 'react-helmet-async';
import { getCurrentSiteOrigin, MAIN_SITE_URL } from '../../utils/publicUrls';

interface PageMetaProps {
  title: string;
  description: string;
  path?: string;
  image?: string;
  imageAlt?: string;
  type?: 'website' | 'article';
}

const SITE_NAME = 'FlowGuard';
const DEFAULT_IMAGE = `${MAIN_SITE_URL}/images/FlowGuard%20Preview.png`;
const DEFAULT_IMAGE_ALT = 'FlowGuard social preview card';

function resolveAbsoluteUrl(pathOrUrl?: string) {
  const siteUrl = getCurrentSiteOrigin();
  if (!pathOrUrl) return undefined;
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    return pathOrUrl;
  }
  return `${siteUrl}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`;
}

export function PageMeta({
  title,
  description,
  path = '/',
  image,
  imageAlt = DEFAULT_IMAGE_ALT,
  type = 'website',
}: PageMetaProps) {
  const canonicalUrl = resolveAbsoluteUrl(path) || getCurrentSiteOrigin();
  const imageUrl = resolveAbsoluteUrl(image) || DEFAULT_IMAGE;
  const fullTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <link rel="canonical" href={canonicalUrl} />
      <meta name="description" content={description} />

      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={imageUrl} />
      <meta property="og:image:alt" content={imageAlt} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content="@flowguard_" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={imageUrl} />
      <meta name="twitter:image:alt" content={imageAlt} />
    </Helmet>
  );
}
