import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  db,
  auth,
  firebaseSignOut,
  handleFirestoreError,
  OperationType,
  testFirestoreConnection,
} from './firebase';
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import {
  Room,
  RoomMember,
  UserJoinedRoom,
  LedgerEntry,
  UserProfile,
  WipeAuthorityRecord,
  RoleType,
  CurrencySymbol,
  BLUEPRINT_LIMITS,
  sanitizeString,
} from './types';
import { AuthPortal, resolveUnifiedGoogleProfile } from './components/AuthPortal';
import { MonthCalendar, fmtMoney, toDateKey } from './components/MonthCalendar';
import {
  Wallet,
  ShieldCheck,
  GraduationCap,
  Plus,
  Trash2,
  Edit3,
  CheckCircle2,
  Flag,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  Users,
  FileText,
  Calendar,
  LogOut,
  Search,
  Lock,
  Unlock,
  ArrowRight,
  Download,
  X,
  Settings,
  AlertTriangle,
  RotateCcw,
  Clock,
  UserCheck,
  UserPlus,
} from 'lucide-react';

const CURRENCIES: CurrencySymbol[] = ['₱', '$', '€', '¥'];
const SUPER_ADMIN_EMAIL = 'franzatuel@gmail.com';
const CATEGORIES = [
  'Membership Dues',
  'Event Contribution',
  'Sponsorship Fund',
  'Supplies & Materials',
  'Venue & Logistics',
  'Food & Refreshments',
  'Printing & Documentation',
  'Emergency Reserve',
  'General Fund',
];

function generateId(len = 8): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < len; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

export default function App() {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem('ft_active_session');
      return saved ? (JSON.parse(saved) as UserProfile) : null;
    } catch {
      return null;
    }
  });
  const [authReady, setAuthReady] = useState(false);

  const [roomId, setRoomId] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get('room')
  );
  const [room, setRoom] = useState<Room | null>(null);
  const [roomLoading, setRoomLoading] = useState<boolean>(false);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [publicRooms, setPublicRooms] = useState<Room[]>([]);
  const [myJoinedRoomsIndex, setMyJoinedRoomsIndex] = useState<UserJoinedRoom[]>([]);
  const [newMemberInput, setNewMemberInput] = useState<string>('');
  const [newMemberRole, setNewMemberRole] = useState<RoleType>('student');
  const [memberManageMsg, setMemberManageMsg] = useState<string>('');
  const [memberManageBusy, setMemberManageBusy] = useState<boolean>(false);
  const [userDirSearch, setUserDirSearch] = useState<string>('');
  const [copiedDirectoryUid, setCopiedDirectoryUid] = useState<string | null>(null);

  // UI Navigation & Filters
  const [activeTab, setActiveTab] = useState<
    'dashboard' | 'verification' | 'student_reports' | 'governance' | 'me_settings'
  >('dashboard');
  const [viewedPov, setViewedPov] = useState<RoleType | null>(null);
  const [month, setMonth] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<
    'all' | 'add' | 'subtract' | 'verified' | 'unverified' | 'flagged'
  >('all');
  const [copiedLink, setCopiedLink] = useState(false);

  // Room Hub State
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomCurrency, setNewRoomCurrency] = useState<CurrencySymbol>('₱');
  const [newRoomInitialRole, setNewRoomInitialRole] = useState<RoleType>('treasurer');
  const [joinRoomCode, setJoinRoomCode] = useState('');
  const [hubError, setHubError] = useState('');
  const [hubBusy, setHubBusy] = useState(false);

  // Me & Data Management Settings State
  const [confirmWipeAllRooms, setConfirmWipeAllRooms] = useState(false);
  const [confirmWipeRoomEntries, setConfirmWipeRoomEntries] = useState(false);
  const [confirmDeleteThisRoom, setConfirmDeleteThisRoom] = useState(false);
  const [wipeBusy, setWipeBusy] = useState(false);
  const [wipeStatusMsg, setWipeStatusMsg] = useState('');

  // Restricted Wipe Authority State (Super Admin franzatuel@gmail.com + Delegated Users)
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [hasDelegatedWipeAuth, setHasDelegatedWipeAuth] = useState<boolean>(false);
  const [wipeAuthorities, setWipeAuthorities] = useState<WipeAuthorityRecord[]>([]);
  const [usersCollectionList, setUsersCollectionList] = useState<UserProfile[]>([]);
  const [credUsersList, setCredUsersList] = useState<UserProfile[]>([]);
  const [recoveryUsersList, setRecoveryUsersList] = useState<UserProfile[]>([]);
  const [grantIdentifier, setGrantIdentifier] = useState<string>('');
  const [grantBusy, setGrantBusy] = useState<boolean>(false);
  const [grantError, setGrantError] = useState<string>('');
  const [grantSuccess, setGrantSuccess] = useState<string>('');

  // Entry Form State (Create & Edit)
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [entryTitle, setEntryTitle] = useState('');
  const [entryCategory, setEntryCategory] = useState(CATEGORIES[0]);
  const [entryAmount, setEntryAmount] = useState('');
  const [entryType, setEntryType] = useState<'add' | 'subtract'>('add');
  const [entryDate, setEntryDate] = useState<string>(() => toDateKey(new Date()));
  const [entryNote, setEntryNote] = useState('');
  const [entryContributorUid, setEntryContributorUid] = useState('');
  const [entryContributorName, setEntryContributorName] = useState('');
  const [entryBusy, setEntryBusy] = useState(false);
  const [entryError, setEntryError] = useState('');

  // Audit Note Drafts
  const [auditNotesDraft, setAuditNotesDraft] = useState<Record<string, string>>({});

  // Test connection on boot
  useEffect(() => {
    testFirestoreConnection();
  }, []);

  // Sync date input when calendar date is selected
  useEffect(() => {
    if (selectedDate) {
      setEntryDate(selectedDate);
    }
  }, [selectedDate]);

  // Listen to Firebase Auth (Google sign-in) or verify persisted Username session
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        const isOwner = Boolean(
          currentUser.email?.toLowerCase() === SUPER_ADMIN_EMAIL &&
            currentUser.emailVerified
        );
        setIsSuperAdmin(isOwner);
        const userPath = `users/${currentUser.uid}`;
        try {
          // Resolve unified profile by Gmail so Google Sign-In and Username+Gmail Sign-In share the exact same UID
          const unifiedProfile = await resolveUnifiedGoogleProfile(currentUser);
          const isPending2FA = sessionStorage.getItem('ft_pending_2fa') === '1';
          const verifiedUid = localStorage.getItem('ft_2fa_verified_uid');
          if (!isPending2FA && verifiedUid === unifiedProfile.uid) {
            setUserProfile(unifiedProfile);
            localStorage.setItem('ft_active_session', JSON.stringify(unifiedProfile));
            if (currentUser.email) {
              localStorage.setItem('ft_active_email', currentUser.email.toLowerCase());
            }
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, userPath);
        }
      } else {
        const savedEmail = localStorage.getItem('ft_active_email') || '';
        setIsSuperAdmin(savedEmail.toLowerCase() === SUPER_ADMIN_EMAIL);
        // Verify persisted username session has a corresponding /users/{uid} record in Firestore
        try {
          const saved = localStorage.getItem('ft_active_session');
          if (saved) {
            const parsed = JSON.parse(saved) as UserProfile;
            if (parsed?.uid) {
              if (
                parsed.username?.toLowerCase().includes('franz') ||
                parsed.displayName?.toLowerCase().includes('franz') ||
                parsed.uid === 'aMVdQVuMuYMISlIcFuafEA8l8v53'
              ) {
                setIsSuperAdmin(true);
              }
              const snap = await getDoc(doc(db, 'users', parsed.uid));
              if (!snap.exists()) {
                await setDoc(doc(db, 'users', parsed.uid), {
                  uid: parsed.uid,
                  username: sanitizeString(
                    parsed.username || 'member',
                    BLUEPRINT_LIMITS.USERNAME_MAX
                  ),
                  displayName: sanitizeString(
                    parsed.displayName || parsed.username || 'Member',
                    BLUEPRINT_LIMITS.DISPLAY_NAME_MAX
                  ),
                  createdAt: serverTimestamp(),
                });
              }
            }
          }
        } catch {
          // Ignore local storage parse issues
        }
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Also ensure Primary Owner identity is recognized whenever userProfile updates
  useEffect(() => {
    if (!userProfile) return;
    const savedEmail = (localStorage.getItem('ft_active_email') || '').toLowerCase();
    const authEmail = (auth.currentUser?.email || '').toLowerCase();
    const uname = (userProfile.username || '').toLowerCase();
    const dname = (userProfile.displayName || '').toLowerCase();
    if (
      authEmail === SUPER_ADMIN_EMAIL ||
      savedEmail === SUPER_ADMIN_EMAIL ||
      uname === 'franzatuel' ||
      uname.includes('franz') ||
      dname.includes('franz atuel') ||
      userProfile.uid === 'aMVdQVuMuYMISlIcFuafEA8l8v53'
    ) {
      setIsSuperAdmin(true);
    }
  }, [userProfile]);

  // Listen to current user's Wipe Authority status in /wipe_authorities/{currentUid}
  useEffect(() => {
    if (!authReady || !userProfile?.uid) {
      setHasDelegatedWipeAuth(false);
      return;
    }
    const authDocPath = `wipe_authorities/${userProfile.uid}`;
    const unsub = onSnapshot(
      doc(db, 'wipe_authorities', userProfile.uid),
      (snap) => {
        setHasDelegatedWipeAuth(snap.exists());
      },
      (err) => handleFirestoreError(err, OperationType.GET, authDocPath)
    );
    return () => unsub();
  }, [authReady, userProfile?.uid]);

  // Subscribe to ALL sources of registered usernames (/users, /username_credentials, /email_recovery) so 100% of registered accounts appear
  useEffect(() => {
    if (!authReady || !userProfile) {
      setUsersCollectionList([]);
      setCredUsersList([]);
      setRecoveryUsersList([]);
      return;
    }

    const unsubUsers = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        const uList: UserProfile[] = [];
        snap.forEach((d) => {
          const data = d.data();
          if (data?.uid && data?.username) {
            uList.push({
              uid: data.uid,
              username: data.username,
              displayName: data.displayName || data.username,
              createdAt: data.createdAt,
            });
          }
        });
        setUsersCollectionList(uList);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'users')
    );

    const unsubCreds = onSnapshot(
      collection(db, 'username_credentials'),
      (snap) => {
        const cList: UserProfile[] = [];
        snap.forEach((d) => {
          const data = d.data();
          if (data?.uid && data?.username) {
            cList.push({
              uid: data.uid,
              username: data.username,
              displayName: data.displayName || data.username,
              createdAt: data.createdAt,
            });
          }
        });
        setCredUsersList(cList);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'username_credentials')
    );

    const unsubRecovery = onSnapshot(
      collection(db, 'email_recovery'),
      (snap) => {
        const rList: UserProfile[] = [];
        snap.forEach((d) => {
          const data = d.data();
          if (data?.uid && data?.username) {
            rList.push({
              uid: data.uid,
              username: data.username,
              displayName: data.displayName || data.username,
              createdAt: data.createdAt,
            });
          }
        });
        setRecoveryUsersList(rList);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'email_recovery')
    );

    return () => {
      unsubUsers();
      unsubCreds();
      unsubRecovery();
    };
  }, [authReady, userProfile]);

  // Subscribe to full /wipe_authorities list for all signed-in users so everyone can see who holds Authority and anyone with authority can manage it
  useEffect(() => {
    if (!authReady || !userProfile) {
      setWipeAuthorities([]);
      return;
    }
    const unsubAuths = onSnapshot(
      collection(db, 'wipe_authorities'),
      (snap) => {
        const list: WipeAuthorityRecord[] = [];
        snap.forEach((d) => list.push(d.data() as WipeAuthorityRecord));
        setWipeAuthorities(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'wipe_authorities')
    );

    return () => {
      unsubAuths();
    };
  }, [authReady, userProfile]);

  // Merge and deduplicate ALL registered usernames from /users, /username_credentials, /email_recovery, /wipe_authorities, and rooms
  const allUsersDirectory = useMemo(() => {
    const byUid = new Map<string, UserProfile>();
    const addProfile = (p: UserProfile) => {
      if (!p?.uid || !p?.username) return;
      const existing = byUid.get(p.uid);
      if (!existing) {
        byUid.set(p.uid, {
          uid: p.uid,
          username: p.username,
          displayName: p.displayName || p.username,
        });
      } else {
        byUid.set(p.uid, {
          uid: p.uid,
          username: existing.username || p.username,
          displayName: existing.displayName || p.displayName || existing.username,
        });
      }
    };

    usersCollectionList.forEach(addProfile);
    credUsersList.forEach(addProfile);
    recoveryUsersList.forEach(addProfile);
    wipeAuthorities.forEach((wa) =>
      addProfile({
        uid: wa.uid,
        username: wa.username,
        displayName: wa.displayName || wa.username,
      })
    );
    publicRooms.forEach((r) => {
      if (r.treasurerId && r.treasurerName) {
        addProfile({
          uid: r.treasurerId,
          username: r.treasurerName.replace(/[^a-zA-Z0-9_-]/g, '') || r.treasurerId,
          displayName: r.treasurerName,
        });
      }
      if (r.auditorId && r.auditorName) {
        addProfile({
          uid: r.auditorId,
          username: r.auditorName.replace(/[^a-zA-Z0-9_-]/g, '') || r.auditorId,
          displayName: r.auditorName,
        });
      }
    });
    members.forEach((m) =>
      addProfile({
        uid: m.uid,
        username: m.username.replace(/[^a-zA-Z0-9_-]/g, '') || m.uid,
        displayName: m.username,
      })
    );
    if (userProfile) {
      addProfile(userProfile);
    }

    const merged = Array.from(byUid.values());
    merged.sort((a, b) =>
      (a.username || a.displayName).localeCompare(b.username || b.displayName)
    );
    return merged;
  }, [
    usersCollectionList,
    credUsersList,
    recoveryUsersList,
    wipeAuthorities,
    publicRooms,
    members,
    userProfile,
  ]);

  // Automatically backfill any account found in /username_credentials or /email_recovery into /users/{uid} if missing
  useEffect(() => {
    if (!authReady || !userProfile) return;
    const existingUids = new Set(usersCollectionList.map((u) => u.uid));
    const missing = [...credUsersList, ...recoveryUsersList].filter(
      (u) => u.uid && !existingUids.has(u.uid)
    );
    missing.forEach(async (u) => {
      try {
        const cleanUname = sanitizeString(
          u.username.replace(/[^a-zA-Z0-9_-]/g, '') || 'member',
          BLUEPRINT_LIMITS.USERNAME_MAX
        );
        if (cleanUname.length >= 2) {
          await setDoc(doc(db, 'users', u.uid), {
            uid: u.uid,
            username: cleanUname,
            displayName: sanitizeString(
              u.displayName || cleanUname,
              BLUEPRINT_LIMITS.DISPLAY_NAME_MAX
            ),
            createdAt: serverTimestamp(),
          });
        }
      } catch {
        // Ignore backfill errors
      }
    });
  }, [authReady, userProfile, usersCollectionList, credUsersList, recoveryUsersList]);

  const handleSignOut = async () => {
    localStorage.removeItem('ft_active_session');
    localStorage.removeItem('ft_active_email');
    localStorage.removeItem('ft_2fa_verified_uid');
    sessionStorage.removeItem('ft_pending_2fa');
    setUserProfile(null);
    setIsSuperAdmin(false);
    try {
      await firebaseSignOut(auth);
    } catch {
      // Ignore if not signed into Firebase Auth
    }
  };

  // Subscribe to current user's personal joined rooms index (/users/{uid}/joined_rooms)
  useEffect(() => {
    if (!authReady || !userProfile?.uid) {
      setMyJoinedRoomsIndex([]);
      return;
    }
    const path = `users/${userProfile.uid}/joined_rooms`;
    const q = query(
      collection(db, 'users', userProfile.uid, 'joined_rooms'),
      where('uid', '==', userProfile.uid)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: UserJoinedRoom[] = [];
        snap.forEach((d) => list.push(d.data() as UserJoinedRoom));
        setMyJoinedRoomsIndex(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, path)
    );
    return () => unsub();
  }, [authReady, userProfile?.uid]);

  // Always load public rooms so "Me & Data Management" can inspect and wipe all rooms from anywhere
  useEffect(() => {
    if (!authReady || !userProfile) return;
    const roomsPath = 'rooms';
    const q = query(collection(db, 'rooms'), where('isPublicRoom', '==', true));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Room[] = [];
        snap.forEach((d) => list.push(d.data() as Room));
        setPublicRooms(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, roomsPath)
    );
    return () => unsub();
  }, [authReady, userProfile]);

  // Subscribe to active room, members, and entries
  useEffect(() => {
    if (!authReady || !userProfile || !roomId) {
      setRoom(null);
      setMembers([]);
      setEntries([]);
      return;
    }

    setRoomLoading(true);
    const roomPath = `rooms/${roomId}`;
    const membersPath = `rooms/${roomId}/members`;
    const entriesPath = `rooms/${roomId}/entries`;

    const unsubRoom = onSnapshot(
      doc(db, 'rooms', roomId),
      (snap) => {
        if (snap.exists()) {
          setRoom(snap.data() as Room);
        } else {
          setRoom(null);
        }
        setRoomLoading(false);
      },
      (err) => {
        setRoomLoading(false);
        handleFirestoreError(err, OperationType.GET, roomPath);
      }
    );

    const qMembers = query(
      collection(db, 'rooms', roomId, 'members'),
      where('roomId', '==', roomId)
    );
    const unsubMembers = onSnapshot(
      qMembers,
      (snap) => {
        const mList: RoomMember[] = [];
        snap.forEach((d) => mList.push(d.data() as RoomMember));
        setMembers(mList);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, membersPath)
    );

    const qEntries = query(
      collection(db, 'rooms', roomId, 'entries'),
      where('roomId', '==', roomId)
    );
    const unsubEntries = onSnapshot(
      qEntries,
      (snap) => {
        const eList: LedgerEntry[] = [];
        snap.forEach((d) => eList.push(d.data() as LedgerEntry));
        eList.sort((a, b) => b.entryDate.localeCompare(a.entryDate));
        setEntries(eList);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, entriesPath)
    );

    return () => {
      unsubRoom();
      unsubMembers();
      unsubEntries();
    };
  }, [authReady, userProfile, roomId]);

  const navigateToRoom = useCallback((targetRoomId: string | null) => {
    const url = new URL(window.location.href);
    if (targetRoomId) {
      url.searchParams.set('room', targetRoomId);
    } else {
      url.searchParams.delete('room');
    }
    window.history.pushState({}, '', url.toString());
    setRoomId(targetRoomId);
    setSelectedDate(null);
    setActiveTab('dashboard');
    setViewedPov(null);
    setConfirmWipeAllRooms(false);
    setConfirmWipeRoomEntries(false);
    setConfirmDeleteThisRoom(false);
    setWipeStatusMsg('');
  }, []);

  // Derive current user's POV role and permissions
  const currentUid = userProfile?.uid || '';
  const myUsername = userProfile?.displayName || userProfile?.username || 'Member';
  const myMemberRecord = useMemo(
    () => members.find((m) => m.uid === currentUid) || null,
    [members, currentUid]
  );

  const myRole: RoleType | null = useMemo(() => {
    if (!room || !currentUid) return null;
    if (room.treasurerId === currentUid) return 'treasurer';
    if (room.auditorId === currentUid) return 'auditor';
    if (myMemberRecord) return myMemberRecord.role;
    return null;
  }, [room, currentUid, myMemberRecord]);

  const isTreasurer = Boolean(myRole === 'treasurer' && room?.treasurerId === currentUid);
  const isAuditor = Boolean(myRole === 'auditor' && room?.auditorId === currentUid);
  const isStudent = myRole === 'student';

  // Effective Viewed POV:
  // - If user is a Student: strictly locked to 'student' (cannot view or go to other POVs)
  // - If user is Treasurer or Auditor: can use the POV Viewer Tab to preview any POV WITHOUT transferring/modifying their actual seat in Firestore
  const activeViewedPov: RoleType = useMemo(() => {
    if (!myRole) return 'student';
    if (myRole === 'student') return 'student';
    return viewedPov || myRole;
  }, [myRole, viewedPov]);

  const isPreviewingOtherPov = Boolean(
    myRole && myRole !== 'student' && activeViewedPov !== myRole
  );

  // Sync viewedPov when actual myRole changes
  useEffect(() => {
    if (!myRole) {
      setViewedPov(null);
    } else if (myRole === 'student') {
      setViewedPov('student');
    } else if (!viewedPov) {
      setViewedPov(myRole);
    }
  }, [myRole, viewedPov]);

  const canModifyExpenses = Boolean(
    activeViewedPov === 'treasurer'
      ? isTreasurer
      : activeViewedPov === 'auditor'
      ? isAuditor && room?.auditorCanModify === true
      : false
  );
  const canVerifyEntries = Boolean(activeViewedPov === 'auditor' && isAuditor);
  const isListedInWipeAuthorities = useMemo(
    () =>
      Boolean(
        userProfile &&
          wipeAuthorities.some(
            (w) =>
              w.uid === userProfile.uid ||
              w.username.toLowerCase() === userProfile.username.toLowerCase()
          )
      ),
    [wipeAuthorities, userProfile]
  );
  const canWipeRooms = Boolean(
    isSuperAdmin || hasDelegatedWipeAuth || isListedInWipeAuthorities
  );

  // Filter Active Shared FundTracker Rooms strictly to ONLY the rooms the user has joined (or is Treasurer/Auditor of)
  const myJoinedRooms = useMemo(() => {
    if (!currentUid) return [];
    const joinedIdSet = new Set(myJoinedRoomsIndex.map((jr) => jr.roomId));
    return publicRooms.filter(
      (r) =>
        joinedIdSet.has(r.id) ||
        r.treasurerId === currentUid ||
        r.auditorId === currentUid
    );
  }, [publicRooms, myJoinedRoomsIndex, currentUid]);

  // Determine if the user is approved to enter the room or waiting for a Treasurer/Auditor to add/approve them
  const isApprovedInRoom = useMemo(() => {
    if (!room || !currentUid) return false;
    if (isSuperAdmin) return true;
    if (room.treasurerId === currentUid || room.auditorId === currentUid) return true;
    if (!myMemberRecord) return false;
    return myMemberRecord.approvalStatus !== 'pending';
  }, [room, currentUid, isSuperAdmin, myMemberRecord]);

  const pendingMembers = useMemo(
    () => members.filter((m) => m.approvalStatus === 'pending'),
    [members]
  );
  const approvedMembers = useMemo(
    () => members.filter((m) => m.approvalStatus !== 'pending'),
    [members]
  );

  // Helper to sync user's personal joined_rooms index record
  const upsertUserJoinedRoomIndex = async (
    targetUid: string,
    targetRoom: Room,
    role: RoleType,
    approvalStatus: 'pending' | 'approved'
  ) => {
    const ref = doc(db, 'users', targetUid, 'joined_rooms', targetRoom.id);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        roomName: sanitizeString(targetRoom.name, 80),
        currency: targetRoom.currency,
        role,
        approvalStatus,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        uid: targetUid,
        roomId: targetRoom.id,
        roomName: sanitizeString(targetRoom.name, 80),
        currency: targetRoom.currency,
        role,
        approvalStatus,
        joinedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  };

  // Treasurer or Auditor: Approve a pending member join request
  const handleApproveMemberRequest = async (member: RoomMember) => {
    if (!room || (!isTreasurer && !isAuditor && !isSuperAdmin)) return;
    setMemberManageBusy(true);
    setMemberManageMsg('');
    try {
      await updateDoc(doc(db, 'rooms', room.id, 'members', member.uid), {
        approvalStatus: 'approved',
        updatedAt: serverTimestamp(),
      });
      await upsertUserJoinedRoomIndex(member.uid, room, member.role, 'approved');
      setMemberManageMsg(`Approved ${member.username} to access "${room.name}".`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `rooms/${room.id}/members/${member.uid}`);
    } finally {
      setMemberManageBusy(false);
    }
  };

  // Treasurer or Auditor: Reject / Remove a member or pending request
  const handleRemoveRoomMember = async (member: RoomMember) => {
    if (!room || (!isTreasurer && !isAuditor && !isSuperAdmin)) return;
    setMemberManageBusy(true);
    setMemberManageMsg('');
    try {
      await deleteDoc(doc(db, 'rooms', room.id, 'members', member.uid));
      try {
        await deleteDoc(doc(db, 'users', member.uid, 'joined_rooms', room.id));
      } catch {
        // Ignore if joined_rooms doc wasn't created
      }
      setMemberManageMsg(`Removed ${member.username} from "${room.name}".`);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `rooms/${room.id}/members/${member.uid}`);
    } finally {
      setMemberManageBusy(false);
    }
  };

  // Treasurer or Auditor: Directly add a user by Username or UID into the room (pre-approved!)
  const handleDirectAddMemberToRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!room || (!isTreasurer && !isAuditor && !isSuperAdmin)) return;
    const raw = newMemberInput.trim();
    if (!raw) return;

    setMemberManageBusy(true);
    setMemberManageMsg('');
    try {
      let targetProfile: UserProfile | null = null;
      const directSnap = await getDoc(doc(db, 'users', raw));
      if (directSnap.exists()) {
        targetProfile = directSnap.data() as UserProfile;
      } else {
        const matched = allUsersDirectory.find(
          (u) =>
            u.username.toLowerCase() === raw.toLowerCase() ||
            u.uid.toLowerCase() === raw.toLowerCase()
        );
        if (matched) targetProfile = matched;
      }

      const targetUid = targetProfile
        ? targetProfile.uid
        : raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
      const targetUsername = sanitizeString(
        targetProfile ? targetProfile.displayName || targetProfile.username : raw,
        60
      );

      if (!targetUid) {
        setMemberManageMsg('Please enter a valid username or Account UID.');
        setMemberManageBusy(false);
        return;
      }

      // Ensure /users/{targetUid} exists so Firestore rules pass isRegisteredUser
      const checkUserSnap = await getDoc(doc(db, 'users', targetUid));
      if (!checkUserSnap.exists()) {
        await setDoc(doc(db, 'users', targetUid), {
          uid: targetUid,
          username: sanitizeString(raw.replace(/[^a-zA-Z0-9_-]/g, ''), 40) || 'student_user',
          displayName: targetUsername,
          createdAt: serverTimestamp(),
        });
      }

      const assignedRole: RoleType =
        newMemberRole === 'auditor' && !room.auditorId ? 'auditor' : 'student';

      if (assignedRole === 'auditor' && !room.auditorId) {
        await updateDoc(doc(db, 'rooms', room.id), {
          auditorId: targetUid,
          auditorName: sanitizeString(targetUsername, 80),
          updatedAt: serverTimestamp(),
        });
      }

      await setDoc(doc(db, 'rooms', room.id, 'members', targetUid), {
        uid: targetUid,
        roomId: room.id,
        username: targetUsername,
        role: assignedRole,
        approvalStatus: 'approved',
        joinedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await upsertUserJoinedRoomIndex(targetUid, room, assignedRole, 'approved');
      setNewMemberInput('');
      setMemberManageMsg(
        `Added and verified ${targetUsername} (${assignedRole}) into "${room.name}".`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `rooms/${room.id}/members`);
    } finally {
      setMemberManageBusy(false);
    }
  };

  // One-click add user from the Registered Users Directory directly into the active room
  const handleQuickAddUserFromDirectory = async (
    targetUser: UserProfile,
    roleToAssign: RoleType
  ) => {
    if (!room || (!isTreasurer && !isAuditor && !isSuperAdmin)) return;
    setMemberManageBusy(true);
    setMemberManageMsg('');
    try {
      const assignedRole: RoleType =
        roleToAssign === 'auditor' && !room.auditorId ? 'auditor' : 'student';
      const cleanDisplay = sanitizeString(
        targetUser.displayName || targetUser.username || 'Member',
        60
      );

      if (assignedRole === 'auditor' && !room.auditorId) {
        await updateDoc(doc(db, 'rooms', room.id), {
          auditorId: targetUser.uid,
          auditorName: sanitizeString(cleanDisplay, 80),
          updatedAt: serverTimestamp(),
        });
      }

      await setDoc(doc(db, 'rooms', room.id, 'members', targetUser.uid), {
        uid: targetUser.uid,
        roomId: room.id,
        username: cleanDisplay,
        role: assignedRole,
        approvalStatus: 'approved',
        joinedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await upsertUserJoinedRoomIndex(targetUser.uid, room, assignedRole, 'approved');
      setMemberManageMsg(
        `Added and approved ${cleanDisplay} (@${targetUser.username}) as ${assignedRole} in "${room.name}".`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `rooms/${room.id}/members/${targetUser.uid}`);
    } finally {
      setMemberManageBusy(false);
    }
  };

  const handleCopyUserIdentifier = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedDirectoryUid(key);
    setTimeout(() => setCopiedDirectoryUid(null), 1600);
  };

  const filteredUsersDirectory = useMemo(() => {
    if (!userDirSearch.trim()) return allUsersDirectory;
    const q = userDirSearch.toLowerCase();
    return allUsersDirectory.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        u.displayName.toLowerCase().includes(q) ||
        u.uid.toLowerCase().includes(q)
    );
  }, [allUsersDirectory, userDirSearch]);

  // Anyone with Authority (Primary Owner OR users granted the same authority) can Grant Authority to a user by UID or Username
  const handleGrantWipeAuthority = async (targetUser: {
    uid: string;
    username: string;
    displayName: string;
  }) => {
    if (!canWipeRooms) return;
    setGrantBusy(true);
    setGrantError('');
    setGrantSuccess('');
    try {
      const cleanUname = sanitizeString(
        targetUser.username.replace(/[^a-zA-Z0-9_-]/g, '') || 'member',
        40
      );
      const cleanDisplay = sanitizeString(
        targetUser.displayName || targetUser.username || 'Member',
        80
      );
      // Ensure target user has a /users/{uid} record as well
      const uSnap = await getDoc(doc(db, 'users', targetUser.uid));
      if (!uSnap.exists() && cleanUname.length >= 2) {
        await setDoc(doc(db, 'users', targetUser.uid), {
          uid: targetUser.uid,
          username: cleanUname,
          displayName: cleanDisplay,
          createdAt: serverTimestamp(),
        });
      }

      const granterLabel = sanitizeString(
        isSuperAdmin
          ? SUPER_ADMIN_EMAIL
          : `@${userProfile?.username || myUsername} (Authorized)`,
        120
      );

      await setDoc(doc(db, 'wipe_authorities', targetUser.uid), {
        uid: targetUser.uid,
        username: sanitizeString(targetUser.username || 'member', 60),
        displayName: cleanDisplay,
        grantedByEmail: granterLabel,
        grantedAt: serverTimestamp(),
      });
      setGrantSuccess(
        `Granted full authority (same as Owner) to ${cleanDisplay} (@${targetUser.username}). They can now manage rooms, wipe data, and grant authority to others.`
      );
      setGrantIdentifier('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `wipe_authorities/${targetUser.uid}`);
    } finally {
      setGrantBusy(false);
    }
  };

  const handleGrantByInput = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWipeRooms) return;
    setGrantError('');
    setGrantSuccess('');
    const raw = grantIdentifier.trim().replace(/^@/, '');
    if (!raw) {
      setGrantError('Enter a username or user UID to grant the same authority.');
      return;
    }

    const lower = raw.toLowerCase();
    const matchedFromDir = allUsersDirectory.find(
      (u) =>
        u.uid.toLowerCase() === lower ||
        u.username.toLowerCase() === lower ||
        u.displayName.toLowerCase() === lower
    );

    if (matchedFromDir) {
      await handleGrantWipeAuthority(matchedFromDir);
      return;
    }

    const candidateUid = raw.startsWith('usr_')
      ? raw
      : `usr_${lower.replace(/[^a-z0-9_-]/g, '')}`;
    setGrantBusy(true);
    try {
      const directSnap = await getDoc(doc(db, 'users', raw));
      if (directSnap.exists()) {
        await handleGrantWipeAuthority(directSnap.data() as UserProfile);
        return;
      }
      const prefixedSnap = await getDoc(doc(db, 'users', candidateUid));
      if (prefixedSnap.exists()) {
        await handleGrantWipeAuthority(prefixedSnap.data() as UserProfile);
        return;
      }
      // If username wasn't in /users yet, create a registered user record and grant them authority immediately
      const cleanCustomUname = raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
      if (cleanCustomUname.length >= 2) {
        await handleGrantWipeAuthority({
          uid: candidateUid,
          username: cleanCustomUname,
          displayName: raw.slice(0, 80),
        });
        return;
      }
      setGrantError(
        `Could not find or register a valid username matching "${raw}".`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `users/${raw}`);
    } finally {
      setGrantBusy(false);
    }
  };

  // Anyone with Authority can Revoke Authority
  const handleRevokeWipeAuthority = async (targetUid: string, displayName: string) => {
    if (!canWipeRooms) return;
    setGrantBusy(true);
    setGrantError('');
    setGrantSuccess('');
    try {
      await deleteDoc(doc(db, 'wipe_authorities', targetUid));
      setGrantSuccess(`Revoked authority from ${displayName}.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `wipe_authorities/${targetUid}`);
    } finally {
      setGrantBusy(false);
    }
  };

  // Helper to delete a single room and all its subcollections (entries + members + joined_rooms)
  const deleteCompleteRoomById = async (targetId: string) => {
    if (!canWipeRooms || !userProfile) return;

    const [entriesSnap, membersSnap] = await Promise.all([
      getDocs(collection(db, 'rooms', targetId, 'entries')),
      getDocs(collection(db, 'rooms', targetId, 'members')),
    ]);

    const batch = writeBatch(db);
    entriesSnap.forEach((docSnap) => batch.delete(docSnap.ref));

    const memberUids = new Set<string>();
    if (userProfile.uid) {
      memberUids.add(userProfile.uid);
    }
    membersSnap.forEach((docSnap) => {
      batch.delete(docSnap.ref);
      const mData = docSnap.data() as RoomMember;
      if (mData?.uid) {
        memberUids.add(mData.uid);
      } else if (docSnap.id) {
        memberUids.add(docSnap.id);
      }
    });

    batch.delete(doc(db, 'rooms', targetId));
    await batch.commit();

    // Clean up joined_rooms index records for all members who were in this room
    await Promise.all(
      Array.from(memberUids).map(async (uid) => {
        try {
          await deleteDoc(doc(db, 'users', uid, 'joined_rooms', targetId));
        } catch {
          // Ignore if user never had a joined_rooms index record for this room
        }
      })
    );
  };

  // Wipe ALL rooms and all their entries & members across the entire workspace (RESTRICTED)
  const handleWipeAllRoomsData = async () => {
    if (!canWipeRooms) return;
    setWipeBusy(true);
    setWipeStatusMsg('');
    try {
      const roomsSnap = await getDocs(collection(db, 'rooms'));
      const roomIds: string[] = [];
      roomsSnap.forEach((r) => roomIds.push(r.id));

      for (const rId of roomIds) {
        await deleteCompleteRoomById(rId);
      }

      // Also clean up any remaining joined_rooms index entries on current user
      if (userProfile?.uid) {
        try {
          const myJoinedSnap = await getDocs(
            collection(db, 'users', userProfile.uid, 'joined_rooms')
          );
          await Promise.all(
            myJoinedSnap.docs.map((d) => deleteDoc(d.ref).catch(() => undefined))
          );
        } catch {
          // Ignore
        }
      }

      setConfirmWipeAllRooms(false);
      setWipeStatusMsg(
        `Clean start complete: Wiped ${roomIds.length} ${
          roomIds.length === 1 ? 'room' : 'rooms'
        } and all associated ledger entries and member records.`
      );
      if (roomId) {
        navigateToRoom(null);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'rooms');
    } finally {
      setWipeBusy(false);
    }
  };

  // Wipe only the ledger entries inside the current room (keeps room & members intact)
  const handleWipeCurrentRoomEntries = async () => {
    if (!room || !canWipeRooms) return;
    setWipeBusy(true);
    setWipeStatusMsg('');
    try {
      const batch = writeBatch(db);
      entries.forEach((entry) => {
        batch.delete(doc(db, 'rooms', room.id, 'entries', entry.id));
      });
      await batch.commit();
      setConfirmWipeRoomEntries(false);
      setWipeStatusMsg(
        `Wiped all ${entries.length} ledger entries in "${room.name}". The room and member roles remain intact.`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `rooms/${room.id}/entries`);
    } finally {
      setWipeBusy(false);
    }
  };

  // Delete a specific room and all its subcollections (RESTRICTED)
  const handleDeleteSpecificRoom = async (targetRoomId: string) => {
    if (!canWipeRooms) return;
    setWipeBusy(true);
    setWipeStatusMsg('');
    try {
      await deleteCompleteRoomById(targetRoomId);
      setConfirmDeleteThisRoom(false);
      if (roomId === targetRoomId) {
        navigateToRoom(null);
      } else {
        setWipeStatusMsg(`Deleted room ${targetRoomId} and all its data.`);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `rooms/${targetRoomId}`);
    } finally {
      setWipeBusy(false);
    }
  };

  // Create a new FundTracker room
  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;
    setHubError('');
    const cleanName = sanitizeString(
      newRoomName || 'Organization Fund Ledger',
      BLUEPRINT_LIMITS.ROOM_NAME_MAX
    );
    const id = generateId(8);
    setHubBusy(true);

    const roomPath = `rooms/${id}`;
    const memberPath = `rooms/${id}/members/${userProfile.uid}`;
    try {
      await setDoc(doc(db, 'rooms', id), {
        id,
        name: cleanName,
        currency: newRoomCurrency,
        treasurerId: newRoomInitialRole === 'treasurer' ? userProfile.uid : '',
        treasurerName:
          newRoomInitialRole === 'treasurer' ? sanitizeString(myUsername, 80) : '',
        auditorId: newRoomInitialRole === 'auditor' ? userProfile.uid : '',
        auditorName:
          newRoomInitialRole === 'auditor' ? sanitizeString(myUsername, 80) : '',
        auditorCanModify: false,
        isPublicRoom: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await setDoc(doc(db, 'rooms', id, 'members', userProfile.uid), {
        uid: userProfile.uid,
        roomId: id,
        username: sanitizeString(myUsername, 60),
        role: newRoomInitialRole,
        approvalStatus: 'approved',
        joinedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await setDoc(doc(db, 'users', userProfile.uid, 'joined_rooms', id), {
        uid: userProfile.uid,
        roomId: id,
        roomName: cleanName,
        currency: newRoomCurrency,
        role: newRoomInitialRole,
        approvalStatus: 'approved',
        joinedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setNewRoomName('');
      navigateToRoom(id);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, roomPath || memberPath);
    } finally {
      setHubBusy(false);
    }
  };

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setHubError('');
    const code = joinRoomCode.trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (!code) {
      setHubError('Please enter a valid room ID.');
      return;
    }
    setHubBusy(true);
    try {
      const snap = await getDoc(doc(db, 'rooms', code));
      if (!snap.exists()) {
        setHubError(`No FundTracker room found with ID "${code}".`);
      } else {
        navigateToRoom(code);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `rooms/${code}`);
    } finally {
      setHubBusy(false);
    }
  };

  // Claim initial role in the current room (Students cannot transfer to other POVs once enrolled as Student)
  const handleSelectRole = async (targetRole: RoleType) => {
    if (!userProfile || !room) return;
    if (myRole === 'student' && targetRole !== 'student') {
      return;
    }
    const roomRef = doc(db, 'rooms', room.id);
    const memberRef = doc(db, 'rooms', room.id, 'members', userProfile.uid);
    const cleanName = sanitizeString(myUsername, 60);

    try {
      if (room.treasurerId === userProfile.uid && targetRole !== 'treasurer') {
        await updateDoc(roomRef, {
          treasurerId: '',
          treasurerName: '',
          updatedAt: serverTimestamp(),
        });
      }
      if (room.auditorId === userProfile.uid && targetRole !== 'auditor') {
        await updateDoc(roomRef, {
          auditorId: '',
          auditorName: '',
          updatedAt: serverTimestamp(),
        });
      }

      if (targetRole === 'treasurer' && room.treasurerId !== userProfile.uid) {
        if (room.treasurerId !== '') {
          return;
        }
        await updateDoc(roomRef, {
          treasurerId: userProfile.uid,
          treasurerName: sanitizeString(myUsername, 80),
          updatedAt: serverTimestamp(),
        });
      } else if (targetRole === 'auditor' && room.auditorId !== userProfile.uid) {
        if (room.auditorId !== '') {
          return;
        }
        await updateDoc(roomRef, {
          auditorId: userProfile.uid,
          auditorName: sanitizeString(myUsername, 80),
          updatedAt: serverTimestamp(),
        });
      }

      // Determine if user is auto-approved (claiming vacant Treasurer/Auditor seat or already approved) or needs Treasurer/Auditor verification
      const hasExistingOfficer = Boolean(
        (room.treasurerId && room.treasurerId !== userProfile.uid) ||
          (room.auditorId && room.auditorId !== userProfile.uid)
      );
      const nextApprovalStatus: 'pending' | 'approved' =
        isSuperAdmin ||
        myMemberRecord?.approvalStatus === 'approved' ||
        (targetRole === 'treasurer' &&
          (!room.treasurerId || room.treasurerId === userProfile.uid)) ||
        (targetRole === 'auditor' &&
          (!room.auditorId || room.auditorId === userProfile.uid)) ||
        !hasExistingOfficer
          ? 'approved'
          : 'pending';

      if (myMemberRecord) {
        await updateDoc(memberRef, {
          role: targetRole,
          username: cleanName,
          approvalStatus: nextApprovalStatus,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(memberRef, {
          uid: userProfile.uid,
          roomId: room.id,
          username: cleanName,
          role: targetRole,
          approvalStatus: nextApprovalStatus,
          joinedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      await upsertUserJoinedRoomIndex(
        userProfile.uid,
        room,
        targetRole,
        nextApprovalStatus
      );
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.WRITE,
        `rooms/${room.id}/members/${userProfile.uid}`
      );
    }
  };

  // Treasurer: Toggle Auditor Expense Modification Authorization
  const handleToggleAuditorAuth = async () => {
    if (!room || !isTreasurer) return;
    const roomPath = `rooms/${room.id}`;
    try {
      await updateDoc(doc(db, 'rooms', room.id), {
        auditorCanModify: !room.auditorCanModify,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, roomPath);
    }
  };

  // Treasurer: Change Room Currency
  const handleCurrencyChange = async (newCurrency: CurrencySymbol) => {
    if (!room || !isTreasurer) return;
    try {
      await updateDoc(doc(db, 'rooms', room.id), {
        currency: newCurrency,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `rooms/${room.id}`);
    }
  };

  // Treasurer: Demote Auditor to Student
  const handleDemoteAuditor = async () => {
    if (!room || !isTreasurer || !room.auditorId) return;
    const oldAuditorId = room.auditorId;
    try {
      await updateDoc(doc(db, 'rooms', room.id), {
        auditorId: '',
        auditorName: '',
        auditorCanModify: false,
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'rooms', room.id, 'members', oldAuditorId), {
        role: 'student',
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `rooms/${room.id}`);
    }
  };

  // Create or Update Ledger Entry (Treasurer OR Authorized Auditor)
  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!room || !userProfile || !canModifyExpenses) return;
    setEntryError('');

    const parsedAmount = parseFloat(entryAmount);
    if (!entryTitle.trim()) {
      setEntryError('Please enter a descriptive title.');
      return;
    }
    if (
      isNaN(parsedAmount) ||
      parsedAmount <= 0 ||
      parsedAmount > BLUEPRINT_LIMITS.AMOUNT_MAX
    ) {
      setEntryError('Amount must be greater than 0.');
      return;
    }
    if (!BLUEPRINT_LIMITS.DATE_REGEX.test(entryDate)) {
      setEntryError('Date must be in YYYY-MM-DD format.');
      return;
    }

    const selectedMember = members.find((m) => m.uid === entryContributorUid);
    const finalContributorUid = selectedMember
      ? selectedMember.uid
      : entryContributorUid.trim();
    const finalContributorName = sanitizeString(
      selectedMember ? selectedMember.username : entryContributorName || myUsername,
      80
    );

    setEntryBusy(true);
    try {
      if (editingEntryId) {
        const existingEntry = entries.find((x) => x.id === editingEntryId);
        if (!existingEntry) return;
        await updateDoc(doc(db, 'rooms', room.id, 'entries', editingEntryId), {
          entryDate,
          title: sanitizeString(entryTitle, BLUEPRINT_LIMITS.ENTRY_TITLE_MAX),
          category: sanitizeString(entryCategory, BLUEPRINT_LIMITS.ENTRY_CATEGORY_MAX),
          amount: Math.round(parsedAmount * 100) / 100,
          type: entryType,
          note: sanitizeString(entryNote, BLUEPRINT_LIMITS.ENTRY_NOTE_MAX),
          contributorUid: finalContributorUid,
          contributorName: finalContributorName,
          verified: existingEntry.verified,
          verifiedByUid: existingEntry.verifiedByUid,
          verifiedByName: existingEntry.verifiedByName,
          flagged: existingEntry.flagged,
          auditNote: existingEntry.auditNote,
          lastModifiedByUid: userProfile.uid,
          lastModifiedByName: sanitizeString(myUsername, 80),
          updatedAt: serverTimestamp(),
        });
        setEditingEntryId(null);
      } else {
        const newId = generateId(12);
        await setDoc(doc(db, 'rooms', room.id, 'entries', newId), {
          id: newId,
          roomId: room.id,
          entryDate,
          title: sanitizeString(entryTitle, BLUEPRINT_LIMITS.ENTRY_TITLE_MAX),
          category: sanitizeString(entryCategory, BLUEPRINT_LIMITS.ENTRY_CATEGORY_MAX),
          amount: Math.round(parsedAmount * 100) / 100,
          type: entryType,
          note: sanitizeString(entryNote, BLUEPRINT_LIMITS.ENTRY_NOTE_MAX),
          contributorUid: finalContributorUid,
          contributorName: finalContributorName,
          verified: false,
          verifiedByUid: '',
          verifiedByName: '',
          flagged: false,
          auditNote: '',
          createdByUid: userProfile.uid,
          createdByName: sanitizeString(myUsername, 80),
          lastModifiedByUid: userProfile.uid,
          lastModifiedByName: sanitizeString(myUsername, 80),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      setEntryTitle('');
      setEntryAmount('');
      setEntryNote('');
      setEntryContributorUid('');
      setEntryContributorName('');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `rooms/${room.id}/entries`);
    } finally {
      setEntryBusy(false);
    }
  };

  const startEditEntry = (entry: LedgerEntry) => {
    setEditingEntryId(entry.id);
    setEntryTitle(entry.title);
    setEntryCategory(entry.category);
    setEntryAmount(String(entry.amount));
    setEntryType(entry.type);
    setEntryDate(entry.entryDate);
    setEntryNote(entry.note);
    setEntryContributorUid(entry.contributorUid);
    setEntryContributorName(entry.contributorName);
    setActiveTab('dashboard');
  };

  const cancelEditEntry = () => {
    setEditingEntryId(null);
    setEntryTitle('');
    setEntryAmount('');
    setEntryNote('');
    setEntryContributorUid('');
    setEntryContributorName('');
  };

  const handleDeleteEntry = async (entryId: string) => {
    if (!room || !canModifyExpenses) return;
    try {
      await deleteDoc(doc(db, 'rooms', room.id, 'entries', entryId));
      if (editingEntryId === entryId) cancelEditEntry();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `rooms/${room.id}/entries/${entryId}`);
    }
  };

  // Auditor: Verify or Flag Entry
  const handleAuditorVerify = async (entry: LedgerEntry, nextVerified: boolean) => {
    if (!room || !userProfile || !canVerifyEntries) return;
    const draftNote =
      auditNotesDraft[entry.id] !== undefined ? auditNotesDraft[entry.id] : entry.auditNote;
    try {
      await updateDoc(doc(db, 'rooms', room.id, 'entries', entry.id), {
        verified: nextVerified,
        verifiedByUid: nextVerified ? userProfile.uid : '',
        verifiedByName: nextVerified ? sanitizeString(myUsername, 80) : '',
        flagged: nextVerified ? false : entry.flagged,
        auditNote: sanitizeString(draftNote, BLUEPRINT_LIMITS.AUDIT_NOTE_MAX),
        lastModifiedByUid: userProfile.uid,
        lastModifiedByName: sanitizeString(myUsername, 80),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `rooms/${room.id}/entries/${entry.id}`);
    }
  };

  const handleAuditorFlag = async (entry: LedgerEntry, nextFlagged: boolean) => {
    if (!room || !userProfile || !canVerifyEntries) return;
    const draftNote =
      auditNotesDraft[entry.id] !== undefined ? auditNotesDraft[entry.id] : entry.auditNote;
    try {
      await updateDoc(doc(db, 'rooms', room.id, 'entries', entry.id), {
        flagged: nextFlagged,
        verified: nextFlagged ? false : entry.verified,
        verifiedByUid: nextFlagged ? '' : entry.verifiedByUid,
        verifiedByName: nextFlagged ? '' : entry.verifiedByName,
        auditNote: sanitizeString(draftNote, BLUEPRINT_LIMITS.AUDIT_NOTE_MAX),
        lastModifiedByUid: userProfile.uid,
        lastModifiedByName: sanitizeString(myUsername, 80),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `rooms/${room.id}/entries/${entry.id}`);
    }
  };

  const handleSaveAuditNote = async (entry: LedgerEntry) => {
    if (!room || !userProfile || !canVerifyEntries) return;
    const draftNote =
      auditNotesDraft[entry.id] !== undefined ? auditNotesDraft[entry.id] : entry.auditNote;
    if (draftNote === entry.auditNote) return;
    try {
      await updateDoc(doc(db, 'rooms', room.id, 'entries', entry.id), {
        verified: entry.verified,
        verifiedByUid: entry.verifiedByUid,
        verifiedByName: entry.verifiedByName,
        flagged: entry.flagged,
        auditNote: sanitizeString(draftNote, BLUEPRINT_LIMITS.AUDIT_NOTE_MAX),
        lastModifiedByUid: userProfile.uid,
        lastModifiedByName: sanitizeString(myUsername, 80),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `rooms/${room.id}/entries/${entry.id}`);
    }
  };

  // Copy Invite Link
  const handleCopyInvite = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 1800);
  };

  // Export CSV for Student Contributions or Full Ledger
  const exportToCsv = (rows: LedgerEntry[], filename: string) => {
    const headers = [
      'Date',
      'Title',
      'Category',
      'Type',
      'Amount',
      'Contributor',
      'Verified',
      'Verified By',
      'Flagged',
      'Audit Note',
      'Note',
    ];
    const csvLines = [
      headers.join(','),
      ...rows.map((r) =>
        [
          r.entryDate,
          `"${r.title.replace(/"/g, '""')}"`,
          `"${r.category.replace(/"/g, '""')}"`,
          r.type === 'add' ? 'Contribution/Fund' : 'Expense',
          r.amount.toFixed(2),
          `"${r.contributorName.replace(/"/g, '""')}"`,
          r.verified ? 'Verified' : 'Pending',
          `"${r.verifiedByName.replace(/"/g, '""')}"`,
          r.flagged ? 'Flagged' : 'Clear',
          `"${r.auditNote.replace(/"/g, '""')}"`,
          `"${r.note.replace(/"/g, '""')}"`,
        ].join(',')
      ),
    ];
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Computed Financial Metrics
  const symbol: CurrencySymbol = room?.currency || '₱';
  const totalFundsAdded = useMemo(
    () => entries.filter((e) => e.type === 'add').reduce((s, e) => s + Number(e.amount), 0),
    [entries]
  );
  const totalExpenses = useMemo(
    () =>
      entries.filter((e) => e.type === 'subtract').reduce((s, e) => s + Number(e.amount), 0),
    [entries]
  );
  const netBalance = totalFundsAdded - totalExpenses;

  const verifiedCount = useMemo(() => entries.filter((e) => e.verified).length, [entries]);
  const flaggedCount = useMemo(() => entries.filter((e) => e.flagged).length, [entries]);

  const monthPrefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(
    2,
    '0'
  )}`;
  const monthEntries = useMemo(
    () => entries.filter((e) => e.entryDate.slice(0, 7) === monthPrefix),
    [entries, monthPrefix]
  );

  const filteredEntries = useMemo(() => {
    const base = selectedDate
      ? entries.filter((e) => e.entryDate === selectedDate)
      : monthEntries;
    return base.filter((e) => {
      if (filterType === 'add' && e.type !== 'add') return false;
      if (filterType === 'subtract' && e.type !== 'subtract') return false;
      if (filterType === 'verified' && !e.verified) return false;
      if (filterType === 'unverified' && e.verified) return false;
      if (filterType === 'flagged' && !e.flagged) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        return (
          e.title.toLowerCase().includes(q) ||
          e.category.toLowerCase().includes(q) ||
          e.contributorName.toLowerCase().includes(q) ||
          e.note.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [entries, monthEntries, selectedDate, filterType, searchTerm]);

  // Student's Own Contributions Report
  const myContributions = useMemo(() => {
    if (!userProfile) return [];
    const lowerMyName = myUsername.toLowerCase();
    return entries.filter(
      (e) =>
        e.type === 'add' &&
        (e.contributorUid === userProfile.uid ||
          (e.contributorName && e.contributorName.toLowerCase() === lowerMyName))
    );
  }, [entries, userProfile, myUsername]);

  const myTotalContributed = useMemo(
    () => myContributions.reduce((s, e) => s + Number(e.amount), 0),
    [myContributions]
  );

  // Loading state
  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-sm font-medium text-slate-500">Initializing FundTracker…</div>
      </div>
    );
  }

  // Unauthenticated -> AuthPortal
  if (!userProfile) {
    return <AuthPortal onAuthenticated={(profile) => setUserProfile(profile)} />;
  }

  // Authenticated but no Room selected -> Room Hub (includes "Me & Data Wipe Settings" section)
  if (!roomId) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
        {/* Top Bar Contract: 3 Zones */}
        <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200">
          <a href="/" className="text-lg font-bold tracking-tight text-slate-900">
            FundTracker Ledger
          </a>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <a href="#create-room" className="hover:text-slate-900 transition-colors">
              Create Ledger
            </a>
            <a href="#join-room" className="hover:text-slate-900 transition-colors">
              Join by Room ID
            </a>
            <a href="#directory" className="hover:text-slate-900 transition-colors">
              My Joined Rooms ({myJoinedRooms.length})
            </a>
            <a href="#users-directory" className="hover:text-slate-900 transition-colors">
              All Users & UIDs ({allUsersDirectory.length})
            </a>
            <a href="#me-settings" className="hover:text-slate-900 transition-colors">
              Me & Data Wipe
            </a>
          </nav>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-600 hidden sm:inline">
              Signed in as <b className="text-slate-900">{myUsername}</b>
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap"
            >
              Sign Out
            </button>
          </div>
        </header>

        <main className="max-w-6xl w-full mx-auto px-6 py-10 space-y-10">
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500">
              Account Identity: {myUsername} · Select or Create a Shared FundTracker Room
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Financial Room Workspace
            </h1>
          </div>

          {hubError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              {hubError}
            </div>
          )}

          {wipeStatusMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center justify-between">
              <span>{wipeStatusMsg}</span>
              <button
                type="button"
                onClick={() => setWipeStatusMsg('')}
                className="text-emerald-700 hover:underline ml-4"
              >
                Dismiss
              </button>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-8">
            {/* Create New Room */}
            <section
              id="create-room"
              className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
            >
              <div className="space-y-1">
                <h2 className="text-base font-bold text-slate-900">
                  01. Create New FundTracker Room
                </h2>
                <p className="text-xs text-slate-500">
                  Initialize a shared ledger calendar and choose your starting Point of View (POV).
                </p>
              </div>

              <form onSubmit={handleCreateRoom} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Room / Organization Name
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={80}
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    placeholder="e.g. CS Student Council FY 2026"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Default Currency
                    </label>
                    <select
                      value={newRoomCurrency}
                      onChange={(e) => setNewRoomCurrency(e.target.value as CurrencySymbol)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c} value={c}>
                          {c} Currency
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Your Starting POV Role
                    </label>
                    <select
                      value={newRoomInitialRole}
                      onChange={(e) => setNewRoomInitialRole(e.target.value as RoleType)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                    >
                      <option value="treasurer">Treasurer (Manage Funds)</option>
                      <option value="auditor">Auditor (Verify Ledger)</option>
                      <option value="student">Student (Monitor & Reports)</option>
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={hubBusy}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-medium text-sm rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
                >
                  <span>
                    {hubBusy ? 'Creating Room…' : 'Create Financial Dashboard'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </section>

            {/* Join Existing Room */}
            <section
              id="join-room"
              className="bg-white border border-slate-200 rounded-xl p-6 space-y-5 flex flex-col justify-between"
            >
              <div className="space-y-4">
                <div className="space-y-1">
                  <h2 className="text-base font-bold text-slate-900">
                    02. Join Existing Room by Code
                  </h2>
                  <p className="text-xs text-slate-500">
                    Enter a room code shared by your Treasurer or classmate to join as Treasurer, Auditor, or Student.
                  </p>
                </div>

                <form onSubmit={handleJoinByCode} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Room Code
                    </label>
                    <input
                      type="text"
                      required
                      value={joinRoomCode}
                      onChange={(e) => setJoinRoomCode(e.target.value)}
                      placeholder="e.g. k9m4x2p8"
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={hubBusy}
                    className="w-full py-2.5 px-4 bg-white border border-slate-300 hover:bg-slate-50 text-slate-900 font-medium text-sm rounded-lg transition-colors whitespace-nowrap"
                  >
                    Open Room Dashboard
                  </button>
                </form>
              </div>

              <div className="border-t border-slate-100 pt-4 text-xs text-slate-500 space-y-1">
                <div className="font-medium text-slate-700">Role Permissions Summary</div>
                <p>
                  Treasurer manages funds and authorizes the Auditor. Auditor verifies expenses and edits when authorized. Students view the live dashboard and download personal contribution reports.
                </p>
              </div>
            </section>
          </div>

          {/* Active Shared Rooms Directory (STRICTLY ONLY ROOMS THE USER HAS JOINED) */}
          <section
            id="directory"
            className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  03. Active Shared FundTracker Rooms (Joined by You)
                </h2>
                <p className="text-xs text-slate-500">
                  Displays only the FundTracker rooms you have created, joined by room code, or been added to by a Treasurer or Auditor.
                </p>
              </div>
              <span className="text-xs font-mono text-slate-500 tabular-nums">
                {myJoinedRooms.length} {myJoinedRooms.length === 1 ? 'joined room' : 'joined rooms'}
              </span>
            </div>

            {myJoinedRooms.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
                You have not joined any rooms yet. Create a new room above or enter a Room Code in "02. Join Existing Room by Code" to request access.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 border-t border-slate-200">
                {myJoinedRooms.map((r) => {
                  const jInfo = myJoinedRoomsIndex.find((x) => x.roomId === r.id);
                  const isPendingJoin =
                    jInfo?.approvalStatus === 'pending' &&
                    r.treasurerId !== currentUid &&
                    r.auditorId !== currentUid;
                  return (
                    <div
                      key={r.id}
                      className="py-3 flex flex-wrap items-center justify-between gap-4 hover:bg-slate-50/80 px-2 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-sm text-slate-900 truncate flex items-center gap-2">
                          <span>{r.name}</span>
                          {isPendingJoin ? (
                            <span className="text-[11px] font-medium text-amber-700 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              <span>Waiting for Treasurer/Auditor Approval</span>
                            </span>
                          ) : (
                            <span className="text-[11px] font-medium text-emerald-700 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Verified Member</span>
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 flex flex-wrap items-center gap-1.5">
                          <span className="font-mono">ID: {r.id}</span>
                          <span>·</span>
                          <span>Currency: {r.currency}</span>
                          <span>·</span>
                          <span>Treasurer: {r.treasurerName || 'Vacant'}</span>
                          <span>·</span>
                          <span>Auditor: {r.auditorName || 'Vacant'}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {canWipeRooms && (
                          <button
                            type="button"
                            disabled={wipeBusy}
                            onClick={() => handleDeleteSpecificRoom(r.id)}
                            className="px-2.5 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors whitespace-nowrap flex items-center gap-1 disabled:opacity-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete Room</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => navigateToRoom(r.id)}
                          className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap"
                        >
                          {isPendingJoin ? 'Check Approval Status' : 'Enter Room'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* REGISTERED USERS & UID DIRECTORY (VISIBLE TO ALL SIGNED-IN USERS, WITH 1-CLICK GRANT SAME AUTHORITY) */}
          <section
            id="users-directory"
            className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Users className="w-4 h-4 text-slate-700" />
                  <span>04. All Registered Usernames & Authority Directory ({allUsersDirectory.length})</span>
                </h2>
                <p className="text-xs text-slate-500">
                  Shows every registered username across the entire FundTracker database. {canWipeRooms ? 'Click "Give Same Authority" next to any username so they get the exact same authority as you and can also grant it to others.' : 'Copy any @username or UID to add teammates.'}
                </p>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={userDirSearch}
                  onChange={(e) => setUserDirSearch(e.target.value)}
                  placeholder="Search @username, display name, or UID…"
                  className="w-full border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
            </div>

            {grantError && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                {grantError}
              </div>
            )}
            {grantSuccess && (
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
                {grantSuccess}
              </div>
            )}

            {filteredUsersDirectory.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
                No matching user accounts found.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 border-t border-slate-200 max-h-96 overflow-y-auto">
                {filteredUsersDirectory.map((u) => {
                  const isMe = u.uid === userProfile.uid;
                  const isPrimaryOwnerUser =
                    u.username.toLowerCase() === 'franzatuel' ||
                    u.username.toLowerCase().includes('franz') ||
                    u.uid === 'aMVdQVuMuYMISlIcFuafEA8l8v53';
                  const isWipeAuth =
                    isPrimaryOwnerUser ||
                    wipeAuthorities.some(
                      (w) =>
                        w.uid === u.uid ||
                        w.username.toLowerCase() === u.username.toLowerCase()
                    );
                  return (
                    <div
                      key={u.uid}
                      className="py-3 px-2 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50/80 transition-colors text-xs"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="font-semibold text-slate-900 flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-bold text-slate-900">
                            @{u.username}
                          </span>
                          <span className="text-slate-600">({u.displayName})</span>
                          {isMe && (
                            <span className="text-emerald-700 font-semibold">(You)</span>
                          )}
                          {isWipeAuth && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-[11px] font-semibold text-emerald-800">
                              <ShieldCheck className="w-3 h-3 text-emerald-600" />
                              <span>
                                {isPrimaryOwnerUser
                                  ? 'Primary Owner Authority'
                                  : 'Has Full Authority (Can Wipe & Grant)'}
                              </span>
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-slate-500 select-all">
                          UID: {u.uid}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            handleCopyUserIdentifier(u.username, `usr_${u.uid}`)
                          }
                          className="px-2.5 py-1 border border-slate-300 rounded-lg hover:bg-slate-100 text-slate-700 font-medium flex items-center gap-1"
                        >
                          {copiedDirectoryUid === `usr_${u.uid}` ? (
                            <Check className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          <span>
                            {copiedDirectoryUid === `usr_${u.uid}`
                              ? 'Copied @username'
                              : 'Copy @username'}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopyUserIdentifier(u.uid, `uid_${u.uid}`)}
                          className="px-2.5 py-1 border border-slate-300 rounded-lg hover:bg-slate-100 text-slate-700 font-mono flex items-center gap-1"
                        >
                          {copiedDirectoryUid === `uid_${u.uid}` ? (
                            <Check className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          <span>
                            {copiedDirectoryUid === `uid_${u.uid}`
                              ? 'Copied UID'
                              : 'Copy UID'}
                          </span>
                        </button>
                        {canWipeRooms && !isMe && !isPrimaryOwnerUser && (
                          <button
                            type="button"
                            disabled={grantBusy}
                            onClick={() =>
                              isWipeAuth
                                ? handleRevokeWipeAuthority(u.uid, u.displayName)
                                : handleGrantWipeAuthority(u)
                            }
                            className={`px-3 py-1 rounded-lg font-semibold transition-colors ${
                              isWipeAuth
                                ? 'border border-red-200 text-red-600 hover:bg-red-50'
                                : 'bg-slate-900 text-white hover:bg-slate-800'
                            }`}
                          >
                            {isWipeAuth ? 'Revoke Authority' : 'Give Same Authority'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ME & WORKSPACE AUTHORITY CONTROL CENTER (VISIBLE ON MAIN WEBSITE FOR OWNER + ALL AUTHORIZED USERS) */}
          <section
            id="me-settings"
            className="bg-white border border-slate-200 rounded-xl p-6 space-y-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <div className="space-y-1">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Settings className="w-4 h-4 text-slate-700" />
                  <span>05. Main Website Authority Control Center & Data Wipe</span>
                </h2>
                <p className="text-xs text-slate-500">
                  Manage who holds full authority on FundTracker, view all authorized users, inspect all rooms across the website, and wipe room data clean.
                </p>
              </div>
              <div className="text-xs text-slate-600 font-mono">
                @{userProfile.username} · Authority:{' '}
                <b className={canWipeRooms ? 'text-emerald-700' : 'text-slate-600'}>
                  {isSuperAdmin
                    ? 'Primary Owner (Full Authority)'
                    : canWipeRooms
                    ? 'Granted Full Authority (Same as Owner)'
                    : 'Standard Member (Locked)'}
                </b>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6 items-start">
              <div className="space-y-3">
                <div className="text-sm font-semibold text-slate-900">
                  Your Account Profile & Authority Status
                </div>
                <div className="text-xs text-slate-600 space-y-1.5">
                  <div>
                    Display Name: <b className="text-slate-900">{myUsername}</b>
                  </div>
                  <div>
                    Username: <b className="text-slate-900 font-mono">@{userProfile.username}</b>
                  </div>
                  <div>
                    Account UID:{' '}
                    <span className="font-mono text-slate-900 select-all">
                      {userProfile.uid}
                    </span>
                  </div>
                  <div>
                    Authority Level:{' '}
                    {canWipeRooms ? (
                      <b className="text-emerald-700">
                        {isSuperAdmin
                          ? `Primary Owner (${SUPER_ADMIN_EMAIL}) — Full Authority`
                          : 'Granted Same Authority as Owner — Can Wipe Rooms & Grant Authority'}
                      </b>
                    ) : (
                      <b className="text-slate-600">
                        Standard Member (Ask Owner or an Authorized User to grant you Authority)
                      </b>
                    )}
                  </div>
                </div>
              </div>

              {canWipeRooms ? (
                <div className="p-4 rounded-xl border border-red-200 bg-red-50/50 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <div className="text-sm font-bold text-red-900">
                        Clean Start — Wipe All Rooms & Ledger Data
                      </div>
                      <p className="text-xs text-red-800 leading-relaxed">
                        Authorized Access: Permanently deletes all {publicRooms.length}{' '}
                        {publicRooms.length === 1 ? 'room' : 'rooms'}, every financial ledger entry, and all room member rosters in Firestore.
                      </p>
                    </div>
                  </div>

                  {!confirmWipeAllRooms ? (
                    <button
                      type="button"
                      disabled={wipeBusy || publicRooms.length === 0}
                      onClick={() => setConfirmWipeAllRooms(true)}
                      className="w-full py-2 px-4 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>
                        Wipe All Rooms & Data ({publicRooms.length}{' '}
                        {publicRooms.length === 1 ? 'Room' : 'Rooms'})
                      </span>
                    </button>
                  ) : (
                    <div className="space-y-2 pt-1">
                      <div className="text-xs font-semibold text-red-900">
                        Confirm permanent deletion of all {publicRooms.length} rooms and their data?
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={wipeBusy}
                          onClick={handleWipeAllRoomsData}
                          className="flex-1 py-2 px-3 bg-red-700 hover:bg-red-800 text-white text-xs font-semibold rounded-lg transition-colors"
                        >
                          {wipeBusy ? 'Wiping All Data…' : 'Yes, Wipe Everything Clean'}
                        </button>
                        <button
                          type="button"
                          disabled={wipeBusy}
                          onClick={() => setConfirmWipeAllRooms(false)}
                          className="py-2 px-3 bg-white border border-slate-300 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    <Lock className="w-4 h-4 text-slate-600" />
                    <span>Wipe All Rooms — Restricted Authority</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Only the Primary Owner (<b>{SUPER_ADMIN_EMAIL}</b>) and teammates given the same Authority can wipe rooms or grant authority. Share your username (<b>@{userProfile.username}</b>) or UID (<b>{userProfile.uid}</b>) with the owner or an authorized member to receive authority.
                  </p>
                </div>
              )}
            </div>

            {/* VISIBLE TO EVERYONE: LIST OF ALL USERS GIVEN THE SAME AUTHORITY + AUTHORITY CONSOLE FOR AUTHORIZED USERS */}
            <div className="border-t border-slate-200 pt-6 space-y-5">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>
                    Users Given Full Authority ({wipeAuthorities.length + 1}) & Authority Console
                  </span>
                </h3>
                <p className="text-xs text-slate-500">
                  {canWipeRooms
                    ? 'You have Full Authority. You can grant the exact same authority to any registered username below, and anyone you authorize can also grant authority and manage/wipe all rooms.'
                    : 'List of accounts holding Full Authority to manage/wipe rooms and grant authority on FundTracker.'}
                </p>
              </div>

              {canWipeRooms && (
                <form onSubmit={handleGrantByInput} className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    value={grantIdentifier}
                    onChange={(e) => setGrantIdentifier(e.target.value)}
                    placeholder="Enter any @username or UID to give them the same authority…"
                    className="flex-1 min-w-[240px] border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                  <button
                    type="submit"
                    disabled={grantBusy}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
                  >
                    {grantBusy ? 'Updating Authority…' : 'Give Same Authority'}
                  </button>
                </form>
              )}

              <div className="grid md:grid-cols-2 gap-6">
                {/* Roster of Everyone Given the Same Authority */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-700">
                    All Accounts With Full Authority ({wipeAuthorities.length + 1})
                  </div>
                  <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg bg-slate-50/50 max-h-72 overflow-y-auto">
                    <div className="p-3 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-semibold text-slate-900">
                          Primary Owner ({SUPER_ADMIN_EMAIL})
                        </div>
                        <div className="text-slate-500">
                          Permanent Full Authority · Can Wipe Rooms & Grant Authority
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">
                        Owner
                      </span>
                    </div>
                    {wipeAuthorities.map((wa) => (
                      <div
                        key={wa.uid}
                        className="p-3 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 truncate">
                            @{wa.username} ({wa.displayName})
                          </div>
                          <div className="text-slate-500 font-mono truncate">
                            UID: {wa.uid} · Granted by: {wa.grantedByEmail}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold whitespace-nowrap">
                            Same Authority
                          </span>
                          {canWipeRooms && wa.uid !== userProfile.uid && (
                            <button
                              type="button"
                              disabled={grantBusy}
                              onClick={() =>
                                handleRevokeWipeAuthority(wa.uid, wa.displayName)
                              }
                              className="px-2.5 py-1 bg-white border border-red-200 text-red-600 hover:bg-red-50 rounded font-medium whitespace-nowrap"
                            >
                              Revoke
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Quick-Grant from All Registered Usernames */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-700">
                    All Registered Usernames ({allUsersDirectory.length}) — Quick Authority Access
                  </div>
                  <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg max-h-72 overflow-y-auto">
                    {allUsersDirectory.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-400">
                        No registered user profiles found.
                      </div>
                    ) : (
                      allUsersDirectory.map((u) => {
                        const isPrimaryOwnerUser =
                          u.username.toLowerCase() === 'franzatuel' ||
                          u.username.toLowerCase().includes('franz') ||
                          u.uid === 'aMVdQVuMuYMISlIcFuafEA8l8v53';
                        const isAlreadyAuthorized =
                          isPrimaryOwnerUser ||
                          wipeAuthorities.some(
                            (w) =>
                              w.uid === u.uid ||
                              w.username.toLowerCase() === u.username.toLowerCase()
                          );
                        const isSelf = u.uid === userProfile.uid;
                        return (
                          <div
                            key={u.uid}
                            className="p-2.5 flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-900 truncate">
                                <span className="font-mono font-bold">@{u.username}</span> ({u.displayName}){' '}
                                {isSelf ? '(You)' : ''}
                              </div>
                              <div className="text-slate-400 font-mono truncate">
                                UID: {u.uid}
                              </div>
                            </div>
                            {isPrimaryOwnerUser ? (
                              <span className="text-emerald-700 font-semibold">Owner</span>
                            ) : isAlreadyAuthorized ? (
                              <div className="flex items-center gap-1.5">
                                <span className="text-emerald-700 font-semibold">Authorized</span>
                                {canWipeRooms && !isSelf && (
                                  <button
                                    type="button"
                                    disabled={grantBusy}
                                    onClick={() =>
                                      handleRevokeWipeAuthority(u.uid, u.displayName)
                                    }
                                    className="px-2.5 py-1 border border-red-200 text-red-600 hover:bg-red-50 rounded font-medium whitespace-nowrap"
                                  >
                                    Revoke
                                  </button>
                                )}
                              </div>
                            ) : canWipeRooms ? (
                              <button
                                type="button"
                                disabled={grantBusy}
                                onClick={() => handleGrantWipeAuthority(u)}
                                className="px-2.5 py-1 bg-slate-900 text-white hover:bg-slate-800 rounded font-semibold whitespace-nowrap"
                              >
                                Give Same Authority
                              </button>
                            ) : (
                              <span className="text-slate-400">Member</span>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* ALL WEBSITE ROOMS AUTHORITY OVERVIEW (VISIBLE TO OWNER & THOSE GIVEN THE SAME AUTHORITY) */}
              {canWipeRooms && (
                <div className="border-t border-slate-200 pt-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                        All FundTracker Website Rooms — Authority Management ({publicRooms.length})
                      </h4>
                      <p className="text-xs text-slate-500">
                        Visible to you and everyone given the same authority so you can inspect, open, or delete any room on the website.
                      </p>
                    </div>
                  </div>
                  {publicRooms.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
                      No rooms currently exist in the database.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg max-h-60 overflow-y-auto">
                      {publicRooms.map((r) => (
                        <div
                          key={r.id}
                          className="p-3 flex flex-wrap items-center justify-between gap-3 text-xs hover:bg-slate-50"
                        >
                          <div>
                            <div className="font-semibold text-slate-900">
                              {r.name}{' '}
                              <span className="font-mono text-slate-500">(ID: {r.id})</span>
                            </div>
                            <div className="text-slate-500">
                              Treasurer: {r.treasurerName || 'Vacant'} · Auditor:{' '}
                              {r.auditorName || 'Vacant'} · Currency: {r.currency}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => navigateToRoom(r.id)}
                              className="px-2.5 py-1 bg-slate-900 text-white rounded font-medium hover:bg-slate-800"
                            >
                              Open Room
                            </button>
                            <button
                              type="button"
                              disabled={wipeBusy}
                              onClick={() => handleDeleteSpecificRoom(r.id)}
                              className="px-2.5 py-1 border border-red-200 text-red-600 rounded font-medium hover:bg-red-50 flex items-center gap-1"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Delete</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        </main>

        <footer className="border-t border-slate-200 bg-white px-6 py-4 text-xs text-slate-500 flex items-center justify-between">
          <span>FundTracker Ledger</span>
          <span>Signed in as {myUsername}</span>
        </footer>
      </div>
    );
  }

  if (roomLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-sm font-medium text-slate-500">Loading room ledger…</div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-md w-full text-center space-y-4">
          <h2 className="text-lg font-bold text-slate-900">Room Not Found</h2>
          <p className="text-xs text-slate-500">
            The room ID <span className="font-mono">{roomId}</span> does not exist or was wiped.
          </p>
          <button
            type="button"
            onClick={() => navigateToRoom(null)}
            className="px-4 py-2 bg-slate-900 text-white text-xs font-medium rounded-lg"
          >
            Return to Room Workspace
          </button>
        </div>
      </div>
    );
  }

  // If user hasn't picked a role in this room yet, show the 3-POV Selection Gate
  const treasurerTakenByOther = Boolean(
    room.treasurerId && room.treasurerId !== currentUid
  );
  const auditorTakenByOther = Boolean(room.auditorId && room.auditorId !== currentUid);

  if (!myRole) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 max-w-lg w-full space-y-6">
          <div className="space-y-1">
            <p className="text-xs text-slate-500 font-mono">
              Room: {room.name} ({room.id})
            </p>
            <h2 className="text-xl font-bold text-slate-900">
              Request Room Access & Select Your POV
            </h2>
            <p className="text-xs text-slate-500">
              Select your role below. If a Treasurer or Auditor is already managing this room, your join request will be sent to them for instant verification.
            </p>
          </div>

          <div className="space-y-3">
            {/* Treasurer Option */}
            <button
              type="button"
              disabled={treasurerTakenByOther}
              onClick={() => handleSelectRole('treasurer')}
              className="w-full p-4 rounded-xl border border-slate-200 hover:border-slate-900 text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-start gap-3"
            >
              <Wallet className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="text-sm font-semibold text-slate-900">Treasurer POV</div>
                <div className="text-xs text-slate-500">
                  {treasurerTakenByOther
                    ? `Currently assigned to ${room.treasurerName || 'another member'}`
                    : 'Claim vacant Treasurer seat: Manage funds, modify expenses, and approve members.'}
                </div>
              </div>
            </button>

            {/* Auditor Option */}
            <button
              type="button"
              disabled={auditorTakenByOther}
              onClick={() => handleSelectRole('auditor')}
              className="w-full p-4 rounded-xl border border-slate-200 hover:border-slate-900 text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-start gap-3"
            >
              <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="text-sm font-semibold text-slate-900">Auditor POV</div>
                <div className="text-xs text-slate-500">
                  {auditorTakenByOther
                    ? `Currently assigned to ${room.auditorName || 'another member'}`
                    : 'Claim vacant Auditor seat: Verify expenses, approve members, and edit expenses when authorized.'}
                </div>
              </div>
            </button>

            {/* Student Option */}
            <button
              type="button"
              onClick={() => handleSelectRole('student')}
              className="w-full p-4 rounded-xl border border-slate-200 hover:border-slate-900 text-left transition-colors flex items-start gap-3"
            >
              <GraduationCap className="w-5 h-5 text-slate-700 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="text-sm font-semibold text-slate-900">
                  Request Student POV Access
                </div>
                <div className="text-xs text-slate-500">
                  Send a join request to the Room Treasurer ({room.treasurerName || 'Vacant'}) or Auditor ({room.auditorName || 'Vacant'}) to monitor the dashboard and view your contribution reports.
                </div>
              </div>
            </button>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Signed in as {myUsername}</span>
            <button
              type="button"
              onClick={() => navigateToRoom(null)}
              className="text-slate-700 hover:underline font-medium"
            >
              Return to My Joined Rooms
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Verification Popup / Waiting Gate: Shown until the Room Treasurer or Auditor approves the user's membership
  if (!isApprovedInRoom) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 max-w-lg w-full space-y-6">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 shrink-0">
              <Clock className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-mono text-slate-500">
                Room: {room.name} (ID: {room.id})
              </p>
              <h2 className="text-xl font-bold text-slate-900">
                Waiting for Treasurer or Auditor to Add You
              </h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                Your request to join <b>{room.name}</b> as <b>{myUsername}</b> ({myRole} POV) has been sent. This page will automatically unlock in real time as soon as the Room Treasurer or Auditor approves your request.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Your Account Name</span>
              <span className="font-semibold text-slate-900">{myUsername}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Your Account UID (Share with Treasurer)</span>
              <span className="font-mono text-slate-800 select-all">{userProfile.uid}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Room Treasurer</span>
              <span className="font-semibold text-slate-900">
                {room.treasurerName || 'Vacant'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Room Auditor</span>
              <span className="font-semibold text-slate-900">
                {room.auditorName || 'Vacant'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Verification Status</span>
              <span className="font-semibold text-amber-700 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                <span>Pending Treasurer / Auditor Approval</span>
              </span>
            </div>
          </div>

          {/* Wait for Treasurer/Auditor Approval Gate: Students wait for approval; Officers only claim when no role was chosen */}
          {!myRole && (!treasurerTakenByOther || !auditorTakenByOther) && (
            <div className="p-4 rounded-xl border border-slate-200 space-y-2.5">
              <div className="text-xs font-semibold text-slate-800">
                Officer Seat Available in This Room:
              </div>
              <div className="flex flex-wrap gap-2">
                {!treasurerTakenByOther && (
                  <button
                    type="button"
                    onClick={() => handleSelectRole('treasurer')}
                    className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800"
                  >
                    Claim Vacant Treasurer Seat
                  </button>
                )}
                {!auditorTakenByOther && (
                  <button
                    type="button"
                    onClick={() => handleSelectRole('auditor')}
                    className="px-3 py-1.5 text-xs font-medium bg-white border border-slate-300 text-slate-800 rounded-lg hover:bg-slate-50"
                  >
                    Claim Vacant Auditor Seat
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <button
              type="button"
              onClick={() => navigateToRoom(null)}
              className="px-4 py-2 text-xs font-medium bg-white border border-slate-300 text-slate-800 rounded-lg hover:bg-slate-50"
            >
              Back to My Joined Rooms
            </button>
            <span className="text-xs text-slate-400">Live listening for approval…</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Bar Contract: 3 Zones */}
      <header className="flex items-center justify-between px-6 py-3.5 bg-white border-b border-slate-200 sticky top-0 z-20">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigateToRoom(null);
          }}
          className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap"
        >
          FundTracker Ledger
        </a>

        {/* Zone 2: 5 clean navigation links including "Me" settings */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap ${
              activeTab === 'dashboard'
                ? 'text-slate-900 underline underline-offset-8 decoration-2'
                : ''
            }`}
          >
            Calendar & Ledger
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('verification')}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap ${
              activeTab === 'verification'
                ? 'text-slate-900 underline underline-offset-8 decoration-2'
                : ''
            }`}
          >
            Audit ({verifiedCount}/{entries.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('student_reports')}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap ${
              activeTab === 'student_reports'
                ? 'text-slate-900 underline underline-offset-8 decoration-2'
                : ''
            }`}
          >
            My Contributions ({myContributions.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('governance')}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap ${
              activeTab === 'governance'
                ? 'text-slate-900 underline underline-offset-8 decoration-2'
                : ''
            }`}
          >
            Roles & Approvals{pendingMembers.length > 0 ? ` (${pendingMembers.length})` : ''}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('me_settings')}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap ${
              activeTab === 'me_settings'
                ? 'text-slate-900 underline underline-offset-8 decoration-2'
                : ''
            }`}
          >
            Me
          </button>
        </nav>

        {/* Zone 3: 2 primary actions */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleCopyInvite}
            className="px-3 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap flex items-center gap-1.5"
          >
            {copiedLink ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            <span>{copiedLink ? 'Link Copied' : 'Invite Link'}</span>
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap flex items-center gap-1"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* Contextual Subbar: Room Metadata, Read-Only POV Viewer Tab (for Treasurer/Auditor) & Student Locked Indicator */}
      <div className="bg-white border-b border-slate-200 px-6 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          {/* Unboxed Metadata with typographic separators */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span className="font-semibold text-slate-900">{room.name}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">Room ID: {room.id}</span>
            <span aria-hidden="true">·</span>
            <span>
              User: <b className="text-slate-900">{myUsername}</b>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Assigned Role: <b className="text-slate-900 capitalize">{myRole}</b>
            </span>
            {!isStudent && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  Viewing POV:{' '}
                  <b className="text-emerald-700 capitalize">
                    {activeViewedPov}
                    {isPreviewingOtherPov ? ' (View Only — Role Not Transferred)' : ''}
                  </b>
                </span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span>
              Auditor Edit Access:{' '}
              <b
                className={
                  room.auditorCanModify ? 'text-emerald-700' : 'text-slate-600'
                }
              >
                {room.auditorCanModify
                  ? 'Authorized by Treasurer'
                  : 'Verify-Only (Locked)'}
              </b>
            </span>
          </div>

          {/* POV Viewer Tab (ONLY for Treasurer/Auditor to VIEW without transferring role; Students are locked to Student View Only) */}
          <div className="flex flex-wrap items-center gap-3">
            {isTreasurer && activeViewedPov === 'treasurer' && (
              <button
                type="button"
                onClick={handleToggleAuditorAuth}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                  room.auditorCanModify
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100'
                    : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {room.auditorCanModify ? (
                  <>
                    <Unlock className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Auditor Authorized to Edit (Revoke)</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5 text-slate-600" />
                    <span>Authorize Auditor to Modify Expenses</span>
                  </>
                )}
              </button>
            )}

            {isStudent ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-xs font-medium text-slate-700">
                <GraduationCap className="w-3.5 h-3.5 text-slate-600" />
                <span>Student POV (View-Only — Other POVs Locked)</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium text-slate-500 whitespace-nowrap">
                  POV Viewer (View Only · Does Not Transfer Role):
                </span>
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setViewedPov('treasurer')}
                    title="Preview Treasurer POV (Does not transfer your role)"
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      activeViewedPov === 'treasurer'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {myRole === 'treasurer' ? 'Treasurer POV (My Role)' : 'View Treasurer POV'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewedPov('auditor')}
                    title="Preview Auditor POV (Does not transfer your role)"
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      activeViewedPov === 'auditor'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {myRole === 'auditor' ? 'Auditor POV (My Role)' : 'View Auditor POV'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewedPov('student')}
                    title="Preview Student POV (Does not transfer your role)"
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      activeViewedPov === 'student'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    View Student POV
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Tab Selector */}
      <div className="md:hidden bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-1 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('dashboard')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap ${
            activeTab === 'dashboard' ? 'bg-slate-900 text-white' : 'text-slate-600'
          }`}
        >
          Calendar & Ledger
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('verification')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap ${
            activeTab === 'verification' ? 'bg-slate-900 text-white' : 'text-slate-600'
          }`}
        >
          Audit ({verifiedCount}/{entries.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('student_reports')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap ${
            activeTab === 'student_reports' ? 'bg-slate-900 text-white' : 'text-slate-600'
          }`}
        >
          My Contributions
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('governance')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap ${
            activeTab === 'governance' ? 'bg-slate-900 text-white' : 'text-slate-600'
          }`}
        >
          Roles
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('me_settings')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap ${
            activeTab === 'me_settings' ? 'bg-slate-900 text-white' : 'text-slate-600'
          }`}
        >
          Me
        </button>
      </div>

      {/* Main Content Container */}
      <main className="max-w-7xl w-full mx-auto px-6 py-6 space-y-6 flex-1">
        {wipeStatusMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center justify-between">
            <span>{wipeStatusMsg}</span>
            <button
              type="button"
              onClick={() => setWipeStatusMsg('')}
              className="text-emerald-700 hover:underline ml-4"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Top KPI Strip (Single-Elevation, Tabular Numerals) */}
        <section className="bg-white border border-slate-200 rounded-xl grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
          <div className="p-4 sm:p-5 space-y-1">
            <div className="text-xs text-slate-500">Net Fund Balance</div>
            <div
              className={`text-2xl font-bold font-mono tabular-nums ${
                netBalance < 0 ? 'text-red-600' : 'text-slate-900'
              }`}
            >
              {fmtMoney(symbol, netBalance)}
            </div>
            <div className="text-xs text-slate-400">
              All-time across {entries.length} entries
            </div>
          </div>

          <div className="p-4 sm:p-5 space-y-1">
            <div className="text-xs text-slate-500">Total Funds & Contributions</div>
            <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700">
              +{fmtMoney(symbol, totalFundsAdded)}
            </div>
            <div className="text-xs text-slate-400">
              {entries.filter((e) => e.type === 'add').length} inflows recorded
            </div>
          </div>

          <div className="p-4 sm:p-5 space-y-1">
            <div className="text-xs text-slate-500">Total Expenses Disbursed</div>
            <div className="text-2xl font-bold font-mono tabular-nums text-red-600">
              -{fmtMoney(symbol, totalExpenses)}
            </div>
            <div className="text-xs text-slate-400">
              {entries.filter((e) => e.type === 'subtract').length} expenses logged
            </div>
          </div>

          <div className="p-4 sm:p-5 space-y-1">
            <div className="text-xs text-slate-500">Audit Verification Status</div>
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {verifiedCount} / {entries.length}
            </div>
            <div className="text-xs text-slate-500">
              {flaggedCount > 0 ? (
                <span className="text-amber-700 font-medium">
                  {flaggedCount} flagged for review
                </span>
              ) : (
                <span className="text-emerald-700">0 flagged discrepancies</span>
              )}
            </div>
          </div>
        </section>

        {/* POV Status Banner */}
        <section className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-0.5">
            <div className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              {activeViewedPov === 'treasurer' && (
                <Wallet className="w-4 h-4 text-emerald-600" />
              )}
              {activeViewedPov === 'auditor' && (
                <ShieldCheck className="w-4 h-4 text-amber-600" />
              )}
              {activeViewedPov === 'student' && (
                <GraduationCap className="w-4 h-4 text-slate-700" />
              )}
              <span>
                {activeViewedPov === 'treasurer' &&
                  (isTreasurer
                    ? 'Treasurer Point of View — Full Fund & Expense Management Authority'
                    : `Viewing Treasurer Point of View (Read-Only Preview · Your Role Remains ${myRole?.toUpperCase()})`)}
                {activeViewedPov === 'auditor' &&
                  (isAuditor
                    ? room.auditorCanModify
                      ? 'Auditor Point of View — Verification Authority + Treasurer-Authorized Expense Modification'
                      : 'Auditor Point of View — Verification & Flagging Mode (Expense Modification Locked by Treasurer)'
                    : `Viewing Auditor Point of View (Read-Only Preview · Your Role Remains ${myRole?.toUpperCase()})`)}
                {activeViewedPov === 'student' &&
                  (isStudent
                    ? 'Student Point of View — Read-Only Dashboard Monitoring & Personal Contribution Reports'
                    : `Viewing Student Point of View (Read-Only Preview · Your Role Remains ${myRole?.toUpperCase()})`)}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              {isPreviewingOtherPov && (
                <span className="text-emerald-700 font-medium">
                  POV Viewer Mode Active: You are inspecting the {activeViewedPov} perspective without transferring or losing your assigned {myRole} seat.{' '}
                </span>
              )}
              {activeViewedPov === 'treasurer' &&
                (isTreasurer
                  ? 'You can add, edit, or delete any fund contribution or expense, change the room currency, and grant or revoke expense modification rights for the Auditor.'
                  : 'Previewing how the Room Treasurer sees the workspace. Your Auditor role is preserved.')}
              {activeViewedPov === 'auditor' &&
                (isAuditor
                  ? room.auditorCanModify
                    ? 'The Treasurer has authorized you to add, edit, and delete expenses in addition to verifying and flagging ledger entries.'
                    : 'You can verify any entry or flag discrepancies with audit notes. Ask the Treasurer to click "Authorize Auditor to Modify Expenses" if you need to add or edit expenses.'
                  : 'Previewing how the Room Auditor sees the verification controls. Your Treasurer role is preserved.')}
              {activeViewedPov === 'student' &&
                (isStudent
                  ? 'You have read-only access to monitor all class funds and expenses in real time. Students cannot switch to Treasurer or Auditor POVs.'
                  : 'Previewing how Students view this room (read-only ledger monitoring and personal contribution reports).')}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {isPreviewingOtherPov && myRole && (
              <button
                type="button"
                onClick={() => setViewedPov(myRole)}
                className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap"
              >
                Return to My {myRole === 'treasurer' ? 'Treasurer' : 'Auditor'} POV
              </button>
            )}
            {isTreasurer && activeViewedPov === 'treasurer' && (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-500">Currency:</span>
                <select
                  value={symbol}
                  onChange={(e) => handleCurrencyChange(e.target.value as CurrencySymbol)}
                  className="border border-slate-300 rounded-lg px-2 py-1 text-xs font-medium bg-white"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {activeViewedPov === 'student' && (
              <button
                type="button"
                onClick={() => setActiveTab('student_reports')}
                className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>View My Contributions Report</span>
              </button>
            )}
          </div>
        </section>

        {/* TAB 1: CALENDAR & LEDGER DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div className="grid lg:grid-cols-12 gap-6 items-start">
            {/* Left 7 Columns: Calendar + Entry Form (if Treasurer or Authorized Auditor) */}
            <div className="lg:col-span-7 space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-slate-600" />
                    <h2 className="text-base font-bold text-slate-900">
                      {month.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
                    </h2>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setMonth((d) => {
                          const n = new Date(d);
                          n.setMonth(n.getMonth() - 1);
                          return n;
                        })
                      }
                      className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50"
                      aria-label="Previous month"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        now.setDate(1);
                        setMonth(now);
                        setSelectedDate(null);
                      }}
                      className="px-2.5 py-1 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50"
                    >
                      This Month
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setMonth((d) => {
                          const n = new Date(d);
                          n.setMonth(n.getMonth() + 1);
                          return n;
                        })
                      }
                      className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50"
                      aria-label="Next month"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <MonthCalendar
                  month={month}
                  entries={entries}
                  selectedDate={selectedDate}
                  onSelectDate={setSelectedDate}
                  symbol={symbol}
                />

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
                  <span>
                    Click any calendar date to filter transactions or prefill the entry date.
                  </span>
                  <span>
                    Checkmark = All items verified by Auditor · Flag = Audit attention needed
                  </span>
                </div>
              </div>

              {/* Fund & Expense Modification Form (Strictly for Treasurer OR Authorized Auditor) */}
              {canModifyExpenses ? (
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        {editingEntryId
                          ? 'Modify Existing Ledger Entry'
                          : 'Record Fund Contribution or Expense'}
                      </h3>
                      <p className="text-xs text-slate-500">
                        {isTreasurer
                          ? 'Logging as Room Treasurer'
                          : 'Logging as Auditor (Authorized by Treasurer)'}
                      </p>
                    </div>
                    {editingEntryId && (
                      <button
                        type="button"
                        onClick={cancelEditEntry}
                        className="text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Cancel Edit</span>
                      </button>
                    )}
                  </div>

                  <form onSubmit={handleSaveEntry} className="space-y-4">
                    <div className="grid sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Entry Title / Description
                        </label>
                        <input
                          type="text"
                          required
                          maxLength={120}
                          value={entryTitle}
                          onChange={(e) => setEntryTitle(e.target.value)}
                          placeholder="e.g. Semester Membership Contribution or Venue Deposit"
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Entry Date
                        </label>
                        <input
                          type="date"
                          required
                          value={entryDate}
                          onChange={(e) => setEntryDate(e.target.value)}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-900"
                        />
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Transaction Type
                        </label>
                        <select
                          value={entryType}
                          onChange={(e) => setEntryType(e.target.value as 'add' | 'subtract')}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                        >
                          <option value="add">Fund Addition / Contribution (+)</option>
                          <option value="subtract">Expense / Disbursement (-)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Amount ({symbol})
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          required
                          value={entryAmount}
                          onChange={(e) => setEntryAmount(e.target.value)}
                          placeholder="0.00"
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-900"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Category
                        </label>
                        <select
                          value={entryCategory}
                          onChange={(e) => setEntryCategory(e.target.value)}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                        >
                          {CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Assign to Student / Member (for Student Contribution Report)
                        </label>
                        <select
                          value={entryContributorUid}
                          onChange={(e) => {
                            const uid = e.target.value;
                            setEntryContributorUid(uid);
                            const m = members.find((x) => x.uid === uid);
                            if (m) setEntryContributorName(m.username);
                          }}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                        >
                          <option value="">Custom Name / General Organization</option>
                          {members.map((m) => (
                            <option key={m.uid} value={m.uid}>
                              {m.username} ({m.role})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Contributor / Payee Name
                        </label>
                        <input
                          type="text"
                          maxLength={80}
                          value={entryContributorName}
                          onChange={(e) => setEntryContributorName(e.target.value)}
                          placeholder={myUsername}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Reference Note / Receipt Number (Optional)
                      </label>
                      <input
                        type="text"
                        maxLength={300}
                        value={entryNote}
                        onChange={(e) => setEntryNote(e.target.value)}
                        placeholder="e.g. Official Receipt #10482 · Paid via GCash"
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                      />
                    </div>

                    {entryError && <div className="text-xs text-red-600">{entryError}</div>}

                    <button
                      type="submit"
                      disabled={entryBusy}
                      className="w-full flex items-center justify-center gap-1.5 py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-medium text-sm rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
                    >
                      <Plus className="w-4 h-4" />
                      <span>
                        {entryBusy
                          ? 'Saving…'
                          : editingEntryId
                          ? 'Update Ledger Entry'
                          : 'Save Entry to FundTracker'}
                      </span>
                    </button>
                  </form>
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                      <Lock className="w-4 h-4 text-slate-500" />
                      <span>
                        {isPreviewingOtherPov
                          ? `Viewing ${activeViewedPov.toUpperCase()} POV (Preview Mode — Role Not Transferred)`
                          : isAuditor
                          ? 'Expense Modification Requires Treasurer Authorization'
                          : 'Read-Only Student Dashboard Mode'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      {isPreviewingOtherPov
                        ? `You are viewing the ${activeViewedPov} perspective in read-only preview mode. Switch the POV Viewer tab back to "${myRole} POV (My Role)" to use your ${myRole} controls.`
                        : isAuditor
                        ? 'As Auditor, you can verify and flag any entry on the right. Once the Treasurer enables "Authorize Auditor to Modify Expenses", the expense editor will unlock here automatically.'
                        : 'Students have view-only access and cannot switch to Treasurer or Auditor POVs. You can inspect every entry on the right or view your personal contribution report.'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Right 5 Columns: Live Ledger Stream with Verification & Edit Controls */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {selectedDate ? `Entries on ${selectedDate}` : 'Monthly Ledger Entries'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {filteredEntries.length}{' '}
                    {filteredEntries.length === 1 ? 'record' : 'records'} shown
                    {selectedDate && (
                      <button
                        type="button"
                        onClick={() => setSelectedDate(null)}
                        className="ml-2 text-slate-900 underline"
                      >
                        Clear date filter
                      </button>
                    )}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    exportToCsv(filteredEntries, `fundtracker_${room.id}_ledger.csv`)
                  }
                  className="px-2.5 py-1.5 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1 whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export CSV</span>
                </button>
              </div>

              {/* Search & Segmented Filter Controls */}
              <div className="space-y-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Filter by title, student contributor, category…"
                    className="w-full border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
                  {(
                    [
                      ['all', 'All'],
                      ['add', 'Funds (+)'],
                      ['subtract', 'Expenses (-)'],
                      ['verified', 'Verified'],
                      ['unverified', 'Unverified'],
                      ['flagged', 'Flagged'],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setFilterType(key)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                        filterType === key
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Entries List */}
              <div className="divide-y divide-slate-200 max-h-[600px] overflow-y-auto pr-1">
                {filteredEntries.length === 0 ? (
                  <div className="py-10 text-center space-y-1">
                    <div className="text-xs font-medium text-slate-500">
                      No matching ledger entries found.
                    </div>
                    <div className="text-xs text-slate-400">
                      {canModifyExpenses
                        ? 'Use the form on the left to record a fund contribution or expense.'
                        : 'Entries added by the Treasurer will appear here in real time.'}
                    </div>
                  </div>
                ) : (
                  filteredEntries.map((entry) => (
                    <div key={entry.id} className="py-3.5 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-0.5">
                          <div className="text-sm font-semibold text-slate-900 truncate">
                            {entry.title}
                          </div>
                          {/* Unboxed static metadata with typographic separators */}
                          <div className="text-xs text-slate-500 flex flex-wrap items-center gap-1.5">
                            <span className="font-mono">{entry.entryDate}</span>
                            <span aria-hidden="true">·</span>
                            <span>{entry.category}</span>
                            {entry.contributorName && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>By: {entry.contributorName}</span>
                              </>
                            )}
                          </div>
                          {entry.note && (
                            <div className="text-xs text-slate-600">{entry.note}</div>
                          )}
                        </div>

                        <div className="text-right shrink-0 space-y-1">
                          <div
                            className={`font-mono text-sm font-semibold tabular-nums ${
                              entry.type === 'subtract' ? 'text-red-600' : 'text-emerald-700'
                            }`}
                          >
                            {entry.type === 'subtract' ? '-' : '+'}
                            {fmtMoney(symbol, entry.amount)}
                          </div>

                          {/* Status Text with Icon (Never color alone, no static pill boxes) */}
                          <div className="text-[11px] flex items-center justify-end gap-1">
                            {entry.flagged ? (
                              <span className="text-amber-700 font-medium flex items-center gap-1">
                                <Flag className="w-3 h-3" />
                                <span>Flagged by Auditor</span>
                              </span>
                            ) : entry.verified ? (
                              <span className="text-emerald-700 font-medium flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Verified ({entry.verifiedByName || 'Auditor'})</span>
                              </span>
                            ) : (
                              <span className="text-slate-400">Pending Audit</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {entry.auditNote && (
                        <div className="text-xs text-amber-900 bg-amber-50/70 border-l-2 border-amber-500 pl-2.5 py-1">
                          Auditor Note: {entry.auditNote}
                        </div>
                      )}

                      {/* Action Bar for Treasurer & Auditor */}
                      {(canModifyExpenses || canVerifyEntries) && (
                        <div className="pt-1 flex flex-wrap items-center justify-between gap-2">
                          {/* Auditor Verification Controls */}
                          {canVerifyEntries ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleAuditorVerify(entry, !entry.verified)}
                                className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap flex items-center gap-1 ${
                                  entry.verified
                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                <span>{entry.verified ? 'Verified' : 'Verify Entry'}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleAuditorFlag(entry, !entry.flagged)}
                                className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap flex items-center gap-1 ${
                                  entry.flagged
                                    ? 'bg-amber-50 border-amber-300 text-amber-800'
                                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                <Flag className="w-3 h-3" />
                                <span>{entry.flagged ? 'Flagged' : 'Flag Issue'}</span>
                              </button>

                              <input
                                type="text"
                                maxLength={300}
                                value={
                                  auditNotesDraft[entry.id] !== undefined
                                    ? auditNotesDraft[entry.id]
                                    : entry.auditNote
                                }
                                onChange={(e) =>
                                  setAuditNotesDraft((prev) => ({
                                    ...prev,
                                    [entry.id]: e.target.value,
                                  }))
                                }
                                onBlur={() => handleSaveAuditNote(entry)}
                                placeholder="Add audit note…"
                                className="border border-slate-200 rounded-md px-2 py-1 text-xs w-36 focus:outline-none focus:ring-1 focus:ring-slate-900"
                              />
                            </div>
                          ) : (
                            <div />
                          )}

                          {/* Expense Modification Controls (Treasurer OR Authorized Auditor) */}
                          {canModifyExpenses && (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => startEditEntry(entry)}
                                className="text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1"
                              >
                                <Edit3 className="w-3 h-3" />
                                <span>Modify</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteEntry(entry.id)}
                                className="text-xs text-red-600 hover:text-red-700 flex items-center gap-1"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Delete</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: AUDIT & VERIFICATION CONSOLE */}
        {activeTab === 'verification' && (
          <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Audit & Expense Verification Ledger
                </h2>
                <p className="text-xs text-slate-500">
                  {canVerifyEntries
                    ? 'You are signed in as the Room Auditor. Verify legitimate entries or flag items requiring receipt clarification.'
                    : 'Live verification log maintained by the Room Auditor.'}
                </p>
              </div>
              <div className="text-xs text-slate-600 flex items-center gap-3">
                <span>
                  Auditor: <b className="text-slate-900">{room.auditorName || 'Unassigned'}</b>
                </span>
                <span>·</span>
                <span>
                  Modification Rights:{' '}
                  <b
                    className={
                      room.auditorCanModify ? 'text-emerald-700' : 'text-slate-600'
                    }
                  >
                    {room.auditorCanModify ? 'Granted by Treasurer' : 'Verification Only'}
                  </b>
                </span>
              </div>
            </div>

            <div className="overflow-x-auto border-t border-slate-200">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <th className="py-3 pr-4">Date</th>
                    <th className="py-3 px-4">Title & Category</th>
                    <th className="py-3 px-4">Contributor / Logged By</th>
                    <th className="py-3 px-4 text-right">Amount</th>
                    <th className="py-3 px-4">Verification Status</th>
                    <th className="py-3 pl-4 text-right">Audit & Edit Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {entries.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        No transactions recorded in this room yet.
                      </td>
                    </tr>
                  ) : (
                    entries.map((entry) => (
                      <tr key={entry.id} className="hover:bg-slate-50/80">
                        <td className="py-3 pr-4 font-mono whitespace-nowrap text-slate-600">
                          {entry.entryDate}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{entry.title}</div>
                          <div className="text-slate-500">
                            {entry.category}
                            {entry.note ? ` · ${entry.note}` : ''}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          <div>{entry.contributorName || 'General'}</div>
                          <div className="text-slate-400">
                            Modified by {entry.lastModifiedByName}
                          </div>
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-mono font-semibold tabular-nums whitespace-nowrap ${
                            entry.type === 'subtract' ? 'text-red-600' : 'text-emerald-700'
                          }`}
                        >
                          {entry.type === 'subtract' ? '-' : '+'}
                          {fmtMoney(symbol, entry.amount)}
                        </td>
                        <td className="py-3 px-4">
                          {entry.flagged ? (
                            <div className="text-amber-700 font-medium flex items-center gap-1">
                              <Flag className="w-3.5 h-3.5" />
                              <span>Flagged: {entry.auditNote || 'Needs review'}</span>
                            </div>
                          ) : entry.verified ? (
                            <div className="text-emerald-700 font-medium flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Verified by {entry.verifiedByName || 'Auditor'}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400">Unverified</span>
                          )}
                        </td>
                        <td className="py-3 pl-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            {canVerifyEntries && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleAuditorVerify(entry, !entry.verified)}
                                  className="px-2.5 py-1 rounded border border-slate-300 hover:bg-slate-100 text-slate-800 font-medium"
                                >
                                  {entry.verified ? 'Unverify' : 'Verify'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleAuditorFlag(entry, !entry.flagged)}
                                  className="px-2.5 py-1 rounded border border-slate-300 hover:bg-slate-100 text-amber-800 font-medium"
                                >
                                  {entry.flagged ? 'Clear Flag' : 'Flag'}
                                </button>
                              </>
                            )}
                            {canModifyExpenses && (
                              <button
                                type="button"
                                onClick={() => startEditEntry(entry)}
                                className="px-2.5 py-1 rounded bg-slate-900 text-white hover:bg-slate-800 font-medium"
                              >
                                Modify
                              </button>
                            )}
                            {!canVerifyEntries && !canModifyExpenses && (
                              <span className="text-slate-400">Read-only</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* TAB 3: STUDENT PERSONAL CONTRIBUTIONS REPORT */}
        {activeTab === 'student_reports' && (
          <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-lg font-bold text-slate-900">
                  Personal Contributions Report — {myUsername}
                </h2>
                <p className="text-xs text-slate-500">
                  Dedicated statement of all fund contributions attributed to your account ({myUsername}) in {room.name}.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  exportToCsv(
                    myContributions,
                    `contributions_${myUsername.replace(/\s+/g, '_')}_${room.id}.csv`
                  )
                }
                className="px-3.5 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-1.5 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download My Contribution Report (CSV)</span>
              </button>
            </div>

            <div className="grid sm:grid-cols-3 gap-4 border-y border-slate-200 py-4">
              <div>
                <div className="text-xs text-slate-500">
                  My Total Verified & Logged Contributions
                </div>
                <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700">
                  +{fmtMoney(symbol, myTotalContributed)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Contribution Records Count</div>
                <div className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                  {myContributions.length}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Auditor Verified Payments</div>
                <div className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                  {myContributions.filter((c) => c.verified).length} /{' '}
                  {myContributions.length}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <th className="py-3 pr-4">Date</th>
                    <th className="py-3 px-4">Contribution Title</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Receipt / Reference Note</th>
                    <th className="py-3 px-4">Auditor Verification</th>
                    <th className="py-3 pl-4 text-right">Amount Contributed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {myContributions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        No personal contributions are currently attributed to "{myUsername}". When the Treasurer logs a contribution under your name, it will appear here automatically.
                      </td>
                    </tr>
                  ) : (
                    myContributions.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50/80">
                        <td className="py-3 pr-4 font-mono text-slate-600 whitespace-nowrap">
                          {c.entryDate}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-900">
                          {c.title}
                        </td>
                        <td className="py-3 px-4 text-slate-600">{c.category}</td>
                        <td className="py-3 px-4 text-slate-500">{c.note || '—'}</td>
                        <td className="py-3 px-4">
                          {c.verified ? (
                            <span className="text-emerald-700 font-medium flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Verified by {c.verifiedByName || 'Auditor'}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400">
                              Pending Auditor Verification
                            </span>
                          )}
                        </td>
                        <td className="py-3 pl-4 text-right font-mono font-semibold text-emerald-700 tabular-nums whitespace-nowrap">
                          +{fmtMoney(symbol, c.amount)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* TAB 4: ROLES & PERMISSIONS GOVERNANCE */}
        {activeTab === 'governance' && (
          <div className="grid md:grid-cols-12 gap-6 items-start">
            <section className="md:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              <div className="space-y-1">
                <h2 className="text-base font-bold text-slate-900">
                  Treasurer Authorization Control
                </h2>
                <p className="text-xs text-slate-500">
                  Only the Room Treasurer can grant or revoke the Auditor's permission to modify expenses and manage funds.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">
                    Auditor Expense Modification
                  </span>
                  <span
                    className={`text-xs font-semibold ${
                      room.auditorCanModify ? 'text-emerald-700' : 'text-slate-600'
                    }`}
                  >
                    {room.auditorCanModify ? 'ENABLED' : 'DISABLED'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  When enabled, the Room Auditor ({room.auditorName || 'currently unassigned'}) can create, edit, and delete ledger entries in addition to verifying them.
                </p>
                {isTreasurer ? (
                  <button
                    type="button"
                    onClick={handleToggleAuditorAuth}
                    className="w-full py-2 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    {room.auditorCanModify
                      ? 'Revoke Auditor Modification Permission'
                      : 'Grant Auditor Modification Permission'}
                  </button>
                ) : (
                  <div className="text-[11px] text-slate-400">
                    Only the Treasurer ({room.treasurerName || 'Unassigned'}) can toggle this setting.
                  </div>
                )}
              </div>
            </section>

            <section className="md:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Users className="w-4 h-4 text-slate-600" />
                    <span>
                      Room Member Verification & Roster ({approvedMembers.length} Verified
                      {pendingMembers.length > 0 ? ` · ${pendingMembers.length} Waiting` : ''})
                    </span>
                  </h2>
                  <p className="text-xs text-slate-500">
                    Treasurers and Auditors can approve waiting join requests or directly add teammates by Username or UID.
                  </p>
                </div>
              </div>

              {memberManageMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
                  {memberManageMsg}
                </div>
              )}

              {/* Direct Add Member Form (Treasurer / Auditor / Super Admin) */}
              {(isTreasurer || isAuditor || isSuperAdmin) && (
                <form
                  onSubmit={handleDirectAddMemberToRoom}
                  className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
                >
                  <div className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                    <UserPlus className="w-3.5 h-3.5 text-slate-700" />
                    <span>Directly Add & Approve Member to This Room</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      value={newMemberInput}
                      onChange={(e) => setNewMemberInput(e.target.value)}
                      placeholder="Enter teammate's Username or Account UID…"
                      className="flex-1 min-w-[180px] border border-slate-300 rounded-lg px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                    <select
                      value={newMemberRole}
                      onChange={(e) => setNewMemberRole(e.target.value as RoleType)}
                      className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                    >
                      <option value="student">Add as Student</option>
                      {!room.auditorId && <option value="auditor">Add as Auditor</option>}
                    </select>
                    <button
                      type="submit"
                      disabled={memberManageBusy}
                      className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
                    >
                      {memberManageBusy ? 'Adding…' : 'Add to Room'}
                    </button>
                  </div>
                </form>
              )}

              {/* Pending Join Requests Queue */}
              {pendingMembers.length > 0 && (
                <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/60 space-y-3">
                  <div className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-amber-700" />
                    <span>
                      Waiting for Treasurer / Auditor Approval ({pendingMembers.length})
                    </span>
                  </div>
                  <div className="divide-y divide-amber-200/70">
                    {pendingMembers.map((pm) => (
                      <div
                        key={pm.uid}
                        className="py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs"
                      >
                        <div>
                          <div className="font-semibold text-slate-900">{pm.username}</div>
                          <div className="text-slate-600 font-mono">
                            UID: {pm.uid} · Requested POV: {pm.role}
                          </div>
                        </div>
                        {(isTreasurer || isAuditor || isSuperAdmin) ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={memberManageBusy}
                              onClick={() => handleApproveMemberRequest(pm)}
                              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg flex items-center gap-1"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                              <span>Approve & Add</span>
                            </button>
                            <button
                              type="button"
                              disabled={memberManageBusy}
                              onClick={() => handleRemoveRoomMember(pm)}
                              className="px-2.5 py-1 bg-white border border-red-200 text-red-600 hover:bg-red-50 font-medium rounded-lg"
                            >
                              Decline
                            </button>
                          </div>
                        ) : (
                          <span className="text-amber-800 font-medium">
                            Awaiting Treasurer/Auditor
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Verified / Enrolled Room Members */}
              <div className="divide-y divide-slate-200 border-t border-slate-200">
                {approvedMembers.map((m) => (
                  <div
                    key={m.uid}
                    className="py-3 flex items-center justify-between gap-4 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                        <span>
                          {m.username} {m.uid === currentUid ? '(You)' : ''}
                        </span>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      </div>
                      <div className="text-slate-500 capitalize">
                        POV Role: <b className="text-slate-800">{m.role}</b> · UID:{' '}
                        <span className="font-mono">{m.uid}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isTreasurer && m.role === 'auditor' && m.uid !== currentUid && (
                        <button
                          type="button"
                          onClick={handleDemoteAuditor}
                          className="px-2.5 py-1 rounded border border-slate-300 hover:bg-red-50 hover:text-red-700 text-slate-600 font-medium"
                        >
                          Move to Student POV
                        </button>
                      )}
                      {(isTreasurer || isAuditor || isSuperAdmin) &&
                        m.uid !== currentUid &&
                        m.uid !== room.treasurerId && (
                          <button
                            type="button"
                            disabled={memberManageBusy}
                            onClick={() => handleRemoveRoomMember(m)}
                            className="px-2.5 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50 font-medium"
                          >
                            Remove
                          </button>
                        )}
                    </div>
                  </div>
                ))}
              </div>

              {/* ALL REGISTERED USERS & UIDS DIRECTORY FOR CONVENIENT 1-CLICK ADDITION */}
              <div className="border-t border-slate-200 pt-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-slate-700" />
                      <span>
                        All Registered Usernames & UIDs Directory ({allUsersDirectory.length})
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500">
                      Browse all accounts in the app. Treasurers and Auditors can click "Add Student" or "Add Auditor" to add anyone with one click.
                    </p>
                  </div>
                  <div className="relative w-full sm:w-56">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={userDirSearch}
                      onChange={(e) => setUserDirSearch(e.target.value)}
                      placeholder="Filter username or UID…"
                      className="w-full border border-slate-300 rounded-lg pl-8 pr-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                </div>

                <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl max-h-72 overflow-y-auto">
                  {filteredUsersDirectory.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">
                      No matching users found.
                    </div>
                  ) : (
                    filteredUsersDirectory.map((u) => {
                      const existingRoomMember = members.find((m) => m.uid === u.uid);
                      const isAlreadyApproved =
                        existingRoomMember &&
                        existingRoomMember.approvalStatus !== 'pending';
                      const isPendingInRoom =
                        existingRoomMember?.approvalStatus === 'pending';

                      return (
                        <div
                          key={u.uid}
                          className="p-3 flex flex-wrap items-center justify-between gap-3 text-xs hover:bg-slate-50/80"
                        >
                          <div className="min-w-0 space-y-0.5">
                            <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                              <span>{u.displayName}</span>
                              <span className="font-mono text-slate-600">
                                @{u.username}
                              </span>
                              {u.uid === currentUid && (
                                <span className="text-emerald-700 font-semibold">
                                  (You)
                                </span>
                              )}
                            </div>
                            <div className="font-mono text-slate-500 select-all">
                              UID: {u.uid}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                handleCopyUserIdentifier(u.uid, `room_uid_${u.uid}`)
                              }
                              className="px-2 py-1 border border-slate-300 rounded hover:bg-slate-100 text-slate-700 font-mono flex items-center gap-1"
                            >
                              {copiedDirectoryUid === `room_uid_${u.uid}` ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                              <span>
                                {copiedDirectoryUid === `room_uid_${u.uid}`
                                  ? 'Copied'
                                  : 'Copy UID'}
                              </span>
                            </button>

                            {isAlreadyApproved ? (
                              <span className="px-2.5 py-1 text-emerald-700 font-semibold flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>In Room ({existingRoomMember.role})</span>
                              </span>
                            ) : (isTreasurer || isAuditor || isSuperAdmin) ? (
                              <>
                                <button
                                  type="button"
                                  disabled={memberManageBusy}
                                  onClick={() =>
                                    handleQuickAddUserFromDirectory(u, 'student')
                                  }
                                  className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded transition-colors"
                                >
                                  {isPendingInRoom ? 'Approve Student' : '+ Add Student'}
                                </button>
                                {!room.auditorId && (
                                  <button
                                    type="button"
                                    disabled={memberManageBusy}
                                    onClick={() =>
                                      handleQuickAddUserFromDirectory(u, 'auditor')
                                    }
                                    className="px-2.5 py-1 border border-slate-300 hover:bg-slate-100 text-slate-800 font-semibold rounded transition-colors"
                                  >
                                    + Add Auditor
                                  </button>
                                )}
                              </>
                            ) : null}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </section>
          </div>
        )}

        {/* TAB 5: ME — ACCOUNT & ROOM DATA RESET CONTROLS */}
        {activeTab === 'me_settings' && (
          <div className="grid md:grid-cols-12 gap-6 items-start">
            {/* Left Column: Account Profile Info */}
            <section className="md:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              <div className="space-y-1">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Settings className="w-4 h-4 text-slate-700" />
                  <span>Me — Account & Session</span>
                </h2>
                <p className="text-xs text-slate-500">
                  Your current identity and active room credentials.
                </p>
              </div>

              <div className="divide-y divide-slate-200 border-y border-slate-200 text-xs">
                <div className="py-3 flex items-center justify-between">
                  <span className="text-slate-500">Display Name</span>
                  <span className="font-semibold text-slate-900">{myUsername}</span>
                </div>
                <div className="py-3 flex items-center justify-between">
                  <span className="text-slate-500">Username</span>
                  <span className="font-mono text-slate-900">{userProfile.username}</span>
                </div>
                <div className="py-3 flex items-center justify-between">
                  <span className="text-slate-500">Account UID</span>
                  <span className="font-mono text-slate-600 truncate max-w-[180px]">
                    {userProfile.uid}
                  </span>
                </div>
                <div className="py-3 flex items-center justify-between">
                  <span className="text-slate-500">Active POV in {room.name}</span>
                  <span className="font-semibold capitalize text-slate-900">{myRole}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigateToRoom(null)}
                  className="flex-1 py-2 px-3 text-xs font-medium border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-800"
                >
                  Switch or Create Room
                </button>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="py-2 px-3 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800"
                >
                  Sign Out
                </button>
              </div>
            </section>

            {/* Right Column: Restricted Room & Global Data Wipe Controls */}
            <section className="md:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-6">
              <div className="space-y-1">
                <h2 className="text-base font-bold text-slate-900">
                  Restricted Room Data & Clutter Reset Controls
                </h2>
                <p className="text-xs text-slate-500">
                  Only the Primary Owner ({SUPER_ADMIN_EMAIL}) and users explicitly granted Wipe Authority can wipe room data or reset all rooms.
                </p>
              </div>

              {canWipeRooms ? (
                <>
                  {/* Action 1: Wipe Only Current Room Entries */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-bold text-slate-900">
                        01. Clear Ledger Entries in "{room.name}"
                      </div>
                      <span className="text-xs font-mono text-slate-500 tabular-nums">
                        {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Deletes all {entries.length} financial transactions in this room so the calendar starts at {symbol}0.00 while keeping the room code ({room.id}) and member POV roles intact.
                    </p>

                    {!confirmWipeRoomEntries ? (
                      <button
                        type="button"
                        disabled={wipeBusy || entries.length === 0}
                        onClick={() => setConfirmWipeRoomEntries(true)}
                        className="py-2 px-4 bg-white border border-slate-300 hover:bg-slate-100 text-slate-900 text-xs font-semibold rounded-lg transition-colors disabled:opacity-40"
                      >
                        Clear All {entries.length} Entries in This Room
                      </button>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          disabled={wipeBusy}
                          onClick={handleWipeCurrentRoomEntries}
                          className="py-2 px-3 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg"
                        >
                          {wipeBusy ? 'Clearing Entries…' : 'Confirm Clear Entries'}
                        </button>
                        <button
                          type="button"
                          disabled={wipeBusy}
                          onClick={() => setConfirmWipeRoomEntries(false)}
                          className="py-2 px-3 bg-white border border-slate-300 text-slate-700 text-xs font-medium rounded-lg"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Action 2: Delete Current Room Completely */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-bold text-slate-900">
                        02. Delete This Room ("{room.name}")
                      </div>
                      <span className="text-xs font-mono text-slate-500">ID: {room.id}</span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Deletes this room along with all {entries.length} entries and {members.length} member records, and returns you to the main Room Workspace.
                    </p>

                    {!confirmDeleteThisRoom ? (
                      <button
                        type="button"
                        disabled={wipeBusy}
                        onClick={() => setConfirmDeleteThisRoom(true)}
                        className="py-2 px-4 bg-white border border-red-300 hover:bg-red-50 text-red-700 text-xs font-semibold rounded-lg transition-colors disabled:opacity-40"
                      >
                        Delete Room "{room.name}"
                      </button>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          disabled={wipeBusy}
                          onClick={() => handleDeleteSpecificRoom(room.id)}
                          className="py-2 px-3 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg"
                        >
                          {wipeBusy ? 'Deleting Room…' : 'Confirm Delete This Room'}
                        </button>
                        <button
                          type="button"
                          disabled={wipeBusy}
                          onClick={() => setConfirmDeleteThisRoom(false)}
                          className="py-2 px-3 bg-white border border-slate-300 text-slate-700 text-xs font-medium rounded-lg"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Action 3: Global Clean Start — Wipe All Rooms & Data */}
                  <div className="p-4 rounded-xl border border-red-200 bg-red-50/50 space-y-3">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <div className="text-sm font-bold text-red-900">
                          03. Global Clean Start — Wipe All Rooms ({publicRooms.length} Total)
                        </div>
                        <p className="text-xs text-red-800 leading-relaxed">
                          Wipes out every room in the database ({publicRooms.length} active rooms), all financial ledger entries, and all room member rosters so there is zero room clutter or lag.
                        </p>
                      </div>
                    </div>

                    {!confirmWipeAllRooms ? (
                      <button
                        type="button"
                        disabled={wipeBusy || publicRooms.length === 0}
                        onClick={() => setConfirmWipeAllRooms(true)}
                        className="w-full py-2 px-4 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>
                          Wipe All {publicRooms.length}{' '}
                          {publicRooms.length === 1 ? 'Room' : 'Rooms'} & Reset Database
                        </span>
                      </button>
                    ) : (
                      <div className="space-y-2 pt-1">
                        <div className="text-xs font-semibold text-red-900">
                          Are you sure you want to wipe all {publicRooms.length} rooms and all ledger data?
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={wipeBusy}
                            onClick={handleWipeAllRoomsData}
                            className="flex-1 py-2 px-3 bg-red-700 hover:bg-red-800 text-white text-xs font-semibold rounded-lg transition-colors"
                          >
                            {wipeBusy ? 'Wiping All Rooms…' : 'Yes, Wipe Everything Clean'}
                          </button>
                          <button
                            type="button"
                            disabled={wipeBusy}
                            onClick={() => setConfirmWipeAllRooms(false)}
                            className="py-2 px-3 bg-white border border-slate-300 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="p-5 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    <Lock className="w-4 h-4 text-slate-600" />
                    <span>Wipe All Rooms — Restricted Authority</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Wiping rooms and resetting workspace data is strictly restricted to the Primary Owner (<b>{SUPER_ADMIN_EMAIL}</b>) and accounts explicitly granted Wipe Authority by the owner.
                  </p>
                  <p className="text-xs text-slate-500">
                    Your Account UID: <span className="font-mono text-slate-800 select-all">{userProfile.uid}</span>
                  </p>
                </div>
              )}

              {/* Authority Delegation Manager inside Room Me Tab (Available to Owner AND everyone given the same authority) */}
              {canWipeRooms && (
                <div className="border-t border-slate-200 pt-5 space-y-4">
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      <span>
                        Give or Revoke Same Authority (Owner & Authorized Users)
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500">
                      Grant or revoke Full Authority for any registered username so they have the same authority as you and can also grant it to others.
                    </p>
                  </div>

                  {grantError && (
                    <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                      {grantError}
                    </div>
                  )}
                  {grantSuccess && (
                    <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
                      {grantSuccess}
                    </div>
                  )}

                  <form onSubmit={handleGrantByInput} className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      value={grantIdentifier}
                      onChange={(e) => setGrantIdentifier(e.target.value)}
                      placeholder="Enter @username or UID to give same authority…"
                      className="flex-1 min-w-[200px] border border-slate-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                    <button
                      type="submit"
                      disabled={grantBusy}
                      className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
                    >
                      Give Same Authority
                    </button>
                  </form>

                  <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg max-h-64 overflow-y-auto">
                    {allUsersDirectory.map((u) => {
                      const isPrimaryOwnerUser =
                        u.username.toLowerCase() === 'franzatuel' ||
                        u.username.toLowerCase().includes('franz') ||
                        u.uid === 'aMVdQVuMuYMISlIcFuafEA8l8v53';
                      const isAuthorized =
                        isPrimaryOwnerUser ||
                        wipeAuthorities.some(
                          (w) =>
                            w.uid === u.uid ||
                            w.username.toLowerCase() === u.username.toLowerCase()
                        );
                      const isSelf = u.uid === userProfile.uid;
                      return (
                        <div
                          key={u.uid}
                          className="p-2.5 flex items-center justify-between gap-2 text-xs"
                        >
                          <div>
                            <div className="font-semibold text-slate-900">
                              <span className="font-mono font-bold">@{u.username}</span> ({u.displayName}){' '}
                              {isSelf ? '(You)' : ''}
                            </div>
                            <div className="text-slate-400 font-mono">UID: {u.uid}</div>
                          </div>
                          {isPrimaryOwnerUser ? (
                            <span className="text-emerald-700 font-semibold">Primary Owner</span>
                          ) : isAuthorized ? (
                            <div className="flex items-center gap-2">
                              <span className="text-emerald-700 font-semibold">Same Authority</span>
                              {!isSelf && (
                                <button
                                  type="button"
                                  disabled={grantBusy}
                                  onClick={() => handleRevokeWipeAuthority(u.uid, u.displayName)}
                                  className="px-2.5 py-1 border border-red-200 text-red-600 hover:bg-red-50 rounded font-medium"
                                >
                                  Revoke
                                </button>
                              )}
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={grantBusy}
                              onClick={() => handleGrantWipeAuthority(u)}
                              className="px-2.5 py-1 bg-slate-900 text-white hover:bg-slate-800 rounded font-semibold"
                            >
                              Give Same Authority
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white px-6 py-4 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-2 mt-8">
        <span>FundTracker Ledger · Room {room.id}</span>
        <span>
          Active POV: <b className="text-slate-800 capitalize">{myRole}</b> · Signed in as{' '}
          {myUsername}
        </span>
      </footer>
    </div>
  );
}
