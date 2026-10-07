import React, { useState, useEffect } from 'react';
import { BookOpen, X, Sparkles, Utensils, Footprints, Search } from 'lucide-react';
import { fetchMemories, fetchHistory } from '../lib/api';
import type { MemoryRecord } from '../lib/types';

interface MemoriesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MemoriesDrawer: React.FC<MemoriesDrawerProps> = ({ isOpen, onClose }) => {
  const [tab, setTab] = useState<'memories' | 'ingestions' | 'walks'>('memories');
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [ingestions, setIngestions] = useState<any[]>([]);
  const [walks, setWalks] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    const mems = await fetchMemories();
    setMemories(mems);
    const hist = await fetchHistory();
    setIngestions(hist.ingestions || []);
    setWalks(hist.walks || []);
  };

  if (!isOpen) return null;

  const filteredMemories = memories.filter(m =>
    m.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-biome-card border-t sm:border border-biome-border rounded-t-3xl sm:rounded-3xl p-6 w-full max-w-md h-[80vh] flex flex-col shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-slate-800 text-slate-300 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-4">
          <BookOpen className="w-5 h-5 text-emerald-400" />
          <h3 className="font-extrabold text-base text-emerald-300">Biome Root Network</h3>
        </div>

        {/* Tab Buttons */}
        <div className="flex gap-2 p-1 bg-slate-900/80 rounded-xl mb-4 border border-slate-800">
          <button
            onClick={() => setTab('memories')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              tab === 'memories' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'
            }`}
          >
            Memories ({memories.length})
          </button>
          <button
            onClick={() => setTab('ingestions')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              tab === 'ingestions' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'
            }`}
          >
            Foraged Snacks
          </button>
          <button
            onClick={() => setTab('walks')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              tab === 'walks' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'
            }`}
          >
            Walks
          </button>
        </div>

        {/* Tab 1: Memories */}
        {tab === 'memories' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="relative mb-3">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search root memories..."
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {filteredMemories.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-xs">
                  No memories etched yet. Ask Sporeling: "Remember to..."
                </div>
              ) : (
                filteredMemories.map(m => (
                  <div key={m.id} className="bg-slate-900/50 border border-slate-800/80 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] uppercase font-bold text-emerald-400 font-mono px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/40">
                        {m.category}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {new Date(m.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-xs text-slate-200 leading-relaxed font-medium">{m.content}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Ingestions */}
        {tab === 'ingestions' && (
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {ingestions.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs">
                No nature snacks consumed yet. Tap the Camera button to feed Sporeling!
              </div>
            ) : (
              ingestions.map(ing => (
                <div key={ing.id} className="bg-slate-900/50 border border-slate-800/80 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-slate-100 flex items-center gap-1.5">
                      <Utensils className="w-3.5 h-3.5 text-emerald-400" />
                      {ing.subject}
                    </span>
                    <span className="text-[10px] font-mono text-emerald-400">
                      +{ing.nutrition_granted}% Food / +{ing.hydration_granted}% Water
                    </span>
                  </div>
                  <p className="text-[11px] italic text-slate-400">"{ing.dialogue_log}"</p>
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab 3: Walks */}
        {tab === 'walks' && (
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {walks.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs">
                No outdoor walk sessions logged yet. Tap Walk Mode to head outside!
              </div>
            ) : (
              walks.map(w => (
                <div key={w.id} className="bg-slate-900/50 border border-slate-800/80 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-amber-300 flex items-center gap-1.5">
                      <Footprints className="w-3.5 h-3.5 text-amber-400" />
                      {Math.round(w.duration_seconds / 60)} min walk ({w.distance_meters}m)
                    </span>
                    <span className="text-[10px] font-mono text-amber-400">
                      +{w.vitality_restored}% Vitality
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">{w.step_count} footsteps logged</p>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
