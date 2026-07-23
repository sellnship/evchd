/**
 * Resolve the counterpart-language URL for a page — the single source of truth
 * shared by the header language toggle AND the <head> hreflang alternates, so
 * the human signal and the machine signal can never disagree.
 *
 * Static pages (home, about, contact, section listings, calculators…) exist in
 * both languages, so their counterpart always exists. Content DETAIL pages
 * (/guides/<slug>, /compare/<slug>, …) may not be translated yet:
 *   - exists: true  → href is the exact counterpart URL (safe for hreflang).
 *   - exists: false → href is the counterpart SECTION listing (a safe link for
 *                     the human toggle, but NOT a valid hreflang target — callers
 *                     must omit the alternate when exists is false).
 */
import { getCollection } from 'astro:content';
import { toEnPath, localizePath, type Lang } from '../i18n';

const CONTENT_SECTIONS = ['guides', 'compare', 'news', 'glossary', 'blog'];

export interface Counterpart {
  href: string;
  exists: boolean;
}

export async function resolveCounterpart(pathname: string, lang: Lang): Promise<Counterpart> {
  const otherLang: Lang = lang === 'hi' ? 'en' : 'hi';
  const enPath = toEnPath(pathname);
  const exactHref = localizePath(enPath, otherLang);

  const segs = enPath.split('/').filter(Boolean);
  if (segs.length === 2 && CONTENT_SECTIONS.includes(segs[0])) {
    const [section, slug] = segs;
    const wantId = otherLang === 'hi' ? `hi/${slug}` : slug;
    const entries = await getCollection(section as any, ({ data }: any) => data.lang === otherLang);
    const exists = entries.some((e: any) => e.id === wantId);
    if (!exists) return { href: localizePath(`/${section}`, otherLang), exists: false };
  }
  return { href: exactHref, exists: true };
}
