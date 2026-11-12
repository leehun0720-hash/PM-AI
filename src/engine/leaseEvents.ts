import type { ISODate, Lease, Region } from '../domain/types';
import { addMonthsToDate, daysBetween } from './money';

export const LEASE_RULE_VERSION = 'lease-rules-0.1 (예시 · 법무 검토 전)';

/** 상가건물 임대차보호법 환산보증금 기준액 — 예시값. 시행령 개정 시 갱신해야 한다. */
export const CONVERTED_DEPOSIT_LIMIT: Record<Region, number> = {
  seoul: 900_000_000,
  metro: 690_000_000,
  city: 540_000_000,
  other: 370_000_000,
};

export const RENT_INCREASE_CAP = 0.05;

export const convertedDeposit = (l: Pick<Lease, 'deposit' | 'monthlyRent'>) => l.deposit + l.monthlyRent * 100;

export function protection(l: Lease, region: Region) {
  const converted = convertedDeposit(l);
  const limit = CONVERTED_DEPOSIT_LIMIT[region];
  const within = converted <= limit;
  return {
    converted,
    limit,
    capApplies: within, // 차임증감청구 5% 상한
    renewalRightUntil: addMonthsToDate(l.start, 120), // 계약갱신요구권 최대 10년
  };
}

export interface RentSimulation {
  currentRent: number;
  requestedRate: number;
  appliedRate: number;
  newRent: number;
  capped: boolean;
  note: string;
}

export function simulateEscalation(l: Lease, region: Region, cpi = 0.021): RentSimulation {
  const requested = l.escalation.type === 'fixed' ? l.escalation.rate ?? 0 : l.escalation.type === 'cpi' ? cpi : 0;
  const prot = protection(l, region);
  const capped = prot.capApplies && requested > RENT_INCREASE_CAP;
  const applied = capped ? RENT_INCREASE_CAP : requested;
  const note =
    l.escalation.type === 'negotiated'
      ? '협의 인상 조항 — 자동 적용 불가, 담당자 협의 필요'
      : capped
        ? `환산보증금이 기준액 이하 → 5% 상한 적용 (계약상 ${(requested * 100).toFixed(1)}%)`
        : l.escalation.type === 'cpi'
          ? `CPI 연동 (가정 ${(cpi * 100).toFixed(1)}%)`
          : `정률 ${(requested * 100).toFixed(1)}%`;
  return { currentRent: l.monthlyRent, requestedRate: requested, appliedRate: applied, newRent: Math.round((l.monthlyRent * (1 + applied)) / 10) * 10, capped, note };
}

export type LeaseEventKind = 'expiry' | 'renewalNotice' | 'escalation' | 'rentFreeEnd';

export interface LeaseEvent {
  leaseId: string;
  kind: LeaseEventKind;
  date: ISODate;
  dday: number; // 양수 = 남은 일수
  label: string;
  alertStage?: 30 | 60 | 90 | 180;
}

export const EVENT_LABEL: Record<LeaseEventKind, string> = {
  expiry: '계약 만기',
  renewalNotice: '갱신·해지 통지 기한',
  escalation: '임대료 인상일',
  rentFreeEnd: '렌트프리 종료',
};

const stage = (d: number): LeaseEvent['alertStage'] => (d < 0 ? undefined : d <= 30 ? 30 : d <= 60 ? 60 : d <= 90 ? 90 : d <= 180 ? 180 : undefined);

/** today 이후 horizonDays 이내의 임대차 이벤트 */
export function leaseEvents(leases: Lease[], today: ISODate, horizonDays = 365): LeaseEvent[] {
  const out: LeaseEvent[] = [];
  const push = (l: Lease, kind: LeaseEventKind, date: ISODate) => {
    const dday = daysBetween(today, date);
    if (dday >= 0 && dday <= horizonDays) out.push({ leaseId: l.id, kind, date, dday, label: `${l.tenant} ${EVENT_LABEL[kind]}`, alertStage: stage(dday) });
  };
  for (const l of leases) {
    push(l, 'expiry', l.end);
    if (l.renewalNoticeMonths > 0) push(l, 'renewalNotice', addMonthsToDate(l.end, -l.renewalNoticeMonths));
    if (l.rentFreeMonths > 0) push(l, 'rentFreeEnd', addMonthsToDate(l.start, l.rentFreeMonths));
    {
      for (let y = 1; y <= 12; y++) {
        const d = addMonthsToDate(l.start, 12 * y);
        if (d >= l.end) break;
        if (d >= today) { push(l, 'escalation', d); break; }
      }
    }
  }
  return out.sort((a, b) => a.dday - b.dday);
}

/** 가중평균 잔여 임대기간(년) — 월임대료 가중 */
export function walt(leases: Lease[], today: ISODate): number {
  const active = leases.filter((l) => l.end >= today);
  const rent = active.reduce((s, l) => s + l.monthlyRent, 0);
  if (rent === 0) return 0;
  return active.reduce((s, l) => s + (l.monthlyRent * daysBetween(today, l.end)) / 365, 0) / rent;
}
