import { Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge, Btn, Drawer, Field, inputCls, Note, td, tdNum, th } from '../../components/ui';
import { normHeader } from '../../engine/importMap';
import {
  autoMapRecv, buildRecvDrafts, buildRecvPreview, isKnownRecvHeader, missingRecvRequired, RECV_LABEL, type RecvColumnMap, type RecvField, settlementBilledMap,
} from '../../engine/importReceivables';
import { type Table, toTable } from '../../engine/importTable';
import { won } from '../../engine/money';
import { useStore } from '../../store/store';
import { type Grid, readGrid } from './ImportDialog';

const FIELDS = Object.keys(RECV_LABEL) as RecvField[];
const REQUIRED = new Set<RecvField>(['unit', 'billed']);
const signature = (headers: string[]) => `recv:${headers.map(normHeader).join('|')}`;
const SKIP = '__skip__';

/** 관리비 고지·수납 현황 파일 → 수납 기록. 같은 호실·월이 있으면 고쳐 쓰고 없으면 만든다. */
export default function RecvImportDialog({ open, onClose, buildingId, month }: { open: boolean; onClose: () => void; buildingId: string; month: string }) {
  const s = useStore();
  const [file, setFile] = useState<{ name: string; grid: Grid; batchId: string } | null>(null);
  const [sheet, setSheet] = useState('');
  const [colMap, setColMap] = useState<RecvColumnMap | null>(null);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const profile = s.importProfiles[buildingId] ?? { columns: {}, accounts: {} };
  const savedUnits = profile.units ?? {};

  const table: Table | null = useMemo(() => (file ? toTable(file.grid.grid(sheet || undefined), isKnownRecvHeader) : null), [file, sheet]);
  const saved = table ? profile.columns[signature(table.headers)] : undefined;

  const pickMap = (t: Table) => {
    const sv = profile.columns[signature(t.headers)];
    if (!sv) return autoMapRecv(t.headers);
    const m = {} as RecvColumnMap;
    for (const f of FIELDS) { const i = sv[f] ? t.headers.indexOf(sv[f]!) : -1; m[f] = i >= 0 ? i : null; }
    return m;
  };

  const onFile = async (f: File | undefined) => {
    setError(''); setDone(''); setChoice({});
    if (!f) return;
    try {
      const grid = await readGrid(f);
      setFile({ name: f.name, grid, batchId: `IMR-${Date.now().toString(36)}` });
      setSheet(grid.sheets[0]);
      setColMap(pickMap(toTable(grid.grid(grid.sheets[0]), isKnownRecvHeader)));
    } catch (e) {
      setFile(null); setColMap(null);
      setError(e instanceof Error ? e.message : '파일을 읽지 못했습니다.');
    }
  };

  const units = useMemo(() => s.units.filter((u) => u.buildingId === buildingId), [s.units, buildingId]);
  const billedMap = useMemo(() => settlementBilledMap(s.settlements, buildingId), [s.settlements, buildingId]);
  const parsed = table && colMap ? buildRecvDrafts(table, colMap, { fallbackMonth: month }) : null;
  const base = { buildingId, units, existing: s.receivables, settlementBilled: billedMap };
  const askUnits = parsed ? buildRecvPreview(parsed, { ...base, savedUnits }).unmapped : [];
  const chosen = Object.fromEntries(Object.entries(choice).filter(([, v]) => v && v !== SKIP));
  const preview = parsed ? buildRecvPreview(parsed, { ...base, savedUnits: { ...savedUnits, ...chosen } }) : null;
  const missing = colMap ? missingRecvRequired(colMap) : [];
  const empty = !!table && table.rows.length === 0;
  const canApply = !!preview && preview.upserts.length > 0 && missing.length === 0;
  const unitName = (id: string) => units.find((u) => u.id === id)?.name ?? id;

  const apply = () => {
    if (!preview || !table || !colMap || !file) return;
    const cols: Partial<Record<string, string>> = {};
    for (const f of FIELDS) if (colMap[f] !== null) cols[f] = table.headers[colMap[f]!];
    const r = s.applyRecvImport({ buildingId, fileName: file.name, batchId: file.batchId, upserts: preview.upserts, profile: { columns: { [signature(table.headers)]: cols }, accounts: {}, units: chosen } });
    if (!r.ok) { setError(r.reason); return; }
    setDone(`수납 기록 ${preview.upserts.length}건을 반영했습니다(새로 ${preview.created} · 고침 ${preview.updated}).`);
    setFile(null); setColMap(null); setChoice({});
  };

  const close = () => { setFile(null); setColMap(null); setChoice({}); setError(''); setDone(''); onClose(); };

  return (
    <Drawer open={open} onClose={close} title="수납 파일 가져오기">
      <div className="space-y-5 text-sm">
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 p-6 text-center text-slate-600 hover:border-brand-500"
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files[0]); }}>
          <Upload size={20} />
          <span>{file ? file.name : '관리비 고지·수납 현황 엑셀(.xlsx)이나 CSV를 끌어다 놓거나 눌러서 고르세요'}</span>
          <input aria-label="가져올 수납 파일" type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        <Note>호실마다 한 줄씩 고지액·수납액이 있는 표를 받습니다. 같은 호실·월의 기록이 이미 있으면 파일 값으로 고쳐 씁니다. 파일은 이 브라우저 안에서만 읽습니다.</Note>
        {done && <p className="rounded-lg bg-green-50 px-3 py-2 text-green-700">{done}</p>}
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}

        {file && table && colMap && (
          <>
            {file.grid.sheets.length > 1 && (
              <Field label="시트"><select className={inputCls} value={sheet} onChange={(e) => { setSheet(e.target.value); setColMap(pickMap(toTable(file.grid.grid(e.target.value), isKnownRecvHeader))); setChoice({}); }}>
                {file.grid.sheets.map((x) => <option key={x}>{x}</option>)}</select></Field>
            )}

            {empty ? <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">읽을 줄이 없습니다. 열 이름이 있는 줄과 그 아래 내용이 있는지 확인해 주세요.</p> : (
              <>
                <details open={!saved || missing.length > 0} className="rounded-lg border border-slate-200 p-3">
                  <summary className="cursor-pointer font-semibold text-ink">1. 열 맞추기 {saved && <Badge tone="green">저장해 둔 대응 사용</Badge>}</summary>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {FIELDS.map((f) => (
                      <Field key={f} label={`${RECV_LABEL[f]}${REQUIRED.has(f) ? ' *' : ''}`}>
                        <select className={inputCls} value={colMap[f] ?? ''} onChange={(e) => setColMap({ ...colMap, [f]: e.target.value === '' ? null : Number(e.target.value) })}>
                          <option value="">— 없음 —</option>
                          {table.headers.map((h, i) => <option key={i} value={i}>{h || `(${i + 1}번째 열)`}</option>)}
                        </select>
                      </Field>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-slate-500">납기일 열이 없으면 다음 달 25일로 봅니다. 수납액 열이 없거나 칸이 비어 있으면 이미 있는 수납액을 그대로 둡니다(새 기록은 0원).</p>
                  <div className="mt-3 overflow-x-auto">
                    <table className="min-w-full text-xs"><thead><tr>{table.headers.map((h, i) => <th key={i} className={th}>{h}</th>)}</tr></thead>
                      <tbody>{table.rows.slice(0, 5).map((r, i) => <tr key={i}>{table.headers.map((_, k) => <td key={k} className={td}>{r[k]}</td>)}</tr>)}</tbody></table>
                  </div>
                </details>
                {colMap.month === null && missing.length === 0 && (
                  <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">부과월 열이 없어 모든 줄을 <b>{month}</b> 고지분으로 넣습니다. 다른 월이면 화면 위의 월을 바꾸거나 부과월 열을 골라 주세요.</p>
                )}
                {missing.map((f) => <p key={f} role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{RECV_LABEL[f]} 열을 찾지 못했습니다. 위에서 열을 골라 주세요.</p>)}

                {askUnits.length > 0 && (
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="mb-2 font-semibold text-ink">2. 호실 맞추기</p>
                    <p className="mb-2 text-xs text-slate-500">이 건물의 호실 목록에서 찾지 못한 이름입니다. 고른 대응은 이 건물에 저장해 두고 다음부터 묻지 않습니다.</p>
                    <div className="space-y-2">
                      {askUnits.map((u) => (
                        <div key={u.unit} className="flex items-center gap-2">
                          <span className="min-w-0 flex-1"><b>{u.unit}</b> <span className="text-xs text-slate-500">{u.count}건 · 고지 {won(u.billed)}</span></span>
                          <select aria-label={`${u.unit} 호실`} className={`${inputCls} w-40`} value={choice[u.unit] ?? ''} onChange={(e) => setChoice({ ...choice, [u.unit]: e.target.value })}>
                            <option value="">호실 고르기</option>
                            {units.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
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
                      <tr><td className={td}>반영할 기록</td><td className={tdNum}><b>{preview.upserts.length}건</b> (새로 {preview.created} · 고침 {preview.updated})</td></tr>
                      <tr><td className={td}>반영분 고지액 / 수납액</td><td className={tdNum}>{won(preview.totalBilled)} / {won(preview.totalPaid)}</td></tr>
                      <tr><td className={td}>파일 전체 고지액 / 수납액</td><td className={tdNum}>{won(preview.fileBilled)} / {won(preview.filePaid)}</td></tr>
                      <tr><td className={td}>대상 월</td><td className={tdNum}>{preview.months.join(', ') || '—'}</td></tr>
                      <tr><td className={td}>이미 같아서 건너뜀</td><td className={tdNum}>{preview.unchanged}건</td></tr>
                      <tr><td className={td}>합계 줄</td><td className={tdNum}>{preview.skippedSummary}건</td></tr>
                      <tr><td className={td}>호실 미정으로 제외</td><td className={tdNum}>{preview.unmapped.reduce((a, u) => a + u.count, 0)}건</td></tr>
                      <tr><td className={td}>고지액보다 많이 낸 기록</td><td className={tdNum}>{preview.overpaid}건</td></tr>
                      <tr><td className={td}>못 읽은 줄</td><td className={tdNum}>{preview.errors.length}건</td></tr>
                    </tbody></table>
                    {preview.errors.length > 0 && (
                      <ul className="mt-2 space-y-1 text-xs text-red-700">
                        {preview.errors.slice(0, 20).map((e) => <li key={`${e.row}-${e.reason}`}>{e.row}번째 줄: {e.reason}</li>)}
                        {preview.errors.length > 20 && <li>외 {preview.errors.length - 20}건</li>}
                      </ul>
                    )}
                    {preview.paidDecreased.length > 0 && (
                      <div className="mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-800">
                        <p className="font-semibold">수납액이 줄어드는 기록 {preview.paidDecreased.length}건</p>
                        <ul className="mt-1 space-y-0.5">
                          {preview.paidDecreased.slice(0, 10).map((m) => <li key={`${m.unitId}-${m.month}`}>{unitName(m.unitId)} {m.month}: 지금 {won(m.pmai)} → 파일 {won(m.file)}</li>)}
                        </ul>
                        <p className="mt-1">이미 받은 돈이 파일에서 줄어 있습니다. 환불·취소가 아니라면 파일을 확인하세요.</p>
                      </div>
                    )}
                    {preview.billedMismatch.length > 0 && (
                      <div className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
                        <p className="font-semibold">PMAI 기록과 고지액이 다른 호실 {preview.billedMismatch.length}곳</p>
                        <ul className="mt-1 space-y-0.5">
                          {preview.billedMismatch.slice(0, 10).map((m) => <li key={`${m.unitId}-${m.month}`}>{unitName(m.unitId)} {m.month}: 파일 {won(m.file)} · PMAI {won(m.pmai)} (차이 {won(m.file - m.pmai)})</li>)}
                        </ul>
                        <p className="mt-1">반영은 파일 값으로 합니다. 차이가 있으면 고지서와 안분 기준을 확인하세요.</p>
                      </div>
                    )}
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
