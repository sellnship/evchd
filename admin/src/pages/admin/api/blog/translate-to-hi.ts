import type { APIRoute } from 'astro';
export const prerender = false;
import { sql, logActivity, type Article } from '../../../../lib/db';
import { complete, getActiveProvider } from '../../../../lib/llm';

function stripFence(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fence ? fence[1] : text).trim();
}

/** Creates the Hindi counterpart of an English article via AI translation. */
export const POST: APIRoute = async ({ request }) => {
  let id = '';
  let provider: string | undefined;
  try {
    const json = await request.json();
    id = String(json.id ?? '');
    provider = json.provider ? String(json.provider) : undefined;
  } catch {
    // ignore
  }

  try {
    if (!id) throw new Error('article id is required');
    const q = sql();
    const rows = (await q`SELECT * FROM articles WHERE id = ${Number(id)}`) as unknown as Article[];
    if (!rows.length) throw new Error(`article id ${id} not found`);
    const en = rows[0];
    if (en.lang !== 'hi' && en.lang !== 'en') throw new Error('unknown language');
    if (en.lang !== 'en') throw new Error('Translate to Hindi is only applicable to English articles');

    const existing = (await q`
      SELECT id FROM articles WHERE slug = ${en.slug} AND lang = 'hi'
    `) as { id: number }[];
    if (existing.length) throw new Error('A Hindi version of this article already exists');

    const activeProv = provider || (await getActiveProvider());

    const prompt = `You are a professional translator and automotive content localizer for EV Chandigarh (evchandigarh.in), an independent local editorial site for the Chandigarh Tricity (Chandigarh, Mohali, Panchkula).

Translate and adapt the following verified English article into natural, conversational Hindi (बोलचाल की हिंदी) for readers in Chandigarh/Mohali:

English Title:
${en.title}

English Meta Description:
${en.description}

English Article Content (Markdown):
${en.body_md}

CRITICAL RULES:
1. FAITHFUL TRANSLATION & LOCALIZATION: Preserve all key sections, headings, bullet points, warnings, facts, and conclusions. Do NOT invent unrelated facts. Do NOT hallucinate false battery lifespans (e.g. 1-2 years — modern low-speed lithium batteries last 3-5 years / 1000-1500 cycles). Do NOT confuse burnt odors with hearing noises. Do NOT mention tyres in battery safety.
2. LANGUAGE & TONE: Write in natural, respectful, conversational Hindi (बोलचाल की हिंदी) — how people in Tricity actually speak. Keep familiar technical terms in English / Latin script (e.g., scooter, battery, charging, RTO, kWh, CMVR, low-speed).
3. STRUCTURE: Match the headings and bullet structure of the English article. Do NOT include an H1 heading (the site renders the title separately). Start directly with the translated opening paragraph.
4. METADATA: You must output a valid JSON object with the exact keys:
- "title": translated Hindi title
- "description": translated Hindi meta description (concise, maximum 155 characters)
- "body_md": translated Hindi markdown body

Reply ONLY with the raw JSON object. No other text or markdown fences.`;

    const rawResponse = await complete(prompt, { maxTokens: 6000, provider: activeProv });
    const cleanJson = stripFence(rawResponse);

    let parsed: { title?: string; description?: string; body_md?: string } = {};
    try {
      parsed = JSON.parse(cleanJson);
    } catch {
      const titleMatch = cleanJson.match(/"title"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
      const descMatch = cleanJson.match(/"description"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
      const bodyMatch = cleanJson.match(/"body_md"\s*:\s*"([\s\S]*?)"(?:\s*,\s*"|\s*})/);
      parsed = {
        title: titleMatch ? JSON.parse(`"${titleMatch[1]}"`) : undefined,
        description: descMatch ? JSON.parse(`"${descMatch[1]}"`) : undefined,
        body_md: bodyMatch ? JSON.parse(`"${bodyMatch[1]}"`) : undefined,
      };
    }

    const title = (parsed.title || en.title).trim();
    let description = (parsed.description || en.description).trim();
    if (description.length > 158) {
      description = description.slice(0, 155).replace(/\s+\S*$/, '') + '…';
    }
    const body_md = (parsed.body_md || cleanJson)
      .replace(/^#\s.*$/m, '')
      .trim();

    if (body_md.length < 300) {
      throw new Error('Generated Hindi translation was suspiciously short');
    }

    const inserted = (await q`
      INSERT INTO articles (slug, lang, title, description, category, hero_image, author, reviewed_by, tags, body_md, status, source)
      VALUES (${en.slug}, 'hi', ${title}, ${description}, ${en.category}, ${en.hero_image}, ${en.author}, ${en.reviewed_by}, ${en.tags}, ${body_md}, 'draft', 'ai')
      RETURNING id
    `) as { id: number }[];
    const newId = inserted[0].id;

    await logActivity('article.translated_to_hi', { id: newId, slug: en.slug, from: en.id });

    return new Response(JSON.stringify({ ok: true, id: newId }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err?.message ?? 'Translation failed' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
};
