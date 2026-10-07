import React from 'react';
import { Sparkles, ShieldCheck, Droplets, Utensils, Volume2 } from 'lucide-react';
import type { IngestionResult } from '../../lib/types';
import { playBase64Wav } from '../../lib/audio';

interface BotanicalCardWidgetProps {
  ingestion: IngestionResult;
}

export const BotanicalCardWidget: React.FC<BotanicalCardWidgetProps> = ({ ingestion }) => {
  return (
    <div className="bg-slate-900/90 border border-emerald-700/60 rounded-2xl p-4 shadow-xl backdrop-blur-md relative overflow-hidden">
      <div className="absolute -top-10 -right-10 w-28 h-28 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none"></div>

      <div className="flex items-start justify-between mb-3 relative z-10">
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-emerald-400 font-bold mb-0.5">
            <Sparkles className="w-3 h-3" />
            Field Specimen Verified
          </div>
          <h4 className="text-sm font-extrabold text-slate-100">{ingestion.subject}</h4>
        </div>

        <span className="px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-800/60 text-emerald-300 font-mono text-[11px] capitalize font-bold">
          {ingestion.affinity}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3 relative z-10">
        <div className="bg-slate-950/70 p-2 rounded-xl border border-slate-800 flex items-center gap-2">
          <Utensils className="w-4 h-4 text-emerald-400 shrink-0" />
          <div>
            <span className="text-[10px] text-slate-400 block">Biomass</span>
            <span className="text-xs font-mono font-bold text-emerald-300">
              +{ingestion.nutritionGranted}%
            </span>
          </div>
        </div>

        <div className="bg-slate-950/70 p-2 rounded-xl border border-slate-800 flex items-center gap-2">
          <Droplets className="w-4 h-4 text-cyan-400 shrink-0" />
          <div>
            <span className="text-[10px] text-slate-400 block">Hydration</span>
            <span className="text-xs font-mono font-bold text-cyan-300">
              +{ingestion.hydrationGranted}%
            </span>
          </div>
        </div>
      </div>

      <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 text-xs italic text-emerald-200/90 flex items-center justify-between relative z-10">
        <span>"{ingestion.reactionDialogue}"</span>
        {ingestion.audioBase64 && (
          <button
            onClick={() => playBase64Wav(ingestion.audioBase64!)}
            className="p-1 hover:text-emerald-300 ml-2"
            title="Replay Voice"
          >
            <Volume2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
