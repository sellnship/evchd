/**
 * Bilingual (English + simple Hindi) support.
 *
 * English lives at the site root (/...); Hindi lives under /hi/... mirroring the
 * same structure. Page chrome (nav, footer, toggle) and listing copy come from
 * the `ui` dictionary below. Article bodies come from the content collections,
 * filtered by their `lang` frontmatter (en at root, hi under <collection>/hi/).
 */

import { authors } from './data/types';

export type Lang = 'en' | 'hi';
export const defaultLang: Lang = 'en';
export const languages: Record<Lang, string> = { en: 'English', hi: 'हिंदी' };

/** UI strings. Hindi is deliberately simple, conversational (बोलचाल की हिंदी). */
export const ui = {
  en: {
    'nav.guides': 'Guides',
    'nav.compare': 'Comparisons',
    'nav.calculators': 'Calculators',
    'nav.news': 'News',
    'nav.about': 'About',
    'nav.editorial': 'Editorial policy',
    'nav.contact': 'Contact',
    'nav.glossary': 'Glossary',
    'nav.home': 'Home',
    'nav.primary': 'Primary',
    'toggle.label': 'हिंदी',
    'toggle.aria': 'इस पेज को हिंदी में पढ़ें — read this page in Hindi',
    'menu.open': 'Open menu',
    'menu.close': 'Close menu',
    'footer.tagline': 'Independent, local electric-mobility guidance for Chandigarh, Mohali and Panchkula.',
    'footer.bottom': "© {year} EV Chandigarh · An independent publication · We don't sell vehicles",
    'article.independence': "Independent editorial — EV Chandigarh doesn't sell vehicles. We explain the rules and the numbers, then point you to where to buy.",
    'cta.heading': 'Done reading? Ready to buy?',
    'cta.body': "We don't sell here — but we know who does. Get current prices, book a test ride, or work out your own numbers first.",
    'cta.prices': 'See prices & book on evchandigarh.com',
    'cta.whatsapp': 'Ask on WhatsApp',
    'cta.whatsappAria': 'Chat with EV Chandigarh on WhatsApp (opens WhatsApp in a new tab)',
    'cta.calculator': 'Run the numbers',
  },
  hi: {
    'nav.guides': 'गाइड',
    'nav.compare': 'तुलना',
    'nav.calculators': 'कैलकुलेटर',
    'nav.news': 'खबरें',
    'nav.about': 'हमारे बारे में',
    'nav.editorial': 'संपादकीय नीति',
    'nav.contact': 'संपर्क',
    'nav.glossary': 'शब्दावली',
    'nav.home': 'होम',
    'nav.primary': 'मुख्य',
    'toggle.label': 'EN',
    'toggle.aria': 'Read this page in English — इस पेज को अंग्रेज़ी में पढ़ें',
    'menu.open': 'मेन्यू खोलें',
    'menu.close': 'मेन्यू बंद करें',
    'footer.tagline': 'Chandigarh, Mohali और Panchkula के लिए स्वतंत्र, लोकल EV जानकारी।',
    'footer.bottom': '© {year} EV Chandigarh · एक स्वतंत्र प्रकाशन · हम गाड़ियाँ नहीं बेचते',
    'article.independence': 'स्वतंत्र संपादकीय — EV Chandigarh गाड़ियाँ नहीं बेचता। हम नियम और हिसाब समझाते हैं, फिर बताते हैं कि कहाँ से खरीदें।',
    'cta.heading': 'पढ़ लिया? खरीदने के लिए तैयार हैं?',
    'cta.body': 'हम यहाँ नहीं बेचते — पर जानते हैं कौन बेचता है। ताज़ा कीमतें लें, टेस्ट राइड बुक करें, या पहले अपना हिसाब लगाएँ।',
    'cta.prices': 'कीमतें देखें — evchandigarh.com पर',
    'cta.whatsapp': 'WhatsApp पर पूछें',
    'cta.whatsappAria': 'WhatsApp पर EV Chandigarh से बात करें (नए टैब में WhatsApp खुलेगा)',
    'cta.calculator': 'अपना हिसाब लगाएँ',
  },
} as const;

export type UIKey = keyof (typeof ui)['en'];

export function useTranslations(lang: Lang) {
  return function t(key: UIKey): string {
    return (ui[lang] as Record<string, string>)[key] ?? (ui.en as Record<string, string>)[key];
  };
}

/** Normalise a pathname (drop a trailing slash, except root). */
const norm = (p: string): string => (p !== '/' && p.endsWith('/') ? p.replace(/\/+$/, '') : p);

/** Which language does this URL belong to? Anything under /hi is Hindi. */
export function getLangFromUrl(url: URL): Lang {
  const p = norm(url.pathname);
  return p === '/hi' || p.startsWith('/hi/') ? 'hi' : 'en';
}

/** The English-root equivalent of any pathname (strips a leading /hi). */
export function toEnPath(pathname: string): string {
  const p = norm(pathname);
  if (p === '/hi') return '/';
  if (p.startsWith('/hi/')) return p.slice(3) || '/';
  return p;
}

/** The Hindi equivalent of any pathname (prefixes /hi). */
export function toHiPath(pathname: string): string {
  const en = toEnPath(pathname);
  return en === '/' ? '/hi/' : '/hi' + en;
}

/** Localise an English-root path (e.g. '/guides') for the given language. */
export function localizePath(path: string, lang: Lang): string {
  return lang === 'hi' ? toHiPath(path) : norm(path);
}

/** The counterpart-language URL for the current page (for the toggle + hreflang). */
export function counterpartPath(pathname: string, lang: Lang): string {
  return lang === 'hi' ? toEnPath(pathname) : toHiPath(pathname);
}

/* ---------------------------------------------------------------------------
 * WhatsApp CTA — single source of truth for every WhatsApp link on the site.
 * Number comes from authors.json (country code, no +/spaces/dashes), and the
 * pre-filled message is language-correct and percent-encoded so Devanagari
 * arrives intact. Falls back to the .com site if the number isn't set.
 * ------------------------------------------------------------------------- */
const WA_DIGITS = String(authors.publisher.whatsapp || '').replace(/\D/g, '');
const WA_MESSAGE: Record<Lang, string> = {
  en: "Hi, I read your guide on EV Chandigarh and I'd like to know more about electric scooters.",
  hi: 'नमस्ते EV Chandigarh, मैंने आपकी गाइड पढ़ी — इलेक्ट्रिक स्कूटर के बारे में और जानकारी चाहिए।',
};

/** Build the canonical WhatsApp deep link for the given page language. */
export function whatsappHref(lang: Lang = defaultLang): string {
  if (WA_DIGITS.length < 8) return 'https://evchandigarh.com';
  const msg = WA_MESSAGE[lang] ?? WA_MESSAGE.en;
  return `https://wa.me/${WA_DIGITS}?text=${encodeURIComponent(msg)}`;
}
