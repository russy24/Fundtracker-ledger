/**
 * Firestore Security Rules Test Specification (Dirty Dozen Verification)
 * Verifies all 12 attack vectors defined in security_spec.md return PERMISSION_DENIED.
 */

export interface DirtyDozenScenario {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'create' | 'update' | 'delete' | 'get' | 'list';
  authUid: string | null;
  payload?: Record<string, unknown>;
  expectedOutcome: 'PERMISSION_DENIED';
}

export const dirtyDozenTests: DirtyDozenScenario[] = [
  {
    id: 1,
    name: 'Unauthenticated Room Write',
    collectionPath: '/rooms/room1',
    operation: 'create',
    authUid: null,
    payload: { id: 'room1', name: 'Class Fund', isPublicRoom: true },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Identity Spoofing on User Profile',
    collectionPath: '/users/userA',
    operation: 'create',
    authUid: 'userA',
    payload: { uid: 'userB', username: 'spoofed', displayName: 'Spoofed' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Shadow Field Injection on Room',
    collectionPath: '/rooms/room1',
    operation: 'create',
    authUid: 'userA',
    payload: { id: 'room1', name: 'Fund', isSuperAdmin: true },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Student Modifying Expense',
    collectionPath: '/rooms/room1/entries/entry1',
    operation: 'create',
    authUid: 'studentUid',
    payload: { id: 'entry1', roomId: 'room1', amount: 500, type: 'subtract' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Unauthorized Auditor Modifying Expense (auditorCanModify == false)',
    collectionPath: '/rooms/room1/entries/entry1',
    operation: 'update',
    authUid: 'auditorUid',
    payload: { amount: 9999 },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Student Verifying Expense',
    collectionPath: '/rooms/room1/entries/entry1',
    operation: 'update',
    authUid: 'studentUid',
    payload: { verified: true },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Auditor Self-Authorizing Modification',
    collectionPath: '/rooms/room1',
    operation: 'update',
    authUid: 'auditorUid',
    payload: { auditorCanModify: true },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Orphaned Entry Creation',
    collectionPath: '/rooms/nonExistentRoom/entries/entry1',
    operation: 'create',
    authUid: 'treasurerUid',
    payload: { id: 'entry1', roomId: 'nonExistentRoom', amount: 100 },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Timestamp Forgery',
    collectionPath: '/rooms/room1/entries/entry1',
    operation: 'create',
    authUid: 'treasurerUid',
    payload: { id: 'entry1', createdAt: '1999-01-01T00:00:00Z' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Immutable Field Mutation',
    collectionPath: '/rooms/room1/entries/entry1',
    operation: 'update',
    authUid: 'treasurerUid',
    payload: { createdByUid: 'differentUser' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Oversized String Denial-of-Wallet',
    collectionPath: '/rooms/room1/entries/entry1',
    operation: 'create',
    authUid: 'treasurerUid',
    payload: { title: 'A'.repeat(5000) },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Negative or Zero Amount Injection',
    collectionPath: '/rooms/room1/entries/entry1',
    operation: 'create',
    authUid: 'treasurerUid',
    payload: { amount: -250 },
    expectedOutcome: 'PERMISSION_DENIED',
  },
];
