import { useState } from 'react';
import { Badge, Btn, Card, Empty, Field, inputCls, Note, Page, Stat, Table, Tabs, td, th } from '../components/ui';
import type { CivilRequest } from '../domain/types';
import { applicableRules, COMPLIANCE_VERSION, inspectionState, RULES, STATE_LABEL, type InspectionState } from '../engine/compliance';
import { addMonthsToDate, daysBetween } from '../engine/money';
import { today, useBuilding, useStore } from '../store/store';

type Tab = 'inspections' | 'requests' | 'rules';
const TONE: Record<InspectionState, 'green' | 'red' | 'amber' | 'blue' | 'gray'> = { done: 'green', overdue: 'red', due30: 'amber', due90: 'blue', scheduled: 'gray' };
const RQ = { open: ['접수', 'amber'], assigned: ['배정', 'blue'], done: ['완료', 'green'] } as const;
const CATS: CivilRequest['category'][] = ['시설', '청소', '주차', '관리비', '소음', '기타'];

export default function Admin() {
  const b = useBuilding();
  const s = useStore();
  const now = today();
  const staff = s.settings.role !== 'tenant';
  const [tab, setTab] = useState<Tab>(staff ? 'inspections' : 'requests');
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ requester: '', category: '시설' as CivilRequest['category'], text: '' });
  const insp = s.inspections.filter((i) => i.buildingId === b.id).sort((a, c) => a.dueDate.localeCompare(c.dueDate));
  const openInsp = insp.filter((i) => !i.doneDate);
  const requests = s.requests.filter((r) => r.buildingId === b.id);
  const count = (st: InspectionState) => openInsp.filter((i) => inspectionState(i, now) === st).length;
  const openFindings = insp.reduce((a, i) => a + i.findings.filter((f) => !f.done).length, 0);

  return (
    <Page title="행정" desc="법정점검 기한과 증빙, 지적사항 조치, 민원 접수·처리를 한곳에서 관리합니다.">
      {staff && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="기한 경과" value={`${count('overdue')}건`} tone={count('overdue') ? 'bad' : 'good'} sub="과태료 리스크" />
          <Stat label="30일 이내" value={`${count('due30')}건`} tone={count('due30') ? 'warn' : 'default'} />
          <Stat label="미조치 지적사항" value={`${openFindings}건`} tone={openFindings ? 'warn' : 'good'} />
          <Stat label="미처리 민원" value={`${requests.filter((r) => r.status !== 'done').length}건`} />
        </div>
      )}
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[...(staff ? [{ id: 'inspections' as Tab, label: '법정점검 캘린더' }] : []), { id: 'requests', label: '민원' }, ...(staff ? [{ id: 'rules' as Tab, label: '적용 룰셋' }] : [])]} />

      {tab === 'inspections' && (
        <Card title="법정점검 일정·증빙">
          <Table head={<tr><th className={th}>기한</th><th className={th}>점검</th><th className={th}>상태</th><th className={th}>증빙·지적사항</th><th className={th}>처리</th></tr>}>
            {insp.filter((i) => !i.doneDate || i.dueDate >= addMonthsToDate(now, -14)).map((i) => {
              const rule = RULES.find((r) => r.id === i.ruleId)!;
              const st = inspectionState(i, now);
              return (
                <tr key={i.id} className="align-top">
                  <td className={`${td} num whitespace-nowrap`}>{i.dueDate}{!i.doneDate && <span className={`ml-1 text-xs ${st === 'overdue' ? 'text-red-600' : 'text-slate-400'}`}>D{daysBetween(now, i.dueDate) >= 0 ? '-' : '+'}{Math.abs(daysBetween(now, i.dueDate))}</span>}</td>
                  <td className={td}><span className="font-medium">{rule.name}</span><span className="block text-xs text-slate-400">{rule.law}</span></td>
                  <td className={td}><Badge tone={TONE[st]}>{STATE_LABEL[st]}</Badge></td>
                  <td className={td}>
                    {i.doneDate && <span className="text-xs text-slate-600">{i.doneDate} 완료 · {i.evidence}</span>}
                    {i.findings.map((f, k) => (
                      <label key={k} className="mt-1 flex items-center gap-1.5 text-xs"><input type="checkbox" checked={f.done} onChange={() => s.toggleFinding(i.id, k)} /><span className={f.done ? 'text-slate-400 line-through' : 'text-amber-700'}>{f.text}</span></label>
                    ))}
                    {!i.doneDate && <input aria-label="증빙" className={`${inputCls} !py-1 text-xs`} placeholder={rule.evidence} value={evidence[i.id] ?? ''} onChange={(e) => setEvidence({ ...evidence, [i.id]: e.target.value })} />}
                  </td>
                  <td className={td}>{!i.doneDate && <Btn disabled={!evidence[i.id]?.trim()} onClick={() => s.completeInspection(i.id, evidence[i.id].trim())}>완료 처리</Btn>}</td>
                </tr>
              );
            })}
          </Table>
          <div className="mt-3"><Note>증빙을 입력해야 완료 처리되며, 완료하면 주기에 맞춰 다음 회차가 자동 생성됩니다.</Note></div>
        </Card>
      )}

      {tab === 'requests' && (
        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <Card title="민원 대장">
            {requests.length === 0 ? <Empty>접수된 민원이 없습니다.</Empty> : (
              <Table head={<tr><th className={th}>접수일</th><th className={th}>요청자</th><th className={th}>분류</th><th className={th}>내용</th><th className={th}>기한</th><th className={th}>상태</th></tr>}>
                {requests.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className={`${td} num whitespace-nowrap`}>{r.receivedAt}<span className="block text-xs text-slate-400">{r.channel}</span></td>
                    <td className={td}>{r.requester}</td><td className={td}>{r.category}</td><td className={`${td} max-w-xs`}>{r.text}{r.assignee && <span className="block text-xs text-slate-400">담당: {r.assignee}</span>}</td>
                    <td className={`${td} num whitespace-nowrap`}>{r.dueDate}</td>
                    <td className={td}>{staff ? (
                      <select aria-label="상태" value={r.status} onChange={(e) => s.updateRequest(r.id, { status: e.target.value as CivilRequest['status'] })} className="rounded border border-slate-300 bg-white px-1.5 py-1 text-xs">{Object.entries(RQ).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}</select>
                    ) : <Badge tone={RQ[r.status][1]}>{RQ[r.status][0]}</Badge>}</td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
          <Card title="민원 접수">
            <div className="space-y-3">
              <Field label="요청자"><input className={inputCls} value={form.requester} onChange={(e) => setForm({ ...form, requester: e.target.value })} /></Field>
              <Field label="분류"><select className={inputCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as CivilRequest['category'] })}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></Field>
              <Field label="내용"><textarea className={`${inputCls} h-24`} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} /></Field>
              <Btn variant="primary" className="w-full" disabled={!form.requester.trim() || !form.text.trim()} onClick={() => { s.addRequest({ buildingId: b.id, receivedAt: now, channel: staff ? '전화' : '앱', requester: form.requester.trim(), category: form.category, text: form.text.trim(), status: 'open', dueDate: new Date(Date.parse(now) + 7 * 86400000).toISOString().slice(0, 10) }); setForm({ requester: '', category: '시설', text: '' }); }}>접수</Btn>
            </div>
          </Card>
        </div>
      )}

      {tab === 'rules' && (
        <Card title={`${b.name}에 적용되는 법정점검`} right={<Badge tone="violet">{COMPLIANCE_VERSION}</Badge>}>
          <Table head={<tr><th className={th}>점검</th><th className={th}>근거 법령</th><th className={th}>주기</th><th className={th}>증빙</th></tr>}>
            {applicableRules(b).map((r) => <tr key={r.id}><td className={`${td} font-medium`}>{r.name}</td><td className={td}>{r.law}</td><td className={td}>{r.cycleMonths === 1 ? '매월' : r.cycleMonths % 12 === 0 ? `${r.cycleMonths / 12}년` : `${r.cycleMonths}개월`}</td><td className={td}>{r.evidence}</td></tr>)}
          </Table>
          <div className="mt-3"><Note>건물 용도·규모·설비 구성으로 적용 점검을 자동 도출합니다. 주기와 대상 기준은 구조를 보여 주는 예시이며, 법령 개정이 잦으므로 법무 검토를 거친 룰셋만 운영에 써야 합니다.</Note></div>
        </Card>
      )}
    </Page>
  );
}
