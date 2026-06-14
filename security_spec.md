# Security Specification: School Virtual Classroom Platform

## 1. Data Invariants

1. **User Invariants**:
   - A user profile must have a valid `role` restricted to `['student', 'teacher', 'admin']`.
   - A user cannot self-assign a role other than `student` during registration, unless verified through alternative admin paths (or manual Firestore intervention).
   - Only authenticated users can read other user profiles (to see names & roles in class listings), but private PII fields must be isolated or restricted.

2. **Session Invariants**:
   - Only `teacher` or `admin` accounts can create, update, or delete sessions.
   - Session `status` must transition strictly from `scheduled` -> `live` -> `ended`. Once `ended`, it cannot transition back to `live`.
   - Creation requires a valid, verified teacher's `teacherUid` matching the current user.
   - Timestamps `createdAt` must match `request.time` on creation, and `updatedAt` on update.

3. **Attendance Invariants**:
   - Students can only record their own attendance.
   - An attendance record must reference a valid `sessionId` that exists.
   - `joinedAt` must match the actual join time (or `request.time`).
   - `durationMinutes` must be a positive number.

---

## 2. The "Dirty Dozen" Payloads

Here are 12 malicious payloads that must return `PERMISSION_DENIED`:

### Collection: `users`
1. **User Privilege Escalation (Create)**: A registering user tries to set their role as `admin`.
2. **User Profile Hijack (Update)**: A student attempts to update another student's user profile collection.
3. **Ghost Profile Injection (Create)**: Anonymous user attempts to create a profile without authentication.
4. **Role Modification (Update)**: A student attempts to modify their own `role` from `student` to `teacher`.

### Collection: `sessions`
5. **Student Scheduling Session (Create)**: A user with a `student` role attempts to schedule a class session.
6. **Session Hijack (Update)**: A teacher attempts to modify or delete another teacher's active class session.
7. **Invalid Time Manipulation (Create)**: Create a session with future `createdAt` timestamp instead of server time.
8. **Invalid State Skip (Update)**: Changing session status directly from `scheduled` to `ended` or trying to resurrect an `ended` session.

### Collection: `attendance`
9. **Identity Spoofing Attendance (Create)**: A user attempts to log an attendance record for another user's email or UID.
10. **Unauthenticated Check-in (Create)**: Anonymous user logs attendance.
11. **Duration Poisoning (Update)**: A student attempts to write an incredibly high value (e.g. `999999` minutes) into their own session attendance duration.
12. **Tampering with Past Session (Update)**: A student tries to update the `attended` status of school session records belonging to another classmate.

---

## 3. Test Runner Design

A suite of unit tests verifying these policies would look like this:

```typescript
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';

// Verification suite tests confirming all 12 malicious payloads fail with PERMISSION_DENIED.
// All system checks are hardened to protect school data integrity.
```
