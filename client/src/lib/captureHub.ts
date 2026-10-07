import type { CaptureResult } from './captureApi';

/**
 * Tracks in-flight capture jobs. Results arrive over SSE (`event: capture`),
 * with a polling fallback so nothing is lost if the connection drops.
 *
 *  - App visible  → play the familiar's voice immediately
 *  - App hidden   → system notification; voice plays when the user comes back
 */

export interface PendingJob { jobId: string; queuedAt: number; stage: string; thumb?: string }

type Listener = {
  onResult?: (r: CaptureResult) => void;
  onProgress?: (jobs: PendingJob[]) => void;
  onFailed?: (jobId: string, error: string) => void;
};

const STORE = 'sporeling.pendingJobs';

class CaptureHub {
  private pending = new Map<string, PendingJob>();
  private listeners = new Set<Listener>();
  private queuedAudio: string[] = [];
  private es: EventSource | null = null;
  private poller: ReturnType<typeof setInterval> | null = null;
  private seen = new Set<string>();

  start() {
    if (this.es) return;
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) || '[]') as PendingJob[];
      saved.filter((j) => Date.now() - j.queuedAt < 3600_000).forEach((j) => this.pending.set(j.jobId, j));
    } catch { /* ignore */ }

    this.es = new EventSource('/api/events');
    this.es.addEventListener('capture', (e) => {
      const evt = JSON.parse((e as MessageEvent).data);
      if (evt.type === 'progress' && this.pending.has(evt.jobId)) {
        this.pending.get(evt.jobId)!.stage = evt.stage;
        this.emitProgress();
      } else if (evt.type === 'result') {
        this.handleResult(evt.result);
      } else if (evt.type === 'failed') {
        this.pending.delete(evt.jobId);
        this.persist();
        this.listeners.forEach((l) => l.onFailed?.(evt.jobId, evt.error));
      }
    });

    // Polling fallback (SSE dropped, phone slept, etc.)
    this.poller = setInterval(() => this.poll(), 8000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.poll();
        this.flushAudio();
      }
    });
  }

  track(jobId: string, thumb?: string) {
    this.pending.set(jobId, { jobId, queuedAt: Date.now(), stage: 'Queued', thumb });
    this.persist();
    this.emitProgress();
  }

  subscribe(l: Listener) {
    this.listeners.add(l);
    l.onProgress?.(this.list());
    return () => { this.listeners.delete(l); };
  }

  list() { return [...this.pending.values()]; }

  private async poll() {
    for (const job of this.pending.values()) {
      if (Date.now() - job.queuedAt < 5000) continue;
      try {
        const res = await fetch(`/api/capture/job/${job.jobId}`);
        if (res.status === 404) { this.pending.delete(job.jobId); this.persist(); this.emitProgress(); continue; }
        const data = await res.json();
        if (data.status === 'done' && data.result) this.handleResult(data.result);
        else if (data.status === 'failed') {
          this.pending.delete(job.jobId); this.persist();
          this.listeners.forEach((l) => l.onFailed?.(job.jobId, data.error));
        } else if (data.stage && data.stage !== job.stage) { job.stage = data.stage; this.emitProgress(); }
      } catch { /* offline */ }
    }
  }

  private handleResult(r: CaptureResult) {
    if (this.seen.has(r.jobId)) return;
    this.seen.add(r.jobId);
    this.pending.delete(r.jobId);
    this.persist();
    this.emitProgress();

    const title = r.capture.isAuthentic
      ? `${r.capture.category === 'sky' ? '✨' : r.capture.category === 'fungi' ? '🍄' : '🌿'} ${r.capture.commonName}`
      : '🙅 Specimen rejected';
    const unlocked = r.newlyUnlocked.length ? ` 🏆 ${r.newlyUnlocked.map((a) => a.title).join(', ')}!` : '';

    if (document.visibilityState === 'visible') {
      this.playAudio(r.audioUrl);
    } else {
      if (r.audioUrl) this.queuedAudio.push(r.audioUrl);
      if ('Notification' in window && Notification.permission === 'granted') {
        const n = new Notification(title, {
          body: (r.reactionDialogue.length > 140 ? r.reactionDialogue.slice(0, 137) + '…' : r.reactionDialogue) + unlocked,
          icon: r.capture.thumbUrl,
          tag: r.jobId
        });
        n.onclick = () => { window.focus(); n.close(); };
      }
    }
    navigator.vibrate?.(r.capture.isAuthentic ? [40, 60, 40] : [120, 60, 120]);
    this.listeners.forEach((l) => l.onResult?.(r));
  }

  private playAudio(url: string | null) {
    if (!url) return;
    new Audio(url).play().catch(() => this.queuedAudio.push(url)); // autoplay blocked → retry later
  }

  private flushAudio() {
    const next = this.queuedAudio.shift();
    if (!next) return;
    const a = new Audio(next);
    a.onended = () => this.flushAudio();
    a.play().catch(() => { /* needs a user gesture */ });
  }

  private emitProgress() { const l = this.list(); this.listeners.forEach((x) => x.onProgress?.(l)); }
  private persist() { localStorage.setItem(STORE, JSON.stringify(this.list().map(({ thumb, ...j }) => j))); }
}

export const captureHub = new CaptureHub();
