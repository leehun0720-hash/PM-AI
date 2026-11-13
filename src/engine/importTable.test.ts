import { expect, test } from 'vitest';
import { decodeText, parseCsv, toTable } from './importTable';

const known = (h: string) => ['일자', '계정코드', '차변', '거래처명'].includes(h.trim());

test('따옴표 속 쉼표와 줄바꿈을 한 칸으로 읽는다', () => {
  expect(parseCsv('a,"1,000","줄1\n줄2"\r\nb,"그는 ""예""라고",')).toEqual([['a', '1,000', '줄1\n줄2'], ['b', '그는 "예"라고', '']]);
});
test('제목 줄을 건너뛰고 열 이름 줄을 찾는다', () => {
  const grid = parseCsv('더존 iCUBE 전표출력\n출력일: 2026-10-01\n일자,전표번호,계정코드,거래처명,차변\n2026-09-05,1,5110,㈜케이피엠,"26,300,000"\n,,,,\n');
  const t = toTable(grid, known);
  expect(t.headerRow).toBe(2);
  expect(t.headers[2]).toBe('계정코드');
  expect(t.rows).toHaveLength(1);
});
test('EUC-KR 파일을 깨지지 않게 읽는다', () => {
  const eucKr = new Uint8Array([0xb1, 0xdd, 0xbe, 0xd7]); // '금액'
  expect(decodeText(eucKr.buffer)).toBe('금액');
});
test('UTF-8 BOM을 지운다', () => {
  expect(decodeText(new TextEncoder().encode('﻿금액').buffer as ArrayBuffer)).toBe('금액');
});
test('빈 파일은 headerRow -1', () => {
  expect(toTable(parseCsv(''), known)).toEqual({ headers: [], rows: [], headerRow: -1 });
});
