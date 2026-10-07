import { db } from '../db/index.js';

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  icon: string;
  goal: number;
  /** Species unlocked as a reward, if any. */
  unlocksSpecies?: 'sprout' | 'shroom' | 'pebble';
  /** Returns current progress count. */
  progress: () => number;
}

const countDistinct = (where: string) =>
  (db.prepare(`SELECT COUNT(*) AS n FROM captures WHERE is_authentic = 1 AND is_duplicate = 0 AND ${where}`).get() as { n: number }).n;

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first_forage',
    title: 'First Forage',
    description: 'Capture your first authentic outdoor specimen in the field camera.',
    icon: '🌿',
    goal: 1,
    progress: () => countDistinct('1 = 1')
  },
  {
    id: 'sprout_keeper',
    title: 'Sprout Keeper',
    description: 'Photograph 25 different wild plants, trees, mosses or lichens.',
    icon: '🌱',
    goal: 25,
    unlocksSpecies: 'sprout',
    progress: () => countDistinct(`category IN ('plant','tree','moss','lichen')`)
  },
  {
    id: 'mushroom_hunter',
    title: 'Mushroom Hunter',
    description: 'Photograph 50 different wild mushrooms or fungi.',
    icon: '🍄',
    goal: 50,
    unlocksSpecies: 'shroom',
    progress: () => countDistinct(`category = 'fungi'`)
  },
  {
    id: 'stargazer',
    title: 'Stargazer',
    description: 'Photograph the night sky 50 times (sun verified below the horizon at your GPS location).',
    icon: '⭐',
    goal: 50,
    unlocksSpecies: 'pebble',
    progress: () => countDistinct(`category = 'sky' AND is_night = 1`)
  },
  {
    id: 'mycologist',
    title: 'Budding Mycologist',
    description: 'Identify 10 distinct fungal species (by scientific name).',
    icon: '🔬',
    goal: 10,
    progress: () =>
      (db.prepare(`SELECT COUNT(DISTINCT lower(scientific_name)) AS n FROM captures
                   WHERE is_authentic = 1 AND category = 'fungi' AND scientific_name IS NOT NULL`).get() as { n: number }).n
  },
  {
    id: 'wanderer',
    title: 'Wanderer',
    description: 'Log authentic captures at 5 locations at least 1km apart.',
    icon: '🧭',
    goal: 5,
    progress: () => {
      const rows = db.prepare(`SELECT latitude AS lat, longitude AS lng FROM captures
                               WHERE is_authentic = 1 AND latitude IS NOT NULL`).all() as { lat: number; lng: number }[];
      const spots: { lat: number; lng: number }[] = [];
      for (const r of rows) {
        if (spots.every((s) => haversine(s.lat, s.lng, r.lat, r.lng) > 1000)) spots.push(r);
        if (spots.length >= 5) break;
      }
      return spots.length;
    }
  }
];

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

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

export function getAchievementStatus(): AchievementStatus[] {
  const unlocked = new Map(
    (db.prepare('SELECT id, unlocked_at FROM achievements').all() as { id: string; unlocked_at: number }[])
      .map((r) => [r.id, r.unlocked_at])
  );
  return ACHIEVEMENTS.map((a) => {
    const p = a.progress();
    return {
      id: a.id,
      title: a.title,
      description: a.description,
      icon: a.icon,
      goal: a.goal,
      progress: Math.min(p, a.goal),
      unlocked: unlocked.has(a.id),
      unlockedAt: unlocked.get(a.id) ?? null,
      unlocksSpecies: a.unlocksSpecies ?? null
    };
  });
}

/** Persists any newly completed achievements; returns the ones just unlocked. */
export function evaluateAchievements(): AchievementStatus[] {
  const fresh: AchievementStatus[] = [];
  const insert = db.prepare('INSERT OR IGNORE INTO achievements (id, unlocked_at) VALUES (?, ?)');
  for (const s of getAchievementStatus()) {
    if (!s.unlocked && s.progress >= s.goal) {
      const now = Date.now();
      insert.run(s.id, now);
      fresh.push({ ...s, unlocked: true, unlockedAt: now });
    }
  }
  return fresh;
}

export function unlockedSpecies(): string[] {
  return ['jolly', ...getAchievementStatus().filter((s) => s.unlocked && s.unlocksSpecies).map((s) => s.unlocksSpecies!)];
}
