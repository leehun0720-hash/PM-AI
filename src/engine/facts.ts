// AI 비서용 사실(fact) 생성기. 모든 숫자는 여기(엔진)서 계산하고, LLM은 이 목록만 보고 설명한다.
import type { SeedData } from '../data/seed';
import type { ISODate, Settlement } from '../domain/types';
import { inspectionState, RULES } from './compliance';
import { capIntensity, emissions } from './emissions';
import { reorderSuggestions } from './inventory';
import { leaseEvents, walt } from './leaseEvents';
import { addMonths, monthRange } from './money';
import { defaultScenarios, runScenario } from './tariff';
import { matchInvoice } from './threeWay';

export interface Fact {
  id: string;
  topic: string;
  text: string;
  link: string; // 근거 화면 경로
  keywords: string[];
}

const w = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;

export function buildFacts(d: SeedData & { settlements: Settlement[] }, buildingId: string, today: ISODate): Fact[] {
  const b = d.buildings.find((x) => x.id === buildingId)!;
  const cur = d.seedMonth;
  const facts: Fact[] = [];
  let n = 0;
  const add = (topic: string, text: string, link: string, keywords: string[]) => facts.push({ id: `F${++n}`, topic, text: `[${b.name}] ${text}`, link, keywords });

  // 관리비: 전년 동월 대비 항목별 증감
  const sum = (m: string, item: string) => d.expenses.filter((e) => e.buildingId === buildingId && e.month === m && e.itemId === item).reduce((s, e) => s + e.amount, 0);
  const deltas = d.items.map((i) => ({ i, now: sum(cur, i.id), prev: sum(addMonths(cur, -12), i.id) })).filter((x) => x.now && x.prev).sort((a, c) => c.now - c.prev - (a.now - a.prev));
  const total = (m: string) => d.expenses.filter((e) => e.buildingId === buildingId && e.month === m).reduce((s, e) => s + e.amount, 0);
  add('관리비', `${cur} 관리비 지출 합계 ${w(total(cur))}, 전년 동월 ${w(total(addMonths(cur, -12)))}.`, '/charges', ['관리비', '합계', '총액', '전년']);
  deltas.slice(0, 3).forEach((x) => add('관리비', `${cur} ${x.i.name} ${w(x.now)} — 전년 동월 ${w(x.prev)} 대비 ${w(x.now - x.prev)} 증가 (${(((x.now / x.prev) - 1) * 100).toFixed(1)}%).`, '/charges', ['관리비', '오른', '증가', '원인', '항목', x.i.name]));
  const st = d.settlements.find((s) => s.buildingId === buildingId && s.month === cur);
  if (st) add('관리비', `${cur} 정산 상태 ${st.status}, 이상치 ${st.anomalies.length}건 중 미해소 ${st.anomalies.filter((a) => !a.resolved).length}건: ${st.anomalies.map((a) => a.title).join(' / ') || '없음'}.`, '/charges', ['정산', '이상치', '플래그', '중복']);

  // 임대차
  const leases = d.leases.filter((l) => l.buildingId === buildingId && l.status === 'active');
  add('임대차', `활성 임대차 ${leases.length}건, 월 임대료 합계 ${w(leases.reduce((s, l) => s + l.monthlyRent, 0))}, WALT ${walt(leases, today).toFixed(1)}년.`, '/leases', ['임대차', '임대료', 'walt', '렌트롤']);
  leaseEvents(leases, today, 180).slice(0, 6).forEach((e) => add('임대차', `${e.label}: ${e.date} (D-${e.dday}).`, '/leases', ['만기', '갱신', '인상', '임대차', '기한', '통지']));
  const units = d.units.filter((u) => u.buildingId === buildingId);
  const vacant = units.filter((u) => !leases.some((l) => l.unitId === u.id));
  add('임대차', `공실 ${vacant.length}개 호실 (${vacant.map((u) => u.name).join(', ') || '없음'}), 계약면적 기준 공실률 ${((vacant.reduce((s, u) => s + u.contractArea, 0) / units.reduce((s, u) => s + u.contractArea, 0)) * 100).toFixed(1)}%.`, '/leases', ['공실', '공실률']);

  // 외주
  const contracts = d.contracts.filter((c) => c.buildingId === buildingId);
  let recoverable = 0;
  for (const c of contracts) for (const inv of d.invoices.filter((i) => i.contractId === c.id && i.month === cur)) {
    const r = matchInvoice(inv, c, d.workRecords.find((x) => x.contractId === c.id && x.month === cur), d.invoices);
    recoverable += r.recoverable;
    if (r.findings.length) add('외주계약', `${c.vendor} ${cur} 인보이스 ${inv.number}: 청구 ${w(r.billed)}, 지급 적정액 ${w(r.payable)}, 과청구 의심 ${w(r.recoverable)} — ${r.findings.map((f) => f.title).join(' / ')}.`, '/vendors', ['외주', '인보이스', '과청구', '청구서', '회수', c.vendor]);
  }
  add('외주계약', `${cur} 외주 인보이스 과청구 의심 합계 ${w(recoverable)}.`, '/vendors', ['과청구', '회수', '외주', '합계']);

  // 수광열비
  const months = monthRange(cur, 12);
  const sc = defaultScenarios(b).map((s) => runScenario(b, months, s));
  add('수광열비', `최근 12개월 전기요금(예시 요금표) ${w(sc[0].annualTotal)}, 최대수요 ${Math.round(sc[0].annualPeakKw).toLocaleString()}kW, 계약전력 ${b.contractPowerKw.toLocaleString()}kW (이용률 ${((sc[0].annualPeakKw / b.contractPowerKw) * 100).toFixed(0)}%).`, '/utilities', ['전기', '전력', '피크', '계약전력', '요금']);
  const best = [...sc].sort((a, c) => a.annualTotal - c.annualTotal)[0];
  if (best.id !== 'current') add('수광열비', `요금 시나리오 중 '${best.name}'이 연 ${w(sc[0].annualTotal - best.annualTotal)} 절감으로 가장 유리(예시 요금표 기준).`, '/utilities', ['절감', '시나리오', '전기', '요금']);
  const em = emissions(b, d.energy.filter((e) => e.buildingId === buildingId).slice(-12));
  add('수광열비', `최근 12개월 탄소 배출 ${em.total.toFixed(0)} tCO2e (Scope1 ${em.scope1.toFixed(0)}, Scope2 ${em.scope2.toFixed(0)}), 원단위 ${em.intensity.toFixed(1)} kgCO2e/㎡ — 허용 원단위 예시 ${capIntensity(b.type, Number(today.slice(0, 4))).toFixed(1)}.`, '/utilities', ['탄소', '배출', 'esg', '총량제', '온실가스']);

  // 행정
  const insp = d.inspections.filter((i) => i.buildingId === buildingId && !i.doneDate);
  insp.filter((i) => ['overdue', 'due30'].includes(inspectionState(i, today))).forEach((i) => add('행정', `법정점검 '${RULES.find((r) => r.id === i.ruleId)?.name}' 기한 ${i.dueDate} (${inspectionState(i, today) === 'overdue' ? '기한 경과' : '30일 이내'}).`, '/admin', ['법정', '점검', '기한', '소방', '승강기']));
  add('행정', `미처리 민원 ${d.requests.filter((r) => r.buildingId === buildingId && r.status !== 'done').length}건.`, '/admin', ['민원']);

  // 회계
  const rc = d.receivables.filter((r) => r.buildingId === buildingId && r.paid < r.billed);
  add('회계', `미수금 ${w(rc.reduce((s, r) => s + r.billed - r.paid, 0))} (${rc.length}건): ${rc.map((r) => `${r.tenant} ${r.month} ${w(r.billed - r.paid)}`).join(' / ') || '없음'}.`, '/accounting', ['미수', '연체', '수납', '회계']);

  // 재고
  const stock = d.stock.filter((s) => s.buildingId === buildingId);
  const ro = reorderSuggestions(stock, d.stockMoves, today);
  add('수발주', `재주문 필요 품목 ${ro.length}개: ${ro.map((r) => `${stock.find((s) => s.id === r.itemId)!.name} ${r.suggestedQty}개`).join(', ') || '없음'}.`, '/inventory', ['재고', '발주', '자재', '수발주']);

  // 법무·관리단
  d.legalCases.filter((c) => c.buildingId === buildingId && c.status !== 'closed').forEach((c) => add('법무', `진행 중 사례 '${c.title}' (상대방 ${c.counterparty}, 다툼 금액 ${w(c.amount)}): ${c.summary}`, '/legal', ['법무', '분쟁', '사례', '소송']));
  d.meetings.filter((m) => m.buildingId === buildingId && !m.closed).forEach((m) => add('관리단', `${m.date} ${m.title} 예정, 안건 ${m.agendas.length}건: ${m.agendas.map((a) => a.title).join(' / ')}.`, '/association', ['관리단', '집회', '안건', '의결']));
  return facts;
}

/** LLM이 없을 때: 질문과 키워드가 겹치는 사실을 골라 그대로 보여 준다. */
export function selectFacts(question: string, facts: Fact[], max = 5): Fact[] {
  const q = question.toLowerCase();
  const scored = facts.map((f) => ({ f, score: f.keywords.filter((k) => q.includes(k.toLowerCase())).length + (q.includes(f.topic) ? 1 : 0) })).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  return scored.slice(0, max).map((x) => x.f);
}
