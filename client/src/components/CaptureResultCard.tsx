import React from 'react';
import { Clock, MapPin, Copy, Trophy, Volume2, Moon, Satellite, Star, X } from 'lucide-react';
import type { CaptureResult } from '../lib/captureApi';

export const CaptureResultCard: React.FC<{ result: CaptureResult; onClose?: () => void }> = ({ result, onClose }) => {
  const c = result.capture;
  const sky = c.sky;
  return (
    <div className="relative rounded-3xl bg-slate-950/90 backdrop-blur-xl border border-white/10 p-4 text-slate-100 shadow-2xl">
      {onClose && (
        <button onClick={onClose} aria-label="Dismiss" className="absolute top-2.5 right-2.5 p-1.5 rounded-full text-slate-400 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      )}
      {result.newlyUnlocked.map((a) => (
        <div key={a.id} className="mb-2 flex items-center gap-2 rounded-xl bg-amber-400/15 border border-amber-300/30 px-2.5 py-1.5 text-xs text-amber-200">
          <Trophy className="w-4 h-4" /> {a.icon} {a.title} unlocked{a.unlocksSpecies ? ' — new familiar available!' : '!'}
        </div>
      ))}
      <div className="flex gap-3">
        <img src={c.thumbUrl} alt="" className="w-20 h-20 rounded-2xl object-cover flex-none" />
        <div className="min-w-0 flex-1 pr-5">
          <div className="flex items-center gap-2">
            {c.isAuthentic
              ? <span className="text-sm font-semibold truncate">{c.commonName}</span>
              : <span className="text-sm font-semibold text-rose-300">Rejected</span>}
            {c.isDuplicate && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-300 flex items-center gap-1 flex-none"><Copy className="w-3 h-3" />seen</span>
            )}
          </div>
          {c.scientificName && (
            <p className="text-xs italic text-slate-400 truncate">{c.scientificName} · {Math.round(c.confidence * 100)}%</p>
          )}
          {!c.isAuthentic && c.rejectionReason && <p className="text-xs text-rose-200/80">{c.rejectionReason}</p>}
          <div className="flex flex-wrap gap-1 mt-1.5">
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-900/60 text-emerald-200 capitalize">{c.category}</span>
            {c.isNight && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-900/70 text-indigo-200">night</span>}
            {c.tags.slice(0, 4).map((t) => (
              <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-slate-300">{t}</span>
            ))}
          </div>
          <div className="flex gap-3 mt-1.5 text-[10px] font-mono text-slate-400">
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(c.takenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            {c.latitude !== null && (
              <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{c.latitude.toFixed(3)}, {c.longitude!.toFixed(3)}</span>
            )}
          </div>
        </div>
      </div>

      {sky && (
        <div className="mt-3 rounded-2xl bg-indigo-950/50 border border-indigo-400/20 p-3 text-xs space-y-1.5">
          <p className="text-indigo-200 font-semibold">Overhead: {sky.zenithConstellation}</p>
          {sky.planets.slice(0, 3).map((p) => (
            <p key={p.name} className="flex items-center gap-1.5 text-slate-300"><Star className="w-3 h-3 text-amber-300" />{p.name} — {p.altitude}° {p.direction} in {p.constellation}</p>
          ))}
          {sky.stars.slice(0, 2).map((s) => (
            <p key={s.name} className="flex items-center gap-1.5 text-slate-300"><Star className="w-3 h-3 text-sky-200" />{s.name} ({s.constellation}) — {s.altitude}° {s.direction}</p>
          ))}
          {sky.moon && sky.moon.altitude > 0 && (
            <p className="flex items-center gap-1.5 text-slate-300"><Moon className="w-3 h-3" />{sky.moon.phaseName}, {sky.moon.illuminationPct}% — {sky.moon.direction}</p>
          )}
          {sky.satellites.slice(0, 3).map((s) => (
            <p key={s.name} className="flex items-center gap-1.5 text-slate-300"><Satellite className="w-3 h-3 text-emerald-300" />{s.name} — {s.altitude}° {s.direction}</p>
          ))}
        </div>
      )}

      <p className="mt-3 text-xs italic text-emerald-100/90 bg-white/5 rounded-xl p-2.5 flex items-start gap-2">
        <span className="flex-1">"{result.reactionDialogue}"</span>
        {result.audioUrl && (
          <button onClick={() => new Audio(result.audioUrl!).play()} aria-label="Replay voice" className="text-emerald-300 flex-none">
            <Volume2 className="w-4 h-4" />
          </button>
        )}
      </p>
    </div>
  );
};
