import { useState, useRef, useCallback, useEffect } from 'react';

// Extend Window interface for TypeScript
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SpeechRecognition: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    webkitSpeechRecognition: any;
  }
}

interface UseVoiceServiceOptions {
  onSilenceDetected?: () => void;
  silenceTimeout?: number;
}

interface UseVoiceServiceReturn {
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  error: string | null;
  isSupported: boolean;
  startListening: () => Promise<void>;
  stopListening: () => void;
  resetTranscript: () => void;
}

export function useVoiceService(options: UseVoiceServiceOptions = {}): UseVoiceServiceReturn {
  const { onSilenceDetected, silenceTimeout = 1500 } = options;
  
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasSpokenRef = useRef(false);

  // Check browser support
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setIsSupported(!!SpeechRecognition);
  }, []);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const startSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    if (hasSpokenRef.current && onSilenceDetected) {
      silenceTimerRef.current = setTimeout(() => {
        onSilenceDetected();
      }, silenceTimeout);
    }
  }, [clearSilenceTimer, onSilenceDetected, silenceTimeout]);

  const stopListening = useCallback(() => {
    clearSilenceTimer();
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  }, [clearSilenceTimer]);

  const startListening = useCallback(async () => {
    setError(null);
    setTranscript('');
    setInterimTranscript('');
    hasSpokenRef.current = false;

    // Request microphone permission
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError('Microphone permission denied. Please allow microphone access to use voice input.');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Speech recognition is not supported in this browser.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let interim = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      if (finalTranscript) {
        hasSpokenRef.current = true;
        setTranscript(prev => prev + finalTranscript);
        setInterimTranscript('');
        startSilenceTimer();
      } else if (interim) {
        hasSpokenRef.current = true;
        setInterimTranscript(interim);
        clearSilenceTimer();
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        setError('Microphone access denied. Please enable microphone permissions.');
      } else if (event.error === 'no-speech') {
        // This is normal, don't show as error
        startSilenceTimer();
      } else {
        setError(`Speech recognition error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      clearSilenceTimer();
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      setError('Failed to start speech recognition. Please try again.');
    }
  }, [clearSilenceTimer, startSilenceTimer]);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
    hasSpokenRef.current = false;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearSilenceTimer();
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [clearSilenceTimer]);

  return {
    isListening,
    transcript,
    interimTranscript,
    error,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
  };
}
