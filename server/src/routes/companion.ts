import type { FastifyPluginAsync } from 'fastify';
import { stateManager } from '../state/state-manager.js';
import { generateCompanionResponse, routeIntent, type CompanionAction, type ChatTurn } from '../ai/gemma-client.js';
import { synthesizeSpeechWav } from '../ai/kokoro-tts.js';
import { toolRegistry } from '../tools/registry.js';
import { db } from '../db/index.js';
import { WALK_TYPES, type WalkType } from '../ai/geo.js';
import { fetchLiveBiomeWeather } from '../ai/biodiversity.js';
import { getSettings, updateSettings, decayAt, outdoorMinutesToday, PROFILE_PRESETS } from '../state/settings.js';

// ───────────────────────── conversation memory ─────────────────────────

function recentTurns(n = 10): ChatTurn[] {
  const rows = db.prepare('SELECT role, content FROM conversation ORDER BY id DESC LIMIT ?').all(n) as ChatTurn[];
  return rows.reverse();
}

function logTurn(role: 'user' | 'assistant', content: string, meta?: any) {
  db.prepare('INSERT INTO conversation (role, content, meta, created_at) VALUES (?, ?, ?, ?)')
    .run(role, content.slice(0, 2000), meta ? JSON.stringify(meta) : null, Date.now());
  // Keep the table small — this is a pocket pet, not an archive.
  db.prepare('DELETE FROM conversation WHERE id NOT IN (SELECT id FROM conversation ORDER BY id DESC LIMIT 200)').run();
}

/** Pending multi-turn dialogue (e.g. walk planner waiting for a type or duration). */
let pendingWalk: { walk_type?: WalkType; duration_min?: number; expires: number } | null = null;

// ───────────────────────── slot parsers ─────────────────────────

const WEATHER_RE = /\b(weather|forecast|temperature|temp|raining|rain|sunny|snow|hot|cold|humid|foraging conditions|radar)\b/;
const WALK_RE = /\b(walk|route|stroll|hike|ramble|wander|loop|trail)\b/;

const NOT_PLACES = new Set(['here', 'outside', 'the park', 'my area', 'my location', 'the morning', 'the afternoon', 'the evening', 'an hour', 'a bit', 'general']);

function extractPlace(text: string): string | null {
  const m = text.match(/\b(?:in|at|for|over|around|near)\s+([A-Za-z][A-Za-z .,'-]{1,60}?)(?:\s+(?:today|tomorrow|tonight|right now|now|this \w+)|[?.!]|$)/i);
  if (!m) return null;
  const place = m[1].trim().replace(/[,.]$/, '').replace(/^(?:(?:in|at|for|over|around|near|the)\s+)+/i, '');
  if (NOT_PLACES.has(place.toLowerCase()) || /^(the )?(weather|moment|minute|while)$/i.test(place)) return null;
  return place;
}

function parseWalkType(lower: string): WalkType | undefined {
  if (/\b(wood|woods|woodland|forest|trees|foraging|forage|mushroom)/.test(lower)) return 'woods';
  if (/\b(river|canal|lake|water|waterside|sea|coast|beach|pond|reservoir)/.test(lower)) return 'waterside';
  if (/\b(country|countryside|fields?|hills?|meadow|rural|moor|heath)/.test(lower)) return 'country';
  if (/\b(city|town|urban|streets?|landmark|historic)/.test(lower)) return 'city';
  if (/\b(park|garden|green)/.test(lower)) return 'park';
  return undefined;
}

function parseDuration(lower: string): number | undefined {
  const m = lower.match(/(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\b/);
  if (m) return Math.round(Number(m[1]) * (m[2].startsWith('h') ? 60 : 1));
  if (/half an hour|half hour/.test(lower)) return 30;
  if (/an hour and a half|hour and a half/.test(lower)) return 90;
  if (/\b(an|one) hour\b/.test(lower)) return 60;
  if (/\b(quick|short|little|brief)\b/.test(lower)) return 20;
  if (/\b(long|big|epic|proper)\b/.test(lower)) return 75;
  return undefined;
}

function walkOptionsWidget(weather?: { conditions?: string; rainChance?: number; sunset?: string }) {
  return {
    type: 'walk_options',
    data: {
      types: (Object.keys(WALK_TYPES) as WalkType[]).map((k) => ({ id: k, ...WALK_TYPES[k], query: undefined })),
      durations: [20, 30, 45, 60, 90],
      preferred: getSettings().preferredWalk,
      weather
    }
  };
}

async function lifestyleContext(): Promise<string> {
  const s = getSettings();
  const mins = outdoorMinutesToday();
  const phase = decayAt(new Date()).phase;
  const now = new Date();
  return [
    `Local time: ${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} (${now.toLocaleDateString('en-GB', { weekday: 'long' })}).`,
    `User lifestyle: ${PROFILE_PRESETS[s.profile].label} — ${PROFILE_PRESETS[s.profile].blurb}`,
    `Outdoor time today: ${mins} of ${s.dailyGoalMinutes} goal minutes.`,
    phase === 'work_nap' ? 'The user is in work hours; keep it brief and suggest a lunch walk.' : '',
    phase === 'pressure' ? 'This is a good window to go outside (lunch break / after work). Encourage it!' : '',
    s.preferredWalk ? `They usually enjoy ${s.preferredWalk} walks.` : ''
  ].filter(Boolean).join('\n');
}

// ───────────────────────── route ─────────────────────────

export const companionRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/companion/converse - Voice / text conversation with tool dispatch & widgets
  fastify.post('/converse', async (request, reply) => {
    const body = request.body as any;
    const text = (body?.text || '').trim();

    if (!text) {
      return reply.status(400).send({ error: 'No text provided' });
    }

    const petState = stateManager.getCalculatedState();
    const lower = text.toLowerCase();
    const history = recentTurns();

    let replyText = '';
    let action: CompanionAction = 'idle';
    let toolResult: any = null;
    let widget: { type: string; data?: any } | null = null;
    let quickReplies: string[] | undefined;

    if (pendingWalk && pendingWalk.expires < Date.now()) pendingWalk = null;

    // Slot hints from regex
    const walkType = parseWalkType(lower);
    const duration = parseDuration(lower);
    const wantsWalk = (WALK_RE.test(lower) && /\b(plan|suggest|take|find|go|fancy|want|route|where|recommend|me a)\b/.test(lower))
      || (pendingWalk !== null && (walkType !== undefined || duration !== undefined || /\b(surprise|any|you pick|whatever|dunno)\b/.test(lower)));

    let intent: string | null = null;
    let location: string | null = null;

    if (lower.startsWith('remember ') || lower.startsWith('save note ') || lower.startsWith('note:')) intent = 'save_memory';
    else if (lower.startsWith('recall ') || lower.startsWith('what do you remember about') || lower.startsWith('search memories')) intent = 'recall_memory';
    else if (wantsWalk) intent = 'plan_walk';
    else if (WEATHER_RE.test(lower)) { intent = 'weather'; location = extractPlace(text); }
    else if (/\b(alarm|timer|remind me to walk)\b/.test(lower)) intent = 'alarm';
    else if (/\b(mushroom|shroom|bird|tree|spore|fungi|nearby|nature map|scan)\b/.test(lower)) intent = 'scan_nature';

    // Ambiguous → let Gemma route (also catches "is it sunny in kyoto" style phrasing the regex misses)
    let routed: Awaited<ReturnType<typeof routeIntent>> = null;
    if (!intent || (intent === 'weather' && !location && /\b[A-Z][a-z]{2,}/.test(text.replace(/^\w+/, '')))) {
      routed = await routeIntent(text, history);
      if (routed && routed.intent !== 'chat') {
        intent = intent ?? routed.intent;
        if (intent === 'weather' && routed.location) location = routed.location;
      }
    }

    if (intent === 'save_memory') {
      const content = text.replace(/^(remember|save note|note:)\s*/i, '');
      toolResult = await toolRegistry.save_memory.handler({ content }, petState);
      replyText = toolResult.message;
      action = toolResult.success ? 'confident' : 'depleted';
      if (toolResult.success) widget = { type: 'memory_card', data: toolResult.data };
    } else if (intent === 'recall_memory') {
      const query = text.replace(/^(recall|what do you remember about|search memories)\s*/i, '');
      action = 'searching';
      toolResult = await toolRegistry.recall_memory.handler({ query }, petState);
      replyText = toolResult.message;
      if (toolResult.success && toolResult.data) widget = { type: 'memory_list', data: toolResult.data };
    } else if (intent === 'weather') {
      toolResult = await toolRegistry.check_outdoor_forecast.handler(location ? { location } : {}, petState);
      replyText = toolResult.message;
      if (toolResult.success && location) {
        replyText += ' Shall I check what it\'s like outside your door too?';
      } else if (toolResult.success && toolResult.data?.weatherCode < 60) {
        replyText += ' Fancy a walk? Just say "plan me a walk".';
        quickReplies = ['Plan me a walk', 'Quick 20 minute stroll'];
      }
      action = toolResult.success ? 'confident' : 'surprised';
      widget = { type: 'weather_radar', data: toolResult.data };
    } else if (intent === 'plan_walk') {
      const wt = walkType ?? (routed?.walk_type || undefined) ?? pendingWalk?.walk_type
        ?? (/\b(surprise|any|you pick|whatever)\b/.test(lower) ? (getSettings().preferredWalk as WalkType) || 'park' : undefined);
      const dur = duration ?? (routed?.duration_min || undefined) ?? pendingWalk?.duration_min;

      if (!wt) {
        pendingWalk = { duration_min: dur, expires: Date.now() + 10 * 60 * 1000 };
        const loc = stateManager.getLastLocation();
        const w = await fetchLiveBiomeWeather(loc.lat, loc.lng);
        const rainy = w.weatherCode >= 51;
        replyText = `Ooh, an adventure! What kind of walk${dur ? ` for ${dur} minutes` : ''}? ` +
          (rainy ? `It's ${w.conditions} out, so a city loop might keep you drier.` : `Woods are best for spotting fungi for me!`) +
          (w.sunset ? ` Sunset's at ${w.sunset}.` : '');
        action = 'surprised';
        widget = walkOptionsWidget({ conditions: w.conditions, rainChance: w.rainChance, sunset: w.sunset });
      } else if (!dur) {
        pendingWalk = { walk_type: wt, expires: Date.now() + 10 * 60 * 1000 };
        replyText = `A ${WALK_TYPES[wt].label.toLowerCase()}, lovely! How long have you got?`;
        action = 'confident';
        quickReplies = ['20 minutes', '45 minutes', 'An hour', '90 minutes'];
      } else {
        pendingWalk = null;
        action = 'searching';
        updateSettings({ preferredWalk: wt });
        toolResult = await toolRegistry.plan_walk.handler({ walk_type: wt, duration_min: dur }, petState);
        replyText = toolResult.message;
        action = toolResult.success ? 'celebrating' : 'thinking';
        widget = { type: 'walk_route', data: toolResult.data };
        quickReplies = toolResult.success ? ['Start walk', 'Something shorter', 'Try somewhere else'] : ['Try a park walk', 'Try a city walk'];
      }
    } else if (intent === 'alarm') {
      replyText = "Setting an outdoor nature reminder! Keep an eye on your background alarms.";
      action = 'confident';
      widget = { type: 'alarm' };
    } else if (intent === 'scan_nature') {
      let category: 'all' | 'fungi' | 'plants' | 'birds' = 'all';
      if (/mushroom|shroom|fungi|spore/.test(lower)) category = 'fungi';
      else if (/bird|avian/.test(lower)) category = 'birds';
      else if (/tree|flora|plant/.test(lower)) category = 'plants';

      action = 'searching';
      toolResult = await toolRegistry.scan_nearby_nature.handler({ category }, petState);
      replyText = toolResult.message;
      widget = { type: 'biome_radar', data: { observations: toolResult.data, category } };
    } else {
      const aiReply = await generateCompanionResponse(text, petState, history, await lifestyleContext());
      replyText = aiReply.replyText;
      action = aiReply.action;
    }

    logTurn('user', text);
    logTurn('assistant', replyText, widget ? { widget: widget.type } : undefined);

    const audioWav = await synthesizeSpeechWav(replyText);
    const audioBase64 = audioWav ? audioWav.toString('base64') : null;

    return reply.send({
      replyText,
      action,
      widget,
      quickReplies,
      toolResult,
      audioBase64,
      petState: stateManager.getCalculatedState()
    });
  });

  // GET /api/companion/history - recent conversation turns
  fastify.get('/history', async (_request, reply) => reply.send({ turns: recentTurns(30) }));

  // GET /api/companion/memories - List saved memories
  fastify.get('/memories', async (_request, reply) => {
    const memories = db.prepare('SELECT * FROM memories ORDER BY created_at DESC LIMIT 50').all();
    return reply.send({ memories });
  });

  // POST /api/companion/tts - Stream synthesized WAV audio directly
  fastify.post('/tts', async (request, reply) => {
    const body = request.body as any;
    const text = body?.text || 'Hello there, outdoor explorer!';
    const voice = body?.voice || 'af_bella';

    const audioWav = await synthesizeSpeechWav(text, voice);
    if (!audioWav) {
      return reply.status(500).send({ error: 'Failed to synthesize speech' });
    }

    return reply
      .header('Content-Type', 'audio/wav')
      .header('Content-Length', audioWav.length)
      .send(audioWav);
  });
};
