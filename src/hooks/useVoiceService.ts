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
  const isListeningRef = useRef(false); // Track listening state for callbacks
  const shouldRestartRef = useRef(false); // Track if we should auto-restart

  // Keep ref in sync with state
  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  // Check browser support
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const supported = !!SpeechRecognition;
    setIsSupported(supported);
    console.log('[Voice] Browser support check:', supported ? 'Supported' : 'Not supported');
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
        console.log('[Voice] Silence timer triggered');
        onSilenceDetected();
      }, silenceTimeout);
    }
  }, [clearSilenceTimer, onSilenceDetected, silenceTimeout]);

  const stopListening = useCallback(() => {
    console.log('[Voice] stopListening called');
    clearSilenceTimer();
    shouldRestartRef.current = false;
    isListeningRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (err) {
        console.log('[Voice] Stop error (may be already stopped):', err);
      }
    }
    setIsListening(false);
  }, [clearSilenceTimer]);

  const startListening = useCallback(async () => {
    console.log('[Voice] startListening called');
    setError(null);
    setTranscript('');
    setInterimTranscript('');
    hasSpokenRef.current = false;
    shouldRestartRef.current = true;

    // Stop any existing recognition first
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      } catch {
        // Ignore abort errors
      }
    }

    // Check browser support first
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.error('[Voice] Speech recognition not supported');
      setError('Speech recognition is not supported in this browser. Please use Chrome, Safari, or Edge.');
      return;
    }

    // Request microphone permission
    try {
      console.log('[Voice] Requesting microphone permission...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('[Voice] Microphone permission granted');
      // Stop the stream immediately - we just needed permission
      stream.getTracks().forEach(track => track.stop());
    } catch (err) {
      console.error('[Voice] Microphone permission denied:', err);
      setError('Microphone permission denied. Please allow microphone access in your browser settings.');
      return;
    }

    // Small delay to ensure permission is fully processed
    await new Promise(resolve => setTimeout(resolve, 300));

    // Create new recognition instance with settings BEFORE handlers
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    // Store reference BEFORE setting up handlers
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      console.log('[Voice] Recognition started successfully');
      setIsListening(true);
      isListeningRef.current = true;
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
        console.log('[Voice] Final transcript:', finalTranscript);
        hasSpokenRef.current = true;
        setTranscript(prev => prev + finalTranscript);
        setInterimTranscript('');
        startSilenceTimer();
      } else if (interim) {
        console.log('[Voice] Interim transcript:', interim);
        hasSpokenRef.current = true;
        setInterimTranscript(interim);
        clearSilenceTimer();
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (event: any) => {
      console.error('[Voice] Recognition error:', event.error);
      
      if (event.error === 'not-allowed') {
        setError('Microphone access denied. Please enable microphone permissions in your browser settings.');
        shouldRestartRef.current = false;
      } else if (event.error === 'no-speech') {
        // This is normal when user is silent - don't show error
        console.log('[Voice] No speech detected, will auto-restart if still listening');
      } else if (event.error === 'aborted') {
        // Aborted is usually intentional, don't show error
        console.log('[Voice] Recognition aborted');
      } else if (event.error === 'network') {
        setError('Network error during speech recognition. Please check your connection.');
        shouldRestartRef.current = false;
      } else if (event.error === 'audio-capture') {
        setError('No microphone found. Please connect a microphone and try again.');
        shouldRestartRef.current = false;
      } else {
        setError(`Speech recognition error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      console.log('[Voice] Recognition ended, shouldRestart:', shouldRestartRef.current, 'isListening:', isListeningRef.current);
      
      // Auto-restart if we should still be listening (handles no-speech timeout)
      if (shouldRestartRef.current && isListeningRef.current) {
        console.log('[Voice] Auto-restarting recognition...');
        setTimeout(() => {
          if (recognitionRef.current && shouldRestartRef.current) {
            try {
              recognitionRef.current.start();
            } catch (err) {
              console.error('[Voice] Failed to restart:', err);
              setIsListening(false);
              isListeningRef.current = false;
            }
          }
        }, 100);
      } else {
        setIsListening(false);
        isListeningRef.current = false;
        clearSilenceTimer();
      }
    };

    // Start recognition with small delay
    setTimeout(() => {
      try {
        if (recognitionRef.current && shouldRestartRef.current) {
          console.log('[Voice] Starting recognition...');
          recognitionRef.current.start();
        }
      } catch (err) {
        console.error('[Voice] Failed to start:', err);
        setError('Failed to start speech recognition. Please try again.');
        setIsListening(false);
        isListeningRef.current = false;
      }
    }, 100);
  }, [clearSilenceTimer, startSilenceTimer]);

  const resetTranscript = useCallback(() => {
    console.log('[Voice] Resetting transcript');
    setTranscript('');
    setInterimTranscript('');
    hasSpokenRef.current = false;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('[Voice] Cleanup on unmount');
      clearSilenceTimer();
      shouldRestartRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // Ignore
        }
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
