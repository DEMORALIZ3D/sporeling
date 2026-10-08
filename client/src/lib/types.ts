export type AffinityType =
  | 'arboreal'
  | 'fungal'
  | 'aquatic'
  | 'mineral'
  | 'invalid';
export type MoodType = 'thriving' | 'content' | 'depleted' | 'dormant';

export type CreatureAction =
  | 'idle'
  | 'thinking'
  | 'searching'
  | 'surprised'
  | 'confident'
  | 'celebrating'
  | 'depleted'
  | 'dormant';

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
  action?: CreatureAction;
  petState: PetState;
  audioBase64?: string | null;
}

export interface MemoryRecord {
  id: string;
  category: string;
  content: string;
  created_at: number;
}

export interface WalkSessionResult {
  sessionId: string;
  vitalityRestored: number;
  petState: PetState;
  dialogue: string;
  audioBase64?: string | null;
}

export interface CompanionConverseResponse {
  replyText: string;
  action?: CreatureAction;
  widget?: {
    type: string;
    data?: any;
  } | null;
  audioBase64: string | null;
  quickReplies?: string[];
  petState: PetState;
}
