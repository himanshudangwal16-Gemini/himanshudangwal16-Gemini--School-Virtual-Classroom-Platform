/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'student' | 'teacher' | 'admin';

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
}

export type SessionStatus = 'scheduled' | 'live' | 'ended';

export interface ClassSession {
  sessionId: string;
  subject: string;
  grade: string;
  scheduledTime: string;
  meetLink: string;
  status: SessionStatus;
  teacherUid: string;
  teacherName: string;
  createdAt: string;
  endedAt?: string;
  transcript?: string;
}

export interface AttendanceRecord {
  docId: string;
  sessionId: string;
  studentUid: string;
  studentName: string;
  studentEmail: string;
  joinedAt: string;
  leftAt?: string;
  durationMinutes?: number;
}
