import type { Finding, Invoice, MatchResult, VendorContract, WorkRecord } from '../domain/types';

const w = (n: number) => `${n.toLocaleString('ko-KR')}원`;

/**
 * 3-way 매칭: 계약(약정) ↔ 작업 실적 ↔ 인보이스.
 * 지급 적정액 = Σ min(청구 수량, 실적 수량, 계약 수량) × 계약 단가
 */
export function matchInvoice(invoice: Invoice, contract: VendorContract, work: WorkRecord | undefined, others: Invoice[]): MatchResult {
  const findings: Finding[] = [];
  let payable = 0;

  for (const line of invoice.lines) {
    const ci = contract.items.find((i) => i.code === line.code);
    if (!ci) {
      findings.push({ kind: 'unknownItem', code: line.code, title: `계약에 없는 항목: ${line.desc}`, why: `문서 불일치: 계약서에 '${line.code}' 항목이 없습니다. 별도 작업지시·승인 근거를 확인하세요.`, recoverable: line.amount });
      continue;
    }
    const performed = work?.performed[line.code];
    const okQty = Math.min(line.qty, ci.qty, performed ?? line.qty);
    payable += okQty * ci.unitPrice;

    if (line.amount !== line.qty * line.unitPrice) {
      findings.push({ kind: 'arithmetic', code: line.code, title: `계산 오류: ${line.desc}`, why: `수량 ${line.qty} × 단가 ${w(line.unitPrice)} = ${w(line.qty * line.unitPrice)}인데 청구액은 ${w(line.amount)}입니다.`, recoverable: Math.max(0, line.amount - line.qty * line.unitPrice) });
    }
    if (line.unitPrice !== ci.unitPrice) {
      findings.push({ kind: 'unitPrice', code: line.code, title: `단가 불일치: ${line.desc}`, why: `규칙 위반: 계약 단가 ${w(ci.unitPrice)}, 청구 단가 ${w(line.unitPrice)} (차이 ${w(line.unitPrice - ci.unitPrice)} × ${line.qty}${ci.unit}).`, recoverable: Math.max(0, (line.unitPrice - ci.unitPrice) * line.qty) });
    }
    if (performed !== undefined && line.qty > performed) {
      findings.push({ kind: 'unperformed', code: line.code, title: `미수행분 청구: ${line.desc}`, why: `문서 불일치: 청구 ${line.qty}${ci.unit}, 작업 실적 ${performed}${ci.unit}. 초과 ${line.qty - performed}${ci.unit} × 계약 단가 ${w(ci.unitPrice)}.`, recoverable: (line.qty - performed) * ci.unitPrice });
    } else if (line.qty > ci.qty) {
      findings.push({ kind: 'overScope', code: line.code, title: `계약 수량 초과: ${line.desc}`, why: `규칙 위반: 계약 ${ci.qty}${ci.unit}, 청구 ${line.qty}${ci.unit}. 추가 투입에 대한 사전 승인 근거가 필요합니다.`, recoverable: (line.qty - ci.qty) * ci.unitPrice });
    }
  }

  const dup = others.find((o) => o.id !== invoice.id && o.contractId === invoice.contractId && o.month === invoice.month && o.total === invoice.total && o.id < invoice.id);
  if (dup) {
    findings.push({ kind: 'duplicate', title: '중복 인보이스', why: `문서 불일치: 같은 계약·같은 월·같은 금액의 인보이스 ${dup.number}가 이미 있습니다.`, recoverable: invoice.total });
    payable = 0;
  }

  const billed = invoice.total;
  payable = Math.min(payable, billed);
  return { invoiceId: invoice.id, billed, payable, recoverable: billed - payable, findings };
}

export interface VendorScore {
  contractId: string;
  slaCompliance: number; // SLA 준수 월 비율
  avgResponseMin: number;
  billingAccuracy: number; // 지적 없는 인보이스 비율
  incidents: number;
  score: number; // 0~100
}

export function scoreVendor(contract: VendorContract, works: WorkRecord[], results: MatchResult[]): VendorScore {
  const n = works.length || 1;
  const slaCompliance = works.filter((x) => x.avgResponseMin <= contract.slaResponseMin).length / n;
  const avgResponseMin = works.reduce((s, x) => s + x.avgResponseMin, 0) / n;
  const billingAccuracy = results.length ? results.filter((r) => r.findings.length === 0).length / results.length : 1;
  const incidents = works.reduce((s, x) => s + x.incidents, 0);
  const score = Math.round(Math.max(0, 50 * slaCompliance + 40 * billingAccuracy + 10 - Math.min(10, incidents * 2)));
  return { contractId: contract.id, slaCompliance, avgResponseMin, billingAccuracy, incidents, score };
}
