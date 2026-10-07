import React from 'react';
import type { PetState } from '../lib/types';
import type { AvatarStyle } from '../avatar/SporelingThreeCanvas';
import { Droplets, Sparkles, Footprints, Utensils, CircleDot } from 'lucide-react';

interface VitalsHUDProps {
  petState: PetState | null;
  avatarStyle: AvatarStyle;
  onAvatarStyleChange: (style: AvatarStyle) => void;
}

export const VitalsHUD: React.FC<VitalsHUDProps> = ({ petState, avatarStyle, onAvatarStyleChange }) => {
  if (!petState) {
    return (
      <div className="absolute top-3 left-3 right-3 lg:left-8 lg:right-[416px] bg-biome-card/80 backdrop-blur-md border border-biome-border rounded-2xl p-4 animate-pulse">
        <div className="h-6 bg-emerald-950/40 rounded w-1/3 mb-2"></div>
        <div className="h-4 bg-emerald-950/30 rounded w-full"></div>
      </div>
    );
  }

  const { name, level, exp, hunger, hydration, vitality, mood, affinity } = petState;
  const expProgress = (exp % 100);

  const moodColors: Record<string, string> = {
    thriving: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
    content: 'bg-teal-500/20 text-teal-300 border-teal-500/40',
    depleted: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
    dormant: 'bg-purple-500/20 text-purple-400 border-purple-500/40'
  };

  const toggleStyle = () => {
    onAvatarStyleChange(avatarStyle === 'mochi' ? 'orb' : 'mochi');
  };

  return (
    <div className="absolute top-3 left-3 right-3 lg:left-8 lg:right-[416px] z-20 pointer-events-none transition-all">
      <div className="bg-biome-card/90 backdrop-blur-xl border border-biome-border/90 rounded-2xl p-3 shadow-2xl pointer-events-auto max-w-xl mx-auto lg:mx-0">
        {/* Top Header: Name, Level, Style Switcher Pill, Mood */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-sm tracking-wide text-emerald-400 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              {name}
            </span>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-800/50 text-emerald-300">
              Lv. {level}
            </span>

            {/* Quick In-HUD Style Switcher */}
            <button
              onClick={toggleStyle}
              className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-200 flex items-center gap-1 active:scale-95 transition-all"
              title="Switch avatar aesthetic"
            >
              {avatarStyle === 'mochi' ? (
                <>
                  <span>🌱 Mochi</span>
                </>
              ) : (
                <>
                  <CircleDot className="w-2.5 h-2.5 text-cyan-400" />
                  <span>✨ Muse Orb</span>
                </>
              )}
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${moodColors[mood] || moodColors.content}`}>
              {mood}
            </span>
            <span className="text-[10px] font-mono capitalize px-2 py-0.5 rounded-full bg-slate-800/70 text-slate-300 border border-slate-700/50">
              {affinity}
            </span>
          </div>
        </div>

        {/* EXP Bar */}
        <div className="w-full bg-slate-900/80 rounded-full h-1.5 mb-2 overflow-hidden">
          <div
            className="bg-gradient-to-r from-emerald-500 to-cyan-400 h-full rounded-full transition-all duration-500"
            style={{ width: `${expProgress}%` }}
          />
        </div>

        {/* Vital Stats Grid */}
        <div className="grid grid-cols-3 gap-2">
          {/* Hunger */}
          <div className="bg-slate-900/50 border border-emerald-950/40 rounded-xl p-1.5 flex flex-col gap-1">
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium">
              <span className="flex items-center gap-1">
                <Utensils className="w-2.5 h-2.5 text-emerald-400" />
                Nourish
              </span>
              <span className="font-mono text-emerald-300 font-bold">{Math.round(hunger)}%</span>
            </div>
            <div className="w-full bg-slate-800/80 rounded-full h-1 overflow-hidden">
              <div
                className="bg-emerald-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${hunger}%` }}
              />
            </div>
          </div>

          {/* Hydration */}
          <div className="bg-slate-900/50 border border-cyan-950/40 rounded-xl p-1.5 flex flex-col gap-1">
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium">
              <span className="flex items-center gap-1">
                <Droplets className="w-2.5 h-2.5 text-cyan-400" />
                Hydrate
              </span>
              <span className="font-mono text-cyan-300 font-bold">{Math.round(hydration)}%</span>
            </div>
            <div className="w-full bg-slate-800/80 rounded-full h-1 overflow-hidden">
              <div
                className="bg-cyan-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${hydration}%` }}
              />
            </div>
          </div>

          {/* Vitality */}
          <div className="bg-slate-900/50 border border-amber-950/40 rounded-xl p-1.5 flex flex-col gap-1">
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium">
              <span className="flex items-center gap-1">
                <Footprints className="w-2.5 h-2.5 text-amber-400" />
                Vitality
              </span>
              <span className="font-mono text-amber-300 font-bold">{Math.round(vitality)}%</span>
            </div>
            <div className="w-full bg-slate-800/80 rounded-full h-1 overflow-hidden">
              <div
                className="bg-gradient-to-r from-amber-500 to-emerald-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${vitality}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
