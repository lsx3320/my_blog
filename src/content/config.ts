import { defineCollection, z } from 'astro:content';

const posts = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    category: z.string(),
    tags: z.array(z.string()),
    draft: z.boolean().optional(),
    image: z.string().optional(),
  }),
});

const moments = defineCollection({
  type: 'content',
  schema: z.object({
    date: z.coerce.date(),
    images: z.array(z.string()).optional(),
    likes: z.number().default(0),
    location: z.string().optional(),
  }),
});

export const collections = { posts, moments };
