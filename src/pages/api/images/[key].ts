import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
  const env = locals.runtime.env;
  const r2 = env.R2 as R2Bucket;
  const key = params.key;

  if (!key) {
    return new Response('Missing key', { status: 400 });
  }

  try {
    const object = await r2.get(`gallery/${key}`);

    if (!object) {
      return new Response('Image not found', { status: 404 });
    }

    const headers = new Headers();
    headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
    headers.set('Cache-Control', 'public, max-age=31536000');
    headers.set('ETag', object.etag);

    return new Response(object.body, { headers });
  } catch (error) {
    return new Response('Internal server error', { status: 500 });
  }
};
