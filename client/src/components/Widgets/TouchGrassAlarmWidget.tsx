import { Bell, CheckCircle2, Clock, Trash2 } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import {
  notificationManager,
  type SporelingAlarm,
} from '../../lib/notifications';

export const TouchGrassAlarmWidget: React.FC = () => {
  const [alarms, setAlarms] = useState<SporelingAlarm[]>([]);
  const [hasPermission, setHasPermission] = useState(
    notificationManager.hasPermission(),
  );
  const [selectedMinutes, setSelectedMinutes] = useState(30);

  useEffect(() => {
    setAlarms(notificationManager.getAlarms());
    const unsub = notificationManager.onAlarm(() => {
      setAlarms(notificationManager.getAlarms());
    });
    return unsub;
  }, []);

  const handleRequestPermission = async () => {
    const granted = await notificationManager.requestPermission();
    setHasPermission(granted);
  };

  const handleAddAlarm = (type: 'walk' | 'hydrate' | 'stretch') => {
    let title = '';
    if (type === 'walk')
      title = `Time to Touch Grass! Take Sporeling on a ${selectedMinutes}m nature walk.`;
    else if (type === 'hydrate')
      title = `Hydration Check: Sip water and nourish Sporeling's roots!`;
    else title = `Stretch & Eye Break: Step away from screens for 5 minutes.`;

    notificationManager.addAlarm(selectedMinutes, title, type);
    setAlarms(notificationManager.getAlarms());
  };

  const handleRemove = (id: string) => {
    notificationManager.removeAlarm(id);
    setAlarms(notificationManager.getAlarms());
  };

  const formatRemaining = (fireAt: number) => {
    const diff = Math.max(0, Math.round((fireAt - Date.now()) / 1000));
    const mins = Math.floor(diff / 60);
    const secs = diff % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="bg-slate-900/90 border border-amber-800/50 rounded-2xl p-4 shadow-xl backdrop-blur-md">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-amber-300">
            Touch Grass Alarms
          </span>
        </div>
        {!hasPermission ? (
          <button
            onClick={handleRequestPermission}
            className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30"
          >
            Enable Alerts
          </button>
        ) : (
          <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> System Active
          </span>
        )}
      </div>

      {/* Quick Interval Selector */}
      <div className="flex items-center gap-1.5 mb-3 bg-slate-950/60 p-1 rounded-xl border border-slate-800">
        {[15, 30, 45, 60].map((mins) => (
          <button
            key={mins}
            onClick={() => setSelectedMinutes(mins)}
            className={`flex-1 py-1 rounded-lg text-xs font-mono font-bold transition-colors ${
              selectedMinutes === mins
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {mins}m
          </button>
        ))}
      </div>

      {/* Add Alarm Buttons */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => handleAddAlarm('walk')}
          className="flex-1 py-2 px-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Walk in {selectedMinutes}m</span>
        </button>
        <button
          onClick={() => handleAddAlarm('hydrate')}
          className="py-2 px-3 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
        >
          <span>Hydrate</span>
        </button>
      </div>

      {/* Active Alarms List */}
      <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
        {alarms.length === 0 ? (
          <p className="text-[11px] text-slate-500 text-center py-2">
            No active alarms. Set one to stay mindful while at your desk!
          </p>
        ) : (
          alarms.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between p-2 rounded-xl bg-slate-950/80 border border-slate-800 text-xs"
            >
              <div className="flex items-center gap-2 overflow-hidden">
                <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="truncate text-slate-200 text-[11px]">
                  {a.title}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono text-emerald-400 text-[11px] font-bold">
                  {formatRemaining(a.fireAt)}
                </span>
                <button
                  onClick={() => handleRemove(a.id)}
                  className="p-1 text-slate-500 hover:text-rose-400"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
