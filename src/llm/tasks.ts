// AI 작업. 각 작업은 제공자가 없거나 실패해도 규칙 기반으로 동작한다.
import type { AnalysisResult } from '../domain/ddr';
import type { Lease } from '../domain/types';
import { selectFacts, type Fact } from '../engine/facts';
import type { LawHit, LegalIssue } from '../engine/legal';
import { FALLBACK_VERSION, type LlmProvider } from './adapter';

export interface AiResult<T> {
  value: T;
  modelVersion: string;
  usedLlm: boolean;
}

// ── 임대차 계약서 추출 ─────────────────────────────────────
export interface LeaseDraft {
  tenant: string;
  industry: string;
  start: string;
  end: string;
  deposit: number;
  monthlyRent: number;
  mgmtFeeType: 'actual' | 'fixed';
  fixedMgmtFee: number;
  escalationType: 'fixed' | 'cpi' | 'negotiated';
  escalationRate: number;
  rentFreeMonths: number;
  renewalNoticeMonths: number;
  specialTerms: string;
  evidence: { field: string; confidence: number; source: string }[];
}

const LEASE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['tenant', 'industry', 'start', 'end', 'deposit', 'monthlyRent', 'mgmtFeeType', 'fixedMgmtFee', 'escalationType', 'escalationRate', 'rentFreeMonths', 'renewalNoticeMonths', 'specialTerms', 'evidence'],
  properties: {
    tenant: { type: 'string' }, industry: { type: 'string' },
    start: { type: 'string', description: 'YYYY-MM-DD' }, end: { type: 'string', description: 'YYYY-MM-DD' },
    deposit: { type: 'integer', description: '보증금(원)' }, monthlyRent: { type: 'integer', description: '월 임대료(원, 부가세 별도)' },
    mgmtFeeType: { type: 'string', enum: ['actual', 'fixed'] }, fixedMgmtFee: { type: 'integer', description: '정액 관리비(원). 실비면 0' },
    escalationType: { type: 'string', enum: ['fixed', 'cpi', 'negotiated'] }, escalationRate: { type: 'number', description: '정률 인상률(0.03 = 3%). 해당 없으면 0' },
    rentFreeMonths: { type: 'integer' }, renewalNoticeMonths: { type: 'integer' }, specialTerms: { type: 'string' },
    evidence: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['field', 'confidence', 'source'], properties: { field: { type: 'string' }, confidence: { type: 'number', description: '0~1' }, source: { type: 'string', description: '원문 조항 위치와 짧은 인용' } } } },
  },
};

const LEASE_SYSTEM = `한국 상업용 부동산 임대차계약서에서 필드를 추출한다.
- 금액은 원 단위 정수로 환산한다(예: "금 삼억 원" → 300000000).
- 계약서에 없는 값은 추측하지 말고 0 또는 빈 문자열로 두고, evidence에서 해당 필드의 confidence를 0.3 이하로 준다.
- evidence에는 tenant, deposit, monthlyRent, end, escalation, specialTerms 필드 각각의 근거 조항 위치와 신뢰도를 넣는다.`;

const num = (s: string | undefined) => (s ? Number(s.replace(/[^\d]/g, '')) : 0);

function unitWon(text: string, label: RegExp): number {
  const m = text.match(new RegExp(`${label.source}[^\\d]{0,20}([\\d,]+)\\s*(억|만)?\\s*원`));
  if (!m) return 0;
  return num(m[1]) * (m[2] === '억' ? 1e8 : m[2] === '만' ? 1e4 : 1);
}

/** 규칙 기반 추출(LLM 미사용). 정형 문구만 잡으므로 신뢰도를 낮게 매긴다. */
export function extractLeaseByRules(text: string): LeaseDraft {
  const dates = [...text.matchAll(/(\d{4})[.\-년]\s*(\d{1,2})[.\-월]\s*(\d{1,2})/g)].map((m) => `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`);
  const tenant = text.match(/임차인[^:：\n]*[:：]\s*([^\n,]+)/)?.[1]?.trim() ?? '';
  const rate = text.match(/(?:매년|연)\s*([\d.]+)\s*%/);
  const fixedFee = unitWon(text, /관리비/);
  const isFixed = /정액/.test(text) && fixedFee > 0;
  const conf = (ok: boolean) => (ok ? 0.6 : 0.2);
  const draft: LeaseDraft = {
    tenant, industry: '', start: dates[0] ?? '', end: dates[1] ?? '', deposit: unitWon(text, /보증금/), monthlyRent: unitWon(text, /(?:월\s*임대료|월\s*차임|차임)/),
    mgmtFeeType: isFixed ? 'fixed' : 'actual', fixedMgmtFee: isFixed ? fixedFee : 0,
    escalationType: /소비자물가|CPI/i.test(text) ? 'cpi' : rate ? 'fixed' : 'negotiated', escalationRate: rate ? Number(rate[1]) / 100 : 0,
    rentFreeMonths: num(text.match(/(?:렌트프리|무상\s*임대)[^\d]{0,12}(\d+)\s*개월/)?.[1]), renewalNoticeMonths: num(text.match(/만료\s*(\d+)\s*개월\s*전/)?.[1]) || 6,
    specialTerms: text.match(/특약[^\n]*\n?([^\n]+)/)?.[1]?.trim() ?? '', evidence: [],
  };
  draft.evidence = [
    { field: 'tenant', confidence: conf(!!draft.tenant), source: '규칙 매칭: "임차인:"' },
    { field: 'deposit', confidence: conf(draft.deposit > 0), source: '규칙 매칭: "보증금 … 원"' },
    { field: 'monthlyRent', confidence: conf(draft.monthlyRent > 0), source: '규칙 매칭: "월 임대료 … 원"' },
    { field: 'end', confidence: conf(!!draft.end), source: '규칙 매칭: 두 번째 날짜' },
    { field: 'escalation', confidence: conf(!!rate), source: '규칙 매칭: "매년 n%"' },
    { field: 'specialTerms', confidence: 0.3, source: '규칙 매칭: "특약" 다음 줄' },
  ];
  return draft;
}

export async function extractLease(p: LlmProvider | null, text: string): Promise<AiResult<LeaseDraft>> {
  if (!p) return { value: extractLeaseByRules(text), modelVersion: FALLBACK_VERSION, usedLlm: false };
  const value = await p.json<LeaseDraft>(LEASE_SYSTEM, `다음 계약서에서 필드를 추출하라.\n\n<contract>\n${text}\n</contract>`, LEASE_SCHEMA);
  return { value, modelVersion: p.modelVersion, usedLlm: true };
}

export function draftToLease(d: LeaseDraft, id: string, buildingId: string, unitId: string): Lease {
  return {
    id, buildingId, unitId, tenant: d.tenant || '(임차인 미확인)', industry: d.industry, start: d.start, end: d.end, deposit: d.deposit, monthlyRent: d.monthlyRent,
    mgmtFeeType: d.mgmtFeeType, fixedMgmtFee: d.fixedMgmtFee || undefined, escalation: { type: d.escalationType, rate: d.escalationRate || undefined },
    rentFreeMonths: d.rentFreeMonths, renewalNoticeMonths: d.renewalNoticeMonths, excludedItems: [], caps: [], specialTerms: d.specialTerms, status: 'review',
    evidence: Object.fromEntries(d.evidence.map((e) => [e.field, { confidence: e.confidence, source: e.source }])),
  };
}

// ── AI 비서 ─────────────────────────────────────
const ASK_SYSTEM = `당신은 부동산 PM/FM 운영 담당자를 돕는 AI 비서다.
<facts>에 있는 사실만 근거로 한국어로 답한다. 숫자는 사실에 적힌 값을 그대로 쓰고 새로 계산하거나 추정하지 않는다.
각 문장 끝에 근거 사실 번호를 [F3]처럼 붙인다. 사실만으로 답할 수 없으면 무엇이 없는지 말한다.
답은 결론부터 3~6문장으로 쓴다.`;

export interface Answer {
  text: string;
  facts: Fact[];
}

export async function ask(p: LlmProvider | null, question: string, facts: Fact[]): Promise<AiResult<Answer>> {
  if (!p) {
    const picked = selectFacts(question, facts);
    const text = picked.length
      ? `LLM이 연결되지 않아 엔진이 계산한 관련 사실을 그대로 보여 드립니다.\n\n${picked.map((f) => `• ${f.text} [${f.id}]`).join('\n')}`
      : '질문과 맞는 사실을 찾지 못했습니다. 관리비·임대차·수광열비·외주·회계·재고·법정점검 등의 단어를 넣어 다시 물어보세요.';
    return { value: { text, facts: picked }, modelVersion: FALLBACK_VERSION, usedLlm: false };
  }
  const text = await p.text(ASK_SYSTEM, `<facts>\n${facts.map((f) => `${f.id} (${f.topic}): ${f.text}`).join('\n')}\n</facts>\n\n질문: ${question}`);
  const cited = new Set([...text.matchAll(/\[(F\d+)\]/g)].map((m) => m[1]));
  return { value: { text, facts: facts.filter((f) => cited.has(f.id)) }, modelVersion: p.modelVersion, usedLlm: true };
}

// ── 법무 검토 메모 ─────────────────────────────────────
const LEGAL_SYSTEM = `당신은 부동산 관리회사 법무 담당자의 검토 메모 초안을 돕는다. 법률 자문이 아니라 담당자·변호사가 검토할 초안이다.
- <statutes>와 <search_results>에 있는 법령·판례만 언급한다. 목록에 없는 판례·사건번호·조문은 절대 만들어 내지 않는다.
- 판례의 판시 내용은 목록에 원문이 없으므로 단정하지 말고 "원문 확인 필요"라고 쓴다.
- 구성: ① 쟁점 정리 ② 확인할 사실관계 ③ 관련 조문과 검토 포인트 ④ 원문을 확인할 판례(검색 결과 중) ⑤ 다음 조치.
한국어로 간결하게 쓴다.`;

export async function legalMemo(p: LlmProvider | null, issue: LegalIssue, caseSummary: string, hits: LawHit[]): Promise<AiResult<string>> {
  const statutes = issue.statutes.map((s) => `${s.law} ${s.article}`);
  if (!p) {
    const text = [
      `① 쟁점: ${issue.name} — ${issue.desc}`,
      `② 사실관계: ${caseSummary || '(사례 내용을 입력하세요)'}`,
      `③ 확인할 조문:\n${statutes.map((s) => `   • ${s}`).join('\n')}`,
      `④ 원문을 확인할 판례: ${hits.length ? `\n${hits.slice(0, 5).map((h) => `   • ${h.title} (${h.sub}, ${h.date})`).join('\n')}` : '검색 결과 없음 — 판례 검색을 먼저 실행하세요.'}`,
      '⑤ 다음 조치: 조문·판례 원문 확인 후 변호사 검토를 거쳐 대응 방침을 정합니다.',
    ].join('\n');
    return { value: text, modelVersion: FALLBACK_VERSION, usedLlm: false };
  }
  const user = `<issue>${issue.name}: ${issue.desc}</issue>\n<case>${caseSummary}</case>\n<statutes>\n${statutes.join('\n')}\n</statutes>\n<search_results>\n${hits.slice(0, 15).map((h) => `${h.title} | ${h.sub} | ${h.date}`).join('\n') || '(없음)'}\n</search_results>`;
  return { value: await p.text(LEGAL_SYSTEM, user), modelVersion: p.modelVersion, usedLlm: true };
}

// ── 실사 리스크(DDR) ─────────────────────────────────────
const DDR_SYSTEM = `당신은 상업용 부동산 실사(DD) 분석가다. 재무(NOI 정규화·WALT·임차인 집중도), 물리(설비 잔존수명·즉시 수선비·SAC 1~4), 법률(SNDA·CAM 상한·해지 조항) 관점에서 위험을 정량화한다.
모든 금액은 원화(KRW) 정수, 모든 문장은 한국어. 각 위험에 확률·영향·신뢰도(1~5)와 권고를 붙인다.`;

const DDR_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['propertyName', 'summary', 'financial', 'physical', 'legal', 'risks'],
  properties: {
    propertyName: { type: 'string' }, summary: { type: 'string' },
    financial: { type: 'object', additionalProperties: false, required: ['normalizedNOI', 'nonRecurringAdjustment', 'marketManagementFeeImpact', 'walt', 'tenantConcentration'], properties: { normalizedNOI: { type: 'number' }, nonRecurringAdjustment: { type: 'number' }, marketManagementFeeImpact: { type: 'number' }, walt: { type: 'number' }, tenantConcentration: { type: 'number' } } },
    physical: { type: 'object', additionalProperties: false, required: ['hvacRUL', 'roofRUL', 'immediateCostToCure', 'sacScore'], properties: { hvacRUL: { type: 'number' }, roofRUL: { type: 'number' }, immediateCostToCure: { type: 'number' }, sacScore: { type: 'number' } } },
    legal: { type: 'object', additionalProperties: false, required: ['sndaFlag', 'camCapRisk', 'terminationRisk'], properties: { sndaFlag: { type: 'boolean' }, camCapRisk: { type: 'string', enum: ['High', 'Low', 'None'] }, terminationRisk: { type: 'boolean' } } },
    risks: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'type', 'description', 'probability', 'impact', 'confidence', 'recommendation'], properties: { id: { type: 'string' }, type: { type: 'string', enum: ['Financial', 'Physical', 'Legal'] }, description: { type: 'string' }, probability: { type: 'number' }, impact: { type: 'number' }, confidence: { type: 'number' }, recommendation: { type: 'string' } } } },
  },
};

export const DDR_SAMPLE: AnalysisResult = {
  propertyName: '테헤란 밸리 타워 A (고정 샘플)',
  summary: 'LLM이 연결되지 않아 고정 샘플 결과를 표시합니다. 실제 분석이 아닙니다.\n정규화 NOI는 비반복 수익 제거 후 하향 조정되며, 공조 설비 잔존수명이 짧아 단기 CapEx 반영이 필요합니다. 주요 임차인 1곳의 SNDA 미체결이 금융 조달 시 쟁점이 될 수 있습니다.',
  financial: { normalizedNOI: 11_800_000_000, nonRecurringAdjustment: 420_000_000, marketManagementFeeImpact: 180_000_000, walt: 3.4, tenantConcentration: 38 },
  physical: { hvacRUL: 3, roofRUL: 9, immediateCostToCure: 1_250_000_000, sacScore: 2 },
  legal: { sndaFlag: false, camCapRisk: 'High', terminationRisk: true },
  risks: [
    { id: 'F-01', type: 'Financial', description: '상위 임차인 1곳이 임대수익의 38%를 차지', probability: 3, impact: 5, confidence: 4, recommendation: '만기 분산과 갱신 조건 사전 협의' },
    { id: 'F-02', type: 'Financial', description: '일회성 해지 위약금 수익이 T12 NOI에 포함', probability: 5, impact: 3, confidence: 5, recommendation: 'NOI 정규화 후 가격 재산정' },
    { id: 'P-01', type: 'Physical', description: '냉동기·공조기 잔존수명 3년 이내', probability: 4, impact: 4, confidence: 4, recommendation: '교체 비용을 매매가 조정 또는 에스크로로 반영' },
    { id: 'L-01', type: 'Legal', description: '주요 임차인 SNDA 미체결', probability: 3, impact: 4, confidence: 3, recommendation: '거래 종결 선행조건으로 SNDA 확보' },
    { id: 'L-02', type: 'Legal', description: '일부 계약에 관리비 인상 상한(CAM cap) 조항', probability: 4, impact: 2, confidence: 4, recommendation: '운영비 상승 시 소유자 부담분 시뮬레이션' },
  ],
};

export async function analyzeDueDiligence(p: LlmProvider | null, fileNames: string[]): Promise<AiResult<AnalysisResult>> {
  if (!p) return { value: DDR_SAMPLE, modelVersion: FALLBACK_VERSION, usedLlm: false };
  const user = `업로드된 파일명: ${fileNames.join(', ')}.\n파일 본문은 전달되지 않았다. 서울 강남권 A급 오피스의 전형적 시나리오를 가정한 시뮬레이션 보고서를 만들고, summary 첫 문장에 "파일명만으로 만든 가정 기반 시뮬레이션"임을 밝혀라.`;
  return { value: await p.json<AnalysisResult>(DDR_SYSTEM, user, DDR_SCHEMA), modelVersion: p.modelVersion, usedLlm: true };
}
