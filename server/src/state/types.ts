export type AffinityType = 'arboreal' | 'fungal' | 'aquatic' | 'mineral' | 'invalid';
export type MoodType = 'thriving' | 'content' | 'depleted' | 'dormant';

export interface PetState {
  id: string;
  name: string;
  level: number;
  exp: number;
  hunger: number;
  hydration: number;
  vitality: number;
  affinity: AffinityType;
  total_steps: number;
  last_tick_at: number;
  created_at: number;
  mood: MoodType;
  vitalityIndex: number;
}

export interface IngestionResult {
  id: string;
  isAuthentic: boolean;
  subject: string;
  affinity: AffinityType;
  nutritionGranted: number;
  hydrationGranted: number;
  rejectionReason: string | null;
  reactionDialogue: string;
  petState: PetState;
}

export interface MemoryRecord {
  id: string;
  category: string;
  content: string;
  createdAt: number;
}

export interface WalkSessionRecord {
  id: string;
  durationSeconds: number;
  distanceMeters: number;
  stepCount: number;
  vitalityRestored: number;
  completedAt: number;
}
