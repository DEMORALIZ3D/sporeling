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

export type ClassifierKind = 'none' | 'laya' | 'hf_zero_shot' | 'rerank' | 'embeddings';

/** One-tap presets surfaced in the Setup screen. `standard` = what ships by default. */
export const ENGINE_PRESETS = {
  chat: [
    { id: 'standard', label: 'Local Gemma 4 E2B (llama.cpp)', baseUrl: 'http://127.0.0.1:8080/v1', model: 'gemma-4-E2B-it-Q4_K_M', llamaCppExtras: true, local: true },
    { id: 'ollama', label: 'Ollama', baseUrl: 'http://127.0.0.1:11434/v1', model: 'gemma4:e2b', llamaCppExtras: false, local: true },
    { id: 'lmstudio', label: 'LM Studio', baseUrl: 'http://127.0.0.1:1234/v1', model: 'gemma-4-e2b-it', llamaCppExtras: false, local: true },
    { id: 'openai', label: 'OpenAI-compatible cloud', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', llamaCppExtras: false, local: false }
  ],
  classifier: [
    { id: 'standard', label: 'Use the chat LLM (no extra service)', kind: 'none', url: '', model: '', local: true },
    { id: 'laya', label: 'Laya System-1 (hosted)', kind: 'laya', url: 'https://laya.ahm-labs.com/v1/predict', model: '', local: false },
    { id: 'rerank_local', label: 'Local reranker (llama.cpp --reranking)', kind: 'rerank', url: 'http://127.0.0.1:8081/v1/rerank', model: 'bge-reranker-v2-m3', local: true },
    { id: 'embed_local', label: 'Local embeddings (EmbeddingGemma)', kind: 'embeddings', url: 'http://127.0.0.1:8082/v1/embeddings', model: 'embeddinggemma', local: true },
    { id: 'hf', label: 'Hugging Face zero-shot', kind: 'hf_zero_shot', url: 'https://api-inference.huggingface.co/models/MoritzLaurer/deberta-v3-large-zeroshot-v2.0', model: '', local: false }
  ]
} as const;

export interface LlmEndpoint {
  baseUrl: string;       // e.g. http://127.0.0.1:8080/v1  or https://api.openai.com/v1
  apiKey?: string;
  model: string;
  /** llama.cpp-only extra (Gemma thinking toggle). Stripped for other hosts. */
  llamaCppExtras?: boolean;
}

export interface ClassifierEndpoint {
  kind: ClassifierKind;
  /** model name for rerank / embeddings / HF endpoints that need it */
  model?: string;
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
  // Masked or omitted keys mean "unchanged" — unless the endpoint moved, then drop the key
  // so a Laya key is never sent to (say) Hugging Face.
  const keep = (next: string | undefined, prev: string | undefined, moved: boolean) =>
    next === undefined || next.includes('•') ? (moved ? undefined : prev) : next || undefined;
  const chatMoved = !!patch.chat?.baseUrl && patch.chat.baseUrl !== cur.chat.baseUrl;
  const visionPrev = cur.vision ?? cur.chat;
  const visionMoved = !!patch.vision?.baseUrl && patch.vision.baseUrl !== visionPrev.baseUrl;
  const clsMoved = !!patch.classifier?.url && patch.classifier.url !== cur.classifier.url
    || (patch.classifier?.kind === 'none');
  const next: ProviderConfig = {
    chat: patch.chat ? { ...cur.chat, ...patch.chat, apiKey: keep(patch.chat.apiKey, cur.chat.apiKey, chatMoved) } : cur.chat,
    vision: patch.vision === undefined ? cur.vision
      : patch.vision === null ? null
      : { ...visionPrev, ...patch.vision, apiKey: keep(patch.vision.apiKey, cur.vision?.apiKey, visionMoved) },
    classifier: patch.classifier
      ? { ...cur.classifier, ...patch.classifier, apiKey: keep(patch.classifier.apiKey, cur.classifier.apiKey, clsMoved) }
      : cur.classifier
  };
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run('providers', JSON.stringify(next));
  cache = next;
  return next;
}

/** Back to the standard local-first setup (keeps saved API keys out of the way by clearing them). */
export function resetProviders(): ProviderConfig {
  db.prepare('DELETE FROM settings WHERE key = ?').run('providers');
  cache = null;
  return getProviders();
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
    allLocal: isLocal(p.chat.baseUrl) && (!p.vision || isLocal(p.vision.baseUrl)) && (p.classifier.kind === 'none' || isLocal(p.classifier.url)),
    presets: ENGINE_PRESETS,
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
  engine: ClassifierKind | 'llm';
}

// ── Adapters: every non-Laya backend just needs to score text against N label descriptions ──

type LabelScorer = (text: string, labels: string[]) => Promise<number[]>; // probabilities, same order

const softmax = (xs: number[], temp = 1) => {
  const m = Math.max(...xs);
  const e = xs.map((x) => Math.exp((x - m) / temp));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / s);
};

async function postJson(c: ClassifierEndpoint, body: unknown): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (c.apiKey) headers.Authorization = `Bearer ${c.apiKey}`;
  const res = await fetch(c.url!, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function scorerFor(c: ClassifierEndpoint): LabelScorer | null {
  switch (c.kind) {
    // Hugging Face zero-shot-classification (Inference API / Endpoints / self-hosted NLI)
    case 'hf_zero_shot':
      return async (text, labels) => {
        const d = await postJson(c, { inputs: text, parameters: { candidate_labels: labels, multi_label: false } });
        const r = Array.isArray(d) ? d[0] : d;
        return labels.map((l) => r.scores[r.labels.indexOf(l)] ?? 0);
      };
    // Cohere/Jina-style rerank (llama.cpp --reranking, vLLM, TEI, Cohere, Jina)
    case 'rerank':
      return async (text, labels) => {
        const d = await postJson(c, { model: c.model, query: text, documents: labels, top_n: labels.length });
        const raw = new Array(labels.length).fill(-10);
        for (const r of d.results ?? d.data ?? []) raw[r.index] = r.relevance_score ?? r.score;
        // Scores may be logits or 0-1; softmax with a temperature that suits both.
        return softmax(raw, raw.every((v) => v >= 0 && v <= 1) ? 0.1 : 1);
      };
    // OpenAI-compatible /v1/embeddings + cosine similarity (universal fallback; EmbeddingGemma-ready)
    case 'embeddings':
      return async (text, labels) => {
        const d = await postJson(c, { model: c.model, input: [text, ...labels] });
        const vecs: number[][] = d.data.map((x: any) => x.embedding);
        const norm = (v: number[]) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));
        const q = vecs[0], qn = norm(q);
        const cos = vecs.slice(1).map((v) => v.reduce((s, x, i) => s + x * q[i], 0) / (norm(v) * qn));
        return softmax(cos, 0.05);
      };
    default:
      return null;
  }
}

/** Maps Laya-schema questions onto a generic label scorer. */
async function classifyWithScorer(text: string, questions: Record<string, ClassifierQuestion>, score: LabelScorer) {
  const answers: Record<string, ClassifierAnswer> = {};
  await Promise.all(Object.entries(questions).map(async ([key, q]) => {
    if (q.type === 'choice') {
      const ids = Object.keys(q.criteria);
      const p = await score(text, ids.map((id) => `${id}: ${q.criteria[id]}`));
      const best = p.indexOf(Math.max(...p));
      const sorted = [...p].sort((a, b) => b - a);
      answers[key] = {
        choice: ids[best],
        probabilities: Object.fromEntries(ids.map((id, i) => [id, Math.round(p[i] * 1e4) / 1e4])),
        confidence: Math.round((sorted[0] - (sorted[1] ?? 0)) * 1e4) / 1e4
      };
    } else if (q.type === 'noul') {
      const [yes] = await score(text, [`Yes: ${q.instructions}`, `No, not this: ${q.instructions}`]);
      answers[key] = { noul: Math.round(yes * 1e4) / 1e4 };
    } else {
      // Expected value over numbered anchors ("0: low", "2: high"…)
      const vals = q.criteria.map((a, i) => Number(a.match(/^\s*(-?\d+(?:\.\d+)?)/)?.[1] ?? i));
      const p = await score(text, q.criteria);
      answers[key] = { score: Math.round(p.reduce((s, pi, i) => s + pi * vals[i], 0) * 100) / 100 };
    }
  }));
  return answers;
}

/**
 * Zero-shot decision in the Laya schema. Uses the configured System-1 endpoint
 * (Laya native, HF zero-shot, rerank or embeddings), otherwise asks the chat LLM.
 */
export async function classify(text: string, questions: Record<string, ClassifierQuestion>): Promise<ClassifierResult | null> {
  const t0 = Date.now();
  const c = getProviders().classifier;

  if (c.kind !== 'none' && c.url) {
    try {
      if (c.kind === 'laya') {
        const data = await postJson(c, { text, questions });
        return { answers: data.answers, latencyMs: Date.now() - t0, engine: 'laya' };
      }
      const scorer = scorerFor(c);
      if (scorer) {
        return { answers: await classifyWithScorer(text, questions, scorer), latencyMs: Date.now() - t0, engine: c.kind };
      }
    } catch (e: any) {
      console.warn(`[Classifier] ${c.kind} endpoint failed, falling back to LLM:`, e.message);
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
