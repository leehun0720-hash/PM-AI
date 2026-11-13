import { beforeEach, expect, test } from 'vitest';
import { useStore } from './store';

const s = () => useStore.getState();
const itemId = 'REPAIR';
const fresh = [{ buildingId: 'A', month: '2031-01', itemId, account: '수선비', vendor: '갑', amount: 1000, memo: '', batchId: 'B1', fingerprint: 'fp-1' }];
const args = { buildingId: 'A', fileName: 'a.csv', batchId: 'B1', fresh, profile: { columns: {}, accounts: { 수선비: itemId } } };

beforeEach(() => s().resetData());

test('반영하면 지출·묶음·감사 로그가 생긴다', () => {
  const before = s().expenses.length;
  expect(s().applyImport(args)).toEqual({ ok: true, batchId: 'B1' });
  expect(s().expenses.length).toBe(before + 1);
  expect(s().expenses.at(-1)!.id).toBeTruthy();
  expect(s().importBatches[0]).toMatchObject({ id: 'B1', count: 1, amount: 1000, months: ['2031-01'], fileName: 'a.csv' });
  expect(s().importProfiles.A.accounts.수선비).toBe(itemId);
  expect(s().audit[0].action).toBe('지출 가져오기');
});
test('되돌리면 그 묶음의 줄만 사라지고 두 번은 안 된다', () => {
  const before = s().expenses.length;
  s().applyImport(args);
  expect(s().undoImport('B1')).toEqual({ ok: true, removed: 1 });
  expect(s().expenses.length).toBe(before);
  expect(s().importBatches[0].undoneAt).toBeTruthy();
  expect(s().audit[0].action).toBe('가져오기 되돌리기');
  expect(s().undoImport('B1')).toEqual({ ok: false, reason: '이미 되돌린 기록입니다.' });
});
test('승인된 정산이 있는 월은 반영도 되돌리기도 막는다', () => {
  s().applyImport(args);
  const id = s().runSettlement('A', '2031-01');
  useStore.setState((st) => ({ settlements: st.settlements.map((x) => (x.id === id ? { ...x, status: 'approved' as const } : x)) }));
  expect(s().lockedMonths('A', ['2031-01', '2031-02'])).toEqual(['2031-01']);
  const r = s().applyImport({ ...args, batchId: 'B2', fresh: [{ ...fresh[0], batchId: 'B2', fingerprint: 'fp-2' }] });
  expect(r).toMatchObject({ ok: false });
  expect(r.ok === false && r.reason).toContain('2031-01');
  expect(s().undoImport('B1')).toMatchObject({ ok: false });
});
test('반영할 줄이 없으면 막는다', () => {
  expect(s().applyImport({ ...args, fresh: [] })).toEqual({ ok: false, reason: '반영할 줄이 없습니다.' });
});
test('초기화하면 가져온 기록도 비운다', () => {
  s().applyImport(args);
  s().resetData();
  expect(s().importBatches).toEqual([]);
  expect(s().importProfiles).toEqual({});
});
