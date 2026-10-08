import { Briefcase, Mountain, SlidersHorizontal, Sun, X } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import {
  type ActivityProfile,
  fetchSettings,
  type SettingsSnapshot,
  saveSettings,
} from '../lib/api';
import { EnginesPanel } from './EnginesPanel';

const ICONS: Record<ActivityProfile, React.ReactNode> = {
  outdoor: <Mountain className="w-4 h-4" />,
  balanced: <Sun className="w-4 h-4" />,
  desk: <Briefcase className="w-4 h-4" />,
  custom: <SlidersHorizontal className="w-4 h-4" />,
};

const PHASE_COPY: Record<string, string> = {
  sleeping: 'Sleeping: decay almost paused',
  work_nap: 'Napping while you work',
  pressure: 'Good time to head outside! Decay is faster now',
  normal: 'Normal decay',
};

const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`;

export const SettingsSheet: React.FC<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {
  const [snap, setSnap] = useState<SettingsSnapshot | null>(null);
  const [tab, setTab] = useState<'rhythm' | 'setup'>('rhythm');

  useEffect(() => {
    if (isOpen)
      fetchSettings()
        .then(setSnap)
        .catch(() => setSnap(null));
  }, [isOpen]);

  if (!isOpen) return null;
  const s = snap?.settings;
  const save = async (patch: Parameters<typeof saveSettings>[0]) =>
    setSnap(await saveSettings(patch));

  const HourSelect = ({
    label,
    value,
    k,
  }: {
    label: string;
    value: number;
    k: 'workStart' | 'workEnd' | 'wakeHour' | 'sleepStart';
  }) => (
    <label className="flex flex-col gap-1 text-[11px] text-slate-400">
      {label}
      <select
        value={value}
        onChange={(e) => save({ [k]: Number(e.target.value) })}
        className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-slate-100 text-xs"
      >
        {Array.from({ length: 24 }, (_, h) => (
          <option key={h} value={h}>
            {hourLabel(h)}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto bg-biome-card border border-emerald-900/60 rounded-t-3xl sm:rounded-3xl p-5 pb-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-emerald-200">Settings</h2>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex gap-1 p-1 mb-4 rounded-xl bg-slate-950/60 border border-slate-800">
          {(['rhythm', 'setup'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition ${tab === t ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'}`}
            >
              {t === 'rhythm' ? 'Your rhythm' : 'AI setup'}
            </button>
          ))}
        </div>

        {tab === 'setup' ? (
          <EnginesPanel onResetAll={() => fetchSettings().then(setSnap)} />
        ) : !s || !snap ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : (
          <>
            <p className="text-[11px] text-slate-400 mb-3">
              I tune how fast I get hungry to your life, but I'll always nudge
              you outside at least once a day.
            </p>

            <div className="grid grid-cols-2 gap-2 mb-4">
              {(Object.keys(snap.presets) as ActivityProfile[]).map((p) => (
                <button
                  key={p}
                  onClick={() => save({ profile: p })}
                  className={`text-left p-2.5 rounded-xl border transition ${
                    s.profile === p
                      ? 'border-emerald-400 bg-emerald-900/40'
                      : 'border-slate-800 bg-slate-950/50 hover:border-emerald-800'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-emerald-300 text-xs font-bold mb-0.5">
                    {ICONS[p]}
                    {snap.presets[p].label}
                  </div>
                  <div className="text-[10px] text-slate-400 leading-tight">
                    {snap.presets[p].blurb}
                  </div>
                </button>
              ))}
            </div>

            {s.profile === 'custom' && (
              <label className="block text-[11px] text-slate-400 mb-4">
                Decay speed:{' '}
                <b className="text-slate-100">
                  {s.customMultiplier.toFixed(2)}×
                </b>
                <input
                  type="range"
                  min={0.25}
                  max={2}
                  step={0.05}
                  value={s.customMultiplier}
                  onChange={(e) =>
                    save({ customMultiplier: Number(e.target.value) })
                  }
                  className="w-full accent-emerald-400"
                />
              </label>
            )}

            <div className="grid grid-cols-2 gap-2 mb-4">
              <HourSelect
                label="Work starts"
                value={s.workStart}
                k="workStart"
              />
              <HourSelect label="Work ends" value={s.workEnd} k="workEnd" />
              <HourSelect label="Wake up" value={s.wakeHour} k="wakeHour" />
              <HourSelect label="Bedtime" value={s.sleepStart} k="sleepStart" />
            </div>

            <label className="block text-[11px] text-slate-400 mb-4">
              Daily outdoor goal:{' '}
              <b className="text-slate-100">{s.dailyGoalMinutes} min</b>
              <input
                type="range"
                min={10}
                max={180}
                step={5}
                value={s.dailyGoalMinutes}
                onChange={(e) =>
                  save({ dailyGoalMinutes: Number(e.target.value) })
                }
                className="w-full accent-emerald-400"
              />
            </label>

            <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-3 text-xs">
              <div className="flex justify-between text-slate-300 mb-1.5">
                <span>Outside today</span>
                <span className="font-mono">
                  {snap.now.outdoorMinutesToday}/{s.dailyGoalMinutes} min
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden mb-2">
                <div
                  className="h-full bg-emerald-400 transition-all"
                  style={{
                    width: `${Math.min(100, (snap.now.outdoorMinutesToday / s.dailyGoalMinutes) * 100)}%`,
                  }}
                />
              </div>
              <div className="text-[11px] text-slate-400">
                {PHASE_COPY[snap.now.phase]} ({snap.now.mult}×)
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
