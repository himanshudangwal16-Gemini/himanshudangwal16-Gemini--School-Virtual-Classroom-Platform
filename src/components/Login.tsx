/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { motion } from 'motion/react';
import { signInWithGoogle, app_getDoc, app_setDoc, app_updateDoc } from '../firebase';
import { BookOpen, GraduationCap, Sparkles, UserCheck, ShieldAlert } from 'lucide-react';
import { UserProfile, UserRole } from '../types';

interface LoginProps {
  onLoginSuccess: (profile: UserProfile) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <div id="login-container" className="min-h-screen bg-slate-50 flex flex-col lg:flex-row font-sans selection:bg-indigo-100">
      
      {/* LEFT SIDEBAR HERO: Slate display banner */}
      <div className="w-full lg:w-[420px] bg-slate-900 text-white flex flex-col justify-between p-8 lg:p-12 border-b lg:border-b-0 lg:border-r border-slate-800 shrink-0">
        <div>
          <div className="flex items-center gap-3.5 mb-10">
            <div className="bg-indigo-600 text-white p-2.5 rounded-sm shadow-md">
              <GraduationCap className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-white tracking-tight uppercase">विद्यालय Portal</h1>
              <p className="text-[10px] text-indigo-400 font-mono tracking-wider uppercase font-bold">Virtual School Platform</p>
            </div>
          </div>

          <div className="space-y-6 my-auto pt-4 lg:pt-12">
            <h2 className="text-2xl lg:text-3xl font-bold tracking-tight text-white leading-tight">
              A balanced digital classroom workspace.
            </h2>
            <p className="text-slate-400 text-xs leading-relaxed">
              Log in to access scheduled lectures, connect directly with instructors via Google Meet codes, register your check-ins, and read live translations in real time.
            </p>
          </div>
        </div>

        <div className="mt-8 lg:mt-0 pt-6 border-t border-slate-800">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2.5 font-mono font-bold">Workspace Capability</div>
          <div className="flex items-center gap-1.5 text-xs text-slate-300">
            <Sparkles className="h-4 w-4 text-indigo-400 shrink-0" />
            <span>Voice AI Multi-lingual Support Active</span>
          </div>
        </div>
      </div>

      {/* RIGHT SIDEBAR LOGIN CARD */}
      <div className="flex-1 flex flex-col justify-between p-6 md:p-12 lg:p-16 my-auto max-w-xl mx-auto w-full">
        
        <div className="my-auto py-6 lg:py-12">
          <motion.div 
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="bg-white border border-slate-200 shadow-sm rounded-sm p-6 md:p-10 relative"
            id="login-card"
          >
            <div className="mb-8 border-b border-slate-100 pb-5">
              <h3 className="text-xl font-bold text-slate-900 uppercase tracking-wide">Sign In to Dashboard</h3>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">Select authorization mode to access continuous lecture records</p>
            </div>

            {error && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mb-5 p-3 rounded-sm bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start space-x-2"
              >
                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
                <span>{error}</span>
              </motion.div>
            )}

            {/* Google Authentication */}
            <button
              id="google-signin-btn"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2.5 px-5 py-3 border border-slate-250 hover:bg-slate-50 active:bg-slate-100 transition shadow-xs font-bold text-xs text-slate-800 uppercase tracking-wider rounded-sm"
            >
              <svg className="h-4 w-4 mr-1 shrink-0" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              {loading ? 'Authenticating...' : 'Sign in with Google'}
            </button>

            {/* Sandbox Bypass Divider */}
            <div className="relative my-8 select-none">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200"></div>
              </div>
              <div className="relative flex justify-center text-[10px] uppercase tracking-widest font-mono">
                <span className="bg-white px-3 text-slate-400">Sandbox Demo Bypass</span>
              </div>
            </div>

            <div className="space-y-2.5" id="demo-bypass-group">
              <p className="text-center text-[11px] text-slate-500 mb-2 leading-relaxed">
                If third-party Google cookies are disabled or blocked in the browser iframe, choose a live demo profile to safely bypass authentication:
              </p>
              
              <button
                id="bypass-admin-btn"
                onClick={() => handleBypassLogin('admin')}
                disabled={loading}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-900 border border-slate-950 hover:bg-slate-800 text-white rounded-sm text-xs font-bold transition uppercase tracking-wider"
              >
                <span className="flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-indigo-400" />
                  Staff Administrator (Himanshu)
                </span>
                <span className="bg-indigo-600 text-white text-[8px] font-mono uppercase px-1.5 py-0.5 rounded-sm">Highest</span>
              </button>

              <button
                id="bypass-teacher-btn"
                onClick={() => handleBypassLogin('teacher')}
                disabled={loading}
                className="w-full flex items-center justify-between px-4 py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 rounded-sm text-xs font-bold transition uppercase tracking-wider"
              >
                <span className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-indigo-600" />
                  Mrs. Sharma (Teacher Key)
                </span>
                <span className="bg-indigo-50 border border-indigo-150 text-indigo-750 text-[8px] font-mono uppercase px-1.5 py-0.5 rounded-sm">Lecturer</span>
              </button>

              <button
                id="bypass-student-btn"
                onClick={() => handleBypassLogin('student')}
                disabled={loading}
                className="w-full flex items-center justify-between px-4 py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 rounded-sm text-xs font-bold transition uppercase tracking-wider"
              >
                <span className="flex items-center gap-2">
                  <GraduationCap className="h-4 w-4 text-emerald-600 animate-pulse" />
                  Aarav Patel (Student Mode)
                </span>
                <span className="bg-emerald-50 border border-emerald-100 text-emerald-800 text-[8px] font-mono uppercase px-1.5 py-0.5 rounded-sm">Student</span>
              </button>
            </div>
          </motion.div>
        </div>

        {/* Footer info stamp */}
        <div className="text-center pt-4 border-t border-slate-200">
          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-mono">
            Structured System • Persistent State Sync
          </p>
        </div>
      </div>

    </div>
  );
}
