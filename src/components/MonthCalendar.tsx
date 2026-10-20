import React from 'react';
import { LedgerEntry, CurrencySymbol } from '../types';
import { Flag, CheckCircle2 } from 'lucide-react';

interface MonthCalendarProps {
  month: Date;
  entries: LedgerEntry[];
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
  symbol: CurrencySymbol;
}

export function fmtMoney(symbol: string, n: number): string {
  const val = Number(n) || 0;
  return (
    (val < 0 ? '-' : '') +
    symbol +
    Math.abs(val).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

export function toDateKey(d: Date): string {
  // Local date (not UTC), so "today" is correct early in the morning in your time zone
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const MonthCalendar: React.FC<MonthCalendarProps> = ({
  month,
  entries,
  selectedDate,
  onSelectDate,
  symbol,
}) => {
  const y = month.getFullYear();
  const m = month.getMonth();
  const firstDow = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  const byDay: Record<string, LedgerEntry[]> = {};
  const monthPrefix = `${y}-${String(m + 1).padStart(2, '0')}`;
  entries.forEach((e) => {
    if (e.entryDate.slice(0, 7) === monthPrefix) {
      if (!byDay[e.entryDate]) byDay[e.entryDate] = [];
      byDay[e.entryDate].push(e);
    }
  });

  const todayKey = toDateKey(new Date());
  const cells: React.ReactNode[] = [];

  for (let i = 0; i < firstDow; i++) {
    cells.push(<div key={`pad-${i}`} className="h-16 sm:h-20" />);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const recs = byDay[key] || [];
    const net = recs.reduce(
      (sum, r) => sum + (r.type === 'subtract' ? -1 : 1) * Number(r.amount),
      0
    );
    const hasFlagged = recs.some((r) => r.flagged);
    const allVerified = recs.length > 0 && recs.every((r) => r.verified);
    const isSelected = key === selectedDate;
    const isToday = key === todayKey;

    cells.push(
      <button
        key={key}
        type="button"
        onClick={() => onSelectDate(isSelected ? null : key)}
        className={`h-16 sm:h-20 rounded-lg border text-left p-1.5 flex flex-col justify-between transition-colors relative ${
          isSelected
            ? 'border-slate-900 ring-2 ring-slate-900/15 bg-slate-50'
            : isToday
            ? 'border-slate-400 bg-slate-50/70 hover:bg-slate-100/60'
            : 'border-slate-200 bg-white hover:bg-slate-50'
        }`}
      >
        <div className="w-full flex items-center justify-between">
          <span
            className={`font-mono text-xs ${
              isSelected || isToday ? 'font-semibold text-slate-900' : 'text-slate-500'
            }`}
          >
            {d}
          </span>
          <div className="flex items-center gap-0.5">
            {hasFlagged && (
              <Flag className="w-3 h-3 text-amber-600 shrink-0" aria-label="Flagged entry" />
            )}
            {!hasFlagged && allVerified && (
              <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" aria-label="All entries verified" />
            )}
          </div>
        </div>

        {recs.length > 0 && (
          <div className="w-full truncate">
            <div
              className={`font-mono text-[11px] font-medium tabular-nums truncate ${
                net < 0 ? 'text-red-600' : 'text-emerald-700'
              }`}
            >
              {net > 0 ? '+' : ''}
              {fmtMoney(symbol, net)}
            </div>
            <div className="text-[10px] text-slate-400 truncate">
              {recs.length} {recs.length === 1 ? 'item' : 'items'}
            </div>
          </div>
        )}
      </button>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 mb-1.5 text-center text-xs font-medium text-slate-500">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <div key={day} className="py-1">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">{cells}</div>
    </div>
  );
};
