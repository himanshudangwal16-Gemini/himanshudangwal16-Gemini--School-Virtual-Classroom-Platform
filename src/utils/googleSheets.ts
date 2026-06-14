/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import { ClassSession, AttendanceRecord } from '../types';

/**
 * Creates a brand new Google Spreadsheet using the Google Sheets API.
 */
export async function createGoogleSpreadsheet(accessToken: string, title: string): Promise<string> {
  const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      properties: {
        title: title
      }
    })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Failed to create spreadsheet');
  }
  const data = await res.json();
  return data.spreadsheetId;
}

/**
 * Populates cells in a Google Spreadsheet starting from a target range.
 */
export async function updateGoogleSpreadsheetValues(
  accessToken: string,
  spreadsheetId: string,
  range: string,
  values: any[][]
): Promise<void> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        values: values
      })
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Failed to populate sheet values');
  }
}

/**
 * Packs a Class Session summary, attendee roster, and translation transcript,
 * creates a sheets container, and populates it.
 */
export async function exportSessionReportToSheets(
  accessToken: string,
  session: ClassSession,
  attendanceRecords: AttendanceRecord[]
): Promise<{ spreadsheetId: string; url: string }> {
  const dateStr = new Date(session.scheduledTime).toLocaleDateString();
  const title = `Classroom Report: ${session.subject} (${session.grade}) - ${dateStr}`;
  const spreadsheetId = await createGoogleSpreadsheet(accessToken, title);

  const values: any[][] = [
    ["🏫 VIDYALAYA VIRTUAL CLASSROOM PORTAL", " (Google Sheets Real-time Cloud Record)"],
    ["SESSION SUMMARY & ATTENDANCE REPORT", ""],
    ["", ""],
    ["Subject:", session.subject],
    ["Grade / Section:", session.grade],
    ["Date Scheduled:", new Date(session.scheduledTime).toLocaleDateString() + " at " + new Date(session.scheduledTime).toLocaleTimeString()],
    ["Instructor Name:", session.teacherName],
    ["Session Status:", session.status.toUpperCase()],
    ["Meeting Link:", session.meetLink],
    ["", ""],
    ["👥 STUDENT ATTENDANCE LEDGER", ""],
    ["Student Name", "Student Email", "Joined Classroom At", "Exited Classroom At", "Time Spent (Minutes)", "Status"],
  ];

  if (attendanceRecords.length === 0) {
    values.push(["No student attendance logs recorded for this session.", "", "", "", "", ""]);
  } else {
    attendanceRecords.forEach(rec => {
      values.push([
        rec.studentName,
        rec.studentEmail,
        new Date(rec.joinedAt).toLocaleString(),
        rec.leftAt ? new Date(rec.leftAt).toLocaleString() : 'Currently In Class',
        rec.durationMinutes !== undefined ? `${rec.durationMinutes} mins` : '-',
        rec.leftAt ? 'Checked Out' : 'Active In Class'
      ]);
    });
  }

  values.push(["", ""]);
  values.push(["📖 CLASS LECTURE TRANSLATED TRANSCRIPTS", ""]);
  values.push(["Language Mode Selected:", "Multi-lingual Voice Translation (Hindi/English)"]);
  values.push(["Transcript Text:", ""]);
  
  if (session.transcript) {
    values.push([session.transcript]);
  } else {
    values.push(["No transcript recorded for this session."]);
  }

  // Populate Sheet1 starting from cell A1
  await updateGoogleSpreadsheetValues(accessToken, spreadsheetId, 'Sheet1!A1', values);

  return {
    spreadsheetId,
    url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
  };
}

/**
 * Exports all combined school attendance logs from the admin dashboard database to a single Google Sheet.
 */
export async function exportAllAttendanceToSheets(
  accessToken: string,
  allSessions: ClassSession[],
  allAttendance: AttendanceRecord[]
): Promise<{ spreadsheetId: string; url: string }> {
  const dateStr = new Date().toLocaleDateString();
  const title = `Vidyalaya Comprehensive Attendance Ledger - ${dateStr}`;
  const spreadsheetId = await createGoogleSpreadsheet(accessToken, title);

  const values: any[][] = [
    ["🏫 VIDYALAYA VIRTUAL CLASSROOM PORTAL", "", "", "", "", "", "", ""],
    ["MASTER ATTENDANCE REPORT & LEARNING AUDIT", "", "", "", "", "", "", ""],
    ["Exported On:", new Date().toLocaleString(), "", "", "", "", "", ""],
    ["", "", "", "", "", "", "", ""],
    ["Student Name", "Student Email", "Class Subject", "Grade / Section", "Session Start Slot", "Join Timestamp", "Exit Timestamp", "Minutes Attended", "Class Status"],
  ];

  if (allAttendance.length === 0) {
    values.push(["No records logged in school database.", "", "", "", "", "", "", "", ""]);
  } else {
    allAttendance.forEach(rec => {
      const targetSession = allSessions.find(s => s.sessionId === rec.sessionId);
      const subjectName = targetSession ? targetSession.subject : "Deleted Subject";
      const gradeSection = targetSession ? targetSession.grade : "N/A";
      const sessionTime = targetSession ? new Date(targetSession.scheduledTime).toLocaleString() : "N/A";
      
      values.push([
        rec.studentName,
        rec.studentEmail,
        subjectName,
        gradeSection,
        sessionTime,
        new Date(rec.joinedAt).toLocaleString(),
        rec.leftAt ? new Date(rec.leftAt).toLocaleString() : 'Still In Classroom',
        rec.durationMinutes !== undefined ? rec.durationMinutes : 0,
        rec.leftAt ? 'Completed' : 'Live Check-in'
      ]);
    });
  }

  await updateGoogleSpreadsheetValues(accessToken, spreadsheetId, 'Sheet1!A1', values);

  return {
    spreadsheetId,
    url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
  };
}
