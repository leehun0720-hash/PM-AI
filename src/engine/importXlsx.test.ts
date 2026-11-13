import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { buildDrafts } from './importLedger';
import { autoMap, isKnownHeader } from './importMap';
import { toTable } from './importTable';
import { readXlsx } from './importXlsx';

test('xlsx를 CSV와 같은 결과로 읽는다', async () => {
  const b = readFileSync('samples/import/small-building-expense.xlsx');
  const x = await readXlsx(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  expect(x.sheets).toEqual(['10월', '메모']);
  const t = toTable(x.grid('10월'), isKnownHeader);
  const p = buildDrafts(t, autoMap(t.headers), { buildingId: 'A', fallbackMonth: '2026-10' });
  expect(p.drafts).toHaveLength(7);
  expect(p.drafts[0].date).toBe('2026-10-05');
  expect(p.drafts[0].amount).toBe(3850000);
  expect(p.drafts.some((d) => d.amount === -55000)).toBe(true);
  expect(p.skippedSummary).toBe(1);
  expect(p.errors).toHaveLength(1);
});
