import React, { useState, useMemo } from 'react';
import {
  LedgerEntry,
  RoomMember,
  CurrencySymbol,
  RoleType,
} from '../types';
import { fmtMoney } from './MonthCalendar';
import {
  Search,
  Download,
  CheckCircle2,
  Flag,
  ArrowUpRight,
  ArrowDownRight,
  Users,
  Wallet,
  Calendar,
  Filter,
  User,
  Clock,
  ArrowRight,
  Check,
  ChevronRight,
  Edit3,
} from 'lucide-react';

export interface MemberEntryRecord extends LedgerEntry {
  runningBalance: number;
}

export interface MemberBalanceGroup {
  key: string;
  uid: string;
  name: string;
  role?: RoleType;
  totalAdded: number;
  totalSubtracted: number;
  finalBalance: number;
  entriesCount: number;
  verifiedCount: number;
  flaggedCount: number;
  entries: MemberEntryRecord[];
  lastDate: string;
}

interface MemberBalancesProps {
  entries: LedgerEntry[];
  members: RoomMember[];
  symbol: CurrencySymbol;
  currentUserId: string;
  currentUsername: string;
  currentUserRole: RoleType | null;
  canModifyExpenses: boolean;
  canVerifyEntries: boolean;
  roomName: string;
  roomId: string;
  onEditEntry?: (entry: LedgerEntry) => void;
  onVerifyEntry?: (entry: LedgerEntry, verified: boolean) => void;
  onFlagEntry?: (entry: LedgerEntry, flagged: boolean) => void;
  onSelectDate?: (date: string) => void;
  initialSelectedMemberKey?: string | null;
}

export const MemberBalances: React.FC<MemberBalancesProps> = ({
  entries,
  members,
  symbol,
  currentUserId,
  currentUsername,
  currentUserRole,
  canModifyExpenses,
  canVerifyEntries,
  roomName,
  roomId,
  onEditEntry,
  onVerifyEntry,
  onFlagEntry,
  onSelectDate,
  initialSelectedMemberKey,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBalance, setFilterBalance] = useState<'all' | 'positive' | 'negative' | 'zero'>('all');
  const [selectedMemberKey, setSelectedMemberKey] = useState<string | null>(() => {
    if (initialSelectedMemberKey) return initialSelectedMemberKey;
    // Default to current user's UID or username if available
    return currentUserId || null;
  });

  // 1. Group all entries by assigned student/member and compute auto add/subtract + running balances
  const memberGroups = useMemo(() => {
    const map = new Map<string, {
      uid: string;
      name: string;
      role?: RoleType;
      rawEntries: LedgerEntry[];
    }>();

    // Seed with official room members so even zero-balance members appear
    members.forEach((m) => {
      const key = m.uid || m.username.toLowerCase();
      map.set(key, {
        uid: m.uid,
        name: m.username,
        role: m.role,
        rawEntries: [],
      });
    });

    // Populate with all ledger entries
    entries.forEach((e) => {
      let key = '';
      let name = '';
      let uid = '';

      if (e.contributorUid && map.has(e.contributorUid)) {
        key = e.contributorUid;
        const existing = map.get(key)!;
        name = existing.name;
        uid = existing.uid;
      } else if (e.contributorUid) {
        key = e.contributorUid;
        name = e.contributorName || 'Member';
        uid = e.contributorUid;
      } else if (e.contributorName && e.contributorName.trim()) {
        const trimmed = e.contributorName.trim();
        // check if name matches any member
        const matchedMember = members.find(
          (m) => m.username.toLowerCase() === trimmed.toLowerCase()
        );
        if (matchedMember) {
          key = matchedMember.uid || trimmed.toLowerCase();
          name = matchedMember.username;
          uid = matchedMember.uid;
        } else {
          key = `name_${trimmed.toLowerCase()}`;
          name = trimmed;
          uid = '';
        }
      } else {
        key = '__unassigned__';
        name = 'General Fund (Unassigned)';
        uid = '';
      }

      if (!map.has(key)) {
        map.set(key, {
          uid,
          name,
          role: 'student',
          rawEntries: [],
        });
      }

      map.get(key)!.rawEntries.push(e);
    });

    // Compute for each member: chronological sort, running balance, auto add/subtract
    const result: MemberBalanceGroup[] = [];

    map.forEach((item, key) => {
      // Sort entries chronologically: oldest first for running balance calculation
      const sorted = [...item.rawEntries].sort((a, b) => {
        const dateCompare = a.entryDate.localeCompare(b.entryDate);
        if (dateCompare !== 0) return dateCompare;
        return (a.id || '').localeCompare(b.id || '');
      });

      let running = 0;
      let totalAdd = 0;
      let totalSub = 0;
      let verifiedCount = 0;
      let flaggedCount = 0;

      const entriesWithRunning: MemberEntryRecord[] = sorted.map((entry) => {
        const amt = Number(entry.amount) || 0;
        if (entry.type === 'add') {
          running += amt;
          totalAdd += amt;
        } else {
          running -= amt;
          totalSub += amt;
        }

        if (entry.verified) verifiedCount++;
        if (entry.flagged) flaggedCount++;

        return {
          ...entry,
          runningBalance: running,
        };
      });

      // Show newest first for table display
      const displayEntries = [...entriesWithRunning].reverse();
      const lastDate = sorted.length > 0 ? sorted[sorted.length - 1].entryDate : '—';

      result.push({
        key,
        uid: item.uid,
        name: item.name,
        role: item.role,
        totalAdded: totalAdd,
        totalSubtracted: totalSub,
        finalBalance: totalAdd - totalSub,
        entriesCount: sorted.length,
        verifiedCount,
        flaggedCount,
        entries: displayEntries,
        lastDate,
      });
    });

    // Sort groups: current user first, then by entries count, then alphabetically
    return result.sort((a, b) => {
      if (a.uid === currentUserId) return -1;
      if (b.uid === currentUserId) return 1;
      if (a.key === '__unassigned__') return 1;
      if (b.key === '__unassigned__') return -1;
      if (b.entriesCount !== a.entriesCount) return b.entriesCount - a.entriesCount;
      return a.name.localeCompare(b.name);
    });
  }, [entries, members, currentUserId]);

  // Selected member group
  const activeMember = useMemo(() => {
    if (!memberGroups.length) return null;
    if (selectedMemberKey) {
      const found = memberGroups.find(
        (g) => g.key === selectedMemberKey || g.uid === selectedMemberKey
      );
      if (found) return found;
    }
    return memberGroups[0];
  }, [memberGroups, selectedMemberKey]);

  // Filtered members list
  const filteredMemberGroups = useMemo(() => {
    return memberGroups.filter((g) => {
      // search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = g.name.toLowerCase().includes(q);
        const matchRole = g.role?.toLowerCase().includes(q);
        if (!matchName && !matchRole) return false;
      }
      // balance filter
      if (filterBalance === 'positive' && g.finalBalance <= 0) return false;
      if (filterBalance === 'negative' && g.finalBalance >= 0) return false;
      if (filterBalance === 'zero' && g.finalBalance !== 0) return false;

      return true;
    });
  }, [memberGroups, searchQuery, filterBalance]);

  // Overall Room-wide member balance summary
  const summaryMetrics = useMemo(() => {
    let totalAddedAll = 0;
    let totalSubtractedAll = 0;
    let membersWithBalanceCount = 0;

    memberGroups.forEach((g) => {
      if (g.key !== '__unassigned__') {
        totalAddedAll += g.totalAdded;
        totalSubtractedAll += g.totalSubtracted;
        if (g.finalBalance !== 0) membersWithBalanceCount++;
      }
    });

    return {
      totalAdded: totalAddedAll,
      totalSubtracted: totalSubtractedAll,
      netBalance: totalAddedAll - totalSubtractedAll,
      membersWithBalanceCount,
    };
  }, [memberGroups]);

  // Export CSV for active member's chronological statement
  const exportMemberStatementCsv = (group: MemberBalanceGroup) => {
    const headers = [
      'Date',
      'Transaction Title',
      'Action (Add/Subtract)',
      'Amount Added or Subtracted',
      'Resulting Balance',
      'Category',
      'Verification Status',
      'Auditor Name',
      'Reference Note',
      'Audit Note',
    ];

    // Sorted chronological for clean ledger accounting
    const chronological = [...group.entries].reverse();

    const csvRows = chronological.map((e) => [
      e.entryDate,
      `"${e.title.replace(/"/g, '""')}"`,
      e.type === 'add' ? 'Added (+)' : 'Subtracted (-)',
      e.type === 'add' ? `+${e.amount.toFixed(2)}` : `-${e.amount.toFixed(2)}`,
      e.runningBalance.toFixed(2),
      `"${e.category.replace(/"/g, '""')}"`,
      e.verified ? 'Verified' : 'Pending',
      `"${(e.verifiedByName || '').replace(/"/g, '""')}"`,
      `"${(e.note || '').replace(/"/g, '""')}"`,
      `"${(e.auditNote || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...csvRows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `statement_${group.name.replace(/\s+/g, '_')}_${roomId}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Explanation */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-slate-100 text-slate-800">
                <Users className="w-4 h-4" />
              </span>
              <h2 className="text-base font-bold text-slate-900">
                Student & Member Ledger Balances
              </h2>
            </div>
            <p className="text-xs text-slate-500 max-w-2xl">
              All transactions assigned to each member automatically add (+) contributions and subtract (-) disbursements or fees.
              View the real-time final balance, full date breakdown, and audit verification for every student.
            </p>
          </div>

          {/* Quick Stats Strip */}
          <div className="flex items-center gap-4 text-xs">
            <div className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg">
              <span className="text-slate-500">Members Tracked: </span>
              <span className="font-bold text-slate-900 font-mono">
                {memberGroups.filter((g) => g.key !== '__unassigned__').length}
              </span>
            </div>
            <div className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800">
              <span>Total Member Inflows: </span>
              <span className="font-bold font-mono">+{fmtMoney(symbol, summaryMetrics.totalAdded)}</span>
            </div>
            <div className="px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg text-red-700">
              <span>Total Disbursements: </span>
              <span className="font-bold font-mono">-{fmtMoney(symbol, summaryMetrics.totalSubtracted)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Two-Column Master-Detail Layout */}
      <div className="grid lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (5 Cols): Member Roster & Quick Balances */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <span>All Assigned Members</span>
              <span className="px-2 py-0.5 text-[11px] font-mono bg-slate-100 text-slate-700 rounded-md">
                {filteredMemberGroups.length}
              </span>
            </h3>

            {/* Quick My Account Shortcut */}
            {currentUserId && (
              <button
                type="button"
                onClick={() => setSelectedMemberKey(currentUserId)}
                className={`text-xs px-2 py-1 rounded-md font-medium transition-colors ${
                  activeMember?.uid === currentUserId
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                My Statement
              </button>
            )}
          </div>

          {/* Search & Filter Controls */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search member by name or role…"
                className="w-full border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto text-[11px]">
              {(
                [
                  ['all', 'All'],
                  ['positive', 'Positive (+)'],
                  ['negative', 'Deficit (-)'],
                  ['zero', 'Zero Balance'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilterBalance(key)}
                  className={`px-2 py-1 font-medium rounded-md transition-colors whitespace-nowrap ${
                    filterBalance === key
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Members List with Final Balances */}
          <div className="divide-y divide-slate-100 max-h-[580px] overflow-y-auto pr-1">
            {filteredMemberGroups.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No members match the search or filter criteria.
              </div>
            ) : (
              filteredMemberGroups.map((group) => {
                const isSelected = activeMember?.key === group.key;
                const isMe = group.uid === currentUserId;

                return (
                  <div
                    key={group.key}
                    onClick={() => setSelectedMemberKey(group.key)}
                    className={`p-3 rounded-xl transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'hover:bg-slate-50 text-slate-900'
                    }`}
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs truncate">
                          {group.name}
                        </span>
                        {isMe && (
                          <span
                            className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${
                              isSelected
                                ? 'bg-white/20 text-white'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            You
                          </span>
                        )}
                        {group.role && (
                          <span
                            className={`text-[10px] capitalize px-1.5 py-0.2 rounded font-medium ${
                              isSelected
                                ? 'bg-white/10 text-slate-300'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {group.role}
                          </span>
                        )}
                      </div>

                      <div
                        className={`text-[11px] flex items-center gap-2 ${
                          isSelected ? 'text-slate-300' : 'text-slate-500'
                        }`}
                      >
                        <span>{group.entriesCount} entries</span>
                        <span>·</span>
                        <span>Last: {group.lastDate}</span>
                      </div>
                    </div>

                    {/* Final Balance (Auto Calculated) */}
                    <div className="text-right shrink-0 space-y-0.5">
                      <div className="text-[10px] uppercase tracking-wider font-medium opacity-75">
                        Final Balance
                      </div>
                      <div
                        className={`text-sm font-bold font-mono tabular-nums ${
                          isSelected
                            ? group.finalBalance < 0
                              ? 'text-red-300'
                              : 'text-emerald-300'
                            : group.finalBalance < 0
                            ? 'text-red-600'
                            : group.finalBalance > 0
                            ? 'text-emerald-700'
                            : 'text-slate-500'
                        }`}
                      >
                        {fmtMoney(symbol, group.finalBalance)}
                      </div>
                      <div
                        className={`text-[10px] font-mono tabular-nums flex items-center justify-end gap-1.5 ${
                          isSelected ? 'text-slate-300' : 'text-slate-400'
                        }`}
                      >
                        <span className="text-emerald-500">+{fmtMoney(symbol, group.totalAdded)}</span>
                        <span>/</span>
                        <span className="text-red-400">-{fmtMoney(symbol, group.totalSubtracted)}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column (7 Cols): Comprehensive Statement & Auto Add/Subtract Breakdown */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-5">
          {activeMember ? (
            <>
              {/* Active Member Header & Actions */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900">
                      Statement of Account: {activeMember.name}
                    </h3>
                    {activeMember.uid === currentUserId && (
                      <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-800 rounded font-medium">
                        Your Account
                      </span>
                    )}
                    {activeMember.role && (
                      <span className="text-xs capitalize px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                        {activeMember.role}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    Chronological audit ledger showing every date, amount added (+), amount subtracted (-), and resulting balance.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => exportMemberStatementCsv(activeMember)}
                  className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-1.5 shadow-xs whitespace-nowrap text-slate-700"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Statement (CSV)</span>
                </button>
              </div>

              {/* KPI Cards: Auto Calculated Final Balance, Total Added, Total Subtracted */}
              <div className="grid sm:grid-cols-3 gap-3">
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <div className="text-[11px] font-semibold text-slate-500 flex items-center justify-between">
                    <span>Final Net Balance</span>
                    <Wallet className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                  <div
                    className={`text-xl font-bold font-mono tabular-nums ${
                      activeMember.finalBalance < 0
                        ? 'text-red-600'
                        : activeMember.finalBalance > 0
                        ? 'text-emerald-700'
                        : 'text-slate-900'
                    }`}
                  >
                    {fmtMoney(symbol, activeMember.finalBalance)}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Auto calculated from {activeMember.entriesCount} transactions
                  </div>
                </div>

                <div className="p-3.5 bg-emerald-50/60 border border-emerald-200/80 rounded-xl space-y-1">
                  <div className="text-[11px] font-semibold text-emerald-800 flex items-center justify-between">
                    <span>Total Added (+)</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />
                  </div>
                  <div className="text-xl font-bold font-mono tabular-nums text-emerald-700">
                    +{fmtMoney(symbol, activeMember.totalAdded)}
                  </div>
                  <div className="text-[11px] text-emerald-800/80">
                    {activeMember.entries.filter((e) => e.type === 'add').length} fund contributions
                  </div>
                </div>

                <div className="p-3.5 bg-red-50/60 border border-red-200/80 rounded-xl space-y-1">
                  <div className="text-[11px] font-semibold text-red-800 flex items-center justify-between">
                    <span>Total Subtracted (-)</span>
                    <ArrowDownRight className="w-3.5 h-3.5 text-red-600" />
                  </div>
                  <div className="text-xl font-bold font-mono tabular-nums text-red-600">
                    -{fmtMoney(symbol, activeMember.totalSubtracted)}
                  </div>
                  <div className="text-[11px] text-red-800/80">
                    {activeMember.entries.filter((e) => e.type === 'subtract').length} expenses/fees
                  </div>
                </div>
              </div>

              {/* Detailed Transaction Breakdown Table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <div className="font-semibold text-slate-800">
                    Transaction Ledger & Running Balance History
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {activeMember.verifiedCount} of {activeMember.entriesCount} verified by Auditor
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Transaction / Purpose</th>
                        <th className="py-2.5 px-3">Type</th>
                        <th className="py-2.5 px-3 text-right">Amount (+ / -)</th>
                        <th className="py-2.5 px-3 text-right">Resulting Balance</th>
                        <th className="py-2.5 px-3">Verification</th>
                        {(canModifyExpenses || canVerifyEntries) && (
                          <th className="py-2.5 px-3 text-right">Action</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeMember.entries.length === 0 ? (
                        <tr>
                          <td
                            colSpan={canModifyExpenses || canVerifyEntries ? 7 : 6}
                            className="py-10 text-center text-slate-400 space-y-1"
                          >
                            <div>No financial transactions logged yet for this member.</div>
                            <div className="text-[11px] text-slate-400">
                              When the Treasurer records a fund contribution or deduction for this student, it will auto add or subtract here.
                            </div>
                          </td>
                        </tr>
                      ) : (
                        activeMember.entries.map((entry) => {
                          const isAdd = entry.type === 'add';

                          return (
                            <tr key={entry.id} className="hover:bg-slate-50/80 transition-colors">
                              {/* Date */}
                              <td className="py-2.5 px-3 font-mono text-slate-700 whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => onSelectDate && onSelectDate(entry.entryDate)}
                                  className="hover:underline flex items-center gap-1 text-slate-800"
                                  title="View on calendar"
                                >
                                  <Calendar className="w-3 h-3 text-slate-400" />
                                  <span>{entry.entryDate}</span>
                                </button>
                              </td>

                              {/* Title, Category & Note */}
                              <td className="py-2.5 px-3 max-w-[200px]">
                                <div className="font-semibold text-slate-900 truncate">
                                  {entry.title}
                                </div>
                                <div className="text-[11px] text-slate-500 flex items-center gap-1 truncate">
                                  <span>{entry.category}</span>
                                  {entry.note && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span className="truncate">{entry.note}</span>
                                    </>
                                  )}
                                </div>
                              </td>

                              {/* Type: Explicit Add / Subtract Badge */}
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                {isAdd ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                                    <ArrowUpRight className="w-3 h-3" />
                                    <span>Added (+)</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded">
                                    <ArrowDownRight className="w-3 h-3" />
                                    <span>Subtracted (-)</span>
                                  </span>
                                )}
                              </td>

                              {/* Amount Added or Subtracted */}
                              <td
                                className={`py-2.5 px-3 text-right font-mono font-semibold tabular-nums whitespace-nowrap ${
                                  isAdd ? 'text-emerald-700' : 'text-red-600'
                                }`}
                              >
                                {isAdd ? '+' : '-'}
                                {fmtMoney(symbol, entry.amount)}
                              </td>

                              {/* Resulting Running Balance */}
                              <td
                                className={`py-2.5 px-3 text-right font-mono font-bold tabular-nums whitespace-nowrap ${
                                  entry.runningBalance < 0
                                    ? 'text-red-600'
                                    : entry.runningBalance > 0
                                    ? 'text-slate-900'
                                    : 'text-slate-500'
                                }`}
                              >
                                {fmtMoney(symbol, entry.runningBalance)}
                              </td>

                              {/* Verification Status */}
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                {entry.flagged ? (
                                  <span className="text-[11px] text-amber-700 font-medium flex items-center gap-1">
                                    <Flag className="w-3 h-3" />
                                    <span>Flagged</span>
                                  </span>
                                ) : entry.verified ? (
                                  <span className="text-[11px] text-emerald-700 font-medium flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span>Verified</span>
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-slate-400">
                                    Pending
                                  </span>
                                )}
                              </td>

                              {/* Action Buttons for Treasurer or Auditor */}
                              {(canModifyExpenses || canVerifyEntries) && (
                                <td className="py-2.5 px-3 text-right whitespace-nowrap">
                                  <div className="flex items-center justify-end gap-1">
                                    {canVerifyEntries && onVerifyEntry && (
                                      <button
                                        type="button"
                                        onClick={() => onVerifyEntry(entry, !entry.verified)}
                                        className="p-1 rounded text-slate-500 hover:text-emerald-700 hover:bg-emerald-50"
                                        title={entry.verified ? 'Unverify' : 'Verify'}
                                      >
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                    {canVerifyEntries && onFlagEntry && (
                                      <button
                                        type="button"
                                        onClick={() => onFlagEntry(entry, !entry.flagged)}
                                        className="p-1 rounded text-slate-500 hover:text-amber-700 hover:bg-amber-50"
                                        title={entry.flagged ? 'Clear Flag' : 'Flag'}
                                      >
                                        <Flag className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                    {canModifyExpenses && onEditEntry && (
                                      <button
                                        type="button"
                                        onClick={() => onEditEntry(entry)}
                                        className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                                        title="Modify Entry"
                                      >
                                        <Edit3 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Explanatory footer */}
                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                  <span>
                    Each line calculates the auto running balance at that point in time.
                  </span>
                  <span>
                    Final Balance = Sum of all (+) Added minus all (-) Subtracted.
                  </span>
                </div>
              </div>
            </>
          ) : (
            <div className="py-12 text-center text-xs text-slate-400 space-y-1">
              <div>Select a member from the left roster to view their statement.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
