import * as Astronomy from 'astronomy-engine';
import * as satellite from 'satellite.js';

/** Bright naked-eye stars (J2000 RA hours, Dec degrees, visual magnitude). */
const BRIGHT_STARS: [string, number, number, number][] = [
  ['Sirius', 6.752, -16.716, -1.46], ['Canopus', 6.399, -52.696, -0.74], ['Arcturus', 14.261, 19.182, -0.05],
  ['Rigil Kentaurus', 14.66, -60.834, -0.27], ['Vega', 18.616, 38.784, 0.03], ['Capella', 5.278, 45.998, 0.08],
  ['Rigel', 5.242, -8.202, 0.13], ['Procyon', 7.655, 5.225, 0.34], ['Betelgeuse', 5.919, 7.407, 0.42],
  ['Achernar', 1.629, -57.237, 0.46], ['Hadar', 14.064, -60.373, 0.61], ['Altair', 19.846, 8.868, 0.76],
  ['Acrux', 12.443, -63.099, 0.77], ['Aldebaran', 4.599, 16.509, 0.86], ['Antares', 16.49, -26.432, 0.96],
  ['Spica', 13.42, -11.161, 0.97], ['Pollux', 7.755, 28.026, 1.14], ['Fomalhaut', 22.961, -29.622, 1.16],
  ['Deneb', 20.69, 45.28, 1.25], ['Mimosa', 12.795, -59.689, 1.25], ['Regulus', 10.139, 11.967, 1.4],
  ['Adhara', 6.977, -28.972, 1.5], ['Castor', 7.577, 31.888, 1.58], ['Shaula', 17.56, -37.104, 1.62],
  ['Bellatrix', 5.419, 6.35, 1.64], ['Elnath', 5.438, 28.608, 1.65], ['Alnilam', 5.604, -1.202, 1.69],
  ['Alioth', 12.9, 55.96, 1.77], ['Dubhe', 11.062, 61.751, 1.79], ['Mirfak', 3.405, 49.861, 1.79],
  ['Alkaid', 13.792, 49.313, 1.86], ['Polaris', 2.53, 89.264, 1.98], ['Mizar', 13.399, 54.925, 2.23],
  ['Schedar', 0.675, 56.537, 2.24]
];

const PLANETS = [
  Astronomy.Body.Moon, Astronomy.Body.Mercury, Astronomy.Body.Venus,
  Astronomy.Body.Mars, Astronomy.Body.Jupiter, Astronomy.Body.Saturn
];

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const compass = (az: number) => COMPASS[Math.round(az / 45) % 8];

export interface SkyObject { name: string; kind: 'star' | 'planet' | 'moon' | 'satellite'; altitude: number; azimuth: number; direction: string; magnitude?: number; constellation?: string }

export interface SkyReport {
  isNight: boolean;
  sunAltitude: number;
  twilight: 'day' | 'civil' | 'nautical' | 'astronomical' | 'night';
  zenithConstellation: string;
  moon: { altitude: number; direction: string; illuminationPct: number; phaseName: string } | null;
  planets: SkyObject[];
  stars: SkyObject[];
  constellations: string[];
  satellites: SkyObject[];
}

function phaseName(deg: number) {
  const names = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'];
  return names[Math.round(deg / 45) % 8];
}

/** Sun altitude at a place/time — used server-side to verify "night" captures. */
export function sunAltitude(lat: number, lng: number, when: Date): number {
  const obs = new Astronomy.Observer(lat, lng, 0);
  const eq = Astronomy.Equator(Astronomy.Body.Sun, when, obs, true, true);
  return Astronomy.Horizon(when, obs, eq.ra, eq.dec, 'normal').altitude;
}

// ---------------------------------------------------------------------------
// Satellites: CelesTrak "visual" group (brightest ~150 incl. ISS) — free, no key.
// ---------------------------------------------------------------------------
let tleCache: { at: number; sats: { name: string; rec: satellite.SatRec }[] } | null = null;

async function loadSatellites() {
  if (tleCache && Date.now() - tleCache.at < 12 * 3600 * 1000) return tleCache.sats;
  try {
    const res = await fetch('https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=tle', { signal: AbortSignal.timeout(8000) });
    const lines = (await res.text()).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const sats: { name: string; rec: satellite.SatRec }[] = [];
    for (let i = 0; i + 2 < lines.length + 1; i += 3) {
      if (!lines[i + 1]?.startsWith('1 ') || !lines[i + 2]?.startsWith('2 ')) continue;
      sats.push({ name: lines[i], rec: satellite.twoline2satrec(lines[i + 1], lines[i + 2]) });
    }
    tleCache = { at: Date.now(), sats };
  } catch {
    if (!tleCache) tleCache = { at: 0, sats: [] }; // offline in the woods: skip satellites
  }
  return tleCache.sats;
}

async function visibleSatellites(lat: number, lng: number, when: Date): Promise<SkyObject[]> {
  const sats = await loadSatellites();
  const gd = { latitude: satellite.degreesToRadians(lat), longitude: satellite.degreesToRadians(lng), height: 0.05 };
  const gmst = satellite.gstime(when);
  const out: SkyObject[] = [];
  for (const s of sats) {
    const pv = satellite.propagate(s.rec, when);
    if (!pv || typeof pv.position !== 'object' || !pv.position) continue;
    const look = satellite.ecfToLookAngles(gd, satellite.eciToEcf(pv.position as satellite.EciVec3<number>, gmst));
    const alt = satellite.radiansToDegrees(look.elevation);
    if (alt < 10) continue;
    const az = (satellite.radiansToDegrees(look.azimuth) + 360) % 360;
    out.push({ name: s.name.replace(/\s+/g, ' '), kind: 'satellite', altitude: Math.round(alt), azimuth: Math.round(az), direction: compass(az) });
  }
  // ISS first, then highest
  return out.sort((a, b) => (b.name.includes('ISS') ? 1 : 0) - (a.name.includes('ISS') ? 1 : 0) || b.altitude - a.altitude).slice(0, 6);
}

export async function buildSkyReport(lat: number, lng: number, when: Date): Promise<SkyReport> {
  const obs = new Astronomy.Observer(lat, lng, 0);
  const sunAlt = sunAltitude(lat, lng, when);
  const twilight = sunAlt > -0.833 ? 'day' : sunAlt > -6 ? 'civil' : sunAlt > -12 ? 'nautical' : sunAlt > -18 ? 'astronomical' : 'night';

  // Zenith: RA = local sidereal time, Dec = latitude
  const lst = (Astronomy.SiderealTime(when) + lng / 15 + 24) % 24;
  const zenithConstellation = Astronomy.Constellation(lst, lat).name;

  const planets: SkyObject[] = [];
  let moon: SkyReport['moon'] = null;
  for (const body of PLANETS) {
    const eq = Astronomy.Equator(body, when, obs, true, true);
    const hz = Astronomy.Horizon(when, obs, eq.ra, eq.dec, 'normal');
    if (body === Astronomy.Body.Moon) {
      const ill = Astronomy.Illumination(body, when);
      moon = {
        altitude: Math.round(hz.altitude), direction: compass(hz.azimuth),
        illuminationPct: Math.round(ill.phase_fraction * 100), phaseName: phaseName(Astronomy.MoonPhase(when))
      };
      continue;
    }
    if (hz.altitude < 5) continue;
    planets.push({
      name: String(body), kind: 'planet', altitude: Math.round(hz.altitude), azimuth: Math.round(hz.azimuth),
      direction: compass(hz.azimuth), magnitude: +Astronomy.Illumination(body, when).mag.toFixed(1),
      constellation: Astronomy.Constellation(eq.ra, eq.dec).name
    });
  }

  const stars: SkyObject[] = [];
  for (const [name, ra, dec, mag] of BRIGHT_STARS) {
    const hz = Astronomy.Horizon(when, obs, ra, dec, 'normal');
    if (hz.altitude < 10) continue;
    stars.push({
      name, kind: 'star', altitude: Math.round(hz.altitude), azimuth: Math.round(hz.azimuth),
      direction: compass(hz.azimuth), magnitude: mag, constellation: Astronomy.Constellation(ra, dec).name
    });
  }
  stars.sort((a, b) => (a.magnitude ?? 9) - (b.magnitude ?? 9));

  const constellations = [...new Set([zenithConstellation, ...stars.map((s) => s.constellation!)])].slice(0, 8);

  return {
    isNight: sunAlt < -6,
    sunAltitude: Math.round(sunAlt * 10) / 10,
    twilight,
    zenithConstellation,
    moon,
    planets: planets.sort((a, b) => (a.magnitude ?? 9) - (b.magnitude ?? 9)),
    stars: stars.slice(0, 10),
    constellations,
    satellites: await visibleSatellites(lat, lng, when)
  };
}

/** Plain-language fallback if Gemma is offline. */
export function describeSkyReport(r: SkyReport): string {
  const parts: string[] = [];
  parts.push(`Right above you is ${r.zenithConstellation}.`);
  if (r.planets[0]) parts.push(`${r.planets[0].name} is shining ${r.planets[0].altitude} degrees up in the ${r.planets[0].direction}.`);
  if (r.stars[0]) parts.push(`The brightest star up there is ${r.stars[0].name} in ${r.stars[0].constellation}.`);
  const iss = r.satellites.find((s) => s.name.includes('ISS'));
  if (iss) parts.push(`And the International Space Station is passing overhead in the ${iss.direction}!`);
  else if (r.satellites.length) parts.push(`${r.satellites.length} bright satellites are drifting overhead too.`);
  if (r.moon && r.moon.altitude > 0) parts.push(`The ${r.moon.phaseName.toLowerCase()} is ${r.moon.illuminationPct}% lit.`);
  return parts.join(' ');
}
