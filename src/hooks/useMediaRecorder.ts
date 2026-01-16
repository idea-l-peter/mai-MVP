import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface UseMediaRecorderOptions {
  onTranscriptionComplete?: (transcript: string) => void;
  onError?: (error: string) => void;
}

interface UseMediaRecorderReturn {
  isRecording: boolean;
  isTranscribing: boolean;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string | null>;
}

export function useMediaRecorder(options: UseMediaRecorderOptions = {}): UseMediaRecorderReturn {
  const { onTranscriptionComplete, onError } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async () => {
    console.log('[MediaRecorder] Starting recording...');
    setError(null);
    audioChunksRef.current = [];

    try {
      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        } 
      });
      streamRef.current = stream;
      console.log('[MediaRecorder] Microphone stream obtained');

      // Determine best supported mime type
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
        'audio/wav',
      ];
      
      let selectedMimeType = '';
      for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType;
          break;
        }
      }

      if (!selectedMimeType) {
        // Fallback - let browser choose
        console.log('[MediaRecorder] No preferred mime type supported, using default');
      } else {
        console.log('[MediaRecorder] Using mime type:', selectedMimeType);
      }

      const options: MediaRecorderOptions = selectedMimeType 
        ? { mimeType: selectedMimeType }
        : {};

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          console.log('[MediaRecorder] Data chunk received:', event.data.size, 'bytes');
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onerror = (event) => {
        console.error('[MediaRecorder] Error:', event);
        const errorMessage = 'Recording failed. Please try again.';
        setError(errorMessage);
        onError?.(errorMessage);
      };

      mediaRecorder.onstart = () => {
        console.log('[MediaRecorder] Recording started');
        setIsRecording(true);
      };

      mediaRecorder.onstop = () => {
        console.log('[MediaRecorder] Recording stopped');
        setIsRecording(false);
      };

      // Start recording with 1 second timeslice
      mediaRecorder.start(1000);

    } catch (err) {
      console.error('[MediaRecorder] Failed to start:', err);
      const errorMessage = err instanceof Error && err.name === 'NotAllowedError'
        ? 'Microphone permission denied. Please allow microphone access.'
        : 'Failed to access microphone. Please check your device settings.';
      setError(errorMessage);
      onError?.(errorMessage);
    }
  }, [onError]);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    console.log('[MediaRecorder] Stopping recording...');

    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
        console.log('[MediaRecorder] No active recording to stop');
        resolve(null);
        return;
      }

      const mediaRecorder = mediaRecorderRef.current;

      mediaRecorder.onstop = async () => {
        console.log('[MediaRecorder] Recording stopped, processing audio...');
        setIsRecording(false);

        // Stop all tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }

        // Create audio blob
        const audioBlob = new Blob(audioChunksRef.current, { 
          type: mediaRecorder.mimeType || 'audio/webm' 
        });
        console.log('[MediaRecorder] Audio blob created:', audioBlob.size, 'bytes, type:', audioBlob.type);

        if (audioBlob.size < 1000) {
          console.log('[MediaRecorder] Audio too short, skipping transcription');
          resolve(null);
          return;
        }

        // Send to transcription API
        setIsTranscribing(true);
        try {
          console.log('[MediaRecorder] Sending to transcription API...');
          
          const formData = new FormData();
          // Determine file extension from mime type
          const ext = audioBlob.type.includes('mp4') ? 'mp4' : 
                     audioBlob.type.includes('ogg') ? 'ogg' : 
                     audioBlob.type.includes('wav') ? 'wav' : 'webm';
          formData.append('audio', audioBlob, `recording.${ext}`);

          const { data, error: fnError } = await supabase.functions.invoke('transcribe-audio', {
            body: formData,
          });

          if (fnError) {
            console.error('[MediaRecorder] Transcription function error:', fnError);
            throw fnError;
          }

          if (data?.error) {
            console.error('[MediaRecorder] Transcription error:', data.error);
            throw new Error(data.error);
          }

          const transcript = data?.text || '';
          console.log('[MediaRecorder] Transcription result:', transcript);

          setIsTranscribing(false);
          onTranscriptionComplete?.(transcript);
          resolve(transcript);

        } catch (err) {
          console.error('[MediaRecorder] Transcription failed:', err);
          const errorMessage = 'Transcription failed. Please try again.';
          setError(errorMessage);
          onError?.(errorMessage);
          setIsTranscribing(false);
          resolve(null);
        }
      };

      mediaRecorder.stop();
    });
  }, [onTranscriptionComplete, onError]);

  return {
    isRecording,
    isTranscribing,
    error,
    startRecording,
    stopRecording,
  };
}
