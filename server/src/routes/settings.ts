import type { FastifyPluginAsync } from 'fastify';
import { getSettings, updateSettings, PROFILE_PRESETS, decayAt, outdoorMinutesToday } from '../state/settings.js';
import { stateManager } from '../state/state-manager.js';

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
};
