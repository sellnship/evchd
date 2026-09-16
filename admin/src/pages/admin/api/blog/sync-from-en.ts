import type { APIRoute } from 'astro';
export const prerender = false;
import { sql, logActivity, type Article } from '../../../../lib/db';
import { complete, getActiveProvider } from '../../../../lib/llm';

function stripFence(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fence ? fence[1] : text).trim();
}

export const POST: APIRoute = async ({ request, redirect }) => {
  let id = '';
  let provider: string | undefined;
  let isJsonRequest = false;

  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    isJsonRequest = true;
    try {
      const json = await request.json();
      id = String(json.id ?? '');
      provider = json.provider ? String(json.provider) : undefined;
    } catch {
      // ignore
    }
  } else {
    const form = await request.formData();
    id = String(form.get('id') ?? '');
    provider = form.get('provider') ? String(form.get('provider')) : undefined;
  }

  try {
    if (!id) throw new Error('article id is required');
    const q = sql();
    const rows = (await q`SELECT * FROM articles WHERE id = ${Number(id)}`) as unknown as Article[];
    if (!rows.length) throw new Error(`article id ${id} not found`);
    const hiArticle = rows[0];

    if (hiArticle.lang !== 'hi') {
      throw new Error('Regeneration from English is only applicable to Hindi articles');
    }

    const enRows = (await q`
      SELECT * FROM articles WHERE slug = ${hiArticle.slug} AND lang = 'en'
    `) as unknown as Article[];
    if (!enRows.length) {
      throw new Error(`English counterpart not found for slug "${hiArticle.slug}"`);
    }
    const en = enRows[0];

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
      // Fallback regex extraction if JSON had minor syntax issues
      const titleMatch = cleanJson.match(/"title"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
      const descMatch = cleanJson.match(/"description"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
      const bodyMatch = cleanJson.match(/"body_md"\s*:\s*"([\s\S]*?)"(?:\s*,\s*"|\s*})/);
      parsed = {
        title: titleMatch ? JSON.parse(`"${titleMatch[1]}"`) : undefined,
        description: descMatch ? JSON.parse(`"${descMatch[1]}"`) : undefined,
        body_md: bodyMatch ? JSON.parse(`"${bodyMatch[1]}"`) : undefined,
      };
    }

    const title = (parsed.title || hiArticle.title).trim();
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

    await q`
      UPDATE articles SET
        title = ${title},
        description = ${description},
        body_md = ${body_md},
        source = 'ai',
        date_modified = now(),
        updated_at = now()
      WHERE id = ${hiArticle.id}
    `;

    await logActivity('article.synced_from_en', { id: hiArticle.id, slug: hiArticle.slug });

    if (isJsonRequest) {
      return new Response(
        JSON.stringify({ ok: true, id: hiArticle.id, title, description, body_md }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    return redirect(`/admin/blog/${hiArticle.id}?saved=1`);
  } catch (err: any) {
    if (isJsonRequest) {
      return new Response(
        JSON.stringify({ ok: false, error: err?.message ?? 'Sync failed' }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      );
    }
    return redirect(`/admin/blog/${id}?err=${encodeURIComponent(err?.message ?? 'Sync failed')}`);
  }
};
