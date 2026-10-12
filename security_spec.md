# Security Specification (`security_spec.md`)

## 1. Data Invariants
1. **Identity & PII Isolation**: `/users/{userId}` stores only non-PII public identifiers (`uid`, `username`, `displayName`, `createdAt`) and requires `uid == request.auth.uid` on creation and update.
2. **Role Governance & Master Gate**:
   - Every `/rooms/{roomId}` has a designated `treasurerId`, an optional `auditorId`, and a boolean `auditorCanModify`.
   - Only the room's Treasurer (`treasurerId == request.auth.uid`) can toggle `auditorCanModify`, update room settings (`currency`, `name`), or reassign `auditorId`.
   - If `auditorId == ""`, an authenticated member may claim the Auditor role on the room document.
3. **Expense & Fund Modification Authorization**:
   - Creating, modifying, or deleting `/rooms/{roomId}/entries/{entryId}` is strictly restricted to:
     - The Room's **Treasurer** (`room.treasurerId == request.auth.uid`), OR
     - The Room's **Auditor** IF AND ONLY IF `room.auditorId == request.auth.uid && room.auditorCanModify == true`.
   - **Students** can never create, modify, verify, or delete entries.
4. **Auditor Verification Authority**:
   - The Room's **Auditor** (`room.auditorId == request.auth.uid`) can always update verification and audit fields (`verified`, `verifiedByUid`, `verifiedByName`, `flagged`, `auditNote`, `updatedAt`) on any entry in `/rooms/{roomId}/entries/{entryId}` even when `auditorCanModify == false`.
5. **Temporal & Relational Integrity**:
   - All `createdAt`, `joinedAt`, and `updatedAt` timestamps must match `request.time`.
   - Sub-documents (`members`, `entries`) must verify parent `/rooms/{roomId}` existence via `exists()` or `get()`.

## 2. The "Dirty Dozen" Payloads
1. **Unauthenticated Write**: Creating a room with `request.auth == null` -> `PERMISSION_DENIED`.
2. **Identity Spoofing on User Profile**: Creating `/users/userA` where `uid: "userB"` -> `PERMISSION_DENIED`.
3. **Shadow Field Injection on Room**: Creating `/rooms/room1` with an undeclared field `isSuperAdmin: true` -> `PERMISSION_DENIED`.
4. **Student Modifying Expense**: A user with `role: "student"` attempting to create or update `/rooms/room1/entries/entry1` -> `PERMISSION_DENIED`.
5. **Unauthorized Auditor Modifying Expense**: The room's Auditor (`auditorId == request.auth.uid`) attempting to change `amount` on `/rooms/room1/entries/entry1` when `room.auditorCanModify == false` -> `PERMISSION_DENIED`.
6. **Student Verifying Expense**: A Student attempting to update `verified: true` on `/rooms/room1/entries/entry1` -> `PERMISSION_DENIED`.
7. **Auditor Self-Authorizing Modification**: The Auditor attempting to update `auditorCanModify: true` on `/rooms/room1` -> `PERMISSION_DENIED`.
8. **Orphaned Entry Creation**: Creating `/rooms/nonExistentRoom/entries/entry1` where `/rooms/nonExistentRoom` does not exist -> `PERMISSION_DENIED`.
9. **Timestamp Forgery**: Creating an entry where `createdAt` is a past or future timestamp instead of `request.time` -> `PERMISSION_DENIED`.
10. **Immutable Field Mutation**: Updating `createdAt` or `createdByUid` on an existing `/rooms/room1/entries/entry1` -> `PERMISSION_DENIED`.
11. **Oversized String Denial-of-Wallet**: Submitting a `title` of 5,000 characters on `/rooms/room1/entries/entry1` (max 120) -> `PERMISSION_DENIED`.
12. **Negative or Zero Amount Injection**: Submitting `amount: -500` or `amount: 0` on `/rooms/room1/entries/entry1` -> `PERMISSION_DENIED`.
