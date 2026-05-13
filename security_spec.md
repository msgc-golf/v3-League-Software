# Security Specification - MSG Leagues

## 1. Data Invariants
- **Leagues**: Must have a non-empty name and a valid format (`stroke_play` or `best_ball`).
- **Courses**: Must have exactly 9 pars and 9 handicaps.
- **Entries**: Must link to a valid league. Player IDs must be non-empty strings.
- **Rounds**: Must link to a valid league and course.
- **Scores**: Must link to a valid round, league, player, and course. Hole scores must be an array of numbers. `calculatedHandicap` must be recorded at the time of score entry to preserve history.
- **Authentication**: All writes require authentication. Only designated admins can create/edit/delete master data like Courses and Players.

## 2. The "Dirty Dozen" Payloads (Attacker Payloads)

### Identity & Access Control
1. **The Spoof**: Authenticated user attempts to delete a league created by someone else.
2. **The Ghost Field**: Adding `isAdmin: true` to a score document to attempt privilege escalation.
3. **Admin Impersonation**: Non-admin attempting to create a new Course.
4. **Anonymous Write**: Attempting to add a player without being signed in.

### Integrity & Schema
5. **Score Injection**: Sending a `holeScores` array with 100 elements (Resource Exhaustion).
6. **Negative Par**: Setting a course par to `-1`.
7. **Orphaned Score**: Creating a score for a `roundId` that does not exist.
8. **Broken Reference**: Creating an entry for a `leagueId` with a 1MB string of junk characters.

### State & Temporal
9. **Backdated Score**: Attempting to set `roundDate` to a future date to bypass handicap logic.
10. **Immutable Tampering**: Updating `createdAt` on a document that was already created.
11. **Outcome Locking**: Attempting to change a score after it has been finalized/saved (if terminal state exists).
12. **System Field Overwrite**: Overwriting `calculatedHandicap` with `0` for a top player.

## 3. Test Runner (Mock Tests)
- `test('unauthenticated users cannot write', ...)` => DENY
- `test('non-admins cannot create courses', ...)` => DENY
- `test('admin (masonbslusher@gmail.com) can create courses', ...)` => ALLOW
- `test('score holeScores must be 9 numbers', ...)` => VALIDATE
- `test('entry leagueId must exist', ...)` => VALIDATE
