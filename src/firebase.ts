/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  getDocFromServer,
  collection,
  getDocs,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId); /* CRITICAL: The app will break without this line */
export const auth = getAuth();
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/spreadsheets');

let cachedAccessToken: string | null = null;

export function getGoogleAccessToken(): string | null {
  return cachedAccessToken;
}

export function setGoogleAccessToken(token: string | null): void {
  cachedAccessToken = token;
}

// Custom Google Sign-In helper prioritizing Sign-In Popups
export async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    cachedAccessToken = credential?.accessToken || null;
    return result.user;
  } catch (err) {
    console.error("Popup login failed: ", err);
    throw err;
  }
}

// Custom Sign Out
export async function logoutUser() {
  await signOut(auth);
  cachedAccessToken = null;
}

// --- STANDARD EXTREME-TRUST FIRESTORE CLIENT ERROR HANDLER ---

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error Raised: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- HYBRID REALTIME MOCK & REAL DB WRAPPERS ---

export function isDemoBypass(): boolean {
  return typeof localStorage !== 'undefined' && localStorage.getItem('is_demo_bypass') === 'true';
}

function getLocalCollection(collectionName: string): any[] {
  if (typeof localStorage === 'undefined') return [];
  const key = `local_db_${collectionName}`;
  const data = localStorage.getItem(key);
  if (!data) {
    // Return initial seed arrays if database is empty to make it look active
    if (collectionName === 'users') {
      return [
        { uid: 'admin_demo_account_1r', email: 'himanshudangwal16@gmail.com', name: 'Admin (Himanshu)', role: 'admin', createdAt: new Date().toISOString() },
        { uid: 'teacher_demo_account_2t', email: 'sunita.teacher@school.edu', name: 'Aditi Sharma (Teacher)', role: 'teacher', createdAt: new Date().toISOString() },
        { uid: 'student_demo_account_3s', email: 'aarav.student@school.edu', name: 'Aarav Patel (Student)', role: 'student', createdAt: new Date().toISOString() }
      ];
    }
    if (collectionName === 'sessions') {
      const liveMeetingUrl = "https://meet.google.com/abc-defg-hij";
      return [
        {
          sessionId: 'class_session_demo_math',
          subject: 'Advanced Geometry',
          grade: 'Grade 10-A',
          scheduledTime: new Date(Date.now() + 15 * 60000).toISOString(), // 15 mins from now
          meetLink: liveMeetingUrl,
          status: 'live',
          teacherUid: 'teacher_demo_account_2t',
          teacherName: 'Aditi Sharma (Teacher)',
          createdAt: new Date(Date.now() - 5 * 60000).toISOString(), // 5 mins ago
          transcript: 'Good morning students. Today we will explain theorems of circles...'
        },
        {
          sessionId: 'class_session_demo_hindi',
          subject: 'Hindi Kavya Rachna (कविता)',
          grade: 'Class 12 Batch B',
          scheduledTime: new Date(Date.now() + 120 * 60000).toISOString(), // 2 hours from now
          meetLink: liveMeetingUrl,
          status: 'scheduled',
          teacherUid: 'teacher_demo_account_2t',
          teacherName: 'Aditi Sharma (Teacher)',
          createdAt: new Date().toISOString()
        }
      ];
    }
    return [];
  }
  try {
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

function setLocalCollection(collectionName: string, list: any[]) {
  if (typeof localStorage === 'undefined') return;
  const key = `local_db_${collectionName}`;
  localStorage.setItem(key, JSON.stringify(list));
}

function getKeyField(collectionName: string): string {
  if (collectionName === 'users') return 'uid';
  if (collectionName === 'sessions') return 'sessionId';
  if (collectionName === 'attendance') return 'docId';
  return 'id';
}

interface SnapshotDocListener {
  docId: string;
  callback: (data: any) => void;
}

interface SnapshotColListener {
  callback: (data: any[]) => void;
}

const localColListeners: Record<string, SnapshotColListener[]> = {
  users: [],
  sessions: [],
  attendance: [],
};

const localDocListeners: Record<string, SnapshotDocListener[]> = {
  users: [],
  sessions: [],
  attendance: [],
};

// Listen to local storage updates from other tabs
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === 'local_db_users') triggerLocalListeners('users');
    if (e.key === 'local_db_sessions') triggerLocalListeners('sessions');
    if (e.key === 'local_db_attendance') triggerLocalListeners('attendance');
  });
}

function triggerLocalListeners(collectionName: string) {
  const list = getLocalCollection(collectionName);
  
  // Trigger collection listeners
  const colListeners = localColListeners[collectionName] || [];
  colListeners.forEach(listener => {
    listener.callback([...list]);
  });
  
  // Trigger document listeners
  const docListeners = localDocListeners[collectionName] || [];
  const keyField = getKeyField(collectionName);
  docListeners.forEach(listener => {
    const docData = list.find((item: any) => item[keyField] === listener.docId) || null;
    listener.callback(docData);
  });
}

export async function app_getDoc(collectionName: string, docId: string): Promise<any | null> {
  if (isDemoBypass()) {
    const list = getLocalCollection(collectionName);
    const keyField = getKeyField(collectionName);
    return list.find((item: any) => item[keyField] === docId) || null;
  }
  try {
    const docRef = doc(db, collectionName, docId);
    const snap = await getDoc(docRef);
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `${collectionName}/${docId}`);
    return null;
  }
}

export async function app_setDoc(collectionName: string, docId: string, data: any): Promise<void> {
  if (isDemoBypass()) {
    const list = getLocalCollection(collectionName);
    const keyField = getKeyField(collectionName);
    const index = list.findIndex((item: any) => item[keyField] === docId);
    if (index !== -1) {
      list[index] = { ...list[index], ...data };
    } else {
      list.push({ ...data });
    }
    setLocalCollection(collectionName, list);
    triggerLocalListeners(collectionName);
    return;
  }
  try {
    const docRef = doc(db, collectionName, docId);
    await setDoc(docRef, data);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `${collectionName}/${docId}`);
  }
}

export async function app_updateDoc(collectionName: string, docId: string, data: any): Promise<void> {
  if (isDemoBypass()) {
    const list = getLocalCollection(collectionName);
    const keyField = getKeyField(collectionName);
    const index = list.findIndex((item: any) => item[keyField] === docId);
    if (index !== -1) {
      list[index] = { ...list[index], ...data };
      setLocalCollection(collectionName, list);
      triggerLocalListeners(collectionName);
    }
    return;
  }
  try {
    const docRef = doc(db, collectionName, docId);
    await updateDoc(docRef, data);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `${collectionName}/${docId}`);
  }
}

export async function app_deleteDoc(collectionName: string, docId: string): Promise<void> {
  if (isDemoBypass()) {
    const list = getLocalCollection(collectionName);
    const keyField = getKeyField(collectionName);
    const filtered = list.filter((item: any) => item[keyField] !== docId);
    setLocalCollection(collectionName, filtered);
    triggerLocalListeners(collectionName);
    return;
  }
  try {
    const docRef = doc(db, collectionName, docId);
    await deleteDoc(docRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `${collectionName}/${docId}`);
  }
}

export async function app_getDocs(collectionName: string): Promise<any[]> {
  if (isDemoBypass()) {
    return [...getLocalCollection(collectionName)];
  }
  try {
    const colRef = collection(db, collectionName);
    const snap = await getDocs(colRef);
    const list: any[] = [];
    snap.forEach(d => list.push(d.data()));
    return list;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, collectionName);
    return [];
  }
}

export function app_onSnapshot(
  collectionName: string,
  callback: (data: any[]) => void,
  errorCallback?: (err: any) => void
): () => void {
  if (isDemoBypass()) {
    // Initial emission
    const list = getLocalCollection(collectionName);
    setTimeout(() => callback([...list]), 0);

    const listener = { callback };
    if (!localColListeners[collectionName]) {
      localColListeners[collectionName] = [];
    }
    localColListeners[collectionName].push(listener);

    return () => {
      localColListeners[collectionName] = localColListeners[collectionName].filter(l => l !== listener);
    };
  }

  // Real Firestore onSnapshot
  try {
    const colRef = collection(db, collectionName);
    return onSnapshot(colRef, (snap) => {
      const list: any[] = [];
      snap.forEach(d => list.push(d.data()));
      callback(list);
    }, (err) => {
      if (errorCallback) {
        errorCallback(err);
      } else {
        handleFirestoreError(err, OperationType.LIST, collectionName);
      }
    });
  } catch (err) {
    if (errorCallback) {
      errorCallback(err);
    } else {
      handleFirestoreError(err, OperationType.LIST, collectionName);
    }
    return () => {};
  }
}

export function app_onSnapshotDoc(
  collectionName: string,
  docId: string,
  callback: (data: any) => void,
  errorCallback?: (err: any) => void
): () => void {
  if (isDemoBypass()) {
    const list = getLocalCollection(collectionName);
    const keyField = getKeyField(collectionName);
    const docData = list.find((item: any) => item[keyField] === docId) || null;
    setTimeout(() => callback(docData), 0);

    const listener = { docId, callback };
    if (!localDocListeners[collectionName]) {
      localDocListeners[collectionName] = [];
    }
    localDocListeners[collectionName].push(listener);

    return () => {
      localDocListeners[collectionName] = localDocListeners[collectionName].filter(l => l !== listener);
    };
  }

  // Real Firestore Document onSnapshot
  try {
    const docRef = doc(db, collectionName, docId);
    return onSnapshot(docRef, (snap) => {
      callback(snap.exists() ? snap.data() : null);
    }, (err) => {
      if (errorCallback) {
        errorCallback(err);
      } else {
        handleFirestoreError(err, OperationType.GET, `${collectionName}/${docId}`);
      }
    });
  } catch (err) {
    if (errorCallback) {
      errorCallback(err);
    } else {
      handleFirestoreError(err, OperationType.GET, `${collectionName}/${docId}`);
    }
    return () => {};
  }
}

// Mandatory initial boot check confirming client-cloud link
async function testConnection() {
  if (isDemoBypass()) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Firestore client appears to be offline. Verify credentials if problems persist.");
    }
  }
}
testConnection();
