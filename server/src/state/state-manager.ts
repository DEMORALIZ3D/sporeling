import { EventEmitter } from 'node:events';
import { db } from '../db/index.js';
import type { PetState, MoodType, AffinityType } from './types.js';
import { effectiveHours } from './settings.js';

class StateManager extends EventEmitter {
  private static instance: StateManager;
  private lastLocation: { lat: number; lng: number; accuracy: number; timestamp: number } = {
    lat: 51.5074,
    lng: -0.1278,
    accuracy: 50,
    timestamp: Date.now()
  };

  private constructor() {
    super();
    // Background interval ticker every 60 seconds to notify connected clients of incremental decay
    setInterval(() => {
      this.getCalculatedState();
    }, 60000);
  }

  public updateLocation(lat: number, lng: number, accuracy: number = 20) {
    this.lastLocation = { lat, lng, accuracy, timestamp: Date.now() };
    this.emit('location_update', this.lastLocation);
  }

  public getLastLocation() {
    return this.lastLocation;
  }

  public static getInstance(): StateManager {
    if (!StateManager.instance) {
      StateManager.instance = new StateManager();
    }
    return StateManager.instance;
  }

  public getCalculatedState(): PetState {
    const row = db.prepare('SELECT * FROM pet_state WHERE id = ?').get('primary_familiar') as any;
    if (!row) {
      throw new Error('Pet state not found');
    }

    const now = Date.now();
    const elapsedHours = Math.max(0, (now - row.last_tick_at) / (3600 * 1000));
    // Profile-aware "effective hours" (sleep ≈ paused, desk work = nap, lunch/after-work = pressure)
    const effHours = effectiveHours(row.last_tick_at, now);

    // Base decay rates per hour: Hunger 4.0%, Hydration 5.0%, Vitality 3.0%
    const newHunger = Math.max(0, Math.min(100, row.hunger - (effHours * 4.0)));
    const newHydration = Math.max(0, Math.min(100, row.hydration - (effHours * 5.0)));
    const newVitality = Math.max(0, Math.min(100, row.vitality - (effHours * 3.0)));

    if (elapsedHours > (1 / 60)) { // Update DB if more than 1 minute has elapsed
      db.prepare(`
        UPDATE pet_state
        SET hunger = ?, hydration = ?, vitality = ?, last_tick_at = ?
        WHERE id = ?
      `).run(newHunger, newHydration, newVitality, now, 'primary_familiar');
    }

    const vitalityIndex = Math.min(newHunger, newHydration, newVitality);
    let mood: MoodType = 'content';
    if (vitalityIndex >= 75) mood = 'thriving';
    else if (vitalityIndex >= 45) mood = 'content';
    else if (vitalityIndex >= 20) mood = 'depleted';
    else mood = 'dormant';

    const state: PetState = {
      id: row.id,
      name: row.name,
      level: row.level,
      exp: row.exp,
      hunger: Math.round(newHunger * 10) / 10,
      hydration: Math.round(newHydration * 10) / 10,
      vitality: Math.round(newVitality * 10) / 10,
      affinity: row.affinity as AffinityType,
      total_steps: row.total_steps,
      last_tick_at: now,
      created_at: row.created_at,
      mood,
      vitalityIndex: Math.round(vitalityIndex * 10) / 10
    };

    this.emit('state_update', state);
    return state;
  }

  public applyIngestion(nutrition: number, hydration: number, affinity: AffinityType): PetState {
    const current = this.getCalculatedState();
    const updatedHunger = Math.min(100, current.hunger + nutrition);
    const updatedHydration = Math.min(100, current.hydration + hydration);
    
    // Gain EXP on feeding
    let updatedExp = current.exp + Math.round((nutrition + hydration) / 2);
    let updatedLevel = current.level;
    const expNeeded = updatedLevel * 100;
    if (updatedExp >= expNeeded) {
      updatedLevel += 1;
      updatedExp -= expNeeded;
    }

    const now = Date.now();
    db.prepare(`
      UPDATE pet_state
      SET hunger = ?, hydration = ?, exp = ?, level = ?, affinity = ?, last_tick_at = ?
      WHERE id = ?
    `).run(updatedHunger, updatedHydration, updatedExp, updatedLevel, affinity, now, 'primary_familiar');

    return this.getCalculatedState();
  }

  public applyWalkSession(durationSeconds: number, distanceMeters: number, stepCount: number): { petState: PetState; vitalityRestored: number } {
    const current = this.getCalculatedState();
    
    // 1 km or ~15 mins walk restores up to 35% vitality
    const vitalityRestored = Math.min(45, Math.round((durationSeconds / 60) * 1.5 + (distanceMeters / 100) * 2.0));
    const updatedVitality = Math.min(100, current.vitality + vitalityRestored);
    const updatedTotalSteps = current.total_steps + stepCount;

    // Gain EXP on outdoor walk
    const expGained = Math.round(vitalityRestored * 1.5);
    let updatedExp = current.exp + expGained;
    let updatedLevel = current.level;
    if (updatedExp >= updatedLevel * 100) {
      updatedLevel += 1;
      updatedExp -= (updatedLevel - 1) * 100;
    }

    const now = Date.now();
    db.prepare(`
      UPDATE pet_state
      SET vitality = ?, total_steps = ?, exp = ?, level = ?, last_tick_at = ?
      WHERE id = ?
    `).run(updatedVitality, updatedTotalSteps, updatedExp, updatedLevel, now, 'primary_familiar');

    const petState = this.getCalculatedState();
    return { petState, vitalityRestored };
  }
}

export const stateManager = StateManager.getInstance();
