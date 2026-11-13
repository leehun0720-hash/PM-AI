import { expect, test } from 'vitest';
import { autoMap, normHeader, parseAmount, parseDate, parseMonth } from './importMap';

test('열 이름을 자동으로 맞춘다', () => {
  const m = autoMap(['일자', '전표번호', '계정코드', '계정과목', '거래처명', '적요', '차변', '대변', '부가세', '증빙번호']);
  expect(m).toMatchObject({ date: 0, account: 3, vendor: 4, memo: 5, amount: 6, credit: 7, vat: 8, docNo: 9, month: null });
});
test('괄호·공백이 섞인 열 이름도 맞춘다', () => {
  expect(autoMap(['지 출 액(원)', '비목', '업체명']).amount).toBe(0);
  expect(normHeader(' 금액 (VAT 별도) ')).toBe('금액');
});
test('금액 표기', () => {
  expect(parseAmount('26,300,000')).toBe(26300000);
  expect(parseAmount('(1,000)')).toBe(-1000);
  expect(parseAmount('△1,000원')).toBe(-1000);
  expect(parseAmount('')).toBeNull();
  expect(parseAmount('미정')).toBeNull();
});
test('날짜·월 표기', () => {
  expect(parseDate('2026.10.05')).toBe('2026-10-05');
  expect(parseDate('20261005')).toBe('2026-10-05');
  expect(parseDate('46300')).toBe('2026-10-05');
  expect(parseDate('2026-13-01')).toBeNull();
  expect(parseMonth('2026년 10월')).toBe('2026-10');
  expect(parseMonth('2026-10-05')).toBe('2026-10');
});
