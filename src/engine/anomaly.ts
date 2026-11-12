import type { Anomaly, ChargeItem, ChargeLine, Expense, Month } from '../domain/types';
import { addMonths } from './money';

export const MOM_THRESHOLD = 0.2;
export const YOY_THRESHOLD = 0.25;
export const SHIFT_THRESHOLD = 0.3;

const w = (n: number) => `${n.toLocaleString('ko-KR')}원`;
const p = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`;

/** 지출 원장 이상치: 전월·전년 동월 편차, 중복 청구, 계정 오분류 */
export function detectExpenseAnomalies(month: Month, all: Expense[], items: ChargeItem[]): Anomaly[] {
  const out: Anomaly[] = [];
  const cur = all.filter((e) => e.month === month);
  const sumOf = (m: Month, itemId: string) => all.filter((e) => e.month === m && e.itemId === itemId).reduce((s, e) => s + e.amount, 0);

  for (const item of items) {
    const now = sumOf(month, item.id);
    if (now === 0) continue;
    const ids = cur.filter((e) => e.itemId === item.id).map((e) => e.id);
    const prev = sumOf(addMonths(month, -1), item.id);
    const lastYear = sumOf(addMonths(month, -12), item.id);
    // 계절성이 큰 사용료는 전월 비교에서 제외하고 전년 동월로만 본다
    const mom = prev > 0 && item.category !== 'utility' && Math.abs(now / prev - 1) > MOM_THRESHOLD;
    const yoy = lastYear > 0 && Math.abs(now / lastYear - 1) > YOY_THRESHOLD;
    if (mom || yoy) {
      const parts = [
        ...(mom ? [`전월 ${w(prev)} → 당월 ${w(now)} (${p(now / prev - 1)}, 임계치 ±${MOM_THRESHOLD * 100}%)`] : []),
        ...(yoy ? [`전년 동월 ${w(lastYear)} → 당월 ${w(now)} (${p(now / lastYear - 1)}, 임계치 ±${YOY_THRESHOLD * 100}%)`] : []),
      ];
      out.push({ id: `dev-${item.id}`, kind: yoy ? 'yoy' : 'mom', severity: 'medium', title: `${item.name} ${yoy ? `전년 동월 대비 ${p(now / lastYear - 1)}` : `전월 대비 ${p(now / prev - 1)}`}`, why: `통계 편차: ${parts.join(' / ')}.`, itemId: item.id, expenseIds: ids, amount: yoy ? now - lastYear : now - prev, resolved: false });
    }
  }

  // 중복 청구: 같은 달에 거래처·항목·금액이 동일한 지출
  const seen = new Map<string, Expense>();
  for (const e of cur) {
    const key = `${e.vendor}|${e.itemId}|${e.amount}`;
    const first = seen.get(key);
    if (first) {
      out.push({ id: `dup-${e.id}`, kind: 'duplicate', severity: 'high', title: `중복 청구 의심: ${e.vendor} ${w(e.amount)}`, why: `문서 불일치: 같은 달에 거래처·항목·금액이 동일한 지출이 2건 있습니다 (${first.id}, ${e.id}).`, itemId: e.itemId, expenseIds: [first.id, e.id], amount: e.amount, resolved: false });
    } else seen.set(key, e);
  }

  // 계정 오분류: 지출의 회계 계정이 관리비 항목의 매핑 계정에 없음
  for (const e of cur) {
    const item = items.find((i) => i.id === e.itemId);
    if (item && !item.accounts.includes(e.account)) {
      const expected = items.find((i) => i.accounts.includes(e.account));
      out.push({ id: `mis-${e.id}`, kind: 'misclass', severity: 'medium', title: `계정 오분류 의심: ${e.memo}`, why: `규칙 위반: 계정 '${e.account}'는 '${item.name}' 항목의 매핑 계정이 아닙니다.${expected ? ` 이 계정은 '${expected.name}'에 매핑되어 있습니다.` : ''}`, itemId: e.itemId, expenseIds: [e.id], amount: e.amount, resolved: false });
    }
  }
  return out;
}

/** 안분 결과 급변: 호실별 임차인 부담 합계가 전월 대비 크게 변동 */
export function detectAllocationShift(current: ChargeLine[], previous: ChargeLine[] | undefined, unitName: (id: string) => string): Anomaly[] {
  if (!previous) return [];
  const total = (ls: ChargeLine[]) => {
    const m = new Map<string, number>();
    for (const l of ls) if (l.payer === 'tenant') m.set(l.unitId, (m.get(l.unitId) ?? 0) + l.amount);
    return m;
  };
  const now = total(current);
  const prev = total(previous);
  const out: Anomaly[] = [];
  for (const [unitId, amt] of now) {
    const before = prev.get(unitId);
    if (before && Math.abs(amt / before - 1) > SHIFT_THRESHOLD) {
      out.push({ id: `shift-${unitId}`, kind: 'allocShift', severity: 'medium', title: `${unitName(unitId)} 부담액 전월 대비 ${p(amt / before - 1)}`, why: `통계 편차: 전월 ${w(before)} → 당월 ${w(amt)}. 임계치 ±${SHIFT_THRESHOLD * 100}% 초과.`, expenseIds: [], amount: amt - before, resolved: false });
    }
  }
  return out;
}
