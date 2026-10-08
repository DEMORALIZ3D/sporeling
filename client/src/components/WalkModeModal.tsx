import { Footprints, Play, Sparkles, Square, X } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { submitWalkSession } from '../lib/api';
import { playBase64Wav, speakWebSpeech } from '../lib/audio';
import type { WalkSessionResult } from '../lib/types';

interface WalkModeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onWalkComplete: (result: WalkSessionResult) => void;
}

// Calculate distance in meters between two GPS coordinates using Haversine formula
function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371e3; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export const WalkModeModal: React.FC<WalkModeModalProps> = ({
  isOpen,
  onClose,
  onWalkComplete,
}) => {
  const [isActive, setIsActive] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [distanceMeters, setDistanceMeters] = useState(0);
  const [stepCount, setStepCount] = useState(0);
  const [isFinishing, setIsFinishing] = useState(false);
  const [completedResult, setCompletedResult] =
    useState<WalkSessionResult | null>(null);

  const prevCoordRef = useRef<{ lat: number; lon: number } | null>(null);
  const geoWatchIdRef = useRef<number | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (isActive) {
      timer = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);

      // Start HTML5 Geolocation tracking
      if ('geolocation' in navigator) {
        geoWatchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            const { latitude, longitude } = pos.coords;
            if (prevCoordRef.current) {
              const deltaDist = calculateHaversineDistance(
                prevCoordRef.current.lat,
                prevCoordRef.current.lon,
                latitude,
                longitude,
              );

              // Ignore GPS drift (< 1.5m) and vehicle speeds (> 6 m/s / ~22 km/h)
              if (deltaDist >= 1.5 && deltaDist < 80) {
                setDistanceMeters((prev) => Math.round(prev + deltaDist));
                // Approximate 1 step every 0.75m
                setStepCount((prev) => Math.round(prev + deltaDist / 0.75));
              }
            }
            prevCoordRef.current = { lat: latitude, lon: longitude };
          },
          (err) => console.warn('Geolocation error:', err),
          { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
        );
      }
    } else {
      if (geoWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(geoWatchIdRef.current);
        geoWatchIdRef.current = null;
      }
    }

    return () => {
      clearInterval(timer);
      if (geoWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(geoWatchIdRef.current);
      }
    };
  }, [isActive]);

  const handleStart = () => {
    setIsActive(true);
    setElapsedSeconds(0);
    setDistanceMeters(0);
    setStepCount(0);
    setCompletedResult(null);
    prevCoordRef.current = null;
  };

  const handleFinish = async () => {
    setIsActive(false);
    setIsFinishing(true);

    try {
      const result = await submitWalkSession(
        elapsedSeconds,
        distanceMeters,
        stepCount,
      );
      setCompletedResult(result);
      onWalkComplete(result);

      if (result.audioBase64) {
        playBase64Wav(result.audioBase64);
      } else if (result.dialogue) {
        speakWebSpeech(result.dialogue);
      }
    } catch (err) {
      console.error('Walk finish error:', err);
    } finally {
      setIsFinishing(false);
    }
  };

  if (!isOpen) return null;

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-biome-card border border-biome-border rounded-3xl p-6 w-full max-w-sm shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-slate-800 text-slate-300 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-4">
          <Footprints className="w-6 h-6 text-amber-400" />
          <h3 className="font-extrabold text-lg text-amber-300">
            Touch Grass Walk Mode
          </h3>
        </div>

        <p className="text-xs text-slate-300 mb-6">
          Step away from your screen. Take your phone on an outdoor walk to
          restore Sporeling's Vitality and awaken dormant memory recall.
        </p>

        {/* Live Metrics Display */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 text-center">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
              Duration
            </span>
            <span className="font-mono text-xl font-extrabold text-emerald-400">
              {formatTime(elapsedSeconds)}
            </span>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 text-center">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
              Distance
            </span>
            <span className="font-mono text-xl font-extrabold text-cyan-400">
              {distanceMeters}m
            </span>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 text-center">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
              Steps
            </span>
            <span className="font-mono text-xl font-extrabold text-amber-400">
              {stepCount}
            </span>
          </div>
        </div>

        {/* Completed Feedback Card */}
        {completedResult && (
          <div className="bg-emerald-950/40 border border-emerald-800/60 rounded-2xl p-3.5 mb-6 text-xs text-emerald-200 animate-float">
            <div className="flex items-center gap-2 font-bold mb-1">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span>
                Walk Completed! +{completedResult.vitalityRestored}% Vitality
              </span>
            </div>
            <p className="italic text-[11px] text-emerald-300/90">
              "{completedResult.dialogue}"
            </p>
          </div>
        )}

        {/* Control Buttons */}
        <div className="flex gap-3">
          {!isActive ? (
            <button
              onClick={handleStart}
              className="flex-1 py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 font-bold text-slate-950 flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
            >
              <Play className="w-5 h-5 fill-current" />
              Start Outdoor Walk
            </button>
          ) : (
            <button
              disabled={isFinishing}
              onClick={handleFinish}
              className="flex-1 py-3.5 rounded-2xl bg-rose-500 hover:bg-rose-400 active:scale-95 font-bold text-white flex items-center justify-center gap-2 transition-all shadow-lg shadow-rose-500/20"
            >
              <Square className="w-5 h-5 fill-current" />
              Finish & Restore Vitality
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
