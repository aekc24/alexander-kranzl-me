import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const postSchema = z.object({
  title: z.string(),
  description: z.string(),
  pubDate: z.coerce.date(),
  updatedDate: z.coerce.date().optional(),
  tags: z.array(z.string()).default([]),
  draft: z.boolean().default(false),
  image: z.string().optional(),
  audio: z.boolean().default(true),
  /** Language of this post (BCP 47, e.g. 'es') when it differs from siteConfig.lang */
  lang: z.string().optional(),
});

// Posts: `slug.md` or `slug/index.md`. Files with a language suffix belong to `translations`.
const blog = defineCollection({
  loader: glob({ pattern: ['**/[^_]*.{md,mdx}', '!**/*.*.{md,mdx}'], base: './src/content/blog' }),
  schema: postSchema,
});

// Translations of a post: `slug.es.md` or `slug/index.es.md` -> id `slug/es`, served at /blog/slug/es
const translations = defineCollection({
  loader: glob({
    pattern: '**/[^_]*.*.{md,mdx}',
    base: './src/content/blog',
    generateId: ({ entry }) => entry.replace(/(\/index)?\.([^./]+)\.mdx?$/, '/$2'),
  }),
  schema: postSchema.extend({ lang: z.string() }),
});

const projects = defineCollection({
  loader: glob({ pattern: '**/[^_]*.{md,mdx}', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    category: z.string().default('General'),
    tags: z.array(z.string()).default([]),
    stars: z.number().default(0),
    repoUrl: z.string().optional(),
    demoUrl: z.string().optional(),
    emoji: z.string().default('📦'),
    featured: z.boolean().default(false),
  })
});

export const collections = { blog, translations, projects };
