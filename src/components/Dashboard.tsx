/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { app_onSnapshot, app_setDoc, app_deleteDoc } from '../firebase';
import { 
  BookOpen, 
  Calendar, 
  Clock, 
  Video, 
  Plus, 
  VideoOff, 
  Settings, 
  LogOut, 
  Users, 
  Play, 
  Search, 
  Grid,
  AlertCircle,
  Menu,
  X,
  FileSpreadsheet
} from 'lucide-react';
import { ClassSession, UserProfile } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface DashboardProps {
  user: UserProfile;
  onLogout: () => void;
  onStartClass: (session: ClassSession) => void;
  onJoinClass: (session: ClassSession) => void;
  onOpenAdmin: () => void;
}

export default function Dashboard({ user, onLogout, onStartClass, onJoinClass, onOpenAdmin }: DashboardProps) {
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Mobile sidebar toggle state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // New session form states
  const [subject, setSubject] = useState('');
  const [grade, setGrade] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [appsScriptUrl, setAppsScriptUrl] = useState(() => {
    return localStorage.getItem('school_apps_script_url') || '';
  });
  const [isScheduling, setIsScheduling] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Filter sessions by search query
  const [filterQuery, setFilterQuery] = useState('');

  // Save Apps Script URL to local storage
  const handleSaveSettings = () => {
    localStorage.setItem('school_apps_script_url', appsScriptUrl);
    setShowSettings(false);
  };

  // Google Sheets states
  const [sessionExportingId, setSessionExportingId] = useState<string | null>(null);
  const [sheetsLink, setSheetsLink] = useState<string | null>(null);
  const [sheetsError, setSheetsError] = useState<string | null>(null);

  // Export specific session summary & attendance to Google Sheets
  const handleExportSessionToSheets = async (targetSession: ClassSession) => {
    setSessionExportingId(targetSession.sessionId);
    setSheetsLink(null);
    setSheetsError(null);
    try {
      const { getGoogleAccessToken, signInWithGoogle, app_getDocs } = await import('../firebase');
      const { exportSessionReportToSheets } = await import('../utils/googleSheets');
      
      let token = getGoogleAccessToken();
      if (!token) {
        const confirmLogin = window.confirm(
          `Exporting ${targetSession.subject} report to Google Sheets requires connecting your Google account. Connect now?`
        );
        if (!confirmLogin) {
          setSessionExportingId(null);
          return;
        }
        await signInWithGoogle();
        token = getGoogleAccessToken();
      }

      if (!token) {
        throw new Error("Could not retrieve active Google Sheets authorization token.");
      }

      // Fetch attendance records dynamically
      const allAttendance = await app_getDocs('attendance');
      const matchedRecords = allAttendance.filter(rec => rec.sessionId === targetSession.sessionId);
      
      const result = await exportSessionReportToSheets(token, targetSession, matchedRecords);
      setSheetsLink(result.url);
    } catch (err: any) {
      console.error(err);
      setSheetsError(`Google Sheets Export for ${targetSession.subject} failed: ` + (err.message || String(err)));
    } finally {
      setSessionExportingId(null);
    }
  };

  // Listen to scheduled/live/ended sessions in real-time
  useEffect(() => {
    const unsubscribe = app_onSnapshot('sessions', (list: ClassSession[]) => {
      // Sort: live sessions first, then scheduled, then ended. Second sort by scheduledTime
      list.sort((a, b) => {
        const order = { live: 0, scheduled: 1, ended: 2 };
        if (order[a.status] !== order[b.status]) {
          return order[a.status] - order[b.status];
        }
        return new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime();
      });
      setSessions(list);
      setLoading(false);
    }, (err) => {
      setError("Failed to fetch sessions. Please refresh the page.");
    });

    return () => unsubscribe();
  }, []);

  // Class Session Scheduler handler
  const handleScheduleClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject || !grade || !scheduledTime) {
      setError("Please fill out all the fields.");
      return;
    }

    setIsScheduling(true);
    setError(null);

    try {
      let meetLink = '';

      // Create standard meeting ID fallback
      const randomMeetId = () => {
        const part = () => Math.random().toString(36).substring(2, 6);
        return `https://meet.google.com/${part()}-${part()}-${part()}`;
      };

      // Call Google Apps Script integration if Web App URL exists
      if (appsScriptUrl.trim()) {
        try {
          const res = await fetch(appsScriptUrl, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subject, grade })
          });
          const data = await res.json();
          if (data && data.status === 'success' && data.meetLink) {
            meetLink = data.meetLink;
          } else {
            meetLink = randomMeetId();
          }
        } catch (scriptErr) {
          console.warn("Apps Script API down or blocked. Using client fallback Meet link.", scriptErr);
          meetLink = randomMeetId();
        }
      } else {
        meetLink = randomMeetId();
      }

      const generatedSessionId = `class_session_${Date.now()}`;
      const newSession: ClassSession = {
        sessionId: generatedSessionId,
        subject,
        grade,
        scheduledTime,
        meetLink,
        status: 'scheduled',
        teacherUid: user.uid,
        teacherName: user.name,
        createdAt: new Date().toISOString()
      };

      await app_setDoc('sessions', generatedSessionId, newSession);

      // Reset form
      setSubject('');
      setGrade('');
      setScheduledTime('');
      setShowCreateModal(false);
    } catch (err: any) {
      setError("Failed to schedule class. Check your credentials.");
    } finally {
      setIsScheduling(false);
    }
  };

  // Teacher actions: Delete Session
  const handleDeleteSession = async (sessionId: string) => {
    try {
      await app_deleteDoc('sessions', sessionId);
    } catch (err: any) {
      setError("Failed to delete session.");
    }
  };

  // Filtered session list logic
  const filteredSessions = sessions.filter(s => 
    s.subject.toLowerCase().includes(filterQuery.toLowerCase()) ||
    s.grade.toLowerCase().includes(filterQuery.toLowerCase()) ||
    s.teacherName.toLowerCase().includes(filterQuery.toLowerCase())
  );

  // Metrics indicators calculations
  const liveCount = sessions.filter(s => s.status === 'live').length;
  const scheduledCount = sessions.filter(s => s.status === 'scheduled').length;

  const userInitials = user.name
    ? user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
    : 'U';

  const sidebarContent = (
    <>
      <div className="p-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-500 w-8 h-8 flex items-center justify-center rounded text-lg select-none">🏫</div>
          <h1 className="font-extrabold tracking-tight text-lg uppercase select-none">विद्या Portal</h1>
        </div>
      </div>
      
      <div className="flex-1 py-6">
        <div className="px-6 mb-4">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">Main Directory</p>
        </div>
        <ul className="space-y-1">
          <li className="px-6 py-3 bg-indigo-600/10 border-l-4 border-indigo-500 text-indigo-400 flex items-center gap-3 font-semibold text-sm transition">
            <span>📊</span> Dashboard
          </li>
          <li 
            onClick={() => setFilterQuery('')}
            className="px-6 py-3 hover:bg-slate-800 transition-colors cursor-pointer flex items-center gap-3 text-slate-400 text-sm font-medium"
          >
            <span>📅</span> Scheduled Classes
          </li>
          
          {(user.role === 'admin' || user.email === "himanshudangwal16@gmail.com") && (
            <li 
              id="sidebar-admin-btn"
              onClick={onOpenAdmin}
              className="px-6 py-3 hover:bg-slate-800 transition-colors cursor-pointer flex items-center gap-3 text-slate-400 text-sm font-medium"
            >
              <span>⚙️</span> Admin Console
            </li>
          )}
        </ul>
      </div>

      <div className="p-6 bg-slate-950">
        <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2 font-mono">System Integrity</div>
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-md shadow-emerald-500/20"></div>
          <div className="text-xs text-slate-300">Firebase Live</div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${appsScriptUrl ? 'bg-emerald-500 shadow-md shadow-emerald-500/20' : 'bg-slate-600'}`}></div>
          <div className="text-xs text-slate-300">
            {appsScriptUrl ? 'Apps Script Sync' : 'Apps Script Option'}
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div id="dashboard-layout" className="min-h-screen bg-slate-50 text-slate-800 flex overflow-hidden font-sans">
      
      {/* SIDEBAR NAVIGATION (Desktop) */}
      <nav className="w-64 bg-slate-900 text-white hidden lg:flex flex-col border-r border-slate-800 shrink-0 select-none">
        {sidebarContent}
      </nav>

      {/* MOBILE HEADER & NAVIGATION */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/65 flex lg:hidden">
            <motion.div 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.25 }}
              className="w-64 h-full bg-slate-900 text-white flex flex-col border-r border-slate-800 relative"
            >
              <button 
                onClick={() => setMobileMenuOpen(false)}
                className="absolute top-4 right-4 p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              >
                <X className="h-4 w-4" />
              </button>
              {sidebarContent}
            </motion.div>
            <div className="flex-1" onClick={() => setMobileMenuOpen(false)}></div>
          </div>
        )}
      </AnimatePresence>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col overflow-y-auto h-screen relative">
        
        {/* TOP HEADER BAR */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 md:px-8 shrink-0 sticky top-0 z-20 shadow-sm">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setMobileMenuOpen(true)}
              className="p-1.5 rounded hover:bg-slate-100 text-slate-600 lg:hidden transition"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-slate-500 text-sm">
              <span className="capitalize">{user.role}</span>
              <span>/</span>
              <span className="text-slate-900 font-semibold italic">Dashboard Overview</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Quick Admin action */}
            {(user.role === 'admin' || user.email === "himanshudangwal16@gmail.com") && (
              <button
                id="header-admin-btn"
                onClick={onOpenAdmin}
                className="hidden md:flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold px-3.5 py-1.5 border border-indigo-200 text-xs transition rounded-sm"
              >
                <Grid className="h-3.5 w-3.5" /> Admin Console
              </button>
            )}

            {/* Apps Script toggle settings */}
            {user.role !== 'student' && (
              <button
                id="header-settings-btn"
                onClick={() => setShowSettings(!showSettings)}
                className="p-2 border border-slate-200 rounded-sm hover:bg-slate-50 text-slate-600 transition"
                title="Integrate Google Apps Script"
              >
                <Settings className="h-4 w-4" />
              </button>
            )}

            {/* Logout button */}
            <button
              id="header-logout-btn"
              onClick={onLogout}
              className="p-2 border border-slate-200 rounded-sm hover:bg-slate-50 text-slate-600 transition"
              title="Sign Out"
            >
              <LogOut className="h-4 w-4" />
            </button>

            {/* User Profile info */}
            <div className="flex items-center gap-3 border-l border-slate-200 pl-4">
              <div className="text-right hidden sm:block">
                <div className="text-xs font-bold text-slate-900">{user.name}</div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Role: {user.role}</div>
              </div>
              <div className="w-9 h-9 rounded-full bg-indigo-600 border border-indigo-700 text-white shadow-sm flex items-center justify-center font-bold text-xs select-none">
                {userInitials}
              </div>
            </div>
          </div>
        </header>

        {/* WORKSPACE AREA */}
        <div className="p-6 md:p-8 flex-1 flex flex-col space-y-6 max-w-7xl w-full mx-auto">
          
          {/* Error notification header */}
          {error && (
            <div className="p-4 rounded-sm bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start space-x-2">
              <AlertCircle className="h-4.5 w-4.5 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {sheetsLink && (
            <div className="p-4 rounded-sm bg-emerald-50 border border-emerald-250 text-emerald-900 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs animate-fade-in" id="dashboard-sheets-success-banner">
              <div className="flex items-center space-x-2.5">
                <FileSpreadsheet className="h-5 w-5 text-emerald-600 shrink-0" />
                <span>
                  <strong>Google Sheets Report Deployed!</strong> Your classroom session summary, attendee roster, and speech transcript have been successfully synced.
                </span>
              </div>
              <a 
                href={sheetsLink}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold px-4 py-2 rounded-sm uppercase tracking-wider shadow-sm transition"
              >
                Open Google Sheet
              </a>
            </div>
          )}

          {sheetsError && (
            <div className="p-4 rounded-sm bg-rose-50 border border-rose-250 text-rose-800 text-xs flex items-start space-x-2">
              <AlertCircle className="h-4.5 w-4.5 text-rose-600 shrink-0 mt-0.5" />
              <span>{sheetsError}</span>
            </div>
          )}

          {/* Apps Script Web App Integration Overlay */}
          <AnimatePresence>
            {showSettings && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
                id="settings-form-wrapper"
              >
                <div className="bg-white border border-indigo-200 p-6 rounded-sm shadow-sm">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 mb-2">
                    <Settings className="h-4 w-4 text-indigo-600" />
                    Google Apps Script Web App Integration
                  </h3>
                  <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                    Automatically generate real Google Meet links with safe sheet recording hooks. If empty, the platform will auto-generate offline fallback classrooms instead.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="url"
                      id="apps-script-url-input"
                      placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                      value={appsScriptUrl}
                      onChange={(e) => setAppsScriptUrl(e.target.value)}
                      className="flex-1 bg-white border border-slate-200 px-4 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:border-indigo-500 rounded-sm"
                    />
                    <div className="flex gap-2 shrink-0">
                      <button
                        id="save-settings-btn"
                        onClick={handleSaveSettings}
                        className="bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-sm font-bold text-xs text-white uppercase tracking-wider transition"
                      >
                        Save Integration
                      </button>
                      <button
                        id="clear-settings-btn"
                        onClick={() => {
                          setAppsScriptUrl('');
                          localStorage.removeItem('school_apps_script_url');
                        }}
                        className="border border-slate-200 text-slate-500 hover:bg-slate-50 text-xs px-3.5 font-bold rounded-sm uppercase tracking-wider transition"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* STATISTICS PANEL ROW (Geometric Balance Spec) */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            <div className="bg-white p-5 border border-slate-200 shadow-sm rounded-sm">
              <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1 font-mono">Active Classes</div>
              <div className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900">{liveCount}</div>
              <div className="text-xs text-emerald-600 font-medium mt-2 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block animate-pulse"></span>
                <span>{liveCount} currently live</span>
              </div>
            </div>

            <div className="bg-white p-5 border border-slate-200 shadow-sm rounded-sm">
              <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1 font-mono">Scheduled Classes</div>
              <div className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900">{scheduledCount}</div>
              <div className="text-xs text-slate-500 font-medium mt-2">Across all grades</div>
            </div>

            <div className="bg-white p-5 border border-slate-200 shadow-sm rounded-sm">
              <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1 font-mono">Speech AI Code</div>
              <div className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 italic font-mono text-indigo-600">hi-IN</div>
              <div className="text-xs text-slate-500 font-medium mt-2">Hindi Support Active</div>
            </div>

            <div className="bg-white p-5 border border-slate-200 shadow-sm rounded-sm">
              <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1 font-mono">Platform Cost</div>
              <div className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 italic text-emerald-600">₹0</div>
              <div className="text-xs text-emerald-600 font-medium mt-2">Free Services Tier</div>
            </div>
          </section>

          {/* DESIGN SPLIT GRID OVERVIEW */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
            
            {/* Live & Scheduled Classes List panel (8 cols) */}
            <div className="lg:col-span-8 flex flex-col bg-white border border-slate-200 shadow-sm rounded-sm overflow-hidden min-h-[400px]">
              
              <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
                <div>
                  <h2 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Scheduled Virtual Classes</h2>
                  <p className="text-[10px] text-slate-500 font-mono mt-0.5">Real-time snapshots from classroom logs</p>
                </div>

                {/* Filter and search form integration inside panel */}
                <div className="relative w-full sm:w-auto sm:min-w-[240px]">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Search className="h-3.5 w-3.5" />
                  </span>
                  <input
                    type="text"
                    placeholder="Search classes/grade/teacher..."
                    value={filterQuery}
                    onChange={(e) => setFilterQuery(e.target.value)}
                    className="w-full bg-white border border-slate-200 pl-8.5 pr-3 py-1.5 text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-sm"
                  />
                </div>
              </div>

              {/* Attendance list tables / list cards wrapper */}
              <div className="flex-1 overflow-x-auto">
                {loading ? (
                  <div className="text-center py-20 text-slate-500 font-mono text-xs">
                    Synthesizing virtual school data stream...
                  </div>
                ) : filteredSessions.length === 0 ? (
                  <div className="text-center py-24 px-6">
                    <VideoOff className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-tight">No Matching Classroom Sessions</h3>
                    <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                      Use the "Schedule Session" buttons to organize immediate digital lectures.
                    </p>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-100/75 text-slate-500 text-[10px] uppercase font-bold tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-3 font-mono">Grade/Subject</th>
                        <th className="px-6 py-3 font-mono">Instructor</th>
                        <th className="px-6 py-3 font-mono">Scheduled Slot</th>
                        <th className="px-6 py-3 font-mono">Status Status</th>
                        <th className="px-6 py-3 font-mono text-right">Interactive Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {filteredSessions.map((session) => {
                        const isHost = session.teacherUid === user.uid || user.role === 'admin';
                        const isLive = session.status === 'live';
                        const isScheduled = session.status === 'scheduled';
                        
                        return (
                          <tr key={session.sessionId} className="hover:bg-slate-50/70 transition">
                            {/* Subject and Grade */}
                            <td className="px-6 py-4">
                              <div className="font-bold text-slate-950 text-sm tracking-tight">{session.subject}</div>
                              <div className="text-[10px] text-slate-400 font-mono mt-0.5">{session.grade}</div>
                            </td>

                            {/* Instructor info */}
                            <td className="px-6 py-4 text-slate-700 font-medium whitespace-nowrap">
                              {session.teacherName}
                            </td>

                            {/* Date/Time */}
                            <td className="px-6 py-4 whitespace-nowrap text-slate-500 font-mono">
                              <div>{new Date(session.scheduledTime).toLocaleDateString()}</div>
                              <div className="text-[10px] text-slate-405 mt-0.5">
                                {new Date(session.scheduledTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </td>

                            {/* Live Badge status indicator */}
                            <td className="px-6 py-4 whitespace-nowrap">
                              {isLive ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 font-mono">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> LIVE
                                </span>
                              ) : isScheduled ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 font-mono">
                                  PENDING
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 font-mono">
                                  ARCHIVED
                                </span>
                              )}
                            </td>

                            {/* Control triggers */}
                            <td className="px-6 py-4 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-2">
                                
                                {isLive ? (
                                  <button
                                    onClick={() => isHost ? onStartClass(session) : onJoinClass(session)}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] px-3.5 py-1.5 rounded-sm uppercase tracking-wider transition flex items-center gap-1"
                                  >
                                    <Play className="h-3 w-3 fill-current mt-[-1px]" />
                                    {isHost ? 'Resume' : 'Join'}
                                  </button>
                                ) : isScheduled ? (
                                  <>
                                    {isHost ? (
                                      <button
                                        onClick={() => onStartClass(session)}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] px-3.5 py-1.5 rounded-sm uppercase tracking-wider transition"
                                      >
                                        Start Class
                                      </button>
                                    ) : (
                                      <span className="text-[10px] text-slate-400 italic">Locked</span>
                                    )}
                                  </>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <span className="text-[9px] text-slate-400 italic uppercase">Closed</span>
                                    {(isHost || user.role === 'admin') && (
                                      <button
                                        id={`export-sheets-dash-${session.sessionId}`}
                                        onClick={() => handleExportSessionToSheets(session)}
                                        disabled={sessionExportingId === session.sessionId}
                                        className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 disabled:opacity-50 border border-emerald-200 font-bold text-[9px] px-2.5 py-1 rounded-sm uppercase tracking-wider transition flex items-center gap-1 shrink-0"
                                      >
                                        <FileSpreadsheet className="h-3 w-3" />
                                        {sessionExportingId === session.sessionId ? 'Syncing...' : 'Export Sheet'}
                                      </button>
                                    )}
                                  </div>
                                )}

                                {/* Cancel Session anchor */}
                                {isHost && session.status !== 'ended' && (
                                  <button
                                    onClick={() => handleDeleteSession(session.sessionId)}
                                    className="text-slate-400 hover:text-rose-600 p-1.5 transition rounded hover:bg-slate-100 ml-1"
                                    title="Cancel Classroom Booking"
                                  >
                                    <VideoOff className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Side Controls panel with Quick tools & scheduling form triggers (4 cols) */}
            <div className="lg:col-span-4 flex flex-col space-y-6">
              
              {/* Box 1: Quick details card */}
              <div className="bg-slate-900 text-white p-6 shadow-md border-t-4 border-indigo-500 rounded-sm">
                <h3 className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-3 font-mono">Virtual Meet Engine</h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-4 italic">
                  Google Sheet calendar codes are actively generating. Class meeting URLs register automatically inside firestore logs.
                </p>
                <div className="bg-slate-950 p-3 rounded-sm text-[10px] font-mono text-indigo-300 break-all border border-slate-800">
                  {appsScriptUrl ? appsScriptUrl : "script.google.com/macros/s/AKfycb.../exec (Fallback configuration Active)"}
                </div>
              </div>

              {/* Box 2: Quick actions / scheduling trigger */}
              <div className="bg-white border border-slate-200 p-6 rounded-sm flex-1 flex flex-col min-h-[300px]">
                <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">Quick Actions</h3>
                
                <div className="space-y-2.5 flex-1">
                  
                  {user.role !== 'student' ? (
                    <button
                      id="side-schedule-class-btn"
                      onClick={() => setShowCreateModal(true)}
                      className="w-full text-left flex items-center justify-between p-3 border border-slate-150 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all text-xs group rounded-sm"
                    >
                      <span className="text-slate-700 group-hover:text-indigo-700 font-bold uppercase tracking-wider">Book New Classroom Slot</span>
                      <span className="text-indigo-500 font-bold font-mono">+</span>
                    </button>
                  ) : (
                    <div className="p-3 border border-slate-205 text-slate-405 text-xs italic bg-slate-50/60 leading-snug">
                      Logged in as Student. To join virtual sessions and transcripts, select an active classroom in the scheduled board list.
                    </div>
                  )}

                  {(user.role === 'admin' || user.email === "himanshudangwal16@gmail.com") && (
                    <button
                      id="side-admin-redirect-btn"
                      onClick={onOpenAdmin}
                      className="w-full text-left flex items-center justify-between p-3 border border-slate-155 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all text-xs group rounded-sm"
                    >
                      <span className="text-slate-700 group-hover:text-indigo-700 font-bold uppercase tracking-wider">Configure School Roles</span>
                      <span className="text-indigo-500 font-mono">👥</span>
                    </button>
                  )}

                  {user.role !== 'student' && (
                    <button
                      id="side-export-redirect-btn"
                      onClick={onOpenAdmin}
                      className="w-full text-left flex items-center justify-between p-3 border border-slate-155 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all text-xs group rounded-sm"
                    >
                      <span className="text-slate-700 group-hover:text-indigo-700 font-bold uppercase tracking-wider">Download Attendance Log</span>
                      <span className="text-indigo-500 font-mono">📋</span>
                    </button>
                  )}

                </div>

                <div className="mt-6 border-t border-slate-105 pt-4">
                  <div className="bg-emerald-50/70 p-4 border-l-4 border-emerald-500">
                    <div className="text-xs font-bold text-emerald-800 uppercase tracking-widest font-mono">Microphone Status</div>
                    <div className="text-[11px] text-emerald-700 mt-1 italic leading-relaxed">Web Speech continuous API supports auto Hindi voice tracking.</div>
                  </div>
                </div>

              </div>

            </div>
          </div>
        </div>
      </main>

      {/* CREATE SESSION MODAL PANEL */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 bg-slate-900/65 flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ transform: 'scale(0.97)', opacity: 0 }}
              animate={{ transform: 'scale(1)', opacity: 1 }}
              exit={{ transform: 'scale(0.97)', opacity: 0 }}
              className="bg-white border border-slate-350 w-full max-w-md rounded-sm shadow-2xl p-6 relative"
              id="classroom-schedule-form"
            >
              <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-3">
                <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">Schedule Virtual Classroom Session</h3>
                <button 
                  onClick={() => setShowCreateModal(false)}
                  className="p-1 px-2.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition font-bold"
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleScheduleClass} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-mono uppercase text-slate-500 mb-1">Subject Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Mathematics, Hindi Literature, Physics"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-sm px-4 py-2.5 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-mono uppercase text-slate-500 mb-1">Class / Grade Section</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Grade 10-A, Class 12 Batch B"
                    value={grade}
                    onChange={(e) => setGrade(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-sm px-4 py-2.5 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-mono uppercase text-slate-500 mb-1">Date & Proposed Start Time</label>
                  <input
                    type="datetime-local"
                    required
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-sm px-4 py-2.5 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white"
                  />
                </div>

                <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-sm text-indigo-900 text-[11px] flex gap-2">
                  <Video className="w-4 h-4 shrink-0 text-indigo-600 mt-0.5" />
                  <span>Google Meet videoconference code generates instantly on session authorization.</span>
                </div>

                <div className="pt-4 flex justify-end space-x-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-[10px] font-bold text-slate-600 uppercase tracking-wider rounded-sm transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isScheduling}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] px-5 py-2 rounded-sm uppercase tracking-wider shadow-sm transition"
                  >
                    {isScheduling ? 'Scheduling...' : 'Lock Session'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
