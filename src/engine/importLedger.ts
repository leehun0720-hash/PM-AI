// 가져오기 3단계: 표 → 지출 줄, 중복 방지 지문, 계정→관리비 항목, 미리보기. 순수 함수만 둔다.
import type { ChargeItem, Expense, ISODate, Month } from '../domain/types';
import { type ColumnMap, type ExpenseField, normHeader, parseAmount, parseDate, parseMonth, REQUIRED } from './importMap';
import type { Table } from './importTable';

export const MAX_ROWS = 20000;

export interface DraftRow { row: number; month: Month; date?: ISODate; account: string; vendor: string; amount: number; memo: string; vat?: number; docNo?: string; fingerprint: string }
export interface RowError { row: number; reason: string; raw: string[] }
export interface ParsedRows { drafts: DraftRow[]; errors: RowError[]; skippedSummary: number; skippedZero: number }

export const missingRequired = (map: ColumnMap): ExpenseField[] => REQUIRED.filter((f) => map[f] === null);

function fnv1a(s: string, seed: number): string {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/** (건물, 월, 일자, 계정, 거래처, 금액, 적요, 증빙번호, 파일 안 순번) → 'fp-' + 16자리 16진수 */
export function fingerprint(buildingId: string, d: Omit<DraftRow, 'fingerprint' | 'row'>, seq: number): string {
  const key = [buildingId, d.month, d.date ?? '', d.account, d.vendor, d.amount, d.memo, d.docNo ?? '', seq].join('\u001f');
  return `fp-${fnv1a(key, 0x811c9dc5)}${fnv1a(key, 0x01000193)}`;
}

const SUMMARY = /^(합계|소계|총계|누계|total)/;

export function buildDrafts(table: Table, map: ColumnMap, opts: { buildingId: string; fallbackMonth: Month }): ParsedRows {
  const out: ParsedRows = { drafts: [], errors: [], skippedSummary: 0, skippedZero: 0 };
  if (table.rows.length > MAX_ROWS) {
    out.errors.push({ row: 0, reason: '줄이 너무 많습니다(최대 20,000줄). 월별로 나눠 올려 주세요.', raw: [] });
    return out;
  }
  const seen = new Map<string, number>();
  table.rows.forEach((r, i) => {
    const row = table.headerRow + 2 + i;
    const cell = (f: ExpenseField) => (map[f] === null ? '' : (r[map[f]!] ?? '').trim());
    // 합계 줄은 처음 채워진 칸만 본다(적요가 '합계…'로 시작하는 실제 지출을 빼지 않도록)
    const first = r.find((c) => c.trim() !== '') ?? '';
    if (SUMMARY.test(normHeader(first))) { out.skippedSummary++; return; }
    const fail = (reason: string) => out.errors.push({ row, reason, raw: r });
    const debitRaw = cell('amount');
    const creditRaw = cell('credit');
    const debit = parseAmount(debitRaw);
    const credit = parseAmount(creditRaw);
    // 채워져 있는데 못 읽은 칸은 0으로 치지 않는다
    if ((debitRaw && debit === null) || (!debitRaw && !creditRaw)) { fail(`금액을 읽지 못했습니다: "${debitRaw}"`); return; }
    if (creditRaw && credit === null) { fail(`대변 금액을 읽지 못했습니다: "${creditRaw}"`); return; }
    const amount = (debit ?? 0) - (credit ?? 0);
    const account = cell('account');
    if (!account) { fail('계정이 비어 있습니다'); return; }
    const dateRaw = cell('date');
    const monthRaw = cell('month');
    const date = parseDate(dateRaw) ?? undefined;
    if (dateRaw && !date) { fail(`일자를 읽지 못했습니다: "${dateRaw}"`); return; }
    const pickedMonth = monthRaw ? parseMonth(monthRaw) : null;
    if (monthRaw && !pickedMonth) { fail(`귀속월을 읽지 못했습니다: "${monthRaw}"`); return; }
    if (amount === 0) { out.skippedZero++; return; }
    const month = pickedMonth ?? date?.slice(0, 7) ?? opts.fallbackMonth;
    const vat = map.vat === null ? undefined : parseAmount(cell('vat')) ?? undefined;
    const docNo = cell('docNo') || undefined;
    const base = { month, date, account, vendor: cell('vendor'), amount, memo: cell('memo'), vat, docNo };
    const seqKey = fingerprint(opts.buildingId, base, 0);
    const seq = seen.get(seqKey) ?? 0;
    seen.set(seqKey, seq + 1);
    out.drafts.push({ row, ...base, fingerprint: fingerprint(opts.buildingId, base, seq) });
  });
  return out;
}

const squash = (s: string) => s.replace(/\s+/g, '');

/** ① 저장해 둔 대응 ② 항목의 계정 목록에 같은 이름 ③ 항목 이름과 같음 ④ null */
export function resolveItem(account: string, items: ChargeItem[], saved: Record<string, string>): string | null {
  if (saved[account]) return saved[account];
  const a = squash(account);
  return items.find((i) => i.accounts.some((x) => squash(x) === a))?.id ?? items.find((i) => squash(i.name) === a)?.id ?? null;
}

export interface ImportPreview {
  fresh: Omit<Expense, 'id'>[];
  duplicates: number;
  unmapped: { account: string; count: number; amount: number }[];
  errors: RowError[];
  skippedSummary: number;
  skippedZero: number;
  total: number;
  months: Month[];
}

export function buildPreview(parsed: ParsedRows, opts: { buildingId: string; items: ChargeItem[]; savedAccounts: Record<string, string>; existing: Set<string>; batchId: string }): ImportPreview {
  const fresh: Omit<Expense, 'id'>[] = [];
  const unmapped = new Map<string, { account: string; count: number; amount: number }>();
  let duplicates = 0;
  for (const d of parsed.drafts) {
    if (opts.existing.has(d.fingerprint)) { duplicates++; continue; }
    const itemId = resolveItem(d.account, opts.items, opts.savedAccounts);
    if (!itemId) {
      const u = unmapped.get(d.account) ?? { account: d.account, count: 0, amount: 0 };
      u.count++; u.amount += d.amount;
      unmapped.set(d.account, u);
      continue;
    }
    fresh.push({
      buildingId: opts.buildingId, month: d.month, itemId, account: d.account, vendor: d.vendor, amount: d.amount, memo: d.memo,
      date: d.date, vat: d.vat, docNo: d.docNo, batchId: opts.batchId, fingerprint: d.fingerprint,
    });
  }
  return {
    fresh, duplicates, unmapped: [...unmapped.values()], errors: parsed.errors,
    skippedSummary: parsed.skippedSummary, skippedZero: parsed.skippedZero,
    total: fresh.reduce((a, e) => a + e.amount, 0),
    months: [...new Set(fresh.map((e) => e.month))].sort(),
  };
}
