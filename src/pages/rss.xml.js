import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

// RSS feed → powers the Discover "Follow" button and the BaseLayout RSS link.
// Pulls guides + news + compare, newest first.
export async function GET(context) {
  const collections = ['guides', 'news', 'compare'];
  const items = [];
  for (const name of collections) {
    const entries = await getCollection(name, ({ data }) => !data.draft);
    for (const e of entries) {
      items.push({
        title: e.data.title,
        description: e.data.description,
        pubDate: e.data.datePublished,
        link: `/${name}/${e.id}/`,
        categories: e.data.tags,
      });
    }
  }
  items.sort((a, b) => +b.pubDate - +a.pubDate);

  return rss({
    title: 'EV Chandigarh',
    description: 'Independent, local electric-mobility guidance for Chandigarh, Mohali and Panchkula.',
    site: context.site,
    items,
    customData: '<language>en-in</language>',
  });
}
