// Open geo services: Open-Meteo geocoding, OSM Overpass (POIs) and FOSSGIS OSRM foot routing.
// All free & keyless. Results are cached in-memory to be polite to public infra.

const UA = 'SporelingBiomeFamiliar/1.0 (local-first hackathon app)';

export interface GeoPlace {
  name: string;
  country?: string;
  admin1?: string;
  lat: number;
  lng: number;
  timezone?: string;
}

const geoCache = new Map<string, GeoPlace | null>();

/** Forward geocode a place name ("Tokyo", "Peak District") via Open-Meteo, Nominatim fallback. */
export async function geocode(query: string): Promise<GeoPlace | null> {
  const key = query.trim().toLowerCase();
  if (!key) return null;
  if (geoCache.has(key)) return geoCache.get(key)!;

  let place: GeoPlace | null = null;
  try {
    // Open-Meteo matches on the first token best, so try full string then the part before a comma.
    for (const q of [query, query.split(',')[0]]) {
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q.trim())}&count=1&language=en&format=json`, { signal: AbortSignal.timeout(6000) });
      const data = (await res.json()) as any;
      const r = data?.results?.[0];
      if (r) {
        place = { name: r.name, country: r.country, admin1: r.admin1, lat: r.latitude, lng: r.longitude, timezone: r.timezone };
        break;
      }
    }
  } catch (e: any) {
    console.warn('[Geo] Open-Meteo geocode failed:', e.message);
  }
  if (!place) {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`, {
        headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000)
      });
      const r = ((await res.json()) as any[])?.[0];
      if (r) place = { name: r.display_name.split(',')[0], lat: Number(r.lat), lng: Number(r.lon) };
    } catch (e: any) {
      console.warn('[Geo] Nominatim geocode failed:', e.message);
    }
  }
  geoCache.set(key, place);
  return place;
}

/** Reverse geocode to a short "Neighbourhood, City" label. */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const key = `r:${lat.toFixed(3)},${lng.toFixed(3)}`;
  if (geoCache.has(key)) return geoCache.get(key)?.name ?? null;
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=14`, {
      headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000)
    });
    const d = (await res.json()) as any;
    const a = d?.address || {};
    const name = [a.suburb || a.neighbourhood || a.village || a.town, a.city || a.county].filter(Boolean).join(', ') || null;
    geoCache.set(key, name ? { name, lat, lng } : null);
    return name;
  } catch {
    return null;
  }
}

// ───────────────────────── geometry helpers ─────────────────────────

export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3, toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR, dLon = (lon2 - lon1) * toR;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toR = Math.PI / 180;
  const y = Math.sin((lon2 - lon1) * toR) * Math.cos(lat2 * toR);
  const x = Math.cos(lat1 * toR) * Math.sin(lat2 * toR) - Math.sin(lat1 * toR) * Math.cos(lat2 * toR) * Math.cos((lon2 - lon1) * toR);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export const compass = (deg: number) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];

// ───────────────────────── walk planner ─────────────────────────

export type WalkType = 'park' | 'woods' | 'waterside' | 'country' | 'city';

export const WALK_TYPES: Record<WalkType, { label: string; emoji: string; blurb: string; query: string[] }> = {
  park: {
    label: 'Park stroll', emoji: '🌳', blurb: 'Green lawns, ponds and benches',
    query: ['nwr["leisure"~"^(park|nature_reserve|garden)$"]["name"]']
  },
  woods: {
    label: 'Woodland wander', emoji: '🍄', blurb: 'Trees, moss and fungi — best for foraging captures',
    query: ['nwr["natural"="wood"]', 'nwr["landuse"="forest"]', 'nwr["leisure"="nature_reserve"]']
  },
  waterside: {
    label: 'Waterside', emoji: '💧', blurb: 'Rivers, canals, lakes — hydration for me!',
    query: ['nwr["natural"="water"]["name"]', 'way["waterway"~"^(river|canal)$"]["name"]', 'nwr["leisure"="marina"]']
  },
  country: {
    label: 'Country ramble', emoji: '🌾', blurb: 'Meadows, tracks, heath and viewpoints',
    query: ['nwr["natural"~"^(heath|grassland|scrub|peak)$"]', 'nwr["landuse"="meadow"]', 'node["tourism"="viewpoint"]', 'way["highway"="bridleway"]']
  },
  city: {
    label: 'City explorer', emoji: '🏙️', blurb: 'Landmarks, street trees and hidden squares',
    query: ['nwr["historic"]["name"]', 'nwr["tourism"~"^(attraction|viewpoint|artwork|museum)$"]["name"]', 'nwr["leisure"="park"]["name"]']
  }
};

export interface WalkPoi {
  name: string;
  kind: string;
  lat: number;
  lng: number;
  distanceM: number;
  direction: string;
}

export interface WalkPlan {
  walkType: WalkType;
  label: string;
  targetMinutes: number;
  distanceM: number;
  durationMin: number;
  start: { lat: number; lng: number };
  waypoints: WalkPoi[];
  /** [lng, lat] pairs (GeoJSON order) */
  geometry: [number, number][];
  routed: boolean;
  summary: string;
}

const poiCache = new Map<string, { t: number; data: WalkPoi[] }>();
const WALK_SPEED_M_PER_MIN = 80; // ~4.8 km/h

function poiKind(tags: Record<string, string>): string {
  return tags.leisure || tags.natural || tags.landuse || tags.waterway || tags.tourism || tags.historic || tags.highway || 'spot';
}

export async function findWalkPois(lat: number, lng: number, type: WalkType, radiusM: number): Promise<WalkPoi[]> {
  const key = `${type}:${lat.toFixed(3)},${lng.toFixed(3)}:${Math.round(radiusM / 250)}`;
  const hit = poiCache.get(key);
  if (hit && Date.now() - hit.t < 30 * 60 * 1000) return hit.data;

  const r = Math.round(radiusM);
  const body = `[out:json][timeout:20];(${WALK_TYPES[type].query.map((q) => `${q}(around:${r},${lat},${lng});`).join('')});out center tags 80;`;
  const endpoints = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(body),
        signal: AbortSignal.timeout(22000)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as any;
      const seen = new Set<string>();
      const pois: WalkPoi[] = [];
      for (const el of data.elements || []) {
        const plat = el.lat ?? el.center?.lat, plng = el.lon ?? el.center?.lon;
        if (plat == null || plng == null) continue;
        const tags = el.tags || {};
        const kind = poiKind(tags);
        const name = tags.name || `Unnamed ${kind.replace(/_/g, ' ')}`;
        const dedupe = name + Math.round(plat * 500) + Math.round(plng * 500);
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        const d = distanceM(lat, lng, plat, plng);
        if (d < 60) continue;
        pois.push({ name, kind, lat: plat, lng: plng, distanceM: Math.round(d), direction: compass(bearingDeg(lat, lng, plat, plng)) });
      }
      poiCache.set(key, { t: Date.now(), data: pois });
      return pois;
    } catch (e: any) {
      console.warn(`[Geo] Overpass ${ep} failed:`, e.message);
    }
  }
  return [];
}

async function routeFoot(points: { lat: number; lng: number }[]): Promise<{ geometry: [number, number][]; distanceM: number } | null> {
  const coords = points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
  try {
    const res = await fetch(`https://routing.openstreetmap.de/routed-foot/route/v1/foot/${coords}?overview=full&geometries=geojson`, {
      headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(12000)
    });
    const d = (await res.json()) as any;
    const route = d?.routes?.[0];
    if (!route) return null;
    return { geometry: route.geometry.coordinates, distanceM: route.distance };
  } catch (e: any) {
    console.warn('[Geo] foot routing failed:', e.message);
    return null;
  }
}

/**
 * Builds a loop walk: start → 1-2 themed POIs → home, sized to the requested duration.
 * Waypoint choice prefers named places at ~35-45% of the total loop length, spread apart in bearing.
 */
export async function planWalk(lat: number, lng: number, type: WalkType, minutes: number): Promise<WalkPlan> {
  const targetM = Math.max(400, minutes * WALK_SPEED_M_PER_MIN);
  const ideal = targetM * 0.38; // straight-line radius; real paths are ~1.3x longer
  const radius = Math.min(6000, Math.max(500, targetM * 0.55));
  const pois = await findWalkPois(lat, lng, type, radius);

  const score = (p: WalkPoi) => Math.abs(p.distanceM - ideal) / ideal + (p.name.startsWith('Unnamed') ? 0.35 : 0);
  const ranked = [...pois].sort((a, b) => score(a) - score(b));

  const waypoints: WalkPoi[] = [];
  if (ranked[0]) {
    waypoints.push(ranked[0]);
    const b0 = bearingDeg(lat, lng, ranked[0].lat, ranked[0].lng);
    // Second POI: 40-110° off the first bearing, also near the ideal radius → a nice loop instead of out-and-back.
    const second = ranked.slice(1).find((p) => {
      const diff = Math.abs(((bearingDeg(lat, lng, p.lat, p.lng) - b0 + 540) % 360) - 180);
      return diff > 40 && diff < 110 && p.distanceM > ideal * 0.5 && p.distanceM < ideal * 1.4;
    });
    if (second && minutes >= 25) waypoints.push(second);
  }

  const start = { lat, lng };
  let geometry: [number, number][] = [];
  let dist = 0;
  let routed = false;

  if (waypoints.length) {
    let r = await routeFoot([start, ...waypoints, start]);
    // Too long? drop the second waypoint.
    if (r && waypoints.length > 1 && r.distanceM > targetM * 1.5) {
      waypoints.pop();
      r = await routeFoot([start, ...waypoints, start]);
    }
    if (r) {
      geometry = r.geometry; dist = r.distanceM; routed = true;
    }
  }
  if (!routed) {
    const pts = [start, ...waypoints, start];
    geometry = pts.map((p) => [p.lng, p.lat]);
    dist = pts.slice(1).reduce((s, p, i) => s + distanceM(pts[i].lat, pts[i].lng, p.lat, p.lng) * 1.3, 0);
  }

  const durationMin = Math.round(dist / WALK_SPEED_M_PER_MIN);
  const meta = WALK_TYPES[type];
  const summary = waypoints.length
    ? `${meta.label}: about ${(dist / 1000).toFixed(1)} km, roughly ${durationMin} minutes. Head ${waypoints[0].direction} to ${waypoints[0].name}` +
      (waypoints[1] ? `, loop past ${waypoints[1].name}` : '') + `, then back home.`
    : `I couldn't find a mapped ${meta.label.toLowerCase()} spot within reach, so try a ${minutes}-minute loop around the block and look for street trees and moss on walls!`;

  return {
    walkType: type, label: meta.label, targetMinutes: minutes,
    distanceM: Math.round(dist), durationMin, start, waypoints, geometry, routed, summary
  };
}
