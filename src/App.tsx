/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { auth, logoutUser, app_getDoc } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { UserProfile, ClassSession } from './types';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import LiveClassroom from './components/LiveClassroom';
import AdminPanel from './components/AdminPanel';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles } from 'lucide-react';

type ScreenState = 'login' | 'dashboard' | 'classroom' | 'admin';

export default function App() {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [currentScreen, setCurrentScreen] = useState<ScreenState>('login');
  const [selectedSession, setSelectedSession] = useState<ClassSession | null>(null);
  const [initializing, setInitializing] = useState(true);

  // Sync with standard Firebase Auth processes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          // Attempt to retrieve profile from Firestore using wrapper
          const profile = await app_getDoc('users', firebaseUser.uid);
          
          if (profile) {
            setUserProfile(profile as UserProfile);
            setCurrentScreen('dashboard');
          } else {
            // Profile isn't generated in db yet, let the Login view complete the step
            setUserProfile(null);
            setCurrentScreen('login');
          }
        } catch (err) {
          console.error("Failed syncing profile database document", err);
          setUserProfile(null);
          setCurrentScreen('login');
        }
      } else {
        // Fallback for offline/cookies-blocked Demo Bypass
        const isBypass = localStorage.getItem('is_demo_bypass') === 'true';
        if (isBypass) {
          const stored = localStorage.getItem('demo_user_profile');
          if (stored) {
            setUserProfile(JSON.parse(stored));
            setCurrentScreen('dashboard');
            setInitializing(false);
            return;
          }
        }
        setUserProfile(null);
        setCurrentScreen('login');
      }
      setInitializing(false);
    });

    return () => unsubscribe();
  }, []);

  // Logout action handler
  const handleLogout = async () => {
    try {
      localStorage.removeItem('is_demo_bypass');
      localStorage.removeItem('demo_user_profile');
      await logoutUser();
      setUserProfile(null);
      setSelectedSession(null);
      setCurrentScreen('login');
    } catch (e) {
      console.error(e);
    }
  };

  // Direct login updater (supporting Google Auth & Sandbox Bypass flows)
  const handleLoginSuccess = (profile: UserProfile) => {
    setUserProfile(profile);
    setCurrentScreen('dashboard');
  };

  if (initializing) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-sans">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
          className="rounded-full h-10 w-10 border-4 border-slate-300 border-t-indigo-600 mb-4"
        />
        <h3 className="text-sm font-bold text-slate-705 font-mono flex items-center gap-1">
          <Sparkles className="h-4 w-4 text-indigo-500" />
          COMMENCING PORTAL INGRESS...
        </h3>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 relative overflow-hidden">
      <AnimatePresence mode="wait">
        
        {/* VIEW 1: LOGIN FLOW */}
        {currentScreen === 'login' && (
          <motion.div
            key="login-screen-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Login onLoginSuccess={handleLoginSuccess} />
          </motion.div>
        )}

        {/* VIEW 2: CENTRAL SCHOOL DASHBOARD */}
        {currentScreen === 'dashboard' && userProfile && (
          <motion.div
            key="dashboard-screen-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Dashboard
              user={userProfile}
              onLogout={handleLogout}
              onStartClass={(session) => {
                setSelectedSession(session);
                setCurrentScreen('classroom');
              }}
              onJoinClass={(session) => {
                setSelectedSession(session);
                setCurrentScreen('classroom');
              }}
              onOpenAdmin={() => {
                setCurrentScreen('admin');
              }}
            />
          </motion.div>
        )}

        {/* VIEW 3: LIVE CLASSROOM VIEWPORT */}
        {currentScreen === 'classroom' && userProfile && selectedSession && (
          <motion.div
            key="classroom-screen-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <LiveClassroom
              session={selectedSession}
              user={userProfile}
              onExit={() => {
                setSelectedSession(null);
                setCurrentScreen('dashboard');
              }}
            />
          </motion.div>
        )}

        {/* VIEW 4: ADMIN CONSOLE */}
        {currentScreen === 'admin' && userProfile && (
          <motion.div
            key="admin-screen-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <AdminPanel
              user={userProfile}
              onBackToDashboard={() => setCurrentScreen('dashboard')}
            />
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
