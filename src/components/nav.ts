// 작업공간(AM·PM·FM)별 메뉴. 하는 일이 달라 메뉴 구성이 다르다(2026-11-12 이사님 지시, 배치는 초안).
//  AM 자산관리 — 판단·전략(포트폴리오·NOI, 임대 전략, 투자자 보고, 실사)
//  PM 임대·운영 — 정산·계약(관리비, 임대차, 관리단, 회계, 법무)
//  FM 시설     — 현장·설비(설비 이력·작업지시, 법정점검·민원, 외주, 재고, 수광열비)
import {
  BarChart3, BookOpenCheck, Bot, Calculator, ClipboardCheck, FileSignature, FileText, Gavel, History, LayoutDashboard, type LucideIcon,
  Package, Receipt, Settings as SettingsIcon, ShieldAlert, Sparkles, Stamp, Target, Users, Wrench, Zap,
} from 'lucide-react';
import type { Role } from '../domain/types';

export type Workspace = 'am' | 'pm' | 'fm';
export interface NavItem { to: string; label: string; icon: LucideIcon; roles?: Role[] }

const STAFF: Role[] = ['amc', 'pm', 'fm'];

export const WORKSPACES: { id: Workspace; label: string; desc: string; items: NavItem[] }[] = [
  {
    id: 'am', label: 'AM 자산관리', desc: '판단·전략',
    items: [
      { to: '/', label: '대시보드', icon: LayoutDashboard },
      { to: '/am/portfolio', label: '포트폴리오·NOI', icon: BarChart3, roles: ['amc'] },
      { to: '/am/leasing', label: '임대 전략', icon: Target, roles: ['amc'] },
      { to: '/am/report', label: '투자자 보고', icon: FileText, roles: ['amc'] },
      { to: '/due-diligence', label: '실사 리스크', icon: ShieldAlert, roles: ['amc'] },
      { to: '/ask', label: 'AI 판단 보조', icon: Bot, roles: ['amc'] },
      { to: '/approvals', label: '승인함', icon: Stamp, roles: ['amc'] },
    ],
  },
  {
    id: 'pm', label: 'PM 임대·운영', desc: '정산·계약',
    items: [
      { to: '/', label: '대시보드', icon: LayoutDashboard },
      { to: '/charges', label: '관리비', icon: Receipt },
      { to: '/leases', label: '임대차', icon: FileSignature, roles: ['amc', 'pm'] },
      { to: '/association', label: '관리단', icon: Users, roles: ['amc', 'pm', 'owner'] },
      { to: '/accounting', label: '회계', icon: Calculator, roles: ['amc', 'pm'] },
      { to: '/legal', label: '법무', icon: Gavel, roles: ['amc', 'pm'] },
      { to: '/ask', label: 'AI 비서', icon: Bot },
      { to: '/approvals', label: '승인함', icon: Stamp, roles: STAFF },
      { to: '/audit', label: '감사 로그', icon: History, roles: ['amc', 'pm'] },
    ],
  },
  {
    id: 'fm', label: 'FM 시설', desc: '현장·설비',
    items: [
      { to: '/', label: '대시보드', icon: LayoutDashboard },
      { to: '/fm/assets', label: '설비 이력·작업지시', icon: Wrench, roles: STAFF },
      { to: '/admin', label: '법정점검·민원', icon: ClipboardCheck, roles: [...STAFF, 'tenant'] },
      { to: '/vendors', label: '외주계약', icon: BookOpenCheck, roles: STAFF },
      { to: '/inventory', label: '수발주·재고', icon: Package, roles: STAFF },
      { to: '/utilities', label: '수광열비', icon: Zap, roles: STAFF },
      { to: '/ask', label: 'AI 비서', icon: Bot, roles: STAFF },
      { to: '/approvals', label: '승인함', icon: Stamp, roles: STAFF },
    ],
  },
];

/** 모든 작업공간 아래에 붙는 공통 메뉴 */
export const COMMON: NavItem[] = [
  { to: '/services', label: '부가 서비스', icon: Sparkles },
  { to: '/settings', label: '설정', icon: SettingsIcon },
];

/** 역할이 들어갈 수 있는 작업공간(첫 번째가 기본값). 운용사는 셋 다, PM사는 PM·FM, FM사는 FM만. */
export const ROLE_WORKSPACES: Record<Role, Workspace[]> = {
  amc: ['am', 'pm', 'fm'],
  pm: ['pm', 'fm'],
  fm: ['fm'],
  owner: ['pm'],
  tenant: ['pm', 'fm'],
};

export const visibleItems = (ws: Workspace, role: Role) =>
  WORKSPACES.find((w) => w.id === ws)!.items.filter((i) => !i.roles || i.roles.includes(role));

/** 저장된 작업공간이 역할에 맞지 않으면(역할 변경·이전 버전 저장값) 역할 기본값으로 */
export const workspaceFor = (role: Role, saved?: Workspace): Workspace =>
  saved && ROLE_WORKSPACES[role].includes(saved) ? saved : ROLE_WORKSPACES[role][0];

