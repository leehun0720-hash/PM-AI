import { Printer } from 'lucide-react';
import { Btn, Note, Page, SampleTag } from '../../components/ui';
import { detectExpenseAnomalies } from '../../engine/anomaly';
import { inspectionState, RULES } from '../../engine/compliance';
import { leaseEvents } from '../../engine/leaseEvents';
import { pct, won, wonShort } from '../../engine/money';
import { buildingKpi, isActive, PORTFOLIO_VERSION, tenantRows } from '../../engine/portfolio';
import { matchInvoice } from '../../engine/threeWay';
import { today, useBuilding, useStore } from '../../store/store';

/** AM — 월간 자산 운영 보고 초안. 숫자는 엔진 계산, 문장은 규칙으로 만든다(AI 미사용). */
export default function InvestorReport() {
  const b = useBuilding();
  const s = useStore();
  const now = today();
  const month = s.seedMonth;
  const lines = s.computeLines(b.id, month);
  const k = buildingKpi({ building: b, units: s.units, leases: s.leases, items: s.items, lines, receivables: s.receivables, budgets: s.budgets, expenses: s.expenses, month, today: now });
  const leases = s.leases.filter((l) => l.buildingId === b.id && isActive(l, now));
  const rows = tenantRows(leases, s.units, now);
  const expiring = rows.filter((r) => r.monthsLeft <= 12);
  const events = leaseEvents(leases, now, 60);
  const anomalies = (s.settlements.find((x) => x.buildingId === b.id && x.month === month)?.anomalies ?? detectExpenseAnomalies(month, s.expenses.filter((e) => e.buildingId === b.id), s.items)).filter((a) => !a.resolved);
  const contracts = s.contracts.filter((c) => c.buildingId === b.id);
  const matches = s.invoices.filter((i) => i.month === month && contracts.some((c) => c.id === i.contractId)).map((i) => {
    const c = contracts.find((x) => x.id === i.contractId)!;
    return { c, m: matchInvoice(i, c, s.workRecords.find((w) => w.contractId === c.id && w.month === month), s.invoices) };
  });
  const recoverable = matches.reduce((a, x) => a + x.m.recoverable, 0);
  const late = s.inspections.filter((i) => i.buildingId === b.id && !i.doneDate && inspectionState(i, now) === 'overdue');
  const cases = s.legalCases.filter((c) => c.buildingId === b.id && c.status !== 'closed');
  const ruleName = (id: string) => RULES.find((r) => r.id === id)?.name ?? id;

  const Section = ({ n, title, children }: { n: number; title: string; children: React.ReactNode }) => (
    <section className="break-inside-avoid">
      <h2 className="mb-2 text-base font-bold text-ink">{n}. {title}</h2>
      <div className="space-y-1.5 text-sm leading-relaxed text-slate-700">{children}</div>
    </section>
  );
  const Li = ({ children }: { children: React.ReactNode }) => <p className="pl-3 -indent-3">· {children}</p>;

  return (
    <Page title="투자자 보고" desc="자산별 월간 운영 보고 초안입니다. 숫자는 엔진이 계산했고 문장은 규칙으로 만들었습니다. 검토 후 인쇄하거나 PDF로 저장하세요."
      actions={<><SampleTag /><Btn onClick={() => window.print()}><Printer size={15} />인쇄</Btn></>}>
      <article className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
        <header className="border-b border-slate-200 pb-4">
          <p className="text-xs font-semibold tracking-wide text-slate-500">월간 자산 운영 보고 · {month}</p>
          <h1 className="mt-1 text-2xl font-bold text-ink">{b.name}</h1>
          <p className="mt-1 text-xs text-slate-500">{b.address} · 연면적 {b.gfa.toLocaleString('ko-KR')}㎡ · 작성 {now} · 산식 {PORTFOLIO_VERSION}</p>
        </header>

        <Section n={1} title="요약">
          <Li>임대율 <b>{pct(k.occupancy)}</b>(계약면적 {Math.round(k.leasedArea).toLocaleString('ko-KR')}/{Math.round(k.rentableArea).toLocaleString('ko-KR')}㎡), WALT <b>{k.waltYears.toFixed(1)}년</b>.</Li>
          <Li>월 실수령 임대료 <b>{won(k.effectiveRent)}</b>, 소유자 부담 운영비 {won(k.ownerOpex)}, 월 NOI <b>{won(k.noi)}</b>(연환산 {wonShort(k.noi * 12)}). 충당금 적립 {won(k.ownerReserve)}은 NOI 아래 별도.</Li>
          {k.contractRent !== k.effectiveRent && <Li>렌트프리로 약정 대비 {won(k.contractRent - k.effectiveRent)}이 덜 들어오고 있습니다.</Li>}
          <Li>관리비 미수 {won(k.receivable)} 중 납기가 지난 연체 <b className={k.overdue ? 'text-red-600' : ''}>{won(k.overdue)}</b>.</Li>
          {k.budgetUse !== null && <Li>연간 운영비 예산 집행률 {pct(k.budgetUse, 0)}(경과 기준 {pct(k.budgetPace, 0)}){k.budgetUse > k.budgetPace + 0.05 ? ' — 기준보다 빠르게 집행 중입니다.' : '.'}</Li>}
        </Section>

        <Section n={2} title="임대 현황">
          {expiring.length === 0 ? <Li>12개월 안에 만기가 오는 계약은 없습니다.</Li> : expiring.map((r) => (
            <Li key={r.lease.id}>{r.lease.tenant}({r.unit?.name}) {r.lease.end} 만기, 월 {wonShort(r.lease.monthlyRent)} — 갱신 통지 기한 {r.noticeDate}{r.flags.includes('갱신 통지 기한 지남') ? '(지남)' : ''}.</Li>
          ))}
          {k.vacantUnits.map((u) => <Li key={u.id}>공실 {u.name}({u.contractArea.toLocaleString('ko-KR')}㎡) — 평균 단가 기준 기대 월 임대료 {wonShort(k.avgRentPerSqm * u.contractArea)}.</Li>)}
        </Section>

        <Section n={3} title="운영·비용">
          {anomalies.length === 0 ? <Li>{month} 관리비 지출에서 미해결 이상치는 없습니다.</Li> : anomalies.slice(0, 5).map((a) => <Li key={a.id}>[{a.severity === 'high' ? '높음' : '보통'}] {a.title} — {a.why}</Li>)}
          {recoverable > 0 ? <Li>외주 청구서 3-way 검증에서 과청구 의심 <b className="text-red-600">{won(recoverable)}</b>({matches.filter((x) => x.m.recoverable > 0).map((x) => x.c.vendor).join(', ')}).</Li> : <Li>외주 청구서에서 과청구 의심 금액은 없습니다.</Li>}
        </Section>

        <Section n={4} title="리스크">
          {late.length === 0 ? <Li>기한이 지난 법정점검은 없습니다.</Li> : late.map((i) => <Li key={i.id}>법정점검 기한 경과: {ruleName(i.ruleId)}(기한 {i.dueDate}).</Li>)}
          {cases.length === 0 ? <Li>진행 중인 법무 건은 없습니다.</Li> : cases.map((c) => <Li key={c.id}>법무 진행: {c.title} — 상대방 {c.counterparty}, 관련 금액 {won(c.amount)}.</Li>)}
        </Section>

        <Section n={5} title="앞으로 60일 일정">
          {events.length === 0 ? <Li>예정된 임대차 일정이 없습니다.</Li> : events.map((e) => <Li key={`${e.leaseId}-${e.kind}`}>{e.date} {e.label} (D-{e.dday})</Li>)}
        </Section>
      </article>
      <Note>이 보고서는 샘플 데이터로 만든 초안입니다. 대외 발송 전 담당 AM이 숫자와 문장을 확인하고 승인해야 합니다.</Note>
    </Page>
  );
}
