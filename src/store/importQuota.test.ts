import { beforeAll, expect, test, vi } from 'vitest';

// 일정 크기를 넘으면 QuotaExceededError를 던지는 가짜 브라우저 저장소
const LIMIT = 3_000_000;
const mem = new Map<string, string>();
const fake = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => {
    if (v.length > LIMIT) throw new DOMException('quota', 'QuotaExceededError');
    mem.set(k, v);
  },
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
};

let useStore: typeof import('./store').useStore;
beforeAll(async () => {
  vi.stubGlobal('localStorage', fake);
  vi.stubGlobal('window', { localStorage: fake }); // zustand persist는 window.localStorage를 쓴다
  ({ useStore } = await import('./store'));
});

test('저장 공간을 넘으면 실패를 알리고 기존 데이터와 이후 동작은 멀쩡하다', () => {
  const s = () => useStore.getState();
  const before = s().expenses.length;
  const fresh = Array.from({ length: 20000 }, (_, i) => ({
    buildingId: 'A', month: '2031-01', itemId: 'REPAIR', account: '수선유지비', vendor: `업체${i}`, amount: 1000 + i,
    memo: '아주 긴 적요 '.repeat(5), batchId: 'BQ', fingerprint: `fp-q${i}`,
  }));
  const r = s().applyImport({ buildingId: 'A', fileName: 'big.csv', batchId: 'BQ', fresh, profile: { columns: {}, accounts: {} } });
  expect(r).toEqual({ ok: false, reason: '브라우저 저장 공간이 부족합니다. 월별로 나눠 올려 주세요.' });
  expect(s().expenses.length).toBe(before);
  expect(s().importBatches).toEqual([]);
  expect(() => s().setBuilding('B')).not.toThrow();
  expect(JSON.parse(mem.get('pmai-state-v1')!).state.buildingId).toBe('B');
});
