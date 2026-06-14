/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { app_onSnapshotDoc, app_setDoc, app_updateDoc } from '../firebase';
import { 
  Mic, 
  MicOff, 
  Video, 
  Play, 
  Square, 
  LogOut, 
  Languages, 
  Clock, 
  AlertCircle,
  FileText,
  UserCheck
} from 'lucide-react';
import { ClassSession, UserProfile } from '../types';

interface LiveClassroomProps {
  session: ClassSession;
  user: UserProfile;
  onExit: () => void;
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

export default function LiveClassroom({ session, user, onExit }: LiveClassroomProps) {
  const isHost = session.teacherUid === user.uid || user.role === 'admin';
  const attendanceDocId = `attendance_${session.sessionId}_${user.uid}`;

  // State managers
  const [currentSession, setCurrentSession] = useState<ClassSession>(session);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptText, setTranscriptText] = useState(session.transcript || '');
  const [language, setLanguage] = useState<'hi-IN' | 'en-IN'>('hi-IN');
  const [errorHeader, setErrorHeader] = useState<string | null>(null);
  const [joinedTimestamp, setJoinedTimestamp] = useState<string | null>(null);

  // Speech Recognition Reference
  const recognitionRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 1. Core Snapshot Listener to capture session and transcript updates
  useEffect(() => {
    const unsub = app_onSnapshotDoc('sessions', session.sessionId, (data: ClassSession) => {
      if (data) {
        setCurrentSession(data);
        if (!isHost) {
          // Sync transcripts for non-hosting students
          setTranscriptText(data.transcript || '');
        }
      }
    }, (err) => {
      console.error(err);
    });
    return () => unsub();
  }, [session.sessionId, isHost]);

  // 2. Class Elapsed Stop-watch timer
  useEffect(() => {
    const startTimeStamp = currentSession.status === 'live' && currentSession.createdAt 
      ? new Date(currentSession.createdAt).getTime() 
      : Date.now();
      
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTimeStamp) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [currentSession.status]);

  // 3. Student Check-in Attendance recording
  useEffect(() => {
    const checkIn = async () => {
      if (isHost) {
        if (session.status === 'scheduled') {
          try {
            await app_updateDoc('sessions', session.sessionId, { status: 'live' });
          } catch (err: any) {
            console.error(err);
          }
        }
        return;
      }

      // Student logs arrival
      try {
        const timeNow = new Date().toISOString();
        setJoinedTimestamp(timeNow);
        
        await app_setDoc('attendance', attendanceDocId, {
          docId: attendanceDocId,
          sessionId: session.sessionId,
          studentUid: user.uid,
          studentName: user.name,
          studentEmail: user.email,
          joinedAt: timeNow
        });
      } catch (err: any) {
        setErrorHeader("Attendance Check-in failed.");
      }
    };

    checkIn();
  }, [session.sessionId, user.uid]);

  // 4. Voice Transcription Logic (Web Speech API)
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("Speech recognition is not supported on this browser context.");
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = language;

    rec.onresult = (event: any) => {
      let finalSpeech = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalSpeech += event.results[i][0].transcript + ' ';
        }
      }

      if (finalSpeech) {
        setTranscriptText((prev) => {
          const updated = prev + finalSpeech;
          if (isHost) {
            app_updateDoc('sessions', session.sessionId, { transcript: updated })
              .catch((err) => console.error("Realtime transcript write failed", err));
          }
          return updated;
        });
      }
    };

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.warn("Speech recognition diagnostic code: ", event.error);
      if (event.error === 'not-allowed') {
        setErrorHeader("Microphone permissions denied. Please allow sound input.");
        setIsTranscribing(false);
      }
    };

    rec.onend = () => {
      if (isTranscribing) {
        try { rec.start(); } catch (e) {}
      }
    };

    recognitionRef.current = rec;

    return () => {
      try {
        rec.stop();
      } catch (e) {}
    };
  }, [language, isTranscribing, isHost]);

  // Auto scroll transcript box
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcriptText]);

  // Handle mic click toggle
  const handleToggleRecognition = () => {
    if (!recognitionRef.current) {
      setErrorHeader("Continuous Speech-to-Text translation is not supported on your browser (Chrome recommended).");
      return;
    }

    if (isTranscribing) {
      recognitionRef.current.stop();
      setIsTranscribing(false);
    } else {
      setIsTranscribing(true);
      setErrorHeader(null);
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.error(e);
      }
    }
  };

  // Student checkout duration lock
  const handleStudentExit = async () => {
    try {
      const leftAt = new Date().toISOString();
      const originJoined = joinedTimestamp || new Date().toISOString();
      const diffMs = Date.now() - new Date(originJoined).getTime();
      const durationMinutes = Math.max(1, Math.round(diffMs / 60000));

      await app_updateDoc('attendance', attendanceDocId, {
        leftAt,
        durationMinutes
      });
    } catch (err: any) {
      console.error(err);
    } finally {
      onExit();
    }
  };

  // Teacher End Classroom state locking
  const handleTeacherEndClass = async () => {
    try {
      await app_updateDoc('sessions', session.sessionId, {
        status: 'ended',
        endedAt: new Date().toISOString(),
        transcript: transcriptText
      });
    } catch (err: any) {
      console.error(err);
    } finally {
      onExit();
    }
  };

  // Convert seconds to stopwatch format
  const formatTimerValue = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  };

  return (
    <div id="classroom-layout" className="min-h-screen bg-slate-50 flex flex-col font-sans selection:bg-indigo-100">
      
      {/* Alert Header Banner */}
      {errorHeader && (
        <div className="bg-rose-600 text-white text-xs px-6 py-2.5 flex items-center justify-center space-x-2 border-b border-rose-700 font-bold uppercase tracking-wider font-mono">
          <AlertCircle className="h-4 w-4 shrink-0 animate-bounce" />
          <span>{errorHeader}</span>
        </div>
      )}

      {/* Classroom Control Header */}
      <header className="h-16 bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-30 shadow-sm flex items-center justify-between">
        <div className="flex items-center space-x-3 truncate">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-sm text-[10px] font-bold bg-rose-100 border border-rose-200 text-rose-800 font-mono tracking-wider shrink-0 uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse"></span> {currentSession.status === 'live' ? 'CLASS ACTIVE' : 'STATUS: ' + currentSession.status}
          </span>
          <div className="truncate max-w-[120px] sm:max-w-xs">
            <h2 className="text-sm font-extrabold text-slate-900 truncate leading-tight uppercase tracking-tight">{currentSession.subject}</h2>
            <p className="text-[10px] text-slate-500 font-mono tracking-wider mt-0.5">{currentSession.grade}</p>
          </div>
        </div>

        {/* Live Timer overlay */}
        <div className="bg-slate-900 text-white font-mono px-4 py-1.5 border border-slate-800 rounded-sm flex items-center gap-2 shadow-inner select-none shrink-0">
          <Clock className="w-4 h-4 text-rose-500 shrink-0" />
          <span className="text-sm font-bold tracking-wider">{formatTimerValue(elapsedSeconds)}</span>
        </div>

        {/* Dynamic Action out button */}
        <div className="shrink-0">
          {isHost ? (
            <button
              id="end-classroom-btn"
              onClick={handleTeacherEndClass}
              className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] px-4 py-2 rounded-sm uppercase tracking-wider transition shadow-sm"
            >
              <Square className="h-3.5 w-3.5" /> End Classroom
            </button>
          ) : (
            <button
              id="leave-classroom-btn"
              onClick={handleStudentExit}
              className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-800 text-white font-bold text-[10px] px-4 py-2 rounded-sm uppercase tracking-wider transition shadow-sm"
            >
              <LogOut className="h-3.5 w-3.5" /> Exit Class
            </button>
          )}
        </div>
      </header>

      {/* Main Split viewport stage */}
      <div className="flex-1 max-w-7xl mx-auto w-full p-6 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
        
        {/* Left Side: Join Video Stream card */}
        <div className="lg:col-span-5 flex flex-col space-y-6">
          <div className="bg-white border border-slate-200 rounded-sm p-6 shadow-sm flex flex-col justify-between flex-1">
            <div>
              <div className="bg-indigo-50 border border-indigo-100 text-indigo-700 p-3.5 rounded-sm inline-block mb-4">
                <Video className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900 uppercase tracking-tight">Step 1 — Authorize Video Stream</h3>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Lectures with visual presentations are broadcast inside Google Meet. Access the Meet stream in a separate tab, then split your window or return here to view live continuous speech translations.
              </p>
            </div>

            <div className="border-t border-slate-100 pt-6 mt-6">
              <a
                id="join-google-meet-link"
                href={currentSession.meetLink}
                target="_blank"
                rel="noreferrer noopener"
                className="w-full inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-3.5 rounded-sm shadow-sm uppercase tracking-wider transition"
              >
                <Video className="w-4 h-4" /> Open google meet conference
              </a>
              <p className="text-center text-[10px] text-slate-400 mt-2.5 font-mono uppercase tracking-wider">
                Clicking opens official session link
              </p>
            </div>
          </div>

          {/* Student attendance card */}
          {!isHost && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-sm p-5 shadow-sm text-emerald-950 flex items-start space-x-3.5">
              <UserCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5 animate-pulse" />
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider font-mono">Attendance Connected</h4>
                <p className="text-[11px] text-emerald-800 leading-relaxed mt-1">
                  You checked-in successfully as <span className="font-bold">{user.name}</span>. Leaving the session updates your class time register automatically.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Smart Voice Continuous Translation Panel */}
        <div className="lg:col-span-7 flex flex-col bg-white border border-slate-200 rounded-sm overflow-hidden shadow-sm min-h-[440px]">
          
          {/* Header toolbar */}
          <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-500" /> Continuous Translation Transcripts
            </span>

            {/* Language dropdown */}
            <div className="flex items-center space-x-2">
              <Languages className="w-4 h-4 text-slate-400" />
              <select
                id="voice-language-select"
                value={language}
                onChange={(e) => setLanguage(e.target.value as 'hi-IN' | 'en-IN')}
                className="bg-white border border-slate-250 text-slate-805 text-xs py-1 px-3.5 rounded-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 font-bold uppercase tracking-wider"
              >
                <option value="hi-IN">Hindi (hi-IN) 🇮🇳</option>
                <option value="en-IN">English (en-IN) 🇬🇧</option>
              </select>
            </div>
          </div>

          {/* Transcript text print-out */}
          <div 
            ref={scrollRef}
            className="flex-1 p-6 overflow-y-auto bg-slate-900 text-slate-100 font-mono text-xs leading-relaxed space-y-4 hover:border-slate-800 border-none select-text"
            id="transcript-viewport"
          >
            {transcriptText ? (
              <p className="whitespace-pre-line tracking-wide">
                {transcriptText}
              </p>
            ) : (
              <div className="text-center py-24 text-slate-500 text-xs italic">
                {isHost 
                  ? "Click 'Start Voice Capture' below and begin speaking in Google Meet... Your continuous speech outputs here dynamically in real-time."
                  : "Waiting for the classroom host to activate their speech-to-text continuous translation engine..."}
              </div>
            )}
          </div>

          {/* Voice transmission tool for classroom host */}
          {isHost && (
            <div className="bg-slate-50 border-t border-slate-200 p-4 px-6 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0">
              <div className="text-xs text-slate-500 flex items-center gap-2 font-mono uppercase tracking-wider">
                <span className={`w-2 h-2 rounded-full ${isTranscribing ? 'bg-rose-500 animate-ping' : 'bg-slate-400'}`} />
                {isTranscribing ? "Voice recording & broadcasting..." : "Microphone offline"}
              </div>

              <button
                id="toggle-microphone-btn"
                onClick={handleToggleRecognition}
                className={`flex items-center gap-2 font-bold text-[10px] py-2.5 px-6 rounded-sm shadow-sm uppercase tracking-wider transition ${
                  isTranscribing 
                    ? 'bg-rose-600 hover:bg-rose-700 text-white' 
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                }`}
              >
                {isTranscribing ? (
                  <>
                    <MicOff className="w-3.5 h-3.5" /> Stop Voice Capture
                  </>
                ) : (
                  <>
                    <Mic className="w-3.5 h-3.5 fill-current" /> Start Voice Capture
                  </>
                )}
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
