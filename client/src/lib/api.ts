import type {
  CompanionConverseResponse,
  MemoryRecord,
  PetState,
  WalkSessionResult,
} from './types';

const API_BASE = '/api';

export async function fetchPetState(): Promise<PetState> {
  const res = await fetch(`${API_BASE}/pet/state`);
  if (!res.ok) throw new Error('Failed to fetch pet state');
  return res.json();
}

export async function submitWalkSession(
  durationSeconds: number,
  distanceMeters: number,
  stepCount: number,
): Promise<WalkSessionResult> {
  const res = await fetch(`${API_BASE}/pet/walk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ durationSeconds, distanceMeters, stepCount }),
  });

  if (!res.ok) throw new Error('Failed to log walk session');
  return res.json();
}

export async function sendCompanionVoiceText(
  text: string,
): Promise<CompanionConverseResponse> {
  const res = await fetch(`${API_BASE}/companion/converse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) throw new Error('Failed to converse with companion');
  return res.json();
}

export async function fetchMemories(): Promise<MemoryRecord[]> {
  const res = await fetch(`${API_BASE}/companion/memories`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.memories || [];
}

export async function fetchHistory(): Promise<{
  ingestions: any[];
  walks: any[];
}> {
  const res = await fetch(`${API_BASE}/pet/history`);
  if (!res.ok) return { ingestions: [], walks: [] };
  return res.json();
}

// ───────── settings ─────────
export type ActivityProfile = 'outdoor' | 'balanced' | 'desk' | 'custom';
export interface UserSettings {
  profile: ActivityProfile;
  workStart: number;
  workEnd: number;
  workDays: number[];
  sleepStart: number;
  wakeHour: number;
  customMultiplier: number;
  dailyGoalMinutes: number;
  preferredWalk?: string;
}
export interface SettingsSnapshot {
  settings: UserSettings;
  presets: Record<
    ActivityProfile,
    { label: string; blurb: string; goal: number }
  >;
  now: {
    mult: number;
    phase: 'sleeping' | 'work_nap' | 'pressure' | 'normal';
    outdoorMinutesToday: number;
  };
}

export async function fetchSettings(): Promise<SettingsSnapshot> {
  const res = await fetch(`${API_BASE}/settings`);
  return res.json();
}

export async function saveSettings(
  patch: Partial<UserSettings>,
): Promise<SettingsSnapshot> {
  const res = await fetch(`${API_BASE}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return res.json();
}
