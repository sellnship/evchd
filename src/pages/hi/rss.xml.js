import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

// Hindi RSS feed (/hi/rss.xml) — Hindi articles only, newest first.
// Mirrors the English feed; links point under /hi/. inLanguage: hi-IN.
export async function GET(context) {
  const collections = ['guides', 'news', 'compare'];
  const items = [];
  for (const name of collections) {
    const entries = await getCollection(name, ({ data }) => !data.draft && data.lang === 'hi');
    for (const e of entries) {
      const slug = e.id.replace(/^hi\//, '');
      items.push({
        title: e.data.title,
        description: e.data.description,
        pubDate: e.data.datePublished,
        link: `/hi/${name}/${slug}/`,
        categories: e.data.tags,
      });
    }
  }
  items.sort((a, b) => +b.pubDate - +a.pubDate);

  return rss({
    title: 'EV Chandigarh — हिंदी',
    description: 'Chandigarh, Mohali और Panchkula के लिए स्वतंत्र, लोकल EV जानकारी — हिंदी में।',
    // Channel <link> should be the Hindi home, not the English root. Item links
    // are root-absolute (/hi/...), so they still resolve correctly against this.
    site: new URL('/hi/', context.site),
    items,
    customData: '<language>hi-in</language>',
  });
}
