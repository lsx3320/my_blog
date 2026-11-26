import test from 'node:test';
import assert from 'node:assert/strict';
import { contentImageUrl, remarkContentImages, rewriteHtmlImageSrcs, IMAGE_BASE_URL } from '../src/lib/image-cdn.mjs';

test('content images keep their path and gain the R2 origin', () => {
  assert.equal(IMAGE_BASE_URL, 'https://img.lushixiao.cn');
  assert.equal(
    contentImageUrl('/posts/transformer/transformer_arch.png'),
    'https://img.lushixiao.cn/posts/transformer/transformer_arch.png',
  );
  assert.equal(
    contentImageUrl('/gallery/故宫.webp'),
    'https://img.lushixiao.cn/gallery/故宫.webp',
  );
  assert.equal(
    contentImageUrl('/posts/larkcli/03-真实调用.png'),
    'https://img.lushixiao.cn/posts/larkcli/03-真实调用.png',
  );
  assert.equal(contentImageUrl('/og-default.png'), 'https://img.lushixiao.cn/og-default.png');
  assert.equal(
    contentImageUrl('https://img.lushixiao.cn/gallery/故宫.webp'),
    'https://img.lushixiao.cn/gallery/故宫.webp',
  );
});

test('page, audio, and favicon URLs are not sent to the image host', () => {
  assert.equal(contentImageUrl('/posts/transformer-guide'), '/posts/transformer-guide');
  assert.equal(contentImageUrl('/gallery'), '/gallery');
  assert.equal(contentImageUrl('/gallery#travel'), '/gallery#travel');
  assert.equal(contentImageUrl('/favicon.svg'), '/favicon.svg');
  assert.equal(contentImageUrl('/favicon.ico'), '/favicon.ico');
  assert.equal(contentImageUrl('/audio/xiangsi-ersheng/1.mp3'), '/audio/xiangsi-ersheng/1.mp3');
  assert.equal(contentImageUrl('/bgm.mp3'), '/bgm.mp3');
  assert.equal(contentImageUrl('https://example.com/a.png'), 'https://example.com/a.png');
});

test('markdown and raw HTML images are rewritten without touching links', () => {
  const html = '<figure><img src="/posts/da-bing-solo-motorcycle-travel/can-am-spyder-ride.webp" alt="ride" /><figcaption><a href="https://can-am.brp.com/on-road/us/en/models/3-wheel-vehicles.html">BRP</a></figcaption></figure>';
  const rewritten = rewriteHtmlImageSrcs(html);
  assert.match(rewritten, /src="https:\/\/img\.lushixiao\.cn\/posts\/da-bing-solo-motorcycle-travel\/can-am-spyder-ride\.webp"/);
  assert.match(rewritten, /href="https:\/\/can-am\.brp\.com\//);
  assert.equal(rewriteHtmlImageSrcs(rewritten), rewritten);

  const tree = {
    type: 'root',
    children: [
      { type: 'image', url: '/posts/transformer/transformer_arch.png', alt: 'arch' },
      { type: 'image', url: '/gallery/故宫.webp', alt: '故宫' },
      { type: 'link', url: '/posts/transformer-guide', children: [{ type: 'text', value: '文章' }] },
      { type: 'html', value: '<img src=\'/posts/enshi-baipa/1794060441497.jpg\' alt="帕" />' },
      { type: 'imageReference', identifier: 'diagram', label: 'diagram', referenceType: 'full' },
      { type: 'definition', identifier: 'diagram', url: '/gallery/tau-law/rc-circuit.svg' },
      { type: 'definition', identifier: 'article', url: '/posts/transformer-guide' },
    ],
  };
  remarkContentImages()(tree);
  assert.equal(tree.children[0].url, 'https://img.lushixiao.cn/posts/transformer/transformer_arch.png');
  assert.equal(tree.children[1].url, 'https://img.lushixiao.cn/gallery/故宫.webp');
  assert.equal(tree.children[2].url, '/posts/transformer-guide');
  assert.match(tree.children[3].value, /src='https:\/\/img\.lushixiao\.cn\/posts\/enshi-baipa\/1794060441497\.jpg'/);
  assert.equal(tree.children[5].url, 'https://img.lushixiao.cn/gallery/tau-law/rc-circuit.svg');
  assert.equal(tree.children[6].url, '/posts/transformer-guide');
});
