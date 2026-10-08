import type { FastifyPluginAsync } from 'fastify';
import { analyzeNatureImage } from '../ai/gemma-client.js';
import { synthesizeSpeechWav } from '../ai/kokoro-tts.js';
import { db } from '../db/index.js';
import { stateManager } from '../state/state-manager.js';
import type { IngestionResult } from '../state/types.js';

export const petRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/pet/state - Fetch live calculated pet state
  fastify.get('/state', async (_request, reply) => {
    const state = stateManager.getCalculatedState();
    return reply.send(state);
  });

  // POST /api/pet/feed - Multimodal nature feeding
  fastify.post('/feed', async (request, reply) => {
    let base64Image = '';
    let mimeType = 'image/jpeg';

    if (request.isMultipart()) {
      const data = await request.file();
      if (!data) {
        return reply.status(400).send({ error: 'No image file uploaded' });
      }
      const buffer = await data.toBuffer();
      base64Image = buffer.toString('base64');
      mimeType = data.mimetype;
    } else {
      const body = request.body as any;
      if (!body?.image) {
        return reply.status(400).send({ error: 'Missing image data' });
      }
      base64Image = body.image;
      if (body.mimeType) mimeType = body.mimeType;
    }

    // Pass image to local Gemma 4 E2B multimodal vision model
    const evalResult = await analyzeNatureImage(base64Image, mimeType);

    let updatedState = stateManager.getCalculatedState();
    if (evalResult.is_authentic_outdoor) {
      updatedState = stateManager.applyIngestion(
        evalResult.nutrition_value,
        evalResult.hydration_value,
        evalResult.affinity,
      );
    }

    // Persist ingestion history
    const ingestionId = `ing_${Math.random().toString(36).substring(2, 10)}`;
    const now = Date.now();
    db.prepare(`
      INSERT INTO ingestions (id, subject, affinity, nutrition_granted, hydration_granted, is_authentic, dialogue_log, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      ingestionId,
      evalResult.subject_identification,
      evalResult.affinity,
      evalResult.nutrition_value,
      evalResult.hydration_value,
      evalResult.is_authentic_outdoor ? 1 : 0,
      evalResult.reaction_dialogue,
      now,
    );

    // Synthesize spoken voice reaction
    const audioWav = await synthesizeSpeechWav(evalResult.reaction_dialogue);
    const audioBase64 = audioWav ? audioWav.toString('base64') : null;

    const response: IngestionResult & { audioBase64: string | null } = {
      id: ingestionId,
      isAuthentic: evalResult.is_authentic_outdoor,
      subject: evalResult.subject_identification,
      affinity: evalResult.affinity,
      nutritionGranted: evalResult.nutrition_value,
      hydrationGranted: evalResult.hydration_value,
      rejectionReason: evalResult.rejection_reason,
      reactionDialogue: evalResult.reaction_dialogue,
      petState: updatedState,
      audioBase64,
    };

    return reply.send(response);
  });

  // POST /api/pet/walk - Log outdoor walking session
  fastify.post('/walk', async (request, reply) => {
    const body = request.body as any;
    const durationSeconds = Number(body?.durationSeconds) || 0;
    const distanceMeters = Number(body?.distanceMeters) || 0;
    const stepCount = Number(body?.stepCount) || 0;

    const { petState, vitalityRestored } = stateManager.applyWalkSession(
      durationSeconds,
      distanceMeters,
      stepCount,
    );

    const sessionId = `walk_${Math.random().toString(36).substring(2, 10)}`;
    const now = Date.now();
    db.prepare(`
      INSERT INTO walk_sessions (id, duration_seconds, distance_meters, step_count, vitality_restored, completed_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      sessionId,
      durationSeconds,
      distanceMeters,
      stepCount,
      vitalityRestored,
      now,
    );

    const spokenNote = `Whew! What an invigorating walk! We explored for ${Math.round(durationSeconds / 60)} minutes and restored ${vitalityRestored}% of my vitality!`;
    const audioWav = await synthesizeSpeechWav(spokenNote);
    const audioBase64 = audioWav ? audioWav.toString('base64') : null;

    return reply.send({
      sessionId,
      vitalityRestored,
      petState,
      dialogue: spokenNote,
      audioBase64,
    });
  });

  // POST /api/pet/location - Update user's live GPS coordinates
  fastify.post('/location', async (request, reply) => {
    const body = request.body as any;
    const lat = Number(body?.latitude);
    const lng = Number(body?.longitude);
    const accuracy = Number(body?.accuracy) || 20;

    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      stateManager.updateLocation(lat, lng, accuracy);
    }
    return reply.send({
      success: true,
      location: stateManager.getLastLocation(),
    });
  });

  // GET /api/pet/nature-map - Poll live nearby biodiversity observations and weather
  fastify.get('/nature-map', async (request, reply) => {
    const query = request.query as any;
    const loc = stateManager.getLastLocation();
    const lat = Number(query?.lat) || loc.lat;
    const lng = Number(query?.lng) || loc.lng;
    const category = (query?.category as any) || 'all';

    const { fetchNearbyNatureObservations, fetchLiveBiomeWeather } =
      await import('../ai/biodiversity.js');
    const [observations, weather] = await Promise.all([
      fetchNearbyNatureObservations(lat, lng, category, 3),
      fetchLiveBiomeWeather(lat, lng),
    ]);

    return reply.send({
      userLocation: { lat, lng },
      weather,
      observations,
    });
  });

  // GET /api/pet/history - Get feeding and walk logs
  fastify.get('/history', async (_request, reply) => {
    const ingestions = db
      .prepare('SELECT * FROM ingestions ORDER BY created_at DESC LIMIT 20')
      .all();
    const walks = db
      .prepare(
        'SELECT * FROM walk_sessions ORDER BY completed_at DESC LIMIT 10',
      )
      .all();
    return reply.send({ ingestions, walks });
  });
};
