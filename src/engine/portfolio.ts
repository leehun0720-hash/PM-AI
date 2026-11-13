// 자산관리(AM) 지표 — 임대수입·NOI·임대율·만기 분포·임대료 단가.
// 원칙: 계산은 엔진이, 화면은 결과와 산식만 보여 준다.
import type { Budget, Building, ChargeItem, ChargeLine, Expense, ISODate, Lease, Month, Receivable, Unit } from '../domain/types';
import { walt } from './leaseEvents';
import { addMonthsToDate, daysBetween } from './money';

export const PORTFOLIO_VERSION = 'am-kpi-0.1 (예시 산식 · 회계 검토 전)';

export const isActive = (l: Lease, day: ISODate) => l.status === 'active' && l.start <= day && l.end >= day;

/** 렌트프리 기간이면 실수령 임대료는 0 */
export function effectiveRent(l: Lease, day: ISODate): number {
  if (!isActive(l, day)) return 0;
  return day < addMonthsToDate(l.start, l.rentFreeMonths) ? 0 : l.monthlyRent;
}

export interface BuildingKpi {
  buildingId: string;
  rentableArea: number; // 계약면적 합계 ㎡
  leasedArea: number;
  occupancy: number; // 면적 기준 임대율 0~1
  contractRent: number; // 약정 월 임대료 합계
  effectiveRent: number; // 실수령(렌트프리 제외)
  ownerOpex: number; // 해당 월 소유자 부담 관리비(공실분·특약 초과·소유자 항목) — 충당금 제외
  ownerReserve: number; // 해당 월 소유자 부담 충당금(장기수선 등) — NOI 아래에서 따로 봄
  noi: number; // 월 NOI = 실수령 임대료 − 소유자 부담 운영비
  deposits: number;
  receivable: number;
  overdue: number;
  waltYears: number;
  budgetUse: number | null; // 연간 예산 대비 집행률
  budgetPace: number; // 경과 개월 비율(기준선)
  avgRentPerSqm: number; // 임대 중 면적 기준 ㎡당 월 임대료
  vacantUnits: Unit[];
}

export interface KpiInput {
  building: Building;
  units: Unit[];
  leases: Lease[];
  items: ChargeItem[];
  lines: ChargeLine[]; // 해당 월 안분 결과
  receivables: Receivable[];
  budgets: Budget[];
  expenses: Expense[];
  month: Month;
  today: ISODate;
}

const sum = (xs: number[]) => xs.reduce((a, x) => a + x, 0);

export function buildingKpi(x: KpiInput): BuildingKpi {
  const units = x.units.filter((u) => u.buildingId === x.building.id);
  const leases = x.leases.filter((l) => l.buildingId === x.building.id);
  const active = leases.filter((l) => isActive(l, x.today));
  const leasedIds = new Set(active.map((l) => l.unitId));
  const rentableArea = sum(units.map((u) => u.contractArea));
  const leasedArea = sum(units.filter((u) => leasedIds.has(u.id)).map((u) => u.contractArea));
  const reserveIds = new Set(x.items.filter((i) => i.category === 'reserve').map((i) => i.id));
  const ownerLines = x.lines.filter((l) => l.payer === 'owner');
  const ownerOpex = sum(ownerLines.filter((l) => !reserveIds.has(l.itemId)).map((l) => l.amount));
  const ownerReserve = sum(ownerLines.filter((l) => reserveIds.has(l.itemId)).map((l) => l.amount));
  const contractRent = sum(active.map((l) => l.monthlyRent));
  const eff = sum(active.map((l) => effectiveRent(l, x.today)));
  const rc = x.receivables.filter((r) => r.buildingId === x.building.id && r.paid < r.billed);
  const year = Number(x.month.slice(0, 4));
  const months = Number(x.month.slice(5));
  const budget = sum(x.budgets.filter((b) => b.buildingId === x.building.id && b.year === year).map((b) => b.amount));
  const ytd = sum(x.expenses.filter((e) => e.buildingId === x.building.id && e.month.startsWith(String(year)) && e.month <= x.month).map((e) => e.amount));
  return {
    buildingId: x.building.id,
    rentableArea, leasedArea,
    occupancy: rentableArea ? leasedArea / rentableArea : 0,
    contractRent, effectiveRent: eff,
    ownerOpex, ownerReserve,
    noi: eff - ownerOpex,
    deposits: sum(active.map((l) => l.deposit)),
    receivable: sum(rc.map((r) => r.billed - r.paid)),
    overdue: sum(rc.filter((r) => r.dueDate < x.today).map((r) => r.billed - r.paid)),
    waltYears: walt(active, x.today),
    budgetUse: budget ? ytd / budget : null,
    budgetPace: months / 12,
    avgRentPerSqm: leasedArea ? contractRent / leasedArea : 0,
    vacantUnits: units.filter((u) => !leasedIds.has(u.id)),
  };
}

/** 여러 건물 합계. 비율 지표는 면적·임대료 가중으로 다시 계산한다. */
export function portfolioTotal(kpis: BuildingKpi[]): Omit<BuildingKpi, 'buildingId' | 'budgetUse' | 'budgetPace' | 'vacantUnits'> {
  const rentableArea = sum(kpis.map((k) => k.rentableArea));
  const leasedArea = sum(kpis.map((k) => k.leasedArea));
  const contractRent = sum(kpis.map((k) => k.contractRent));
  return {
    rentableArea, leasedArea,
    occupancy: rentableArea ? leasedArea / rentableArea : 0,
    contractRent,
    effectiveRent: sum(kpis.map((k) => k.effectiveRent)),
    ownerOpex: sum(kpis.map((k) => k.ownerOpex)),
    ownerReserve: sum(kpis.map((k) => k.ownerReserve)),
    noi: sum(kpis.map((k) => k.noi)),
    deposits: sum(kpis.map((k) => k.deposits)),
    receivable: sum(kpis.map((k) => k.receivable)),
    overdue: sum(kpis.map((k) => k.overdue)),
    waltYears: contractRent ? sum(kpis.map((k) => k.waltYears * k.contractRent)) / contractRent : 0,
    avgRentPerSqm: leasedArea ? contractRent / leasedArea : 0,
  };
}

// ── 임대 전략 ─────────────────────────────────────────────

export interface ExpiryBucket { label: string; area: number; rent: number; share: number; tenants: string[] }

/** 만기 분포: 1년 단위 구간별로 만기가 돌아오는 면적·임대료(임대료 비중) */
export function expiryProfile(leases: Lease[], units: Unit[], today: ISODate, years = 5): ExpiryBucket[] {
  const active = leases.filter((l) => isActive(l, today));
  const total = sum(active.map((l) => l.monthlyRent));
  const area = (l: Lease) => units.find((u) => u.id === l.unitId)?.contractArea ?? 0;
  const buckets: ExpiryBucket[] = [];
  for (let y = 0; y < years; y++) {
    const from = addMonthsToDate(today, y * 12);
    const to = addMonthsToDate(today, (y + 1) * 12);
    const ls = active.filter((l) => l.end >= from && (y === years - 1 ? true : l.end < to));
    const rent = sum(ls.map((l) => l.monthlyRent));
    buckets.push({ label: y === years - 1 ? `${y}년 이후` : `${y}~${y + 1}년`, area: sum(ls.map(area)), rent, share: total ? rent / total : 0, tenants: ls.map((l) => l.tenant) });
  }
  return buckets;
}

export interface TenantRow {
  lease: Lease;
  unit: Unit | undefined;
  rentPerSqm: number;
  vsAvg: number; // 건물 평균 단가 대비(-0.2 = 20% 낮음)
  monthsLeft: number;
  noticeDate: ISODate; // 갱신 의사 통지 기한(만기 − 통지 개월)
  flags: string[];
}

export const RENT_GAP = 0.15; // 평균 대비 ±15%를 벗어나면 표시(예시 기준)

export function tenantRows(leases: Lease[], units: Unit[], today: ISODate): TenantRow[] {
  const active = leases.filter((l) => isActive(l, today));
  const area = (l: Lease) => units.find((u) => u.id === l.unitId)?.contractArea ?? 0;
  const leasedArea = sum(active.map(area));
  const avg = leasedArea ? sum(active.map((l) => l.monthlyRent)) / leasedArea : 0;
  return active
    .map((l) => {
      const a = area(l);
      const rentPerSqm = a ? l.monthlyRent / a : 0;
      const vsAvg = avg ? rentPerSqm / avg - 1 : 0;
      const daysLeft = daysBetween(today, l.end);
      const noticeDate = addMonthsToDate(l.end, -l.renewalNoticeMonths);
      const flags: string[] = [];
      if (daysLeft <= 365) flags.push('만기 12개월 이내');
      if (today > noticeDate) flags.push('갱신 통지 기한 지남');
      else if (daysBetween(today, noticeDate) <= 60) flags.push('갱신 통지 기한 60일 이내');
      if (vsAvg <= -RENT_GAP) flags.push('단가가 평균보다 낮음 — 인상 협상 여지');
      if (vsAvg >= RENT_GAP) flags.push('단가가 평균보다 높음 — 이탈 위험 점검');
      if (l.escalation.type === 'negotiated') flags.push('인상률 협의 조항');
      return { lease: l, unit: units.find((u) => u.id === l.unitId), rentPerSqm, vsAvg, monthsLeft: Math.max(0, Math.round(daysLeft / 30.4)), noticeDate, flags };
    })
    .sort((a, b) => a.lease.end.localeCompare(b.lease.end));
}
