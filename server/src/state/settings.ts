import { db } from '../db/index.js';

/**
 * Activity profiles tune how fast Sporeling's vitals decay so the pet fits the
 * user's real life — but every profile still has "pressure windows" where decay
 * is faster than baseline, so there is always a nudge to get outside.
 */
export type ActivityProfile = 'outdoor' | 'balanced' | 'desk' | 'custom';

export interface UserSettings {
  profile: ActivityProfile;
  /** Work window (local hours, 0-23). Used by the desk profile. */
  workStart: number;
  workEnd: number;
  /** ISO weekday numbers that are workdays (1=Mon … 7=Sun). */
  workDays: number[];
  /** Sleep window — decay nearly pauses overnight for everyone. */
  sleepStart: number;
  wakeHour: number;
  /** Global multiplier, only used by the custom profile (0.25–2). */
  customMultiplier: number;
  /** Daily outdoor-minutes goal (derived from profile unless overridden). */
  dailyGoalMinutes: number;
  /** Preferred walk style, remembered from conversations. */
  preferredWalk?: string;
  homeName?: string;
}

export const PROFILE_PRESETS: Record<ActivityProfile, { label: string; blurb: string; goal: number }> = {
  outdoor: { label: 'Always outside', blurb: 'Outdoor work, lots of travel. Bigger appetite, bigger goals.', goal: 90 },
  balanced: { label: 'Balanced', blurb: 'A mix of indoor and outdoor time.', goal: 45 },
  desk: { label: 'Desk-bound', blurb: 'Remote/office worker. I nap during work hours, then get hungry for an evening walk.', goal: 30 },
  custom: { label: 'Custom', blurb: 'Pick your own decay speed.', goal: 45 }
};

const DEFAULTS: UserSettings = {
  profile: 'balanced',
  workStart: 9,
  workEnd: 17,
  workDays: [1, 2, 3, 4, 5],
  sleepStart: 23,
  wakeHour: 7,
  customMultiplier: 1,
  dailyGoalMinutes: 45
};

let cache: UserSettings | null = null;

export function getSettings(): UserSettings {
  if (cache) return cache;
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('user') as { value: string } | undefined;
  cache = { ...DEFAULTS, ...(row ? JSON.parse(row.value) : {}) };
  return cache!;
}

export function updateSettings(patch: Partial<UserSettings>): UserSettings {
  const next: UserSettings = { ...getSettings(), ...sanitize(patch) };
  if (patch.profile && patch.dailyGoalMinutes === undefined) {
    next.dailyGoalMinutes = PROFILE_PRESETS[next.profile].goal;
  }
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run('user', JSON.stringify(next));
  cache = next;
  return next;
}

function sanitize(p: Partial<UserSettings>): Partial<UserSettings> {
  const out: Partial<UserSettings> = {};
  const hour = (v: any) => Math.max(0, Math.min(23, Math.round(Number(v))));
  if (p.profile && p.profile in PROFILE_PRESETS) out.profile = p.profile;
  if (p.workStart !== undefined) out.workStart = hour(p.workStart);
  if (p.workEnd !== undefined) out.workEnd = hour(p.workEnd);
  if (p.sleepStart !== undefined) out.sleepStart = hour(p.sleepStart);
  if (p.wakeHour !== undefined) out.wakeHour = hour(p.wakeHour);
  if (Array.isArray(p.workDays)) out.workDays = p.workDays.map(Number).filter((d) => d >= 1 && d <= 7);
  if (p.customMultiplier !== undefined) out.customMultiplier = Math.max(0.25, Math.min(2, Number(p.customMultiplier) || 1));
  if (p.dailyGoalMinutes !== undefined) out.dailyGoalMinutes = Math.max(5, Math.min(300, Math.round(Number(p.dailyGoalMinutes))));
  if (typeof p.preferredWalk === 'string') out.preferredWalk = p.preferredWalk.slice(0, 40);
  if (typeof p.homeName === 'string') out.homeName = p.homeName.slice(0, 80);
  return out;
}

const inWindow = (h: number, start: number, end: number) =>
  start <= end ? h >= start && h < end : h >= start || h < end;

export type DecayPhase = 'sleeping' | 'work_nap' | 'pressure' | 'normal';

/** Decay multiplier + phase label for a given instant. */
export function decayAt(t: Date, s: UserSettings = getSettings()): { mult: number; phase: DecayPhase } {
  const h = t.getHours() + t.getMinutes() / 60;
  if (inWindow(h, s.sleepStart, s.wakeHour)) return { mult: 0.1, phase: 'sleeping' };

  const isoDay = ((t.getDay() + 6) % 7) + 1;
  const workday = s.workDays.includes(isoDay);
  const atWork = workday && inWindow(h, s.workStart, s.workEnd);
  const lunch = atWork && h >= 12 && h < 13.5;

  switch (s.profile) {
    case 'outdoor':
      return { mult: 1.25, phase: 'normal' };
    case 'desk':
      if (lunch) return { mult: 1.4, phase: 'pressure' };          // lunch-break nudge
      if (atWork) return { mult: 0.35, phase: 'work_nap' };        // snoozes while you work
      if (workday && h >= s.workEnd && h < s.workEnd + 4) return { mult: 1.6, phase: 'pressure' }; // after-work push
      return { mult: 1.15, phase: 'normal' };
    case 'custom':
      return { mult: s.customMultiplier, phase: 'normal' };
    default:
      if (lunch) return { mult: 1.2, phase: 'pressure' };
      return { mult: 1, phase: 'normal' };
  }
}

/** Integrates the decay multiplier over [fromMs, toMs] in ≤15-minute slices → "effective hours". */
export function effectiveHours(fromMs: number, toMs: number): number {
  if (toMs <= fromMs) return 0;
  const s = getSettings();
  const STEP = 15 * 60 * 1000;
  let total = 0;
  for (let t = fromMs; t < toMs; t += STEP) {
    const slice = Math.min(STEP, toMs - t);
    total += (slice / 3_600_000) * decayAt(new Date(t + slice / 2), s).mult;
  }
  return total;
}

/** Minutes of logged outdoor time today (walks + ~2 min per verified capture). */
export function outdoorMinutesToday(): number {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const since = start.getTime();
  let walk = 0, caps = 0;
  try {
    walk = ((db.prepare('SELECT COALESCE(SUM(duration_seconds),0) AS s FROM walk_sessions WHERE completed_at >= ?').get(since) as any)?.s || 0) / 60;
  } catch { /* ignore */ }
  try {
    caps = (db.prepare('SELECT COUNT(*) AS c FROM captures WHERE taken_at >= ? AND is_authentic = 1').get(since) as any)?.c || 0;
  } catch { /* ignore */ }
  return Math.round(walk + caps * 2);
}
