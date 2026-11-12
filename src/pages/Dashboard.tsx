import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AXIS, Badge, Card, ChartTip, Empty, GRID, Page, SERIES, Stat } from '../components/ui';
import { ROLE_LABEL } from '../domain/types';
import { inspectionState, RULES } from '../engine/compliance';
import { reorderSuggestions } from '../engine/inventory';
import { EVENT_LABEL, leaseEvents } from '../engine/leaseEvents';
import { monthRange, won, wonShort } from '../engine/money';
import { matchInvoice } from '../engine/threeWay';
import { today, useBuilding, useStore } from '../store/store';

export default function Dashboard() {
  const b = useBuilding();
  const s = useStore();
  const now = today();
  const cur = s.seedMonth;
  const staff = s.settings.role !== 'tenant' && s.settings.role !== 'owner';
  const months = monthRange(cur, 12);
  const trend = months.map((m) => ({ month: m.slice(2), 지출: s.expenses.filter((e) => e.buildingId === b.id && e.month === m).reduce((a, e) => a + e.amount, 0) }));
  const leases = s.leases.filter((l) => l.buildingId === b.id && l.status === 'active' && l.end >= now);
  const events = leaseEvents(leases, now, 180).slice(0, 5);
  const contracts = s.contracts.filter((c) => c.buildingId === b.id);
  const recoverable = s.invoices.filter((i) => i.month === cur && contracts.some((c) => c.id === i.contractId)).reduce((a, i) => { const c = contracts.find((x) => x.id === i.contractId)!; return a + matchInvoice(i, c, s.workRecords.find((w) => w.contractId === c.id && w.month === cur), s.invoices).recoverable; }, 0);
  const st = s.settlements.find((x) => x.buildingId === b.id && x.month === cur);
  const unpaid = s.receivables.filter((r) => r.buildingId === b.id && r.paid < r.billed).reduce((a, r) => a + r.billed - r.paid, 0);
  const overdue = s.receivables.filter((r) => r.buildingId === b.id && r.paid < r.billed && r.dueDate < now).reduce((a, r) => a + r.billed - r.paid, 0);
  const insp = s.inspections.filter((i) => i.buildingId === b.id && !i.doneDate).map((i) => ({ i, st: inspectionState(i, now) })).filter((x) => x.st === 'overdue' || x.st === 'due30');
  const pending = s.approvals.filter((a) => a.status === 'pending' && a.buildingId === b.id);
  const reorder = reorderSuggestions(s.stock.filter((x) => x.buildingId === b.id), s.stockMoves, now);
  const cases = s.legalCases.filter((c) => c.buildingId === b.id && c.status !== 'closed');

  const todo: { text: string; to: string; tone: 'red' | 'amber' | 'blue' }[] = [
    ...(!st ? [{ text: `${cur} 관리비 정산이 아직 실행되지 않았습니다`, to: '/charges', tone: 'amber' as const }] : st.anomalies.some((a) => !a.resolved) ? [{ text: `관리비 이상치 ${st.anomalies.filter((a) => !a.resolved).length}건 미해소 — 고지 차단 중`, to: '/charges', tone: 'red' as const }] : []),
    ...(recoverable ? [{ text: `외주 인보이스 과청구 의심 ${won(recoverable)}`, to: '/vendors', tone: 'red' as const }] : []),
    ...(pending.length ? [{ text: `승인 대기 ${pending.length}건`, to: '/approvals', tone: 'amber' as const }] : []),
    ...insp.map((x) => ({ text: `법정점검 ${RULES.find((r) => r.id === x.i.ruleId)?.name} — ${x.st === 'overdue' ? '기한 경과' : `기한 ${x.i.dueDate}`}`, to: '/admin', tone: x.st === 'overdue' ? 'red' as const : 'amber' as const })),
    ...(overdue ? [{ text: `관리비 연체(납기 경과) ${won(overdue)}`, to: '/accounting', tone: 'amber' as const }] : []),
    ...(reorder.length ? [{ text: `재주문 필요 자재 ${reorder.length}개 품목`, to: '/inventory', tone: 'blue' as const }] : []),
    ...cases.map((c) => ({ text: `법무 진행 중: ${c.title}`, to: '/legal', tone: 'blue' as const })),
  ];

  if (!staff) {
    return (
      <Page title={`${b.name}`} desc={`${ROLE_LABEL[s.settings.role]} 열람 포털입니다.`}>
        <Card title="바로가기"><div className="flex flex-wrap gap-3 text-sm"><Link className="text-brand-600 hover:underline" to="/charges">관리비 내역 보기</Link><Link className="text-brand-600 hover:underline" to="/ask">AI 비서에게 묻기</Link></div></Card>
      </Page>
    );
  }
  return (
    <Page title={b.name} desc={`${b.address} · 연면적 ${b.gfa.toLocaleString()}㎡ · ${b.completionYear}년 준공 · 정산 대상 월 ${cur}`}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={`${cur} 관리비 지출`} value={`${wonShort(trend[trend.length - 1].지출)}원`} sub={st ? `정산 ${st.status === 'approved' ? '승인 완료' : st.status === 'pending' ? '승인 대기' : '초안'}` : '정산 전'} />
        <Stat label="과청구 의심" value={won(recoverable)} tone={recoverable ? 'bad' : 'good'} sub="외주 인보이스 3-way 매칭" />
        <Stat label="미수금" value={won(unpaid)} tone={overdue ? 'warn' : 'default'} sub={`이 중 납기 경과 ${won(overdue)}`} />
        <Stat label="임대율" value={`${((leases.reduce((a, l) => a + (s.units.find((u) => u.id === l.unitId)?.contractArea ?? 0), 0) / s.units.filter((u) => u.buildingId === b.id).reduce((a, u) => a + u.contractArea, 0)) * 100).toFixed(1)}%`} sub={`활성 계약 ${leases.length}건`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
        <Card title="오늘 확인할 일" right={<Badge tone={todo.some((t) => t.tone === 'red') ? 'red' : 'gray'}>{todo.length}건</Badge>}>
          {todo.length === 0 ? <Empty>확인할 항목이 없습니다.</Empty> : (
            <ul className="divide-y divide-slate-100">
              {todo.map((t, i) => <li key={i}><Link to={t.to} className="flex items-center gap-3 py-2.5 text-sm hover:text-brand-600"><span className={`h-2 w-2 shrink-0 rounded-full ${{ red: 'bg-red-500', amber: 'bg-amber-500', blue: 'bg-brand-500' }[t.tone]}`} /><span className="flex-1">{t.text}</span><ArrowRight size={14} className="text-slate-400" /></Link></li>)}
            </ul>
          )}
        </Card>
        <Card title="임대차 이벤트 (180일)">
          {events.length === 0 ? <Empty>예정된 이벤트가 없습니다.</Empty> : <ul className="space-y-2.5">{events.map((e, i) => <li key={i} className="flex items-center gap-3 text-sm"><span className={`num w-14 shrink-0 font-semibold ${e.dday <= 30 ? 'text-red-600' : e.dday <= 90 ? 'text-amber-600' : 'text-slate-600'}`}>D-{e.dday}</span><span className="flex-1">{s.leases.find((l) => l.id === e.leaseId)?.tenant}<span className="block text-xs text-slate-500">{EVENT_LABEL[e.kind]} · {e.date}</span></span></li>)}</ul>}
        </Card>
      </div>
      <Card title="월별 관리비 지출 (최근 12개월, 원)">
        <div className="h-60">
          <ResponsiveContainer><BarChart data={trend} barCategoryGap="30%">
            <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="month" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} /><YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => wonShort(v)} width={52} />
            <Tooltip content={<ChartTip unit="원" />} cursor={{ fill: '#f1f5f9' }} /><Bar isAnimationActive={false} dataKey="지출" fill={SERIES[0]} radius={[4, 4, 0, 0]} />
          </BarChart></ResponsiveContainer>
        </div>
      </Card>
    </Page>
  );
}
