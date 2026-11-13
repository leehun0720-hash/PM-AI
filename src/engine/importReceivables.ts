// 가져오기 2단계: 관리비 고지·수납 현황 표 → 수납 기록. 같은 호실·월이 있으면 고쳐 쓰고, 없으면 새로 만든다.
import type { ISODate, Month, Receivable, Settlement, Unit } from '../domain/types';
import type { RowError } from './importLedger';
import { normHeader, parseAmount, parseDate, parseMonth } from './importMap';
import type { Table } from './importTable';
import { addMonths } from './money';

export type RecvField = 'unit' | 'tenant' | 'month' | 'billed' | 'paid' | 'dueDate' | 'paidDate';
export const RECV_REQUIRED: RecvField[] = ['unit', 'billed', 'paid'];
export type RecvColumnMap = Record<RecvField, number | null>;

export const RECV_LABEL: Record<RecvField, string> = {
  unit: '호실', tenant: '임차인', month: '부과월', billed: '고지액', paid: '수납액', dueDate: '납기일', paidDate: '입금일',
};

/** 항목별 후보 열 이름(실제 건물 파일을 보기 전의 가정). 앞에 있을수록 우선. */
export const RECV_FIELDS: Record<RecvField, string[]> = {
  unit: ['호실', '호수', '동호', '호', '세대', '점포'],
  tenant: ['상호', '입주사', '임차인', '입주자', '성명', '업체명'],
  month: ['부과월', '고지월', '귀속월', '청구월', '부과년월'],
  billed: ['고지액', '부과액', '청구액', '고지금액', '부과금액', '당월부과액', '관리비'],
  paid: ['수납액', '입금액', '납부액', '수납금액', '입금금액'],
  dueDate: ['납기일', '납부기한', '납기'],
  paidDate: ['입금일', '수납일', '납부일', '입금일자'],
};
const FIELDS = Object.keys(RECV_FIELDS) as RecvField[];
const KNOWN = new Set(FIELDS.flatMap((f) => RECV_FIELDS[f].map(normHeader)));
export const isKnownRecvHeader = (h: string) => KNOWN.has(normHeader(h));

export function autoMapRecv(headers: string[]): RecvColumnMap {
  const norm = headers.map(normHeader);
  const used = new Set<number>();
  const map = {} as RecvColumnMap;
  for (const f of FIELDS) {
    map[f] = null;
    for (const cand of RECV_FIELDS[f]) {
      const i = norm.findIndex((h, k) => h === normHeader(cand) && !used.has(k));
      if (i >= 0) { map[f] = i; used.add(i); break; }
    }
  }
  return map;
}
export const missingRecvRequired = (map: RecvColumnMap): RecvField[] => RECV_REQUIRED.filter((f) => map[f] === null);

const unitKey = (s: string) => s.replace(/\s+/g, '').replace(/호$/, '').toLowerCase();

/** ① 저장해 둔 대응 ② 공백·끝의 '호'를 뺀 이름이 같은 호실 ③ null */
export function matchUnit(raw: string, units: Unit[], saved: Record<string, string>): string | null {
  const r = raw.trim();
  if (saved[r]) return saved[r];
  const k = unitKey(r);
  return units.find((u) => unitKey(u.name) === k)?.id ?? null;
}

export interface RecvDraft { row: number; unit: string; tenant: string; month: Month; billed: number; paid: number; dueDate: ISODate; paidDate?: ISODate }
export interface RecvParsed { drafts: RecvDraft[]; errors: RowError[]; skippedSummary: number }

const SUMMARY = /^(합계|소계|총계|누계|total)/;

export function buildRecvDrafts(table: Table, map: RecvColumnMap, opts: { fallbackMonth: Month }): RecvParsed {
  const out: RecvParsed = { drafts: [], errors: [], skippedSummary: 0 };
  const seen = new Map<string, number>();
  table.rows.forEach((r, i) => {
    const row = table.headerRow + 2 + i;
    const cell = (f: RecvField) => (map[f] === null ? '' : (r[map[f]!] ?? '').trim());
    const fail = (reason: string) => out.errors.push({ row, reason, raw: r });
    const first = r.find((c) => c.trim() !== '') ?? '';
    if (SUMMARY.test(normHeader(first))) { out.skippedSummary++; return; }
    const unit = cell('unit');
    if (!unit) { fail('호실이 비어 있습니다'); return; }
    const billedRaw = cell('billed');
    const billed = parseAmount(billedRaw);
    if (billed === null) { fail(`고지액을 읽지 못했습니다: "${billedRaw}"`); return; }
    const paidRaw = cell('paid');
    const paid = paidRaw ? parseAmount(paidRaw) : 0; // 빈 수납액 = 아직 안 냄
    if (paid === null) { fail(`수납액을 읽지 못했습니다: "${paidRaw}"`); return; }
    const monthRaw = cell('month');
    const month = monthRaw ? parseMonth(monthRaw) : opts.fallbackMonth;
    if (!month) { fail(`부과월을 읽지 못했습니다: "${monthRaw}"`); return; }
    const dueRaw = cell('dueDate');
    const due = dueRaw ? parseDate(dueRaw) : `${addMonths(month, 1)}-25`;
    if (!due) { fail(`납기일을 읽지 못했습니다: "${dueRaw}"`); return; }
    const paidDateRaw = cell('paidDate');
    const paidDate = paidDateRaw ? parseDate(paidDateRaw) : undefined;
    if (paidDate === null) { fail(`입금일을 읽지 못했습니다: "${paidDateRaw}"`); return; }
    const key = `${unitKey(unit)}|${month}`;
    if (seen.has(key)) { fail(`${seen.get(key)}번째 줄과 같은 호실·월이 또 나옵니다`); return; }
    seen.set(key, row);
    out.drafts.push({ row, unit, tenant: cell('tenant'), month, billed, paid, dueDate: due, paidDate });
  });
  return out;
}

export interface RecvPreview {
  upserts: Receivable[];
  created: number;
  updated: number;
  unchanged: number;
  unmapped: { unit: string; count: number; billed: number }[];
  errors: RowError[];
  skippedSummary: number;
  overpaid: number;
  billedMismatch: { unitId: string; unit: string; month: Month; file: number; pmai: number }[];
  months: Month[];
  totalBilled: number;
  totalPaid: number;
}

const same = (a: Receivable, b: Receivable) =>
  a.billed === b.billed && a.paid === b.paid && a.dueDate === b.dueDate && (a.paidDate ?? '') === (b.paidDate ?? '') && a.tenant === b.tenant;

/** settlementBilled: 'unitId|month' → PMAI 정산의 임차인 부담 합계(부가세 포함). 고지액 대조에 쓰고, 정산이 없으면 이미 있던 수납 기록의 고지액과 견준다. */
export function buildRecvPreview(parsed: RecvParsed, opts: { buildingId: string; units: Unit[]; savedUnits: Record<string, string>; existing: Receivable[]; settlementBilled: Map<string, number> }): RecvPreview {
  const pv: RecvPreview = { upserts: [], created: 0, updated: 0, unchanged: 0, unmapped: [], errors: parsed.errors, skippedSummary: parsed.skippedSummary, overpaid: 0, billedMismatch: [], months: [], totalBilled: 0, totalPaid: 0 };
  const units = opts.units.filter((u) => u.buildingId === opts.buildingId);
  const unmapped = new Map<string, { unit: string; count: number; billed: number }>();
  const byId = new Map(opts.existing.map((r) => [r.id, r]));
  for (const d of parsed.drafts) {
    const unitId = matchUnit(d.unit, units, opts.savedUnits);
    if (!unitId) {
      const u = unmapped.get(d.unit) ?? { unit: d.unit, count: 0, billed: 0 };
      u.count++; u.billed += d.billed;
      unmapped.set(d.unit, u);
      continue;
    }
    const id = `RC-${unitId}-${d.month}`;
    const old = byId.get(id);
    const rec: Receivable = {
      id, buildingId: opts.buildingId, month: d.month, unitId, tenant: d.tenant || old?.tenant || '',
      billed: d.billed, paid: d.paid, dueDate: d.dueDate, ...(d.paidDate ? { paidDate: d.paidDate } : {}),
    };
    if (d.paid > d.billed) pv.overpaid++;
    const pmai = opts.settlementBilled.get(`${unitId}|${d.month}`) ?? old?.billed; // 정산 값, 없으면 이미 있던 고지액
    if (pmai !== undefined && pmai !== d.billed) pv.billedMismatch.push({ unitId, unit: d.unit, month: d.month, file: d.billed, pmai });
    if (old && same(old, rec)) { pv.unchanged++; continue; }
    if (old) pv.updated++; else pv.created++;
    pv.upserts.push(rec);
    pv.totalBilled += rec.billed;
    pv.totalPaid += rec.paid;
  }
  pv.unmapped = [...unmapped.values()];
  pv.months = [...new Set(pv.upserts.map((r) => r.month))].sort();
  return pv;
}

/** 'unitId|month' → 정산의 임차인 부담 합계(부가세 포함). 같은 월에 정산이 여럿이면 승인된 것, 없으면 가장 최근 것. */
export function settlementBilledMap(settlements: Settlement[], buildingId: string): Map<string, number> {
  const pick = new Map<Month, Settlement>();
  for (const st of settlements.filter((x) => x.buildingId === buildingId)) {
    const cur = pick.get(st.month);
    const better = !cur || (st.status === 'approved' && cur.status !== 'approved') || (st.status === cur.status && st.createdAt > cur.createdAt);
    if (better) pick.set(st.month, st);
  }
  const out = new Map<string, number>();
  for (const st of pick.values()) for (const l of st.lines) if (l.payer === 'tenant') {
    const k = `${l.unitId}|${st.month}`;
    out.set(k, (out.get(k) ?? 0) + l.amount + l.vat);
  }
  return out;
}
