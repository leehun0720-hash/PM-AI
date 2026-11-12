import { AlertTriangle, CheckCircle2, Play, Printer, Send } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge, Btn, Card, Drawer, Empty, inputCls, Note, Page, Stat, StatusBadge, Table, Tabs, td, tdNum, th } from '../components/ui';
import type { ChargeLine, Settlement } from '../domain/types';
import { reconcile } from '../engine/allocation';
import { monthRange, won } from '../engine/money';
import { useBuilding, useStore } from '../store/store';

const BY = { exclusiveArea: '전용면적', contractArea: '계약면적', usage: '검침 사용량', equal: '균등' } as const;
type Tab = 'units' | 'items' | 'anomalies' | 'bill';

export default function Charges() {
  const b = useBuilding();
  const s = useStore();
  const role = s.settings.role;
  const [month, setMonth] = useState(s.seedMonth);
  const [tab, setTab] = useState<Tab>('units');
  const [unitId, setUnitId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const st: Settlement | undefined = s.settlements.find((x) => x.buildingId === b.id && x.month === month);
  const units = s.units.filter((u) => u.buildingId === b.id);
  const itemName = (id: string) => (id === 'FIXED' ? '정액 관리비' : s.items.find((i) => i.id === id)?.name ?? id);

  // 열람 포털: 임차인·소유자는 본인 것만 본다(시연에서는 첫 번째 임차인/소유자로 가정)
  const myTenant = s.leases.find((l) => l.buildingId === b.id && l.status === 'active')?.tenant;
  const myOwner = s.owners.find((o) => o.buildingId === b.id)?.name;
  const visible = (l: ChargeLine) => (role === 'tenant' ? l.payer === 'tenant' && l.payerName === myTenant : role === 'owner' ? l.payer === 'owner' && l.payerName === myOwner : true);
  const staff = role !== 'tenant' && role !== 'owner';

  const view = useMemo(() => {
    if (!st) return null;
    const lines = st.lines.filter(visible);
    const sum = (f: (l: ChargeLine) => boolean) => lines.filter(f).reduce((a, l) => a + l.amount, 0);
    const diff = reconcile(st.lines, s.expenses.filter((e) => e.buildingId === b.id && e.month === month));
    return { lines, tenant: sum((l) => l.payer === 'tenant'), owner: sum((l) => l.payer === 'owner'), vat: lines.reduce((a, l) => a + l.vat, 0), maxDiff: Math.max(0, ...Object.values(diff).map(Math.abs)) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st, role, s.expenses]);

  const open = st?.anomalies.filter((a) => !a.resolved).length ?? 0;
  const unitLines = (id: string) => view?.lines.filter((l) => l.unitId === id) ?? [];
  const billUnit = unitId ?? units.find((u) => unitLines(u.id).some((l) => l.payer === 'tenant'))?.id ?? null;

  return (
    <Page
      title="관리비 정산·공개"
      desc={staff ? '규칙 엔진이 안분하고, 모든 금액에 계산 근거를 남깁니다. 고지 확정은 사람 승인(L2)을 거칩니다.' : `열람 포털 — ${role === 'tenant' ? myTenant : myOwner} 님의 부담 내역만 표시합니다.`}
      actions={
        <>
          <select aria-label="정산 월" className={`${inputCls} !w-auto`} value={month} onChange={(e) => { setMonth(e.target.value); setMsg(null); }}>
            {monthRange(s.seedMonth, 12).reverse().map((m) => <option key={m}>{m}</option>)}
          </select>
          {staff && <Btn onClick={() => { s.runSettlement(b.id, month); setMsg(null); }}><Play size={14} />{st ? '재실행' : '정산 실행'}</Btn>}
          {staff && st && st.status === 'draft' && <Btn variant="primary" onClick={() => setMsg(s.submitSettlement(st.id) ?? '승인 요청을 보냈습니다. 승인함에서 PM사·운용사 역할로 승인하세요.')}><Send size={14} />고지 확정 승인 요청</Btn>}
        </>
      }
    >
      {msg && <div className={`rounded-lg border px-4 py-2.5 text-sm ${msg.includes('차단') ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{msg}</div>}

      {!st || !view ? (
        <Card><Empty>{staff ? `${month} 정산이 아직 없습니다. ‘정산 실행’을 누르면 지출 원장·검침·임대차 조건으로 안분합니다.` : '확정된 정산이 없습니다.'}</Empty></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Stat label="상태" value={<StatusBadge status={st.status} />} sub={`규칙 ${st.ruleVersion}`} />
            {staff && <Stat label="지출 합계" value={won(st.poolTotal)} sub={`입력 해시 ${st.inputHash}`} />}
            <Stat label="임차인 부담(공급가)" value={won(view.tenant)} sub={`부가세 ${won(view.vat)} · 정액 관리비 포함`} />
            <Stat label="소유자 부담" value={won(view.owner)} sub="공실·특약·충당금 등" />
            {staff && <Stat label="대사 차이" value={won(view.maxDiff)} tone={view.maxDiff === 0 ? 'good' : 'bad'} sub="지출 합계 − 안분 합계" />}
            {staff && <Stat label="미해소 이상치" value={`${open}건`} tone={open ? 'bad' : 'good'} sub={open ? '해소 전 발송 차단' : '발송 가능'} />}
          </div>

          <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ id: 'units', label: '호실별 결과' }, { id: 'items', label: '항목별 공개 내역' }, ...(staff ? [{ id: 'anomalies' as Tab, label: `이상치 (${st.anomalies.length})` }] : []), { id: 'bill', label: '고지서·산출근거서' }]} />

          {tab === 'units' && (
            <Card title="호실별 부담액" right={<span className="text-xs text-slate-500">행을 누르면 계산 근거가 열립니다</span>}>
              <Table head={<tr><th className={th}>호실</th><th className={th}>임차인</th><th className={`${th} text-right`}>임차인 부담</th><th className={`${th} text-right`}>부가세</th><th className={`${th} text-right`}>고지 합계</th><th className={`${th} text-right`}>소유자 부담</th></tr>}>
                {units.filter((u) => unitLines(u.id).length).map((u) => {
                  const ls = unitLines(u.id);
                  const t = ls.filter((l) => l.payer === 'tenant');
                  const amt = t.reduce((a, l) => a + l.amount, 0);
                  const vat = t.reduce((a, l) => a + l.vat, 0);
                  return (
                    <tr key={u.id} className="cursor-pointer hover:bg-brand-50" onClick={() => setUnitId(u.id)}>
                      <td className={td}>{u.floor} {u.name}</td>
                      <td className={td}>{t[0]?.payerName ?? <Badge tone="amber">공실</Badge>}</td>
                      <td className={tdNum}>{won(amt)}</td><td className={tdNum}>{won(vat)}</td>
                      <td className={`${tdNum} font-semibold`}>{won(amt + vat)}</td>
                      <td className={tdNum}>{won(ls.filter((l) => l.payer === 'owner').reduce((a, l) => a + l.amount, 0))}</td>
                    </tr>
                  );
                })}
              </Table>
            </Card>
          )}

          {tab === 'items' && (
            <Card title="항목별 산정 기준·부과 내역" right={<Btn onClick={() => window.print()}><Printer size={14} />게시용 인쇄</Btn>}>
              <Table head={<tr><th className={th}>항목</th><th className={th}>산정 기준</th><th className={`${th} text-right`}>지출액</th><th className={`${th} text-right`}>임차인 부과</th><th className={`${th} text-right`}>소유자 부담</th><th className={`${th} text-right`}>증빙</th></tr>}>
                {s.items.filter((i) => view.lines.some((l) => l.itemId === i.id)).map((i) => {
                  const ls = view.lines.filter((l) => l.itemId === i.id);
                  const ex = s.expenses.filter((e) => e.buildingId === b.id && e.month === month && e.itemId === i.id);
                  return (
                    <tr key={i.id}>
                      <td className={td}>{i.name}</td>
                      <td className={td}>{i.components.map((c) => `${BY[c.by]}${i.components.length > 1 ? ` ${c.ratio * 100}%` : ''}`).join(' + ')}{i.ownerOnly && ' · 소유자 부담'}</td>
                      <td className={tdNum}>{staff ? won(ex.reduce((a, e) => a + e.amount, 0)) : '—'}</td>
                      <td className={tdNum}>{won(ls.filter((l) => l.payer === 'tenant').reduce((a, l) => a + l.amount, 0))}</td>
                      <td className={tdNum}>{won(ls.filter((l) => l.payer === 'owner').reduce((a, l) => a + l.amount, 0))}</td>
                      <td className={tdNum}>{ex.length}건</td>
                    </tr>
                  );
                })}
              </Table>
              <div className="mt-3"><Note>공개 양식은 항목별 산정 기준·부과 내역·지출 내역·증빙 목록 구조를 따릅니다. 법정 서식 적합 여부는 법무 검토 후 확정해야 합니다.</Note></div>
            </Card>
          )}

          {tab === 'anomalies' && staff && (
            <Card title="이상치 — 해소해야 승인 요청이 가능합니다">
              {st.anomalies.length === 0 ? <Empty>탐지된 이상치가 없습니다.</Empty> : (
                <ul className="space-y-3">
                  {st.anomalies.map((a) => (
                    <li key={a.id} className={`rounded-lg border p-3 ${a.resolved ? 'border-slate-200 bg-slate-50' : 'border-amber-200 bg-amber-50/60'}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        {a.resolved ? <CheckCircle2 size={16} className="text-emerald-600" /> : <AlertTriangle size={16} className="text-amber-600" />}
                        <span className="text-sm font-semibold">{a.title}</span>
                        <Badge tone={a.severity === 'high' ? 'red' : 'amber'}>{a.severity === 'high' ? '높음' : '보통'}</Badge>
                        <span className="num ml-auto text-sm text-slate-600">{won(a.amount)}</span>
                      </div>
                      <p className="mt-1.5 text-sm text-slate-600">{a.why}</p>
                      {a.expenseIds.length > 0 && <p className="mt-1 text-xs text-slate-500">근거 원장: {a.expenseIds.join(', ')}</p>}
                      {a.resolved ? <p className="mt-2 text-xs text-slate-600">해소: {a.resolution} — {a.resolvedBy}</p> : st.status === 'draft' && (
                        <div className="mt-2 flex gap-2">
                          <input className={inputCls} placeholder="확인 결과 (예: 거래처 확인 — 중복분 취소 요청)" value={notes[a.id] ?? ''} onChange={(e) => setNotes({ ...notes, [a.id]: e.target.value })} />
                          <Btn disabled={!notes[a.id]?.trim()} onClick={() => s.resolveAnomaly(st.id, a.id, notes[a.id].trim())}>해소</Btn>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {tab === 'bill' && (
            <Card title="고지서·산출근거서" right={<div className="flex gap-2"><select aria-label="호실" className={`${inputCls} !w-auto`} value={billUnit ?? ''} onChange={(e) => setUnitId(e.target.value)}>{units.filter((u) => unitLines(u.id).some((l) => l.payer === 'tenant')).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select><Btn onClick={() => window.print()}><Printer size={14} />인쇄·PDF</Btn></div>}>
              {billUnit ? <Bill st={st} lines={unitLines(billUnit).filter((l) => l.payer === 'tenant')} unitName={units.find((u) => u.id === billUnit)!.name} building={b.name} itemName={itemName} /> : <Empty>고지 대상이 없습니다.</Empty>}
            </Card>
          )}
        </>
      )}

      <Drawer open={!!unitId && tab === 'units'} onClose={() => setUnitId(null)} title={`계산 근거 — ${units.find((u) => u.id === unitId)?.name ?? ''}`}>
        <div className="space-y-4">
          {unitId && unitLines(unitId).map((l, i) => (
            <div key={i} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{itemName(l.itemId)}</span>
                <Badge tone={l.payer === 'tenant' ? 'blue' : 'gray'}>{l.payer === 'tenant' ? '임차인' : '소유자'} · {l.payerName}</Badge>
              </div>
              <p className="num mt-1 text-lg font-bold">{won(l.amount)}{l.vat > 0 && <span className="ml-2 text-xs font-normal text-slate-500">+ 부가세 {won(l.vat)}</span>}</p>
              <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-xs leading-relaxed text-slate-600">{l.trace.map((t, k) => <li key={k}>{t}</li>)}</ol>
              {l.sourceExpenseIds.length > 0 && <p className="mt-2 break-all text-[11px] text-slate-400">원장: {l.sourceExpenseIds.join(', ')}</p>}
            </div>
          ))}
        </div>
      </Drawer>
    </Page>
  );
}

function Bill({ st, lines, unitName, building, itemName }: { st: Settlement; lines: ChargeLine[]; unitName: string; building: string; itemName: (id: string) => string }) {
  const amt = lines.reduce((a, l) => a + l.amount, 0);
  const vat = lines.reduce((a, l) => a + l.vat, 0);
  return (
    <div className="mx-auto max-w-3xl">
      {st.status !== 'approved' && <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">승인 전 초안입니다. 승인 완료 후 발송할 수 있습니다.</p>}
      <h3 className="text-lg font-bold">{st.month} 관리비 고지서</h3>
      <p className="mt-1 text-sm text-slate-600">{building} {unitName} · {lines[0]?.payerName} 귀하</p>
      <table className="mt-4 w-full text-sm">
        <thead><tr className="border-y border-slate-300 bg-slate-50"><th className={th}>항목</th><th className={`${th} text-right`}>공급가액</th><th className={`${th} text-right`}>부가세</th><th className={th}>산출 근거</th></tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="border-b border-slate-100 align-top">
              <td className={td}>{itemName(l.itemId)}</td><td className={tdNum}>{won(l.amount)}</td><td className={tdNum}>{won(l.vat)}</td>
              <td className="px-3 py-2 text-xs leading-relaxed text-slate-500">{l.trace.slice(0, -2).join(' → ') || l.trace[0]}</td>
            </tr>
          ))}
          <tr className="border-y border-slate-300 font-semibold"><td className={td}>합계</td><td className={tdNum}>{won(amt)}</td><td className={tdNum}>{won(vat)}</td><td className={`${td} num`}>납부하실 금액 {won(amt + vat)}</td></tr>
        </tbody>
      </table>
      <p className="mt-3 text-xs text-slate-500">규칙 버전 {st.ruleVersion} · 입력 스냅샷 {st.inputHash} · 같은 입력으로 다시 계산하면 같은 결과가 나옵니다.</p>
    </div>
  );
}
