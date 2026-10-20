import React, { useState } from 'react';
import {
  Plus,
  ArrowRight,
  Search,
  Copy,
  Check,
  Clock,
  CheckCircle2,
  Trash2,
  ShieldCheck,
  Users,
  KeyRound,
  LogOut,
  Building,
  Settings,
  AlertTriangle,
  FolderOpen,
} from 'lucide-react';
import { Room, UserJoinedRoom, UserProfile, RoleType, CurrencySymbol, WipeAuthorityRecord } from '../types';

interface RoomHubProps {
  userProfile: UserProfile;
  myJoinedRooms: Room[];
  myJoinedRoomsIndex: UserJoinedRoom[];
  publicRooms: Room[];
  adminRooms: Room[];
  allUsersDirectory: UserProfile[];
  filteredUsersDirectory: UserProfile[];
  userDirSearch: string;
  setUserDirSearch: (v: string) => void;
  copiedDirectoryUid: string | null;
  onCopyIdentifier: (text: string, id: string) => void;
  // Room Creation / Joining
  newRoomName: string;
  setNewRoomName: (v: string) => void;
  newRoomCurrency: CurrencySymbol;
  setNewRoomCurrency: (v: CurrencySymbol) => void;
  newRoomInitialRole: RoleType;
  setNewRoomInitialRole: (v: RoleType) => void;
  joinRoomCode: string;
  setJoinRoomCode: (v: string) => void;
  hubError: string;
  hubBusy: boolean;
  onCreateRoom: (e: React.FormEvent) => void;
  onJoinByCode: (e: React.FormEvent) => void;
  onNavigateToRoom: (id: string | null) => void;
  onSignOut: () => void;
  // Authority & Admin
  canWipeRooms: boolean;
  wipeBusy: boolean;
  wipeAuthorities: WipeAuthorityRecord[];
  grantIdentifier: string;
  setGrantIdentifier: (v: string) => void;
  grantBusy: boolean;
  grantError: string;
  grantSuccess: string;
  onGrantByInput: (e: React.FormEvent) => void;
  onGrantWipeAuthority: (user: UserProfile) => void;
  onRevokeWipeAuthority: (uid: string, name: string) => void;
  onDeleteRoom: (roomId: string) => void;
  onWipeAllRooms: () => void;
  confirmWipeAllRooms: boolean;
  setConfirmWipeAllRooms: (v: boolean) => void;
  wipeStatusMsg: string;
  setWipeStatusMsg: (v: string) => void;
  superAdminEmail: string;
  currencies: CurrencySymbol[];
}

export const RoomHub: React.FC<RoomHubProps> = ({
  userProfile,
  myJoinedRooms,
  myJoinedRoomsIndex,
  publicRooms,
  adminRooms,
  allUsersDirectory,
  filteredUsersDirectory,
  userDirSearch,
  setUserDirSearch,
  copiedDirectoryUid,
  onCopyIdentifier,
  newRoomName,
  setNewRoomName,
  newRoomCurrency,
  setNewRoomCurrency,
  newRoomInitialRole,
  setNewRoomInitialRole,
  joinRoomCode,
  setJoinRoomCode,
  hubError,
  hubBusy,
  onCreateRoom,
  onJoinByCode,
  onNavigateToRoom,
  onSignOut,
  canWipeRooms,
  wipeBusy,
  wipeAuthorities,
  grantIdentifier,
  setGrantIdentifier,
  grantBusy,
  grantError,
  grantSuccess,
  onGrantByInput,
  onGrantWipeAuthority,
  onRevokeWipeAuthority,
  onDeleteRoom,
  onWipeAllRooms,
  confirmWipeAllRooms,
  setConfirmWipeAllRooms,
  wipeStatusMsg,
  setWipeStatusMsg,
  superAdminEmail,
  currencies,
}) => {
  const [hubTab, setHubTab] = useState<'my_rooms' | 'create_join' | 'directory' | 'admin'>('my_rooms');
  const [roomSearch, setRoomSearch] = useState('');
  const [createOrJoinSubtab, setCreateOrJoinSubtab] = useState<'create' | 'join'>('create');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const filteredMyRooms = myJoinedRooms.filter((r) =>
    r.name.toLowerCase().includes(roomSearch.toLowerCase()) ||
    r.id.toLowerCase().includes(roomSearch.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Bar Contract (3 Zones) */}
      <header className="flex items-center justify-between px-6 py-3.5 bg-white border-b border-slate-200 sticky top-0 z-20">
        {/* Zone 1: Brand Wordmark */}
        <div className="flex items-center gap-3">
          <a href="/" className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
            FundTracker
          </a>
        </div>

        {/* Zone 2: Navigation Links (Clean Single-Line) */}
        <nav className="hidden sm:flex items-center gap-6 text-sm font-medium text-slate-600">
          <button
            type="button"
            onClick={() => setHubTab('my_rooms')}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap ${
              hubTab === 'my_rooms' ? 'text-slate-900 font-semibold underline underline-offset-8 decoration-2' : ''
            }`}
          >
            My Rooms ({myJoinedRooms.length})
          </button>
          <button
            type="button"
            onClick={() => setHubTab('create_join')}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap ${
              hubTab === 'create_join' ? 'text-slate-900 font-semibold underline underline-offset-8 decoration-2' : ''
            }`}
          >
            New or Join
          </button>
          {canWipeRooms && (
          <button
            type="button"
            onClick={() => setHubTab('directory')}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap ${
              hubTab === 'directory' ? 'text-slate-900 font-semibold underline underline-offset-8 decoration-2' : ''
            }`}
          >
            Directory
          </button>
          )}
          {canWipeRooms && (
            <button
              type="button"
              onClick={() => setHubTab('admin')}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap ${
                hubTab === 'admin' ? 'text-slate-900 font-semibold underline underline-offset-8 decoration-2' : ''
              }`}
            >
              Administration
            </button>
          )}
        </nav>

        {/* Zone 3: Account Profile & Sign Out */}
        <div className="flex items-center gap-3">
          <div className="hidden md:flex flex-col text-right">
            <span className="text-xs font-semibold text-slate-900">
              @{userProfile.username}
            </span>
            <span className="text-[11px] text-slate-500 truncate max-w-[140px]">
              {userProfile.displayName}
            </span>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors flex items-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Mobile Nav Tabs */}
      <div className="sm:hidden bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-1 overflow-x-auto">
        <button
          type="button"
          onClick={() => setHubTab('my_rooms')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap ${
            hubTab === 'my_rooms' ? 'bg-slate-900 text-white' : 'text-slate-600'
          }`}
        >
          My Rooms ({myJoinedRooms.length})
        </button>
        <button
          type="button"
          onClick={() => setHubTab('create_join')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap ${
            hubTab === 'create_join' ? 'bg-slate-900 text-white' : 'text-slate-600'
          }`}
        >
          New or Join
        </button>
        {canWipeRooms && (
        <button
          type="button"
          onClick={() => setHubTab('directory')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap ${
            hubTab === 'directory' ? 'bg-slate-900 text-white' : 'text-slate-600'
          }`}
        >
          Directory
        </button>
        )}
        {canWipeRooms && (
          <button
            type="button"
            onClick={() => setHubTab('admin')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap ${
              hubTab === 'admin' ? 'bg-slate-900 text-white' : 'text-slate-600'
            }`}
          >
            Administration
          </button>
        )}
      </div>

      {/* Main Workspace Body */}
      <main className="max-w-6xl w-full mx-auto px-6 py-8 flex-1 space-y-6">
        {hubError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
            {hubError}
          </div>
        )}

        {wipeStatusMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center justify-between">
            <span>{wipeStatusMsg}</span>
            <button
              type="button"
              onClick={() => setWipeStatusMsg('')}
              className="text-emerald-700 hover:underline font-medium ml-4"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* TAB 1: MY ROOMS (Primary View) */}
        {hubTab === 'my_rooms' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                  Fund Rooms
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Shared financial ledgers you manage or monitor.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setHubTab('create_join');
                    setCreateOrJoinSubtab('create');
                  }}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Room</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setHubTab('create_join');
                    setCreateOrJoinSubtab('join');
                  }}
                  className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  Join with Code
                </button>
              </div>
            </div>

            {/* Room Search Bar */}
            {myJoinedRooms.length > 0 && (
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={roomSearch}
                  onChange={(e) => setRoomSearch(e.target.value)}
                  placeholder="Search your rooms by title or room ID…"
                  className="w-full border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
            )}

            {/* Room Cards / List */}
            {filteredMyRooms.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-4">
                <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto text-slate-600">
                  <Building className="w-6 h-6" />
                </div>
                <div className="space-y-1 max-w-sm mx-auto">
                  <h3 className="text-base font-bold text-slate-900">
                    {roomSearch ? 'No matching rooms found' : 'No Fund Rooms Joined Yet'}
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    {roomSearch
                      ? 'Try adjusting your search query to find your room.'
                      : 'Create a shared room for your organization or enter a code shared by your Treasurer.'}
                  </p>
                </div>
                {!roomSearch && (
                  <div className="pt-2 flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setHubTab('create_join');
                        setCreateOrJoinSubtab('create');
                      }}
                      className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
                    >
                      Create First Room
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setHubTab('create_join');
                        setCreateOrJoinSubtab('join');
                      }}
                      className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                    >
                      Enter Code
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {filteredMyRooms.map((r) => {
                  const jInfo = myJoinedRoomsIndex.find((x) => x.roomId === r.id);
                  const isPendingJoin =
                    jInfo?.approvalStatus === 'pending' &&
                    r.treasurerId !== userProfile.uid &&
                    r.auditorId !== userProfile.uid;

                  return (
                    <div
                      key={r.id}
                      className="bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-all flex flex-col justify-between gap-4"
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-bold text-base text-slate-900 truncate">
                            {r.name}
                          </h3>
                          {isPendingJoin ? (
                            <span className="text-[11px] font-medium text-amber-700 flex items-center gap-1 shrink-0 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                              <Clock className="w-3 h-3" />
                              <span>Pending Approval</span>
                            </span>
                          ) : (
                            <span className="text-[11px] font-medium text-emerald-700 flex items-center gap-1 shrink-0 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Active</span>
                            </span>
                          )}
                        </div>

                        {/* Unboxed Metadata with separators */}
                        <div className="text-xs text-slate-500 flex flex-wrap items-center gap-1.5">
                          <span className="font-mono">ID: {r.id}</span>
                          <span aria-hidden="true">·</span>
                          <span>Currency: {r.currency}</span>
                          <span aria-hidden="true">·</span>
                          <span>Treasurer: {r.treasurerName || 'Vacant'}</span>
                          <span aria-hidden="true">·</span>
                          <span>Auditor: {r.auditorName || 'Vacant'}</span>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                        <div>
                          {canWipeRooms && (
                            confirmDeleteId === r.id ? (
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={wipeBusy}
                                  onClick={() => onDeleteRoom(r.id)}
                                  className="px-2 py-1 bg-red-600 text-white text-xs font-semibold rounded hover:bg-red-700"
                                >
                                  Confirm
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded hover:bg-slate-200"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(r.id)}
                                className="text-xs text-slate-400 hover:text-red-600 flex items-center gap-1 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Delete</span>
                              </button>
                            )
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => onNavigateToRoom(r.id)}
                          className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1.5"
                        >
                          <span>{isPendingJoin ? 'Check Status' : 'Enter Room'}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: CREATE OR JOIN ROOM */}
        {hubTab === 'create_join' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="text-center space-y-1">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Setup or Join a Room
              </h1>
              <p className="text-xs text-slate-500">
                Start a fresh financial workspace or enter with an invite code.
              </p>
            </div>

            {/* Segmented Mode Selector */}
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-200/70 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setCreateOrJoinSubtab('create')}
                className={`py-2 rounded-lg transition-colors ${
                  createOrJoinSubtab === 'create'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Create New Room
              </button>
              <button
                type="button"
                onClick={() => setCreateOrJoinSubtab('join')}
                className={`py-2 rounded-lg transition-colors ${
                  createOrJoinSubtab === 'join'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Join Existing Room
              </button>
            </div>

            {createOrJoinSubtab === 'create' ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6">
                <form onSubmit={onCreateRoom} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Organization or Class Name
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={80}
                      value={newRoomName}
                      onChange={(e) => setNewRoomName(e.target.value)}
                      placeholder="e.g. Student Council FY 2026"
                      className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Default Currency
                      </label>
                      <select
                        value={newRoomCurrency}
                        onChange={(e) => setNewRoomCurrency(e.target.value as CurrencySymbol)}
                        className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm bg-white"
                      >
                        {currencies.map((c) => (
                          <option key={c} value={c}>
                            {c} Currency
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Your Initial Role
                      </label>
                      <select
                        value={newRoomInitialRole}
                        onChange={(e) => setNewRoomInitialRole(e.target.value as RoleType)}
                        className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm bg-white"
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
                    className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <span>{hubBusy ? 'Creating Room…' : 'Create Room Workspace'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6">
                <form onSubmit={onJoinByCode} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Enter Room Code
                    </label>
                    <input
                      type="text"
                      required
                      value={joinRoomCode}
                      onChange={(e) => setJoinRoomCode(e.target.value)}
                      placeholder="e.g. k9m4x2p8"
                      className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      Ask your Treasurer or Auditor for the 8-character Room ID.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={hubBusy}
                    className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <span>{hubBusy ? 'Searching…' : 'Open Room'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: MEMBER DIRECTORY */}
        {hubTab === 'directory' && canWipeRooms && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                  All Registered Usernames & Authority Directory ({allUsersDirectory.length})
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Registered accounts across the organization. Copy @username or UID to assign roles.
                </p>
              </div>

              <div className="relative w-full sm:w-72">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={userDirSearch}
                  onChange={(e) => setUserDirSearch(e.target.value)}
                  placeholder="Filter by @username or UID…"
                  className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
            </div>

            {grantError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                {grantError}
              </div>
            )}
            {grantSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800">
                {grantSuccess}
              </div>
            )}

            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
                {filteredUsersDirectory.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    No matching users found.
                  </div>
                ) : (
                  filteredUsersDirectory.map((u) => {
                    const isMe = u.uid === userProfile.uid;
                    const uLower = u.username.toLowerCase();
                    const isSuper = uLower === 'franzatuel';
                    const isAuthorized =
                      isSuper ||
                      wipeAuthorities.some(
                        (w) => w.uid === u.uid || w.username.toLowerCase() === u.username.toLowerCase()
                      );

                    return (
                      <div
                        key={u.uid}
                        className="p-4 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                            <span>@{u.username}</span>
                            <span className="text-xs text-slate-500 font-normal">
                              ({u.displayName})
                            </span>
                            {isMe && (
                              <span className="text-xs font-semibold text-emerald-700">
                                (You)
                              </span>
                            )}
                            {isAuthorized && (
                              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                {isSuper ? 'Owner' : 'Authorized Manager'}
                              </span>
                            )}
                          </div>
                          <div className="text-xs font-mono text-slate-400">
                            UID: {u.uid}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onCopyIdentifier(u.username, `usr_${u.uid}`)}
                            className="px-2.5 py-1.5 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-100 text-slate-700 flex items-center gap-1 transition-colors"
                          >
                            {copiedDirectoryUid === `usr_${u.uid}` ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            <span>Copy Username</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onCopyIdentifier(u.uid, `uid_${u.uid}`)}
                            className="px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-lg hover:bg-slate-100 text-slate-700 flex items-center gap-1 transition-colors"
                          >
                            {copiedDirectoryUid === `uid_${u.uid}` ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            <span>Copy UID</span>
                          </button>

                          {canWipeRooms && !isMe && !isSuper && (
                            <button
                              type="button"
                              disabled={grantBusy}
                              onClick={() =>
                                isAuthorized
                                  ? onRevokeWipeAuthority(u.uid, u.displayName)
                                  : onGrantWipeAuthority(u)
                              }
                              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                                isAuthorized
                                  ? 'border border-red-200 text-red-600 hover:bg-red-50'
                                  : 'bg-slate-900 text-white hover:bg-slate-800'
                              }`}
                            >
                              {isAuthorized ? 'Revoke' : 'Delegate Authority'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: ADMINISTRATION (Restricted) */}
        {hubTab === 'admin' && canWipeRooms && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Main Website Authority Control Center & Data Wipe
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Manage global permissions, room rosters, and cleanup routines.
              </p>
            </div>

            {/* Quick Grant Input */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Delegate Management Authority
                </h3>
                <p className="text-xs text-slate-500">
                  Allow another trusted account to manage rooms and access administrative controls.
                </p>
              </div>

              <form onSubmit={onGrantByInput} className="flex flex-wrap gap-2">
                <input
                  type="text"
                  value={grantIdentifier}
                  onChange={(e) => setGrantIdentifier(e.target.value)}
                  placeholder="Enter @username or account UID…"
                  className="flex-1 min-w-[240px] border border-slate-300 rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
                <button
                  type="submit"
                  disabled={grantBusy}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-colors disabled:opacity-50"
                >
                  {grantBusy ? 'Updating…' : 'Grant Authority'}
                </button>
              </form>

              {/* Roster of Authorized Users */}
              <div className="space-y-2 pt-2">
                <div className="text-xs font-semibold text-slate-700">
                  Active Authorized Accounts ({wipeAuthorities.length + 1})
                </div>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl bg-slate-50/50 max-h-56 overflow-y-auto">
                  <div className="p-3 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-semibold text-slate-900">Primary Owner ({superAdminEmail})</span>
                      <div className="text-slate-400">Permanent administrator</div>
                    </div>
                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      Owner
                    </span>
                  </div>
                  {wipeAuthorities.map((wa) => (
                    <div key={wa.uid} className="p-3 flex items-center justify-between gap-2 text-xs">
                      <div>
                        <span className="font-semibold text-slate-900">@{wa.username} ({wa.displayName})</span>
                        <div className="text-slate-400 font-mono">UID: {wa.uid}</div>
                      </div>
                      {wa.uid !== userProfile.uid && (
                        <button
                          type="button"
                          disabled={grantBusy}
                          onClick={() => onRevokeWipeAuthority(wa.uid, wa.displayName)}
                          className="px-2.5 py-1 text-xs border border-red-200 text-red-600 hover:bg-red-50 rounded-lg font-medium"
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Every room on the website (public + private) */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  All Rooms on the Website ({adminRooms.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Every room, public and private. Delete a single room here, or wipe them all below.
                </p>
              </div>
              {adminRooms.length === 0 ? (
                <div className="text-xs text-slate-500 border border-dashed border-slate-300 rounded-xl p-4 text-center">
                  There are no rooms in the database.
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-96 overflow-y-auto">
                  {adminRooms.map((r) => (
                    <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900 truncate">{r.name}</span>
                          <span
                            className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                              r.isPublicRoom ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {r.isPublicRoom ? 'Public' : 'Private'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Treasurer: {r.treasurerName || 'Unknown'} · Auditor: {r.auditorName || 'Vacant'} · ID: {r.id}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {confirmDeleteId === r.id ? (
                          <>
                            <button
                              type="button"
                              disabled={wipeBusy}
                              onClick={() => {
                                onDeleteRoom(r.id);
                                setConfirmDeleteId(null);
                              }}
                              className="px-2.5 py-1 bg-red-600 text-white text-xs font-semibold rounded hover:bg-red-700"
                            >
                              Confirm delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2.5 py-1 bg-slate-100 text-slate-600 text-xs rounded hover:bg-slate-200"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            disabled={wipeBusy}
                            onClick={() => setConfirmDeleteId(r.id)}
                            className="px-2.5 py-1 bg-white border border-red-300 text-red-700 text-xs font-medium rounded hover:bg-red-50"
                          >
                            Delete room
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Global Wipe Card */}
            <div className="bg-red-50/50 border border-red-200 rounded-2xl p-6 space-y-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-red-900">
                    Reset Database — Wipe All Rooms ({adminRooms.length} total)
                  </h3>
                  <p className="text-xs text-red-800 leading-relaxed">
                    Deletes every room and transaction across the application for a fresh start. This action cannot be reversed.
                  </p>
                </div>
              </div>

              {!confirmWipeAllRooms ? (
                <button
                  type="button"
                  disabled={wipeBusy || adminRooms.length === 0}
                  onClick={() => setConfirmWipeAllRooms(true)}
                  className="py-2 px-4 bg-white border border-red-300 hover:bg-red-50 text-red-700 text-xs font-semibold rounded-xl transition-colors disabled:opacity-40"
                >
                  Reset All Rooms & Data
                </button>
              ) : (
                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    disabled={wipeBusy}
                    onClick={onWipeAllRooms}
                    className="py-2 px-4 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl"
                  >
                    {wipeBusy ? 'Resetting…' : 'Confirm Complete Wipe'}
                  </button>
                  <button
                    type="button"
                    disabled={wipeBusy}
                    onClick={() => setConfirmWipeAllRooms(false)}
                    className="py-2 px-4 bg-white border border-slate-300 text-slate-700 text-xs font-medium rounded-xl hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
