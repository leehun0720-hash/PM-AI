import { Building2, Menu } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ROLE_LABEL, type Role } from '../domain/types';
import { useStore } from '../store/store';
import { COMMON, type NavItem, ROLE_WORKSPACES, visibleItems, type Workspace, workspaceFor, WORKSPACES } from './nav';

export default function AppShell() {
  const [open, setOpen] = useState(false);
  const buildings = useStore((s) => s.buildings);
  const buildingId = useStore((s) => s.buildingId);
  const setBuilding = useStore((s) => s.setBuilding);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const pending = useStore((s) => s.approvals.filter((a) => a.status === 'pending').length);
  const navigate = useNavigate();
  const ws = workspaceFor(settings.role, settings.workspace);
  const allowed = ROLE_WORKSPACES[settings.role];
  const items = visibleItems(ws, settings.role);
  // 작업공간을 바꾸면 그 작업공간의 첫 전용 화면으로 이동(대시보드는 공통이라 건너뜀)
  const switchWorkspace = (w: Workspace) => {
    updateSettings({ workspace: w });
    const first = visibleItems(w, settings.role).find((i) => i.to !== '/');
    navigate(first?.to ?? '/');
  };
  const switchRole = (r: Role) => {
    updateSettings({ role: r, workspace: ROLE_WORKSPACES[r][0] });
    navigate('/');
  };
  const link = (i: NavItem) => (
    <NavLink key={i.to} to={i.to} end={i.to === '/'} onClick={() => setOpen(false)} className={({ isActive }) => `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm ${isActive ? 'bg-brand-500 font-semibold text-white' : 'hover:bg-white/10'}`}>
      <i.icon size={16} />
      <span className="flex-1">{i.label}</span>
      {i.to === '/approvals' && pending > 0 && <span className="num rounded-full bg-amber-400 px-1.5 text-[11px] font-bold text-ink">{pending}</span>}
    </NavLink>
  );

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
        {allowed.length > 1 && (
          <div className="mx-3 mb-3 grid gap-1 rounded-xl bg-white/5 p-1" style={{ gridTemplateColumns: `repeat(${allowed.length}, minmax(0, 1fr))` }} role="tablist" aria-label="작업공간">
            {WORKSPACES.filter((w) => allowed.includes(w.id)).map((w) => (
              <button key={w.id} role="tab" aria-selected={w.id === ws} title={`${w.label} — ${w.desc}`} onClick={() => switchWorkspace(w.id)}
                className={`rounded-lg px-1 py-1.5 text-xs font-semibold ${w.id === ws ? 'bg-white text-ink' : 'text-slate-300 hover:bg-white/10'}`}>
                {w.label.split(' ')[0]}
              </button>
            ))}
          </div>
        )}
        <nav className="px-3 pb-6">
          <div className="mb-3">
            <p className="px-2 pb-1 pt-1 text-[11px] font-semibold text-slate-500">{WORKSPACES.find((w) => w.id === ws)!.label} · {WORKSPACES.find((w) => w.id === ws)!.desc}</p>
            {items.map(link)}
          </div>
          <div className="mb-3">
            <p className="px-2 pb-1 pt-2 text-[11px] font-semibold text-slate-500">기타</p>
            {COMMON.map(link)}
          </div>
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
            <select aria-label="역할 전환" value={settings.role} onChange={(e) => switchRole(e.target.value as Role)} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm">
              {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </div>
        </header>
        <main className="p-4 sm:p-6"><Outlet /></main>
      </div>
    </div>
  );
}
