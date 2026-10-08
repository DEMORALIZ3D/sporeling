// Biodiversity & Weather Engine using Open iNaturalist & Open-Meteo APIs

export interface NatureObservation {
  id: number;
  commonName: string;
  scientificName: string;
  category: 'fungi' | 'plants' | 'birds';
  distanceMeters: number;
  direction: string;
  latitude: number;
  longitude: number;
  photoUrl: string | null;
  observedDate: string;
  inatUrl: string;
}

export interface BiomeWeather {
  temperatureC: number;
  humidityPercent: number;
  precipitationMm: number;
  weatherCode: number;
  mossIndex: number;
  forecastSummary: string;
  conditions?: string;
  windKph?: number;
  isDay?: boolean;
  localTime?: string;
  sunset?: string;
  sunrise?: string;
  rainChance?: number;
  timezone?: string;
  placeName?: string;
}

// In-memory cache to prevent spamming open APIs
const observationCache = new Map<
  string,
  { timestamp: number; data: NatureObservation[] }
>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Calculate compass direction (N, NE, E, SE, S, SW, W, NW) from user to target
function getBearingDirection(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): string {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.cos(dLon);
  let brng = (Math.atan2(y, x) * 180) / Math.PI;
  brng = (brng + 360) % 360;

  const bearings = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(brng / 45) % 8;
  return bearings[index];
}

// Distance in meters via Haversine
function getDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371e3;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export async function fetchNearbyNatureObservations(
  lat: number,
  lng: number,
  category: 'all' | 'fungi' | 'plants' | 'birds' = 'all',
  radiusKm: number = 3,
): Promise<NatureObservation[]> {
  const cacheKey = `${lat.toFixed(3)}_${lng.toFixed(3)}_${category}`;
  const cached = observationCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const taxaMap: Record<string, string> = {
    fungi: 'Fungi',
    plants: 'Plantae',
    birds: 'Aves',
    all: 'Fungi,Plantae,Aves',
  };

  const iconicTaxa = taxaMap[category] || taxaMap.all;
  const url = `https://api.inaturalist.org/v1/observations?lat=${lat}&lng=${lng}&radius=${radiusKm}&iconic_taxa=${iconicTaxa}&photos=true&order=desc&order_by=created_at&per_page=15`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'SporelingBiomeFamiliar/1.0' },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) throw new Error(`iNaturalist API error: ${res.status}`);
    const data = (await res.json()) as any;

    const observations: NatureObservation[] = (data.results || []).map(
      (item: any) => {
        const itemLat = item.geojson?.coordinates?.[1] || lat;
        const itemLng = item.geojson?.coordinates?.[0] || lng;
        const dist = getDistanceMeters(lat, lng, itemLat, itemLng);
        const dir = getBearingDirection(lat, lng, itemLat, itemLng);

        let cat: 'fungi' | 'plants' | 'birds' = 'plants';
        const iconic = item.taxon?.iconic_taxon_name || '';
        if (iconic === 'Fungi') cat = 'fungi';
        else if (iconic === 'Aves') cat = 'birds';

        return {
          id: item.id,
          commonName:
            item.taxon?.preferred_common_name ||
            item.species_guess ||
            'Wild Specimen',
          scientificName: item.taxon?.name || 'Unknown species',
          category: cat,
          distanceMeters: dist,
          direction: dir,
          latitude: itemLat,
          longitude: itemLng,
          photoUrl: item.photos?.[0]?.url?.replace('square', 'medium') || null,
          observedDate: item.observed_on || 'Recently',
          inatUrl:
            item.uri || `https://www.inaturalist.org/observations/${item.id}`,
        };
      },
    );

    // Sort by proximity
    observations.sort((a, b) => a.distanceMeters - b.distanceMeters);

    observationCache.set(cacheKey, {
      timestamp: Date.now(),
      data: observations,
    });
    return observations;
  } catch (err: any) {
    console.warn(`[Biodiversity] iNaturalist lookup failed: ${err.message}`);
    return [];
  }
}

const WMO: Record<number, string> = {
  0: 'clear skies',
  1: 'mostly clear',
  2: 'partly cloudy',
  3: 'overcast',
  45: 'foggy',
  48: 'icy fog',
  51: 'light drizzle',
  53: 'drizzle',
  55: 'heavy drizzle',
  61: 'light rain',
  63: 'rain',
  65: 'heavy rain',
  71: 'light snow',
  73: 'snow',
  75: 'heavy snow',
  80: 'rain showers',
  81: 'heavy showers',
  82: 'violent showers',
  95: 'thunderstorms',
  96: 'thunderstorms with hail',
  99: 'severe thunderstorms',
};
const describeWeatherCode = (c: number) => WMO[c] || 'mixed weather';

export async function fetchLiveBiomeWeather(
  lat: number,
  lng: number,
  placeName?: string,
): Promise<BiomeWeather> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,is_day&daily=sunset,sunrise,precipitation_probability_max&forecast_days=1&timezone=auto`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`Open-Meteo API error: ${res.status}`);
    const data = (await res.json()) as any;
    const current = data.current || {};

    const temp = Math.round(Number(current.temperature_2m ?? 15));
    const humidity = Math.round(Number(current.relative_humidity_2m ?? 65));
    const precip = Number(current.precipitation) || 0;
    const code = Number(current.weather_code) || 0;
    const wind = Math.round(Number(current.wind_speed_10m) || 0);
    const localTime =
      typeof current.time === 'string' ? current.time.slice(11, 16) : undefined;
    const sunset = data.daily?.sunset?.[0]?.slice(11, 16);
    const sunrise = data.daily?.sunrise?.[0]?.slice(11, 16);
    const rainChance = data.daily?.precipitation_probability_max?.[0];

    // Calculate Moss & Fungal Bloom Index (1 to 10)
    // High humidity (> 75%) and mild temps (10-20°C) with recent rain give 9-10
    let mossScore = 5.0;
    if (humidity >= 80) mossScore += 3.0;
    else if (humidity >= 65) mossScore += 1.5;

    if (temp >= 10 && temp <= 18) mossScore += 1.5;
    if (precip > 0) mossScore += 0.5;

    const finalScore = Math.min(
      10,
      Math.max(1, Math.round(mossScore * 10) / 10),
    );
    const conditions = describeWeatherCode(code);

    const where = placeName ? `In ${placeName} it's` : `It's`;
    let summary = `${where} ${temp}°C and ${conditions}, ${humidity}% humidity${localTime ? ` (local time ${localTime})` : ''}.`;
    if (!placeName) {
      summary +=
        finalScore >= 8
          ? ` Prime conditions for hydrated moss and active spore blooms!`
          : ` Great conditions for an invigorating walk outside!`;
      if (sunset) summary += ` Sunset is at ${sunset}.`;
    }

    return {
      temperatureC: temp,
      humidityPercent: humidity,
      precipitationMm: precip,
      weatherCode: code,
      mossIndex: finalScore,
      forecastSummary: summary,
      conditions,
      windKph: wind,
      isDay: current.is_day === 1,
      localTime,
      sunset,
      sunrise,
      rainChance,
      timezone: data.timezone,
      placeName,
    };
  } catch (err: any) {
    console.warn(`[Biodiversity] Open-Meteo lookup failed: ${err.message}`);
    return {
      temperatureC: 15,
      humidityPercent: 70,
      precipitationMm: 0,
      weatherCode: 0,
      mossIndex: 8.5,
      forecastSummary:
        "I couldn't reach the weather service just now, but it feels mild. Optimal for finding wild moss and tree bark!",
      placeName,
    };
  }
}
