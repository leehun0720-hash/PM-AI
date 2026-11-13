import type { Grid } from '../pages/accounting/ImportDialog';

/** XLSX → 시트별 줄×칸. (Task 6에서 구현) */
export async function readXlsx(_buf: ArrayBuffer): Promise<Grid> {
  throw new Error('엑셀(.xlsx) 읽기는 준비 중입니다. CSV로 저장해 올려 주세요.');
}
