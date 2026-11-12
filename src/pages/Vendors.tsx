import { AlertTriangle, CheckCircle2, Send } from 'lucide-react';
import { useState } from 'react';
import { Badge, Btn, Card, Drawer, Note, Page, Stat, StatusBadge, Table, Tabs, td, tdNum, th } from '../components/ui';
import type { Invoice } from '../domain/types';
import { daysBetween, monthRange, pct, won } from '../engine/money';
import { matchInvoice, scoreVendor } from '../engine/threeWay';
import { today, useBuilding, useStore } from '../store/store';

type Tab = 'invoices' | 'contracts' | 'score';

export default function Vendors() {
  const b = useBuilding();
  const s = useStore();
  const [tab, setTab] = useState<Tab>('invoices');
  const [month, setMonth] = useState(s.seedMonth);
  const [sel, setSel] = useState<Invoice | null>(null);
  const contracts = s.contracts.filter((c) => c.buildingId === b.id);
  const check = (inv: Invoice) => {
    const c = contracts.find((x) => x.id === inv.contractId)!;
    return matchInvoice(inv, c, s.workRecords.find((w) => w.contractId === c.id && w.month === inv.month), s.invoices);
  };
  const all = s.invoices.filter((i) => contracts.some((c) => c.id === i.contractId));
  const invs = all.filter((i) => i.month === month);
  const results = invs.map((i) => ({ inv: i, r: check(i) }));
  const billed = results.reduce((a, x) => a + x.r.billed, 0);
  const recoverable = results.reduce((a, x) => a + x.r.recoverable, 0);
  const selR = sel ? check(sel) : null;
  const selC = sel ? contracts.find((c) => c.id === sel.contractId)! : null;
  const selW = sel ? s.workRecords.find((w) => w.contractId === sel.contractId && w.month === sel.month) : undefined;

  return (
    <Page title="외주계약·인보이스 검증" desc="계약 ↔ 작업 실적 ↔ 인보이스를 3-way로 맞춰 과청구를 찾습니다. 실제 지급은 ERP·은행에서 사람이 합니다."
      actions={<select aria-label="청구 월" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm" value={month} onChange={(e) => setMonth(e.target.value)}>{monthRange(s.seedMonth, 6).reverse().map((m) => <option key={m}>{m}</option>)}</select>}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={`${month} 청구 합계`} value={won(billed)} sub={`인보이스 ${invs.length}건`} />
        <Stat label="지급 적정액" value={won(billed - recoverable)} />
        <Stat label="과청구 의심" value={won(recoverable)} tone={recoverable ? 'bad' : 'good'} sub={billed ? `청구액의 ${pct(recoverable / billed)}` : ''} />
        <Stat label="지적 인보이스" value={`${results.filter((x) => x.r.findings.length).length}건`} sub="행을 눌러 사유 확인" />
      </div>

      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ id: 'invoices', label: '인보이스 검증' }, { id: 'contracts', label: '계약' }, { id: 'score', label: '벤더 스코어카드' }]} />

      {tab === 'invoices' && (
        <Card title="3-way 매칭 결과">
          <Table head={<tr><th className={th}>거래처</th><th className={th}>인보이스</th><th className={`${th} text-right`}>청구액</th><th className={`${th} text-right`}>지급 적정액</th><th className={`${th} text-right`}>과청구 의심</th><th className={th}>지적</th><th className={th}>상태</th></tr>}>
            {results.map(({ inv, r }) => {
              const c = contracts.find((x) => x.id === inv.contractId)!;
              return (
                <tr key={inv.id} className="cursor-pointer hover:bg-brand-50" onClick={() => setSel(inv)}>
                  <td className={`${td} font-medium`}>{c.vendor} <span className="text-xs font-normal text-slate-500">{c.service}</span></td>
                  <td className={`${td} num`}>{inv.number}</td><td className={tdNum}>{won(r.billed)}</td><td className={tdNum}>{won(r.payable)}</td>
                  <td className={`${tdNum} ${r.recoverable ? 'font-semibold text-red-600' : ''}`}>{won(r.recoverable)}</td>
                  <td className={td}>{r.findings.length ? <Badge tone="red"><AlertTriangle size={12} />{r.findings.length}건</Badge> : <Badge tone="green"><CheckCircle2 size={12} />일치</Badge>}</td>
                  <td className={td}><StatusBadge status={inv.status} /></td>
                </tr>
              );
            })}
          </Table>
        </Card>
      )}

      {tab === 'contracts' && (
        <Card title="용역 계약">
          <Table head={<tr><th className={th}>거래처</th><th className={th}>용역</th><th className={th}>기간</th><th className={th}>약정 내역</th><th className={`${th} text-right`}>월 약정액</th><th className={th}>SLA</th><th className={th}>만기</th></tr>}>
            {contracts.map((c) => {
              const d = daysBetween(today(), c.end);
              return (
                <tr key={c.id} className="align-top">
                  <td className={`${td} font-medium`}>{c.vendor}</td><td className={td}>{c.service}</td><td className={`${td} num whitespace-nowrap`}>{c.start} ~ {c.end}</td>
                  <td className={td}>{c.items.map((i) => <div key={i.code} className="num text-xs">{i.desc} {i.qty}{i.unit} × {won(i.unitPrice)}</div>)}</td>
                  <td className={tdNum}>{won(c.items.reduce((a, i) => a + i.qty * i.unitPrice, 0))}</td><td className={td}>응답 {c.slaResponseMin}분</td>
                  <td className={td}>{d < 0 ? <Badge tone="red">만료</Badge> : d <= 90 ? <Badge tone="amber">D-{d} 재계약 검토</Badge> : <Badge>D-{d}</Badge>}</td>
                </tr>
              );
            })}
          </Table>
        </Card>
      )}

      {tab === 'score' && (
        <Card title="벤더 스코어카드 (최근 6개월)">
          <Table head={<tr><th className={th}>거래처</th><th className={`${th} text-right`}>SLA 준수율</th><th className={`${th} text-right`}>평균 응답</th><th className={`${th} text-right`}>청구 정확도</th><th className={`${th} text-right`}>사고</th><th className={`${th} text-right`}>종합 점수</th></tr>}>
            {contracts.map((c) => {
              const sc = scoreVendor(c, s.workRecords.filter((w) => w.contractId === c.id), all.filter((i) => i.contractId === c.id).map(check));
              return (
                <tr key={c.id}>
                  <td className={`${td} font-medium`}>{c.vendor} <span className="text-xs font-normal text-slate-500">{c.service}</span></td>
                  <td className={tdNum}>{pct(sc.slaCompliance, 0)}</td><td className={tdNum}>{sc.avgResponseMin.toFixed(0)}분 <span className="text-xs text-slate-400">/ {c.slaResponseMin}분</span></td>
                  <td className={tdNum}>{pct(sc.billingAccuracy, 0)}</td><td className={tdNum}>{sc.incidents}건</td>
                  <td className={`${tdNum} font-bold ${sc.score >= 85 ? 'text-emerald-600' : sc.score >= 70 ? 'text-amber-600' : 'text-red-600'}`}>{sc.score}</td>
                </tr>
              );
            })}
          </Table>
          <div className="mt-3"><Note>점수 = SLA 준수율 50 + 청구 정확도 40 + 기본 10 − 사고 감점(건당 2, 최대 10). 재계약 협상 자료로 쓰기 전 산식을 계약 조건에 맞게 조정하세요.</Note></div>
        </Card>
      )}

      <Drawer open={!!sel} onClose={() => setSel(null)} title={sel && selC ? `${selC.vendor} · ${sel.number}` : ''}>
        {sel && selR && selC && (
          <div className="space-y-4 text-sm">
            <table className="w-full">
              <thead><tr className="border-b border-slate-200 bg-slate-50"><th className={th}>항목</th><th className={`${th} text-right`}>계약</th><th className={`${th} text-right`}>실적</th><th className={`${th} text-right`}>청구</th><th className={`${th} text-right`}>청구액</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {sel.lines.map((l) => {
                  const ci = selC.items.find((i) => i.code === l.code);
                  const pf = selW?.performed[l.code];
                  return (
                    <tr key={l.code}>
                      <td className={td}>{l.desc}</td>
                      <td className={tdNum}>{ci ? `${ci.qty} × ${ci.unitPrice.toLocaleString()}` : '—'}</td>
                      <td className={`${tdNum} ${pf !== undefined && pf < l.qty ? 'font-semibold text-red-600' : ''}`}>{pf ?? '—'}</td>
                      <td className={`${tdNum} ${ci && l.unitPrice !== ci.unitPrice ? 'font-semibold text-red-600' : ''}`}>{l.qty} × {l.unitPrice.toLocaleString()}</td>
                      <td className={tdNum}>{won(l.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {selR.findings.length === 0 ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800">계약·실적·청구가 모두 일치합니다.</p> : (
              <ul className="space-y-2">
                {selR.findings.map((f, i) => (
                  <li key={i} className="rounded-lg border border-red-200 bg-red-50/60 p-3">
                    <div className="flex justify-between gap-2"><span className="font-semibold">{f.title}</span><span className="num whitespace-nowrap text-red-700">{won(f.recoverable)}</span></div>
                    <p className="mt-1 text-slate-600">{f.why}</p>
                  </li>
                ))}
              </ul>
            )}
            <div className="num rounded-lg border border-slate-200 p-3">
              <div className="flex justify-between"><span>청구액</span><span>{won(selR.billed)}</span></div>
              <div className="flex justify-between text-red-600"><span>과청구 의심</span><span>− {won(selR.recoverable)}</span></div>
              <div className="mt-1 flex justify-between border-t border-slate-200 pt-1 font-bold"><span>지급 권고액</span><span>{won(selR.payable)}</span></div>
            </div>
            {sel.status === 'draft' ? <Btn variant="primary" className="w-full" onClick={() => { s.requestPayment(sel.id); setSel(null); }}><Send size={14} />지급 승인 요청 (L2)</Btn> : <p className="text-center text-slate-500">현재 상태: <StatusBadge status={s.invoices.find((i) => i.id === sel.id)?.status ?? sel.status} /></p>}
          </div>
        )}
      </Drawer>
    </Page>
  );
}
