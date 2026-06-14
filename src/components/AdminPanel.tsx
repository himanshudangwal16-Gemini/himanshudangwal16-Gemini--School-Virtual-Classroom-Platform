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
  X
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
  const handleExportToSheets = async () => {
    setExportingToSheets(true);
    setSheetsLink(null);
    setErrorHeader(null);
    try {
      const { getGoogleAccessToken, signInWithGoogle } = await import('../firebase');
      const { exportAllAttendanceToSheets } = await import('../utils/googleSheets');
      
      let token = getGoogleAccessToken();
      if (!token) {
        const confirmLogin = window.confirm(
          "Exporting to Google Sheets requires connecting your Google account. Connect now?"
        );
        if (!confirmLogin) {
          setExportingToSheets(false);
          return;
        }
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
    }
  };

  // Export specific session summary & attendance to Google Sheets
  const handleExportSessionToSheets = async (targetSession: ClassSession) => {
    setSessionExportingId(targetSession.sessionId);
    setSheetsLink(null);
    setErrorHeader(null);
    try {
      const { getGoogleAccessToken, signInWithGoogle } = await import('../firebase');
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

      const matchedRecords = attendance.filter(rec => rec.sessionId === targetSession.sessionId);
      const result = await exportSessionReportToSheets(token, targetSession, matchedRecords);
      setSheetsLink(result.url);
    } catch (err: any) {
      console.error(err);
      setErrorHeader(`Google Sheets Export for ${targetSession.subject} failed: ` + (err.message || String(err)));
    } finally {
      setSessionExportingId(null);
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
          <li 
            onClick={onBackToDashboard}
            className="px-6 py-3 hover:bg-slate-800 transition-colors cursor-pointer flex items-center gap-3 text-slate-400 text-sm font-medium"
          >
            <span>📊</span> Dashboard
          </li>
          <li 
            onClick={onBackToDashboard}
            className="px-6 py-3 hover:bg-slate-800 transition-colors cursor-pointer flex items-center gap-3 text-slate-400 text-sm font-medium"
          >
            <span>📅</span> Scheduled Classes
          </li>
          <li className="px-6 py-3 bg-indigo-600/10 border-l-4 border-indigo-500 text-indigo-400 flex items-center gap-3 font-semibold text-sm transition select-none">
            <span>⚙️</span> Admin Console
          </li>
        </ul>
      </div>

      <div className="p-6 bg-slate-950">
        <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2 font-mono">System Integrity</div>
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-md shadow-emerald-500/20"></div>
          <div className="text-xs text-slate-300">Firebase Live</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-md shadow-emerald-500/20"></div>
          <div className="text-xs text-slate-300">Role Authority</div>
        </div>
      </div>
    </>
  );

  return (
    <div id="admin-panel-layout" className="min-h-screen bg-slate-50 text-slate-800 flex overflow-hidden font-sans">
      
      {/* SIDEBAR NAVIGATION (Desktop) */}
      <nav className="w-64 bg-slate-900 text-white hidden lg:flex flex-col border-r border-slate-800 shrink-0 select-none">
        {sidebarContent}
      </nav>

      {/* MOBILE SIDEBAR NAVIGATION */}
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

      {/* MAIN FRAME */}
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
            <button
              id="header-back-btn"
              onClick={onBackToDashboard}
              className="p-1.5 border border-slate-200 rounded-sm hover:bg-slate-55 hover:text-slate-950 transition text-slate-600 flex items-center gap-1 text-xs font-bold uppercase tracking-wider pr-2.5"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Return
            </button>
            <span className="text-slate-200 hidden sm:inline">|</span>
            <div className="hidden sm:flex items-center gap-2 text-slate-500 text-sm">
              <span>Admin</span>
              <span>/</span>
              <span className="text-slate-900 font-semibold italic">Admin Console</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Export CSV action */}
            <button
              id="export-attendance-csv-btn"
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-bold text-[10px] px-3.5 py-2.5 rounded-sm uppercase tracking-wider transition"
            >
              <Download className="h-3.5 w-3.5" /> CSV Report
            </button>

            {/* Export Google Sheets action */}
            <button
              id="export-attendance-sheets-btn"
              onClick={handleExportToSheets}
              disabled={exportingToSheets}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] px-3.5 py-2.5 rounded-sm uppercase tracking-wider transition disabled:opacity-50"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" /> {exportingToSheets ? 'Syncing...' : 'Sync with Google Sheets'}
            </button>

            {/* User credentials panel */}
            <div className="flex items-center gap-3 border-l border-slate-200 pl-4">
              <div className="text-right hidden sm:block">
                <div className="text-xs font-bold text-slate-900">{user.name}</div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Role: {user.role}</div>
              </div>
              <div className="w-9 h-9 rounded-full bg-slate-900 border border-slate-800 text-white shadow-sm flex items-center justify-center font-bold text-xs select-none">
                {userInitials}
              </div>
            </div>
          </div>
        </header>

        {/* WORKSPACE CONTENT */}
        <div className="p-6 md:p-8 flex-1 flex flex-col space-y-6 max-w-7xl w-full mx-auto">
          
          {sheetsLink && (
            <div className="p-4 rounded-sm bg-emerald-50 border border-emerald-250 text-emerald-900 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs animate-fade-in" id="sheets-success-banner">
              <div className="flex items-center space-x-2.5">
                <FileSpreadsheet className="h-5 w-5 text-emerald-600 shrink-0" />
                <span>
                  <strong>Google Sheets Sync Successful!</strong> A secure attendance spreadsheet has been deployed in your Google Drive logs.
                </span>
              </div>
              <a 
                href={sheetsLink}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold px-4 py-2 rounded-sm uppercase tracking-wider shadow-sm transition"
              >
                View Live Spreadsheet
              </a>
            </div>
          )}

          {errorHeader && (
            <div className="p-4 rounded-sm bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center space-x-3">
              <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
              <span>{errorHeader}</span>
            </div>
          )}

          {/* STATISTICS PANELS (Geometric Balance Spec) */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6" id="stats-banner-row">
            <div className="bg-white p-5 border border-slate-200 shadow-sm rounded-sm">
              <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1 font-mono">Enrolled Users</div>
              <div className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900">{users.length}</div>
              <div className="text-xs text-indigo-600 font-medium mt-2 flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-indigo-505" />
                <span>Active profiles</span>
              </div>
            </div>

            <div className="bg-white p-5 border border-slate-200 shadow-sm rounded-sm">
              <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1 font-mono">Scheduled Sessions</div>
              <div className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900">{sessions.length}</div>
              <div className="text-xs text-amber-600 font-medium mt-2 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-amber-505" />
                <span>In school database</span>
              </div>
            </div>

            <div className="bg-white p-5 border border-slate-200 shadow-sm rounded-sm">
              <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1 font-mono">Student Check-Ins</div>
              <div className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900">{totalStudentsCheckedInCount}</div>
              <div className="text-xs text-emerald-600 font-medium mt-2 flex items-center gap-1.5">
                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-550" />
                <span>Arrival registers live</span>
              </div>
            </div>

            <div className="bg-white p-5 border border-slate-200 shadow-sm rounded-sm">
              <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1 font-mono">Avg Session Duration</div>
              <div className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900">{averageMinutes}m</div>
              <div className="text-xs text-sky-600 font-medium mt-2 flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-sky-505" />
                <span>Minutes spent in class</span>
              </div>
            </div>
          </section>

          {/* MAIN DATA TABLES AREA */}
          <div className="bg-white border border-slate-200 shadow-sm rounded-sm overflow-hidden flex flex-col flex-1 min-h-[480px]">
            
            {/* Tab Selection Header */}
            <div className="border-b border-slate-200 bg-slate-50/50 px-6 pt-3 flex space-x-6" id="admin-tabs">
              <button
                onClick={() => setActiveTab('attendance')}
                className={`pb-3 text-xs font-bold font-mono uppercase tracking-wider relative transition-all ${
                  activeTab === 'attendance' 
                    ? 'text-indigo-600 border-b-2 border-indigo-600' 
                    : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                Attendance Tracker ({attendance.length})
              </button>
              
              <button
                onClick={() => setActiveTab('users')}
                className={`pb-3 text-xs font-bold font-mono uppercase tracking-wider relative transition-all ${
                  activeTab === 'users' 
                    ? 'text-indigo-600 border-b-2 border-indigo-600' 
                    : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                User Roles ({users.length})
              </button>

              <button
                onClick={() => setActiveTab('sessions')}
                className={`pb-3 text-xs font-bold font-mono uppercase tracking-wider relative transition-all ${
                  activeTab === 'sessions' 
                    ? 'text-indigo-600 border-b-2 border-indigo-600' 
                    : 'text-slate-400 hover:text-slate-700'
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
                      <thead className="bg-slate-100/75 text-slate-500 text-[10px] uppercase font-bold tracking-wider border-b border-slate-200">
                        <tr>
                          <th className="px-6 py-3 font-mono">Student Name & Email</th>
                          <th className="px-6 py-3 font-mono">Session Subject</th>
                          <th className="px-6 py-3 font-mono">Joined Slot</th>
                          <th className="px-6 py-3 font-mono">Left Slot</th>
                          <th className="px-6 py-3 font-mono text-right font-bold">Class Time Spent</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-150">
                        {attendance.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-6 py-12 text-center text-slate-400 font-mono italic">
                              No student arrivals logged in the attendance ledger yet.
                            </td>
                          </tr>
                        ) : (
                          attendance.map((rec) => {
                            const targetSession = sessions.find(s => s.sessionId === rec.sessionId);
                            return (
                              <tr key={rec.docId} className="hover:bg-slate-50/50 transition">
                                <td className="px-6 py-4">
                                  <div className="font-bold text-slate-900 text-sm">{rec.studentName}</div>
                                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">{rec.studentEmail}</div>
                                </td>
                                <td className="px-6 py-4 font-semibold text-slate-755 text-xs">
                                  {targetSession ? targetSession.subject : "Deleted Class"}
                                </td>
                                <td className="px-6 py-4 text-slate-550 font-mono text-[11px]">
                                  {new Date(rec.joinedAt).toLocaleDateString()} at {new Date(rec.joinedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </td>
                                <td className="px-6 py-4 text-slate-550 font-mono text-[11px]">
                                  {rec.leftAt ? (
                                    <>
                                      {new Date(rec.leftAt).toLocaleDateString()} at {new Date(rec.leftAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </>
                                  ) : (
                                    <span className="text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full text-[9px] border border-emerald-100">IN CLASS</span>
                                  )}
                                </td>
                                <td className="px-6 py-4 text-right font-mono font-bold text-slate-950 text-sm">
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
                      <thead className="bg-slate-100/75 text-slate-500 text-[10px] uppercase font-bold tracking-wider border-b border-slate-200">
                        <tr>
                          <th className="px-6 py-3 font-mono">Full Name</th>
                          <th className="px-6 py-3 font-mono">Email Address</th>
                          <th className="px-6 py-3 font-mono">Assigned Role Status</th>
                          <th className="px-6 py-3 font-mono text-right">Administrative Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-150">
                        {users.map((profile) => (
                          <tr key={profile.uid} className="hover:bg-slate-50/50 transition">
                            <td className="px-6 py-4 font-bold text-slate-900 text-sm">
                              {profile.name}
                            </td>
                            <td className="px-6 py-4 text-slate-500 font-mono">
                              {profile.email}
                            </td>
                            <td className="px-6 py-4 capitalize">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-sm text-[10px] font-mono font-bold ${
                                profile.role === 'admin' 
                                  ? 'bg-rose-50 border border-rose-100 text-rose-700' 
                                  : profile.role === 'teacher' 
                                  ? 'bg-amber-50 border border-amber-150 text-amber-800' 
                                  : 'bg-emerald-50 border border-emerald-100 text-emerald-800'
                              }`}>
                                {profile.role}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <select
                                id={`role-select-${profile.uid}`}
                                value={profile.role}
                                onChange={(e) => handleUpdateUserRole(profile.uid, e.target.value)}
                                className="bg-white border border-slate-250 text-slate-700 text-xs py-1 px-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 rounded-sm font-semibold"
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
                      <thead className="bg-slate-100/75 text-slate-500 text-[10px] uppercase font-bold tracking-wider border-b border-slate-200">
                        <tr>
                          <th className="px-6 py-3 font-mono">Subjects & Class Grade</th>
                          <th className="px-6 py-3 font-mono">Staff Host</th>
                          <th className="px-6 py-3 font-mono">Planned Slot</th>
                          <th className="px-6 py-3 font-mono">Current Status</th>
                          <th className="px-6 py-3 font-mono text-right">Classroom Transcripts</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-150">
                        {sessions.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-6 py-12 text-center text-slate-400 font-mono italic">
                              No virtual sessions scheduled in the portal yet.
                            </td>
                          </tr>
                        ) : (
                          sessions.map((session) => (
                            <tr key={session.sessionId} className="hover:bg-slate-50/50 transition">
                              <td className="px-6 py-4">
                                <div className="font-bold text-slate-900 text-sm">{session.subject}</div>
                                <div className="text-[10px] text-slate-400 font-mono mt-0.5">{session.grade}</div>
                              </td>
                              <td className="px-6 py-4 text-slate-700 font-semibold text-xs">
                                {session.teacherName}
                              </td>
                              <td className="px-6 py-4 text-slate-500 font-mono">
                                {new Date(session.scheduledTime).toLocaleDateString()} at {new Date(session.scheduledTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td className="px-6 py-4">
                                <span className={`inline-block text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded-sm ${
                                  session.status === 'live' 
                                    ? 'bg-rose-100 text-rose-700 border border-rose-200 animate-pulse' 
                                    : session.status === 'ended' 
                                    ? 'bg-slate-100 text-slate-600' 
                                    : 'bg-indigo-50 border border-indigo-100 text-indigo-700'
                                }`}>
                                  {session.status}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  {session.transcript ? (
                                    <button
                                      id={`view-transcript-${session.sessionId}`}
                                      onClick={() => setSelectedTranscript(session.transcript || '')}
                                      className="inline-flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold px-2.5 py-1 text-[10px] transition uppercase tracking-wider rounded-sm border border-indigo-200"
                                    >
                                      <Notebook className="w-3 h-3" /> Transcript
                                    </button>
                                  ) : null}

                                  <button
                                    id={`export-sheets-${session.sessionId}`}
                                    onClick={() => handleExportSessionToSheets(session)}
                                    disabled={sessionExportingId === session.sessionId}
                                    className="inline-flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 disabled:opacity-50 font-bold px-2.5 py-1 text-[10px] transition uppercase tracking-wider rounded-sm border border-emerald-200"
                                  >
                                    <FileSpreadsheet className="w-3 h-3" />
                                    {sessionExportingId === session.sessionId ? 'Syncing...' : 'Export Sheet'}
                                  </button>
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

      {/* Transcript Text Reader Modal Overlay */}
      <AnimatePresence>
        {selectedTranscript && (
          <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ transform: 'scale(0.97)', opacity: 0 }}
              animate={{ transform: 'scale(1)', opacity: 1 }}
              exit={{ transform: 'scale(0.97)', opacity: 0 }}
              className="bg-white border border-slate-350 w-full max-w-2xl rounded-sm shadow-2xl p-6 relative animate-fade-in"
              id="transcript-reader-modal"
            >
              <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
                <h3 className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5 font-mono uppercase tracking-wider">
                  <FileText className="w-4 h-4 text-indigo-600" />
                  Archived Classroom Voice Transcript
                </h3>
                <button 
                  onClick={() => setSelectedTranscript(null)}
                  className="px-3 py-1 text-xs rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition font-bold"
                >
                  Close
                </button>
              </div>

              <div className="bg-slate-900 text-slate-100 font-mono text-xs leading-relaxed p-5 rounded-sm h-[320px] overflow-y-auto block whitespace-pre-wrap select-text border border-slate-950">
                {selectedTranscript}
              </div>

              <div className="mt-4 text-right text-[10px] text-slate-400 font-mono uppercase">
                Web Speech continuous API output stream
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
