// 엑셀(.xlsx) → 시트별 줄×칸. 읽기 전용 라이브러리(read-excel-file)를 감싼 얇은 층.
// 화면에서는 버튼을 누를 때만 동적으로 불러와 첫 화면 용량을 늘리지 않는다.
import readXlsxFile from 'read-excel-file/universal';
import type { Grid } from '../pages/accounting/ImportDialog';

const pad = (n: number) => String(n).padStart(2, '0');

/** 칸 값을 모두 글자로: 날짜는 YYYY-MM-DD, 숫자는 쉼표 없는 숫자 글자 */
function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
  return String(v);
}

export async function readXlsx(buf: ArrayBuffer): Promise<Grid> {
  let sheets: { sheet: string; data: unknown[][] }[];
  try {
    sheets = (await readXlsxFile(buf)) as { sheet: string; data: unknown[][] }[];
  } catch {
    throw new Error('엑셀 파일을 읽지 못했습니다. 파일이 손상됐거나 암호가 걸려 있을 수 있습니다.');
  }
  const grids = new Map(sheets.map((s) => [s.sheet, s.data.map((r) => r.map(cellText))]));
  const names = sheets.map((s) => s.sheet);
  return { sheets: names, grid: (sheet) => grids.get(sheet ?? names[0]) ?? [] };
}
