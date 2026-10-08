import type { FastifyPluginAsync } from 'fastify';
import { stateManager } from '../state/state-manager.js';

export const eventsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/events', async (request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Send initial state immediately
    const initialState = stateManager.getCalculatedState();
    reply.raw.write(`data: ${JSON.stringify(initialState)}\n\n`);

    const onStateUpdate = (state: any) => {
      reply.raw.write(`data: ${JSON.stringify(state)}\n\n`);
    };

    stateManager.on('state_update', onStateUpdate);

    const onCapture = (evt: any) => {
      reply.raw.write(`event: capture\ndata: ${JSON.stringify(evt)}\n\n`);
    };
    stateManager.on('capture_event', onCapture);

    // Keep connection alive with heartbeat comment every 20s
    const heartbeat = setInterval(() => {
      reply.raw.write(': heartbeat\n\n');
    }, 20000);

    request.raw.on('close', () => {
      stateManager.off('state_update', onStateUpdate);
      stateManager.off('capture_event', onCapture);
      clearInterval(heartbeat);
    });
  });
};
