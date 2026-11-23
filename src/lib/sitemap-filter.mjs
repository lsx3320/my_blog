/** Public pages stay in the sitemap. Gated personal tools do not. */
export function includeInSitemap(pageUrl) {
  const path = new URL(pageUrl).pathname;
  return !/^\/(diary|links)(\/|$)/.test(path);
}
