import { useState } from 'react';
import { Badge, Btn, Card, Empty, inputCls, Note, Page, SampleTag, Stat, Table, td, th } from '../../components/ui';
import { EQUIPMENT_LABEL, equipmentRegister, workOrders } from '../../engine/assets';
import { STATE_LABEL } from '../../engine/compliance';
import { today, useBuilding, useStore } from '../../store/store';

const STATE_TONE = { overdue: 'red', due30: 'amber', due90: 'blue', scheduled: 'gray', done: 'green', none: 'gray' } as const;

/** FM — 설비별 법정점검 이력과, 점검 지적·시설 민원을 묶은 작업지시 */
export default function Assets() {
  const b = useBuilding();
  const s = useStore();
  const now = today();
  const reg = equipmentRegister(b, s.inspections, now);
  const wo = workOrders(b, s.inspections, s.requests, now);
  const [assignee, setAssignee] = useState<Record<string, string>>({});
  const overdue = wo.filter((w) => w.overdue).length;
  const lateRules = reg.flatMap((r) => r.rules).filter((r) => r.state === 'overdue').length;

  return (
    <Page title={`설비 이력·작업지시 · ${b.name}`} desc="설비마다 법정점검 마지막 실시·다음 기한·미조치 지적을 묶어 보고, 점검 지적과 시설 민원을 하나의 작업 목록으로 처리합니다." actions={<SampleTag />}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="관리 설비" value={`${b.equipment.length}종`} sub={b.equipment.map((e) => EQUIPMENT_LABEL[e]).join(' · ')} />
        <Stat label="열린 작업" value={`${wo.length}건`} tone={wo.length ? 'warn' : 'good'} sub={`점검 지적 ${wo.filter((w) => w.source === 'finding').length} · 민원 ${wo.filter((w) => w.source === 'request').length}`} />
        <Stat label="기한 지난 작업" value={`${overdue}건`} tone={overdue ? 'bad' : 'good'} />
        <Stat label="기한 지난 법정점검" value={`${lateRules}건`} tone={lateRules ? 'bad' : 'good'} />
      </div>

      <Card title="작업지시">
        {wo.length === 0 ? <Empty>열린 작업이 없습니다.</Empty> : (
          <Table head={<tr><th className={th}>작업</th><th className={th}>설비</th><th className={th}>기한</th><th className={th}>담당</th><th className={th}>처리</th></tr>}>
            {wo.map((w) => (
              <tr key={w.id}>
                <td className={td}><p className="text-ink">{w.title}</p><Badge tone={w.source === 'finding' ? 'violet' : 'blue'}>{w.source === 'finding' ? '점검 지적' : '시설 민원'}</Badge></td>
                <td className={td}>{w.equipment ? <>{EQUIPMENT_LABEL[w.equipment]}{w.equipmentGuessed && <span className="text-xs text-slate-400"> (추정)</span>}</> : <span className="text-slate-400">—</span>}</td>
                <td className={td}><span className={w.overdue ? 'font-semibold text-red-600' : ''}>{w.due}</span>{w.overdue && <p className="text-xs text-red-600">기한 지남</p>}</td>
                <td className={td}>
                  {w.source === 'request'
                    ? <input aria-label="담당" className={`${inputCls} w-32`} placeholder="업체·담당자" value={assignee[w.id] ?? w.assignee ?? ''} onChange={(e) => setAssignee({ ...assignee, [w.id]: e.target.value })}
                        onBlur={() => assignee[w.id] !== undefined && s.updateRequest(w.ref.requestId!, { assignee: assignee[w.id], status: assignee[w.id] ? 'assigned' : 'open' })} />
                    : <span className="text-xs text-slate-500">점검 업체</span>}
                </td>
                <td className={td}>
                  <Btn onClick={() => (w.source === 'request' ? s.updateRequest(w.ref.requestId!, { status: 'done' }) : s.toggleFinding(w.ref.inspectionId!, w.ref.findingIndex!))}>완료 처리</Btn>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card title="설비 대장">
        <Table head={<tr><th className={th}>설비</th><th className={th}>법정점검</th><th className={th}>마지막 실시</th><th className={th}>다음 기한</th><th className={th}>상태</th><th className={th}>미조치 지적</th></tr>}>
          {reg.flatMap((row) => row.rules.map((r, i) => (
            <tr key={`${row.equipment}-${r.rule.id}`} className={i === 0 ? 'border-t-2 border-slate-200' : ''}>
              <td className={td}>{i === 0 && <span className="font-semibold text-ink">{row.label}</span>}</td>
              <td className={td}>{r.rule.name}<p className="text-xs text-slate-500">{r.rule.law} · {r.rule.cycleMonths}개월 주기</p></td>
              <td className={td}>{r.last?.doneDate ?? <span className="text-slate-400">기록 없음</span>}</td>
              <td className={td}>{r.next?.dueDate ?? '—'}</td>
              <td className={td}><Badge tone={STATE_TONE[r.state]}>{r.state === 'none' ? '회차 없음' : STATE_LABEL[r.state]}</Badge></td>
              <td className={td}>{i === 0 ? (row.openFindings ? <span className="font-semibold text-red-600">{row.openFindings}건</span> : '0건') : ''}</td>
            </tr>
          )))}
        </Table>
      </Card>

      <Note>점검 주기·대상은 예시값입니다(법무 검토 전). 민원의 관련 설비는 글 속 단어로 추정한 것이라 '(추정)'으로 표시합니다. 설비별 고장·수리 이력과 부품 교체 기록은 작업지시 완료 기록이 쌓이면 이 화면에 붙일 예정입니다.</Note>
    </Page>
  );
}
