import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { blogLoader } from './lib/blog-loader.mjs';

// Shared frontmatter for every editorial collection.
const base = z.object({
  title: z.string(),
  description: z.string(),
  category: z.string(),
  lang: z.enum(['en', 'hi']).default('en'), // 'hi' files live under <collection>/hi/ and route under /hi/
  heroImage: z.string(), // public path, e.g. /images/<slug>-hero.webp
  author: z.string().default('rajinder-singh'), // default byline → src/data/authors.json
  reviewedBy: z.string().default('rajinder-singh'), // default reviewer → src/data/authors.json
  datePublished: z.coerce.date(),
  dateModified: z.coerce.date().optional(),
  tags: z.array(z.string()).default([]),
  draft: z.boolean().default(false),
});

const guides = defineCollection({
  loader: glob({ pattern: '**/[^_]*.md', base: './src/content/guides' }),
  schema: base,
});

const news = defineCollection({
  loader: glob({ pattern: '**/[^_]*.md', base: './src/content/news' }),
  schema: base,
});

// Comparisons add an optional list of model slugs (→ src/data/models.json),
// which ArticleLayout renders as a <ModelCompare> spec table.
const compare = defineCollection({
  loader: glob({ pattern: '**/[^_]*.md', base: './src/content/compare' }),
  schema: base.extend({ models: z.array(z.string()).optional() }),
});

const glossary = defineCollection({
  loader: glob({ pattern: '**/[^_]*.md', base: './src/content/glossary' }),
  schema: base,
});

// Blog is the one DB-backed collection: rows come from Neon Postgres at build
// time (written by the admin app / AI engine DB mode), not markdown in git.
const blog = defineCollection({
  loader: blogLoader(),
  schema: base,
});

export const collections = { guides, news, compare, glossary, blog };
