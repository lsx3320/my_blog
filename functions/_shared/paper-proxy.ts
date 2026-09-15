/**
 * 论文阅读器反向代理（Cloudflare Pages Function）
 *
 * 背景：paper-reader 跑在本地机器上，通过 Cloudflare 快速隧道对外提供服务；
 * 快速隧道域名为随机的 *.trycloudflare.com，在部分网络（尤其国内手机）会被拦截。
 * 这里把请求统一挂到博客自己的域名下（lushixiao.cn/paper-app/），
 * 由 Cloudflare 内部转发到隧道，既能稳定访问，地址也永久固定。
 *
 * 隧道地址每次重启会变，因此运行时从 jsonbin 读取（带 60 秒内存缓存）。
 */

const BIN_ID = '6aa92c68ac6210605acfe457';
const MASTER_KEY = '$2a$10$Iyqn3eO8f2SOtdwE9A9k1uY7MIXfb5k1Z7pYYkWZW9lYtxc1bJlbi';

export const APP_PREFIX = '/paper-app';
/** 这些路径也属于阅读器自身（它用绝对路径引用静态资源与接口） */
const APP_ABSOLUTE_PATHS = ['/static/', '/api/', '/login'];

let cached: { url: string; at: number } | null = null;

async function resolveTunnelUrl(): Promise<string | null> {
  if (cached && Date.now() - cached.at < 60_000) return cached.url;
  try {
    const res = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, {
      headers: { 'X-Master-Key': MASTER_KEY },
    });
    if (res.ok) {
      const data = (await res.json()) as { record?: { paperUrl?: string } };
      const url = data?.record?.paperUrl;
      if (typeof url === 'string' && url.startsWith('https://')) {
        cached = { url, at: Date.now() };
        return url;
      }
    }
  } catch {
    /* 读取失败时沿用上一次成功的地址 */
  }
  return cached?.url ?? null;
}

export function isProxiedPath(pathname: string): boolean {
  if (pathname === APP_PREFIX || pathname.startsWith(APP_PREFIX + '/')) return true;
  return APP_ABSOLUTE_PATHS.some((p) => pathname.startsWith(p) || pathname === p.replace(/\/$/, ''));
}

const OFFLINE_BODY =
  '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1"><title>论文阅读器离线</title>' +
  '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f5f1;' +
  'font:15px/1.7 -apple-system,"PingFang SC",sans-serif;color:#22201c;text-align:center}' +
  'a{color:#2f5d45}</style></head><body><div>' +
  '<h1 style="font-size:19px;margin:0 0 10px">论文阅读器当前离线</h1>' +
  '<p style="color:#8b857a;margin:0 0 16px">家里的服务没启动，或隧道正在重连。<br>启动后刷新本页即可。</p>' +
  '<a href="/paper">← 返回介绍页</a></div></body></html>';

/** 把请求转发到隧道；隧道不可用时返回离线页 */
export async function proxyToPaper(context: { request: Request; next: () => Promise<Response> }): Promise<Response> {
  const { request, next } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;
  if (!isProxiedPath(pathname)) return next();

  const origin = await resolveTunnelUrl();
  if (!origin) {
    return new Response(OFFLINE_BODY, {
      status: 503,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }

  // /paper-app/xxx → 后端 /xxx（其余路径原样透传）
  let targetPath = pathname;
  if (pathname === APP_PREFIX) targetPath = '/';
  else if (pathname.startsWith(APP_PREFIX + '/')) targetPath = pathname.slice(APP_PREFIX.length);

  const target = new URL(targetPath + url.search, origin);

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('cf-connecting-ip');
  headers.delete('cf-ray');
  headers.set('x-forwarded-host', url.host);
  headers.set('x-forwarded-proto', url.protocol.replace(':', ''));

  const init: RequestInit = { method: request.method, headers, redirect: 'manual' };
  if (request.method !== 'GET' && request.method !== 'HEAD') init.body = request.body;

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), init);
  } catch {
    return new Response(OFFLINE_BODY, {
      status: 503,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }

  const outHeaders = new Headers(upstream.headers);
  // 交给 Cloudflare 重新处理编码与长度，避免双重压缩
  outHeaders.delete('content-encoding');
  outHeaders.delete('content-length');
  outHeaders.delete('transfer-encoding');

  // 后端返回的绝对跳转要改写成博客域名下的路径
  const location = outHeaders.get('location');
  if (location) {
    try {
      const abs = new URL(location, origin);
      if (abs.origin === origin) {
        const p = abs.pathname;
        const staysAbsolute = APP_ABSOLUTE_PATHS.some((prefix) => p.startsWith(prefix)) || p === '/login';
        const nextPath = staysAbsolute ? p : APP_PREFIX + (p === '/' ? '/' : p);
        outHeaders.set('location', nextPath + abs.search);
      }
    } catch {
      /* 非法 Location 原样保留 */
    }
  }

  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: outHeaders });
}
