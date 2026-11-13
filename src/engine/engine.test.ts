import { describe, expect, it } from 'vitest';
import { buildSeed, ownerMap } from '../data/seed';
import type { Agenda, Lease, Owner, Unit } from '../domain/types';
import { allocate, reconcile } from './allocation';
import { detectExpenseAnomalies } from './anomaly';
import { tally } from './association';
import { applicableRules } from './compliance';
import { emissions, misalignmentYear } from './emissions';
import { reorderSuggestions } from './inventory';
import { leaseEvents, protection, simulateEscalation } from './leaseEvents';
import { parseLawResponse } from './legal';
import { allocateByWeights, monthRange } from './money';
import { defaultScenarios, runScenario } from './tariff';
import { matchInvoice } from './threeWay';

const TODAY = '2026-11-12';
const seed = buildSeed(TODAY);
const run = (b: string, month = seed.seedMonth) => {
  const expenses = seed.expenses.filter((e) => e.buildingId === b && e.month === month);
  const lines = allocate({ month, units: seed.units.filter((u) => u.buildingId === b), leases: seed.leases, items: seed.items, expenses, readings: seed.readings.filter((r) => r.month === month), ownerOf: ownerMap(seed.owners) });
  return { lines, expenses };
};

describe('money', () => {
  it('최대잔여법은 합계를 1원까지 보존한다', () => {
    const parts = allocateByWeights(1_000_000, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1_000_000);
    expect(parts).toEqual([333_334, 333_333, 333_333]);
  });
});

describe('관리비 안분', () => {
  it('모든 건물·모든 월에서 항목별 안분 합계가 지출과 1원까지 일치한다', () => {
    for (const b of ['A', 'B']) for (const m of monthRange(seed.seedMonth, 24)) {
      const { lines, expenses } = run(b, m);
      for (const [item, diff] of Object.entries(reconcile(lines, expenses))) expect(diff, `${b} ${m} ${item}`).toBe(0);
    }
  });
  it('재실행하면 동일한 결과가 나온다', () => {
    expect(run('A').lines).toEqual(run('A').lines);
  });
  it('공실 호실 부담분은 소유자에게 간다', () => {
    const vacant = run('A').lines.filter((l) => l.unitId === 'A-08');
    expect(vacant.length).toBeGreaterThan(0);
    expect(vacant.every((l) => l.payer === 'owner' && l.payerName === '한빛자산운용 펀드')).toBe(true);
  });
  it('특약 상한 초과분은 소유자가 부담한다', () => {
    const repair = run('A').lines.filter((l) => l.unitId === 'A-03' && l.itemId === 'REPAIR');
    expect(repair.find((l) => l.payer === 'tenant')!.amount).toBe(1_500_000);
    expect(repair.find((l) => l.payer === 'owner')!.amount).toBeGreaterThan(0);
  });
  it('특약 제외 항목·소유자 항목·정액 계약을 구분한다', () => {
    const { lines } = run('A');
    expect(lines.find((l) => l.unitId === 'A-06' && l.itemId === 'INSUR')!.payer).toBe('owner');
    expect(lines.filter((l) => l.itemId === 'RESERVE').every((l) => l.payer === 'owner')).toBe(true);
    const fixed = lines.filter((l) => l.unitId === 'A-02');
    expect(fixed.find((l) => l.itemId === 'FIXED')!.amount).toBe(9_800_000);
    expect(fixed.find((l) => l.itemId === 'CLEAN')!.payer).toBe('owner');
    expect(fixed.find((l) => l.itemId === 'UNIT_ELEC')!.payer).toBe('tenant');
  });
});

describe('이상치 탐지', () => {
  const found = detectExpenseAnomalies(seed.seedMonth, seed.expenses.filter((e) => e.buildingId === 'A'), seed.items);
  it('중복 청구·계정 오분류·급증을 찾는다', () => {
    expect(found.some((a) => a.kind === 'duplicate' && a.itemId === 'ELEV')).toBe(true);
    expect(found.some((a) => a.kind === 'misclass' && a.itemId === 'REPAIR')).toBe(true);
    expect(found.some((a) => (a.kind === 'mom' || a.kind === 'yoy') && a.itemId === 'SECURITY')).toBe(true);
  });
  it('정상 월의 오탐은 제한적이다', () => {
    const prev = detectExpenseAnomalies(monthRange(seed.seedMonth, 2)[0], seed.expenses.filter((e) => e.buildingId === 'B'), seed.items);
    expect(prev.filter((a) => a.kind === 'duplicate' || a.kind === 'misclass')).toHaveLength(0);
  });
});

describe('임대차', () => {
  const cafe = seed.leases.find((l) => l.id === 'LS-A01') as Lease;
  const big = seed.leases.find((l) => l.id === 'LS-A03') as Lease;
  it('환산보증금으로 5% 상한 적용 여부를 판정한다', () => {
    expect(protection(cafe, 'seoul').converted).toBe(680_000_000);
    expect(protection(cafe, 'seoul').capApplies).toBe(true);
    expect(protection(big, 'seoul').capApplies).toBe(false);
  });
  it('계약상 7% 인상은 5%로 제한된다', () => {
    const sim = simulateEscalation(cafe, 'seoul');
    expect(sim.capped).toBe(true);
    expect(sim.newRent).toBe(6_510_000);
  });
  it('만기·통지 기한 이벤트를 날짜순으로 만든다', () => {
    const evs = leaseEvents(seed.leases, TODAY, 365);
    expect(evs.some((e) => e.kind === 'expiry' && e.leaseId === 'LS-A05')).toBe(true);
    expect(evs.map((e) => e.dday)).toEqual([...evs.map((e) => e.dday)].sort((a, b) => a - b));
  });
});

describe('3-way 매칭', () => {
  const check = (contractId: string, suffix = '') => {
    const inv = seed.invoices.find((i) => i.id === `INV-${contractId.slice(3)}-${seed.seedMonth}${suffix}`)!;
    return matchInvoice(inv, seed.contracts.find((c) => c.id === contractId)!, seed.workRecords.find((w) => w.contractId === contractId && w.month === seed.seedMonth), seed.invoices);
  };
  it('인원 초과와 미수행 청구를 잡아낸다', () => {
    const r = check('CT-A-CLEAN');
    expect(r.findings.map((f) => f.kind).sort()).toEqual(['unperformed', 'unperformed']);
    expect(r.recoverable).toBe(2 * 3_150_000 + 4_200_000);
    expect(r.payable).toBe(12 * 3_150_000);
  });
  it('단가 불일치와 계약 외 항목을 잡아낸다', () => {
    const r = check('CT-A-SEC');
    expect(r.findings.map((f) => f.kind).sort()).toEqual(['unitPrice', 'unknownItem']);
    expect(r.recoverable).toBe(9 * 180_000 + 2_400_000);
  });
  it('중복 인보이스는 전액 지급 보류한다', () => {
    expect(check('CT-A-ELEV').findings).toHaveLength(0);
    const dup = check('CT-A-ELEV', '-R');
    expect(dup.payable).toBe(0);
    expect(dup.findings[0].kind).toBe('duplicate');
  });
  it('정상 인보이스는 지적이 없다', () => {
    expect(check('CT-A-FM').recoverable).toBe(0);
  });
});

describe('전기요금', () => {
  const b = seed.buildings[0];
  const results = defaultScenarios(b).map((s) => runScenario(b, monthRange(seed.seedMonth, 12), s));
  it('요금 구성요소의 합이 총액과 같다', () => {
    for (const bill of results[0].bills) expect(bill.basic + bill.overContract + bill.energy + bill.surcharge + bill.vat + bill.fund).toBe(bill.total);
  });
  it('피크 억제는 연간 요금을 줄인다', () => {
    expect(results.find((r) => r.id === 'shave')!.annualTotal).toBeLessThan(results[0].annualTotal);
  });
});

describe('탄소', () => {
  it('Scope 1·2를 합산하고 경로 이탈 연도를 계산한다', () => {
    const b = seed.buildings[0];
    const e = emissions(b, seed.energy.filter((x) => x.buildingId === 'A').slice(-12));
    expect(e.total).toBeCloseTo(e.scope1 + e.scope2, 6);
    expect(misalignmentYear('office', 1000, 2026)).toBe(2026);
    expect(misalignmentYear('office', 1, 2026)).toBeNull();
  });
});

describe('법정점검·관리단·재고·법령 API', () => {
  it('설비 구성에 따라 적용 점검이 달라진다', () => {
    const [a, b] = seed.buildings;
    expect(applicableRules(a).some((r) => r.id === 'boiler')).toBe(true);
    expect(applicableRules(b).some((r) => r.id === 'boiler')).toBe(false);
  });
  it('의결은 소유자 수와 의결권을 모두 충족해야 가결된다', () => {
    const units = [{ id: 'u1', exclusiveArea: 80 }, { id: 'u2', exclusiveArea: 10 }, { id: 'u3', exclusiveArea: 10 }] as Unit[];
    const owners = [{ id: 'o1', unitIds: ['u1'] }, { id: 'o2', unitIds: ['u2'] }, { id: 'o3', unitIds: ['u3'] }] as Owner[];
    const ag = (votes: Agenda['votes'], kind: Agenda['kind'] = 'ordinary') => tally({ id: 'a', title: '', kind, votes }, owners, units);
    expect(ag({ o1: 'yes' }).passed).toBe(false); // 의결권 80%지만 1/3명
    expect(ag({ o2: 'yes', o3: 'yes' }).passed).toBe(false); // 2/3명이지만 의결권 20%
    expect(ag({ o1: 'yes', o2: 'yes' }).passed).toBe(true);
    expect(ag({ o1: 'yes', o2: 'yes' }, 'bylaw').passed).toBe(false); // 3/4 미달
  });
  it('재주문점 이하 품목만 발주를 제안한다', () => {
    const s = reorderSuggestions(seed.stock, seed.stockMoves, TODAY);
    expect(s.some((x) => x.itemId === 'ST-A1')).toBe(true);
    expect(s.some((x) => x.itemId === 'ST-A2')).toBe(false);
  });
  it('법령 API 응답을 단건·다건 모두 파싱한다', () => {
    const one = parseLawResponse('prec', { PrecSearch: { prec: { 사건명: '관리비', 사건번호: 'X', 법원명: '대법원', 선고일자: '2020.01.01', 판례상세링크: '/DRF/x' } } });
    expect(one).toHaveLength(1);
    expect(one[0].url).toBe('https://www.law.go.kr/DRF/x');
    expect(parseLawResponse('law', {})).toEqual([]);
  });
});

describe('AM 지표(portfolio)', async () => {
  const { buildingKpi, effectiveRent, expiryProfile, portfolioTotal, tenantRows } = await import('./portfolio');
  const kpi = (b: string) =>
    buildingKpi({ building: seed.buildings.find((x) => x.id === b)!, units: seed.units, leases: seed.leases, items: seed.items, lines: run(b).lines, receivables: seed.receivables, budgets: seed.budgets, expenses: seed.expenses, month: seed.seedMonth, today: TODAY });

  it('임대율은 계약면적 기준이고 공실 호실을 돌려준다', () => {
    const k = kpi('A');
    expect(k.vacantUnits.map((u) => u.id)).toEqual(['A-08']);                 // 샘플: A-08 공실
    expect(k.occupancy).toBeCloseTo(1 - 8940 / k.rentableArea, 6);
  });

  it('NOI = 실수령 임대료 − 소유자 부담 운영비(충당금 제외)', () => {
    const k = kpi('A');
    const owner = run('A').lines.filter((l) => l.payer === 'owner');
    expect(k.ownerOpex + k.ownerReserve).toBe(owner.reduce((a, l) => a + l.amount, 0));
    expect(k.ownerReserve).toBeGreaterThan(0);                                 // 장기수선충당금은 소유자 부담
    expect(k.noi).toBe(k.effectiveRent - k.ownerOpex);
  });

  it('렌트프리 기간에는 실수령 임대료가 0이다', () => {
    const l = { ...seed.leases[0], start: '2026-10-01', end: '2028-09-30', rentFreeMonths: 3, status: 'active' as const };
    expect(effectiveRent(l, '2026-11-12')).toBe(0);
    expect(effectiveRent(l, '2027-01-01')).toBe(l.monthlyRent);
  });

  it('포트폴리오 합계는 건물 합과 같고 임대율은 면적 가중', () => {
    const t = portfolioTotal([kpi('A'), kpi('B')]);
    expect(t.noi).toBe(kpi('A').noi + kpi('B').noi);
    expect(t.occupancy).toBeCloseTo((kpi('A').leasedArea + kpi('B').leasedArea) / (kpi('A').rentableArea + kpi('B').rentableArea), 9);
  });

  it('만기 분포의 임대료 비중 합은 1, 만기 임박 임차인은 표시된다', () => {
    const lsA = seed.leases.filter((l) => l.buildingId === 'A');
    const prof = expiryProfile(lsA, seed.units, TODAY);
    expect(prof.reduce((a, b) => a + b.share, 0)).toBeCloseTo(1, 9);
    const rows = tenantRows(lsA, seed.units, TODAY);
    expect(rows.find((r) => r.lease.id === 'LS-A05')!.flags).toContain('만기 12개월 이내');   // 샘플: 2개월 뒤 만기
    expect(rows.find((r) => r.lease.id === 'LS-A07')!.flags).toContain('인상률 협의 조항');
  });
});

describe('FM 설비 대장·작업지시(assets)', async () => {
  const { equipmentRegister, guessEquipment, workOrders } = await import('./assets');
  const A = seed.buildings.find((b) => b.id === 'A')!;

  it('설비마다 관련 법정점검이 묶이고, 모든 적용 점검이 한 번씩만 나온다', () => {
    const reg = equipmentRegister(A, seed.inspections, TODAY);
    expect(reg.find((r) => r.equipment === 'elevator')!.rules.map((x) => x.rule.id).sort()).toEqual(['elev-reg', 'elev-self']);
    const ids = reg.flatMap((r) => r.rules.map((x) => x.rule.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(applicableRules(A).map((r) => r.id).sort());
  });

  it('미조치 지적과 처리 전 시설 민원이 작업지시가 된다', () => {
    const wo = workOrders(A, seed.inspections, seed.requests, TODAY);
    expect(wo.some((w) => w.source === 'finding' && w.title.includes('스프링클러 헤드') && w.equipment === 'sprinkler')).toBe(true);
    expect(wo.some((w) => w.source === 'finding' && w.title.includes('유도등'))).toBe(false);   // 조치 완료 지적은 제외
    const rq = wo.find((w) => w.ref.requestId === 'RQ-1')!;
    expect(rq.equipment).toBe('hvac');
    expect(rq.equipmentGuessed).toBe(true);
  });

  it('민원 글 키워드로 설비를 추정한다', () => {
    expect(guessEquipment('엘리베이터가 멈췄어요')).toBe('elevator');
    expect(guessEquipment('주차 문의')).toBeUndefined();
  });
});
