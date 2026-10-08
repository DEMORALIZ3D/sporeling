import fs from 'node:fs';
import path from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import { fetchLiveBiomeWeather } from '../ai/biodiversity.js';
import { analyzeNatureImage, narrateSky } from '../ai/gemma-client.js';
import { synthesizeSpeechWav } from '../ai/kokoro-tts.js';
import {
  buildSkyReport,
  describeSkyReport,
  type SkyReport,
  sunAltitude,
} from '../ai/sky.js';
import {
  evaluateAchievements,
  getAchievementStatus,
  unlockedSpecies,
} from '../captures/achievements.js';
import {
  CAPTURE_DIR,
  hammingDistance,
  issueCaptureNonce,
  processCapture,
  saveCaptureFiles,
  validateCaptureNonce,
} from '../captures/pipeline.js';
import { db } from '../db/index.js';
import { stateManager } from '../state/state-manager.js';

/** Max hamming distance (of 64 bits) at which two shots count as the same specimen. */
const DUPLICATE_THRESHOLD = 10;
/** Sky shots closer than this in time AND space count as the same session. */
const SKY_SPACING_MS = 15 * 60 * 1000;
const SKY_SPACING_M = 500;
/** Device capture time must be within this window of server receipt. */
const CLOCK_WINDOW_MS = 5 * 60 * 1000;

const num = (v: unknown): number | null => {
  const n = Number(v);
  return v === undefined || v === null || v === '' || Number.isNaN(n)
    ? null
    : n;
};

const metres = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const R = 6371000,
    r = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(r(lat2 - lat1) / 2) ** 2 +
    Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

// ---------------------------------------------------------------------------
// Job queue — one Gemma job at a time so the 8GB GPU never thrashes.
// ---------------------------------------------------------------------------
type JobStatus = 'queued' | 'processing' | 'done' | 'failed';
interface Job {
  id: string;
  status: JobStatus;
  stage: string;
  queuedAt: number;
  raw: Buffer | null;
  fields: Record<string, string>;
  result?: any;
  error?: string;
}

const jobs = new Map<string, Job>();
const queue: Job[] = [];
let working = false;

function setStage(job: Job, stage: string) {
  job.stage = stage;
  stateManager.emit('capture_event', {
    type: 'progress',
    jobId: job.id,
    status: job.status,
    stage,
  });
}

async function pump() {
  if (working) return;
  const job = queue.shift();
  if (!job) return;
  working = true;
  job.status = 'processing';
  try {
    job.result = await runJob(job);
    job.status = 'done';
    stateManager.emit('capture_event', {
      type: 'result',
      jobId: job.id,
      result: job.result,
    });
  } catch (e: any) {
    job.status = 'failed';
    job.error = e?.message || 'Processing failed';
    stateManager.emit('capture_event', {
      type: 'failed',
      jobId: job.id,
      error: job.error,
    });
  } finally {
    job.raw = null; // free memory
    working = false;
    // forget old jobs after 1h
    for (const [id, j] of jobs)
      if (Date.now() - j.queuedAt > 3600_000) jobs.delete(id);
    pump();
  }
}

async function runJob(job: Job) {
  const { fields } = job;
  const takenAt = num(fields.capturedAt) ?? job.queuedAt;
  const lat = num(fields.latitude),
    lng = num(fields.longitude);
  const hasGps = lat !== null && lng !== null;
  const when = new Date(takenAt);

  setStage(job, 'Shrinking photo for Gemma');
  const img = await processCapture(job.raw!);

  setStage(job, 'Checking local weather');
  const weather = hasGps
    ? await fetchLiveBiomeWeather(lat!, lng!).catch(() => null)
    : null;
  const sunAlt = hasGps ? sunAltitude(lat!, lng!, when) : null;
  const isNight = sunAlt !== null && sunAlt < -6;

  const context = [
    `local time ${when.toLocaleString('en-GB')}`,
    hasGps ? `GPS ${lat?.toFixed(4)}, ${lng?.toFixed(4)}` : null,
    sunAlt !== null
      ? `sun altitude ${sunAlt.toFixed(1)}° (${isNight ? 'night' : 'daylight/twilight'})`
      : null,
    weather ? `weather ${JSON.stringify(weather).slice(0, 160)}` : null,
  ]
    .filter(Boolean)
    .join('; ');

  setStage(job, 'Gemma is inspecting the specimen');
  const ev = await analyzeNatureImage(
    img.llmJpeg.toString('base64'),
    'image/jpeg',
    context,
  );

  // --- Sky: compute what's overhead from GPS + capture time ---
  let sky: SkyReport | null = null;
  let skyNarration: string | null = null;
  if (ev.is_authentic_outdoor && ev.category === 'sky' && hasGps) {
    setStage(job, 'Mapping stars, planets & satellites overhead');
    sky = await buildSkyReport(lat!, lng!, when);
    setStage(job, 'Gemma is reading the sky');
    skyNarration = await narrateSky(
      JSON.stringify(sky),
      ev.stars_visible,
      describeSkyReport(sky),
    );
  }

  // --- Duplicate detection ---
  let isDuplicate = false;
  if (ev.is_authentic_outdoor) {
    if (ev.category === 'sky') {
      // night skies all look alike; count distinct sessions by time+place instead
      const prior = db
        .prepare(`SELECT taken_at, latitude, longitude FROM captures
                                WHERE is_authentic = 1 AND category = 'sky' AND is_duplicate = 0 AND taken_at > ?`)
        .all(takenAt - SKY_SPACING_MS) as {
        taken_at: number;
        latitude: number | null;
        longitude: number | null;
      }[];
      isDuplicate = prior.some(
        (p) =>
          Math.abs(p.taken_at - takenAt) < SKY_SPACING_MS &&
          (!hasGps ||
            p.latitude === null ||
            metres(p.latitude, p.longitude!, lat!, lng!) < SKY_SPACING_M),
      );
    } else {
      const prior = db
        .prepare(
          'SELECT dhash FROM captures WHERE is_authentic = 1 AND category = ?',
        )
        .all(ev.category) as { dhash: string }[];
      isDuplicate = prior.some(
        (p) => hammingDistance(p.dhash, img.dhash) <= DUPLICATE_THRESHOLD,
      );
    }
  }

  setStage(job, 'Saving to your field journal');
  const id = job.id;
  const { imagePath, thumbPath } = await saveCaptureFiles(id, img.llmJpeg);

  // --- Feed the familiar (duplicates still feed, at half value) ---
  let petState = stateManager.getCalculatedState();
  if (ev.is_authentic_outdoor) {
    const k = isDuplicate ? 0.5 : 1;
    petState = stateManager.applyIngestion(
      Math.round(ev.nutrition_value * k),
      Math.round(ev.hydration_value * k),
      ev.affinity,
    );
  }

  let dialogue = skyNarration
    ? `${ev.reaction_dialogue} ${skyNarration}`
    : ev.reaction_dialogue;
  if (isDuplicate)
    dialogue +=
      ev.category === 'sky'
        ? ' We already logged this patch of sky recently though.'
        : " Hmm, I think we've seen this one before though!";

  db.prepare(`INSERT INTO captures (
    id, category, common_name, scientific_name, confidence, tags, is_authentic, is_duplicate, dhash,
    latitude, longitude, gps_accuracy, altitude, heading, taken_at, received_at,
    camera_label, facing_mode, zoom, width, height, exif, weather, dialogue, image_path, thumb_path,
    is_night, stars_visible, sky_report
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id,
    ev.category,
    ev.common_name,
    ev.scientific_name,
    ev.confidence,
    JSON.stringify(ev.tags),
    ev.is_authentic_outdoor ? 1 : 0,
    isDuplicate ? 1 : 0,
    img.dhash,
    lat,
    lng,
    num(fields.accuracy),
    num(fields.altitude),
    num(fields.heading),
    takenAt,
    job.queuedAt,
    fields.cameraLabel || null,
    fields.facingMode || null,
    num(fields.zoom),
    img.width,
    img.height,
    img.exif ? JSON.stringify(img.exif) : null,
    weather ? JSON.stringify(weather) : null,
    dialogue,
    imagePath,
    thumbPath,
    isNight ? 1 : 0,
    ev.stars_visible ? 1 : 0,
    sky ? JSON.stringify(sky) : null,
  );

  const newlyUnlocked = evaluateAchievements();
  if (newlyUnlocked.length)
    dialogue += ` Wow! Achievement unlocked: ${newlyUnlocked.map((a) => a.title).join(', ')}!`;

  setStage(job, 'Finding my voice');
  const wav = await synthesizeSpeechWav(dialogue);
  let audioUrl: string | null = null;
  if (wav) {
    const audioPath = path.join(CAPTURE_DIR, `${id}.wav`);
    await fs.promises.writeFile(audioPath, wav);
    db.prepare(
      'UPDATE captures SET audio_path = ?, dialogue = ? WHERE id = ?',
    ).run(audioPath, dialogue, id);
    audioUrl = `/api/capture/${id}/audio`;
  }

  return {
    jobId: id,
    capture: {
      id,
      category: ev.category,
      commonName: ev.common_name,
      scientificName: ev.scientific_name,
      confidence: ev.confidence,
      tags: ev.tags,
      isAuthentic: ev.is_authentic_outdoor,
      isDuplicate,
      rejectionReason: ev.rejection_reason,
      takenAt,
      latitude: lat,
      longitude: lng,
      weather,
      isNight,
      starsVisible: ev.stars_visible,
      sky,
      thumbUrl: `/api/capture/${id}/thumb`,
    },
    nutritionGranted: ev.nutrition_value,
    hydrationGranted: ev.hydration_value,
    reactionDialogue: dialogue,
    petState,
    newlyUnlocked,
    achievements: getAchievementStatus(),
    unlockedSpecies: unlockedSpecies(),
    audioUrl,
  };
}

export const captureRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/capture/session — viewfinder opened; issue in-app capture nonce
  fastify.post('/session', async () => issueCaptureNonce());

  // POST /api/capture/submit — validates instantly, queues for background processing (202)
  fastify.post('/submit', async (request, reply) => {
    if (!request.isMultipart())
      return reply.status(400).send({ error: 'Expected multipart upload' });

    const fields: Record<string, string> = {};
    let raw: Buffer | null = null;
    for await (const part of request.parts()) {
      if (part.type === 'file') raw = await part.toBuffer();
      else fields[part.fieldname] = String(part.value);
    }
    if (!raw) return reply.status(400).send({ error: 'No image' });
    if (!validateCaptureNonce(fields.nonce)) {
      return reply
        .status(403)
        .send({ error: 'Photos must be taken with the in-app field camera.' });
    }
    const now = Date.now();
    const takenAt = num(fields.capturedAt) ?? now;
    if (Math.abs(now - takenAt) > CLOCK_WINDOW_MS) {
      return reply
        .status(422)
        .send({ error: 'Capture timestamp is stale — snap a fresh photo.' });
    }
    const lat = num(fields.latitude),
      lng = num(fields.longitude);
    if (lat !== null && lng !== null)
      stateManager.updateLocation(lat, lng, num(fields.accuracy) ?? 30);

    const id = `cap_${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const job: Job = {
      id,
      status: 'queued',
      stage: 'Queued',
      queuedAt: now,
      raw,
      fields,
    };
    jobs.set(id, job);
    queue.push(job);
    setImmediate(pump);

    return reply
      .status(202)
      .send({ jobId: id, status: 'queued', position: queue.length });
  });

  // GET /api/capture/job/:id — polling fallback when SSE was missed
  fastify.get('/job/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = jobs.get(id);
    if (!job) return reply.status(404).send({ error: 'Unknown job' });
    return {
      jobId: id,
      status: job.status,
      stage: job.stage,
      result: job.result ?? null,
      error: job.error ?? null,
    };
  });

  // GET /api/capture/list?category=fungi
  fastify.get('/list', async (request) => {
    const q = request.query as { category?: string; limit?: string };
    const limit = Math.min(200, Number(q.limit) || 60);
    const rows = q.category
      ? db
          .prepare(
            'SELECT * FROM captures WHERE category = ? ORDER BY taken_at DESC LIMIT ?',
          )
          .all(q.category, limit)
      : db
          .prepare('SELECT * FROM captures ORDER BY taken_at DESC LIMIT ?')
          .all(limit);
    return {
      captures: (rows as any[]).map((r) => ({
        id: r.id,
        category: r.category,
        commonName: r.common_name,
        scientificName: r.scientific_name,
        confidence: r.confidence,
        tags: JSON.parse(r.tags || '[]'),
        isAuthentic: !!r.is_authentic,
        isDuplicate: !!r.is_duplicate,
        takenAt: r.taken_at,
        latitude: r.latitude,
        longitude: r.longitude,
        isNight: !!r.is_night,
        sky: r.sky_report ? JSON.parse(r.sky_report) : null,
        dialogue: r.dialogue,
        thumbUrl: `/api/capture/${r.id}/thumb`,
        audioUrl: r.audio_path ? `/api/capture/${r.id}/audio` : null,
      })),
    };
  });

  fastify.get('/:id/thumb', async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = db
      .prepare('SELECT thumb_path FROM captures WHERE id = ?')
      .get(id) as { thumb_path: string } | undefined;
    if (!row || !fs.existsSync(row.thumb_path)) return reply.status(404).send();
    return reply.type('image/jpeg').send(fs.createReadStream(row.thumb_path));
  });

  fastify.get('/:id/audio', async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = db
      .prepare('SELECT audio_path FROM captures WHERE id = ?')
      .get(id) as { audio_path: string | null } | undefined;
    if (!row?.audio_path || !fs.existsSync(row.audio_path))
      return reply.status(404).send();
    return reply.type('audio/wav').send(fs.createReadStream(row.audio_path));
  });

  fastify.get('/achievements', async () => ({
    achievements: getAchievementStatus(),
    unlockedSpecies: unlockedSpecies(),
  }));

  // GET /api/capture/sky?lat=&lng= — live sky report without a photo (debug / widget)
  fastify.get('/sky', async (request) => {
    const q = request.query as { lat?: string; lng?: string };
    const loc = stateManager.getLastLocation();
    return buildSkyReport(
      Number(q.lat) || loc.lat,
      Number(q.lng) || loc.lng,
      new Date(),
    );
  });
};
