// Continuous High-Accuracy GPS Tracker & Biome Telemetry

export interface GpsLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  speed: number | null;
  altitude: number | null;
  timestamp: number;
}

class LocationTracker {
  private currentLoc: GpsLocation | null = null;
  private watchId: number | null = null;
  private listeners: ((loc: GpsLocation) => void)[] = [];
  private lastServerPing = 0;

  constructor() {
    this.startTracking();
  }

  public startTracking() {
    if (!('geolocation' in navigator)) return;
    if (this.watchId !== null) return;

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy, speed, altitude } = pos.coords;
        const loc: GpsLocation = {
          latitude,
          longitude,
          accuracy: Math.round(accuracy),
          speed,
          altitude,
          timestamp: pos.timestamp,
        };
        this.currentLoc = loc;
        this.listeners.forEach((cb) => {
          cb(loc);
        });

        // Throttle server sync to once every 20s or significant movement
        if (Date.now() - this.lastServerPing > 20000) {
          this.lastServerPing = Date.now();
          this.syncToServer(loc);
        }
      },
      (err) => {
        console.warn('[Location] GPS error:', err.message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 12000,
      },
    );
  }

  public stopTracking() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  public getLocation(): GpsLocation | null {
    return this.currentLoc;
  }

  public onLocation(callback: (loc: GpsLocation) => void) {
    this.listeners.push(callback);
    if (this.currentLoc) callback(this.currentLoc);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  private async syncToServer(loc: GpsLocation) {
    try {
      await fetch('/api/pet/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loc),
      });
    } catch {
      // Offline
    }
  }
}

export const locationTracker = new LocationTracker();
