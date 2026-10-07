/**
 * Pluggable AI engines.
 *
 * - `chat` / `vision`: any OpenAI-compatible /v1/chat/completions endpoint
 *   (llama.cpp, Ollama, LM Studio, vLLM, OpenRouter, OpenAI…). Default: local llama-server + Gemma 4 E2B.
 * - `classifier`: an optional "System 1" zero-shot classifier speaking the Laya-style
 *   /v1/predict schema ({ text, questions: { key: { type: noul|choice|score, … } } }).
 *   When none is configured, the chat LLM answers the same schema via JSON mode.
 *
 * Config lives in the local SQLite settings table (never leaves the machine) with env fallbacks.
 */
import { db } from '../db/index.js';

export interface LlmEndpoint {
  baseUrl: string;       // e.g. http://127.0.0.1:8080/v1  or https://api.openai.com/v1
  apiKey?: string;
  model: string;
  /** llama.cpp-only extra (Gemma thinking toggle). Stripped for other hosts. */
  llamaCppExtras?: boolean;
}

export interface ClassifierEndpoint {
  kind: 'none' | 'laya';
  url?: string;          // full predict URL, e.g. https://laya.ahm-labs.com/v1/predict
  apiKey?: string;
}

export interface ProviderConfig {
  chat: LlmEndpoint;
  /** null = reuse chat endpoint (must be multimodal). */
  vision: LlmEndpoint | null;
  classifier: ClassifierEndpoint;
}

const LOCAL = (process.env.LLAMA_SERVER_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');

const DEFAULTS: ProviderConfig = {
  chat: {
    baseUrl: process.env.LLM_BASE_URL || `${LOCAL}/v1`,
    apiKey: process.env.LLM_API_KEY,
    model: process.env.LLM_MODEL || 'gemma-4-E2B-it-Q4_K_M',
    llamaCppExtras: !process.env.LLM_BASE_URL
  },
  vision: null,
  classifier: process.env.CLASSIFIER_URL
    ? { kind: 'laya', url: process.env.CLASSIFIER_URL, apiKey: process.env.CLASSIFIER_API_KEY || process.env.LAYA_API_KEY }
    : { kind: 'none' }
};

let cache: ProviderConfig | null = null;

export function getProviders(): ProviderConfig {
  if (cache) return cache;
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('providers') as { value: string } | undefined;
  const saved = row ? (JSON.parse(row.value) as Partial<ProviderConfig>) : {};
  cache = {
    chat: { ...DEFAULTS.chat, ...saved.chat },
    vision: saved.vision === undefined ? DEFAULTS.vision : saved.vision,
    classifier: { ...DEFAULTS.classifier, ...saved.classifier }
  };
  return cache;
}

export function updateProviders(patch: Partial<ProviderConfig>): ProviderConfig {
  const cur = getProviders();
  // Masked keys coming back from the UI mean "unchanged".
  const keep = (next?: string, prev?: string) => (next && next.includes('•') ? prev : next);
  const next: ProviderConfig = {
    chat: patch.chat ? { ...cur.chat, ...patch.chat, apiKey: keep(patch.chat.apiKey, cur.chat.apiKey) } : cur.chat,
    vision: patch.vision === undefined ? cur.vision
      : patch.vision === null ? null
      : { ...(cur.vision ?? cur.chat), ...patch.vision, apiKey: keep(patch.vision.apiKey, cur.vision?.apiKey) },
    classifier: patch.classifier
      ? { ...cur.classifier, ...patch.classifier, apiKey: keep(patch.classifier.apiKey, cur.classifier.apiKey) }
      : cur.classifier
  };
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run('providers', JSON.stringify(next));
  cache = next;
  return next;
}

const mask = (k?: string) => (k ? `${k.slice(0, 4)}••••${k.slice(-4)}` : '');

/** Safe-to-send view (keys masked) + whether anything leaves the device. */
export function publicProviders() {
  const p = getProviders();
  const isLocal = (u?: string) => !u || /^(https?:\/\/)?(127\.|localhost|0\.0\.0\.0|192\.168\.|10\.)/.test(u.replace(/^https?:\/\//, ''));
  return {
    chat: { ...p.chat, apiKey: mask(p.chat.apiKey) },
    vision: p.vision ? { ...p.vision, apiKey: mask(p.vision.apiKey) } : null,
    classifier: { ...p.classifier, apiKey: mask(p.classifier.apiKey) },
    allLocal: isLocal(p.chat.baseUrl) && (!p.vision || isLocal(p.vision.baseUrl)) && (p.classifier.kind === 'none' || isLocal(p.classifier.url))
  };
}

// ───────────────────────── LLM transport ─────────────────────────

/**
 * Drop-in for `fetch(LLAMA/v1/chat/completions, init)`: routes to the configured
 * OpenAI-compatible endpoint, injects model + auth, strips llama.cpp-only fields for other hosts.
 */
export async function llmFetch(init: RequestInit, purpose: 'chat' | 'vision' = 'chat'): Promise<Response> {
  const p = getProviders();
  const ep = purpose === 'vision' ? p.vision ?? p.chat : p.chat;
  const body = JSON.parse(String(init.body || '{}'));
  body.model = ep.model;
  if (!ep.llamaCppExtras) delete body.chat_template_kwargs;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (ep.apiKey) headers.Authorization = `Bearer ${ep.apiKey}`;
  return fetch(`${ep.baseUrl.replace(/\/$/, '')}/chat/completions`, { ...init, method: 'POST', headers, body: JSON.stringify(body) });
}

export async function checkLlmHealth(): Promise<boolean> {
  const ep = getProviders().chat;
  try {
    const headers: Record<string, string> = ep.apiKey ? { Authorization: `Bearer ${ep.apiKey}` } : {};
    const res = await fetch(`${ep.baseUrl.replace(/\/$/, '')}/models`, { headers, signal: AbortSignal.timeout(2500) });
    return res.ok;
  } catch {
    return false;
  }
}

// ───────────────────────── System-1 classifier ─────────────────────────

export type ClassifierQuestion =
  | { type: 'noul'; instructions: string }
  | { type: 'choice'; instructions: string; criteria: Record<string, string> }
  | { type: 'score'; instructions: string; criteria: string[] };

export interface ClassifierAnswer {
  noul?: number;
  choice?: string;
  probabilities?: Record<string, number>;
  confidence?: number;
  score?: number;
}

export interface ClassifierResult {
  answers: Record<string, ClassifierAnswer>;
  latencyMs: number;
  engine: 'laya' | 'llm';
}

/**
 * Zero-shot decision in the Laya schema. Uses the configured System-1 endpoint if any
 * (fast, cheap), otherwise asks the chat LLM to answer the same schema in JSON.
 */
export async function classify(text: string, questions: Record<string, ClassifierQuestion>): Promise<ClassifierResult | null> {
  const t0 = Date.now();
  const c = getProviders().classifier;

  if (c.kind === 'laya' && c.url) {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (c.apiKey) headers.Authorization = `Bearer ${c.apiKey}`;
      const res = await fetch(c.url, { method: 'POST', headers, body: JSON.stringify({ text, questions }), signal: AbortSignal.timeout(4000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { answers: Record<string, ClassifierAnswer> };
      return { answers: data.answers, latencyMs: Date.now() - t0, engine: 'laya' };
    } catch (e: any) {
      console.warn('[Classifier] System-1 endpoint failed, falling back to LLM:', e.message);
    }
  }

  // LLM fallback: same schema, JSON out.
  const spec = Object.entries(questions).map(([k, q]) =>
    q.type === 'noul' ? `"${k}": {"noul": <probability 0-1>}  // ${q.instructions}`
    : q.type === 'choice' ? `"${k}": {"choice": one of ${JSON.stringify(Object.keys(q.criteria))}, "confidence": <0-1>}  // ${q.instructions} ${JSON.stringify(q.criteria)}`
    : `"${k}": {"score": <number>}  // ${q.instructions} ${JSON.stringify(q.criteria)}`
  ).join('\n');
  try {
    const res = await llmFetch({
      body: JSON.stringify({
        messages: [
          { role: 'system', content: `You are a zero-shot classifier. Output ONLY JSON of the form {"answers": {…}} with these keys:\n${spec}` },
          { role: 'user', content: text }
        ],
        temperature: 0, max_tokens: 160,
        response_format: { type: 'json_object' },
        chat_template_kwargs: { enable_thinking: false }
      }),
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const raw = String(data.choices?.[0]?.message?.content || '').replace(/^```(json)?|```$/g, '').trim();
    const parsed = JSON.parse(raw);
    return { answers: parsed.answers ?? parsed, latencyMs: Date.now() - t0, engine: 'llm' };
  } catch {
    return null;
  }
}
