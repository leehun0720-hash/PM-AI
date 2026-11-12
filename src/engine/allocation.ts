import type { ChargeItem, ChargeLine, Expense, Lease, MeterReading, Month, Unit } from '../domain/types';
import { allocateByWeights, daysInMonth } from './money';

export const RULE_VERSION = 'alloc-rules-1.0.0';

const BY_LABEL = { exclusiveArea: '전용면적', contractArea: '계약면적', usage: '검침 사용량', equal: '균등' } as const;

export interface AllocationInput {
  month: Month;
  units: Unit[];
  leases: Lease[];
  items: ChargeItem[];
  expenses: Expense[]; // 해당 건물·월 지출
  readings: MeterReading[]; // 해당 월 검침
  ownerOf: Record<string, string>; // unitId → 소유자명
}

export function activeLease(leases: Lease[], unitId: string, month: Month): Lease | undefined {
  const first = `${month}-01`;
  const last = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;
  return leases.find((l) => l.unitId === unitId && l.status === 'active' && l.start <= last && l.end >= first);
}

/**
 * 관리비 안분. 순수 함수이며 같은 입력이면 항상 같은 결과를 낸다.
 * 불변식: 항목별 (임차인 부담 + 소유자 부담) 합계 = 해당 항목 지출 합계 (1원 단위 일치)
 */
export function allocate(input: AllocationInput): ChargeLine[] {
  const { month, items, expenses, readings, ownerOf } = input;
  const units = [...input.units].sort((a, b) => a.id.localeCompare(b.id));
  const lines: ChargeLine[] = [];
  const w = (n: number) => `${n.toLocaleString('ko-KR')}원`;

  for (const item of items) {
    const src = expenses.filter((e) => e.itemId === item.id);
    const pool = src.reduce((s, e) => s + e.amount, 0);
    if (pool === 0) continue;
    const sourceExpenseIds = src.map((e) => e.id);

    // 1) 혼합 방식: 풀을 구성요소 비율로 분할
    const subPools = allocateByWeights(pool, item.components.map((c) => c.ratio));
    const share = new Map<string, number>(units.map((u) => [u.id, 0]));
    const traces = new Map<string, string[]>(units.map((u) => [u.id, [`항목 지출 합계 ${w(pool)} (원장 ${src.length}건)`]]));

    item.components.forEach((comp, ci) => {
      const weights = units.map((u) => {
        if (comp.by === 'exclusiveArea') return u.exclusiveArea;
        if (comp.by === 'contractArea') return u.contractArea;
        if (comp.by === 'equal') return 1;
        return readings.find((r) => r.unitId === u.id && r.type === comp.meter)?.usage ?? 0;
      });
      const total = weights.reduce((a, b) => a + b, 0);
      const parts = allocateByWeights(subPools[ci], weights);
      units.forEach((u, i) => {
        share.set(u.id, share.get(u.id)! + parts[i]);
        const ratioNote = item.components.length > 1 ? ` (혼합 ${Math.round(comp.ratio * 100)}% 구간 ${w(subPools[ci])})` : '';
        traces.get(u.id)!.push(
          `${BY_LABEL[comp.by]} 기준${ratioNote}: ${weights[i].toLocaleString('ko-KR')} ÷ ${total.toLocaleString('ko-KR')} → ${w(parts[i])}`,
        );
      });
    });

    // 2) 부담 주체 판정: 공실·소유자 항목·특약 제외·정액 계약·상한
    for (const u of units) {
      const amount = share.get(u.id)!;
      if (amount === 0) continue;
      const trace = traces.get(u.id)!;
      const lease = activeLease(input.leases, u.id, month);
      const owner = (amt: number, reason: string, extra: string[] = []) =>
        lines.push({ unitId: u.id, itemId: item.id, payer: 'owner', payerName: ownerOf[u.id] ?? '소유자', amount: amt, vat: 0, reason, trace: [...trace, ...extra, `부담 주체: 소유자 — ${reason}`], sourceExpenseIds });
      const tenant = (amt: number, reason: string, extra: string[] = []) => {
        const vat = item.vat ? Math.floor(amt * 0.1) : 0;
        lines.push({ unitId: u.id, itemId: item.id, payer: 'tenant', payerName: lease!.tenant, amount: amt, vat, reason, trace: [...trace, ...extra, `부담 주체: 임차인 — ${reason}`, item.vat ? `부가세 10%(원 미만 절사): ${w(vat)}` : '부가세 비과세 항목'], sourceExpenseIds });
      };

      if (item.ownerOnly) owner(amount, '소유자 부담 항목');
      else if (!lease) owner(amount, '공실 — 소유자 부담');
      else if (lease.excludedItems.includes(item.id)) owner(amount, `특약상 임차인 부담 제외 (${lease.tenant})`);
      else if (lease.mgmtFeeType === 'fixed' && item.category !== 'utility') owner(amount, `정액 관리비 계약 (${lease.tenant}) — 실비 초과분은 소유자 정산`);
      else {
        const cap = lease.caps.find((c) => c.itemId === item.id);
        if (cap && amount > cap.monthlyCap) {
          tenant(cap.monthlyCap, '특약 상한 적용', [`특약 월 상한 ${w(cap.monthlyCap)} < 안분액 ${w(amount)}`]);
          owner(amount - cap.monthlyCap, '특약 상한 초과분', [`상한 초과분 ${w(amount - cap.monthlyCap)}`]);
        } else tenant(amount, '임대차계약상 실비 부담');
      }
    }
  }

  // 3) 정액 관리비 고지 (실비 안분과 별도 라인)
  for (const u of units) {
    const lease = activeLease(input.leases, u.id, month);
    if (lease?.mgmtFeeType === 'fixed' && lease.fixedMgmtFee) {
      lines.push({
        unitId: u.id, itemId: 'FIXED', payer: 'tenant', payerName: lease.tenant, amount: lease.fixedMgmtFee,
        vat: Math.floor(lease.fixedMgmtFee * 0.1), reason: '정액 관리비 계약',
        trace: [`임대차계약 정액 관리비 ${w(lease.fixedMgmtFee)}`, `부가세 10%: ${w(Math.floor(lease.fixedMgmtFee * 0.1))}`], sourceExpenseIds: [],
      });
    }
  }
  return lines;
}

/** 대사: 항목별 지출 합계와 안분 결과 합계의 차이. 모든 값이 0이어야 한다. */
export function reconcile(lines: ChargeLine[], expenses: Expense[]): Record<string, number> {
  const diff: Record<string, number> = {};
  for (const e of expenses) diff[e.itemId] = (diff[e.itemId] ?? 0) + e.amount;
  for (const l of lines) if (l.itemId !== 'FIXED') diff[l.itemId] = (diff[l.itemId] ?? 0) - l.amount;
  return diff;
}
