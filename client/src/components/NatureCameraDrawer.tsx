import React, { useState, useRef, useEffect } from 'react';
import { Camera, X, RefreshCw, Upload, Sparkles, AlertCircle, Volume2 } from 'lucide-react';
import { submitFeedPhoto } from '../lib/api';
import { playBase64Wav, speakWebSpeech } from '../lib/audio';
import type { IngestionResult, PetState } from '../lib/types';

interface NatureCameraDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onFeedingSuccess: (result: IngestionResult) => void;
}

export const NatureCameraDrawer: React.FC<NatureCameraDrawerProps> = ({
  isOpen,
  onClose,
  onFeedingSuccess
}) => {
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<IngestionResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize camera stream when drawer opens
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setLastResult(null);
      setErrorMsg(null);
      return;
    }

    startCamera();
    return () => {
      stopCamera();
    };
  }, [isOpen, facingMode]);

  const startCamera = async () => {
    stopCamera();
    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      console.warn('Camera access error:', err);
      setErrorMsg('Camera access unavailable. You can use the photo upload button below.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  const toggleFacingMode = () => {
    setFacingMode(prev => (prev === 'environment' ? 'user' : 'environment'));
  };

  // Compress image to max 1024x1024 JPEG Blob
  const compressToBlob = (canvas: HTMLCanvasElement): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        blob => {
          if (blob) resolve(blob);
          else reject(new Error('Canvas compression failed'));
        },
        'image/jpeg',
        0.85
      );
    });
  };

  const processBlob = async (blob: Blob) => {
    setIsProcessing(true);
    setErrorMsg(null);
    setLastResult(null);

    try {
      const result = await submitFeedPhoto(blob);
      setLastResult(result);
      onFeedingSuccess(result);

      // Play audio response
      if (result.audioBase64) {
        playBase64Wav(result.audioBase64);
      } else if (result.reactionDialogue) {
        speakWebSpeech(result.reactionDialogue);
      }

      // Haptic feedback if supported
      if ('vibrate' in navigator) {
        if (result.isAuthentic) {
          navigator.vibrate([40, 60, 40]);
        } else {
          navigator.vibrate([100, 50, 100]);
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Ingestion failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCapture = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    const canvas = document.createElement('canvas');
    const maxDim = 1024;
    let w = video.videoWidth || 640;
    let h = video.videoHeight || 480;

    if (w > maxDim || h > maxDim) {
      if (w > h) {
        h = Math.round((h * maxDim) / w);
        w = maxDim;
      } else {
        w = Math.round((w * maxDim) / h);
        h = maxDim;
      }
    }

    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, w, h);
    const blob = await compressToBlob(canvas);
    await processBlob(blob);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Load file into an image element to downscale
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      const maxDim = 1024;
      let w = img.width;
      let h = img.height;

      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }

      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);

      const blob = await compressToBlob(canvas);
      await processBlob(blob);
    };
    img.src = url;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col justify-between">
      {/* Top Header */}
      <div className="flex items-center justify-between p-4 z-10 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-2">
          <Camera className="w-5 h-5 text-emerald-400" />
          <span className="font-bold text-sm tracking-wide text-emerald-300">
            Feed Sporeling (Nature Snap)
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-full bg-slate-800/80 text-slate-300 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Viewfinder Center */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />

        {/* Reticle Guide Overlay */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-8">
          <div className="w-64 h-64 border-2 border-emerald-400/50 rounded-3xl relative animate-pulse-slow">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-black/60 px-3 py-0.5 rounded-full text-[11px] font-mono text-emerald-400">
              Target Moss / Bark / Leaves
            </div>
            <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-emerald-400"></div>
            <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-emerald-400"></div>
            <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-emerald-400"></div>
            <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-emerald-400"></div>
          </div>
        </div>

        {/* Processing Indicator */}
        {isProcessing && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-3 z-20">
            <Sparkles className="w-10 h-10 text-emerald-400 animate-spin" />
            <p className="font-bold text-sm text-emerald-200">Gemma 4 is inspecting nature specimen...</p>
            <p className="text-xs text-slate-400">Botanical verification & nutrient appraisal</p>
          </div>
        )}

        {/* Last Ingestion Result Card */}
        {lastResult && (
          <div className="absolute bottom-4 left-4 right-4 bg-biome-card/95 border border-biome-border rounded-2xl p-4 shadow-2xl z-20 animate-float">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                {lastResult.isAuthentic ? (
                  <Sparkles className="w-5 h-5 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-rose-400" />
                )}
                <div>
                  <h4 className="font-bold text-sm text-slate-100">
                    {lastResult.subject}
                  </h4>
                  <p className="text-xs text-slate-400 capitalize">
                    Affinity: {lastResult.affinity}
                  </p>
                </div>
              </div>

              {lastResult.isAuthentic ? (
                <div className="flex gap-2 text-xs font-mono font-bold">
                  {lastResult.nutritionGranted > 0 && (
                    <span className="text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800/40">
                      +{lastResult.nutritionGranted}% Food
                    </span>
                  )}
                  {lastResult.hydrationGranted > 0 && (
                    <span className="text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded-full border border-cyan-800/40">
                      +{lastResult.hydrationGranted}% Water
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-rose-400 bg-rose-950/60 px-2 py-0.5 rounded-full border border-rose-800/40 text-xs font-bold">
                  Rejected (Cheat Filter)
                </span>
              )}
            </div>

            <p className="text-xs italic text-emerald-200/90 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/60 flex items-center justify-between">
              <span>"{lastResult.reactionDialogue}"</span>
              {lastResult.audioBase64 && (
                <button
                  onClick={() => playBase64Wav(lastResult.audioBase64!)}
                  className="p-1 hover:text-emerald-300 ml-2"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              )}
            </p>
          </div>
        )}

        {errorMsg && (
          <div className="absolute top-20 left-4 right-4 bg-rose-950/90 border border-rose-800/80 rounded-xl p-3 text-xs text-rose-200 z-20">
            {errorMsg}
          </div>
        )}
      </div>

      {/* Bottom Controls Bar */}
      <div className="p-6 bg-gradient-to-t from-black via-black/80 to-transparent flex items-center justify-around z-10">
        {/* File Picker Fallback */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-3.5 rounded-full bg-slate-800/90 text-slate-300 hover:text-emerald-400 active:scale-95 transition-transform"
          title="Upload Photo"
        >
          <Upload className="w-5 h-5" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileUpload}
        />

        {/* Shutter Button */}
        <button
          disabled={isProcessing}
          onClick={handleCapture}
          className="w-18 h-18 rounded-full border-4 border-emerald-400 p-1 bg-white/10 hover:bg-white/20 active:scale-90 transition-transform flex items-center justify-center disabled:opacity-50"
        >
          <div className="w-14 h-14 rounded-full bg-emerald-400"></div>
        </button>

        {/* Flip Camera */}
        <button
          onClick={toggleFacingMode}
          className="p-3.5 rounded-full bg-slate-800/90 text-slate-300 hover:text-emerald-400 active:scale-95 transition-transform"
          title="Switch Camera"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
