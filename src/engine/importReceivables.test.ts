import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import type { Receivable, Unit } from '../domain/types';
import { autoMapRecv, buildRecvDrafts, buildRecvPreview, isKnownRecvHeader, matchUnit, missingRecvRequired } from './importReceivables';
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
