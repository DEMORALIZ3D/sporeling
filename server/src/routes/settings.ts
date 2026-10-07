import type { FastifyPluginAsync } from 'fastify';
import { getSettings, updateSettings, PROFILE_PRESETS, decayAt, outdoorMinutesToday } from '../state/settings.js';
import { stateManager } from '../state/state-manager.js';
import { publicProviders, updateProviders, checkLlmHealth, classify } from '../ai/providers.js';

export const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  const snapshot = () => ({
    settings: getSettings(),
    presets: PROFILE_PRESETS,
    now: { ...decayAt(new Date()), outdoorMinutesToday: outdoorMinutesToday() }
  });

  fastify.get('/', async (_req, reply) => reply.send(snapshot()));

  fastify.put('/', async (req, reply) => {
    // Settle decay at the old rate before switching profiles.
    stateManager.getCalculatedState();
    updateSettings((req.body as any) || {});
    return reply.send(snapshot());
  });

  // AI engines: OpenAI-compatible chat/vision + optional Laya-style System-1 classifier
  fastify.get('/providers', async (_req, reply) => reply.send(publicProviders()));

  fastify.put('/providers', async (req, reply) => {
    updateProviders((req.body as any) || {});
    return reply.send(publicProviders());
  });

  fastify.post('/providers/test', async (_req, reply) => {
    const [llm, cls] = await Promise.all([
      checkLlmHealth(),
      classify('Is it going to rain in Leeds later?', {
        intent: { type: 'choice', instructions: 'Intent', criteria: { weather: 'weather, rain, forecast', chat: 'anything else' } }
      })
    ]);
    return reply.send({ llm, classifier: cls ? { engine: cls.engine, latencyMs: cls.latencyMs, answer: cls.answers?.intent } : null });
  });
};
