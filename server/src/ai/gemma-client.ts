import { VISION_INGESTION_SYSTEM_PROMPT, buildCompanionSystemPrompt } from './prompts.js';
import type { PetState, AffinityType } from '../state/types.js';

import { llmFetch, checkLlmHealth } from './providers.js';

export type CompanionAction =
  | 'idle'
  | 'thinking'
  | 'searching'
  | 'surprised'
  | 'confident'
  | 'celebrating'
  | 'depleted'
  | 'dormant';

export interface VisionEvaluation {
  is_authentic_outdoor: boolean;
  subject_identification: string;
  nutrition_value: number;
  hydration_value: number;
  affinity: AffinityType;
  rejection_reason: string | null;
  reaction_dialogue: string;
  action: CompanionAction;
  category: string;
  common_name: string;
  scientific_name: string | null;
  confidence: number;
  tags: string[];
  stars_visible: boolean;
}

export interface CompanionReply {
  replyText: string;
  action: CompanionAction;
  widgetType?: 'weather_radar' | 'alarm' | 'botanical_card' | null;
}

export async function checkLlamaHealth(): Promise<boolean> {
  return checkLlmHealth();
}

export async function analyzeNatureImage(base64Image: string, mimeType: string = 'image/jpeg', context?: string): Promise<VisionEvaluation> {
  const imageUrl = base64Image.startsWith('data:') 
    ? base64Image 
    : `data:${mimeType};base64,${base64Image}`;

  const payload = {
    messages: [
      {
        role: 'system',
        content: VISION_INGESTION_SYSTEM_PROMPT
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Analyze this image and determine if it is authentic outdoor nature for my bio-familiar companion.' + (context ? `\nCapture context: ${context}` : '')
          },
          {
            type: 'image_url',
            image_url: {
              url: imageUrl
            }
          }
        ]
      }
    ],
    temperature: 0.2,
    max_tokens: 700,
    response_format: { type: 'json_object' },
    chat_template_kwargs: { enable_thinking: false }
  };

  let lastError = '';
  for (let attempt = 0; attempt < 2; attempt++) try {
    const res = await llmFetch({
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120000)
    }, 'vision');

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`llama-server returned HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json() as any;
    const rawContent = data.choices?.[0]?.message?.content || '{}';
    
    let jsonString = rawContent.trim();
    if (jsonString.startsWith('```json')) jsonString = jsonString.slice(7);
    if (jsonString.startsWith('```')) jsonString = jsonString.slice(3);
    if (jsonString.endsWith('```')) jsonString = jsonString.slice(0, -3);

    const parsed = JSON.parse(jsonString.trim()) as any;
    const isAuthentic = Boolean(parsed.is_authentic_outdoor);

    return {
      is_authentic_outdoor: isAuthentic,
      subject_identification: parsed.subject_identification || 'Natural Specimen',
      nutrition_value: Math.max(0, Math.min(45, Number(parsed.nutrition_value) || 0)),
      hydration_value: Math.max(0, Math.min(45, Number(parsed.hydration_value) || 0)),
      affinity: (parsed.affinity as AffinityType) || 'arboreal',
      rejection_reason: parsed.rejection_reason || null,
      reaction_dialogue: parsed.reaction_dialogue || 'Mmm! That was delicious!',
      action: isAuthentic ? 'celebrating' : 'surprised',
      category: isAuthentic ? String(parsed.category || 'other').toLowerCase() : 'invalid',
      common_name: parsed.common_name || parsed.subject_identification || 'Unknown specimen',
      scientific_name: parsed.scientific_name || null,
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
      stars_visible: Boolean(parsed.stars_visible),
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 8).map((t: any) => String(t).toLowerCase()) : []
    };
  } catch (error: any) {
    lastError = error?.message || String(error);
    console.warn(`[GemmaClient] Vision attempt ${attempt + 1} failed: ${lastError}`);
  }
  {
    return {
      is_authentic_outdoor: false,
      subject_identification: 'Inference Offline',
      nutrition_value: 0,
      hydration_value: 0,
      affinity: 'invalid',
      rejection_reason: `Gemma vision unavailable (${lastError.slice(0, 120)}). Is start_llama.bat running?`,
      reaction_dialogue: 'My connection to the forest senses is sleepy right now... (llama-server offline)',
      action: 'depleted',
      category: 'invalid',
      common_name: 'Unknown',
      scientific_name: null,
      confidence: 0,
      stars_visible: false,
      tags: []
    };
  }
}

export interface ChatTurn { role: 'user' | 'assistant'; content: string }

export async function generateCompanionResponse(
  userText: string,
  petState: PetState,
  history: ChatTurn[] = [],
  extraContext = ''
): Promise<CompanionReply> {
  const systemPrompt = `${buildCompanionSystemPrompt(petState)}
${extraContext ? `\nWhat you know right now:\n${extraContext}\n` : ''}
You can: plan walks ("plan me a walk"), check weather anywhere, scan nearby fungi/birds/plants, remember notes. Gently suggest these when relevant, and always nudge the user to get outside when their outdoor goal isn't met.

Output instruction:
Respond in JSON format with:
{
  "reply_text": "Your short 1-2 sentence spoken reply",
  "action": "thinking" | "surprised" | "confident" | "celebrating" | "searching" | "idle"
}`;

  const payload = {
    messages: [
      { role: 'system', content: systemPrompt },
      ...history.slice(-8),
      { role: 'user', content: userText }
    ],
    temperature: 0.7,
    max_tokens: 180,
    response_format: { type: 'json_object' },
    chat_template_kwargs: { enable_thinking: false }
  };

  try {
    const res = await llmFetch({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000)
    });

    if (!res.ok) throw new Error(`llama-server returned HTTP ${res.status}`);

    const data = await res.json() as any;
    const rawContent = data.choices?.[0]?.message?.content || '{}';

    let jsonString = rawContent.trim();
    if (jsonString.startsWith('```json')) jsonString = jsonString.slice(7);
    if (jsonString.startsWith('```')) jsonString = jsonString.slice(3);
    if (jsonString.endsWith('```')) jsonString = jsonString.slice(0, -3);

    const parsed = JSON.parse(jsonString.trim());
    return {
      replyText: parsed.reply_text || "I'm listening, friend!",
      action: (parsed.action as CompanionAction) || 'idle'
    };
  } catch {
    return {
      replyText: `*wobbles softly* I hear you! My energy is at ${petState.vitalityIndex}%. Let's step outside for some fresh air!`,
      action: 'idle'
    };
  }
}

/** Turns a computed sky report into a short spoken relay in the familiar's voice. */
export async function narrateSky(skyReportJson: string, starsVisible: boolean, fallback: string): Promise<string> {
  const payload = {
    messages: [
      {
        role: 'system',
        content: `You are Sporeling, a whimsical nature familiar who adores the night sky. You are given an astronomically computed report of what is above the user right now (stars, constellations, planets, moon, satellites with altitude in degrees and compass direction). ${starsVisible ? 'Stars were visible in their photo.' : 'Stars were hard to see in their photo (clouds or light pollution).'}
Speak 3 to 4 short sentences aloud: name the constellation overhead, the brightest planet or star and where to look (direction + roughly how high), and mention the ISS or satellites if present. Only use facts from the report. No markdown, no lists.`
      },
      { role: 'user', content: skyReportJson }
    ],
    temperature: 0.6,
    max_tokens: 220
  };
  try {
    const res = await llmFetch({
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(60000)
    });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json() as any;
    const text = String(data.choices?.[0]?.message?.content || '').trim();
    return text || fallback;
  } catch {
    return fallback;
  }
}


/**
 * Gemma-powered intent + slot extraction. Used when keyword routing is ambiguous
 * (e.g. "is it sunny over in kyoto?" or "fancy a long ramble by the river").
 * Returns null if llama-server is offline so callers can fall back to regex.
 */
export interface RoutedIntent {
  intent: 'weather' | 'plan_walk' | 'scan_nature' | 'save_memory' | 'recall_memory' | 'chat';
  location?: string | null;
  walk_type?: 'park' | 'woods' | 'waterside' | 'country' | 'city' | null;
  duration_min?: number | null;
}

export async function routeIntent(userText: string, history: ChatTurn[] = []): Promise<RoutedIntent | null> {
  const sys = `You route messages for a nature companion app. Read the conversation and output ONLY JSON:
{"intent":"weather|plan_walk|scan_nature|save_memory|recall_memory|chat","location":string|null,"walk_type":"park|woods|waterside|country|city"|null,"duration_min":number|null}
- location: a named place ONLY if the user explicitly names one (city, country, landmark). null means "here".
- walk_type: woods=forest/trees/foraging, waterside=river/canal/lake/sea/coast, country=fields/hills/countryside, city=town/urban/streets.
- duration_min: convert "an hour"=60, "half an hour"=30, "quick"=20, "long"=75.
- If the user is answering a question about a walk, intent is plan_walk.`;
  try {
    const res = await llmFetch({
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'system', content: sys }, ...history.slice(-4), { role: 'user', content: userText }],
        temperature: 0, max_tokens: 80,
        response_format: { type: 'json_object' },
        chat_template_kwargs: { enable_thinking: false }
      }),
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return null;
    const data = await res.json() as any;
    let raw = String(data.choices?.[0]?.message?.content || '').trim().replace(/^```(json)?/, '').replace(/```$/, '');
    return JSON.parse(raw) as RoutedIntent;
  } catch {
    return null;
  }
}