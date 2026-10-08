import {
  fetchLiveBiomeWeather,
  fetchNearbyNatureObservations,
} from '../ai/biodiversity.js';
import { geocode, planWalk, WALK_TYPES, type WalkType } from '../ai/geo.js';
import { db } from '../db/index.js';
import { stateManager } from '../state/state-manager.js';
import type { PetState } from '../state/types.js';

export interface ToolDefinition {
  name: string;
  description: string;
  minVitalityRequired: number;
  parameters: {
    type: 'object';
    properties: Record<
      string,
      { type: string; description?: string; enum?: string[] }
    >;
    required?: string[];
  };
  handler: (
    args: any,
    petState: PetState,
  ) => Promise<{ success: boolean; message: string; data?: any }>;
}

export const toolRegistry: Record<string, ToolDefinition> = {
  save_memory: {
    name: 'save_memory',
    description: 'Save an important personal fact, note, or reminder.',
    minVitalityRequired: 20,
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['work', 'personal', 'code', 'general'],
          description: 'Category of note',
        },
        content: {
          type: 'string',
          description: 'The text content to remember',
        },
      },
      required: ['content'],
    },
    handler: async ({ category = 'general', content }, petState) => {
      if (petState.vitalityIndex < 20) {
        return {
          success: false,
          message:
            'I am too withered to record memories right now... please take me outside for water and fresh air.',
        };
      }

      const id = `mem_${Math.random().toString(36).substring(2, 10)}`;
      const now = Date.now();
      db.prepare(`
        INSERT INTO memories (id, category, content, created_at)
        VALUES (?, ?, ?, ?)
      `).run(id, category, content, now);

      return {
        success: true,
        message: `Etched into my roots: "${content}"`,
        data: { id, category, content, createdAt: now },
      };
    },
  },

  recall_memory: {
    name: 'recall_memory',
    description: 'Search previous personal notes, ideas, or reminders.',
    minVitalityRequired: 40,
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Keyword or concept to search for',
        },
      },
      required: ['query'],
    },
    handler: async ({ query }, petState) => {
      if (petState.hunger < 40) {
        return {
          success: false,
          message:
            'My thoughts are foggy... I am starving for wild nature. Feed me some forest moss or bark before I can recall that!',
        };
      }

      const rows = db
        .prepare(`
        SELECT id, category, content, created_at
        FROM memories
        WHERE content LIKE ?
        ORDER BY created_at DESC
        LIMIT 5
      `)
        .all(`%${query}%`) as any[];

      if (rows.length === 0) {
        return {
          success: true,
          message: `I searched my root network for "${query}", but found no matching memories.`,
        };
      }

      const list = rows.map((r) => `• [${r.category}] ${r.content}`).join('\n');
      return {
        success: true,
        message: `Found memories:\n${list}`,
        data: rows,
      };
    },
  },

  check_outdoor_forecast: {
    name: 'check_outdoor_forecast',
    description:
      'Check live weather. Pass `location` for any named place (e.g. "Tokyo"); omit it for the user\'s current GPS position.',
    minVitalityRequired: 0,
    parameters: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'Optional place name, e.g. "Tokyo" or "Lake District"',
        },
      },
    },
    handler: async ({ location }: { location?: string }) => {
      if (location) {
        const place = await geocode(location);
        if (!place) {
          return {
            success: false,
            message: `I couldn't find a place called "${location}" on my maps. Could you say it another way?`,
          };
        }
        const label = [place.name, place.country].filter(Boolean).join(', ');
        const weather = await fetchLiveBiomeWeather(
          place.lat,
          place.lng,
          label,
        );
        return {
          success: true,
          message: weather.forecastSummary,
          data: { ...weather, lat: place.lat, lng: place.lng, isRemote: true },
        };
      }
      const loc = stateManager.getLastLocation();
      const weather = await fetchLiveBiomeWeather(loc.lat, loc.lng);
      return {
        success: true,
        message: `${weather.forecastSummary} Current Moss Index: ${weather.mossIndex}/10.`,
        data: { ...weather, lat: loc.lat, lng: loc.lng, isRemote: false },
      };
    },
  },

  plan_walk: {
    name: 'plan_walk',
    description:
      "Plan a looping walk from the user's location using OpenStreetMap. Needs walk_type and duration_min.",
    minVitalityRequired: 0,
    parameters: {
      type: 'object',
      properties: {
        walk_type: {
          type: 'string',
          enum: Object.keys(WALK_TYPES),
          description: 'Style of walk',
        },
        duration_min: {
          type: 'number',
          description: 'Desired walk length in minutes',
        },
      },
      required: ['walk_type', 'duration_min'],
    },
    handler: async ({
      walk_type,
      duration_min,
    }: {
      walk_type: WalkType;
      duration_min: number;
    }) => {
      const loc = stateManager.getLastLocation();
      const plan = await planWalk(
        loc.lat,
        loc.lng,
        walk_type,
        Math.max(10, Math.min(240, duration_min || 30)),
      );
      return {
        success: plan.waypoints.length > 0,
        message: plan.summary,
        data: plan,
      };
    },
  },

  scan_nearby_nature: {
    name: 'scan_nearby_nature',
    description:
      'Poll real-world biodiversity sightings (wild fungi, mushrooms, flora, birds) around your GPS coordinates via open nature maps.',
    minVitalityRequired: 0,
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['all', 'fungi', 'plants', 'birds'],
          description: 'Category to search',
        },
      },
    },
    handler: async ({ category = 'all' }) => {
      const loc = stateManager.getLastLocation();
      const observations = await fetchNearbyNatureObservations(
        loc.lat,
        loc.lng,
        category,
        3,
      );

      if (observations.length === 0) {
        return {
          success: true,
          message:
            'My root sensors are scanning... no recent cataloged sightings right here, but head towards the nearest tree canopy or park!',
          data: [],
        };
      }

      const topFew = observations.slice(0, 3);
      const summaryList = topFew
        .map((o) => `• ${o.commonName} (${o.distanceMeters}m ${o.direction})`)
        .join('\n');

      return {
        success: true,
        message: `Sensed nearby biodiversity around your coordinates:\n${summaryList}`,
        data: observations,
      };
    },
  },
};
