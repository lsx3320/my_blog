import type { APIRoute } from 'astro';

export const prerender = false;

// List images from R2
export const GET: APIRoute = async ({ locals }) => {
  const env = locals.runtime.env;
  const r2 = env.R2 as R2Bucket;

  try {
    const listed = await r2.list({ prefix: 'gallery/' });
    const images = listed.objects.map(obj => ({
      key: obj.key,
      size: obj.size,
      uploaded: obj.uploaded,
      etag: obj.etag,
    }));

    return new Response(JSON.stringify({ images }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to list images' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

// Upload image to R2
export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const r2 = env.R2 as R2Bucket;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const category = formData.get('category') as string || 'uncategorized';

    if (!file) {
      return new Response(JSON.stringify({ error: 'No file provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const key = `gallery/${category}/${Date.now()}-${file.name}`;
    const buffer = await file.arrayBuffer();

    await r2.put(key, buffer, {
      httpMetadata: {
        contentType: file.type,
        cacheControl: 'public, max-age=31536000',
      },
    });

    return new Response(JSON.stringify({ success: true, key }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to upload image' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

// Delete image from R2
export const DELETE: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const r2 = env.R2 as R2Bucket;

  try {
    const { key } = await request.json();

    if (!key) {
      return new Response(JSON.stringify({ error: 'No key provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await r2.delete(key);

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to delete image' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
