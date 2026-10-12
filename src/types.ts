export type RoleType = 'treasurer' | 'auditor' | 'student';
export type CurrencySymbol = '₱' | '$' | '€' | '¥';

export interface UserProfile {
  uid: string;
  username: string;
  displayName: string;
  createdAt?: unknown;
}

export interface WipeAuthorityRecord {
  uid: string;
  username: string;
  displayName: string;
  grantedByEmail: string;
  grantedAt?: unknown;
}

export interface EmailTwoFactorChallenge {
  id: string;
  uid: string;
  maskedEmail: string;
  purpose: 'signin' | 'signup' | 'google' | 'recover';
  createdAt?: unknown;
}

export interface Room {
  id: string;
  name: string;
  currency: CurrencySymbol;
  treasurerId: string;
  treasurerName: string;
  auditorId: string;
  auditorName: string;
  auditorCanModify: boolean;
  isPublicRoom: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface RoomMember {
  uid: string;
  roomId: string;
  username: string;
  role: RoleType;
  approvalStatus?: 'pending' | 'approved';
  joinedAt?: unknown;
  updatedAt?: unknown;
}

export interface UserJoinedRoom {
  uid: string;
  roomId: string;
  roomName: string;
  currency: CurrencySymbol;
  role: RoleType;
  approvalStatus: 'pending' | 'approved';
  joinedAt?: unknown;
  updatedAt?: unknown;
}

export interface LedgerEntry {
  id: string;
  roomId: string;
  entryDate: string; // YYYY-MM-DD
  title: string;
  category: string;
  amount: number;
  type: 'add' | 'subtract';
  note: string;
  contributorUid: string;
  contributorName: string;
  verified: boolean;
  verifiedByUid: string;
  verifiedByName: string;
  flagged: boolean;
  auditNote: string;
  createdByUid: string;
  createdByName: string;
  lastModifiedByUid: string;
  lastModifiedByName: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export const BLUEPRINT_LIMITS = {
  UID_REGEX: /^[a-zA-Z0-9_\-]+$/,
  ROOM_ID_MAX: 64,
  ROOM_NAME_MAX: 80,
  USERNAME_MIN: 2,
  USERNAME_MAX: 40,
  DISPLAY_NAME_MAX: 80,
  ENTRY_TITLE_MAX: 120,
  ENTRY_CATEGORY_MAX: 50,
  ENTRY_NOTE_MAX: 300,
  AUDIT_NOTE_MAX: 300,
  DATE_REGEX: /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/,
  AMOUNT_MAX: 1000000000,
};

export function sanitizeString(str: string, maxLength: number): string {
  return (str || '').trim().slice(0, maxLength);
}
