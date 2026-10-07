import React, { useMemo } from 'react';
import { Footprints, Navigation, Clock, MapPin, ExternalLink } from 'lucide-react';

export interface WalkPlanData {
  walkType: string;
  label: string;
  targetMinutes: number;
  distanceM: number;
  durationMin: number;
  start: { lat: number; lng: number };
  waypoints: { name: string; kind: string; lat: number; lng: number; distanceM: number; direction: string }[];
  geometry: [number, number][];
  routed: boolean;
  summary: string;
}

const SIZE = 220;
const PAD = 18;

/** Radar-style route preview: projects the OSM foot route into a circular compass dial. */
export const WalkRouteWidget: React.FC<{ plan: WalkPlanData; onStart?: () => void }> = ({ plan, onStart }) => {
  const { path, wp, start, rings } = useMemo(() => {
    const cosLat = Math.cos((plan.start.lat * Math.PI) / 180);
    const pts = plan.geometry.length ? plan.geometry : [[plan.start.lng, plan.start.lat] as [number, number]];
    // metres relative to start
    const toXY = (lng: number, lat: number) => [
      (lng - plan.start.lng) * 111320 * cosLat,
      -(lat - plan.start.lat) * 110540
    ];
    const xy = pts.map(([lng, lat]) => toXY(lng, lat));
    const maxR = Math.max(150, ...xy.map(([x, y]) => Math.hypot(x, y)));
    const scale = (SIZE / 2 - PAD) / maxR;
    const c = SIZE / 2;
    const P = ([x, y]: number[]) => [c + x * scale, c + y * scale];
    const path = xy.map((p, i) => `${i ? 'L' : 'M'}${P(p)[0].toFixed(1)},${P(p)[1].toFixed(1)}`).join(' ');
    const wp = plan.waypoints.map((w) => ({ ...w, xy: P(toXY(w.lng, w.lat)) }));
    // ring every "nice" distance
    const step = maxR > 2000 ? 1000 : maxR > 800 ? 500 : 200;
    const rings = Array.from({ length: Math.floor(maxR / step) }, (_, i) => ({ r: (i + 1) * step * scale, label: `${((i + 1) * step) / 1000}km` }));
    return { path, wp, start: [c, c], rings };
  }, [plan]);

  const osmUrl = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=${plan.start.lat}%2C${plan.start.lng}%3B${
    plan.waypoints[0] ? `${plan.waypoints[0].lat}%2C${plan.waypoints[0].lng}` : `${plan.start.lat}%2C${plan.start.lng}`
  }`;

  return (
    <div className="bg-slate-900/90 border border-emerald-800/60 rounded-2xl p-4 shadow-xl backdrop-blur-md">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Footprints className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">{plan.label}</span>
        </div>
        {!plan.routed && <span className="text-[10px] text-amber-400">approximate</span>}
      </div>

      <div className="flex gap-3 items-center">
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="shrink-0 w-40 h-40 sm:w-[220px] sm:h-[220px]">
          <defs>
            <radialGradient id="wr-bg" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#064e3b" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#020617" stopOpacity="0.9" />
            </radialGradient>
            <filter id="wr-glow"><feGaussianBlur stdDeviation="2.2" /></filter>
          </defs>
          <circle cx={SIZE / 2} cy={SIZE / 2} r={SIZE / 2 - 2} fill="url(#wr-bg)" stroke="#065f46" />
          {rings.map((r) => (
            <g key={r.label}>
              <circle cx={SIZE / 2} cy={SIZE / 2} r={r.r} fill="none" stroke="#0f766e" strokeOpacity={0.35} strokeDasharray="2 4" />
              <text x={SIZE / 2 + 3} y={SIZE / 2 - r.r + 9} fontSize="7" fill="#5eead4" opacity={0.6}>{r.label}</text>
            </g>
          ))}
          {['N', 'E', 'S', 'W'].map((d, i) => {
            const a = (i * Math.PI) / 2, rr = SIZE / 2 - 9;
            return <text key={d} x={SIZE / 2 + Math.sin(a) * rr} y={SIZE / 2 - Math.cos(a) * rr + 3} fontSize="8" textAnchor="middle" fill={d === 'N' ? '#f87171' : '#64748b'} fontWeight={700}>{d}</text>;
          })}
          <path d={path} fill="none" stroke="#34d399" strokeWidth={4} strokeOpacity={0.35} filter="url(#wr-glow)" strokeLinejoin="round" />
          <path d={path} fill="none" stroke="#6ee7b7" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray="6 3">
            <animate attributeName="stroke-dashoffset" from="18" to="0" dur="1.2s" repeatCount="indefinite" />
          </path>
          {wp.map((w, i) => (
            <g key={i}>
              <circle cx={w.xy[0]} cy={w.xy[1]} r={6} fill="#f59e0b" opacity={0.25} />
              <circle cx={w.xy[0]} cy={w.xy[1]} r={3.5} fill="#fbbf24" />
              <text x={w.xy[0]} y={w.xy[1] + 2.5} fontSize="6" textAnchor="middle" fill="#1e293b" fontWeight={800}>{i + 1}</text>
            </g>
          ))}
          <circle cx={start[0]} cy={start[1]} r={5} fill="#22d3ee">
            <animate attributeName="r" values="4;6;4" dur="2s" repeatCount="indefinite" />
          </circle>
        </svg>

        <div className="flex-1 min-w-0 space-y-2 text-xs">
          <div className="grid grid-cols-2 gap-1.5">
            <div className="bg-slate-950/60 rounded-lg p-2 border border-slate-800">
              <Navigation className="w-3 h-3 text-cyan-400 mb-0.5" />
              <div className="font-mono font-bold text-slate-100">{(plan.distanceM / 1000).toFixed(1)} km</div>
            </div>
            <div className="bg-slate-950/60 rounded-lg p-2 border border-slate-800">
              <Clock className="w-3 h-3 text-emerald-400 mb-0.5" />
              <div className="font-mono font-bold text-slate-100">{plan.durationMin} min</div>
            </div>
          </div>
          <ol className="space-y-1">
            {plan.waypoints.map((w, i) => (
              <li key={i} className="flex items-start gap-1.5 text-slate-300">
                <MapPin className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                <span className="truncate"><b className="text-amber-300">{i + 1}.</b> {w.name} <span className="text-slate-500">· {w.direction}</span></span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="flex gap-2 mt-3">
        {onStart && (
          <button onClick={onStart} className="flex-1 py-2 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs hover:bg-emerald-400 transition-colors">
            Start walk
          </button>
        )}
        <a href={osmUrl} target="_blank" rel="noreferrer" className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs flex items-center gap-1 hover:text-white">
          <ExternalLink className="w-3 h-3" /> OSM
        </a>
      </div>
    </div>
  );
};

export interface WalkOptionsData {
  types: { id: string; label: string; emoji: string; blurb: string }[];
  durations: number[];
  preferred?: string;
  weather?: { conditions?: string; rainChance?: number; sunset?: string };
}

/** Tappable walk-type cards + duration chips; selections are sent back as conversation text. */
export const WalkOptionsWidget: React.FC<{ data: WalkOptionsData; onPick: (text: string) => void }> = ({ data, onPick }) => {
  const [type, setType] = React.useState<string | null>(null);
  return (
    <div className="bg-slate-900/90 border border-emerald-800/60 rounded-2xl p-3.5 shadow-xl backdrop-blur-md">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">Pick a walk</span>
        {data.weather?.conditions && (
          <span className="text-[10px] text-slate-400">{data.weather.conditions}{data.weather.sunset ? ` · sunset ${data.weather.sunset}` : ''}</span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
        {data.types.map((t) => (
          <button
            key={t.id}
            onClick={() => setType(t.id)}
            className={`text-left rounded-xl p-2 border transition-all ${
              type === t.id ? 'border-emerald-400 bg-emerald-900/50 scale-[1.02]' : 'border-slate-800 bg-slate-950/50 hover:border-emerald-700'
            }`}
          >
            <div className="text-base leading-none mb-1">{t.emoji}</div>
            <div className="text-[11px] font-bold text-slate-100 flex items-center gap-1">
              {t.label}{data.preferred === t.id && <span className="text-[9px] text-emerald-400">★</span>}
            </div>
            <div className="text-[9.5px] text-slate-400 leading-tight">{t.blurb}</div>
          </button>
        ))}
      </div>
      <div className={`mt-2.5 transition-opacity ${type ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
        <div className="text-[10px] text-slate-400 mb-1">How long?</div>
        <div className="flex flex-wrap gap-1.5">
          {data.durations.map((d) => (
            <button
              key={d}
              onClick={() => type && onPick(`${type} walk, ${d} minutes`)}
              className="px-3 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-700 text-emerald-200 text-xs font-semibold hover:bg-emerald-500/30"
            >
              {d < 60 ? `${d} min` : `${d / 60} h`.replace('.5 h', '½ h')}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
