import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { CHARGE_ITEMS } from '../data/seed';
import { buildDrafts, buildPreview, missingRequired } from './importLedger';
import { autoMap, isKnownHeader } from './importMap';
import { parseCsv, toTable } from './importTable';

const items = CHARGE_ITEMS;
const load = (name: string) => toTable(parseCsv(readFileSync(`samples/import/${name}`, 'utf8')), isKnownHeader);
const opt = { buildingId: 'A', fallbackMonth: '2026-10' };

test('작은 건물 엑셀: 합계 줄을 건너뛰고 못 읽은 줄은 이유를 남긴다', () => {
  const t = load('small-building-expense.csv');
  const p = buildDrafts(t, autoMap(t.headers), opt);
  expect(p.skippedSummary).toBe(1);
  expect(p.errors).toHaveLength(1);
  expect(p.errors[0].reason).toContain('미정');
  expect(p.drafts).toHaveLength(7);
  expect(p.drafts.some((d) => d.amount === -55000)).toBe(true);
});
test('전표 파일: 차변 − 대변', () => {
  const t = load('erp-voucher.csv');
  const p = buildDrafts(t, autoMap(t.headers), opt);
  expect(p.drafts[0]).toMatchObject({ month: '2026-09', date: '2026-09-05', amount: 26300000, vendor: '㈜케이피엠' });
  expect(p.drafts.some((d) => d.amount < 0)).toBe(true);
});
test('같은 파일을 다시 올리면 전부 중복', () => {
  const t = load('small-building-expense.csv');
  const p = buildDrafts(t, autoMap(t.headers), opt);
  const opts = { buildingId: 'A', items, savedAccounts: { 회식비: items[0].id }, batchId: 'B1' };
  const first = buildPreview(p, { ...opts, existing: new Set() });
  const second = buildPreview(p, { ...opts, existing: new Set(first.fresh.map((e) => e.fingerprint!)) });
  expect(first.fresh).toHaveLength(7);
  expect(second.fresh).toHaveLength(0);
  expect(second.duplicates).toBe(7);
});
test('파일 안의 똑같은 두 줄은 둘 다 받는다', () => {
  const t = toTable(parseCsv('계정,금액\n수선비,1000\n수선비,1000'), isKnownHeader);
  const p = buildDrafts(t, autoMap(t.headers), opt);
  expect(new Set(p.drafts.map((d) => d.fingerprint)).size).toBe(2);
});
test('항목을 못 정한 계정은 반영하지 않고 따로 모은다', () => {
  const t = load('small-building-expense.csv');
  const p = buildDrafts(t, autoMap(t.headers), opt);
  const pv = buildPreview(p, { buildingId: 'A', items, savedAccounts: {}, existing: new Set(), batchId: 'B1' });
  expect(pv.unmapped).toEqual([{ account: '회식비', count: 2, amount: 406000 }]);
  expect(pv.fresh).toHaveLength(5);
  expect(pv.total).toBe(pv.fresh.reduce((a, e) => a + e.amount, 0));
  expect(pv.months).toEqual(['2026-10']);
  expect(pv.fresh[0]).toMatchObject({ buildingId: 'A', itemId: 'CLEAN', batchId: 'B1', date: '2026-10-05' });
});
test('필수 열이 없으면 알려 준다', () => {
  expect(missingRequired(autoMap(['업체명', '내용']))).toEqual(['amount', 'account']);
});
test('20,000줄을 넘으면 받지 않는다', () => {
  const t = { headers: ['계정', '금액'], rows: Array.from({ length: 20001 }, () => ['수선비', '1']), headerRow: 0 };
  const p = buildDrafts(t, autoMap(t.headers), opt);
  expect(p.drafts).toHaveLength(0);
  expect(p.errors[0].reason).toContain('20,000');
});
test('계정이 빈 줄은 이유를 남긴다', () => {
  const t = toTable(parseCsv('계정,금액,거래처\n,1000,갑\n수선비,2000,을'), isKnownHeader);
  const p = buildDrafts(t, autoMap(t.headers), opt);
  expect(p.errors).toEqual([{ row: 2, reason: '계정이 비어 있습니다', raw: ['', '1000', '갑'] }]);
});

test('차변이 글자면 대변이 있어도 못 읽은 줄로 둔다', () => {
  const t = toTable(parseCsv('계정,차변,대변\n수선비,미정,500\n수선비,미정,0\n수선비,,300'), isKnownHeader);
  const p = buildDrafts(t, autoMap(t.headers), opt);
  expect(p.errors.map((e) => e.row)).toEqual([2, 3]);
  expect(p.drafts).toHaveLength(1);
  expect(p.drafts[0].amount).toBe(-300);
});
test('일자·귀속월 칸을 못 읽으면 화면 월로 넣지 않고 못 읽은 줄로 둔다', () => {
  const t = toTable(parseCsv('일자,계정,금액\n24.01.15,수선비,1000\n,수선비,2000'), isKnownHeader);
  const p = buildDrafts(t, autoMap(t.headers), opt);
  expect(p.errors).toHaveLength(1);
  expect(p.errors[0].reason).toContain('24.01.15');
  expect(p.drafts).toEqual([expect.objectContaining({ amount: 2000, month: '2026-10' })]);
});
test('적요가 "합계"로 시작하는 실제 지출은 합계 줄로 보지 않는다', () => {
  const t = toTable(parseCsv('계정,적요,금액\n수선비,합계잔액 조정 수수료,1000\n합계,,1000'), isKnownHeader);
  const p = buildDrafts(t, autoMap(t.headers), opt);
  expect(p.drafts).toHaveLength(1);
  expect(p.skippedSummary).toBe(1);
});
