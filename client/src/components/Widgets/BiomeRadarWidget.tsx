import { Compass, ExternalLink, MapPin, RefreshCw } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { type GpsLocation, locationTracker } from '../../lib/location';

export interface NatureSighting {
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

interface BiomeRadarWidgetProps {
  initialObservations?: NatureSighting[];
  initialCategory?: 'all' | 'fungi' | 'plants' | 'birds';
  onClose?: () => void;
}

export const BiomeRadarWidget: React.FC<BiomeRadarWidgetProps> = ({
  initialObservations,
  initialCategory = 'all',
}) => {
  const [category, setCategory] = useState<
    'all' | 'fungi' | 'plants' | 'birds'
  >(initialCategory);
  const [observations, setObservations] = useState<NatureSighting[]>(
    initialObservations || [],
  );
  const [gps, setGps] = useState<GpsLocation | null>(
    locationTracker.getLocation(),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<NatureSighting | null>(
    null,
  );

  useEffect(() => {
    const unsub = locationTracker.onLocation((loc) => {
      setGps(loc);
    });
    return unsub;
  }, []);

  const fetchObservations = useCallback(async () => {
    setIsLoading(true);
    try {
      const lat = gps?.latitude ?? 51.5074;
      const lng = gps?.longitude ?? -0.1278;
      const res = await fetch(
        `/api/pet/nature-map?lat=${lat}&lng=${lng}&category=${category}`,
      );
      if (res.ok) {
        const data = await res.json();
        setObservations(data.observations || []);
      }
    } catch (err) {
      console.warn('Nature map fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [gps?.latitude, gps?.longitude, category]);

  useEffect(() => {
    fetchObservations();
  }, [fetchObservations]);

  return (
    <div className="bg-slate-900/95 border border-emerald-800/80 rounded-2xl p-4 shadow-2xl backdrop-blur-xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="relative flex items-center justify-center">
            <Compass className="w-5 h-5 text-emerald-400 animate-spin-slow" />
            <div className="absolute w-2 h-2 rounded-full bg-emerald-400 animate-ping"></div>
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-300">
              Live Biome Radar
            </h4>
            <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
              <MapPin className="w-3 h-3 text-cyan-400" />
              {gps
                ? `${gps.latitude.toFixed(3)}°, ${gps.longitude.toFixed(3)}° (±${gps.accuracy}m)`
                : 'Acquiring GPS lock...'}
            </span>
          </div>
        </div>

        <button
          onClick={fetchObservations}
          disabled={isLoading}
          className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-emerald-400 disabled:opacity-50 transition-colors"
          title="Refresh Radar"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`}
          />
        </button>
      </div>

      {/* Category Filter Chips */}
      <div className="flex gap-1.5 p-1 bg-slate-950/80 rounded-xl mb-3 border border-slate-800 text-[11px] font-bold">
        {(['all', 'fungi', 'plants', 'birds'] as const).map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`flex-1 py-1 rounded-lg transition-colors capitalize ${
              category === cat
                ? 'bg-emerald-500 text-slate-950 font-extrabold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {cat === 'all'
              ? 'All'
              : cat === 'fungi'
                ? '🍄 Shrooms'
                : cat === 'plants'
                  ? '🌿 Flora'
                  : '🦅 Birds'}
          </button>
        ))}
      </div>

      {/* Visual Radar Scope */}
      <div className="relative w-full h-36 bg-slate-950 rounded-xl border border-slate-800/80 mb-3 flex items-center justify-center overflow-hidden">
        {/* Concentric rings */}
        <div className="absolute w-12 h-12 rounded-full border border-emerald-500/20"></div>
        <div className="absolute w-24 h-24 rounded-full border border-emerald-500/15"></div>
        <div className="absolute w-32 h-32 rounded-full border border-emerald-500/10"></div>
        {/* Crosshair lines */}
        <div className="absolute inset-x-0 top-1/2 h-px bg-emerald-500/10"></div>
        <div className="absolute inset-y-0 left-1/2 w-px bg-emerald-500/10"></div>

        {/* User position center blip */}
        <div className="w-3 h-3 rounded-full bg-cyan-400 shadow-lg shadow-cyan-400/50 z-10"></div>

        {/* Specimen blips */}
        {observations.slice(0, 10).map((obs, idx) => {
          // Map distance (0 to 3000m) to radius (0 to 60px)
          const radPx = Math.min(60, (obs.distanceMeters / 3000) * 60 + 15);
          // Angle based on direction
          const dirAngles: Record<string, number> = {
            N: -Math.PI / 2,
            NE: -Math.PI / 4,
            E: 0,
            SE: Math.PI / 4,
            S: Math.PI / 2,
            SW: (3 * Math.PI) / 4,
            W: Math.PI,
            NW: (-3 * Math.PI) / 4,
          };
          const angle = dirAngles[obs.direction] ?? idx * 0.7;
          const bx = Math.cos(angle) * radPx;
          const by = Math.sin(angle) * radPx;

          const dotColor =
            obs.category === 'fungi'
              ? 'bg-amber-400'
              : obs.category === 'birds'
                ? 'bg-sky-400'
                : 'bg-emerald-400';

          return (
            <button
              key={obs.id}
              onClick={() => setSelectedTarget(obs)}
              className={`absolute w-3 h-3 rounded-full ${dotColor} hover:scale-150 transition-transform cursor-pointer border border-slate-900 shadow-md`}
              style={{ transform: `translate(${bx}px, ${by}px)` }}
              title={`${obs.commonName} (${obs.distanceMeters}m ${obs.direction})`}
            />
          );
        })}

        {/* Distance legend */}
        <span className="absolute bottom-1 right-2 text-[9px] font-mono text-slate-500">
          3km Radar Range
        </span>
      </div>

      {/* Selected Target Banner or Specimen List */}
      {selectedTarget ? (
        <div className="bg-slate-950 p-2.5 rounded-xl border border-emerald-700/60 mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 overflow-hidden">
            {selectedTarget.photoUrl && (
              <img
                src={selectedTarget.photoUrl}
                alt={selectedTarget.commonName}
                className="w-10 h-10 rounded-lg object-cover border border-slate-800 shrink-0"
              />
            )}
            <div className="truncate">
              <span className="text-[10px] font-mono uppercase text-emerald-400 font-bold block">
                Target Lock • {selectedTarget.distanceMeters}m{' '}
                {selectedTarget.direction}
              </span>
              <p className="text-xs font-extrabold text-slate-100 truncate">
                {selectedTarget.commonName}
              </p>
              <p className="text-[10px] italic text-slate-400 truncate">
                {selectedTarget.scientificName}
              </p>
            </div>
          </div>
          <button
            onClick={() => setSelectedTarget(null)}
            className="text-[11px] text-slate-400 hover:text-white shrink-0 ml-2"
          >
            Clear
          </button>
        </div>
      ) : null}

      {/* Nearby Sightings Scroll List */}
      <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
        {observations.length === 0 ? (
          <p className="text-[11px] text-slate-400 text-center py-3">
            {isLoading
              ? 'Polling nature maps & satellite sightings...'
              : 'No cataloged sightings right here. Walk towards wild parkland!'}
          </p>
        ) : (
          observations.slice(0, 6).map((obs) => (
            <div
              key={obs.id}
              className="flex items-center justify-between p-2 rounded-xl bg-slate-950/70 border border-slate-800/80 hover:border-emerald-800/60 text-xs transition-colors"
            >
              <div className="flex items-center gap-2 overflow-hidden">
                {obs.photoUrl ? (
                  <img
                    src={obs.photoUrl}
                    alt={obs.commonName}
                    className="w-7 h-7 rounded-lg object-cover shrink-0 border border-slate-800"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-lg bg-emerald-950/80 border border-emerald-800/50 flex items-center justify-center shrink-0 text-emerald-400">
                    {obs.category === 'fungi'
                      ? '🍄'
                      : obs.category === 'birds'
                        ? '🦅'
                        : '🌿'}
                  </div>
                )}
                <div className="truncate">
                  <p className="font-bold text-[11px] text-slate-200 truncate">
                    {obs.commonName}
                  </p>
                  <p className="text-[9px] text-slate-400 italic truncate">
                    {obs.scientificName}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-800/40 text-emerald-300 font-bold">
                  {obs.direction} {obs.distanceMeters}m
                </span>
                <a
                  href={obs.inatUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1 text-slate-500 hover:text-cyan-400"
                  title="View on iNaturalist"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
