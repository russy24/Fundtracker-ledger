import React from 'react';
import { X, Plus, Trash2, Users, Calendar, DollarSign, Tag, FileText, User, Wallet } from 'lucide-react';
import { CurrencySymbol, RoleType } from '../types';
import { fmtMoney } from './MonthCalendar';

export interface BatchRow {
  key: string;
  contributorUid: string;
  contributorName: string;
  title: string;
  amount: string;
  type: 'add' | 'subtract';
  category: string;
  note: string;
}

interface RosterPerson {
  uid: string;
  name: string;
  role: RoleType;
}

interface EntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  isEditing: boolean;
  entryBusy: boolean;
  entryError: string;
  symbol: CurrencySymbol;
  categories: string[];
  memberBalances?: Record<string, number>;
  // Single Entry Form State
  entryTitle: string;
  setEntryTitle: (v: string) => void;
  entryCategory: string;
  setEntryCategory: (v: string) => void;
  entryAmount: string;
  setEntryAmount: (v: string) => void;
  entryType: 'add' | 'subtract';
  setEntryType: (v: 'add' | 'subtract') => void;
  entryDate: string;
  setEntryDate: (v: string) => void;
  entryNote: string;
  setEntryNote: (v: string) => void;
  entryContributorUid: string;
  setEntryContributorUid: (v: string) => void;
  entryContributorName: string;
  setEntryContributorName: (v: string) => void;
  onSaveSingle: (e: React.FormEvent) => void;
  // Batch Entry Form State
  batchRows: BatchRow[];
  updateBatchRow: (key: string, patch: Partial<BatchRow>) => void;
  addBatchRow: () => void;
  removeBatchRow: (key: string) => void;
  fillRowsWithEveryone: () => void;
  onSaveBatch: (e: React.FormEvent) => void;
  rosterPeople: RosterPerson[];
  members: { uid: string; username: string; role: RoleType }[];
  isTreasurer: boolean;
  myUsername: string;
  maxBatchRows: number;
}

export const EntryModal: React.FC<EntryModalProps> = ({
  isOpen,
  onClose,
  isEditing,
  entryBusy,
  entryError,
  symbol,
  categories,
  memberBalances = {},
  entryTitle,
  setEntryTitle,
  entryCategory,
  setEntryCategory,
  entryAmount,
  setEntryAmount,
  entryType,
  setEntryType,
  entryDate,
  setEntryDate,
  entryNote,
  setEntryNote,
  entryContributorUid,
  setEntryContributorUid,
  entryContributorName,
  setEntryContributorName,
  onSaveSingle,
  batchRows,
  updateBatchRow,
  addBatchRow,
  removeBatchRow,
  fillRowsWithEveryone,
  onSaveBatch,
  rosterPeople,
  members,
  isTreasurer,
  myUsername,
  maxBatchRows,
}) => {
  const [mode, setMode] = React.useState<'single' | 'batch'>('single');

  // If opening in edit mode, force single mode
  React.useEffect(() => {
    if (isEditing) {
      setMode('single');
    }
  }, [isEditing]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-150">
      <div
        className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {isEditing ? 'Edit Ledger Entry' : 'Record Transaction'}
            </h2>
            <p className="text-xs text-slate-500">
              {isTreasurer ? 'Recording as Treasurer' : 'Recording as Authorized Auditor'} · {entryDate}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Toggle (if not editing) */}
        {!isEditing && (
          <div className="px-6 pt-4 pb-1">
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg text-xs font-medium">
              <button
                type="button"
                onClick={() => setMode('single')}
                className={`py-1.5 rounded-md transition-colors ${
                  mode === 'single' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Single Transaction
              </button>
              <button
                type="button"
                onClick={() => setMode('batch')}
                className={`py-1.5 rounded-md transition-colors ${
                  mode === 'batch' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Multi-Member Batch (e.g. Dues)
              </button>
            </div>
          </div>
        )}

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {mode === 'single' || isEditing ? (
            <form id="single-entry-form" onSubmit={onSaveSingle} className="space-y-4">
              <div className="grid sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Description / Purpose
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={120}
                    value={entryTitle}
                    onChange={(e) => setEntryTitle(e.target.value)}
                    placeholder="e.g. Annual Membership Fee, Venue Rental"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Date
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
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Type
                  </label>
                  <select
                    value={entryType}
                    onChange={(e) => setEntryType(e.target.value as 'add' | 'subtract')}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    <option value="add">Income / Fund Inflow (+)</option>
                    <option value="subtract">Expense / Outflow (-)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
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
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Category
                  </label>
                  <select
                    value={entryCategory}
                    onChange={(e) => setEntryCategory(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Assign to Member (for personal report)
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
                    <option value="">General Organization / Unassigned</option>
                    {members.map((m) => {
                      const bal = memberBalances[m.uid];
                      const balText = bal !== undefined ? ` · Bal: ${fmtMoney(symbol, bal)}` : '';
                      return (
                        <option key={m.uid} value={m.uid}>
                          {m.username} ({m.role}){balText}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
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

                {/* Auto Calculated Member Balance Feedback */}
                {(() => {
                  const lookupKey = entryContributorUid || (entryContributorName ? entryContributorName.trim().toLowerCase() : '');
                  const currentMemberBal = lookupKey && memberBalances[lookupKey] !== undefined ? memberBalances[lookupKey] : undefined;
                  const amtNum = Number(entryAmount) || 0;

                  if (currentMemberBal === undefined) return null;

                  const projected = entryType === 'add' ? currentMemberBal + amtNum : currentMemberBal - amtNum;

                  return (
                    <div className="sm:col-span-2 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-slate-700">
                          <Wallet className="w-3.5 h-3.5 text-slate-500" />
                          <span>Current Member Balance:</span>
                          <span
                            className={`font-mono font-bold ${
                              currentMemberBal < 0
                                ? 'text-red-600'
                                : currentMemberBal > 0
                                ? 'text-emerald-700'
                                : 'text-slate-700'
                            }`}
                          >
                            {fmtMoney(symbol, currentMemberBal)}
                          </span>
                        </div>

                        {amtNum > 0 && (
                          <div className="flex items-center gap-1.5 text-slate-700">
                            <span>Projected Balance ({entryType === 'add' ? '+' : '-'} {fmtMoney(symbol, amtNum)}):</span>
                            <span
                              className={`font-mono font-bold ${
                                projected < 0
                                  ? 'text-red-600'
                                  : projected > 0
                                  ? 'text-emerald-700'
                                  : 'text-slate-700'
                              }`}
                            >
                              {fmtMoney(symbol, projected)}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {entryType === 'add'
                          ? 'This amount will be added (+) to the student’s ledger balance.'
                          : 'This amount will be subtracted (-) from the student’s ledger balance.'}
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Receipt No. / Note (Optional)
                </label>
                <input
                  type="text"
                  maxLength={300}
                  value={entryNote}
                  onChange={(e) => setEntryNote(e.target.value)}
                  placeholder="e.g. OR #84920 · GCash reference #94827"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              {entryError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                  {entryError}
                </div>
              )}
            </form>
          ) : (
            <form id="batch-entry-form" onSubmit={onSaveBatch} className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Shared Date
                  </label>
                  <input
                    type="date"
                    required
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                    className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono bg-white"
                  />
                </div>
                <button
                  type="button"
                  onClick={fillRowsWithEveryone}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <Users className="w-3.5 h-3.5 text-slate-600" />
                  <span>Populate All Members ({rosterPeople.length})</span>
                </button>
              </div>

              <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                {batchRows.map((row, idx) => (
                  <div
                    key={row.key}
                    className="border border-slate-200 rounded-xl p-3.5 space-y-2 bg-slate-50/50 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-medium text-slate-500">
                        Line {idx + 1}
                      </span>
                      {batchRows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeBatchRow(row.key)}
                          className="text-slate-400 hover:text-red-600 transition-colors"
                          aria-label={`Remove row ${idx + 1}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="grid sm:grid-cols-2 gap-2">
                      <select
                        value={row.contributorUid}
                        onChange={(e) => {
                          const uid = e.target.value;
                          const person = rosterPeople.find((p) => p.uid === uid);
                          updateBatchRow(row.key, {
                            contributorUid: uid,
                            contributorName: person ? person.name : row.contributorName,
                          });
                        }}
                        className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                      >
                        <option value="">General Organization / Unassigned</option>
                        {rosterPeople.map((p) => {
                          const bal = memberBalances[p.uid];
                          const balText = bal !== undefined ? ` · Bal: ${fmtMoney(symbol, bal)}` : '';
                          return (
                            <option key={p.uid} value={p.uid}>
                              {p.name} ({p.role}){balText}
                            </option>
                          );
                        })}
                      </select>

                      <input
                        type="text"
                        maxLength={120}
                        value={row.title}
                        onChange={(e) => updateBatchRow(row.key, { title: e.target.value })}
                        placeholder="Description (optional)"
                        className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <select
                        value={row.type}
                        onChange={(e) =>
                          updateBatchRow(row.key, { type: e.target.value as 'add' | 'subtract' })
                        }
                        className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs bg-white font-medium"
                      >
                        <option value="add">Income (+)</option>
                        <option value="subtract">Expense (-)</option>
                      </select>

                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={row.amount}
                        onChange={(e) => updateBatchRow(row.key, { amount: e.target.value })}
                        placeholder={`Amount (${symbol})`}
                        className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono tabular-nums bg-white"
                      />

                      <select
                        value={row.category}
                        onChange={(e) => updateBatchRow(row.key, { category: e.target.value })}
                        className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs bg-white"
                      >
                        {categories.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>

                    <input
                      type="text"
                      maxLength={300}
                      value={row.note}
                      onChange={(e) => updateBatchRow(row.key, { note: e.target.value })}
                      placeholder="Receipt / reference note (optional)"
                      className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                    />
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addBatchRow}
                disabled={batchRows.length >= maxBatchRows}
                className="w-full py-2 border border-dashed border-slate-300 rounded-xl hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center justify-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Another Line</span>
              </button>

              {entryError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                  {entryError}
                </div>
              )}
            </form>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={entryBusy}
            className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-300 rounded-lg bg-white hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form={mode === 'single' || isEditing ? 'single-entry-form' : 'batch-entry-form'}
            disabled={entryBusy}
            className="px-5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>
              {entryBusy
                ? 'Saving…'
                : isEditing
                ? 'Update Entry'
                : mode === 'single'
                ? 'Record Entry'
                : `Save ${batchRows.filter((r) => r.amount.trim() !== '').length || ''} Entries`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
