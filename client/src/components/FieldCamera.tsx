import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, SwitchCamera, MapPin, Sparkles, AlertCircle, Send } from 'lucide-react';
import { startCaptureSession, submitCapture, fetchAchievements, type CaptureResult, type AchievementStatus } from '../lib/captureApi';
import { captureHub, type PendingJob } from '../lib/captureHub';
import { notificationManager } from '../lib/notifications';
import { CaptureResultCard } from './CaptureResultCard';

interface FieldCameraProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ZoomCaps { min: number; max: number; step: number; hardware: boolean }

const DIGITAL_MAX = 5;

export const FieldCamera: React.FC<FieldCameraProps> = ({ isOpen, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nonceRef = useRef<string | null>(null);
  const geoRef = useRef<GeolocationPosition | null>(null);
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceIdx, setDeviceIdx] = useState(0);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [zoomCaps, setZoomCaps] = useState<ZoomCaps>({ min: 1, max: DIGITAL_MAX, step: 0.1, hardware: false });
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CaptureResult | null>(null);
  const [achievements, setAchievements] = useState<AchievementStatus[]>([]);
  const [hasFix, setHasFix] = useState(false);
  const [pending, setPending] = useState<PendingJob[]>([]);
  const [sentFlash, setSentFlash] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    return captureHub.subscribe({
      onProgress: setPending,
      onResult: (r) => { setResult(r); setAchievements(r.achievements); },
      onFailed: (_id, err) => setError(err)
    });
  }, [isOpen]);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const startStream = useCallback(async (deviceId?: string) => {
    stopStream();
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: facing } }),
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;

      const track = stream.getVideoTracks()[0];
      const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { zoom?: { min: number; max: number; step: number } };
      if (caps.zoom && caps.zoom.max > caps.zoom.min) {
        setZoomCaps({ min: caps.zoom.min, max: caps.zoom.max, step: caps.zoom.step || 0.1, hardware: true });
        setZoom(Math.max(caps.zoom.min, 1));
      } else {
        setZoomCaps({ min: 1, max: DIGITAL_MAX, step: 0.1, hardware: false });
        setZoom(1);
      }
      const settings = track.getSettings();
      if (settings.facingMode === 'user' || settings.facingMode === 'environment') setFacing(settings.facingMode);

      // labels are only populated after permission is granted
      const all = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
      setDevices(all);
      const idx = all.findIndex((d) => d.deviceId === settings.deviceId);
      if (idx >= 0) setDeviceIdx(idx);
    } catch (e: any) {
      setError(e?.name === 'NotAllowedError' ? 'Camera permission denied.' : 'Camera unavailable on this device.');
    }
  }, [facing]);

  // open / close lifecycle
  useEffect(() => {
    if (!isOpen) { stopStream(); setResult(null); return; }
    let watchId: number | null = null;
    startCaptureSession().then((s) => (nonceRef.current = s.nonce)).catch(() => setError('Backend offline — cannot start capture session.'));
    fetchAchievements().then((a) => setAchievements(a.achievements));
    startStream();
    notificationManager.requestPermission().catch(() => {});
    if ('geolocation' in navigator) {
      watchId = navigator.geolocation.watchPosition(
        (p) => { geoRef.current = p; setHasFix(true); },
        () => setHasFix(false),
        { enableHighAccuracy: true, maximumAge: 5000 }
      );
    }
    return () => {
      stopStream();
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // apply zoom
  useEffect(() => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (zoomCaps.hardware && track) {
      track.applyConstraints({ advanced: [{ zoom } as any] }).catch(() => {});
    }
  }, [zoom, zoomCaps.hardware]);

  const switchCamera = () => {
    if (devices.length > 1) {
      const next = (deviceIdx + 1) % devices.length;
      setDeviceIdx(next);
      startStream(devices[next].deviceId);
    } else {
      setFacing((f) => (f === 'environment' ? 'user' : 'environment'));
      setTimeout(() => startStream(), 0);
    }
  };

  const clampZoom = (z: number) => Math.min(zoomCaps.max, Math.max(zoomCaps.min, z));

  // pinch-to-zoom
  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchRef.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom };
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinchRef.current) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      setZoom(clampZoom(pinchRef.current.zoom * (d / pinchRef.current.dist)));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchRef.current = null;
  };
  const onWheel = (e: React.WheelEvent) => setZoom((z) => clampZoom(z * (e.deltaY < 0 ? 1.08 : 0.926)));

  const capture = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || busy) return;
    if (!nonceRef.current) { setError('Capture session not ready yet.'); return; }

    setFlash(true);
    setTimeout(() => setFlash(false), 140);
    navigator.vibrate?.(25);

    // crop for digital zoom so the server sees what the user framed
    const digital = zoomCaps.hardware ? 1 : zoom;
    const sw = video.videoWidth / digital, sh = video.videoHeight / digital;
    const sx = (video.videoWidth - sw) / 2, sy = (video.videoHeight - sh) / 2;
    const scale = Math.min(1, 2048 / Math.max(sw, sh));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(sw * scale);
    canvas.height = Math.round(sh * scale);
    const ctx = canvas.getContext('2d')!;
    if (facing === 'user') { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej()), 'image/jpeg', 0.92));

    const geo = geoRef.current;
    const thumb = (() => {
      const t = document.createElement('canvas');
      t.width = 96; t.height = 96;
      const s = Math.min(canvas.width, canvas.height);
      t.getContext('2d')!.drawImage(canvas, (canvas.width - s) / 2, (canvas.height - s) / 2, s, s, 0, 0, 96, 96);
      return t.toDataURL('image/jpeg', 0.7);
    })();
    setBusy(true);
    setError(null);
    try {
      const { jobId } = await submitCapture(blob, {
        nonce: nonceRef.current,
        capturedAt: Date.now(),
        latitude: geo?.coords.latitude,
        longitude: geo?.coords.longitude,
        accuracy: geo?.coords.accuracy,
        altitude: geo?.coords.altitude,
        heading: geo?.coords.heading,
        cameraLabel: devices[deviceIdx]?.label || facing,
        facingMode: facing,
        zoom
      });
      captureHub.track(jobId, thumb);
      setSentFlash(true);
      setTimeout(() => setSentFlash(false), 1800);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false); // upload done — Gemma keeps working in the background
    }
  };

  if (!isOpen) return null;

  const fungi = achievements.find((a) => a.id === 'mushroom_hunter');
  const plants = achievements.find((a) => a.id === 'sprout_keeper');
  const stars = achievements.find((a) => a.id === 'stargazer');
  const presets = [zoomCaps.min < 1 ? zoomCaps.min : null, 1, 2, 5].filter(
    (z): z is number => z !== null && z >= zoomCaps.min && z <= zoomCaps.max
  );
  const camLabel = devices[deviceIdx]?.label?.replace(/\(.*?\)/g, '').trim() || (facing === 'user' ? 'Front camera' : 'Rear camera');

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col select-none" style={{ touchAction: 'none' }}>
      {/* Viewfinder */}
      <div
        className="absolute inset-0 overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover transition-transform duration-75"
          style={{ transform: `${facing === 'user' ? 'scaleX(-1) ' : ''}scale(${zoomCaps.hardware ? 1 : zoom})` }}
        />
        {/* rule-of-thirds grid */}
        <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3">
          {Array.from({ length: 9 }).map((_, i) => <div key={i} className="border border-white/10" />)}
        </div>
        <div className={`absolute inset-0 bg-white pointer-events-none transition-opacity duration-150 ${flash ? 'opacity-80' : 'opacity-0'}`} />
      </div>

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))] bg-gradient-to-b from-black/70 to-transparent">
        <button onClick={onClose} aria-label="Close camera" className="p-2.5 rounded-full bg-black/50 backdrop-blur text-white active:scale-90 transition-transform">
          <X className="w-5 h-5" />
        </button>
        <div className="flex gap-2 text-[11px] font-mono">
          {fungi && <span className="px-2.5 py-1 rounded-full bg-black/50 backdrop-blur text-rose-200">🍄 {fungi.progress}/{fungi.goal}</span>}
          {plants && <span className="px-2.5 py-1 rounded-full bg-black/50 backdrop-blur text-emerald-200">🌱 {plants.progress}/{plants.goal}</span>}
          {stars && <span className="px-2.5 py-1 rounded-full bg-black/50 backdrop-blur text-indigo-200">⭐ {stars.progress}/{stars.goal}</span>}
          <span className={`px-2.5 py-1 rounded-full bg-black/50 backdrop-blur flex items-center gap-1 ${hasFix ? 'text-emerald-300' : 'text-amber-300'}`}>
            <MapPin className="w-3 h-3" />{hasFix ? 'GPS' : 'No GPS'}
          </span>
        </div>
      </div>

      <div className="flex-1" />

      {/* In-flight jobs — keep shooting while Gemma thinks */}
      {(pending.length > 0 || sentFlash) && (
        <div className="relative z-10 mx-3 mb-2 flex items-center gap-2 overflow-x-auto">
          {sentFlash && (
            <span className="flex-none flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/90 text-black text-xs font-semibold">
              <Send className="w-3.5 h-3.5" /> Sent! Keep exploring — I'll call you back.
            </span>
          )}
          {pending.map((j) => (
            <span key={j.jobId} className="flex-none flex items-center gap-2 pl-1 pr-3 py-1 rounded-full bg-black/60 backdrop-blur text-[11px] text-slate-200">
              {j.thumb ? <img src={j.thumb} alt="" className="w-7 h-7 rounded-full object-cover" /> : <Sparkles className="w-4 h-4 animate-spin text-emerald-300" />}
              <Sparkles className="w-3 h-3 animate-spin text-emerald-300" />{j.stage}…
            </span>
          ))}
        </div>
      )}

      {/* Latest result / errors */}
      {error && (
        <div className="relative z-10 mx-3 mb-2 rounded-2xl bg-rose-950/90 border border-rose-800/60 p-3 text-xs text-rose-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />{error}
          <button onClick={() => setError(null)} className="ml-auto" aria-label="Dismiss"><X className="w-4 h-4" /></button>
        </div>
      )}
      {result && (
        <div className="relative z-10 mx-3 mb-3 max-h-[45vh] overflow-y-auto">
          <CaptureResultCard result={result} onClose={() => setResult(null)} />
        </div>
      )}

      {/* Zoom controls */}
      <div className="relative z-10 flex flex-col items-center gap-2 mb-3">
        <div className="flex gap-1.5 bg-black/45 backdrop-blur rounded-full p-1">
          {presets.map((p) => (
            <button
              key={p}
              onClick={() => setZoom(p)}
              className={`min-w-9 h-9 px-2 rounded-full text-xs font-semibold transition-all active:scale-90 ${
                Math.abs(zoom - p) < 0.05 ? 'bg-white/90 text-black' : 'text-white/80'
              }`}
            >
              {Math.abs(zoom - p) < 0.05 ? `${p}×` : p}
            </button>
          ))}
        </div>
        <input
          type="range"
          min={zoomCaps.min}
          max={zoomCaps.max}
          step={zoomCaps.step}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="w-56 accent-emerald-400"
          aria-label="Zoom"
        />
        <span className="text-[10px] font-mono text-white/60">{zoom.toFixed(1)}× {zoomCaps.hardware ? 'optical' : 'digital'} · {camLabel}</span>
      </div>

      {/* Shutter row */}
      <div className="relative z-10 flex items-center justify-around pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2 bg-gradient-to-t from-black/80 to-transparent">
        <div className="w-12 h-12 rounded-2xl overflow-hidden bg-white/10 border border-white/20">
          {result && <img src={result.capture.thumbUrl} alt="" className="w-full h-full object-cover" />}
        </div>
        <button
          onClick={capture}
          disabled={busy}
          aria-label="Take photo"
          className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center active:scale-90 transition-transform disabled:opacity-50"
        >
          <span className={`w-16 h-16 rounded-full ${busy ? 'bg-emerald-400 animate-pulse' : 'bg-white'}`} />
        </button>
        <button
          onClick={switchCamera}
          aria-label="Switch camera"
          className="w-12 h-12 rounded-full bg-white/15 backdrop-blur text-white flex items-center justify-center active:scale-90 active:rotate-180 transition-transform duration-300"
        >
          <SwitchCamera className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
