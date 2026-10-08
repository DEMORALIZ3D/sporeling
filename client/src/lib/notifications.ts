// Web Notifications & Background Alarm Manager

export interface SporelingAlarm {
  id: string;
  title: string;
  fireAt: number; // timestamp
  type: 'walk' | 'hydrate' | 'stretch' | 'custom';
  repeatIntervalMins?: number;
}

const STORAGE_KEY = 'sporeling_alarms';

class NotificationManager {
  private alarms: SporelingAlarm[] = [];
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private onAlarmTriggeredCallbacks: ((alarm: SporelingAlarm) => void)[] = [];

  constructor() {
    this.loadAlarms();
    this.startChecker();
  }

  public async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    const res = await Notification.requestPermission();
    return res === 'granted';
  }

  public hasPermission(): boolean {
    if (!('Notification' in window)) return false;
    return Notification.permission === 'granted';
  }

  public getAlarms(): SporelingAlarm[] {
    return [...this.alarms];
  }

  public addAlarm(
    minutesFromNow: number,
    title: string,
    type: SporelingAlarm['type'] = 'walk',
  ): SporelingAlarm {
    const alarm: SporelingAlarm = {
      id: `alarm_${Math.random().toString(36).substring(2, 9)}`,
      title,
      fireAt: Date.now() + minutesFromNow * 60 * 1000,
      type,
    };

    this.alarms.push(alarm);
    this.saveAlarms();
    return alarm;
  }

  public removeAlarm(id: string) {
    this.alarms = this.alarms.filter((a) => a.id !== id);
    this.saveAlarms();
  }

  public onAlarm(callback: (alarm: SporelingAlarm) => void) {
    this.onAlarmTriggeredCallbacks.push(callback);
    return () => {
      this.onAlarmTriggeredCallbacks = this.onAlarmTriggeredCallbacks.filter(
        (cb) => cb !== callback,
      );
    };
  }

  private startChecker() {
    if (this.checkInterval) clearInterval(this.checkInterval);
    this.checkInterval = setInterval(() => {
      const now = Date.now();
      const ready = this.alarms.filter((a) => a.fireAt <= now);
      if (ready.length > 0) {
        this.alarms = this.alarms.filter((a) => a.fireAt > now);
        this.saveAlarms();
        ready.forEach((a) => {
          this.triggerAlarm(a);
        });
      }
    }, 2000);
  }

  private triggerAlarm(alarm: SporelingAlarm) {
    // 1. Play audio chime using Web Audio oscillator
    try {
      const ctx = new (
        window.AudioContext || (window as any).webkitAudioContext
      )();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880.0, ctx.currentTime + 0.3); // A5
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.8);
    } catch {
      // AudioContext policy
    }

    // 2. Dispatch Desktop Notification if permitted
    if (this.hasPermission()) {
      new Notification('🌿 Sporeling Reminder', {
        body: alarm.title,
        icon: '/spore.svg',
        tag: alarm.id,
      });
    }

    // 3. Notify subscribers in UI
    this.onAlarmTriggeredCallbacks.forEach((cb) => {
      cb(alarm);
    });
  }

  private saveAlarms() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.alarms));
    } catch {
      // Storage unavailable
    }
  }

  private loadAlarms() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const now = Date.now();
        this.alarms = (parsed as SporelingAlarm[]).filter(
          (a) => a.fireAt > now,
        );
      }
    } catch {
      this.alarms = [];
    }
  }
}

export const notificationManager = new NotificationManager();
