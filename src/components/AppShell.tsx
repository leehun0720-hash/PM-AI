import {
  BookOpenCheck, Bot, Building2, Calculator, ClipboardCheck, FileSignature, Gavel, History, LayoutDashboard, type LucideIcon, Menu, Package,
  Receipt, Settings as SettingsIcon, Sparkles, Stamp, Users, Zap,
} from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { ROLE_LABEL, type Role } from '../domain/types';
import { useStore } from '../store/store';

interface NavItem { to: string; label: string; icon: LucideIcon; roles?: Role[] }
const STAFF: Role[] = ['amc', 'pm', 'fm'];

export const NAV: { group: string; items: NavItem[] }[] = [
  { group: '', items: [{ to: '/', label: '대시보드', icon: LayoutDashboard }] },
  {
    group: '핵심 업무', items: [
      { to: '/charges', label: '관리비', icon: Receipt },
      { to: '/leases', label: '임대차', icon: FileSignature, roles: ['amc', 'pm'] },
      { to: '/utilities', label: '수광열비', icon: Zap, roles: STAFF },
      { to: '/association', label: '관리단', icon: Users, roles: ['amc', 'pm', 'owner'] },
      { to: '/admin', label: '행정', icon: ClipboardCheck, roles: [...STAFF, 'tenant'] },
      { to: '/legal', label: '법무', icon: Gavel, roles: ['amc', 'pm'] },
      { to: '/vendors', label: '외주계약', icon: BookOpenCheck, roles: STAFF },
      { to: '/accounting', label: '회계', icon: Calculator, roles: ['amc', 'pm'] },
      { to: '/inventory', label: '수발주·재고', icon: Package, roles: STAFF },
      { to: '/ask', label: 'AI 비서', icon: Bot },
    ],
  },
  {
    group: '통제', items: [
      { to: '/approvals', label: '승인함', icon: Stamp, roles: STAFF },
      { to: '/audit', label: '감사 로그', icon: History, roles: ['amc', 'pm'] },
    ],
  },
  {
    group: '기타', items: [
      { to: '/services', label: '부가 서비스', icon: Sparkles },
      { to: '/settings', label: '설정', icon: SettingsIcon },
    ],
  },
];

export default function AppShell() {
  const [open, setOpen] = useState(false);
  const buildings = useStore((s) => s.buildings);
  const buildingId = useStore((s) => s.buildingId);
  const setBuilding = useStore((s) => s.setBuilding);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const pending = useStore((s) => s.approvals.filter((a) => a.status === 'pending').length);

  return (
    <div className="min-h-screen lg:flex">
      <aside className={`no-print fixed inset-y-0 left-0 z-40 w-60 shrink-0 overflow-y-auto bg-ink text-slate-300 transition-transform lg:static lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500 text-white"><Building2 size={18} /></div>
          <div>
            <p className="text-base font-bold leading-none text-white">PMAI</p>
            <p className="mt-1 text-[10px] tracking-wide text-slate-400">운영 인텔리전스</p>
          </div>
        </div>
        <nav className="px-3 pb-6">
          {NAV.map((g) => {
            const items = g.items.filter((i) => !i.roles || i.roles.includes(settings.role));
            if (!items.length) return null;
            return (
              <div key={g.group} className="mb-3">
                {g.group && <p className="px-2 pb-1 pt-2 text-[11px] font-semibold text-slate-500">{g.group}</p>}
                {items.map((i) => (
                  <NavLink key={i.to} to={i.to} end={i.to === '/'} onClick={() => setOpen(false)} className={({ isActive }) => `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm ${isActive ? 'bg-brand-500 font-semibold text-white' : 'hover:bg-white/10'}`}>
                    <i.icon size={16} />
                    <span className="flex-1">{i.label}</span>
                    {i.to === '/approvals' && pending > 0 && <span className="num rounded-full bg-amber-400 px-1.5 text-[11px] font-bold text-ink">{pending}</span>}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="min-w-0 flex-1">
        <header className="no-print sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur">
          <button className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="메뉴"><Menu size={20} /></button>
          <select aria-label="건물 선택" value={buildingId} onChange={(e) => setBuilding(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-semibold">
            {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <span className="rounded-md bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">샘플 데이터</span>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <span className="hidden text-slate-500 sm:inline">{settings.userName}</span>
            <select aria-label="역할 전환" value={settings.role} onChange={(e) => updateSettings({ role: e.target.value as Role })} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm">
              {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </div>
        </header>
        <main className="p-4 sm:p-6"><Outlet /></main>
      </div>
    </div>
  );
}
