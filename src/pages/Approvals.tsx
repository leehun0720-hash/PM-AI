import { Check, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Btn, Card, Empty, inputCls, Note, Page, StatusBadge, Table, td, tdNum, th } from '../components/ui';
import { ROLE_LABEL } from '../domain/types';
import { won } from '../engine/money';
import { canApprove, useStore } from '../store/store';

const KIND = { settlement: ['관리비 고지', '/charges'], payment: ['외주 지급', '/vendors'], lease: ['임대차', '/leases'], purchase: ['발주', '/inventory'] } as const;

export default function Approvals() {
  const s = useStore();
  const [comment, setComment] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const pending = s.approvals.filter((a) => a.status === 'pending');
  const done = s.approvals.filter((a) => a.status !== 'pending');
  const ok = canApprove(s.settings.role);
  const bName = (id: string) => s.buildings.find((b) => b.id === id)?.name ?? id;

  return (
    <Page title="승인함" desc="돈·법·안전에 닿는 산출물은 AI가 준비하고 사람이 승인합니다(L2). 승인 없이는 고지·지급·발주가 확정되지 않습니다.">
      {!ok && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">현재 역할({ROLE_LABEL[s.settings.role]})은 승인 권한이 없습니다. 상단에서 PM사 또는 운용사로 전환하세요.</div>}
      {msg && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{msg}</div>}
      <Card title={`승인 대기 (${pending.length})`}>
        {pending.length === 0 ? <Empty>대기 중인 승인 건이 없습니다.</Empty> : (
          <ul className="space-y-3">
            {pending.map((a) => (
              <li key={a.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="blue">{KIND[a.kind][0]}</Badge><Badge>{a.level}</Badge>
                  <span className="text-sm font-semibold">{a.title}</span>
                  <span className="num ml-auto text-sm font-bold">{won(a.amount)}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{bName(a.buildingId)} · 요청 {a.requestedBy} · {new Date(a.requestedAt).toLocaleString('ko-KR')} · <Link className="text-brand-600 hover:underline" to={KIND[a.kind][1]}>근거 화면 열기</Link></p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <input aria-label="의견" className={`${inputCls} min-w-40 flex-1`} placeholder="의견 (반려 시 필수)" value={comment[a.id] ?? ''} onChange={(e) => setComment({ ...comment, [a.id]: e.target.value })} />
                  <Btn variant="primary" disabled={!ok} onClick={() => setMsg(s.decideApproval(a.id, true, comment[a.id] ?? '') ?? '')}><Check size={14} />승인</Btn>
                  <Btn variant="danger" disabled={!ok || !comment[a.id]?.trim()} onClick={() => setMsg(s.decideApproval(a.id, false, comment[a.id]) ?? '')}><X size={14} />반려</Btn>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="처리 이력">
        {done.length === 0 ? <Empty>처리된 건이 없습니다.</Empty> : (
          <Table head={<tr><th className={th}>유형</th><th className={th}>건명</th><th className={`${th} text-right`}>금액</th><th className={th}>결과</th><th className={th}>결정자</th><th className={th}>의견</th></tr>}>
            {done.map((a) => <tr key={a.id}><td className={td}>{KIND[a.kind][0]}</td><td className={td}>{a.title}</td><td className={tdNum}>{won(a.amount)}</td><td className={td}><StatusBadge status={a.status} /></td><td className={td}>{a.decidedBy}<span className="num block text-xs text-slate-400">{a.decidedAt && new Date(a.decidedAt).toLocaleString('ko-KR')}</span></td><td className={td}>{a.comment || '—'}</td></tr>)}
          </Table>
        )}
      </Card>
      <Note>자율 레벨 — L0 초안(사람이 전부 검토) · L1 제안(확신도 낮은 항목만 검토) · L2 자동 생성 후 승인 필수 · L3 범위 내 자율(돈·법·안전 비접촉 업무만). 이 앱에서 고지·지급·발주는 L2를 넘지 않습니다.</Note>
    </Page>
  );
}
