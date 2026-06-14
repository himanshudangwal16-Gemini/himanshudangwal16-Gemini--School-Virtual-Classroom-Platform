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
  FileSpreadsheet,
  Globe,
  Copy,
  Check,
  ArrowUpRight,
  Monitor
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

  // Google Sites deployment guide toggle
  const [showSitesDeployGuide, setShowSitesDeployGuide] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

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
  const [statusFilter, setStatusFilter] = useState<'all' | 'live' | 'scheduled' | 'ended'>('all');

  // Save Apps Script URL to local storage
  const handleSaveSettings = () => {
    localStorage.setItem('school_apps_script_url', appsScriptUrl);
    setShowSettings(false);
  };

  // Google Sheets states
  const [sessionExportingId, setSessionExportingId] = useState<string | null>(null);
  const [sheetsLink, setSheetsLink] = useState<string | null>(null);
  const [sheetsError, setSheetsError] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState<ClassSession | null>(null);

  // Export specific session summary & attendance to Google Sheets
  const handleExportSessionToSheets = async (targetSession: ClassSession, ignoreTokenCheck = false) => {
    setSessionExportingId(targetSession.sessionId);
    setSheetsLink(null);
    setSheetsError(null);
    try {
      const { getGoogleAccessToken, signInWithGoogle, app_getDocs } = await import('../firebase');
      const { exportSessionReportToSheets } = await import('../utils/googleSheets');
      
      let token = getGoogleAccessToken();
      if (!token && !ignoreTokenCheck) {
        // Instead of blocking window.confirm, trigger our premium in-app modal
        setShowExportModal(targetSession);
        setSessionExportingId(null);
        return;
      }

      if (!token && ignoreTokenCheck) {
        // Authenticate when the user explicitly triggers the action from our modal
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
      setShowExportModal(null);
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
  const filteredSessions = sessions.filter(s => {
    const matchesSearch = s.subject.toLowerCase().includes(filterQuery.toLowerCase()) ||
                          s.grade.toLowerCase().includes(filterQuery.toLowerCase()) ||
                          s.teacherName.toLowerCase().includes(filterQuery.toLowerCase());
    if (statusFilter === 'all') return matchesSearch;
    return matchesSearch && s.status === statusFilter;
  });

  // Metrics indicators calculations
  const liveCount = sessions.filter(s => s.status === 'live').length;
  const scheduledCount = sessions.filter(s => s.status === 'scheduled').length;

  const userInitials = user.name
    ? user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
    : 'U';

  const sidebarContent = (
    <>
      <div className="p-6 border-b-3 border-slate-950 bg-[#162720]">
        <div className="flex items-center gap-3">
          <div className="bg-yellow-300 text-slate-900 border-2 border-slate-950 w-9 h-9 flex items-center justify-center rounded-none text-xl select-none shadow-[2px_2px_0px_0px_#000] rotate-[-3deg]">🏫</div>
          <h1 className="font-extrabold tracking-tight text-base uppercase text-yellow-300 select-none">विद्यालय Portal</h1>
        </div>
      </div>
      
      <div className="flex-1 py-6 bg-[#1e3a2f]">
        <div className="px-6 mb-4">
          <p className="text-[10px] text-teal-300 uppercase tracking-widest font-mono font-bold">★ MAIN DIRECTORY ★</p>
        </div>
        <ul className="space-y-1">
          <li className="px-6 py-3 bg-[#244637] border-l-4 border-yellow-300 text-yellow-300 flex items-center gap-3 font-extrabold text-xs uppercase tracking-wider transition select-none">
            <span>📊</span> Dashboard
          </li>
          <li 
            onClick={() => setFilterQuery('')}
            className="px-6 py-3 hover:bg-[#284d3e] transition-colors cursor-pointer flex items-center gap-3 text-slate-300 text-xs uppercase tracking-wider font-extrabold"
          >
            <span>📅</span> Scheduled Classes
          </li>
          
          {(user.role === 'admin' || user.email === "himanshudangwal16@gmail.com") && (
            <li 
              id="sidebar-admin-btn"
              onClick={onOpenAdmin}
              className="px-6 py-3 hover:bg-[#284d3e] transition-colors cursor-pointer flex items-center gap-3 text-slate-300 text-xs uppercase tracking-wider font-extrabold"
            >
              <span>⚙️</span> Admin Console
            </li>
          )}
        </ul>
      </div>

      <div className="p-6 bg-[#162720] border-t-3 border-slate-950">
        <div className="text-[10px] uppercase tracking-widest text-teal-400 mb-2 font-mono font-bold">System Status:</div>
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-2 h-2 rounded-full bg-emerald-450 animate-pulse"></div>
          <div className="text-xs text-slate-300 font-mono">Firebase Online</div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${appsScriptUrl ? 'bg-emerald-450 animate-pulse' : 'bg-amber-400'}`}></div>
          <div className="text-xs text-slate-300 font-mono">
            {appsScriptUrl ? 'Sheets Configured' : 'Offline Fallback'}
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div id="dashboard-layout" className="min-h-screen bg-grid-paper text-slate-900 flex overflow-hidden font-sans">
      
      {/* SIDEBAR NAVIGATION (Desktop) */}
      <nav className="w-64 bg-[#1e3a2f] text-white hidden lg:flex flex-col border-r-4 border-slate-950 shrink-0 select-none">
        {sidebarContent}
      </nav>

      {/* MOBILE HEADER & NAVIGATION */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 bg-slate-950/60 flex lg:hidden">
            <motion.div 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.25 }}
              className="w-64 h-full bg-[#1e3a2f] text-white flex flex-col border-r-4 border-slate-950 relative"
            >
              <button 
                onClick={() => setMobileMenuOpen(false)}
                className="absolute top-4 right-4 p-1.5 rounded-none bg-slate-850 hover:bg-slate-750 text-white border-2 border-slate-950 transition font-extrabold"
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
        <header className="h-20 bg-[#faf9f6]/95 border-b-4 border-slate-950 flex items-center justify-between px-6 md:px-8 shrink-0 sticky top-0 z-20 shadow-sm">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setMobileMenuOpen(true)}
              className="p-1 px-2.5 border-2 border-slate-950 bg-white hover:bg-slate-100 text-slate-900 lg:hidden transition font-extrabold rounded-none shadow-[2px_2px_0px_0px_#000]"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-slate-700 text-xs font-mono font-bold uppercase">
              <span className="bg-yellow-200 border-2 border-slate-950 px-2.5 py-0.5 rotate-[-2deg] font-extrabold text-slate-900 shadow-[2px_2px_0px_0px_#000]">{user.role}</span>
              <span>/</span>
              <span className="text-slate-955 font-extrabold italic">Dashboard Page</span>
            </div>
          </div>

          <div className="flex items-center gap-3.5 flex-wrap">
            {/* Quick Admin action */}
            {(user.role === 'admin' || user.email === "himanshudangwal16@gmail.com") && (
              <button
                id="header-admin-btn"
                onClick={onOpenAdmin}
                className="hidden md:flex items-center gap-1.5 bg-yellow-50 hover:bg-yellow-105 text-slate-900 font-extrabold px-3.5 py-2 border-2 border-slate-950 text-xs transition rounded-none shadow-[2px_2px_0px_0px_#000]"
              >
                <Grid className="h-3.5 w-3.5" /> Admin Panel
              </button>
            )}

            {/* Deploy to Google Sites Toggle */}
            <button
              id="header-sites-deploy-btn"
              onClick={() => {
                setShowSitesDeployGuide(!showSitesDeployGuide);
                setShowSettings(false); // Close Apps Script drawer to keep visual space clean
              }}
              className={`flex items-center gap-1.5 px-3 py-2 border-2 border-slate-950 rounded-none font-extrabold text-[11px] uppercase tracking-wider transition ${
                showSitesDeployGuide 
                  ? 'bg-emerald-600 text-white shadow-inner translate-y-0.5' 
                  : 'bg-emerald-100 hover:bg-emerald-200 text-slate-900 shadow-[2px_2px_0px_0px_#000]'
              }`}
              title="Deploy & Embed via Google Sites"
            >
              <Globe className="h-3.5 w-3.5 shrink-0 animate-spin-slow" />
              <span>Embed on Sites</span>
            </button>

            {/* Apps Script toggle settings */}
            {user.role !== 'student' && (
              <button
                id="header-settings-btn"
                onClick={() => {
                  setShowSettings(!showSettings);
                  setShowSitesDeployGuide(false); // Close Sites guide
                }}
                className={`p-2 border-2 border-slate-950 rounded-none transition ${
                  showSettings ? 'bg-yellow-300 text-slate-900 shadow-inner' : 'bg-white hover:bg-slate-50 text-slate-905 shadow-[2px_2px_0px_0px_#000]'
                }`}
                title="Integrate Google Apps Script"
              >
                <Settings className="h-4 w-4" />
              </button>
            )}

            {/* Logout button */}
            <button
              id="header-logout-btn"
              onClick={onLogout}
              className="p-2 border-2 border-slate-950 bg-white hover:bg-slate-50 text-slate-900 shadow-[2px_2px_0px_0px_#000] rounded-none transition"
              title="Sign Out"
            >
              <LogOut className="h-4 w-4" />
            </button>

            {/* User Profile info */}
            <div className="flex items-center gap-3 border-l-2 border-dashed border-slate-350 pl-4">
              <div className="text-right hidden sm:block">
                <div className="text-xs font-black text-slate-900">{user.name}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider font-mono font-bold">ID: {user.role}</div>
              </div>
              <div className="w-9 h-9 rounded-none bg-[#a855f7] border-2 border-slate-950 text-white shadow-[2px_2px_0px_0px_#000] flex items-center justify-center font-black text-xs select-none rotate-3">
                {userInitials}
              </div>
            </div>
          </div>
        </header>

        {/* WORKSPACE AREA */}
        <div className="p-6 md:p-8 flex-1 flex flex-col space-y-6 max-w-7xl w-full mx-auto">
          
          {/* Error notification header */}
          {error && (
            <div className="p-4 rounded-none bg-rose-50 border-2 border-slate-950 text-rose-850 text-xs flex items-start space-x-2 font-mono">
              <AlertCircle className="h-4.5 w-4.5 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {sheetsLink && (
            <div className="p-4 rounded-none bg-emerald-50 border-2 border-slate-950 text-slate-900 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-[4px_4px_0px_0px_#000] animate-fade-in" id="dashboard-sheets-success-banner">
              <div className="flex items-center space-x-2.5">
                <FileSpreadsheet className="h-5 w-5 text-emerald-650 shrink-0" />
                <span>
                  <strong>Google Sheets Report Deployed!</strong> Your classroom session summary, attendee roster, and speech transcript have been successfully synced.
                </span>
              </div>
              <a 
                href={sheetsLink}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center justify-center bg-emerald-250 hover:bg-emerald-300 text-slate-900 text-[10px] font-extrabold px-4 py-2 border-2 border-slate-950 rounded-none uppercase tracking-wider shadow-[2px_2px_0px_0px_#000] transition active:translate-y-0.5 active:shadow-[1px_1px_0px_0px_#000]"
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

          {/* Non-blocking Google Sheets Sync Confirmation Dialog */}
          <AnimatePresence>
            {showExportModal && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-5 rounded-sm bg-indigo-50 border border-indigo-200 text-indigo-950 anim-fade-in shadow-xs"
                id="sheets-nonblocking-confirm-banner"
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <FileSpreadsheet className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-indigo-950 uppercase tracking-wider font-mono">
                        Google Sheets Authentication Required
                      </h4>
                      <p className="text-xs text-indigo-850 mt-1 leading-relaxed">
                        Exporting the <strong>{showExportModal.subject}</strong> classroom summary, attendee roster, and speech transcript to Google Sheets requires authorization.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                    <button
                      onClick={() => handleExportSessionToSheets(showExportModal, true)}
                      className="flex-1 sm:flex-none justify-center bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] uppercase tracking-wider px-4 py-2 rounded-sm transition flex items-center gap-1.5"
                    >
                      <ArrowUpRight className="h-3.5 w-3.5" />
                      Connect & Sync
                    </button>
                    <button
                      onClick={() => setShowExportModal(null)}
                      className="flex-1 sm:flex-none justify-center bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold text-[10px] uppercase tracking-wider px-4 py-2 rounded-sm transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

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

          {/* Google Sites Deployment & Embedding Guide */}
          <AnimatePresence>
            {showSitesDeployGuide && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
                id="sites-deployment-wrapper"
              >
                <div className="bg-white border border-emerald-250 p-6 rounded-sm shadow-sm">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100 mb-5 text-slate-800">
                    <div>
                      <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                        <Globe className="h-4.5 w-4.5 text-emerald-600 animate-pulse" />
                        Google Sites Deployment & Embedding Guide
                      </h3>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                        Deploy your digital school virtual classroom platform to Google Sites (sites.google.com) in less than 60 seconds.
                      </p>
                    </div>
                    <button
                      onClick={() => setShowSitesDeployGuide(false)}
                      className="p-1 px-2.5 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-sm font-bold text-[10px] uppercase tracking-wider transition"
                    >
                      Dismiss
                    </button>
                  </div>

                  {/* STEP 1: Copy Embed URL */}
                  <div className="mb-6">
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider font-mono mb-2">
                      1. Copy the Portal Application Deployment URL
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        readOnly
                        value={window.location.origin}
                        id="sites-embed-url-copy-input"
                        className="flex-1 bg-slate-50 border border-slate-200 px-3 py-2.5 text-xs font-mono text-slate-700 focus:outline-none rounded-sm select-all"
                      />
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(window.location.origin);
                          setCopiedUrl(true);
                          setTimeout(() => setCopiedUrl(false), 2000);
                        }}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] uppercase tracking-wider px-4 rounded-sm flex items-center gap-1.5 transition whitespace-nowrap active:scale-95"
                      >
                        {copiedUrl ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            Copy URL
                          </>
                        )}
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400 font-mono mt-1.5 uppercase leading-relaxed">
                      Tip: You can also use the Shared URL: <span className="text-indigo-600 select-all underline">https://ais-pre-ertira4337b26pi2x6xzjb-888197685662.asia-southeast1.run.app</span> for full user-wide public embedding!
                    </p>
                  </div>

                  {/* MAIN STEPS ACCORDION */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-4">
                    <div className="space-y-4">
                      {/* SITE CREATION CARD */}
                      <div className="bg-slate-50 p-4 border border-slate-200 rounded-sm">
                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest font-mono flex items-center gap-1.5 mb-2">
                          <span className="bg-emerald-100 text-emerald-800 w-5 h-5 rounded-full inline-flex items-center justify-center text-[10px] shrink-0 font-bold">2</span>
                          Open Google Sites
                        </h4>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          Navigate to your desired School Site on <a href="https://sites.google.com" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline inline-flex items-center gap-0.5 font-bold">Google Sites <ArrowUpRight className="h-3 w-3" /></a> (or create a brand new one). Locate the section where you want to embed the portal.
                        </p>
                      </div>

                      {/* EMBEDDING FRAME */}
                      <div className="bg-slate-50 p-4 border border-slate-200 rounded-sm">
                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest font-mono flex items-center gap-1.5 mb-2">
                          <span className="bg-emerald-100 text-emerald-800 w-5 h-5 rounded-full inline-flex items-center justify-center text-[10px] shrink-0 font-bold">3</span>
                          Choose "Embed" Section
                        </h4>
                        <p className="text-xs text-slate-600 leading-relaxed mb-2">
                          On the right-hand panel of your Google Sites editor, click <strong>"Embed" (&lt;/&gt;)</strong>. 
                        </p>
                        <p className="text-[11px] text-slate-500 bg-white border border-slate-150 p-2 rounded-xs font-mono">
                          👉 Select <strong>"By URL"</strong> option, paste the copied Web Portal URL, and ensure you select <strong>"Whole page"</strong> to render the full viewport cleanly.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {/* SIZING HIGHLIGHTS */}
                      <div className="bg-slate-50 p-4 border border-slate-200 rounded-sm">
                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest font-mono flex items-center gap-1.5 mb-2">
                          <span className="bg-emerald-100 text-emerald-800 w-5 h-5 rounded-full inline-flex items-center justify-center text-[10px] shrink-0 font-bold">4</span>
                          Resize Embedded Frame
                        </h4>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          Once the portal block is embedded inside your page, click the embed instance to display the blue sizing anchors. 
                          <strong> Drag the handles horizontally to fill the screen</strong> (full width, 100%) and 
                          <strong> drag the bottom handle vertically downwards</strong> until the frame height is at least <strong>750px</strong> to totally eliminate double-scrollbars.
                        </p>
                      </div>

                      {/* MICROPHONE WARNING */}
                      <div className="bg-slate-50 p-4 border border-slate-200 rounded-sm">
                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest font-mono flex items-center gap-1.5 mb-2">
                          <span className="bg-emerald-100 text-emerald-800 w-5 h-5 rounded-full inline-flex items-center justify-center text-[10px] shrink-0 font-bold">5</span>
                          Allow Sensor Permissions
                        </h4>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          Because the classrooms translate spoken lectures in real time, teachers and students using the portal will need to allow <strong>Microphone Access</strong>. Since Google Sites loads the portal in a cross-origin iframe, ensure they tap <strong>"Allow microphone"</strong> instantly when prompted.
                        </p>
                      </div>
                    </div>
                  </div>

                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* STATISTICS PANEL ROW (Geometric Balance Spec) */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            <div className="bg-[#fefeeb] p-5 border-3 border-slate-900 shadow-[4px_4px_0px_0px_#000] rounded-none rotate-[-1deg]">
              <div className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider mb-1 font-mono">Active Classes</div>
              <div className="text-2xl md:text-3xl font-black tracking-tight text-slate-950 font-sans">{liveCount}</div>
              <div className="text-xs text-emerald-700 font-bold mt-2 flex items-center gap-1.5 font-sans">
                <span className="w-2.5 h-2.5 bg-emerald-550 border border-slate-950 rounded-full inline-block animate-pulse"></span>
                <span>{liveCount} currently live</span>
              </div>
            </div>

            <div className="bg-[#eefcfc] p-5 border-3 border-slate-900 shadow-[4px_4px_0px_0px_#000] rounded-none rotate-[1deg]">
              <div className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider mb-1 font-mono">Scheduled Classes</div>
              <div className="text-2xl md:text-3xl font-black tracking-tight text-slate-950 font-sans">{scheduledCount}</div>
              <div className="text-xs text-indigo-700 font-bold mt-2 font-sans">Across all grades</div>
            </div>

            <div className="bg-[#fcf3ff] p-5 border-3 border-slate-900 shadow-[4px_4px_0px_0px_#000] rounded-none rotate-[-0.5deg]">
              <div className="text-[10px] text-slate-505 font-extrabold uppercase tracking-wider mb-1 font-mono">Speech AI Code</div>
              <div className="text-2xl md:text-3xl font-black tracking-tight text-slate-950 italic font-mono">hi-IN</div>
              <div className="text-xs text-[#a855f7] font-bold mt-2 font-sans">Hindi Voice Enabled</div>
            </div>

            <div className="bg-emerald-50 p-5 border-3 border-slate-900 shadow-[4px_4px_0px_0px_#000] rounded-none rotate-[0.5deg]">
              <div className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider mb-1 font-mono">Platform Cost</div>
              <div className="text-2xl md:text-3xl font-black tracking-tight text-emerald-800 italic font-sans">₹0</div>
              <div className="text-xs text-emerald-700 font-bold mt-2 font-sans">Free Services Tier</div>
            </div>
          </section>

          {/* DESIGN SPLIT GRID OVERVIEW */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
            
            {/* Live & Scheduled Classes List panel (8 cols) */}
            <div className="lg:col-span-8 flex flex-col bg-[#faf9f6]/95 border-3 border-slate-900 shadow-[6px_6px_0px_0px_#000] rounded-none overflow-hidden">
              
              <div className="px-6 py-4 border-b-3 border-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-yellow-100">
                <div>
                  <h2 className="font-extrabold text-slate-950 text-sm uppercase tracking-wider">Scheduled Virtual Classes</h2>
                  <p className="text-[10px] text-slate-605 font-mono mt-0.5">Real-time snapshots from classroom logs</p>
                </div>
  
                {/* Filter and search form integration inside panel */}
                <div className="relative w-full sm:w-auto sm:min-w-[240px]">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-900">
                    <Search className="h-3.5 w-3.5" />
                  </span>
                  <input
                    type="text"
                    placeholder="Search grade or subject..."
                    value={filterQuery}
                    onChange={(e) => setFilterQuery(e.target.value)}
                    className="w-full bg-white border-2 border-slate-950 pl-8.5 pr-3 py-1.5 text-xs font-mono focus:outline-none focus:bg-[#fffbeb] rounded-none shadow-[2px_2px_0px_0px_#000]"
                  />
                </div>
              </div>

              {/* Dynamic Status Tabs sub-bar */}
              <div className="px-6 py-2.5 border-b-2 border-slate-900 flex items-center space-x-1.5 overflow-x-auto bg-slate-50 shrink-0 scrollbar-none" id="status-tabs-strip">
                {[
                  { id: 'all', label: 'All Classes' },
                  { id: 'live', label: 'Live Active' },
                  { id: 'scheduled', label: 'Scheduled Only' },
                  { id: 'ended', label: 'Ended Lectures' }
                ].map((tab) => {
                  const isActive = statusFilter === tab.id;
                  const count = tab.id === 'all' 
                    ? sessions.length 
                    : sessions.filter(s => s.status === tab.id).length;
                  
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setStatusFilter(tab.id as any)}
                      className={`text-[9px] md:text-[10px] px-3 py-1.5 rounded-none transition font-black uppercase tracking-wider cursor-pointer whitespace-nowrap select-none flex items-center gap-1.5 border-2 ${
                        isActive
                          ? 'bg-slate-955 border-slate-950 text-white shadow-[2px_2px_0px_0px_#000] translate-y-[-1px]'
                          : 'text-slate-800 bg-white border-slate-950 hover:bg-slate-100 shadow-[1px_1px_0px_0px_#000]'
                      }`}
                    >
                      <span>{tab.label}</span>
                      <span className={`text-[8px] font-mono px-1 py-0.2 rounded-none border ${
                        isActive 
                          ? 'bg-slate-850 text-slate-200 border-slate-700' 
                          : 'bg-slate-100 text-slate-600 border-slate-300'
                      }`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
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
                                    className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-extrabold text-[10px] px-3.5 py-1.5 border-2 border-slate-950 rounded-none uppercase tracking-wider shadow-[2px_2px_0px_0px_#000] active:translate-y-0.5 active:shadow-[1px_1px_0px_0px_#000] transition-all flex items-center gap-1.5"
                                  >
                                    <Play className="h-3 w-3 fill-current mt-[-1px] text-slate-950" />
                                    {isHost ? 'Resume' : 'Join'}
                                  </button>
                                ) : isScheduled ? (
                                  <>
                                    {isHost ? (
                                      <button
                                        onClick={() => onStartClass(session)}
                                        className="bg-yellow-300 hover:bg-yellow-405 text-slate-900 font-extrabold text-[10px] px-3.5 py-1.5 border-2 border-slate-950 rounded-none uppercase tracking-wider shadow-[2px_2px_0px_0px_#000] active:translate-y-0.5 active:shadow-[1px_1px_0px_0px_#000] transition-all"
                                      >
                                        Start Class
                                      </button>
                                    ) : (
                                      <span className="text-[10px] text-slate-500 italic font-mono font-bold">Locked</span>
                                    )}
                                  </>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <span className="text-[9px] text-slate-500 italic uppercase font-mono font-bold">Closed</span>
                                    {(isHost || user.role === 'admin') && (
                                      <button
                                        id={`export-sheets-dash-${session.sessionId}`}
                                        onClick={() => handleExportSessionToSheets(session)}
                                        disabled={sessionExportingId === session.sessionId}
                                        className="bg-emerald-50 hover:bg-emerald-100 text-slate-950 disabled:opacity-50 border-2 border-slate-950 font-black text-[9px] px-2.5 py-1 rounded-none uppercase tracking-wider shadow-[2px_2px_0px_0px_#000] active:translate-y-0.5 active:shadow-[1px_1px_0px_0px_#000] transition-all flex items-center gap-1 shrink-0"
                                      >
                                        <FileSpreadsheet className="h-3 w-3 text-slate-900" />
                                        {sessionExportingId === session.sessionId ? 'Syncing...' : 'Export Sheet'}
                                      </button>
                                    )}
                                  </div>
                                )}

                                {/* Cancel Session anchor */}
                                {isHost && session.status !== 'ended' && (
                                  <button
                                    onClick={() => handleDeleteSession(session.sessionId)}
                                    className="text-slate-800 hover:text-rose-600 p-1.5 border-2 border-transparent hover:border-slate-950 transition rounded-none hover:bg-white ml-1"
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
              <div className="bg-[#1e3a2f] text-yellow-100 p-6 shadow-[5px_5px_0px_0px_#000] border-3 border-slate-900 rounded-none rotate-[0.5deg]">
                <h3 className="text-xs font-black uppercase tracking-widest text-emerald-355 mb-3 font-mono">★ Virtual Meet Engine ★</h3>
                <p className="text-xs text-slate-300 leading-relaxed mb-4 font-mono">
                  Google Sheet calendar codes are actively generating. Class meeting URLs register automatically inside firestore logs.
                </p>
                <div className="bg-[#11231c] p-3 rounded-none text-[10.5px] font-mono text-emerald-400 break-all border-2 border-slate-950 shadow-inner">
                  {appsScriptUrl ? appsScriptUrl : "script.google.com/macros/s/AKfycb.../exec (Fallback Active)"}
                </div>
              </div>

              {/* Box 2: Quick actions / scheduling trigger */}
              <div className="bg-[#faf9f6] border-3 border-slate-900 p-6 rounded-none shadow-[5px_5px_0px_0px_#000] flex-1 flex flex-col min-h-[300px] rotate-[-0.5deg]">
                <h3 className="text-xs font-black text-slate-950 uppercase tracking-widest mb-4 border-b-2 border-dashed border-slate-300 pb-2 font-mono">✐ Quick Actions</h3>
                
                <div className="space-y-3 flex-1">
                  
                  {user.role !== 'student' ? (
                    <button
                      id="side-schedule-class-btn"
                      onClick={() => setShowCreateModal(true)}
                      className="w-full text-left flex items-center justify-between p-3.5 bg-[#fefeeb] hover:bg-yellow-50 border-2 border-slate-950 shadow-[2.5px_2.5px_0px_0px_#000] active:translate-y-0.5 active:shadow-[1px_1px_0px_0px_#000] transition-all text-xs cursor-pointer group rounded-none"
                    >
                      <span className="text-slate-905 group-hover:text-yellow-750 font-black uppercase tracking-wider font-sans">Book New Class Slot</span>
                      <span className="text-slate-905 font-extrabold font-mono text-sm">+</span>
                    </button>
                  ) : (
                    <div className="p-4 border-2 border-slate-950 text-slate-800 text-xs italic bg-[#eefcfc] leading-relaxed font-sans shadow-[2.5px_2.5px_0px_0px_#000]">
                      Logged in as Student. To join virtual sessions and transcripts, select an active classroom in the scheduled board list.
                    </div>
                  )}

                  {(user.role === 'admin' || user.email === "himanshudangwal16@gmail.com") && (
                    <button
                      id="side-admin-redirect-btn"
                      onClick={onOpenAdmin}
                      className="w-full text-left flex items-center justify-between p-3.5 bg-white hover:bg-slate-50 border-2 border-slate-950 shadow-[2.5px_2.5px_0px_0px_#000] active:translate-y-0.5 active:shadow-[1px_1px_0px_0px_#000] transition-all text-xs cursor-pointer group rounded-none"
                    >
                      <span className="text-slate-900 group-hover:text-amber-800 font-black uppercase tracking-wider font-sans">Configure School Roles</span>
                      <span className="text-slate-900 font-mono">👥</span>
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
