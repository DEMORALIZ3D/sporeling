import {
  Award,
  BookOpen,
  Camera,
  CircleDot,
  Footprints,
  HelpCircle,
  Send,
  Smile,
  Sparkles,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import type {
  AvatarStyle,
  CreatureAction,
} from '../avatar/SporelingThreeCanvas';
import { sendCompanionVoiceText } from '../lib/api';
import type { PetState } from '../lib/types';
import { BiomeRadarWidget } from './Widgets/BiomeRadarWidget';
import { TouchGrassAlarmWidget } from './Widgets/TouchGrassAlarmWidget';
import { WeatherForagingRadarWidget } from './Widgets/WeatherForagingRadarWidget';

interface DesktopSidebarProps {
  petState: PetState | null;
  avatarStyle: AvatarStyle;
  onAvatarStyleChange: (style: AvatarStyle) => void;
  currentAction: CreatureAction;
  onActionChange: (action: CreatureAction) => void;
  onOpenFeed: () => void;
  onOpenWalk: () => void;
  onOpenMemories: () => void;
  onStateUpdate: (state: PetState) => void;
}

export const DesktopSidebar: React.FC<DesktopSidebarProps> = ({
  petState,
  avatarStyle,
  onAvatarStyleChange,
  currentAction,
  onActionChange,
  onOpenFeed,
  onOpenWalk,
  onOpenMemories,
  onStateUpdate,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'alarms' | 'radar'>(
    'overview',
  );
  const [quickNote, setQuickNote] = useState('');
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);
  const [isAmbientPlaying, setIsAmbientPlaying] = useState(false);
  const [ambientAudioNode, setAmbientAudioNode] = useState<AudioContext | null>(
    null,
  );

  const handleQuickNote = async () => {
    if (!quickNote.trim() || isSubmittingNote) return;
    setIsSubmittingNote(true);
    try {
      const res = await sendCompanionVoiceText(`remember ${quickNote}`);
      setQuickNote('');
      onStateUpdate(res.petState);
      onActionChange('confident');
      setTimeout(() => onActionChange('idle'), 2500);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmittingNote(false);
    }
  };

  const toggleAmbientSound = () => {
    if (isAmbientPlaying) {
      if (ambientAudioNode) {
        ambientAudioNode.close();
        setAmbientAudioNode(null);
      }
      setIsAmbientPlaying(false);
    } else {
      try {
        const ctx = new (
          window.AudioContext || (window as any).webkitAudioContext
        )();
        const bufferSize = ctx.sampleRate * 2;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * 0.03;
        }

        const whiteNoise = ctx.createBufferSource();
        whiteNoise.buffer = buffer;
        whiteNoise.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 450;

        const gainNode = ctx.createGain();
        gainNode.gain.value = 0.4;

        whiteNoise.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(ctx.destination);
        whiteNoise.start();

        setAmbientAudioNode(ctx);
        setIsAmbientPlaying(true);
      } catch (err) {
        console.warn('Ambient audio could not start:', err);
      }
    }
  };

  return (
    <aside className="w-96 h-full bg-biome-card/85 backdrop-blur-2xl border-l border-biome-border flex flex-col justify-between p-5 z-30 shadow-2xl overflow-y-auto">
      {/* Sidebar Header */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h2 className="font-extrabold text-sm text-slate-100">
                Sporeling Studio
              </h2>
              <span className="text-[11px] font-mono text-emerald-400">
                Desktop Companion
              </span>
            </div>
          </div>

          {/* Ambient Sound Toggle */}
          <button
            onClick={toggleAmbientSound}
            className={`p-2 rounded-xl border transition-colors ${
              isAmbientPlaying
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
            }`}
            title={
              isAmbientPlaying
                ? 'Mute Forest Ambience'
                : 'Play Ambient Forest Wind'
            }
          >
            {isAmbientPlaying ? (
              <Volume2 className="w-4 h-4" />
            ) : (
              <VolumeX className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Visual Skin Switcher */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-2 mb-4">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block px-1 mb-1.5">
            Avatar Aesthetic Skin
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => onAvatarStyleChange('mochi')}
              className={`py-1.5 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                avatarStyle === 'mochi'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <span>🌱 Kawaii Mochi</span>
            </button>

            <button
              onClick={() => onAvatarStyleChange('orb')}
              className={`py-1.5 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                avatarStyle === 'orb'
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <CircleDot className="w-3.5 h-3.5" />
              <span>Muse Dots Orb</span>
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex p-1 bg-slate-950/70 border border-slate-800/80 rounded-xl mb-4 text-xs font-bold">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex-1 py-1.5 rounded-lg transition-colors ${
              activeTab === 'overview'
                ? 'bg-emerald-500 text-slate-950'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Express
          </button>
          <button
            onClick={() => setActiveTab('alarms')}
            className={`flex-1 py-1.5 rounded-lg transition-colors ${
              activeTab === 'alarms'
                ? 'bg-emerald-500 text-slate-950'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Alarms
          </button>
          <button
            onClick={() => setActiveTab('radar')}
            className={`flex-1 py-1.5 rounded-lg transition-colors ${
              activeTab === 'radar'
                ? 'bg-emerald-500 text-slate-950'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Radar
          </button>
        </div>

        {/* Tab 1: Expressive Moves & Controls */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            {/* Expressive Moves Selector */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3.5">
              <span className="text-[11px] uppercase font-bold text-slate-400 tracking-wider block mb-2">
                Pose & Expression Moves
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => onActionChange('thinking')}
                  className={`py-2 px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 ${
                    currentAction === 'thinking'
                      ? 'bg-purple-500/30 border-purple-500 text-purple-300'
                      : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:border-purple-500/50'
                  }`}
                >
                  <HelpCircle className="w-3.5 h-3.5 text-purple-400" />
                  <span>Thinking</span>
                </button>

                <button
                  onClick={() => onActionChange('surprised')}
                  className={`py-2 px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 ${
                    currentAction === 'surprised'
                      ? 'bg-amber-500/30 border-amber-500 text-amber-300'
                      : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:border-amber-500/50'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>Surprised</span>
                </button>

                <button
                  onClick={() => onActionChange('confident')}
                  className={`py-2 px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 ${
                    currentAction === 'confident'
                      ? 'bg-emerald-500/30 border-emerald-500 text-emerald-300'
                      : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:border-emerald-500/50'
                  }`}
                >
                  <Award className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Confident</span>
                </button>

                <button
                  onClick={() => onActionChange('celebrating')}
                  className={`py-2 px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 ${
                    currentAction === 'celebrating'
                      ? 'bg-cyan-500/30 border-cyan-500 text-cyan-300'
                      : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:border-cyan-500/50'
                  }`}
                >
                  <Smile className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Celebrate</span>
                </button>
              </div>

              {currentAction !== 'idle' && (
                <button
                  onClick={() => onActionChange('idle')}
                  className="w-full mt-2 py-1 text-[11px] text-slate-400 hover:text-white underline text-center"
                >
                  Reset to Natural Idle
                </button>
              )}
            </div>

            {/* Quick Memory Note Box */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3.5">
              <span className="text-[11px] uppercase font-bold text-slate-400 tracking-wider block mb-2">
                Quick Etch to Root Network
              </span>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={quickNote}
                  onChange={(e) => setQuickNote(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleQuickNote()}
                  placeholder="Note a quick thought or idea..."
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 outline-none focus:border-emerald-500"
                />
                <button
                  onClick={handleQuickNote}
                  disabled={!quickNote.trim() || isSubmittingNote}
                  className="p-2 rounded-xl bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400 disabled:opacity-30 transition-all active:scale-95"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Action Shortcuts */}
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={onOpenFeed}
                className="py-3 px-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-bold text-xs flex flex-col items-center gap-1.5 transition-colors"
              >
                <Camera className="w-4 h-4" />
                <span>Feed Nature</span>
              </button>
              <button
                onClick={onOpenWalk}
                className="py-3 px-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 font-bold text-xs flex flex-col items-center gap-1.5 transition-colors"
              >
                <Footprints className="w-4 h-4" />
                <span>Walk Mode</span>
              </button>
              <button
                onClick={onOpenMemories}
                className="py-3 px-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 font-bold text-xs flex flex-col items-center gap-1.5 transition-colors"
              >
                <BookOpen className="w-4 h-4" />
                <span>Memories</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: Alarms & Background Reminders */}
        {activeTab === 'alarms' && <TouchGrassAlarmWidget />}

        {/* Tab 3: Foraging Radar & Live Nature Map */}
        {activeTab === 'radar' && (
          <div className="space-y-4">
            <BiomeRadarWidget />
            <WeatherForagingRadarWidget />
          </div>
        )}
      </div>

      {/* Sidebar Footer */}
      <div className="pt-4 border-t border-slate-800/80 text-[11px] text-slate-500 flex items-center justify-between font-mono">
        <span>Gemma 4 E2B • Local</span>
        <span>Kokoro 24kHz</span>
      </div>
    </aside>
  );
};
