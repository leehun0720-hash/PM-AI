import { FileSearch, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Badge, Btn, Card, Drawer, Empty, Field, inputCls, Note, Page, Stat, Table, Tabs, td, tdNum, th } from '../components/ui';
import type { Lease } from '../domain/types';
import { EVENT_LABEL, LEASE_RULE_VERSION, leaseEvents, protection, simulateEscalation, walt } from '../engine/leaseEvents';
import { won, wonShort } from '../engine/money';
import { getProvider } from '../llm/adapter';
import { draftToLease, extractLease, type AiResult, type LeaseDraft } from '../llm/tasks';
import { today, useBuilding, useStore } from '../store/store';

const SAMPLE = `임대차계약서

임대인: 케이리츠 제1호
임차인: (주)브라이트랩스

제2조(임대차 기간) 2026년 12월 1일부터 2029년 11월 30일까지로 한다.
제3조(보증금) 임대차보증금은 금 300,000,000원으로 한다.
제4조(임대료) 월 임대료는 금 31,500,000원(부가가치세 별도)으로 하며 매월 말일에 지급한다.
제5조(임대료 인상) 임대료는 매년 3% 인상한다.
제6조(관리비) 관리비는 실비로 정산하여 부과한다.
제9조(갱신) 임차인은 기간 만료 6개월 전까지 서면으로 갱신 의사를 통지한다.
제12조(렌트프리) 임대인은 입주 초기 2개월간 무상 임대 2개월을 제공한다.

특약사항
1. 임차인은 원상복구 시 바닥 마감재를 기존 사양으로 복구한다.`;

const ESC = { fixed: '정률', cpi: 'CPI 연동', negotiated: '협의' } as const;
const FIELD_LABEL: Record<string, string> = { tenant: '임차인', deposit: '보증금', monthlyRent: '월 임대료', end: '만기일', escalation: '인상 조항', specialTerms: '특약' };
type Tab = 'roll' | 'events' | 'extract';

const Conf = ({ c }: { c: number }) => <Badge tone={c >= 0.9 ? 'green' : c >= 0.75 ? 'amber' : 'red'}>{Math.round(c * 100)}%</Badge>;

export default function Leases() {
  const b = useBuilding();
  const s = useStore();
  const now = today();
  const [tab, setTab] = useState<Tab>('roll');
  const [sel, setSel] = useState<Lease | null>(null);
  const leases = s.leases.filter((l) => l.buildingId === b.id);
  const active = leases.filter((l) => l.status === 'active' && l.end >= now);
  const units = s.units.filter((u) => u.buildingId === b.id);
  const vacant = units.filter((u) => !leases.some((l) => l.unitId === u.id && l.end >= now));
  const events = leaseEvents(active, now, 365);
  const unitName = (id: string) => units.find((u) => u.id === id)?.name ?? id;

  const [text, setText] = useState('');
  const [unitId, setUnitId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [draft, setDraft] = useState<AiResult<LeaseDraft> | null>(null);

  async function run() {
    setBusy(true); setErr(''); setDraft(null);
    try { setDraft(await extractLease(await getProvider(s.settings), text)); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }
  function register() {
    if (!draft) return;
    const target = unitId || vacant[0]?.id;
    if (!target) { setErr('등록할 공실 호실이 없습니다.'); return; }
    s.addLease(draftToLease(draft.value, `LS-${Date.now().toString(36)}`, b.id, target), draft.modelVersion);
    setDraft(null); setText(''); setTab('roll');
  }

  return (
    <Page title="임대차" desc="계약서를 구조화하고 만기·통지·인상 이벤트를 놓치지 않게 관리합니다.">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="활성 계약" value={`${active.length}건`} sub={`공실 ${vacant.length}개 호실`} />
        <Stat label="월 임대료 합계" value={`${wonShort(active.reduce((a, l) => a + l.monthlyRent, 0))}원`} sub={`보증금 ${wonShort(active.reduce((a, l) => a + l.deposit, 0))}원`} />
        <Stat label="WALT" value={`${walt(active, now).toFixed(1)}년`} sub="월 임대료 가중 잔여기간" />
        <Stat label="90일 내 이벤트" value={`${events.filter((e) => e.dday <= 90).length}건`} tone={events.some((e) => e.dday <= 30) ? 'warn' : 'default'} sub="만기·통지 기한·인상" />
      </div>

      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ id: 'roll', label: '렌트롤' }, { id: 'events', label: `이벤트 캘린더 (${events.length})` }, { id: 'extract', label: '계약서 추출' }]} />

      {tab === 'roll' && (
        <Card title="렌트롤" right={<span className="text-xs text-slate-500">행을 누르면 필드 근거와 인상 시뮬레이션이 열립니다</span>}>
          <Table head={<tr><th className={th}>호실</th><th className={th}>임차인</th><th className={th}>기간</th><th className={`${th} text-right`}>보증금</th><th className={`${th} text-right`}>월 임대료</th><th className={th}>관리비</th><th className={th}>인상</th><th className={th}>상태</th></tr>}>
            {leases.map((l) => (
              <tr key={l.id} className="cursor-pointer hover:bg-brand-50" onClick={() => setSel(l)}>
                <td className={td}>{unitName(l.unitId)}</td><td className={`${td} font-medium`}>{l.tenant}</td>
                <td className={`${td} num whitespace-nowrap`}>{l.start} ~ {l.end}</td>
                <td className={tdNum}>{won(l.deposit)}</td><td className={tdNum}>{won(l.monthlyRent)}</td>
                <td className={td}>{l.mgmtFeeType === 'fixed' ? `정액 ${wonShort(l.fixedMgmtFee ?? 0)}` : '실비'}</td>
                <td className={td}>{ESC[l.escalation.type]}{l.escalation.rate ? ` ${(l.escalation.rate * 100).toFixed(1)}%` : ''}</td>
                <td className={td}>{l.status === 'review' ? <Badge tone="amber">검토 필요</Badge> : l.end < now ? <Badge>종료</Badge> : <Badge tone="green">정본</Badge>}</td>
              </tr>
            ))}
            {vacant.map((u) => <tr key={u.id}><td className={td}>{u.name}</td><td className={td} colSpan={7}><Badge tone="amber">공실</Badge> <span className="ml-2 text-xs text-slate-500">계약면적 {u.contractArea.toLocaleString()}㎡ — 관리비는 소유자 부담으로 안분됩니다</span></td></tr>)}
          </Table>
        </Card>
      )}

      {tab === 'events' && (
        <Card title="향후 12개월 이벤트">
          {events.length === 0 ? <Empty>예정된 이벤트가 없습니다.</Empty> : (
            <Table head={<tr><th className={th}>D-day</th><th className={th}>날짜</th><th className={th}>유형</th><th className={th}>임차인</th><th className={th}>알림 단계</th></tr>}>
              {events.map((e, i) => {
                const l = leases.find((x) => x.id === e.leaseId)!;
                return (
                  <tr key={i} className="cursor-pointer hover:bg-brand-50" onClick={() => setSel(l)}>
                    <td className={`${td} num font-semibold ${e.dday <= 30 ? 'text-red-600' : e.dday <= 90 ? 'text-amber-600' : ''}`}>D-{e.dday}</td>
                    <td className={`${td} num`}>{e.date}</td><td className={td}>{EVENT_LABEL[e.kind]}</td><td className={td}>{l.tenant} · {unitName(l.unitId)}</td>
                    <td className={td}>{e.alertStage ? <Badge tone={e.alertStage <= 30 ? 'red' : e.alertStage <= 90 ? 'amber' : 'blue'}>D-{e.alertStage} 알림</Badge> : '—'}</td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Card>
      )}

      {tab === 'extract' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="계약서 본문" right={<Btn variant="ghost" onClick={() => setText(SAMPLE)}>샘플 계약서 넣기</Btn>}>
            <textarea className={`${inputCls} h-80 font-mono text-xs`} placeholder="임대차계약서 텍스트를 붙여 넣으세요." value={text} onChange={(e) => setText(e.target.value)} />
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <Field label="등록할 호실(공실)"><select className={inputCls} value={unitId} onChange={(e) => setUnitId(e.target.value)}>{vacant.length === 0 && <option value="">공실 없음</option>}{vacant.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
              <Btn variant="primary" disabled={!text.trim() || busy} onClick={run}>{busy ? <Loader2 size={14} className="animate-spin" /> : <FileSearch size={14} />}필드 추출</Btn>
            </div>
            {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
            <div className="mt-3"><Note>{s.settings.provider === 'claude' && s.settings.claudeKey ? 'Claude로 추출합니다.' : 'LLM 키가 없어 규칙 기반으로 추출합니다(정형 문구만 인식, 신뢰도 낮음). 설정에서 API 키를 넣으면 LLM 추출로 바뀝니다.'} 추출 결과는 항상 검토 큐를 거쳐야 정본이 됩니다.</Note></div>
          </Card>
          <Card title="추출 결과 (L0 초안)" right={draft && <Badge tone={draft.usedLlm ? 'blue' : 'gray'}>{draft.modelVersion}</Badge>}>
            {!draft ? <Empty>왼쪽에 계약서를 넣고 ‘필드 추출’을 누르세요.</Empty> : (
              <>
                <dl className="divide-y divide-slate-100 text-sm">
                  {([['임차인', draft.value.tenant, 'tenant'], ['기간', `${draft.value.start} ~ ${draft.value.end}`, 'end'], ['보증금', won(draft.value.deposit), 'deposit'], ['월 임대료', won(draft.value.monthlyRent), 'monthlyRent'], ['관리비', draft.value.mgmtFeeType === 'fixed' ? `정액 ${won(draft.value.fixedMgmtFee)}` : '실비', ''], ['인상', `${ESC[draft.value.escalationType]} ${(draft.value.escalationRate * 100).toFixed(1)}%`, 'escalation'], ['렌트프리', `${draft.value.rentFreeMonths}개월`, ''], ['갱신 통지', `만료 ${draft.value.renewalNoticeMonths}개월 전`, ''], ['특약', draft.value.specialTerms || '—', 'specialTerms']] as const).map(([k, v, f]) => {
                    const e = draft.value.evidence.find((x) => x.field === f);
                    return (
                      <div key={k} className="grid grid-cols-[5.5rem_1fr_auto] items-start gap-2 py-2">
                        <dt className="text-slate-500">{k}</dt>
                        <dd><span className="num font-medium">{v}</span>{e && <span className="block text-xs text-slate-400">{e.source}</span>}</dd>
                        {e && <Conf c={e.confidence} />}
                      </div>
                    );
                  })}
                </dl>
                <Btn variant="primary" className="mt-3 w-full" onClick={register}>검토 큐에 등록</Btn>
              </>
            )}
          </Card>
        </div>
      )}

      <Drawer open={!!sel} onClose={() => setSel(null)} title={sel ? `${sel.tenant} · ${unitName(sel.unitId)}` : ''}>
        {sel && (() => {
          const cur = leases.find((l) => l.id === sel.id) ?? sel;
          const p = protection(cur, b.region);
          const sim = simulateEscalation(cur, b.region);
          return (
            <div className="space-y-4 text-sm">
              {cur.status === 'review' && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-amber-800">AI 추출 초안입니다. 필드를 원문과 대조한 뒤 확정하세요.</p><Btn variant="primary" className="mt-2" onClick={() => s.confirmLease(cur.id)}>검토 완료 — 정본 확정</Btn></div>}
              <div>
                <h4 className="mb-2 font-semibold">필드 근거</h4>
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {Object.entries(cur.evidence).map(([f, e]) => <li key={f} className="flex items-center justify-between gap-2 px-3 py-2"><span>{FIELD_LABEL[f] ?? f}<span className="ml-2 text-xs text-slate-400">{e.source}</span></span><Conf c={e.confidence} /></li>)}
                </ul>
                <p className="mt-1 text-xs text-slate-500">신뢰도 90% 미만 필드는 검토 대상입니다.</p>
              </div>
              <div>
                <h4 className="mb-2 font-semibold">상가건물 임대차보호법 판정</h4>
                <ul className="space-y-1 text-slate-700">
                  <li className="num">환산보증금 {won(p.converted)} (보증금 + 월 임대료 × 100)</li>
                  <li className="num">지역 기준액 {won(p.limit)} → {p.capApplies ? <Badge tone="blue">기준 이하 · 5% 상한 적용</Badge> : <Badge>기준 초과 · 상한 미적용</Badge>}</li>
                  <li className="num">계약갱신요구권 행사 가능 기한 {p.renewalRightUntil}</li>
                </ul>
              </div>
              <div>
                <h4 className="mb-2 font-semibold">다음 인상 시뮬레이션</h4>
                <p className="num">{won(sim.currentRent)} → <b>{won(sim.newRent)}</b> ({(sim.appliedRate * 100).toFixed(1)}%)</p>
                <p className="mt-1 text-slate-600">{sim.note}</p>
              </div>
              {cur.specialTerms && <div><h4 className="mb-1 font-semibold">특약</h4><p className="text-slate-700">{cur.specialTerms}</p></div>}
              <Note>{LEASE_RULE_VERSION} — 기준액과 상한은 예시값입니다. 실제 적용 전 현행 시행령을 확인하세요.</Note>
            </div>
          );
        })()}
      </Drawer>
    </Page>
  );
}
