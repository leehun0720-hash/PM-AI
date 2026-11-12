// PMAI 자산 온톨로지
// Portfolio → Building → Unit → Lease / Vendor → Contract → WorkRecord → Invoice / Meter → Reading → Charge
// 모든 금액은 원 단위 정수.

export type Month = string; // 'YYYY-MM'
export type ISODate = string; // 'YYYY-MM-DD'

export type Role = 'amc' | 'pm' | 'fm' | 'tenant' | 'owner';

export const ROLE_LABEL: Record<Role, string> = {
  amc: '운용사',
  pm: 'PM사',
  fm: 'FM사',
  tenant: '임차인',
  owner: '소유자',
};

export type Region = 'seoul' | 'metro' | 'city' | 'other';

export interface Building {
  id: string;
  name: string;
  type: 'office' | 'logistics' | 'retail';
  address: string;
  region: Region;
  gfa: number; // 연면적 ㎡
  floors: number;
  completionYear: number;
  contractPowerKw: number;
  equipment: Equipment[];
}

export type Equipment = 'elevator' | 'boiler' | 'gas' | 'waterTank' | 'substation' | 'sprinkler' | 'hvac';

export interface Unit {
  id: string;
  buildingId: string;
  floor: string;
  name: string;
  exclusiveArea: number; // 전용면적 ㎡
  contractArea: number; // 계약면적 ㎡
}

export interface FieldEvidence {
  confidence: number; // 0~1
  source: string; // 원문 위치 (예: "p.2 제4조")
}

export interface Lease {
  id: string;
  buildingId: string;
  unitId: string;
  tenant: string;
  industry: string;
  start: ISODate;
  end: ISODate;
  deposit: number;
  monthlyRent: number;
  mgmtFeeType: 'actual' | 'fixed'; // 실비 / 정액
  fixedMgmtFee?: number;
  escalation: { type: 'fixed' | 'cpi' | 'negotiated'; rate?: number };
  rentFreeMonths: number;
  renewalNoticeMonths: number;
  excludedItems: string[]; // 특약: 부담 제외 관리비 항목
  caps: { itemId: string; monthlyCap: number }[]; // 특약: 항목별 월 상한
  specialTerms: string;
  status: 'active' | 'review';
  evidence: Record<string, FieldEvidence>;
}

export type AllocBy = 'exclusiveArea' | 'contractArea' | 'usage' | 'equal';

export interface AllocComponent {
  by: AllocBy;
  meter?: MeterType;
  ratio: number; // 합계 1
}

export interface ChargeItem {
  id: string;
  name: string;
  category: 'common' | 'utility' | 'reserve';
  components: AllocComponent[];
  vat: boolean;
  ownerOnly?: boolean; // 소유자 부담 항목 (예: 장기수선충당금)
  accounts: string[]; // 이 항목으로 매핑되는 회계 계정
}

export interface Expense {
  id: string;
  buildingId: string;
  month: Month;
  itemId: string;
  account: string;
  vendor: string;
  amount: number;
  memo: string;
  invoiceId?: string;
}

export type MeterType = 'electric' | 'water';

export interface MeterReading {
  unitId: string;
  month: Month;
  type: MeterType;
  usage: number;
}

// ── 관리비 정산 결과 ─────────────────────────────────────────
export interface ChargeLine {
  unitId: string;
  itemId: string;
  payer: 'tenant' | 'owner';
  payerName: string;
  amount: number;
  vat: number;
  reason: string; // 부담 주체 판정 사유
  trace: string[]; // 계산 근거 (사람이 읽는 단계별 설명)
  sourceExpenseIds: string[];
}

export type AnomalyKind = 'mom' | 'yoy' | 'duplicate' | 'misclass' | 'allocShift';

export interface Anomaly {
  id: string;
  kind: AnomalyKind;
  severity: 'high' | 'medium';
  title: string;
  why: string;
  itemId?: string;
  expenseIds: string[];
  amount: number;
  resolved: boolean;
  resolution?: string;
  resolvedBy?: string;
}

export type ApprovalStatus = 'draft' | 'pending' | 'approved' | 'rejected';

export interface Settlement {
  id: string;
  buildingId: string;
  month: Month;
  status: ApprovalStatus;
  ruleVersion: string;
  inputHash: string;
  createdAt: string;
  poolTotal: number;
  lines: ChargeLine[];
  anomalies: Anomaly[];
}

// ── 외주·인보이스 ─────────────────────────────────────────
export interface ContractItem {
  code: string;
  desc: string;
  unit: string;
  qty: number;
  unitPrice: number;
}

export interface VendorContract {
  id: string;
  buildingId: string;
  vendor: string;
  service: string;
  start: ISODate;
  end: ISODate;
  items: ContractItem[];
  slaResponseMin: number; // 응답 시간 SLA(분)
  chargeItemId: string;
}

export interface WorkRecord {
  contractId: string;
  month: Month;
  performed: Record<string, number>; // code → 실제 수행 수량
  avgResponseMin: number;
  incidents: number;
}

export interface InvoiceLine {
  code: string;
  desc: string;
  qty: number;
  unitPrice: number;
  amount: number;
}

export interface Invoice {
  id: string;
  contractId: string;
  month: Month;
  number: string;
  issuedAt: ISODate;
  lines: InvoiceLine[];
  total: number;
  status: ApprovalStatus;
}

export type FindingKind = 'unitPrice' | 'unperformed' | 'overScope' | 'arithmetic' | 'duplicate' | 'unknownItem';

export interface Finding {
  kind: FindingKind;
  code?: string;
  title: string;
  why: string;
  recoverable: number;
}

export interface MatchResult {
  invoiceId: string;
  billed: number;
  payable: number;
  recoverable: number;
  findings: Finding[];
}

// ── 에너지·ESG ─────────────────────────────────────────
export interface EnergyMonth {
  buildingId: string;
  month: Month;
  electricKwh: number;
  peakKw: number;
  gasM3: number;
  waterM3: number;
}

// ── 법정점검 ─────────────────────────────────────────
export interface InspectionFinding {
  text: string;
  done: boolean;
}

export interface Inspection {
  id: string;
  buildingId: string;
  ruleId: string;
  dueDate: ISODate;
  doneDate?: ISODate;
  evidence?: string;
  findings: InspectionFinding[];
}

// ── 승인·감사 ─────────────────────────────────────────
export type AutonomyLevel = 'L0' | 'L1' | 'L2' | 'L3';

export interface Approval {
  id: string;
  kind: 'settlement' | 'payment' | 'lease' | 'purchase';
  targetId: string;
  buildingId: string;
  title: string;
  amount: number;
  level: AutonomyLevel;
  status: ApprovalStatus;
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  comment?: string;
}

export interface AuditEvent {
  id: string;
  at: string;
  actor: string;
  role: Role;
  action: string;
  target: string;
  detail: string;
  ruleVersion?: string;
  modelVersion?: string;
  inputHash?: string;
}

// ── 관리단 ─────────────────────────────────────────
export interface Owner {
  id: string;
  buildingId: string;
  name: string;
  unitIds: string[];
}

export type AgendaKind = 'ordinary' | 'bylaw' | 'manager';
export type Vote = 'yes' | 'no' | 'abstain';

export interface Agenda {
  id: string;
  title: string;
  kind: AgendaKind;
  votes: Record<string, Vote>; // ownerId → 표결
}

export interface Meeting {
  id: string;
  buildingId: string;
  date: ISODate;
  title: string;
  type: 'regular' | 'special';
  agendas: Agenda[];
  closed: boolean;
}

// ── 행정(민원) ─────────────────────────────────────────
export interface CivilRequest {
  id: string;
  buildingId: string;
  receivedAt: ISODate;
  channel: '전화' | '방문' | '앱' | 'AI 콜센터';
  requester: string;
  category: '시설' | '청소' | '주차' | '관리비' | '소음' | '기타';
  text: string;
  status: 'open' | 'assigned' | 'done';
  assignee?: string;
  dueDate: ISODate;
}

// ── 법무 ─────────────────────────────────────────
export interface LegalCase {
  id: string;
  buildingId: string;
  title: string;
  issueId: string;
  status: 'open' | 'negotiating' | 'closed';
  openedAt: ISODate;
  counterparty: string;
  amount: number;
  summary: string;
  outcome?: string;
}

// ── 회계 ─────────────────────────────────────────
export interface Receivable {
  id: string;
  buildingId: string;
  month: Month;
  unitId: string;
  tenant: string;
  billed: number;
  paid: number;
  dueDate: ISODate;
  paidDate?: ISODate;
}

export interface Budget {
  buildingId: string;
  year: number;
  itemId: string;
  amount: number;
}

// ── 수발주·재고 ─────────────────────────────────────────
export interface StockItem {
  id: string;
  buildingId: string;
  name: string;
  category: '소모품' | '전기자재' | '설비자재' | '소방자재' | '청소용품';
  unit: string;
  qty: number;
  safetyQty: number;
  unitPrice: number;
  vendor: string;
}

export interface StockMove {
  id: string;
  itemId: string;
  date: ISODate;
  type: 'in' | 'out';
  qty: number;
  memo: string;
}

export interface PurchaseOrder {
  id: string;
  buildingId: string;
  vendor: string;
  createdAt: ISODate;
  lines: { itemId: string; qty: number; unitPrice: number }[];
  total: number;
  status: ApprovalStatus | 'received';
}
