import type { PetState } from './types';

export interface AchievementStatus {
  id: string;
  title: string;
  description: string;
  icon: string;
  goal: number;
  progress: number;
  unlocked: boolean;
  unlockedAt: number | null;
  unlocksSpecies: string | null;
}

export interface CaptureRecord {
  id: string;
  category: string;
  commonName: string;
  scientificName: string | null;
  confidence: number;
  tags: string[];
  isAuthentic: boolean;
  isDuplicate: boolean;
  rejectionReason?: string | null;
  takenAt: number;
  latitude: number | null;
  longitude: number | null;
  weather?: any;
  isNight?: boolean;
  starsVisible?: boolean;
  sky?: SkyReport | null;
  thumbUrl: string;
}

export interface SkyObject { name: string; kind: string; altitude: number; azimuth: number; direction: string; magnitude?: number; constellation?: string }
export interface SkyReport {
  isNight: boolean;
  sunAltitude: number;
  twilight: string;
  zenithConstellation: string;
  moon: { altitude: number; direction: string; illuminationPct: number; phaseName: string } | null;
  planets: SkyObject[];
  stars: SkyObject[];
  constellations: string[];
  satellites: SkyObject[];
}

export interface CaptureResult {
  jobId: string;
  capture: CaptureRecord;
  nutritionGranted: number;
  hydrationGranted: number;
  reactionDialogue: string;
  petState: PetState;
  newlyUnlocked: AchievementStatus[];
  achievements: AchievementStatus[];
  unlockedSpecies: string[];
  audioUrl: string | null;
}

export interface CaptureMeta {
  nonce: string;
  capturedAt: number;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  altitude?: number | null;
  heading?: number | null;
  cameraLabel?: string;
  facingMode?: string;
  zoom?: number;
}

export async function startCaptureSession(): Promise<{ nonce: string; expiresAt: number }> {
  const res = await fetch('/api/capture/session', { method: 'POST' });
  if (!res.ok) throw new Error('Could not start field camera session');
  return res.json();
}

/** Queues a capture; the result arrives later via captureHub. */
export async function submitCapture(image: Blob, meta: CaptureMeta): Promise<{ jobId: string; position: number }> {
  const fd = new FormData();
  for (const [k, v] of Object.entries(meta)) {
    if (v !== undefined && v !== null) fd.append(k, String(v));
  }
  fd.append('image', image, 'capture.jpg'); // file last so fields are parsed first
  const res = await fetch('/api/capture/submit', { method: 'POST', body: fd });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Capture failed');
  }
  return res.json();
}

export async function fetchAchievements(): Promise<{ achievements: AchievementStatus[]; unlockedSpecies: string[] }> {
  const res = await fetch('/api/capture/achievements');
  if (!res.ok) return { achievements: [], unlockedSpecies: ['jolly'] };
  return res.json();
}

export async function fetchCaptures(category?: string): Promise<CaptureRecord[]> {
  const res = await fetch('/api/capture/list' + (category ? `?category=${category}` : ''));
  if (!res.ok) return [];
  return (await res.json()).captures;
}
