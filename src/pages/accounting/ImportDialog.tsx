import { Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge, Btn, Drawer, Field, inputCls, Note, td, tdNum, th } from '../../components/ui';
import { buildDrafts, buildPreview, missingRequired } from '../../engine/importLedger';
import { autoMap, type ColumnMap, type ExpenseField, FIELD_LABEL, isKnownHeader, normHeader } from '../../engine/importMap';
import { decodeText, parseCsv, type Table, toTable } from '../../engine/importTable';
import { won } from '../../engine/money';
import { useStore } from '../../store/store';

export interface Grid { sheets: string[]; grid: (sheet?: string) => string[][] }

/** 파일 → 시트별 줄×칸. 파일은 브라우저 안에서만 읽는다. */
export async function readGrid(file: File): Promise<Grid> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xls')) throw new Error('옛 엑셀 형식(.xls)은 읽지 못합니다. 엑셀에서 .xlsx로 다시 저장해 주세요.');
  const buf = await file.arrayBuffer();
  if (name.endsWith('.xlsx')) {
    const { readXlsx } = await import('../../engine/importXlsx');
    return readXlsx(buf);
  }
  if (!name.endsWith('.csv')) throw new Error('.xlsx 또는 .csv 파일만 받을 수 있습니다.');
  const g = parseCsv(decodeText(buf));
  return { sheets: ['CSV'], grid: () => g };
}

const FIELDS = Object.keys(FIELD_LABEL) as ExpenseField[];
const signature = (headers: string[]) => headers.map(normHeader).join('|');
const SKIP = '__skip__';

export default function ImportDialog({ open, onClose, buildingId, month }: { open: boolean; onClose: () => void; buildingId: string; month: string }) {
  const s = useStore();
  const [file, setFile] = useState<{ name: string; grid: Grid; batchId: string } | null>(null);
  const [sheet, setSheet] = useState('');
  const [colMap, setColMap] = useState<ColumnMap | null>(null);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const profile = s.importProfiles[buildingId] ?? { columns: {}, accounts: {} };

  const table: Table | null = useMemo(() => (file ? toTable(file.grid.grid(sheet || undefined), isKnownHeader) : null), [file, sheet]);
  const saved = table ? profile.columns[signature(table.headers)] : undefined;

  const pickTable = (t: Table) => {
    const sv = profile.columns[signature(t.headers)];
    if (!sv) return autoMap(t.headers);
    const m = {} as ColumnMap;
    for (const f of FIELDS) { const i = sv[f] ? t.headers.indexOf(sv[f]!) : -1; m[f] = i >= 0 ? i : null; }
    return m;
  };

  const onFile = async (f: File | undefined) => {
    setError(''); setDone(''); setChoice({});
    if (!f) return;
    try {
      const grid = await readGrid(f);
      setFile({ name: f.name, grid, batchId: `IMP-${Date.now().toString(36)}` });
      setSheet(grid.sheets[0]);
      setColMap(pickTable(toTable(grid.grid(grid.sheets[0]), isKnownHeader)));
    } catch (e) {
      setFile(null); setColMap(null);
      setError(e instanceof Error ? e.message : '파일을 읽지 못했습니다.');
    }
  };

  const existing = useMemo(() => new Set(s.expenses.filter((e) => e.buildingId === buildingId && e.fingerprint).map((e) => e.fingerprint!)), [s.expenses, buildingId]);
  const parsed = table && colMap ? buildDrafts(table, colMap, { buildingId, fallbackMonth: month }) : null;
  const base = { buildingId, items: s.items, existing, batchId: file?.batchId ?? '' };
  const askAccounts = parsed ? buildPreview(parsed, { ...base, savedAccounts: profile.accounts }).unmapped : [];
  const chosen = Object.fromEntries(Object.entries(choice).filter(([, v]) => v && v !== SKIP));
  const preview = parsed ? buildPreview(parsed, { ...base, savedAccounts: { ...profile.accounts, ...chosen } }) : null;
  const missing = colMap ? missingRequired(colMap) : [];
  const locked = preview ? s.lockedMonths(buildingId, preview.months) : [];
  const empty = !!table && table.rows.length === 0;
  const canApply = !!preview && preview.fresh.length > 0 && missing.length === 0 && locked.length === 0;

  const apply = () => {
    if (!preview || !table || !colMap || !file) return;
    const cols: Partial<Record<string, string>> = {};
    for (const f of FIELDS) if (colMap[f] !== null) cols[f] = table.headers[colMap[f]!];
    const r = s.applyImport({ buildingId, fileName: file.name, batchId: file.batchId, fresh: preview.fresh, profile: { columns: { [signature(table.headers)]: cols }, accounts: chosen } });
    if (!r.ok) { setError(r.reason); return; }
    setDone(`${preview.fresh.length}건을 가져왔습니다.`);
    setFile(null); setColMap(null); setChoice({});
  };

  const close = () => { setFile(null); setColMap(null); setChoice({}); setError(''); setDone(''); onClose(); };

  return (
    <Drawer open={open} onClose={close} title="지출 파일 가져오기">
      <div className="space-y-5 text-sm">
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 p-6 text-center text-slate-600 hover:border-brand-500"
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files[0]); }}>
          <Upload size={20} />
          <span>{file ? file.name : '엑셀(.xlsx)이나 CSV 파일을 끌어다 놓거나 눌러서 고르세요'}</span>
          <input aria-label="가져올 파일" type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        <Note>파일은 이 브라우저 안에서만 읽습니다. 서버나 AI로 보내지 않습니다.</Note>
        {done && <p className="rounded-lg bg-green-50 px-3 py-2 text-green-700">{done}</p>}
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}

        {file && table && colMap && (
          <>
            {file.grid.sheets.length > 1 && (
              <Field label="시트"><select className={inputCls} value={sheet} onChange={(e) => { setSheet(e.target.value); setColMap(pickTable(toTable(file.grid.grid(e.target.value), isKnownHeader))); setChoice({}); }}>
                {file.grid.sheets.map((x) => <option key={x}>{x}</option>)}</select></Field>
            )}

            {empty ? <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">읽을 줄이 없습니다. 열 이름이 있는 줄과 그 아래 내용이 있는지 확인해 주세요.</p> : (
              <>
                <details open={!saved || missing.length > 0} className="rounded-lg border border-slate-200 p-3">
                  <summary className="cursor-pointer font-semibold text-ink">1. 열 맞추기 {saved && <Badge tone="green">저장해 둔 대응 사용</Badge>}</summary>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {FIELDS.map((f) => (
                      <Field key={f} label={`${FIELD_LABEL[f]}${f === 'amount' || f === 'account' ? ' *' : ''}`}>
                        <select className={inputCls} value={colMap[f] ?? ''} onChange={(e) => setColMap({ ...colMap, [f]: e.target.value === '' ? null : Number(e.target.value) })}>
                          <option value="">— 없음 —</option>
                          {table.headers.map((h, i) => <option key={i} value={i}>{h || `(${i + 1}번째 열)`}</option>)}
                        </select>
                      </Field>
                    ))}
                  </div>
                  <div className="mt-3 overflow-x-auto">
                    <table className="min-w-full text-xs"><thead><tr>{table.headers.map((h, i) => <th key={i} className={th}>{h}</th>)}</tr></thead>
                      <tbody>{table.rows.slice(0, 5).map((r, i) => <tr key={i}>{table.headers.map((_, k) => <td key={k} className={td}>{r[k]}</td>)}</tr>)}</tbody></table>
                  </div>
                </details>
                {missing.map((f) => <p key={f} role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{FIELD_LABEL[f]} 열을 찾지 못했습니다. 위에서 열을 골라 주세요.</p>)}

                {askAccounts.length > 0 && (
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="mb-2 font-semibold text-ink">2. 계정 맞추기</p>
                    <p className="mb-2 text-xs text-slate-500">관리비 항목을 정하지 못한 계정입니다. 고른 대응은 이 건물에 저장해 두고 다음부터 묻지 않습니다.</p>
                    <div className="space-y-2">
                      {askAccounts.map((u) => (
                        <div key={u.account} className="flex items-center gap-2">
                          <span className="min-w-0 flex-1"><b>{u.account}</b> <span className="text-xs text-slate-500">{u.count}건 · {won(u.amount)}</span></span>
                          <select aria-label={`${u.account} 관리비 항목`} className={`${inputCls} w-44`} value={choice[u.account] ?? ''} onChange={(e) => setChoice({ ...choice, [u.account]: e.target.value })}>
                            <option value="">항목 고르기</option>
                            {s.items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                            <option value={SKIP}>가져오지 않음</option>
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {preview && missing.length === 0 && (
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="mb-2 font-semibold text-ink">3. 미리보기</p>
                    <table className="w-full"><tbody>
                      <tr><td className={td}>새로 들어갈 줄</td><td className={tdNum}><b>{preview.fresh.length}건</b> · {won(preview.total)}</td></tr>
                      <tr><td className={td}>대상 월</td><td className={tdNum}>{preview.months.join(', ') || '—'}</td></tr>
                      <tr><td className={td}>이미 있어서 건너뜀</td><td className={tdNum}>{preview.duplicates}건</td></tr>
                      <tr><td className={td}>합계·소계 줄 / 0원 줄</td><td className={tdNum}>{preview.skippedSummary}건 / {preview.skippedZero}건</td></tr>
                      <tr><td className={td}>항목 미정으로 제외</td><td className={tdNum}>{preview.unmapped.reduce((a, u) => a + u.count, 0)}건</td></tr>
                      <tr><td className={td}>못 읽은 줄</td><td className={tdNum}>{preview.errors.length}건</td></tr>
                    </tbody></table>
                    {preview.errors.length > 0 && (
                      <ul className="mt-2 space-y-1 text-xs text-red-700">
                        {preview.errors.slice(0, 20).map((e) => <li key={`${e.row}-${e.reason}`}>{e.row > 0 ? `${e.row}번째 줄: ` : ''}{e.reason}</li>)}
                        {preview.errors.length > 20 && <li>외 {preview.errors.length - 20}건</li>}
                      </ul>
                    )}
                    {locked.length > 0 && <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-red-700">승인된 정산이 있는 월({locked.join(', ')})은 가져올 수 없습니다.</p>}
                  </div>
                )}

                <Btn variant="primary" className="w-full" disabled={!canApply} onClick={apply}>반영</Btn>
              </>
            )}
          </>
        )}
      </div>
    </Drawer>
  );
}
