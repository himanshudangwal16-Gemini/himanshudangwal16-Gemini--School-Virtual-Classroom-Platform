/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { signInWithGoogle, app_getDoc, app_setDoc, app_updateDoc } from '../firebase';
import { BookOpen, GraduationCap, Sparkles, UserCheck, ShieldAlert, ArrowUpRight, Globe, Lock } from 'lucide-react';
import { UserProfile, UserRole } from '../types';

interface LoginProps {
  onLoginSuccess: (profile: UserProfile) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEmbedded, setIsEmbedded] = useState(false);

  useEffect(() => {
    // Detect if nested in an iframe (e.g. Google Sites)
    try {
      if (window.self !== window.top) {
        setIsEmbedded(true);
      }
    } catch (e) {
      // Cross-origin access error also indicates we are iframe nested
      setIsEmbedded(true);
    }
  }, []);

  // Helper to register user in Firestore or fetch existing profile
  const handleProfileSetup = async (uid: string, email: string, name: string, preferredRole: UserRole = 'student') => {
    try {
      const userSnap = await app_getDoc('users', uid);

      let profileData: UserProfile;

      if (userSnap) {
        profileData = userSnap as UserProfile;
        // Bootstrapped admin check
        if (email === "himanshudangwal16@gmail.com" && profileData.role !== "admin") {
          await app_updateDoc('users', uid, { role: 'admin' });
          profileData.role = 'admin';
        }
      } else {
        // Enforce admin for himanshudangwal16@gmail.com
        const finalRole: UserRole = email === "himanshudangwal16@gmail.com" ? "admin" : preferredRole;
        profileData = {
          uid,
          email,
          name: name || 'School User',
          role: finalRole,
          createdAt: new Date().toISOString()
        };
        await app_setDoc('users', uid, profileData);
      }

      // If this is a demo bypass user, double check that they are registered in the local mock user DB
      if (uid.includes('demo_account')) {
        localStorage.setItem('is_demo_bypass', 'true');
        localStorage.setItem('demo_user_profile', JSON.stringify(profileData));
        
        // Seed users database locally if they don't exist
        const existingUsersStr = localStorage.getItem('local_db_users') || '[]';
        try {
          const existingUsersList = JSON.parse(existingUsersStr);
          if (!existingUsersList.find((u: any) => u.uid === uid)) {
            existingUsersList.push(profileData);
            localStorage.setItem('local_db_users', JSON.stringify(existingUsersList));
          }
        } catch (e) {
          localStorage.removeItem('local_db_users');
        }
      } else {
        localStorage.removeItem('is_demo_bypass');
        localStorage.removeItem('demo_user_profile');
      }

      onLoginSuccess(profileData);
    } catch (err: any) {
      console.error(err);
      setError("Registration database lookup failed. Ensure Firebase security rules are set up.");
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const user = await signInWithGoogle();
      if (user && user.email) {
        await handleProfileSetup(user.uid, user.email, user.displayName || 'Google Scholar');
      }
    } catch (err: any) {
      setError(err?.message || "Sign-In with Google failed. Try using a Demo Bypass account below in the sandboxed iframe.");
    } finally {
      setLoading(false);
    }
  };

  // Safe developer demo bypass login to easily test all 3 user roles instantly within sandboxed environment
  const handleBypassLogin = async (role: UserRole) => {
    setLoading(true);
    setError(null);
    try {
      let uid = '';
      let email = '';
      let name = '';

      if (role === 'admin') {
        uid = 'admin_demo_account_1r';
        email = 'himanshudangwal16@gmail.com';
        name = 'Admin (Himanshu)';
      } else if (role === 'teacher') {
        uid = 'teacher_demo_account_2t';
        email = 'sunita.teacher@school.edu';
        name = 'Aditi Sharma (Teacher)';
      } else {
        uid = 'student_demo_account_3s';
        email = 'aarav.student@school.edu';
        name = 'Aarav Patel (Student)';
      }

      await handleProfileSetup(uid, email, name, role);
    } catch (err: any) {
      setError("Failed to authenticate using demo bypass. Please verify rules and connectivity.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="login-container" className="min-h-screen bg-grid-paper flex flex-col items-center justify-center p-4 md:p-8 font-sans selection:bg-yellow-250">
      
      {/* Container: Vintage School Desk Surface */}
      <div className="w-full max-w-5xl flex flex-col lg:flex-row bg-[#efebe4] border-4 border-slate-900 rounded-none shadow-[10px_10px_0px_0px_#0f172a] overflow-hidden relative">
        
        {/* Top Wood Trim Bar */}
        <div className="w-full h-4 bg-amber-800 border-b-4 border-slate-900 absolute top-0 left-0 z-20"></div>

        {/* LEFT PAGE: Notebook Doodles & Board Info */}
        <div className="w-full lg:w-1/2 bg-composition-marble text-white p-8 pt-10 lg:p-12 lg:pt-14 flex flex-col justify-between border-b-4 lg:border-b-0 lg:border-r-4 border-slate-900 relative">
          
          {/* Classic Composition Label Overlay */}
          <div className="absolute top-6 right-6 bg-white border-2 border-slate-900 px-3 py-1 text-slate-900 font-mono text-[9px] uppercase tracking-widest font-extrabold shadow-[2px_2px_0px_0px_#000] rotate-2 select-none">
            CLASS OF 1996
          </div>

          <div>
            {/* Retro Sticker Styled Brand Logo */}
            <div className="flex items-center gap-3.5 mb-10">
              <div className="bg-yellow-300 text-slate-900 p-3 border-3 border-slate-900 shadow-[3px_3px_0px_0px_#000] rounded-none rotate-[-3deg] transform hover:rotate-0 transition">
                <GraduationCap className="h-7 w-7 text-slate-950" />
              </div>
              <div className="rotate-[1deg]">
                <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight uppercase drop-shadow-[2px_2px_0px_#000] font-sans flex items-center gap-1.5">
                  विद्यालय <span className="text-yellow-300 font-mono text-sm underline shrink-0">PORTAL</span>
                </h1>
                <p className="text-[10px] text-teal-300 font-mono tracking-widest uppercase font-bold">100% DIGITAL VIRTUAL WORKSPACE</p>
              </div>
            </div>

            {/* Simulated Desktop Blackboard Widget */}
            <div className="bg-chalkboard border-4 border-slate-800 p-6 shadow-inner text-slate-200 rounded-xs mb-8 rotate-[-1deg] transform hover:rotate-0 transition duration-305 min-h-[180px] flex flex-col justify-between">
              <div>
                <div className="text-[10px] text-yellow-250 font-mono uppercase tracking-widest border-b border-dashed border-emerald-800 pb-1 mb-2">
                  📌 TODAY'S WORKSPACE MEMO
                </div>
                <h2 className="text-lg md:text-xl font-bold tracking-tight text-white leading-normal font-sans text-yellow-105">
                  A balanced digital classroom workspace.
                </h2>
                <p className="text-slate-300 text-xs leading-relaxed mt-2.5 font-mono">
                  Welcome to class! Log in to schedule mock virtual lectures, register check-ins, and translate live Hindi/English chats.
                </p>
              </div>
              <div className="text-[10px] text-slate-400 font-mono uppercase text-right mt-4 select-none">
                ✐ Chalkboard v1.0
              </div>
            </div>
          </div>

          <div className="mt-8 lg:mt-0 pt-6 border-t border-slate-800 flex flex-col gap-2.5">
            <div className="text-[10px] uppercase tracking-widest text-[#a855f7] mb-0.5 font-mono font-extrabold">Workspace Specs:</div>
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <span className="bg-yellow-300 text-slate-950 font-mono text-[9px] px-2 py-0.5 font-extrabold rotate-2 shadow-xs border border-slate-950">NEW!</span>
              <span className="font-mono text-[11px] text-slate-300">Continuous Hindi Transcription Enabled</span>
            </div>
          </div>
        </div>

        {/* RIGHT PAGE: The Login Binder Sheet */}
        <div className="flex-1 bg-lined-paper p-6 md:p-10 lg:p-14 pt-10 flex flex-col justify-between relative min-h-[500px]">
          
          {/* Notebook Lined Page Pink Left Margin Marker Rule */}
          <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-rose-450 opacity-60"></div>

          {/* Doodles & Paperclip Sticky Sticker Overlay */}
          <div className="absolute top-4 right-4 bg-amber-50 border-2 border-slate-900 p-2 text-slate-905 font-mono text-[10px] shadow-[2px_2px_0px_0px_#000] rotate-[-4deg] max-w-[140px] hidden md:block select-none z-10">
            <div className="w-5 h-2 bg-slate-400/40 border border-slate-500 rounded-full mx-auto mb-1 flex items-center justify-center"></div>
            <strong>Memo:</strong> Select a portal login slot to sync live logs!
          </div>

          <div className="my-auto py-6 pl-6 z-10">
            <motion.div 
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="bg-[#faf9f6]/95 border-3 border-slate-900 shadow-[6px_6px_0px_0px_#0f172a] rounded-none p-6 md:p-8 relative"
              id="login-card"
            >
              {/* Retro Highlighter Title Header */}
              <div className="mb-6 border-b-2 border-dashed border-slate-300 pb-4">
                <span className="bg-yellow-200 border border-yellow-300 text-slate-905 rounded-none px-2 py-1 text-[10px] font-mono tracking-wider font-extrabold uppercase">
                  📓 OFFICE REGISTRY
                </span>
                <h3 className="text-xl font-extrabold text-slate-950 uppercase tracking-wide font-sans mt-2">
                  Sign In to Dashboard
                </h3>
                <p className="text-[11px] text-slate-600 mt-1.5 leading-relaxed font-semibold italic">
                  Instant authorization — Bypass classroom cookies inside iframe nested tabs
                </p>
              </div>

              {error && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mb-5 p-3 rounded-none bg-rose-50 border-2 border-slate-950 text-rose-850 text-xs flex items-start space-x-2 font-mono"
                >
                  <ShieldAlert className="h-4.5 w-4.5 shrink-0 text-rose-600 mt-0.5" />
                  <span>{error}</span>
                </motion.div>
              )}

              {/* Login option channels */}
              <div className="space-y-4" id="login-channels-group">
                
                {/* 1. Admin Login button */}
                <button
                  id="bypass-admin-btn"
                  onClick={() => handleBypassLogin('admin')}
                  disabled={loading}
                  className="w-full flex items-center justify-between p-4 bg-[#fcf3ff] hover:bg-purple-50 border-3 border-slate-900 shadow-[4px_4px_0px_0px_#000] active:translate-y-1 active:shadow-[1px_1px_0px_0px_#000] text-slate-900 font-bold transition duration-150 cursor-pointer group rounded-none"
                >
                  <span className="flex items-center gap-3">
                    <div className="p-2 border-2 border-slate-900 bg-white text-[#8b5cf6] group-hover:bg-[#f3e8ff] transition rounded-none">
                      <Lock className="h-5 w-5 animate-pulse" />
                    </div>
                    <div className="text-left font-sans">
                      <span className="block uppercase tracking-wider text-slate-900 text-xs font-black">Admin Support Login</span>
                      <span className="text-[10px] text-[#71717a] font-mono font-bold">Himanshu (Admin Console Active)</span>
                    </div>
                  </span>
                  <span className="bg-[#8b5cf6] text-white text-[9px] font-mono font-black uppercase px-2 py-1 rounded-none border-2 border-slate-900 shrink-0 shadow-[1px_1px_0.5px_0px_#000]">
                    OFFICE / ADMIN
                  </span>
                </button>

                {/* 2. Teacher Login button */}
                <button
                  id="bypass-teacher-btn"
                  onClick={() => handleBypassLogin('teacher')}
                  disabled={loading}
                  className="w-full flex items-center justify-between p-4 bg-[#fefeeb] hover:bg-yellow-50 border-3 border-slate-900 shadow-[4px_4px_0px_0px_#000] active:translate-y-1 active:shadow-[1px_1px_0px_0px_#000] text-slate-900 font-bold transition duration-150 cursor-pointer group rounded-none relative"
                >
                  <span className="flex items-center gap-3">
                    <div className="p-2 border-2 border-slate-900 bg-white text-slate-900 group-hover:bg-yellow-250 transition rounded-none">
                      <BookOpen className="h-5 w-5" />
                    </div>
                    <div className="text-left">
                      <span className="block uppercase tracking-wider text-slate-900 text-xs font-extrabold font-sans">Teacher Login</span>
                      <span className="text-[10px] text-slate-500 font-mono">Mrs. Sharma (Teacher Check-In)</span>
                    </div>
                  </span>
                  <span className="bg-[#a855f7] text-white text-[9px] font-mono uppercase px-2 py-1 rounded-none border-2 border-slate-900 shrink-0">
                    LECTURER
                  </span>
                </button>

                {/* 3. Student Login button */}
                <button
                  id="bypass-student-btn"
                  onClick={() => handleBypassLogin('student')}
                  disabled={loading}
                  className="w-full flex items-center justify-between p-4 bg-[#eefcfc] hover:bg-teal-50 border-3 border-slate-900 shadow-[4px_4px_0px_0px_#000] active:translate-y-1 active:shadow-[1px_1px_0px_0px_#000] text-slate-900 font-bold transition duration-150 cursor-pointer group rounded-none"
                >
                  <span className="flex items-center gap-3">
                    <div className="p-2 border-2 border-slate-900 bg-white text-slate-900 group-hover:bg-teal-220 transition rounded-none">
                      <GraduationCap className="h-5 w-5" />
                    </div>
                    <div className="text-left">
                      <span className="block uppercase tracking-wider text-slate-900 text-xs font-extrabold font-sans">Student Login</span>
                      <span className="text-[10px] text-slate-505 font-mono">Aarav Patel (Student Check-In)</span>
                    </div>
                  </span>
                  <span className="bg-[#06b6d4] text-white text-[9px] font-mono uppercase px-2 py-1 rounded-none border-2 border-slate-900 shrink-0">
                    CLASSROOM
                  </span>
                </button>

                {/* Separator line */}
                <div className="relative my-4 flex items-center justify-center">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t-2 border-slate-300"></div>
                  </div>
                  <span className="relative bg-[#faf9f6] px-3.5 text-[9px] font-mono tracking-widest text-slate-500 font-extrabold uppercase select-none">
                    OR SECURE AUTHENTICATION
                  </span>
                </div>

                {/* 4. Google Login Option */}
                <button
                  id="google-login-btn"
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2.5 p-3.5 bg-white hover:bg-slate-50 border-3 border-slate-900 shadow-[4px_4px_0px_0px_#000] active:translate-y-0.5 active:shadow-[1px_1px_0px_0px_#000] text-slate-950 font-black tracking-wider uppercase text-xs transition duration-150 cursor-pointer rounded-none"
                >
                  <Globe className="h-4 w-4 text-[#4285f4] shrink-0" />
                  <span>{loading ? 'Authenticating...' : 'Sign In with Google'}</span>
                </button>

              </div>
            </motion.div>
          </div>

          {/* Notebook page footer margin stamp */}
          <div className="text-center pt-4 border-t-2 border-dashed border-slate-300 z-10 pl-6">
            <p className="text-[10px] text-slate-550 uppercase tracking-widest font-mono font-bold">
              ★ SYSTEM VERSION: CLOUDRUN 1996 • SECURE PERSISTENT WORKSPACE STATE ★
            </p>
          </div>
        </div>

      </div>

    </div>
  );
}
