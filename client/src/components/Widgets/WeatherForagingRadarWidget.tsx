import {
  CloudRain,
  MapPin,
  Moon,
  Sparkles,
  Sun,
  Sunset,
  Wind,
} from 'lucide-react';
import type React from 'react';

interface WeatherData {
  temperatureC: number;
  humidityPercent: number;
  mossIndex: number;
  forecastSummary: string;
  conditions?: string;
  windKph?: number;
  isDay?: boolean;
  localTime?: string;
  sunset?: string;
  rainChance?: number;
  placeName?: string;
  isRemote?: boolean;
  weatherCode?: number;
}

interface WeatherForagingRadarWidgetProps {
  data?: WeatherData;
  onClose?: () => void;
}

export const WeatherForagingRadarWidget: React.FC<
  WeatherForagingRadarWidgetProps
> = ({ data }) => {
  if (!data) {
    return (
      <div className="bg-slate-900/90 border border-emerald-800/60 rounded-2xl p-4 text-xs text-slate-400">
        Ask me “what’s the weather?” or “weather in Tokyo” to fill this in.
      </div>
    );
  }
  const wet = (data.weatherCode ?? 0) >= 51;
  const Icon = wet ? CloudRain : data.isDay === false ? Moon : Sun;
  const prime = data.mossIndex >= 8;

  return (
    <div className="bg-slate-900/90 border border-emerald-800/60 rounded-2xl p-4 shadow-xl backdrop-blur-md">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Icon
            className={`w-4 h-4 ${wet ? 'text-cyan-400' : 'text-amber-300'}`}
          />
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-300 truncate flex items-center gap-1">
            {data.isRemote ? (
              <>
                <MapPin className="w-3 h-3" />
                {data.placeName}
              </>
            ) : (
              'Foraging Radar'
            )}
          </span>
        </div>
        <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-800/40 text-emerald-400 font-bold shrink-0">
          {data.localTime
            ? `${data.localTime} local`
            : prime
              ? 'Prime Conditions'
              : 'Fair'}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <Stat
          label="Temp"
          value={`${data.temperatureC}°C`}
          className="text-slate-100"
        />
        <Stat
          label="Humidity"
          value={`${data.humidityPercent}%`}
          className="text-cyan-400"
        />
        {data.isRemote ? (
          <Stat
            label="Wind"
            value={`${data.windKph ?? '–'} km/h`}
            className="text-slate-200"
          />
        ) : (
          <Stat
            label="Moss Index"
            value={`${data.mossIndex}/10`}
            className="text-emerald-400"
          />
        )}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-slate-400 mb-2">
        {data.conditions && (
          <span className="capitalize">{data.conditions}</span>
        )}
        {data.sunset && (
          <span className="flex items-center gap-1">
            <Sunset className="w-3 h-3" />
            {data.sunset}
          </span>
        )}
        {data.rainChance != null && (
          <span className="flex items-center gap-1">
            <CloudRain className="w-3 h-3" />
            {data.rainChance}%
          </span>
        )}
        {!data.isRemote && data.windKph != null && (
          <span className="flex items-center gap-1">
            <Wind className="w-3 h-3" />
            {data.windKph} km/h
          </span>
        )}
      </div>

      {!data.isRemote && (
        <div className="bg-emerald-950/40 border border-emerald-900/60 rounded-xl p-2.5 flex items-start gap-2 text-xs text-emerald-200">
          <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
          <p className="leading-snug">
            {prime ? (
              <>
                Damp and mild: a great window for photographing{' '}
                <strong>moss</strong> and <strong>fungi</strong>.
              </>
            ) : wet ? (
              <>
                Rain brings the fungi out tomorrow. Today a short covered city
                loop works.
              </>
            ) : (
              <>
                Dry spell. Look for <strong>lichen</strong> and{' '}
                <strong>bark</strong> textures, and water sources for me!
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string; className: string }> = ({
  label,
  value,
  className,
}) => (
  <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 text-center">
    <span className="text-[10px] text-slate-400 block mb-0.5">{label}</span>
    <span className={`font-mono text-sm font-bold ${className}`}>{value}</span>
  </div>
);
