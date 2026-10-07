// Audio playback and Web Speech Recognition utilities

let currentAudio: HTMLAudioElement | null = null;

export function playBase64Wav(base64Wav: string, onEnded?: () => void) {
  try {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }

    const audioSrc = `data:audio/wav;base64,${base64Wav}`;
    const audio = new Audio(audioSrc);
    currentAudio = audio;

    if (onEnded) {
      audio.onended = onEnded;
      audio.onerror = onEnded;
    }

    audio.play().catch(err => {
      console.warn('Audio auto-play prevented or failed:', err);
      if (onEnded) onEnded();
    });
  } catch (err) {
    console.error('Audio playback error:', err);
    if (onEnded) onEnded();
  }
}

// Fallback Speech Synthesis using Web Speech API in case Kokoro server buffer is unavailable
export function speakWebSpeech(text: string, onEnded?: () => void) {
  if (!('speechSynthesis' in window)) {
    if (onEnded) onEnded();
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.pitch = 1.25; // Whimsical organic creature pitch
  utterance.rate = 1.05;

  const voices = window.speechSynthesis.getVoices();
  const preferredVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha')));
  if (preferredVoice) {
    utterance.voice = preferredVoice;
  }

  if (onEnded) {
    utterance.onend = onEnded;
    utterance.onerror = onEnded;
  }

  window.speechSynthesis.speak(utterance);
}

// Web Speech Recognition
export interface SpeechRecognizer {
  start: () => void;
  stop: () => void;
  isSupported: boolean;
}

export function createSpeechRecognizer(
  onResult: (text: string) => void,
  onError: (err: any) => void,
  onEnd: () => void
): SpeechRecognizer {
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  if (!SpeechRecognition) {
    return {
      start: () => {},
      stop: () => {},
      isSupported: false
    };
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  recognition.onresult = (event: any) => {
    const transcript = event.results[0]?.[0]?.transcript || '';
    onResult(transcript);
  };

  recognition.onerror = (event: any) => {
    onError(event);
  };

  recognition.onend = () => {
    onEnd();
  };

  return {
    start: () => {
      try {
        recognition.start();
      } catch (err) {
        console.warn('Recognition already started:', err);
      }
    },
    stop: () => {
      try {
        recognition.stop();
      } catch (err) {
        // Ignored
      }
    },
    isSupported: true
  };
}
