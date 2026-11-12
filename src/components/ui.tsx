import { X } from 'lucide-react';
import type { ReactNode } from 'react';

// 차트 색: 범주형은 고정 순서(파랑→주황→청록), 상태색은 별도 예약
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'];
export const GRID = '#e6eaf0';
export const AXIS = { fontSize: 11, fill: '#5b6779' };

export function Page({ title, desc, actions, children }: { title: string; desc?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
          {desc && <p className="mt-1 text-sm text-slate-500">{desc}</p>}
        </div>
        {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function Card({ title, right, children, className = '' }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white ${className}`}>
      {(title || right) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {right}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, tone = 'default' }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'default' | 'bad' | 'good' | 'warn' }) {
  const c = { default: 'text-ink', bad: 'text-red-600', good: 'text-emerald-600', warn: 'text-amber-600' }[tone];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`num mt-1 text-2xl font-bold tracking-tight ${c}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

type Tone = 'gray' | 'blue' | 'green' | 'amber' | 'red' | 'violet';
const TONES: Record<Tone, string> = {
  gray: 'bg-slate-100 text-slate-700', blue: 'bg-brand-50 text-brand-700', green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-800', red: 'bg-red-50 text-red-700', violet: 'bg-violet-50 text-violet-700',
};
export function Badge({ tone = 'gray', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>{children}</span>;
}

export const STATUS_TONE: Record<string, Tone> = { draft: 'gray', pending: 'amber', approved: 'green', rejected: 'red', received: 'blue' };
export const STATUS_LABEL: Record<string, string> = { draft: '초안', pending: '승인 대기', approved: '승인', rejected: '반려', received: '입고 완료' };
export const StatusBadge = ({ status }: { status: string }) => <Badge tone={STATUS_TONE[status] ?? 'gray'}>{STATUS_LABEL[status] ?? status}</Badge>;

/** 샘플·예시값 표시 */
export const SampleTag = ({ children = '샘플 데이터' }: { children?: ReactNode }) => <Badge tone="violet">{children}</Badge>;

export function Btn({ variant = 'default', className = '', ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'danger' | 'ghost' }) {
  const v = {
    default: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
    primary: 'bg-brand-500 text-white hover:bg-brand-600',
    danger: 'border border-red-200 bg-white text-red-600 hover:bg-red-50',
    ghost: 'text-brand-600 hover:bg-brand-50',
  }[variant];
  return <button {...p} className={`inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${v} ${className}`} />;
}

export const inputCls = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';
export const th = 'whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-slate-500';
export const td = 'px-3 py-2 text-sm text-slate-700';
export const tdNum = 'num whitespace-nowrap px-3 py-2 text-right text-sm text-slate-700';

export function Table({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max">
        <thead className="border-b border-slate-200 bg-slate-50">{head}</thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="no-print fixed inset-0 z-50 flex justify-end bg-slate-900/30" onClick={onClose}>
      <aside className="h-full w-full max-w-lg overflow-y-auto bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <header className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button onClick={onClose} aria-label="닫기" className="rounded p-1 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
        </header>
        <div className="p-5">{children}</div>
      </aside>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="no-print flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${value === t.id ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => <p className="py-8 text-center text-sm text-slate-500">{children}</p>;

export const Note = ({ children }: { children: ReactNode }) => <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">{children}</p>;

export function ChartTip({ active, payload, label, unit = '' }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; unit?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-ink">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="num flex items-center gap-2 text-slate-700">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: p.color }} />
          {p.name}: {Math.round(p.value).toLocaleString('ko-KR')}{unit}
        </p>
      ))}
    </div>
  );
}
