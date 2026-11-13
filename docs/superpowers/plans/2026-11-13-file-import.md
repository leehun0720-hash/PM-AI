# 엑셀·CSV 받기 (1단계: 지출) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 실제 건물의 지출 엑셀·CSV를 고치지 않고 올려, 미리보기에서 확인한 뒤 PM-AI 지출 원장에 넣고 되돌릴 수 있게 한다.

**Architecture:** 파일은 브라우저 안에서만 읽는다. 읽기·열 맞추기·줄 만들기는 `src/engine`의 순수 함수로 두고 vitest로 검증한다. 화면(`ImportDialog`)은 그 함수를 부르기만 하고, 저장·되돌리기는 zustand 저장소 동작 두 개가 맡는다.

**Tech Stack:** React 19, TypeScript, zustand(persist), vitest, Tailwind 4. XLSX 읽기 라이브러리 1개(Task 6에서 고름).

**Spec:** `docs/superpowers/specs/2026-11-13-file-import-design.md`

## Global Constraints

- 작업 브랜치: `feat/file-import` (main에서 분기). main에 직접 커밋하지 않는다. PR 병합은 지시를 받고 한다.
- 파일 내용을 서버·외부 AI로 보내지 않는다. `src/llm`을 import하지 않는다.
- 확인 없이 저장하지 않는다. 저장은 `applyImport` 한 곳에서만 한다.
- 같은 파일을 두 번 올려도 중복 저장되지 않는다.
- 받는 형식은 `.xlsx`, `.csv`. `.xls`는 "엑셀에서 .xlsx로 다시 저장해 주세요"라고 안내하고 읽지 않는다.
- 화면 글·주석·커밋 메시지는 한국어. 커밋 메시지 끝에 `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.
- 기존 `Expense` 줄(새 칸 없음)과 기존 테스트 30개는 그대로 통과해야 한다.
- 각 Task가 끝날 때 `npm test`와 `npm run typecheck`가 통과한다.

## Review Focus

1. **승인된 정산이 있는 월** — 그 월의 지출을 가져오거나 되돌리면 승인된 숫자와 원장이 어긋난다. 기대: 반영·되돌리기를 막고 이유를 보여 준다. (Task 4)
2. **필수 열(금액·계정)을 못 찾은 파일** — 기대: 반영 버튼이 꺼지고 어느 열이 없는지 알려 준다. (Task 3, 5)
3. **금액 칸이 글자이거나 빈 줄** — 기대: 0원으로 넣지 않고 '못 읽은 줄'에 이유와 함께 보여 준다. (Task 3)
4. **빈 파일, 열 이름만 있는 파일** — 기대: 오류로 죽지 않고 "읽을 줄이 없습니다"라고 보여 준다. (Task 1, 5)
5. **매우 큰 파일 / 저장 한도 초과** — 기대: 20,000줄을 넘으면 받지 않고 안내한다. 저장이 실패하면 기존 데이터는 그대로이고 실패를 알린다. (Task 3, 4)

---

## File Structure

| 파일 | 책임 |
|---|---|
| `src/engine/importTable.ts` (새로) | 글자 → 줄×칸, 글자 깨짐 처리, 열 이름 줄 찾기 |
| `src/engine/importMap.ts` (새로) | 후보 이름 목록, 열 자동 맞추기, 금액·날짜·월 읽기 |
| `src/engine/importLedger.ts` (새로) | 표 → 지출 줄, 지문, 계정→항목, 미리보기 |
| `src/engine/importXlsx.ts` (새로) | XLSX → 줄×칸 (라이브러리를 감싼 얇은 층) |
| `src/engine/import*.test.ts` (새로) | 위 모듈별 테스트 |
| `src/domain/types.ts` (수정) | `Expense` 선택 칸, `ImportBatch`, `ImportProfile` |
| `src/store/store.ts` (수정) | `importBatches`, `importProfiles`, `applyImport`, `undoImport` |
| `src/pages/accounting/ImportDialog.tsx` (새로) | 다섯 단계 화면 |
| `src/pages/Accounting.tsx` (수정) | '파일로 가져오기' 버튼, '가져온 기록' 목록 |
| `samples/import/*.csv` (새로) | 테스트·시연용 샘플 파일 |

---

### Task 1: 표 읽기 (CSV, 글자 깨짐, 열 이름 줄)

**Files:**
- Create: `src/engine/importTable.ts`, `src/engine/importTable.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface Table { headers: string[]; rows: string[][]; headerRow: number }
  export function decodeText(buf: ArrayBuffer): string            // BOM 제거. UTF-8로 읽어 실패하면 EUC-KR
  export function parseCsv(text: string): string[][]              // 따옴표·따옴표 속 줄바꿈·쉼표, \r\n
  export function findHeaderRow(grid: string[][], known: (h: string) => boolean): number
  export function toTable(grid: string[][], known: (h: string) => boolean): Table
  ```
- `findHeaderRow`: 위 20줄 안에서 `known`이 참인 칸이 가장 많은 줄. 2칸 이상 맞는 줄이 없으면 처음으로 2칸 이상 채워진 줄. 그런 줄도 없으면 `-1`.
- `toTable`: 열 이름 줄 아래에서 모든 칸이 빈 줄은 뺀다. `headerRow`가 `-1`이면 `{ headers: [], rows: [], headerRow: -1 }`.

- [ ] **Step 1: 실패하는 테스트 작성** (`importTable.test.ts`)

```ts
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
  expect(decodeText(new TextEncoder().encode('\uFEFF금액').buffer)).toBe('금액');
});
test('빈 파일은 headerRow -1', () => {
  expect(toTable(parseCsv(''), known)).toEqual({ headers: [], rows: [], headerRow: -1 });
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/engine/importTable.test.ts` → 함수 없음으로 FAIL
- [ ] **Step 3: 구현** — `decodeText`는 `new TextDecoder('utf-8', { fatal: true })`를 먼저 쓰고 예외가 나면 `new TextDecoder('euc-kr')`.
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS, `npm run typecheck` 통과
- [ ] **Step 5: 커밋** — `feat: 가져오기용 CSV 읽기와 열 이름 줄 찾기`

---

### Task 2: 열 맞추기와 값 읽기

**Files:**
- Create: `src/engine/importMap.ts`, `src/engine/importMap.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ExpenseField = 'amount' | 'credit' | 'account' | 'month' | 'date' | 'vendor' | 'memo' | 'vat' | 'docNo';
  export const REQUIRED: ExpenseField[] = ['amount', 'account'];
  export const FIELD_LABEL: Record<ExpenseField, string>;   // 금액, 대변, 계정, 귀속월, 일자, 거래처, 적요, 부가세, 증빙번호
  export const EXPENSE_FIELDS: Record<ExpenseField, string[]>;
  export type ColumnMap = Record<ExpenseField, number | null>;   // 값은 열 번호
  export function normHeader(s: string): string;          // 소문자, 공백 제거, 괄호와 그 안 글자 제거
  export function isKnownHeader(h: string): boolean;      // Task 1의 known으로 쓴다
  export function autoMap(headers: string[]): ColumnMap;
  export function parseAmount(raw: string): number | null;
  export function parseDate(raw: string): string | null;   // 'YYYY-MM-DD'
  export function parseMonth(raw: string): string | null;  // 'YYYY-MM'
  ```
- `EXPENSE_FIELDS` 값(정규화 전 표기, 앞에 있을수록 우선):
  - amount: 금액, 공급가액, 차변, 차변금액, 지출액, 지출금액, 출금, 출금액
  - credit: 대변, 대변금액, 대변액
  - account: 계정과목, 계정, 계정코드, 계정과목코드, 항목, 비목
  - month: 귀속월, 회계월, 결산월, 귀속년월
  - date: 일자, 전표일자, 거래일, 거래일자, 지급일, 회계일자
  - vendor: 거래처명, 거래처, 업체, 업체명, 지급처
  - memo: 적요, 내역, 비고, 내용
  - vat: 부가세, 부가세액, 세액
  - docNo: 증빙번호, 세금계산서번호, 계산서번호
- `autoMap`: 항목마다 후보 순서대로 처음 맞는 열. 한 열은 한 항목에만 쓴다. `계정과목`과 `계정코드`가 둘 다 있으면 `계정과목`(이름)을 고른다.
- `parseAmount`: 쉼표·공백·`원`·`₩` 제거. `(1,000)`과 `△1,000`, `▲1,000`은 음수. 빈 칸과 숫자가 아닌 값은 `null`. 소수는 반올림.
- `parseDate`: `2026-10-05`, `2026.10.05`, `2026/10/05`, `20261005`, `2026-10-05 13:00:00`, 엑셀 날짜 숫자(20000~80000, 기준일 1899-12-30). 없는 날짜(13월 등)는 `null`.
- `parseMonth`: `2026-10`, `2026.10`, `202610`, `2026년 10월`, 그리고 `parseDate`가 읽는 값의 앞 7글자.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
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
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/engine/importMap.test.ts`
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — 테스트·typecheck
- [ ] **Step 5: 커밋** — `feat: 가져오기 열 자동 맞추기와 금액·날짜 읽기`

---

### Task 3: 지출 줄 만들기, 중복 방지, 미리보기

**Files:**
- Create: `src/engine/importLedger.ts`, `src/engine/importLedger.test.ts`, `samples/import/small-building-expense.csv`, `samples/import/erp-voucher.csv`
- Modify: `src/domain/types.ts` (`Expense`에 선택 칸 추가)

**Interfaces:**
- Consumes: Task 1 `Table`, Task 2 `ColumnMap`, `parseAmount`, `parseDate`, `parseMonth`, `REQUIRED`
- `Expense`에 추가(모두 선택): `batchId?: string; fingerprint?: string; date?: ISODate; vat?: number; docNo?: string`
- Produces:
  ```ts
  export const MAX_ROWS = 20000;
  export interface DraftRow { row: number; month: Month; date?: ISODate; account: string; vendor: string; amount: number; memo: string; vat?: number; docNo?: string; fingerprint: string }
  export interface RowError { row: number; reason: string; raw: string[] }   // row = 파일의 줄 번호(1부터)
  export interface ParsedRows { drafts: DraftRow[]; errors: RowError[]; skippedSummary: number; skippedZero: number }
  export function missingRequired(map: ColumnMap): ExpenseField[];
  export function fingerprint(buildingId: string, d: Omit<DraftRow, 'fingerprint' | 'row'>, seq: number): string;
  export function buildDrafts(table: Table, map: ColumnMap, opts: { buildingId: string; fallbackMonth: Month }): ParsedRows;
  export function resolveItem(account: string, items: ChargeItem[], saved: Record<string, string>): string | null;
  export interface ImportPreview { fresh: Omit<Expense, 'id'>[]; duplicates: number; unmapped: { account: string; count: number; amount: number }[]; errors: RowError[]; skippedSummary: number; skippedZero: number; total: number; months: Month[] }
  export function buildPreview(parsed: ParsedRows, opts: { buildingId: string; items: ChargeItem[]; savedAccounts: Record<string, string>; existing: Set<string>; batchId: string }): ImportPreview;
  ```
- `buildDrafts` 규칙:
  - 금액 = `amount` 열 − `credit` 열(있을 때). `amount` 칸을 못 읽고 `credit`만 읽히면 금액은 −대변.
  - 월 = `month` 열 → `date` 열의 월 → `fallbackMonth`.
  - 합계 줄: 어느 칸이든 정규화한 값이 `합계`, `소계`, `총계`, `누계`, `total`로 시작하면 건너뛰고 `skippedSummary`에 센다.
  - 금액 0인 줄은 `skippedZero`에 센다.
  - 금액을 못 읽으면 `errors`에 `금액을 읽지 못했습니다: "<값>"`. 계정이 비면 `계정이 비어 있습니다`.
  - `table.rows.length > MAX_ROWS`면 줄을 만들지 않고 `errors`에 한 줄: `줄이 너무 많습니다(최대 20,000줄). 월별로 나눠 올려 주세요.` (row 0)
  - 지문 `seq`: 같은 내용이 파일 안에서 n번째로 나오면 n(0부터). 같은 파일을 다시 올리면 지문이 모두 같아진다.
- `fingerprint`: (건물, 월, 일자, 계정, 거래처, 금액, 적요, 증빙번호, seq)를 `\u001f`로 이어 FNV-1a 32비트를 시드 2개로 돌린 16자리 16진수. 앞에 `fp-`.
- `resolveItem`: ① `saved[account]` ② `items` 중 `accounts`에 같은 이름(공백 제거 비교)이 있는 항목 ③ 항목 `name`과 같은 이름 ④ `null`.
- `buildPreview`: `existing`에 지문이 있으면 `duplicates`. 항목을 못 정한 줄은 `unmapped`로 계정별로 모으고 `fresh`에 넣지 않는다. `fresh`의 각 줄은 `{ buildingId, month, itemId, account, vendor, amount, memo, date, vat, docNo, batchId, fingerprint }`. `total`은 `fresh` 금액 합, `months`는 `fresh`에 나온 월(오름차순).

- [ ] **Step 1: 샘플 파일 작성**
  - `erp-voucher.csv`: `C:\Users\ten\Desktop\pmai-mvp\samples\douzone_ledger_sample.csv`를 복사한다(제목 2줄, 차변/대변).
  - `small-building-expense.csv`: 열 `지급일,비목,업체명,내용,지출액(원)`, 8줄 + 마지막에 `합계,,,,<합>` 줄. 비목은 PM-AI 샘플 항목의 `accounts`에 있는 이름 6개와 없는 이름 2개(`회식비`)를 쓴다. 아는 비목 줄 가운데 한 줄은 지출액을 `(55,000)`로, 다른 한 줄은 `미정`으로 둔다(`회식비` 두 줄은 정상 금액). 그래서 읽히는 줄은 7개(아는 비목 5 + 회식비 2), 못 읽은 줄은 1개다.
- [ ] **Step 2: 실패하는 테스트 작성**

```ts
const items = seed().items;               // src/data/seed.ts 의 샘플 항목
const load = (name: string) => toTable(parseCsv(readFileSync(`samples/import/${name}`, 'utf8')), isKnownHeader);

test('작은 건물 엑셀: 합계 줄을 건너뛰고 못 읽은 줄은 이유를 남긴다', () => {
  const t = load('small-building-expense.csv');
  const p = buildDrafts(t, autoMap(t.headers), { buildingId: 'A', fallbackMonth: '2026-10' });
  expect(p.skippedSummary).toBe(1);
  expect(p.errors).toHaveLength(1);
  expect(p.errors[0].reason).toContain('미정');
  expect(p.drafts).toHaveLength(7);
  expect(p.drafts.some((d) => d.amount === -55000)).toBe(true);
});
test('전표 파일: 차변 − 대변', () => {
  const t = load('erp-voucher.csv');
  const p = buildDrafts(t, autoMap(t.headers), { buildingId: 'A', fallbackMonth: '2026-10' });
  expect(p.drafts[0]).toMatchObject({ month: '2026-09', date: '2026-09-05', amount: 26300000, vendor: '㈜케이피엠' });
  expect(p.drafts.some((d) => d.amount < 0)).toBe(true);
});
test('같은 파일을 다시 올리면 전부 중복', () => {
  const t = load('small-building-expense.csv');
  const p = buildDrafts(t, autoMap(t.headers), { buildingId: 'A', fallbackMonth: '2026-10' });
  const opts = { buildingId: 'A', items, savedAccounts: { 회식비: items[0].id }, batchId: 'B1' };
  const first = buildPreview(p, { ...opts, existing: new Set() });
  const second = buildPreview(p, { ...opts, existing: new Set(first.fresh.map((e) => e.fingerprint!)) });
  expect(first.fresh).toHaveLength(7);
  expect(second.fresh).toHaveLength(0);
  expect(second.duplicates).toBe(7);
});
test('파일 안의 똑같은 두 줄은 둘 다 받는다', () => {
  const t = toTable(parseCsv('계정,금액\n수선비,1000\n수선비,1000'), isKnownHeader);
  const p = buildDrafts(t, autoMap(t.headers), { buildingId: 'A', fallbackMonth: '2026-10' });
  expect(new Set(p.drafts.map((d) => d.fingerprint)).size).toBe(2);
});
test('항목을 못 정한 계정은 반영하지 않고 따로 모은다', () => {
  const t = load('small-building-expense.csv');
  const p = buildDrafts(t, autoMap(t.headers), { buildingId: 'A', fallbackMonth: '2026-10' });
  const pv = buildPreview(p, { buildingId: 'A', items, savedAccounts: {}, existing: new Set(), batchId: 'B1' });
  expect(pv.unmapped).toEqual([{ account: '회식비', count: 2, amount: expect.any(Number) }]);
  expect(pv.fresh).toHaveLength(5);
  expect(pv.total).toBe(pv.fresh.reduce((a, e) => a + e.amount, 0));
});
test('필수 열이 없으면 알려 준다', () => {
  expect(missingRequired(autoMap(['업체명', '내용']))).toEqual(['amount', 'account']);
});
test('20,000줄을 넘으면 받지 않는다', () => {
  const t = { headers: ['계정', '금액'], rows: Array.from({ length: 20001 }, () => ['수선비', '1']), headerRow: 0 };
  const p = buildDrafts(t, autoMap(t.headers), { buildingId: 'A', fallbackMonth: '2026-10' });
  expect(p.drafts).toHaveLength(0);
  expect(p.errors[0].reason).toContain('20,000');
});
```

  샘플 항목을 얻는 함수 이름은 `src/data/seed.ts`와 `engine.test.ts`가 쓰는 방식을 따른다.
- [ ] **Step 3: 실패 확인** — `npx vitest run src/engine/importLedger.test.ts`
- [ ] **Step 4: 구현** (`types.ts` 선택 칸 추가 포함)
- [ ] **Step 5: 통과 확인** — `npm test` 전체, `npm run typecheck`
- [ ] **Step 6: 커밋** — `feat: 지출 가져오기 줄 만들기·중복 방지·미리보기`

---

### Task 4: 저장과 되돌리기

**Files:**
- Modify: `src/domain/types.ts`, `src/store/store.ts`
- Create: `src/store/importStore.test.ts`

**Interfaces:**
- Consumes: Task 3 `ImportPreview`
- Produces (`types.ts`):
  ```ts
  export interface ImportBatch { id: string; buildingId: string; kind: 'expense'; fileName: string; at: string; actor: string; count: number; amount: number; months: Month[]; undoneAt?: string }
  export interface ImportProfile { columns: Record<string, Partial<Record<string, string>>>; accounts: Record<string, string> }
  // columns: 열 이름 줄 서명 → { 항목: 열 이름 }.  accounts: 파일의 계정 → itemId
  ```
- Produces (`store.ts` 상태와 동작):
  ```ts
  importBatches: ImportBatch[];
  importProfiles: Record<string, ImportProfile>;            // 건물 id별
  lockedMonths: (buildingId: string, months: Month[]) => Month[];   // 승인된 정산이 있는 월
  applyImport: (a: { buildingId: string; fileName: string; batchId: string; fresh: Omit<Expense, 'id'>[]; profile: ImportProfile }) => { ok: true; batchId: string } | { ok: false; reason: string };
  undoImport: (batchId: string) => { ok: true; removed: number } | { ok: false; reason: string };
  ```
- `lockedMonths`: `settlements` 중 같은 건물·월이고 상태가 승인인 것. 상태 값 이름은 `types.ts`의 `Settlement` 정의를 따른다.
- `applyImport`: 잠긴 월이 있으면 `{ ok: false, reason: '승인된 정산이 있는 월(2026-10)은 가져올 수 없습니다.' }`. `fresh`가 비면 `{ ok: false, reason: '반영할 줄이 없습니다.' }`. 성공하면 지출 추가, 묶음 기록, 건물 프로필을 합쳐 저장(기존 대응은 유지하고 새 값으로 덮음), 감사 로그 `지출 가져오기`(대상 batchId, 내용 `<파일명> — <n>건 <금액>원`).
- `undoImport`: 그 묶음의 지출만 지운다(`batchId` 일치). 잠긴 월이 있으면 막는다. 이미 되돌린 묶음은 `{ ok: false, reason: '이미 되돌린 기록입니다.' }`. 성공하면 `undoneAt` 기록, 감사 로그 `가져오기 되돌리기`.
- 저장 실패(브라우저 저장 한도): `set` 뒤에 `localStorage.getItem('pmai-state-v1')` 길이가 4.5MB를 넘으면 방금 넣은 지출과 묶음을 빼고 `{ ok: false, reason: '브라우저 저장 공간이 부족합니다. 월별로 나눠 올려 주세요.' }`.
- `resetData`는 `importBatches`, `importProfiles`도 비운다.

- [ ] **Step 1: 실패하는 테스트 작성** (`useStore.getState()`를 직접 부른다. 각 테스트 앞에서 `resetData()`)

```ts
const fresh = [{ buildingId: 'A', month: '2031-01', itemId, account: '수선비', vendor: '갑', amount: 1000, memo: '', batchId: 'B1', fingerprint: 'fp-1' }];
test('반영하면 지출·묶음·감사 로그가 생긴다', () => {
  const before = s().expenses.length;
  expect(s().applyImport({ buildingId: 'A', fileName: 'a.csv', batchId: 'B1', fresh, profile: { columns: {}, accounts: { 수선비: itemId } } })).toEqual({ ok: true, batchId: 'B1' });
  expect(s().expenses.length).toBe(before + 1);
  expect(s().importBatches[0]).toMatchObject({ id: 'B1', count: 1, amount: 1000, months: ['2031-01'] });
  expect(s().importProfiles.A.accounts.수선비).toBe(itemId);
  expect(s().audit[0].action).toBe('지출 가져오기');
});
test('되돌리면 그 묶음의 줄만 사라지고 두 번은 안 된다', () => {
  const before = s().expenses.length;
  s().applyImport({ ...args });
  expect(s().undoImport('B1')).toEqual({ ok: true, removed: 1 });
  expect(s().expenses.length).toBe(before);
  expect(s().undoImport('B1')).toMatchObject({ ok: false });
});
test('승인된 정산이 있는 월은 반영도 되돌리기도 막는다', () => {
  // seedMonth 정산을 실행·승인 요청·승인한 뒤 같은 월로 applyImport → ok:false, reason에 월이 들어 있다
});
test('반영할 줄이 없으면 막는다', () => {
  expect(s().applyImport({ ...args, fresh: [] })).toMatchObject({ ok: false });
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/store/importStore.test.ts`
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — `npm test` 전체, typecheck
- [ ] **Step 5: 커밋** — `feat: 지출 가져오기 저장·되돌리기와 승인 월 잠금`

---

### Task 5: 화면 (CSV로 처음부터 끝까지)

**Files:**
- Create: `src/pages/accounting/ImportDialog.tsx`
- Modify: `src/pages/Accounting.tsx`

**Interfaces:**
- Consumes: Task 1~4의 모든 함수. 파일 읽기는 `readGrid(file: File): Promise<{ sheets: string[]; grid: (sheet?: string) => string[][] }>` 하나로 감싼다. 이 Task에서는 `.csv`만 처리하고, `.xlsx`는 Task 6에서 붙인다. `.xls`는 Global Constraints의 안내 글을 보여 준다.
- Produces: `<ImportDialog open onClose buildingId month />` (기존 `Drawer`를 쓴다)

- [ ] **Step 1: `ImportDialog` 구현** — 단계는 한 화면에서 위에서 아래로 이어진다.
  1. 파일 선택(끌어다 놓기 + 파일 고르기, `accept=".csv,.xlsx"`). 시트가 2개 이상이면 시트 선택.
  2. 열 맞추기: 항목(`FIELD_LABEL`)마다 열 선택 상자. 자동으로 맞춘 값이 먼저 들어가 있다. 건물 프로필에 같은 열 이름 서명이 있으면 그 대응을 쓴다. 아래에 처음 5줄 표.
  3. 계정 맞추기: `unmapped` 계정마다 관리비 항목 선택 상자와 '가져오지 않음'. 건수·금액 표시.
  4. 미리보기: 새로 들어갈 줄 수와 합계, 이미 있어서 건너뛸 줄, 합계 줄·0원 줄, 못 읽은 줄(줄 번호·이유, 20줄까지 보이고 나머지는 건수), 대상 월.
  5. `반영` 버튼.
  - 읽을 줄이 없으면 "읽을 줄이 없습니다. 열 이름이 있는 줄과 그 아래 내용이 있는지 확인해 주세요."
  - 필수 열이 없으면 `금액 열을 찾지 못했습니다. 위에서 열을 골라 주세요.`(계정도 같은 식)를 보이고 `반영`을 끈다.
  - 잠긴 월이 있으면 이유를 보이고 `반영`을 끈다.
  - `applyImport`가 `ok: false`면 `reason`을 빨간 글로 보인다. 성공하면 "n건을 가져왔습니다"를 보이고 닫는다.
  - 열 이름 서명 = 정규화한 열 이름을 `|`로 이은 글.
- [ ] **Step 2: `Accounting.tsx` 수정** — '지출 원장' 탭 위에 `파일로 가져오기` 버튼. 원장 표 아래에 `가져온 기록` 카드(파일명, 시각, 건수, 금액, 상태, `되돌리기` 버튼). 되돌리기 실패 이유는 그 줄에 보인다. 되돌린 묶음은 '되돌림'으로 표시하고 버튼을 없앤다. 화면 설명 글의 "전표·원장 시스템(ERP)을 대체하지 않고 그 데이터를 받아 검증합니다"는 "쓰던 엑셀이나 ERP에서 내보낸 파일을 그대로 올려 받을 수 있습니다"로 바꾼다.
- [ ] **Step 3: 검사** — `npm test`, `npm run typecheck`, `npm run build` 통과
- [ ] **Step 4: 브라우저 확인** (개발 서버 `pm-ai-dev`, 3950번)
  - `samples/import/small-building-expense.csv` 올리기 → 합계 줄 1, 못 읽은 줄 1, 계정 `회식비` 2건이 계정 맞추기에 나온다 → 항목을 골라 반영 → 원장에 7건, 가져온 기록 1줄.
  - 같은 파일 다시 올리기 → 계정 맞추기를 묻지 않고, 새로 들어갈 줄 0, 건너뛸 줄 7, `반영` 꺼짐.
  - 관리비 화면에서 정산을 다시 실행 → 가져온 금액이 안분에 들어간다.
  - 되돌리기 → 원장에서 7건이 사라진다. 콘솔 오류 없음.
- [ ] **Step 5: 커밋** — `feat: 회계 화면에 지출 파일 가져오기와 가져온 기록`

---

### Task 6: 엑셀(.xlsx) 읽기

**Files:**
- Create: `src/engine/importXlsx.ts`, `src/engine/importXlsx.test.ts`, `samples/import/small-building-expense.xlsx`
- Modify: `src/pages/accounting/ImportDialog.tsx`(`readGrid`), `package.json`

**Interfaces:**
- Produces: `export async function readXlsx(buf: ArrayBuffer): Promise<{ sheets: string[]; grid: (sheet?: string) => string[][] }>` — 칸 값은 모두 글자로 바꾼다. 날짜 칸은 `YYYY-MM-DD`, 숫자 칸은 쉼표 없는 숫자 글자.

- [ ] **Step 1: 라이브러리 고르기** — 조건: ① `npm audit`에 알려진 취약점 없음 ② npm에 올라온 판이 14일 이상 지남 ③ 읽기만 하면 됨 ④ 브라우저와 vitest(Node) 양쪽에서 동작. 후보는 `read-excel-file`(작음) → 조건에 안 맞으면 `exceljs`. npm에 올라온 `xlsx` 0.18.x는 알려진 취약점이 있어 쓰지 않는다. 고른 이름·판·이유를 설계 문서 9장에 한 줄로 적는다. 판은 정확한 숫자로 고정한다.
- [ ] **Step 2: 샘플 만들기** — `small-building-expense.csv`와 같은 내용의 `.xlsx`를 만든다(지급일은 날짜 칸, 지출액은 숫자 칸, 시트 2개: `10월`, `메모`).
- [ ] **Step 3: 실패하는 테스트 작성**

```ts
test('xlsx를 CSV와 같은 결과로 읽는다', async () => {
  const x = await readXlsx(readFileSync('samples/import/small-building-expense.xlsx').buffer);
  expect(x.sheets).toEqual(['10월', '메모']);
  const t = toTable(x.grid('10월'), isKnownHeader);
  const p = buildDrafts(t, autoMap(t.headers), { buildingId: 'A', fallbackMonth: '2026-10' });
  expect(p.drafts).toHaveLength(7);
  expect(p.drafts[0].date).toMatch(/^2026-10-\d\d$/);
});
```

- [ ] **Step 4: 구현** — 화면에서는 `await import('../../engine/importXlsx')`로 버튼을 누를 때만 불러온다.
- [ ] **Step 5: 확인** — `npm test`, typecheck, `npm run build`. 빌드 결과에서 첫 화면 묶음(`index-*.js`) 크기가 Task 5 때보다 20KB 넘게 늘지 않았는지 본다. 브라우저에서 `.xlsx`를 올려 Task 5의 첫 확인을 되풀이한다.
- [ ] **Step 6: 커밋** — `feat: 엑셀(.xlsx) 파일 가져오기`

---

### Task 7: 마무리 확인과 PR

- [ ] **Step 1:** `npm test`, `npm run typecheck`, `npm run build` 전체 통과를 다시 확인하고 결과 숫자를 적는다.
- [ ] **Step 2:** 브라우저에서 Review Focus 다섯 가지를 하나씩 해 본다(승인된 월, 필수 열 없는 파일, 글자 금액, 빈 파일, 20,001줄 파일). 기대와 다르면 고치고 그 경우의 테스트를 추가한다.
- [ ] **Step 3:** README 기능 표에 '지출 파일 가져오기(.xlsx, .csv)' 한 줄을 넣는다.
- [ ] **Step 4:** `feat/file-import`를 올리고 PR을 만든다. 본문에 완료 기준, 검증 결과, 알려진 한계(실제 건물 파일로 확인 못 함, 수납은 2단계)를 적는다. 병합은 지시를 받고 한다.
