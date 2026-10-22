import type { APIRoute } from 'astro';
export const prerender = false;
import { complete, getActiveProvider } from '../../../../lib/llm';

/** Suggests a one-sentence photographic SCENE for this post's content, using
 * whatever title/body is currently in the editor (not the saved DB row) —
 * so it reflects in-progress edits. genhero.ts / genimage.ts add the vehicle
 * & style rules on top of this scene. */
export const POST: APIRoute = async ({ request }) => {
  try {
    const json = await request.json();
    const title = String(json.title ?? '').trim();
    const description = String(json.description ?? '').trim();
    const category = String(json.category ?? '').trim();
    const body_md = String(json.body_md ?? '').trim();
    const provider = json.provider ? String(json.provider) : undefined;
    if (!title && !body_md) throw new Error('write a title or some body text first');

    const activeProv = provider || (await getActiveProvider());

    const prompt = `You are an editorial photo director for evchandigarh.in, a local site about low-speed electric scooters in the Chandigarh Tricity (Chandigarh, Mohali, Panchkula), India.

Based on this blog post, describe ONE photographic SCENE for its hero image — real people/place, no style words, no camera jargon (a separate step adds style, lighting and vehicle rules). One sentence only.

Title: ${title}
Category: ${category || '(none)'}
Meta description: ${description || '(none)'}
Body excerpt:
${body_md.slice(0, 3000)}

Reply with ONLY the one-sentence scene description — no quotes, no markdown, no preamble.`;

    const raw = await complete(prompt, { maxTokens: 300, provider: activeProv });
    const scene = raw.trim().replace(/^["'“]+|["'”]+$/g, '').replace(/\n+/g, ' ');
    if (!scene) throw new Error('model returned an empty scene');

    return new Response(JSON.stringify({ ok: true, scene }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message ?? 'suggestion failed' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
};
