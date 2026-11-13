import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import type { Receivable, Unit } from '../domain/types';
import { autoMapRecv, buildRecvDrafts, buildRecvPreview, isKnownRecvHeader, matchUnit, missingRecvRequired, settlementBilledMap } from './importReceivables';
import { parseCsv, toTable } from './importTable';

const units: Unit[] = ['101호', '201호', '301호', '601호', '1601호'].map((name, i) => ({ id: `A-0${i + 1}`, buildingId: 'A', floor: '', name, exclusiveArea: 1, contractArea: 1 }));
const load = () => toTable(parseCsv(readFileSync('samples/import/receivables.csv', 'utf8')), isKnownRecvHeader);
const opt = { fallbackMonth: '2026-10' };
const existing: Receivable[] = [{ id: 'RC-A-01-2026-09', buildingId: 'A', month: '2026-09', unitId: 'A-01', tenant: '카페 온도', billed: 1240000, paid: 0, dueDate: '2026-10-25' }];
const base = { buildingId: 'A', units, savedUnits: {}, existing, settlementBilled: new Map<string, number>() };

test('수납 열을 자동으로 맞춘다', () => {
  const t = load();
  expect(t.headerRow).toBe(1);
  expect(autoMapRecv(t.headers)).toMatchObject({ unit: 0, tenant: 1, month: 2, billed: 3, paid: 4, paidDate: 5, dueDate: null });
  expect(missingRecvRequired(autoMapRecv(['상호', '수납액']))).toEqual(['unit', 'billed']);
});
test('호실 이름은 공백·"호"를 빼고 맞추고, 저장해 둔 대응을 먼저 쓴다', () => {
  expect(matchUnit('1601', units, {})).toBe('A-05');
  expect(matchUnit(' 101 호', units, {})).toBe('A-01');
  expect(matchUnit('1702호', units, {})).toBeNull();
  expect(matchUnit('1702호', units, { '1702호': 'A-05' })).toBe('A-05');
});
test('표 → 수납 줄: 합계 줄 건너뜀, 못 읽은 수납액은 이유를 남기고 빈 수납액은 0', () => {
  const t = load();
  const p = buildRecvDrafts(t, autoMapRecv(t.headers), opt);
  expect(p.skippedSummary).toBe(1);
  expect(p.errors).toEqual([expect.objectContaining({ row: 7, reason: '수납액을 읽지 못했습니다: "미정"' })]);
  expect(p.drafts).toHaveLength(5);
  expect(p.drafts[1]).toMatchObject({ unit: '201호', month: '2026-10', billed: 4800000, paid: 0, dueDate: '2026-11-25' });
  expect(p.drafts[0].paidDate).toBe('2026-11-20');
});
test('같은 호실·월이 두 번 나오면 뒤의 줄을 못 읽은 줄로 둔다', () => {
  const t = toTable(parseCsv('호실,고지액,수납액\n101호,100,100\n101호,100,50'), isKnownRecvHeader);
  const p = buildRecvDrafts(t, autoMapRecv(t.headers), opt);
  expect(p.drafts).toHaveLength(1);
  expect(p.errors[0].reason).toContain('2번째 줄과 같은 호실·월');
});
test('미리보기: 새로 만들기·고쳐 쓰기·호실 미정·초과 수납·PMAI 정산과 다른 고지액', () => {
  const t = load();
  const p = buildRecvDrafts(t, autoMapRecv(t.headers), opt);
  const pv = buildRecvPreview(p, { ...base, settlementBilled: new Map([['A-01|2026-10', 1250000], ['A-02|2026-10', 4500000]]) });
  expect(pv.created).toBe(3);
  expect(pv.updated).toBe(1);
  expect(pv.unchanged).toBe(0);
  expect(pv.unmapped).toEqual([{ unit: '1702호', count: 1, billed: 900000 }]);
  expect(pv.upserts.find((r) => r.id === 'RC-A-01-2026-09')).toMatchObject({ paid: 1240000, paidDate: '2026-11-02', tenant: '카페 온도' });
  expect(pv.upserts.find((r) => r.id === 'RC-A-02-2026-10')).toMatchObject({ buildingId: 'A', unitId: 'A-02', billed: 4800000, paid: 0 });
  expect(pv.billedMismatch).toEqual([{ unitId: 'A-02', unit: '201호', month: '2026-10', file: 4800000, pmai: 4500000 }]);
  expect(pv.months).toEqual(['2026-09', '2026-10']);
  expect(pv.totalPaid).toBe(1250000 + 14300000 + 1240000);
});
test('같은 파일을 다시 올리면 바뀐 것이 없다', () => {
  const t = load();
  const p = buildRecvDrafts(t, autoMapRecv(t.headers), opt);
  const first = buildRecvPreview(p, base);
  const merged = [...existing.filter((r) => !first.upserts.some((u) => u.id === r.id)), ...first.upserts];
  const second = buildRecvPreview(p, { ...base, existing: merged });
  expect(second.upserts).toHaveLength(0);
  expect(second.unchanged).toBe(4);
});
test('초과 수납은 따로 센다', () => {
  const t = toTable(parseCsv('호실,고지액,수납액\n101호,100,150'), isKnownRecvHeader);
  const pv = buildRecvPreview(buildRecvDrafts(t, autoMapRecv(t.headers), opt), base);
  expect(pv.overpaid).toBe(1);
});

test('정산에서 호실별 임차인 고지액(부가세 포함)을 모은다. 승인된 정산이 있으면 그것을 쓴다', () => {
  const line = (unitId: string, payer: 'tenant' | 'owner', amount: number, vat: number) => ({ unitId, itemId: 'X', payer, payerName: '', amount, vat, reason: '', trace: [], sourceExpenseIds: [] });
  const st = (id: string, status: 'draft' | 'approved', lines: ReturnType<typeof line>[]) => ({ id, buildingId: 'A', month: '2026-10', status, ruleVersion: '', inputHash: '', createdAt: '', poolTotal: 0, lines, anomalies: [] });
  const m = settlementBilledMap([
    st('S1', 'approved', [line('A-01', 'tenant', 1000, 100), line('A-01', 'tenant', 500, 50), line('A-02', 'owner', 900, 0)]),
    st('S2', 'draft', [line('A-01', 'tenant', 9999, 0)]),
    { ...st('S3', 'approved', [line('A-01', 'tenant', 7, 0)]), buildingId: 'B' },
  ], 'A');
  expect([...m]).toEqual([['A-01|2026-10', 1650]]);
});

test('정산이 없어도 이미 있는 수납 기록과 고지액이 다르면 알린다', () => {
  const t = toTable(parseCsv('호실,부과월,고지액,수납액\n101호,2026-09,1000000,1000000'), isKnownRecvHeader);
  const pv = buildRecvPreview(buildRecvDrafts(t, autoMapRecv(t.headers), opt), base);
  expect(pv.billedMismatch).toEqual([{ unitId: 'A-01', unit: '101호', month: '2026-09', file: 1000000, pmai: 1240000 }]);
  expect(pv.updated).toBe(1);
});

const paidOne: Receivable = { id: 'RC-A-01-2026-07', buildingId: 'A', month: '2026-07', unitId: 'A-01', tenant: '카페 온도', billed: 100, paid: 100, dueDate: '2026-08-25', paidDate: '2026-08-25' };
test('수납액 칸이 비었거나 열이 없으면 기존 수납액·입금일을 지우지 않는다', () => {
  const t1 = toTable(parseCsv('호실,부과월,고지액,수납액\n101호,2026-07,100,'), isKnownRecvHeader);
  const pv1 = buildRecvPreview(buildRecvDrafts(t1, autoMapRecv(t1.headers), opt), { ...base, existing: [paidOne] });
  expect(pv1.upserts).toHaveLength(0);
  expect(pv1.unchanged).toBe(1);
  const t2 = toTable(parseCsv('호실,부과월,고지액\n101호,2026-07,100'), isKnownRecvHeader);
  expect(missingRecvRequired(autoMapRecv(t2.headers))).toEqual([]);
  const pv2 = buildRecvPreview(buildRecvDrafts(t2, autoMapRecv(t2.headers), opt), { ...base, existing: [paidOne] });
  expect(pv2.unchanged).toBe(1);
});
test('파일이 수납액을 줄이면 따로 알린다', () => {
  const t = toTable(parseCsv('호실,부과월,고지액,수납액\n101호,2026-07,100,0'), isKnownRecvHeader);
  const pv = buildRecvPreview(buildRecvDrafts(t, autoMapRecv(t.headers), opt), { ...base, existing: [paidOne] });
  expect(pv.paidDecreased).toEqual([{ unitId: 'A-01', unit: '101호', month: '2026-07', file: 0, pmai: 100 }]);
  expect(pv.upserts[0]).toMatchObject({ paid: 0 });
  expect(pv.upserts[0].paidDate).toBeUndefined();
});
test('다른 이름 둘이 같은 호실로 맞춰지면 뒤의 줄을 못 읽은 줄로 둔다', () => {
  const t = toTable(parseCsv('호실,고지액,수납액\n101호,100,100\n상가1,200,200'), isKnownRecvHeader);
  const pv = buildRecvPreview(buildRecvDrafts(t, autoMapRecv(t.headers), opt), { ...base, savedUnits: { 상가1: 'A-01' } });
  expect(pv.upserts).toHaveLength(1);
  expect(pv.errors.at(-1)!.reason).toBe('2번째 줄과 같은 호실·월(101호 2026-10)이 또 나옵니다');
});
test('파일 전체 합계와 반영분 합계를 따로 준다', () => {
  const t = load();
  const pv = buildRecvPreview(buildRecvDrafts(t, autoMapRecv(t.headers), opt), base);
  expect(pv.fileBilled).toBe(1250000 + 4800000 + 14300000 + 900000 + 1240000);
  expect(pv.filePaid).toBe(1250000 + 0 + 14300000 + 900000 + 1240000);
});
