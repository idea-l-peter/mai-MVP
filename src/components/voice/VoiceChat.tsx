import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTTS } from '@/hooks/useTTS';
import { supabase } from '@/integrations/supabase/client';
import maiAvatar from '@/assets/mai-avatar.png';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface VoiceChatProps {
  isOpen: boolean;
  onClose: () => void;
  conversationHistory?: Message[];
  systemPrompt?: string;
}

type VoiceState = 'idle' | 'recording' | 'processing' | 'speaking' | 'done';

// Timeout helper for promises
const withTimeout = <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error(`TIMEOUT: ${label} exceeded ${ms}ms`)), ms)
    ),
  ]);
};

// iOS Safari detection
const isIOSSafari = (): boolean => {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
  const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS/.test(ua);
  return isIOS || (isIOS && isSafari);
};

export function VoiceChat({ isOpen, onClose, conversationHistory = [], systemPrompt }: VoiceChatProps) {
  const [state, setState] = useState<VoiceState>('idle');
  const [audioLevel, setAudioLevel] = useState(0);
  const [lastUserMessage, setLastUserMessage] = useState('');
  const [lastAssistantMessage, setLastAssistantMessage] = useState('');
  const [localHistory, setLocalHistory] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [hasTranscriptionFailed, setHasTranscriptionFailed] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number>(0);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const maxRecordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const errorClearTimerRef = useRef<NodeJS.Timeout | null>(null);
  const stateRef = useRef<VoiceState>('idle');

  // Keep ref in sync
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const tts = useTTS({
    onPlayStart: () => {
      console.log('[VoiceChat] TTS playback started');
      setState('speaking');
    },
    onPlayEnd: () => {
      console.log('[VoiceChat] TTS playback ended');
      setState('done');
    },
  });

  // Cleanup all resources
  const cleanup = useCallback(() => {
    console.log('[VoiceChat] Cleaning up resources');
    
    // Stop recording timer
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    
    // Stop max recording timer
    if (maxRecordingTimerRef.current) {
      clearTimeout(maxRecordingTimerRef.current);
      maxRecordingTimerRef.current = null;
    }
    
    // Stop error clear timer
    if (errorClearTimerRef.current) {
      clearTimeout(errorClearTimerRef.current);
      errorClearTimerRef.current = null;
    }
    
    // Stop animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = 0;
    }
    
    // Stop media recorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.log('[VoiceChat] MediaRecorder already stopped');
      }
    }
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
    
    // Stop media stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    
    setAudioLevel(0);
    setRecordingTime(0);
  }, []);

  // Get state label text
  const getStateLabel = (): string => {
    if (state === 'idle' && hasTranscriptionFailed) {
      return 'Failed - tap to retry';
    }
    switch (state) {
      case 'idle': return 'Tap to speak';
      case 'recording': return `Recording... ${recordingTime}s`;
      case 'processing': return 'Processing...';
      case 'speaking': return 'Speaking...';
      case 'done': return 'Done';
      default: return 'Tap to speak';
    }
  };

  // Start audio visualization
  const startAudioVisualization = useCallback((stream: MediaStream) => {
    try {
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      
      const updateLevel = () => {
        if (!analyserRef.current) return;
        
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        setAudioLevel(Math.min(average / 128, 1));
        
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };
      
      updateLevel();
    } catch (err) {
      console.error('[VoiceChat] Audio visualization error:', err);
    }
  }, []);

  // Send audio to transcription API with 15-second timeout
  const transcribeAudio = useCallback(async (audioBlob: Blob): Promise<string | null> => {
    console.log('[VoiceChat] Audio blob created:', { 
      size: audioBlob.size, 
      type: audioBlob.type,
      sizeKB: Math.round(audioBlob.size / 1024) 
    });
    
    if (audioBlob.size < 1000) {
      console.log('[VoiceChat] Audio too short, skipping');
      return null;
    }
    
    const formData = new FormData();
    const ext = audioBlob.type.includes('mp4') ? 'mp4' : 
               audioBlob.type.includes('ogg') ? 'ogg' : 
               audioBlob.type.includes('wav') ? 'wav' : 'webm';
    formData.append('audio', audioBlob, `recording.${ext}`);

    console.log('[VoiceChat] Transcription fetch start');
    
    const invokePromise = supabase.functions.invoke('transcribe-audio', {
      body: formData,
    });

    // Wrap with 15-second timeout
    const { data, error: fnError } = await withTimeout(
      invokePromise,
      15000,
      'transcribe-audio'
    );

    console.log('[VoiceChat] Transcription fetch response received');

    if (fnError) {
      console.error('[VoiceChat] Transcription error:', fnError);
      throw fnError;
    }

    if (data?.error) {
      console.error('[VoiceChat] Transcription API error:', data.error);
      throw new Error(data.error);
    }

    return data?.text || null;
  }, []);

  // Process transcript with AI
  const processWithAI = useCallback(async (transcript: string) => {
    if (!transcript.trim()) {
      console.log('[VoiceChat] Empty transcript');
      setState('idle');
      return;
    }

    console.log('[VoiceChat] Processing transcript:', transcript);
    setState('processing');
    setLastUserMessage(transcript);
    setError(null);
    
    const userMessage: Message = { role: 'user', content: transcript };
    const updatedHistory = [...localHistory, userMessage];
    setLocalHistory(updatedHistory);

    try {
      const { data, error: aiError } = await supabase.functions.invoke('ai-assistant', {
        body: {
          message: transcript,
          systemPrompt: systemPrompt || 'You are mai, an executive assistant. Keep responses brief and conversational since this is a voice interface. Limit responses to 2-3 sentences.',
          conversationHistory: [...conversationHistory, ...updatedHistory].slice(-10),
        },
      });

      if (aiError) throw aiError;

      const assistantContent = data.content || "I didn't catch that. Could you try again?";
      console.log('[VoiceChat] AI response:', assistantContent);
      setLastAssistantMessage(assistantContent);
      setLocalHistory(prev => [...prev, { role: 'assistant', content: assistantContent }]);

      await tts.speak(assistantContent);
    } catch (err) {
      console.error('[VoiceChat] AI error:', err);
      setError('Failed to get response. Please try again.');
      setState('idle');
    }
  }, [conversationHistory, localHistory, systemPrompt, tts]);

  // Stop recording and process
  const stopRecording = useCallback(async () => {
    console.log('[VoiceChat] Stopping recording');
    
    // Stop timers first
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (maxRecordingTimerRef.current) {
      clearTimeout(maxRecordingTimerRef.current);
      maxRecordingTimerRef.current = null;
    }
    
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
      console.log('[VoiceChat] No active recording');
      setState('idle');
      return;
    }

    setState('processing');
    
    return new Promise<void>((resolve) => {
      const recorder = mediaRecorderRef.current!;
      
      recorder.onstop = async () => {
        console.log('[VoiceChat] Recording stopped, chunks:', audioChunksRef.current.length);
        
        // Stop stream
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
        
        // Stop animation
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = 0;
        }
        
        // Close audio context
        if (audioContextRef.current) {
          audioContextRef.current.close().catch(() => {});
          audioContextRef.current = null;
        }
        
        // Create blob
        const mimeType = recorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        audioChunksRef.current = [];
        
        try {
          const transcript = await transcribeAudio(audioBlob);
          if (transcript) {
            await processWithAI(transcript);
          } else {
            console.warn('[VoiceChat] No transcript returned');
            setError('Could not understand audio. Please try again.');
            setHasTranscriptionFailed(true);
            setState('idle');
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';
          const isTimeout = errorMessage.includes('TIMEOUT');
          
          if (isTimeout) {
            console.warn('[VoiceChat] Transcription timed out after 15s');
            setError('Transcription timed out. Please try again.');
          } else {
            console.error('[VoiceChat] Transcription failed:', err);
            setError('Transcription failed. Please try again.');
          }
          
          setHasTranscriptionFailed(true);
          setState('idle');
          
          // Auto-clear error message after 3 seconds, but keep failed state
          errorClearTimerRef.current = setTimeout(() => {
            setError(null);
          }, 3000);
        }
        
        resolve();
      };
      
      recorder.stop();
    });
  }, [transcribeAudio, processWithAI]);

  // Start recording
  const startRecording = useCallback(async () => {
    console.log('[VoiceChat] Starting recording, iOS:', isIOSSafari());
    setError(null);
    audioChunksRef.current = [];
    setRecordingTime(0);

    try {
      // Request microphone
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        } 
      });
      streamRef.current = stream;
      console.log('[VoiceChat] Microphone stream obtained');

      // Start visualization
      startAudioVisualization(stream);

      // Determine MIME type - prioritize mp4 for iOS
      let mimeType = '';
      const isiOS = isIOSSafari();
      
      const mimeTypes = isiOS 
        ? ['audio/mp4', 'audio/aac', 'audio/webm', 'audio/ogg'] // iOS priority
        : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
      
      for (const type of mimeTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          mimeType = type;
          break;
        }
      }
      
      console.log('[VoiceChat] Using MIME type:', mimeType || 'default');

      const options: MediaRecorderOptions = mimeType ? { mimeType } : {};
      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onerror = (event) => {
        console.error('[VoiceChat] MediaRecorder error:', event);
        setError('Recording failed. Please try again.');
        cleanup();
        setState('idle');
      };

      recorder.onstart = () => {
        console.log('[VoiceChat] Recording started');
        setState('recording');
        
        // Start recording timer
        recordingTimerRef.current = setInterval(() => {
          setRecordingTime(t => t + 1);
        }, 1000);
        
        // 30 second max recording timeout
        maxRecordingTimerRef.current = setTimeout(() => {
          console.log('[VoiceChat] Max recording time reached, auto-submitting');
          stopRecording();
        }, 30000);
      };

      // Start with 500ms timeslice
      recorder.start(500);

    } catch (err) {
      console.error('[VoiceChat] Failed to start recording:', err);
      const errName = err instanceof Error ? err.name : '';
      
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        setError('Microphone access denied. Please allow microphone permissions.');
      } else if (errName === 'NotFoundError') {
        setError('No microphone found. Please connect a microphone.');
      } else {
        setError('Failed to access microphone. Please check your settings.');
      }
      setState('idle');
    }
  }, [startAudioVisualization, cleanup, stopRecording]);

  // Handle main button click
  const handleMainButtonClick = useCallback(() => {
    console.log('[VoiceChat] Main button clicked, state:', state);
    setError(null);
    setHasTranscriptionFailed(false); // Clear failed state on retry
    
    if (state === 'idle' || state === 'done') {
      startRecording();
    } else if (state === 'recording') {
      stopRecording();
    } else if (state === 'speaking') {
      tts.stop();
      setState('idle');
    }
  }, [state, startRecording, stopRecording, tts]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    console.log('[VoiceChat] Cancel clicked');
    cleanup();
    setState('idle');
    setError(null);
  }, [cleanup]);

  // Handle close - always works regardless of state
  const handleClose = useCallback(() => {
    console.log('[VoiceChat] Close clicked, forcing exit from state:', stateRef.current);
    
    // Clear all timers first
    if (errorClearTimerRef.current) {
      clearTimeout(errorClearTimerRef.current);
      errorClearTimerRef.current = null;
    }
    
    cleanup();
    tts.stop();
    setState('idle');
    setLastUserMessage('');
    setLastAssistantMessage('');
    setLocalHistory([]);
    setError(null);
    setHasTranscriptionFailed(false);
    onClose();
  }, [cleanup, tts, onClose]);

  // Handle try again
  const handleTryAgain = useCallback(() => {
    setError(null);
    setHasTranscriptionFailed(false);
    setState('idle');
  }, []);

  // Cleanup on unmount or close
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  // Reset when opening
  useEffect(() => {
    if (isOpen) {
      console.log('[VoiceChat] Opening');
      setState('idle');
      setLocalHistory([]);
      setError(null);
      setLastUserMessage('');
      setLastAssistantMessage('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-gradient-to-b from-primary via-primary to-primary/95">
      {/* Close button - top right */}
      <button
        onClick={handleClose}
        className="absolute top-4 right-4 z-10 p-2 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors"
        aria-label="Close voice chat"
      >
        <X className="h-7 w-7" />
      </button>

      {/* Header */}
      <header className="flex items-center justify-center pt-16 pb-4">
        <div className="flex items-center gap-3">
          <img src={maiAvatar} alt="mai" className="h-10 w-10 rounded-full" />
          <span className="font-semibold text-white text-xl">Voice Mode</span>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        {/* Pulsing mic button */}
        <div className="relative">
          {/* Pulse rings when recording */}
          {state === 'recording' && (
            <>
              <div 
                className="absolute inset-0 rounded-full bg-white/20 animate-ping"
                style={{ 
                  animationDuration: '1.5s',
                  transform: `scale(${1 + audioLevel * 0.3})` 
                }}
              />
              <div 
                className="absolute -inset-4 rounded-full border-2 border-white/30 animate-pulse"
                style={{ animationDuration: '1s' }}
              />
              <div 
                className="absolute -inset-8 rounded-full border border-white/20 animate-pulse"
                style={{ animationDuration: '1.5s' }}
              />
            </>
          )}
          
          {/* Processing spinner */}
          {state === 'processing' && (
            <div className="absolute -inset-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
          )}
          
          {/* Speaking indicator */}
          {state === 'speaking' && (
            <>
              <div className="absolute -inset-4 rounded-full border-2 border-white/40 animate-pulse" />
              <div className="absolute -inset-8 rounded-full border border-white/20 animate-pulse" style={{ animationDelay: '0.5s' }} />
            </>
          )}

          {/* Main button */}
          <button
            onClick={handleMainButtonClick}
            disabled={state === 'processing'}
            className={`
              relative w-28 h-28 rounded-full flex items-center justify-center transition-all duration-300
              ${state === 'recording' 
                ? 'bg-red-500 hover:bg-red-600 scale-110' 
                : state === 'processing'
                  ? 'bg-white/20 cursor-wait'
                  : state === 'speaking'
                    ? 'bg-white/30 hover:bg-white/40'
                    : 'bg-white/20 hover:bg-white/30 hover:scale-105'
              }
            `}
            aria-label={getStateLabel()}
          >
            <Mic className={`h-12 w-12 text-white ${state === 'recording' ? 'animate-pulse' : ''}`} />
          </button>
        </div>

        {/* State label */}
        <p className="mt-6 text-white text-lg font-medium">
          {getStateLabel()}
        </p>

        {/* Cancel button (only during recording) */}
        {state === 'recording' && (
          <Button
            variant="ghost"
            onClick={handleCancel}
            className="mt-4 text-white/70 hover:text-white hover:bg-white/10"
          >
            Cancel
          </Button>
        )}

        {/* Error display */}
        {error && (
          <div className="mt-6 text-center max-w-xs bg-red-500/20 border border-red-400/30 rounded-lg px-4 py-3">
            <p className="text-white/90 text-sm">{error}</p>
            <button 
              onClick={handleTryAgain}
              className="mt-2 px-4 py-1.5 bg-white/20 hover:bg-white/30 rounded-full text-white text-sm transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {/* TTS loading */}
        {tts.isLoading && (
          <p className="mt-4 text-white/60 text-sm">Generating speech...</p>
        )}
      </div>

      {/* Bottom transcript area */}
      <div className="px-6 pb-12 space-y-3 min-h-[140px]">
        {lastUserMessage && state !== 'recording' && (
          <div className="text-center animate-fade-in">
            <p className="text-white/60 text-xs mb-1">You said</p>
            <p className="text-white/90 text-sm line-clamp-2">{lastUserMessage}</p>
          </div>
        )}

        {lastAssistantMessage && (state === 'speaking' || state === 'done') && (
          <div className="text-center animate-fade-in">
            <p className="text-white/60 text-xs mb-1">mai</p>
            <p className="text-white text-lg line-clamp-3">{lastAssistantMessage}</p>
          </div>
        )}
      </div>
    </div>
  );
}
