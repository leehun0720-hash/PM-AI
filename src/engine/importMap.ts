// 가져오기 2단계: 열 이름 → PMAI 항목 자동 맞추기, 금액·날짜·월 읽기.

export type ExpenseField = 'amount' | 'credit' | 'account' | 'month' | 'date' | 'vendor' | 'memo' | 'vat' | 'docNo';
export const REQUIRED: ExpenseField[] = ['amount', 'account'];
export type ColumnMap = Record<ExpenseField, number | null>;

export const FIELD_LABEL: Record<ExpenseField, string> = {
  amount: '금액', credit: '대변', account: '계정', month: '귀속월', date: '일자', vendor: '거래처', memo: '적요', vat: '부가세', docNo: '증빙번호',
};

/** 항목별 후보 열 이름. 앞에 있을수록 우선. */
export const EXPENSE_FIELDS: Record<ExpenseField, string[]> = {
  amount: ['금액', '공급가액', '차변', '차변금액', '지출액', '지출금액', '출금', '출금액'],
  credit: ['대변', '대변금액', '대변액'],
  account: ['계정과목', '계정', '계정코드', '계정과목코드', '항목', '비목'],
  month: ['귀속월', '회계월', '결산월', '귀속년월'],
  date: ['일자', '전표일자', '거래일', '거래일자', '지급일', '회계일자'],
  vendor: ['거래처명', '거래처', '업체', '업체명', '지급처'],
  memo: ['적요', '내역', '비고', '내용'],
  vat: ['부가세', '부가세액', '세액'],
  docNo: ['증빙번호', '세금계산서번호', '계산서번호'],
};
const FIELDS = Object.keys(EXPENSE_FIELDS) as ExpenseField[];

/** 소문자, 괄호와 그 안 글자 제거, 공백 제거 */
export const normHeader = (s: string) => s.toLowerCase().replace(/\([^)]*\)|\[[^\]]*\]/g, '').replace(/\s+/g, '');

const KNOWN = new Set(FIELDS.flatMap((f) => EXPENSE_FIELDS[f].map(normHeader)));
export const isKnownHeader = (h: string) => KNOWN.has(normHeader(h));

export function autoMap(headers: string[]): ColumnMap {
  const norm = headers.map(normHeader);
  const used = new Set<number>();
  const map = {} as ColumnMap;
  for (const f of FIELDS) {
    map[f] = null;
    for (const cand of EXPENSE_FIELDS[f]) {
      const i = norm.findIndex((h, k) => h === normHeader(cand) && !used.has(k));
      if (i >= 0) { map[f] = i; used.add(i); break; }
    }
  }
  return map;
}

/** 쉼표·공백·원·₩ 제거. (1,000)·△1,000·▲1,000은 음수. 못 읽으면 null. */
export function parseAmount(raw: string): number | null {
  let s = (raw ?? '').replace(/[,\s원₩]/g, '');
  if (!s) return null;
  let sign = 1;
  if (/^\(.*\)$/.test(s)) { sign = -1; s = s.slice(1, -1); }
  if (/^[△▲-]/.test(s)) { sign = -sign; s = s.slice(1); }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return sign * Math.round(Number(s));
}

const pad = (n: number) => String(n).padStart(2, '0');
function valid(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (y < 1950 || y > 2100 || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** 여러 날짜 표기 → 'YYYY-MM-DD'. 엑셀 날짜 숫자(20000~80000, 기준일 1899-12-30)도 읽는다. */
export function parseDate(raw: string): string | null {
  const s = (raw ?? '').trim();
  let m = s.match(/^(\d{4})[-./년]\s*(\d{1,2})[-./월]\s*(\d{1,2})일?(?:[ T].*)?$/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const n = Math.floor(Number(s));
    if (n < 20000 || n > 80000) return null;
    return new Date(Date.UTC(1899, 11, 30) + n * 864e5).toISOString().slice(0, 10);
  }
  return null;
}

/** 'YYYY-MM' */
export function parseMonth(raw: string): string | null {
  const d = parseDate(raw);
  if (d) return d.slice(0, 7);
  const s = (raw ?? '').trim();
  const m = s.match(/^(\d{4})\s*[-./년]?\s*(\d{1,2})\s*월?$/);
  if (!m) return null;
  const mo = +m[2];
  return mo >= 1 && mo <= 12 && +m[1] >= 1950 && +m[1] <= 2100 ? `${m[1]}-${pad(mo)}` : null;
}
