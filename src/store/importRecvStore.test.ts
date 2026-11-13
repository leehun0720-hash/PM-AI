import { beforeEach, expect, test } from 'vitest';
import type { Receivable } from '../domain/types';
import { useStore } from './store';

const s = () => useStore.getState();
beforeEach(() => s().resetData());

const existingOne = () => s().receivables.find((r) => r.buildingId === 'A')!;
const args = (upserts: Receivable[], batchId = 'R1') => ({ buildingId: 'A', fileName: 'r.csv', batchId, upserts, profile: { columns: {}, accounts: {}, units: { '1702호': 'A-08' } } });

test('수납 반영: 있는 기록은 고쳐 쓰고 없는 기록은 만든다', () => {
  const old = existingOne();
  const before = s().receivables.length;
  const fresh: Receivable = { id: 'RC-A-02-2031-01', buildingId: 'A', month: '2031-01', unitId: 'A-02', tenant: '갑', billed: 100, paid: 0, dueDate: '2031-02-25' };
  expect(s().applyRecvImport(args([{ ...old, paid: old.billed, paidDate: '2031-01-05' }, fresh]))).toEqual({ ok: true, batchId: 'R1' });
  expect(s().receivables.length).toBe(before + 1);
  expect(s().receivables.find((r) => r.id === old.id)).toMatchObject({ paid: old.billed, paidDate: '2031-01-05' });
  expect(s().importBatches[0]).toMatchObject({ id: 'R1', kind: 'receivable', count: 2, amount: old.billed });
  expect(s().importProfiles.A.units).toEqual({ '1702호': 'A-08' });
  expect(s().audit[0].action).toBe('수납 가져오기');
});
test('수납 되돌리기: 고친 기록은 이전 값으로, 만든 기록은 지운다', () => {
  const old = existingOne();
  const before = s().receivables.length;
  const fresh: Receivable = { id: 'RC-A-02-2031-01', buildingId: 'A', month: '2031-01', unitId: 'A-02', tenant: '갑', billed: 100, paid: 0, dueDate: '2031-02-25' };
  s().applyRecvImport(args([{ ...old, paid: old.billed }, fresh]));
  expect(s().undoImport('R1')).toEqual({ ok: true, removed: 2 });
  expect(s().receivables.length).toBe(before);
  expect(s().receivables.find((r) => r.id === old.id)).toEqual(old);
});
test('가져온 뒤 다시 바뀐 수납 기록이 있으면 되돌리지 않는다', () => {
  const old = existingOne();
  s().applyRecvImport(args([{ ...old, paid: 1 }]));
  s().recordPayment(old.id);
  expect(s().undoImport('R1')).toEqual({ ok: false, reason: '가져온 뒤 다시 바뀐 수납 기록이 있어 되돌릴 수 없습니다.' });
});
test('반영할 수납 기록이 없으면 막는다', () => {
  expect(s().applyRecvImport(args([]))).toEqual({ ok: false, reason: '반영할 줄이 없습니다.' });
});
