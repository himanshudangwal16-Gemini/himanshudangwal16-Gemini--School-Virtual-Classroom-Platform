/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { app_onSnapshot, app_updateDoc } from '../firebase';
import { 
  Users, 
  Calendar, 
  FileSpreadsheet, 
  ShieldCheck, 
  ArrowLeft, 
  FileText, 
  Download, 
  Notebook,
  TrendingUp,
  AlertCircle,
  Menu,
  X,
  ArrowUpRight,
  Globe
} from 'lucide-react';
import { UserProfile, ClassSession, AttendanceRecord } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface AdminPanelProps {
  user: UserProfile;
  onBackToDashboard: () => void;
}

export default function AdminPanel({ user, onBackToDashboard }: AdminPanelProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorHeader, setErrorHeader] = useState<string | null>(null);

  // Mobile sidebar toggle state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Modal display overlays
  const [selectedTranscript, setSelectedTranscript] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'users' | 'sessions' | 'attendance'>('attendance');

  // Google Sheets integration state
  const [exportingToSheets, setExportingToSheets] = useState(false);
  const [sessionExportingId, setSessionExportingId] = useState<string | null>(null);
  const [sheetsLink, setSheetsLink] = useState<string | null>(null);
  const [showMasterExportModal, setShowMasterExportModal] = useState(false);
  const [showSessionExportModal, setShowSessionExportModal] = useState<ClassSession | null>(null);

  // Real-time snapshot binders
  useEffect(() => {
    let unsubUsers = () => {};
    let unsubSessions = () => {};
    let unsubAttendance = () => {};

    try {
      // 1. Fetch Users
      unsubUsers = app_onSnapshot('users', (uList: UserProfile[]) => {
        setUsers(uList);
      }, (err) => {
        console.error(err);
      });

      // 2. Fetch Sessions
      unsubSessions = app_onSnapshot('sessions', (sList: ClassSession[]) => {
        sList.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
        setSessions(sList);
      }, (err) => {
        console.error(err);
      });

      // 3. Fetch Attendance Log
      unsubAttendance = app_onSnapshot('attendance', (aList: AttendanceRecord[]) => {
        setAttendance(aList);
        setLoading(false);
      }, (err) => {
        console.error(err);
      });

    } catch (err) {
      console.error(err);
      setErrorHeader("Firestore reads denied. Ensure your role is correct inside the console.");
    }

    return () => {
      unsubUsers();
      unsubSessions();
      unsubAttendance();
    };
  }, []);

  // Update role handler
  const handleUpdateUserRole = async (targetUserId: string, newRole: string) => {
    try {
      await app_updateDoc('users', targetUserId, { role: newRole });
    } catch (err: any) {
      setErrorHeader("Role write rejected. Permission Denied.");
    }
  };

  // Export attendance log to spreadsheet CSV
  const handleExportCsv = () => {
    if (attendance.length === 0) {
      alert("No attendance logs found yet.");
      return;
    }

    const headers = "Student Name,Student Email,Session Subject,Joined At,Left At,Minutes Spent\n";
    const rows = attendance.map(rec => {
      const targetSession = sessions.find(s => s.sessionId === rec.sessionId);
      const subjectName = targetSession ? targetSession.subject : "Deleted Class";
      
      const cleanName = rec.studentName.replace(/"/g, '""');
      const cleanEmail = rec.studentEmail.replace(/"/g, '""');
      const cleanSubject = subjectName.replace(/"/g, '""');
      
      return `"${cleanName}","${cleanEmail}","${cleanSubject}","${rec.joinedAt}","${rec.leftAt || 'N/A'}",${rec.durationMinutes || 0}`;
    }).join("\n");

    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `school_virtual_attendance_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export all attendance records to a Google Sheet
  const handleExportToSheets = async (ignoreTokenCheck = false) => {
    setExportingToSheets(true);
    setSheetsLink(null);
    setErrorHeader(null);
    try {
      const { getGoogleAccessToken, signInWithGoogle } = await import('../firebase');
      const { exportAllAttendanceToSheets } = await import('../utils/googleSheets');
      
      let token = getGoogleAccessToken();
      if (!token && !ignoreTokenCheck) {
        setShowMasterExportModal(true);
        setExportingToSheets(false);
        return;
      }

      if (!token && ignoreTokenCheck) {
        await signInWithGoogle();
        token = getGoogleAccessToken();
      }

      if (!token) {
        throw new Error("Could not retrieve active Google Sheets authorization token.");
      }

      const result = await exportAllAttendanceToSheets(token, sessions, attendance);
      setSheetsLink(result.url);
    } catch (err: any) {
      console.error(err);
      setErrorHeader("Google Sheets integration failed: " + (err.message || String(err)));
    } finally {
      setExportingToSheets(false);
      setShowMasterExportModal(false);
    }
  };

  // Export specific session summary & attendance to Google Sheets
  const handleExportSessionToSheets = async (targetSession: ClassSession, ignoreTokenCheck = false) => {
    setSessionExportingId(targetSession.sessionId);
    setSheetsLink(null);
    setErrorHeader(null);
    try {
      const { getGoogleAccessToken, signInWithGoogle } = await import('../firebase');
      const { exportSessionReportToSheets } = await import('../utils/googleSheets');
      
      let token = getGoogleAccessToken();
      if (!token && !ignoreTokenCheck) {
        setShowSessionExportModal(targetSession);
        setSessionExportingId(null);
        return;
      }

      if (!token && ignoreTokenCheck) {
        await signInWithGoogle();
        token = getGoogleAccessToken();
      }

      if (!token) {
        throw new Error("Could not retrieve active Google Sheets authorization token.");
      }

      const matchedRecords = attendance.filter(rec => rec.sessionId === targetSession.sessionId);
      const result = await exportSessionReportToSheets(token, targetSession, matchedRecords);
      setSheetsLink(result.url);
      try {
        const { app_updateDoc } = await import('../firebase');
        await app_updateDoc('sessions', targetSession.sessionId, { googleSheetUrl: result.url });
      } catch (dbErr) {
        console.warn("Could not save Google Sheet link back to Firestore document.", dbErr);
      }
    } catch (err: any) {
      console.error(err);
      setErrorHeader(`Google Sheets Export for ${targetSession.subject} failed: ` + (err.message || String(err)));
    } finally {
      setSessionExportingId(null);
      setShowSessionExportModal(null);
    }
  };

  // Dashboard Aggregation stats
  const totalStudentsCheckedInCount = attendance.length;
  
  // Average minutes calculation
  const totalAttendedMin = attendance.reduce((acc, current) => acc + (current.durationMinutes || 0), 0);
  const averageMinutes = totalStudentsCheckedInCount > 0 
    ? Math.round(totalAttendedMin / totalStudentsCheckedInCount) 
    : 0;

  const userInitials = user.name
    ? user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
    : 'A';

  const sidebarContent = (
    <>
      <div className="p-6 border-b-4 border-slate-950 bg-[#162e24]">
        <div className="flex items-center gap-3">
          <div className="bg-yellow-300 w-9 h-9 flex items-center justify-center border-2 border-slate-950 font-black text-xl select-none text-slate-950 shadow-[1.5px_1.5px_0px_0px_#000]">
            🏫
          </div>
          <h1 className="font-black tracking-widest text-[#fefeeb] uppercase select-none text-base font-mono">
            SCHOOL PORTAL
          </h1>
        </div>
      </div>
      
      <div className="flex-1 py-6 bg-[#1a382c]">
        <div className="px-6 mb-4">
          <p className="text-[10px] text-emerald-350 uppercase tracking-widest font-mono font-bold">★ Directory Navigation ★</p>
        </div>
        <ul className="space-y-1">
          <li 
            onClick={onBackToDashboard}
            className="px-6 py-3 hover:bg-[#132c22] transition-colors cursor-pointer flex items-center gap-3 text-slate-350 text-xs font-black uppercase tracking-wider font-mono"
          >
            <span>📊</span> Back to Main Room
          </li>
          <li 
            onClick={onBackToDashboard}
            className="px-6 py-3 hover:bg-[#132c22] transition-colors cursor-pointer flex items-center gap-3 text-slate-350 text-xs font-black uppercase tracking-wider font-mono"
          >
            <span>📅</span> Class Scheduled Logs
          </li>
          <li className="px-6 py-3 bg-yellow-400 border-l-8 border-slate-950 text-slate-950 flex items-center gap-3 font-black text-xs transition select-none uppercase tracking-wider font-mono">
            <span>⚙️</span> SYSTEM CONSOLE
          </li>
        </ul>
      </div>

      <div className="p-6 bg-[#11241c] border-t-2 border-slate-950">
        <div className="text-[10px] uppercase tracking-widest text-[#9cdab6] mb-2 font-mono font-bold">SYSTEM INTEGRITY</div>
        <div className="flex items-center gap-2 mb-1.5 font-mono text-[11px] text-slate-300">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse border border-slate-950" />
          <span>Firebase Live</span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px] text-slate-300">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse border border-slate-950" />
          <span>Role Authority Checked</span>
        </div>
      </div>
    </>
  );

  return (
    <div id="admin-panel-layout" className="min-h-screen bg-[#c8dcd3] bg-[radial-gradient(#98bfa2_1.5px,transparent_1.5px)] [background-size:24px_24px] text-slate-900 flex overflow-hidden font-sans">
      
      {/* SIDEBAR NAVIGATION (Desktop - Classic blackboard) */}
      <nav className="w-64 bg-[#1a382c] text-white hidden lg:flex flex-col border-r-3 border-slate-950 shrink-0 select-none shadow-[2px_0px_0px_0px_rgba(15,23,42,1)]">
        {sidebarContent}
      </nav>

      {/* MOBILE SIDEBAR NAVIGATION */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 bg-slate-950/65 flex lg:hidden">
            <motion.div 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.25 }}
              className="w-64 h-full bg-[#1a382c] text-white flex flex-col border-r-3 border-slate-950 relative"
            >
              <button 
                onClick={() => setMobileMenuOpen(false)}
                className="absolute top-4 right-4 p-1.5 rounded-none border-2 border-slate-950 bg-rose-455 text-slate-950 transition shadow-[2px_2px_0px_0px_#000]"
              >
                <X className="h-4 w-4" />
              </button>
              {sidebarContent}
            </motion.div>
            <div className="flex-1" onClick={() => setMobileMenuOpen(false)}></div>
          </div>
        )}
      </AnimatePresence>

      {/* MAIN FRAME */}
      <main className="flex-1 flex flex-col overflow-y-auto h-screen relative">
        
        {/* TOP HEADER BAR */}
        <header className="h-16 bg-[#faf9f6] border-b-3 border-slate-950 flex items-center justify-between px-4 sm:px-6 md:px-8 shrink-0 sticky top-0 z-20 shadow-[0px_3px_0px_0px_rgba(15,23,42,1)]">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setMobileMenuOpen(true)}
              className="p-1.5 border-2 border-slate-950 bg-white hover:bg-slate-50 text-slate-950 lg:hidden transition rounded-none mr-1 shadow-[2px_2px_0px_0px_#000]"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <button
              id="header-back-btn"
              onClick={onBackToDashboard}
              className="p-2 border-2 border-slate-950 bg-white text-slate-950 hover:bg-slate-50 transition font-black uppercase text-[10px] tracking-wider pr-3 flex items-center gap-1.5 shadow-[2px_2px_0px_0px_#000] active:translate-y-0.5 active:shadow-[1px_1px_0px_0px_#000] cursor-pointer rounded-none"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
            <span className="text-slate-400 hidden sm:inline">|</span>
            <div className="hidden sm:flex items-center gap-2 text-slate-655 text-xs font-mono font-bold tracking-wider uppercase">
              <span>ADMINISTRATOR</span>
              <span>/</span>
              <span className="text-slate-950 font-black italic">Console Setup</span>
            </div>
          </div>

          <div className="flex items-center gap-3.5 flex-wrap">
            {/* Export CSV action */}
            <button
              id="export-attendance-csv-btn"
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 bg-[#fefeeb] hover:bg-yellow-50 text-slate-950 border-2 border-slate-950 font-black text-[10px] px-3.5 py-2.5 rounded-none uppercase tracking-wider transition shadow-[2px_2px_0px_0px_#000] active:translate-y-0.5 active:shadow-[1px_1px_0px_0px_#000] cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 text-slate-950" /> CSV Report
            </button>

            {/* Export Google Sheets action */}
            <button
              id="export-attendance-sheets-btn"
              onClick={handleExportToSheets}
              disabled={exportingToSheets}
              className="flex items-center gap-1.5 bg-[#eefcfc] hover:bg-[#d8f8f8] text-slate-950 border-2 border-slate-950 font-black text-[10px] px-3.5 py-2.5 rounded-none uppercase tracking-wider transition disabled:opacity-50 shadow-[2px_2px_0px_0px_#000] active:translate-y-0.5 active:shadow-[1px_1px_0px_0px_#000] cursor-pointer"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-slate-955" /> {exportingToSheets ? 'Syncing...' : 'Sync with Google Sheets'}
            </button>

            {/* User credentials panel */}
            <div className="flex items-center gap-3 border-l-2 border-slate-350 pl-4">
              <div className="text-right hidden sm:block">
                <div className="text-xs font-black text-slate-950">{user.name}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider font-mono font-black">Role: {user.role}</div>
              </div>
              <div className="w-9 h-9 rounded-none bg-yellow-100 border-2 border-slate-950 text-slate-950 shadow-[2px_2px_0px_0px_#000] flex items-center justify-center font-black text-xs select-none">
                {userInitials}
              </div>
            </div>
          </div>
        </header>

        {/* WORKSPACE CONTENT */}
        <div className="p-4 sm:p-6 md:p-8 flex-1 flex flex-col space-y-6 max-w-7xl w-full mx-auto">
          
          {sheetsLink && (
            <div className="p-4 rounded-none bg-emerald-50 border-2 border-slate-950 text-slate-950 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-[4px_4px_0px_0px_#000] animate-fade-in" id="sheets-success-banner">
              <div className="flex items-center space-x-2.5">
                <FileSpreadsheet className="h-5 w-5 text-emerald-705 shrink-0" />
                <span>
                  <strong>Google Sheets Sync Successful!</strong> A secure attendance spreadsheet has been deployed in your Google Drive logs.
                </span>
              </div>
              <a 
                href={sheetsLink}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center justify-center bg-emerald-250 hover:bg-emerald-305 text-slate-900 text-[10px] font-extrabold px-4 py-2 border-2 border-slate-950 rounded-none uppercase tracking-wider shadow-[2px_2px_0px_0px_#000] transition active:translate-y-0.5 active:shadow-[1px_1px_0px_0px_#000]"
              >
                View Live Spreadsheet
              </a>
            </div>
          )}

          {errorHeader && (
            <div className="p-4 rounded-none bg-rose-50 border-2 border-slate-950 text-rose-950 text-xs flex items-center space-x-3">
              <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
              <span>{errorHeader}</span>
            </div>
          )}

          {/* Non-blocking Master Google Sheets Sync Confirmation Dialog */}
          <AnimatePresence>
            {showMasterExportModal && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-5 rounded-none bg-yellow-50 border-2 border-slate-950 text-slate-900 anim-fade-in shadow-[4px_4px_0px_0px_#000]"
                id="master-sheets-nonblocking-confirm"
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <FileSpreadsheet className="h-5 w-5 text-[#8b5cf6] shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-mono font-black text-slate-950 uppercase tracking-widest">
                        ★ Sheets Sync Authorization
                      </h4>
                      <p className="text-xs text-slate-800 mt-1 leading-relaxed font-sans">
                        Synchronizing master rosters to Google Sheets will batch generate student attendance timesheets across all {sessions.length} classroom sessions in a secure spreadsheet.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                    <button
                      onClick={() => handleExportToSheets(true)}
                      className="flex-1 sm:flex-none justify-center bg-[#a855f7] hover:bg-purple-500 text-white font-black text-[10px] uppercase tracking-wider px-4 py-2.5 border-2 border-slate-950 rounded-none shadow-[2px_2px_0px_0px_#000] active:translate-y-0.5 cursor-pointer flex items-center gap-1.5"
                    >
                      <ArrowUpRight className="h-3.5 w-3.5" />
                      Authorize & Export
                    </button>
                    <button
                      onClick={() => setShowMasterExportModal(false)}
                      className="flex-1 sm:flex-none justify-center bg-white hover:bg-slate-100 text-slate-800 border-2 border-slate-950 font-black text-[10px] uppercase tracking-wider px-4 py-2.5 rounded-none transition shadow-[2px_2px_0px_0px_#000] cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Non-blocking Class Session Google Sheets Sync Confirmation Dialog */}
          <AnimatePresence>
            {showSessionExportModal && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-5 rounded-none bg-yellow-50 border-2 border-slate-950 text-slate-900 anim-fade-in shadow-[4px_4px_0px_0px_#000]"
                id="session-sheets-nonblocking-confirm"
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <FileSpreadsheet className="h-5 w-5 text-[#8b5cf6] shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-mono font-black text-slate-950 uppercase tracking-widest">
                        ★ Class Sheets Sync Authorization
                      </h4>
                      <p className="text-xs text-slate-800 mt-1 leading-relaxed">
                        Exporting report logs for <strong>{showSessionExportModal.subject}</strong> to Google Sheets. This will compile all live translation scripts and student logs.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                    <button
                      onClick={() => handleExportSessionToSheets(showSessionExportModal, true)}
                      className="flex-1 sm:flex-none justify-center bg-[#a855f7] hover:bg-purple-500 text-white font-black text-[10px] uppercase tracking-wider px-4 py-2.5 border-2 border-slate-950 rounded-none shadow-[2px_2px_0px_0px_#000] active:translate-y-0.5 cursor-pointer flex items-center gap-1.5"
                    >
                      <ArrowUpRight className="h-3.5 w-3.5" />
                      Authorize & Export
                    </button>
                    <button
                      onClick={() => setShowSessionExportModal(null)}
                      className="flex-1 sm:flex-none justify-center bg-white hover:bg-slate-100 text-slate-800 border-2 border-slate-950 font-black text-[10px] uppercase tracking-wider px-4 py-2.5 rounded-none transition shadow-[2px_2px_0px_0px_#000] cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* STATISTICS PANELS (Geometric Balance Spec) */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6" id="stats-banner-row">
            <div className="bg-[#fefeeb] p-5 border-3 border-slate-900 shadow-[4px_4px_0px_0px_#000] rounded-none rotate-[-1deg]">
              <div className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider mb-1 font-mono">Enrolled Users</div>
              <div className="text-2xl md:text-3xl font-black tracking-tight text-slate-950 font-sans">{users.length}</div>
              <div className="text-xs text-indigo-750 font-bold mt-2 flex items-center gap-1.5 font-sans">
                <Users className="h-3.5 w-3.5 text-indigo-800" />
                <span>Active profiles</span>
              </div>
            </div>

            <div className="bg-[#eefcfc] p-5 border-3 border-slate-900 shadow-[4px_4px_0px_0px_#000] rounded-none rotate-[1deg]">
              <div className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider mb-1 font-mono">Scheduled Sessions</div>
              <div className="text-2xl md:text-3xl font-black tracking-tight text-slate-950 font-sans">{sessions.length}</div>
              <div className="text-xs text-amber-750 font-bold mt-2 flex items-center gap-1.5 font-sans">
                <Calendar className="h-3.5 w-3.5 text-amber-800" />
                <span>In school database</span>
              </div>
            </div>

            <div className="bg-[#fcf3ff] p-5 border-3 border-slate-900 shadow-[4px_4px_0px_0px_#000] rounded-none rotate-[-0.5deg]">
              <div className="text-[10px] text-slate-550 font-extrabold uppercase tracking-wider mb-1 font-mono">Student Check-Ins</div>
              <div className="text-2xl md:text-3xl font-black tracking-tight text-slate-955 font-sans">{totalStudentsCheckedInCount}</div>
              <div className="text-xs text-emerald-750 font-bold mt-2 flex items-center gap-1.5 font-sans">
                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-800" />
                <span>Arrival registers live</span>
              </div>
            </div>

            <div className="bg-emerald-50 p-5 border-3 border-slate-900 shadow-[4px_4px_0px_0px_#000] rounded-none rotate-[0.5deg]">
              <div className="text-[10px] text-slate-505 font-extrabold uppercase tracking-wider mb-1 font-mono">Avg Session Duration</div>
              <div className="text-2xl md:text-3xl font-black tracking-tight text-slate-950 font-sans">{averageMinutes}m</div>
              <div className="text-xs text-sky-750 font-bold mt-2 flex items-center gap-1.5 font-sans">
                <TrendingUp className="h-3.5 w-3.5 text-sky-700" />
                <span>Minutes spent in class</span>
              </div>
            </div>
          </section>

          {/* MAIN DATA TABLES AREA */}
          <div className="bg-[#faf9f6] border-3 border-slate-900 shadow-[6px_6px_0px_0px_#000] rounded-none overflow-hidden flex flex-col flex-1 min-h-[480px]">
            
            {/* Tab Selection Header */}
            <div className="border-b-3 border-slate-900 bg-yellow-105 px-6 pt-3 flex space-x-6" id="admin-tabs">
              <button
                onClick={() => setActiveTab('attendance')}
                className={`pb-3 text-xs font-black font-mono uppercase tracking-widest relative transition-all ${
                  activeTab === 'attendance' 
                    ? 'text-slate-950 border-b-4 border-slate-950 scale-102 font-black' 
                    : 'text-slate-500 hover:text-slate-950'
                }`}
              >
                Attendance Tracker ({attendance.length})
              </button>
              
              <button
                onClick={() => setActiveTab('users')}
                className={`pb-3 text-xs font-black font-mono uppercase tracking-widest relative transition-all ${
                  activeTab === 'users' 
                    ? 'text-slate-950 border-b-4 border-slate-950 scale-102 font-black' 
                    : 'text-slate-500 hover:text-slate-950'
                }`}
              >
                User Roles ({users.length})
              </button>

              <button
                onClick={() => setActiveTab('sessions')}
                className={`pb-3 text-xs font-black font-mono uppercase tracking-widest relative transition-all ${
                  activeTab === 'sessions' 
                    ? 'text-slate-950 border-b-4 border-slate-950 scale-102 font-black' 
                    : 'text-slate-500 hover:text-slate-950'
                }`}
              >
                Class Sessions ({sessions.length})
              </button>
            </div>

            {/* Table wrapper */}
            <div className="flex-1 overflow-x-auto">
              {loading ? (
                <div className="text-center py-20 text-slate-500 font-mono text-xs">
                  Synchronizing records...
                </div>
              ) : (
                <>
                  {/* 1. ATTENDANCE LOG VIEW */}
                  {activeTab === 'attendance' && (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-[#eefcfc] text-slate-900 text-[10px] uppercase font-black tracking-wider border-b-2 border-slate-950">
                        <tr>
                          <th className="px-6 py-3.5 font-mono">Student Name & Email</th>
                          <th className="px-6 py-3.5 font-mono">Session Subject</th>
                          <th className="px-6 py-3.5 font-mono">Joined Slot</th>
                          <th className="px-6 py-3.5 font-mono">Left Slot</th>
                          <th className="px-6 py-3.5 font-mono text-right font-black">Class Time Spent</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y-2 divide-slate-900">
                        {attendance.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-6 py-12 text-center text-slate-650 font-mono italic font-bold">
                              No student arrivals logged in the attendance ledger yet.
                            </td>
                          </tr>
                        ) : (
                          attendance.map((rec) => {
                            const targetSession = sessions.find(s => s.sessionId === rec.sessionId);
                            return (
                              <tr key={rec.docId} className="hover:bg-yellow-50/40 transition bg-white">
                                <td className="px-6 py-4">
                                  <div className="font-extrabold text-slate-950 text-sm">{rec.studentName}</div>
                                  <div className="text-[10px] text-slate-600 font-mono mt-0.5">{rec.studentEmail}</div>
                                </td>
                                <td className="px-6 py-4 font-black text-slate-850 text-xs">
                                  {targetSession ? targetSession.subject : "Deleted Class"}
                                </td>
                                <td className="px-6 py-4 text-slate-700 font-mono text-[11px]">
                                  {new Date(rec.joinedAt).toLocaleDateString()} at {new Date(rec.joinedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </td>
                                <td className="px-6 py-4 text-slate-700 font-mono text-[11px]">
                                  {rec.leftAt ? (
                                    <>
                                      {new Date(rec.leftAt).toLocaleDateString()} at {new Date(rec.leftAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </>
                                  ) : (
                                    <span className="text-emerald-900 font-extrabold bg-[#e8f5e9] px-2 py-0.5 border border-emerald-950 text-[9px] uppercase font-mono tracking-wider shadow-[1px_1px_0px_0px_#000]">IN CLASS</span>
                                  )}
                                </td>
                                <td className="px-6 py-4 text-right font-mono font-black text-slate-950 text-sm">
                                  {rec.durationMinutes ? `${rec.durationMinutes} mins` : '-'}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  )}

                  {/* 2. USER ROLE DIRECT MANAGEMENT */}
                  {activeTab === 'users' && (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-[#eefcfc] text-slate-900 text-[10px] uppercase font-black tracking-wider border-b-2 border-slate-950">
                        <tr>
                          <th className="px-6 py-3.5 font-mono">Full Name</th>
                          <th className="px-6 py-3.5 font-mono">Email Address</th>
                          <th className="px-6 py-3.5 font-mono">Assigned Role Status</th>
                          <th className="px-6 py-3.5 font-mono text-right">Administrative Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y-2 divide-slate-900">
                        {users.map((profile) => (
                          <tr key={profile.uid} className="hover:bg-yellow-50/40 transition bg-white">
                            <td className="px-6 py-4 font-extrabold text-slate-900 text-sm">
                              {profile.name}
                            </td>
                            <td className="px-6 py-4 text-slate-705 font-mono">
                              {profile.email}
                            </td>
                            <td className="px-6 py-4 capitalize">
                              <span className={`inline-flex items-center px-2.5 py-1 border-2 border-slate-950 rounded-none text-[10px] font-mono font-black shadow-[1.5px_1.5px_0px_0px_#000] ${
                                profile.role === 'admin' 
                                  ? 'bg-rose-100 text-rose-800' 
                                  : profile.role === 'teacher' 
                                  ? 'bg-[#fffbeb] text-amber-900' 
                                  : 'bg-[#eefcfc] text-emerald-900'
                              }`}>
                                {profile.role}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <select
                                id={`role-select-${profile.uid}`}
                                value={profile.role}
                                onChange={(e) => handleUpdateUserRole(profile.uid, e.target.value)}
                                className="bg-white border-2 border-slate-950 text-slate-950 text-xs py-1 px-2.5 focus:outline-none font-bold shadow-[2px_2px_0px_0px_#000]"
                              >
                                <option value="student">Student</option>
                                <option value="teacher">Teacher</option>
                                <option value="admin">Admin</option>
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {/* 3. SESSIONS AUDIT TRACK PANEL */}
                  {activeTab === 'sessions' && (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-[#eefcfc] text-slate-900 text-[10px] uppercase font-black tracking-wider border-b-2 border-slate-950">
                        <tr>
                          <th className="px-6 py-3.5 font-mono">Subjects & Class Grade</th>
                          <th className="px-6 py-3.5 font-mono">Staff Host</th>
                          <th className="px-6 py-3.5 font-mono">Planned Slot</th>
                          <th className="px-6 py-3.5 font-mono">Current Status</th>
                          <th className="px-6 py-3.5 font-mono text-right">Classroom Transcripts</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y-2 divide-slate-900">
                        {sessions.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-6 py-12 text-center text-slate-655 font-mono italic font-bold">
                              No virtual sessions scheduled in the portal yet.
                            </td>
                          </tr>
                        ) : (
                          sessions.map((session) => (
                            <tr key={session.sessionId} className="hover:bg-yellow-50/40 transition bg-white">
                              <td className="px-6 py-4">
                                <div className="font-extrabold text-slate-900 text-sm">{session.subject}</div>
                                <div className="text-[10px] text-slate-550 font-mono mt-0.5">{session.grade}</div>
                              </td>
                              <td className="px-6 py-4 text-slate-805 font-extrabold text-xs">
                                {session.teacherName}
                              </td>
                              <td className="px-6 py-4 text-slate-700 font-mono">
                                {new Date(session.scheduledTime).toLocaleDateString()} at {new Date(session.scheduledTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td className="px-6 py-4">
                                <span className={`inline-block text-[10px] uppercase font-mono font-black px-2 py-0.5 border-2 border-slate-950 rounded-none shadow-[1.5px_1.5px_0px_0px_#000] ${
                                  session.status === 'live' 
                                    ? 'bg-rose-100 text-rose-800 animate-pulse' 
                                    : session.status === 'ended' 
                                    ? 'bg-slate-100 text-slate-600' 
                                    : 'bg-[#fffbeb] text-indigo-900'
                                }`}>
                                  {session.status}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex items-center justify-end gap-2.5">
                                  {session.transcript ? (
                                    <button
                                      id={`view-transcript-${session.sessionId}`}
                                      onClick={() => setSelectedTranscript(session.transcript || '')}
                                      className="inline-flex items-center gap-1.5 bg-[#fefeeb] hover:bg-yellow-100 text-slate-950 font-black px-2.5 py-1.5 text-[10px] transition uppercase tracking-wider rounded-none border-2 border-slate-950 shadow-[1.5px_1.5px_0px_0px_#000] active:translate-y-0.5 cursor-pointer"
                                    >
                                      <Notebook className="w-3 h-3" /> Transcript
                                    </button>
                                  ) : null}

                                  {session.googleSheetUrl ? (
                                    <a
                                      href={session.googleSheetUrl}
                                      target="_blank"
                                      rel="noreferrer noopener"
                                      className="inline-flex items-center gap-1.5 bg-emerald-250 hover:bg-emerald-300 text-slate-900 font-black px-2.5 py-1.5 text-[10px] transition uppercase tracking-wider rounded-none border-2 border-slate-950 shadow-[1.5px_1.5px_0px_0px_#000] active:translate-y-0.5 cursor-pointer"
                                      title="Open synced Google Sheet in new tab"
                                    >
                                      <FileSpreadsheet className="w-3 h-3 text-emerald-800" />
                                      View Sheet
                                    </a>
                                  ) : (
                                    <button
                                      id={`export-sheets-${session.sessionId}`}
                                      onClick={() => handleExportSessionToSheets(session)}
                                      disabled={sessionExportingId === session.sessionId}
                                      className="inline-flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-slate-950 disabled:opacity-50 font-black px-2.5 py-1.5 text-[10px] transition uppercase tracking-wider rounded-none border-2 border-slate-950 shadow-[1.5px_1.5px_0px_0px_#000] active:translate-y-0.5 cursor-pointer"
                                    >
                                      <FileSpreadsheet className="w-3 h-3" />
                                      {sessionExportingId === session.sessionId ? 'Syncing...' : 'Export Sheet'}
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Transcript Text Reader Modal Overlay - Styled as Blackboard frame */}
      <AnimatePresence>
        {selectedTranscript && (
          <div className="fixed inset-0 bg-slate-950/65 flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ transform: 'scale(0.97)', opacity: 0 }}
              animate={{ transform: 'scale(1)', opacity: 1 }}
              exit={{ transform: 'scale(0.97)', opacity: 0 }}
              className="bg-[#1e2d27] border-[10px] border-[#5c3e21] w-full max-w-2xl rounded-none shadow-[8px_8px_0px_0px_#000] p-6 relative"
              id="transcript-reader-modal"
            >
              <div className="flex justify-between items-center mb-5 border-b-2 border-dashed border-emerald-805/40 pb-3">
                <h3 className="text-xs font-black text-yellow-105 flex items-center gap-1.5 font-mono uppercase tracking-widest">
                  <FileText className="w-4.5 h-4.5 text-yellow-100" />
                  Archived Classroom Transcript
                </h3>
                <button 
                  onClick={() => setSelectedTranscript(null)}
                  className="px-4 py-1 text-xs border-2 border-slate-950 bg-rose-400 hover:bg-rose-500 text-slate-950 font-black tracking-wider uppercase rounded-none transition shadow-[2px_2px_0px_0px_#000] active:translate-y-0.5 cursor-pointer"
                >
                  Close
                </button>
              </div>

              <div 
                className="bg-[#15231c] text-[#e8f5e9] font-mono text-[13px] leading-relaxed p-5 h-[320px] overflow-y-auto block whitespace-pre-wrap select-text border-2 border-slate-905 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:100%_2rem]"
                style={{ textShadow: '0 0 2px rgba(255,255,255,0.45)' }}
              >
                {selectedTranscript}
              </div>

              <div className="mt-4 text-right text-[10px] text-emerald-350 font-mono uppercase font-bold">
                ★ Audio continuous transcription output ★
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
