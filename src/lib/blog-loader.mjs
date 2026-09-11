/**
 * Content-layer loader for the `blog` collection — the only collection whose
 * source of truth is Neon Postgres (managed by the standalone admin app), not
 * markdown in git. Runs at BUILD time; the site stays fully static. Publishing
 * from the admin fires a Vercel Deploy Hook which re-runs this loader.
 *
 * Entry-id convention mirrors the glob() collections so counterpart.ts and the
 * hi/ page mirrors work unchanged: EN id = <slug>, HI id = hi/<slug>.
 *
 * Failure semantics (deliberate):
 *   - DATABASE_URL missing → warn + empty collection, build stays green
 *     (local dev / forks without a DB must still build).
 *   - DATABASE_URL set but query fails → THROW and fail the build. A silent
 *     empty result would un-publish every blog URL from the sitemap/RSS on the
 *     next unrelated deploy.
 */
import { neon } from '@neondatabase/serverless';

export function blogLoader() {
  return {
    name: 'blog-loader',
    load: async ({ store, parseData, generateDigest, renderMarkdown, logger }) => {
      const url = process.env.DATABASE_URL;
      if (!url) {
        logger.warn('DATABASE_URL not set — blog collection will be empty.');
        store.clear();
        return;
      }

      const sql = neon(url);
      const rows = await sql`
        SELECT slug, lang, title, description, category, hero_image, image_alt, author,
               reviewed_by, date_published, date_modified, tags, body_md
        FROM articles
        WHERE status = 'published'
        ORDER BY date_published DESC`;

      store.clear();
      for (const r of rows) {
        const id = r.lang === 'hi' ? `hi/${r.slug}` : r.slug;
        const data = await parseData({
          id,
          data: {
            title: r.title,
            description: r.description,
            category: r.category,
            lang: r.lang,
            heroImage: r.hero_image,
            imageAlt: r.image_alt || undefined,
            author: r.author,
            reviewedBy: r.reviewed_by,
            datePublished: r.date_published,
            dateModified: r.date_modified ?? undefined,
            tags: r.tags,
            draft: false,
          },
        });
        store.set({
          id,
          data,
          body: r.body_md,
          rendered: await renderMarkdown(r.body_md),
          digest: generateDigest({ ...data, body: r.body_md }),
        });
      }
      logger.info(`Loaded ${rows.length} published blog article(s) from Neon.`);
    },
  };
}
