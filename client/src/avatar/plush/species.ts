import * as THREE from 'three';

export type SpeciesId = 'jolly' | 'sprout' | 'shroom' | 'pebble';
export type AccessoryId = 'none' | 'sprout' | 'cap' | 'headphones' | 'scarf' | 'pocket';

export interface SpeciesDef {
  id: SpeciesId;
  name: string;
  blurb: string;
  emoji: string;
  /** Affinity that auto-selects this species (from Gemma's ingestion results). */
  affinity?: 'fungal' | 'arboreal' | 'aquatic' | 'mineral';
  color: number;
  tipColor: number;
  blush: number;
  furLength: number;
  eyeScale: number;
  /** Vertical offset of the face along the body (unit-sphere space). */
  faceY: number;
  accessory: AccessoryId;
  accessoryColor: number;
  /** Achievement id that unlocks this species (undefined = always available). */
  unlockedBy?: string;
  /** Maps a unit-sphere direction to the rest-pose body surface point (writes into out). */
  deform: (x: number, y: number, z: number, out: THREE.Vector3) => void;
}

const R = 1.5;
const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export const SPECIES: SpeciesDef[] = [
  {
    id: 'jolly',
    name: 'Jolly',
    blurb: 'A cream ghost-plush. Calm, curious, a little shy.',
    emoji: '👻',
    color: 0xe9dcc6,
    tipColor: 0xfbf3e6,
    blush: 0xffa8a8,
    furLength: 0.07,
    eyeScale: 0.8,
    faceY: 0.18,
    accessory: 'none',
    accessoryColor: 0xffffff,
    deform: (x, y, z, out) => {
      const flare = 0.9 + 0.16 * smooth(0.3, -1, y);
      let py = y * R * 1.2;
      if (py < -1.25) py = -1.25 + (py + 1.25) * 0.25; // flat seated base
      out.set(x * R * flare, py, z * R * flare * 0.95);
    }
  },
  {
    id: 'sprout',
    name: 'Sprout',
    blurb: 'Pear-shaped forest sprite with a leafy topknot.',
    emoji: '🌱',
    affinity: 'arboreal',
    unlockedBy: 'sprout_keeper',
    color: 0x6fcf9c,
    tipColor: 0xa8ecc4,
    blush: 0xff9fb0,
    furLength: 0.09,
    eyeScale: 1,
    faceY: 0.05,
    accessory: 'sprout',
    accessoryColor: 0x58c27d,
    deform: (x, y, z, out) => {
      const plump = 1.05 - 0.2 * y + 0.1 * Math.max(0, -y);
      let py = y * R * 1.05;
      if (py < -1.35) py = -1.35 + (py + 1.35) * 0.3;
      out.set(x * R * plump, py, z * R * plump);
    }
  },
  {
    id: 'shroom',
    name: 'Shroomlet',
    blurb: 'Squishy little fungus friend under a polka-dot cap.',
    emoji: '🍄',
    affinity: 'fungal',
    unlockedBy: 'mushroom_hunter',
    color: 0xf2dcbc,
    tipColor: 0xfff1dc,
    blush: 0xff8f8f,
    furLength: 0.08,
    eyeScale: 0.95,
    faceY: -0.12,
    accessory: 'cap',
    accessoryColor: 0xe0533f,
    deform: (x, y, z, out) => {
      let py = y * R * 0.82;
      if (py < -1.0) py = -1.0 + (py + 1.0) * 0.3;
      const w = 1.0 + 0.06 * Math.max(0, -y);
      out.set(x * R * w, py, z * R * w);
    }
  },
  {
    id: 'pebble',
    name: 'Pebble',
    blurb: 'A starry night spirit wrapped in a cosy scarf.',
    emoji: '⭐',
    affinity: 'mineral',
    unlockedBy: 'stargazer',
    color: 0xa98bf5,
    tipColor: 0xcdb9ff,
    blush: 0xff9ad0,
    furLength: 0.09,
    eyeScale: 0.95,
    faceY: 0.08,
    accessory: 'scarf',
    accessoryColor: 0xf06a7e,
    deform: (x, y, z, out) => {
      const a = Math.atan2(x, y);
      const planar = Math.sqrt(x * x + y * y);
      const k = Math.pow(0.5 + 0.5 * Math.cos(5 * a), 2.2);
      const m = R * (0.86 + 0.5 * k * planar * planar);
      out.set(x * m, y * m, z * R * 0.78);
    }
  }
];

export const getSpecies = (id: SpeciesId): SpeciesDef =>
  SPECIES.find((s) => s.id === id) ?? SPECIES[0];

export const speciesForAffinity = (affinity?: string | null): SpeciesId =>
  SPECIES.find((s) => s.affinity === affinity)?.id ?? 'jolly';
