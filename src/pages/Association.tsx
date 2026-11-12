import { useState } from 'react';
import { Badge, Btn, Card, Empty, Note, Page, Stat, Table, Tabs, td, tdNum, th } from '../components/ui';
import type { Vote } from '../domain/types';
import { ASSOCIATION_VERSION, QUORUM, tally, votingRights } from '../engine/association';
import { pct, won } from '../engine/money';
import { useBuilding, useStore } from '../store/store';

type Tab = 'meetings' | 'owners' | 'disclosure';
const VOTE: Record<Vote, string> = { yes: '찬성', no: '반대', abstain: '기권' };

export default function Association() {
  const b = useBuilding();
  const s = useStore();
  const [tab, setTab] = useState<Tab>('meetings');
  const owners = s.owners.filter((o) => o.buildingId === b.id);
  const units = s.units.filter((u) => u.buildingId === b.id);
  const rights = votingRights(owners, units);
  const meetings = s.meetings.filter((m) => m.buildingId === b.id).sort((a, c) => c.date.localeCompare(a.date));
  const editable = s.settings.role === 'pm' || s.settings.role === 'amc';
  const approved = s.settlements.filter((x) => x.buildingId === b.id && x.status === 'approved');

  return (
    <Page title="관리단" desc="구분소유자 명부와 의결권, 관리단집회 안건·표결, 관리비 공개 내역을 관리합니다.">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="구분소유자" value={`${owners.length}명`} sub={owners.length === 1 ? '단일 소유 — 관리단 결의 불필요' : `전유부분 ${units.length}개`} />
        <Stat label="예정 집회" value={`${meetings.filter((m) => !m.closed).length}건`} />
        <Stat label="표결 중 안건" value={`${meetings.filter((m) => !m.closed).reduce((a, m) => a + m.agendas.length, 0)}건`} />
        <Stat label="공개된 정산" value={`${approved.length}건`} sub="승인 완료분만 공개" />
      </div>

      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ id: 'meetings', label: '집회·안건' }, { id: 'owners', label: '구분소유자·의결권' }, { id: 'disclosure', label: '관리비 공개' }]} />

      {tab === 'meetings' && (meetings.length === 0 ? <Card><Empty>등록된 관리단집회가 없습니다.</Empty></Card> : meetings.map((m) => (
        <Card key={m.id} title={<span>{m.title} <span className="num ml-2 font-normal text-slate-500">{m.date}</span></span>} right={<div className="flex items-center gap-2">{m.closed ? <Badge tone="gray">종결</Badge> : <Badge tone="amber">표결 진행</Badge>}{!m.closed && editable && <Btn onClick={() => s.closeMeeting(m.id)}>표결 마감</Btn>}</div>}>
          <div className="space-y-4">
            {m.agendas.map((a) => {
              const t = tally(a, owners, units);
              const voted = owners.filter((o) => a.votes[o.id]).length;
              return (
                <div key={a.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{a.title}</span>
                    <Badge tone="blue">{QUORUM[a.kind].label}</Badge>
                    <span className="ml-auto">{m.closed ? <Badge tone={t.passed ? 'green' : 'red'}>{t.passed ? '가결' : '부결'}</Badge> : <Badge tone={t.passed ? 'green' : 'gray'}>{t.passed ? '현재 가결 요건 충족' : `진행 중 (${voted}/${owners.length}명 표결)`}</Badge>}</span>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {[['구분소유자 수', t.headRatio], ['의결권', t.rightsRatio]].map(([label, v]) => (
                      <div key={label as string}>
                        <div className="num flex justify-between text-xs text-slate-600"><span>{label} 찬성</span><span>{pct(v as number)} / 기준 {a.kind === 'bylaw' ? '75% 이상' : '50% 초과'}</span></div>
                        <div className="relative mt-1 h-2 rounded-full bg-slate-100">
                          <div className="h-2 rounded-full bg-brand-500" style={{ width: `${Math.min(100, (v as number) * 100)}%` }} />
                          <div className="absolute top-[-3px] h-[14px] w-px bg-slate-500" style={{ left: `${t.threshold * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {owners.map((o) => (
                      <label key={o.id} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1 text-xs">
                        <span>{o.name} <span className="num text-slate-400">{pct(rights[o.id])}</span></span>
                        <select aria-label={`${o.name} 표결`} disabled={m.closed || !editable} value={a.votes[o.id] ?? ''} onChange={(e) => s.castVote(m.id, a.id, o.id, e.target.value as Vote)} className="rounded border border-slate-300 bg-white px-1 py-0.5 disabled:bg-slate-50">
                          <option value="" disabled>미표결</option>{(Object.keys(VOTE) as Vote[]).map((v) => <option key={v} value={v}>{VOTE[v]}</option>)}
                        </select>
                      </label>
                    ))}
                  </div>
                  <ol className="mt-3 list-decimal space-y-0.5 pl-5 text-xs text-slate-500">{t.trace.map((x, i) => <li key={i}>{x}</li>)}</ol>
                </div>
              );
            })}
          </div>
        </Card>
      )))}

      {tab === 'owners' && (
        <Card title="구분소유자 명부">
          <Table head={<tr><th className={th}>소유자</th><th className={th}>전유부분</th><th className={`${th} text-right`}>전용면적</th><th className={`${th} text-right`}>의결권</th></tr>}>
            {owners.map((o) => (
              <tr key={o.id}><td className={`${td} font-medium`}>{o.name}</td><td className={td}>{o.unitIds.map((id) => units.find((u) => u.id === id)?.name).join(', ')}</td>
                <td className={tdNum}>{o.unitIds.reduce((a, id) => a + (units.find((u) => u.id === id)?.exclusiveArea ?? 0), 0).toLocaleString()}㎡</td><td className={tdNum}>{pct(rights[o.id])}</td></tr>
            ))}
          </Table>
        </Card>
      )}

      {tab === 'disclosure' && (
        <Card title="관리비 공개 내역">
          {approved.length === 0 ? <Empty>승인 완료된 정산이 없습니다. 관리비 메뉴에서 정산을 승인하면 여기에 공개됩니다.</Empty> : (
            <Table head={<tr><th className={th}>정산 월</th><th className={`${th} text-right`}>지출 합계</th><th className={`${th} text-right`}>임차인 부과</th><th className={`${th} text-right`}>소유자 부담</th><th className={th}>규칙 버전</th></tr>}>
              {approved.map((x) => <tr key={x.id}><td className={`${td} num`}>{x.month}</td><td className={tdNum}>{won(x.poolTotal)}</td><td className={tdNum}>{won(x.lines.filter((l) => l.payer === 'tenant' && l.itemId !== 'FIXED').reduce((a, l) => a + l.amount, 0))}</td><td className={tdNum}>{won(x.lines.filter((l) => l.payer === 'owner').reduce((a, l) => a + l.amount, 0))}</td><td className={td}>{x.ruleVersion}</td></tr>)}
            </Table>
          )}
        </Card>
      )}
      <Note>{ASSOCIATION_VERSION} — 정족수는 집합건물법의 일반 기준을 따른 예시이며, 규약에서 달리 정한 경우 규약이 우선할 수 있습니다. 실제 결의 효력은 법무 검토로 확인하세요.</Note>
    </Page>
  );
}
