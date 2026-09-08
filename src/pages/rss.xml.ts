import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';

const SITE = 'https://lushixiao.cn';

const escapeXml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

export async function GET(context: APIContext): Promise<Response> {
  const posts = (await getCollection('posts'))
    .filter((post) => !post.data.draft)
    .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());

  const items = posts
    .map((post) => {
      const link = `${SITE}/posts/${post.id}`;
      return [
        '    <item>',
        `      <title>${escapeXml(post.data.title)}</title>`,
        `      <link>${link}</link>`,
        `      <guid isPermaLink="true">${link}</guid>`,
        `      <pubDate>${post.data.pubDate.toUTCString()}</pubDate>`,
        `      <description>${escapeXml(post.data.description)}</description>`,
        '    </item>',
      ].join('\n');
    })
    .join('\n');

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    '    <title>后生仔的博客</title>',
    '    <link>https://lushixiao.cn/</link>',
    '    <description>卢仕潇的个人博客：技术的来龙去脉，生活的所见所想。</description>',
    '    <language>zh-cn</language>',
    '    <atom:link href="https://lushixiao.cn/rss.xml" rel="self" type="application/rss+xml" />',
    `    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>`,
    items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');

  return new Response(xml, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  });
}
