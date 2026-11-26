/**
 * Public R2 origin for blog images.
 * Content keeps site paths such as /gallery/… and /posts/….
 * Change this constant to move every rewritten image.
 */
export const IMAGE_BASE_URL = 'https://img.lushixiao.cn';

const CONTENT_IMAGE_PATH = /^\/(?:gallery|posts)\/.+\.(?:avif|gif|jpe?g|png|svg|webp)(?:[?#].*)?$/i;
const SHARE_IMAGE_PATH = /^\/og-default\.png(?:[?#].*)?$/i;

/** Prefix a content or share-image path with IMAGE_BASE_URL. Other URLs stay put. */
export function contentImageUrl(src) {
  if (typeof src !== 'string' || src.length === 0) return src;
  if (/^[a-z][a-z\d+.-]*:/i.test(src)) return src;
  if (!CONTENT_IMAGE_PATH.test(src) && !SHARE_IMAGE_PATH.test(src)) return src;
  return IMAGE_BASE_URL + src;
}

/** Rewrite quoted img src values inside a raw HTML snippet. */
export function rewriteHtmlImageSrcs(html) {
  if (typeof html !== 'string' || !/<\s*img\b/i.test(html)) return html;
  const quotedImgSrc = /(<img\b[^>]*?\bsrc\s*=\s*)(["'])([^"']*)(\2)/gi;
  return html.replace(quotedImgSrc, (match, before, quote, url, endQuote) => {
    const next = contentImageUrl(url);
    if (next === url) return match;
    return before + quote + next + endQuote;
  });
}

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  if (Array.isArray(node.children)) {
    for (const child of node.children) walk(child, visit);
  }
}

/** Remark: markdown images and raw HTML <img> in posts. */
export function remarkContentImages() {
  return (tree) => {
    const imageIds = new Set();
    walk(tree, (node) => {
      if (node.type === 'imageReference' && node.identifier) {
        imageIds.add(String(node.identifier).toLowerCase());
      }
    });
    walk(tree, (node) => {
      if (node.type === 'image' && typeof node.url === 'string') {
        node.url = contentImageUrl(node.url);
      }
      if (
        node.type === 'definition' &&
        node.identifier &&
        imageIds.has(String(node.identifier).toLowerCase()) &&
        typeof node.url === 'string'
      ) {
        node.url = contentImageUrl(node.url);
      }
      if (node.type === 'html' && typeof node.value === 'string') {
        node.value = rewriteHtmlImageSrcs(node.value);
      }
    });
  };
}

/** Rehype: img elements and any raw HTML that survived remark. */
export function rehypeContentImages() {
  return (tree) => {
    walk(tree, (node) => {
      if (node.type === 'element' && node.tagName === 'img' && node.properties && typeof node.properties.src === 'string') {
        node.properties.src = contentImageUrl(node.properties.src);
      }
      if (node.type === 'raw' && typeof node.value === 'string') {
        node.value = rewriteHtmlImageSrcs(node.value);
      }
    });
  };
}
