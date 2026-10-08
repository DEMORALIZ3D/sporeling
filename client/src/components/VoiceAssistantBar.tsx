import { Mic, MicOff, Send, Sparkles, X } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { sendCompanionVoiceText } from '../lib/api';
import {
  createSpeechRecognizer,
  playBase64Wav,
  speakWebSpeech,
} from '../lib/audio';
import type { CreatureAction, PetState } from '../lib/types';
import { BiomeRadarWidget } from './Widgets/BiomeRadarWidget';
import { TouchGrassAlarmWidget } from './Widgets/TouchGrassAlarmWidget';
import { WalkOptionsWidget, WalkRouteWidget } from './Widgets/WalkRouteWidget';
import { WeatherForagingRadarWidget } from './Widgets/WeatherForagingRadarWidget';

interface VoiceAssistantBarProps {
  petState: PetState | null;
  onSpeakingStateChange: (isSpeaking: boolean) => void;
  onStateUpdate: (state: PetState) => void;
  onActionTrigger: (action: CreatureAction) => void;
  onStartWalk?: () => void;
}

export const VoiceAssistantBar: React.FC<VoiceAssistantBarProps> = ({
  petState: _petState,
  onSpeakingStateChange,
  onStateUpdate,
  onActionTrigger,
  onStartWalk,
}) => {
  const [isListening, setIsListening] = useState(false);
  const [inputText, setInputText] = useState('');
  const [replyText, setReplyText] = useState<string | null>(null);
  const [activeWidget, setActiveWidget] = useState<{
    type: string;
    data?: any;
  } | null>(null);
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || isProcessing) return;

    setIsProcessing(true);
    setInputText('');
    setQuickReplies([]);
    onActionTrigger('thinking');

    try {
      const response = await sendCompanionVoiceText(textToSend);
      setReplyText(response.replyText);
      onStateUpdate(response.petState);
      setQuickReplies(response.quickReplies ?? []);

      if (response.action) {
        onActionTrigger(response.action);
        setTimeout(() => onActionTrigger('idle'), 4000);
      }

      if (response.widget) {
        setActiveWidget(response.widget);
      }

      // Play audio response
      onSpeakingStateChange(true);
      if (response.audioBase64) {
        playBase64Wav(response.audioBase64, () => onSpeakingStateChange(false));
      } else {
        speakWebSpeech(response.replyText, () => onSpeakingStateChange(false));
      }
    } catch (err) {
      console.error('Conversation error:', err);
      onSpeakingStateChange(false);
      onActionTrigger('idle');
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleMic = () => {
    if (isListening) {
      setIsListening(false);
    } else {
      setIsListening(true);
      const recognizer = createSpeechRecognizer(
        (transcript) => {
          setIsListening(false);
          if (transcript) {
            handleSendMessage(transcript);
          }
        },
        (err) => {
          console.warn('Speech recognition error:', err);
          setIsListening(false);
        },
        () => {
          setIsListening(false);
        },
      );

      if (recognizer.isSupported) {
        recognizer.start();
      } else {
        alert(
          'Web Speech API is not supported in this browser. You can type in the box below.',
        );
        setIsListening(false);
      }
    }
  };

  return (
    <div className="absolute bottom-24 lg:bottom-8 left-4 right-4 lg:left-8 lg:right-[416px] z-20 flex flex-col items-center gap-2 pointer-events-none transition-all">
      {/* Dynamic Custom HTML Widget Card */}
      {activeWidget && (
        <div className="w-full max-w-md pointer-events-auto relative animate-float mb-1">
          <button
            onClick={() => setActiveWidget(null)}
            className="absolute -top-2.5 -right-2.5 p-1 rounded-full bg-slate-800 text-slate-300 hover:text-white z-20 border border-slate-700 shadow-md"
            title="Dismiss widget"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          {activeWidget.type === 'weather_radar' && (
            <WeatherForagingRadarWidget data={activeWidget.data} />
          )}
          {activeWidget.type === 'alarm' && <TouchGrassAlarmWidget />}
          {activeWidget.type === 'biome_radar' && (
            <BiomeRadarWidget
              initialObservations={activeWidget.data?.observations}
              initialCategory={activeWidget.data?.category}
            />
          )}
          {activeWidget.type === 'walk_options' && (
            <WalkOptionsWidget
              data={activeWidget.data}
              onPick={(t) => handleSendMessage(t)}
            />
          )}
          {activeWidget.type === 'walk_route' && activeWidget.data && (
            <WalkRouteWidget plan={activeWidget.data} onStart={onStartWalk} />
          )}
        </div>
      )}

      {/* Quick replies */}
      {quickReplies.length > 0 && !isProcessing && (
        <div className="w-full max-w-md flex flex-wrap justify-center gap-1.5 pointer-events-auto">
          {quickReplies.map((q) => (
            <button
              key={q}
              onClick={() =>
                q === 'Start walk' && onStartWalk
                  ? onStartWalk()
                  : handleSendMessage(q)
              }
              className="px-3 py-1.5 rounded-full bg-slate-900/80 border border-emerald-800/70 text-emerald-200 text-xs font-semibold backdrop-blur-md hover:bg-emerald-900/60 active:scale-95 transition"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Speech Bubble / Spoken Dialogue Output */}
      {replyText && (
        <div className="bg-biome-card/95 border border-emerald-800/70 rounded-2xl px-4 py-2.5 shadow-2xl backdrop-blur-md max-w-md w-full pointer-events-auto animate-float flex items-start justify-between gap-2.5">
          <div className="flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-xs text-emerald-200 leading-relaxed font-medium">
              {replyText}
            </p>
          </div>
          <button
            onClick={() => setReplyText(null)}
            className="p-0.5 text-slate-400 hover:text-white shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Mic & Input Bar */}
      <div className="w-full max-w-md bg-biome-card/90 backdrop-blur-xl border border-biome-border/90 rounded-2xl p-1.5 flex items-center gap-2 shadow-2xl pointer-events-auto">
        <button
          onClick={toggleMic}
          className={`p-3 rounded-xl transition-all ${
            isListening
              ? 'bg-rose-500 text-white animate-pulse'
              : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
          }`}
          title={isListening ? 'Listening...' : 'Tap to speak'}
        >
          {isListening ? (
            <MicOff className="w-5 h-5" />
          ) : (
            <Mic className="w-5 h-5" />
          )}
        </button>

        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSendMessage(inputText)}
          placeholder={
            isListening
              ? 'Listening to your voice...'
              : 'Talk to Sporeling (e.g. "foraging weather")...'
          }
          className="flex-1 bg-transparent text-xs text-slate-100 placeholder:text-slate-500 outline-none px-2 font-medium"
        />

        <button
          onClick={() => handleSendMessage(inputText)}
          disabled={!inputText.trim() || isProcessing}
          className="p-2.5 rounded-xl bg-slate-800 text-slate-300 hover:text-emerald-400 disabled:opacity-30 disabled:hover:text-slate-300 transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
