import React, { useState, useEffect } from 'react';
import { SporelingThreeCanvas, type CreatureAction, type AvatarStyle } from './avatar/SporelingThreeCanvas';
import { SPECIES, getSpecies, speciesForAffinity, type SpeciesId } from './avatar/plush/species';
import { VitalsHUD } from './components/VitalsHUD';
import { FieldCamera } from './components/FieldCamera';
import { fetchAchievements, type AchievementStatus, type CaptureResult } from './lib/captureApi';
import { captureHub } from './lib/captureHub';
import { CaptureResultCard } from './components/CaptureResultCard';
import { WalkModeModal } from './components/WalkModeModal';
import { VoiceAssistantBar } from './components/VoiceAssistantBar';
import { MemoriesDrawer } from './components/MemoriesDrawer';
import { DesktopSidebar } from './components/DesktopSidebar';
import { fetchPetState } from './lib/api';
import { notificationManager } from './lib/notifications';
import type { PetState } from './lib/types';
import { Camera, Footprints, BookOpen, Bell } from 'lucide-react';

export function App() {
  const [petState, setPetState] = useState<PetState | null>(null);
  const [avatarStyle, setAvatarStyle] = useState<AvatarStyle>('mochi');
  const [currentAction, setCurrentAction] = useState<CreatureAction>('idle');
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isWalkModalOpen, setIsWalkModalOpen] = useState(false);
  const [isMemoriesOpen, setIsMemoriesOpen] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isFeeding, setIsFeeding] = useState(false);
  const [alarmBanner, setAlarmBanner] = useState<string | null>(null);
  const [species, setSpecies] = useState<SpeciesId | null>(
    () => (localStorage.getItem('sporeling.species') as SpeciesId | null)
  );
  const chooseSpecies = (id: SpeciesId) => {
    setSpecies(id);
    localStorage.setItem('sporeling.species', id);
  };
  const [unlocked, setUnlocked] = useState<string[]>(['jolly']);
  const [achievements, setAchievements] = useState<AchievementStatus[]>([]);
  const [toast, setToast] = useState<CaptureResult | null>(null);
  useEffect(() => {
    fetchAchievements().then((a) => { setUnlocked(a.unlockedSpecies); setAchievements(a.achievements); });
    captureHub.start();
    return captureHub.subscribe({
      onResult: (r) => {
        handleFeedingSuccess({ petState: r.petState, isAuthentic: r.capture.isAuthentic });
        setAchievements(r.achievements);
        setUnlocked(r.unlockedSpecies);
        setToast(r);
        const fresh = r.newlyUnlocked.find((a) => a.unlocksSpecies);
        if (fresh) chooseSpecies(fresh.unlocksSpecies as SpeciesId);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const isUnlocked = (id: SpeciesId) => unlocked.includes(id);
  const [lockHint, setLockHintRaw] = useState<SpeciesId | null>(null);
  const setLockHint = (id: SpeciesId) => {
    setLockHintRaw(id);
    setTimeout(() => setLockHintRaw((cur) => (cur === id ? null : cur)), 4000);
  };
  const preferred: SpeciesId = species ?? speciesForAffinity(petState?.affinity);
  const activeSpecies: SpeciesId = isUnlocked(preferred) ? preferred : 'jolly';
  const lockInfo = (s: { unlockedBy?: string }) => achievements.find((a) => a.id === s.unlockedBy);

  // Fetch initial state & setup live Server-Sent Events (SSE)
  useEffect(() => {
    fetchPetState()
      .then(setPetState)
      .catch(err => console.warn('Initial state fetch error:', err));

    const eventSource = new EventSource('/api/events');

    eventSource.onmessage = (event) => {
      try {
        const state = JSON.parse(event.data);
        setPetState(state);
      } catch {
        // Heartbeat
      }
    };

    eventSource.onerror = () => {
      console.warn('SSE connection interrupted, retrying in background...');
    };

    const unsubAlarm = notificationManager.onAlarm(alarm => {
      setAlarmBanner(alarm.title);
      setCurrentAction('surprised');
      setTimeout(() => {
        setAlarmBanner(null);
        setCurrentAction('idle');
      }, 7000);
    });

    return () => {
      eventSource.close();
      unsubAlarm();
    };
  }, []);

  const handleFeedingSuccess = (result: any) => {
    if (result.petState) {
      setPetState(result.petState);
    }
    if (result.isAuthentic) {
      setIsFeeding(true);
      setCurrentAction('celebrating');
      setTimeout(() => {
        setIsFeeding(false);
        setCurrentAction('idle');
      }, 3500);
    } else {
      setCurrentAction('surprised');
      setTimeout(() => setCurrentAction('idle'), 3000);
    }
  };

  const handlePoke = () => {
    if ('vibrate' in navigator) {
      navigator.vibrate(30);
    }
    const moves: CreatureAction[] = ['surprised', 'confident', 'celebrating'];
    const pick = moves[Math.floor(Math.random() * moves.length)];
    setCurrentAction(pick);
    setTimeout(() => setCurrentAction('idle'), 2200);
  };

  return (
    <div className="relative w-screen h-screen bg-biome-dark overflow-hidden flex flex-row">
      {/* Main 3D Viewport & Controls */}
      <div className="relative flex-1 h-full overflow-hidden">
        {/* Top HUD: Vitals, Level, Mood, and Avatar Style Switcher */}
        <VitalsHUD
          petState={petState}
          avatarStyle={avatarStyle}
          onAvatarStyleChange={setAvatarStyle}
        />

        {/* 3D WebGL Three.js Procedural Avatar Canvas */}
        <div className="absolute inset-0 z-0">
          <SporelingThreeCanvas
            petState={petState}
            avatarStyle={avatarStyle}
            species={activeSpecies}
            currentAction={currentAction}
            isSpeaking={isSpeaking}
            isFeeding={isFeeding}
            onPoke={handlePoke}
          />
        </div>

        {/* Alarm Banner Alert Notification */}
        {alarmBanner && (
          <div className="absolute top-24 left-4 right-4 lg:left-8 lg:right-[440px] z-30 flex justify-center animate-bounce pointer-events-none">
            <div className="bg-amber-500 text-slate-950 font-bold px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2 border-2 border-amber-300 pointer-events-auto">
              <Bell className="w-5 h-5 animate-spin" />
              <span className="text-xs">{alarmBanner}</span>
            </div>
          </div>
        )}

        {/* Species Picker (plush mode) */}
        {avatarStyle === 'mochi' && (
          <div className="absolute bottom-36 lg:bottom-24 left-0 right-0 z-10 flex flex-col items-center gap-1.5 pointer-events-none">
            <div className="flex gap-1.5 bg-slate-950/50 backdrop-blur-md border border-white/10 rounded-full p-1 pointer-events-auto">
              {SPECIES.map((s) => {
                const locked = !isUnlocked(s.id);
                const info = lockInfo(s);
                const pct = info ? info.progress / info.goal : 0;
                return (
                  <button
                    key={s.id}
                    onClick={() => (locked ? setLockHint(s.id) : chooseSpecies(s.id))}
                    title={locked && info ? `${s.name} - locked: ${info.description} (${info.progress}/${info.goal})` : `${s.name} - ${s.blurb}`}
                    aria-label={s.name}
                    className={`relative w-10 h-10 rounded-full text-lg flex items-center justify-center transition-all duration-200 active:scale-90 ${
                      activeSpecies === s.id ? 'bg-white/20 scale-110 ring-2 ring-emerald-300/70' : locked ? '' : 'opacity-60 hover:opacity-100'
                    }`}
                  >
                    {locked && (
                      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 40 40" aria-hidden>
                        <circle cx="20" cy="20" r="18" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2.5" />
                        <circle cx="20" cy="20" r="18" fill="none" stroke="#fbbf24" strokeWidth="2.5"
                          strokeDasharray={`${pct * 113} 113`} strokeLinecap="round" />
                      </svg>
                    )}
                    <span className={locked ? 'grayscale opacity-40' : ''}>{s.emoji}</span>
                    {locked && <span className="absolute -bottom-0.5 -right-0.5 text-[10px]">🔒</span>}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] font-mono tracking-widest text-emerald-200/60 uppercase text-center px-4">
              {lockHint && lockInfo(getSpecies(lockHint))
                ? `🔒 ${getSpecies(lockHint).name}: ${lockInfo(getSpecies(lockHint))!.description} ${lockInfo(getSpecies(lockHint))!.progress}/${lockInfo(getSpecies(lockHint))!.goal}`
                : `${getSpecies(activeSpecies).name} • Drag to rotate • Tap to squish`}
            </p>
          </div>
        )}

        {/* Voice Assistant Speech & Mic Bar */}
        <VoiceAssistantBar
          petState={petState}
          onSpeakingStateChange={setIsSpeaking}
          onStateUpdate={setPetState}
          onActionTrigger={setCurrentAction}
        />

        {/* Mobile-Only Bottom Action Dock */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 p-3 pb-5 bg-gradient-to-t from-biome-dark via-biome-dark/95 to-transparent flex items-center justify-center gap-3">
          <button
            onClick={() => setIsCameraOpen(true)}
            className="flex-1 max-w-[125px] py-2.5 px-2 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-bold text-xs flex flex-col items-center gap-1 shadow-lg shadow-emerald-500/25 transition-transform"
          >
            <Camera className="w-4 h-4" />
            <span>Feed Nature</span>
          </button>

          <button
            onClick={() => setIsWalkModalOpen(true)}
            className="flex-1 max-w-[125px] py-2.5 px-2 rounded-2xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-bold text-xs flex flex-col items-center gap-1 shadow-lg shadow-amber-500/25 transition-transform"
          >
            <Footprints className="w-4 h-4" />
            <span>Walk Mode</span>
          </button>

          <button
            onClick={() => setIsMemoriesOpen(true)}
            className="flex-1 max-w-[125px] py-2.5 px-2 rounded-2xl bg-slate-800/90 hover:bg-slate-700 active:scale-95 text-emerald-300 font-bold text-xs flex flex-col items-center gap-1 border border-emerald-900/40 shadow-lg transition-transform"
          >
            <BookOpen className="w-4 h-4" />
            <span>Memories</span>
          </button>
        </div>
      </div>

      {/* Desktop Companion Sidebar Dock (Visible on Large Screens) */}
      <div className="hidden lg:block h-full">
        <DesktopSidebar
          petState={petState}
          avatarStyle={avatarStyle}
          onAvatarStyleChange={setAvatarStyle}
          currentAction={currentAction}
          onActionChange={setCurrentAction}
          onOpenFeed={() => setIsCameraOpen(true)}
          onOpenWalk={() => setIsWalkModalOpen(true)}
          onOpenMemories={() => setIsMemoriesOpen(true)}
          onStateUpdate={setPetState}
        />
      </div>

      {/* Drawers and Modals */}
      <FieldCamera
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
      />

      {/* Capture result toast (arrives async while camera is closed) */}
      {toast && !isCameraOpen && (
        <div className="fixed z-40 left-3 right-3 bottom-3 lg:left-auto lg:right-[440px] lg:w-[380px] max-h-[60vh] overflow-y-auto animate-float">
          <CaptureResultCard result={toast} onClose={() => setToast(null)} />
        </div>
      )}

      <WalkModeModal
        isOpen={isWalkModalOpen}
        onClose={() => setIsWalkModalOpen(false)}
        onWalkComplete={res => setPetState(res.petState)}
      />

      <MemoriesDrawer
        isOpen={isMemoriesOpen}
        onClose={() => setIsMemoriesOpen(false)}
      />
    </div>
  );
}

export default App;
