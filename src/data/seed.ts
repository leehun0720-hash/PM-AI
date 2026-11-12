// 샘플 데이터: 가상 건물 2개. 실제 건물·임차인·거래처가 아니다.
// 검증 기능 시연을 위해 의도된 오류(중복 청구, 계정 오분류, 과청구 등)를 포함한다.
import type {
  Budget, Building, ChargeItem, CivilRequest, EnergyMonth, Expense, Inspection, Invoice, ISODate, Lease, LegalCase, Meeting,
  MeterReading, Month, Owner, PurchaseOrder, Receivable, StockItem, StockMove, Unit, VendorContract, WorkRecord,
} from '../domain/types';
import { activeLease, allocate } from '../engine/allocation';
import { applicableRules } from '../engine/compliance';
import { addMonths, addMonthsToDate, monthRange, seededRandom } from '../engine/money';
import { summarizeMonth } from '../engine/tariff';

export const CHARGE_ITEMS: ChargeItem[] = [
  { id: 'CLEAN', name: '청소용역비', category: 'common', components: [{ by: 'contractArea', ratio: 1 }], vat: true, accounts: ['용역비-청소'] },
  { id: 'SECURITY', name: '경비용역비', category: 'common', components: [{ by: 'contractArea', ratio: 1 }], vat: true, accounts: ['용역비-경비'] },
  { id: 'FACILITY', name: '시설관리용역비', category: 'common', components: [{ by: 'contractArea', ratio: 1 }], vat: true, accounts: ['용역비-시설'] },
  { id: 'ELEV', name: '승강기유지비', category: 'common', components: [{ by: 'contractArea', ratio: 1 }], vat: true, accounts: ['수선유지비-승강기'] },
  { id: 'REPAIR', name: '수선유지비', category: 'common', components: [{ by: 'contractArea', ratio: 1 }], vat: true, accounts: ['수선유지비'] },
  { id: 'SUPPLY', name: '소모품비', category: 'common', components: [{ by: 'contractArea', ratio: 1 }], vat: true, accounts: ['소모품비'] },
  { id: 'INSUR', name: '화재보험료', category: 'common', components: [{ by: 'exclusiveArea', ratio: 1 }], vat: false, accounts: ['보험료'] },
  { id: 'COMMON_ELEC', name: '공용전기료', category: 'utility', components: [{ by: 'contractArea', ratio: 0.5 }, { by: 'usage', meter: 'electric', ratio: 0.5 }], vat: true, accounts: ['수도광열비-전기'] },
  { id: 'UNIT_ELEC', name: '전용전기료', category: 'utility', components: [{ by: 'usage', meter: 'electric', ratio: 1 }], vat: true, accounts: ['수도광열비-전기'] },
  { id: 'WATER', name: '수도료', category: 'utility', components: [{ by: 'usage', meter: 'water', ratio: 1 }], vat: false, accounts: ['수도광열비-수도'] },
  { id: 'GAS', name: '가스료(난방)', category: 'utility', components: [{ by: 'contractArea', ratio: 1 }], vat: true, accounts: ['수도광열비-가스'] },
  { id: 'RESERVE', name: '장기수선충당금', category: 'reserve', components: [{ by: 'exclusiveArea', ratio: 1 }], vat: false, ownerOnly: true, accounts: ['장기수선충당금'] },
];

export interface SeedData {
  seedMonth: Month;
  buildings: Building[];
  units: Unit[];
  owners: Owner[];
  leases: Lease[];
  items: ChargeItem[];
  expenses: Expense[];
  readings: MeterReading[];
  contracts: VendorContract[];
  workRecords: WorkRecord[];
  invoices: Invoice[];
  energy: EnergyMonth[];
  inspections: Inspection[];
  meetings: Meeting[];
  requests: CivilRequest[];
  legalCases: LegalCase[];
  receivables: Receivable[];
  budgets: Budget[];
  stock: StockItem[];
  stockMoves: StockMove[];
  purchaseOrders: PurchaseOrder[];
}

const ev = (c: number, source: string) => ({ confidence: c, source });

export function ownerMap(owners: Owner[]): Record<string, string> {
  const m: Record<string, string> = {};
  for (const o of owners) for (const u of o.unitIds) m[u] = o.name;
  return m;
}

export function buildSeed(today: ISODate): SeedData {
  const cur = addMonths(today.slice(0, 7), -1); // 직전 월이 정산 대상
  const months = monthRange(cur, 24);
  const rel = (m: number, day = 1) => addMonthsToDate(`${today.slice(0, 8)}${String(day).padStart(2, '0')}`, m);

  const buildings: Building[] = [
    { id: 'A', name: '강남 A타워', type: 'office', address: '서울특별시 강남구 (샘플)', region: 'seoul', gfa: 32000, floors: 18, completionYear: 2009, contractPowerKw: 2400, equipment: ['elevator', 'boiler', 'gas', 'waterTank', 'substation', 'sprinkler', 'hvac'] },
    { id: 'B', name: '이천 B물류센터', type: 'logistics', address: '경기도 이천시 (샘플)', region: 'other', gfa: 54000, floors: 4, completionYear: 2019, contractPowerKw: 1800, equipment: ['elevator', 'substation', 'sprinkler', 'waterTank'] },
  ];

  const U = (b: string, n: number, floor: string, name: string, ex: number, ct: number): Unit => ({ id: `${b}-${String(n).padStart(2, '0')}`, buildingId: b, floor, name, exclusiveArea: ex, contractArea: ct });
  const units: Unit[] = [
    U('A', 1, '1F', '101호', 420, 780), U('A', 2, '2F', '201호', 1650, 2980), U('A', 3, '3-5F', '301호', 4950, 8940), U('A', 4, '6-8F', '601호', 4950, 8940),
    U('A', 5, '9-10F', '901호', 3300, 5960), U('A', 6, '11-12F', '1101호', 3300, 5960), U('A', 7, '13-15F', '1301호', 4950, 8940), U('A', 8, '16-18F', '1601호', 4950, 8940),
    U('B', 1, '1F', 'A동 1층', 11800, 13200), U('B', 2, '2F', 'A동 2층', 11800, 13200), U('B', 3, '3F', 'A동 3층', 11800, 13200), U('B', 4, '4F', 'A동 4층', 9600, 10800), U('B', 5, '1F', '지원동', 2900, 3600),
  ];

  const owners: Owner[] = [
    { id: 'OW1', buildingId: 'A', name: '케이리츠 제1호', unitIds: ['A-03', 'A-04', 'A-05'] },
    { id: 'OW2', buildingId: 'A', name: '한빛자산운용 펀드', unitIds: ['A-07', 'A-08'] },
    { id: 'OW3', buildingId: 'A', name: '(주)대성홀딩스', unitIds: ['A-06'] },
    { id: 'OW4', buildingId: 'A', name: '김○○', unitIds: ['A-02'] },
    { id: 'OW5', buildingId: 'A', name: '이○○', unitIds: ['A-01'] },
    { id: 'OW6', buildingId: 'B', name: '로지스 물류 PFV', unitIds: ['B-01', 'B-02', 'B-03', 'B-04', 'B-05'] },
  ];

  const L = (id: string, unitId: string, tenant: string, industry: string, startOff: number, endOff: number, deposit: number, rent: number, extra: Partial<Lease> = {}): Lease => ({
    id, buildingId: unitId[0], unitId, tenant, industry, start: rel(startOff), end: addMonthsToDate(rel(endOff), 0), deposit, monthlyRent: rent,
    mgmtFeeType: 'actual', escalation: { type: 'fixed', rate: 0.03 }, rentFreeMonths: 0, renewalNoticeMonths: 6, excludedItems: [], caps: [], specialTerms: '', status: 'active',
    evidence: { tenant: ev(0.99, 'p.1 전문'), deposit: ev(0.98, 'p.2 제3조'), monthlyRent: ev(0.98, 'p.2 제4조'), end: ev(0.97, 'p.1 제2조'), escalation: ev(0.9, 'p.3 제5조'), specialTerms: ev(0.82, 'p.7 특약') },
    ...extra,
  });
  const leases: Lease[] = [
    L('LS-A01', 'A-01', '카페 모닝브루', '식음', -20, 4, 60_000_000, 6_200_000, { escalation: { type: 'fixed', rate: 0.07 }, specialTerms: '임대료 매년 7% 인상(계약서 제5조)', renewalNoticeMonths: 6 }),
    L('LS-A02', 'A-02', '한결세무법인', '전문서비스', -30, 6, 180_000_000, 18_500_000, { mgmtFeeType: 'fixed', fixedMgmtFee: 9_800_000, specialTerms: '관리비 정액(월 980만 원, 전용 사용료 별도)', evidence: { tenant: ev(0.99, 'p.1 전문'), deposit: ev(0.98, 'p.2 제3조'), monthlyRent: ev(0.98, 'p.2 제4조'), end: ev(0.97, 'p.1 제2조'), escalation: ev(0.9, 'p.3 제5조'), specialTerms: ev(0.71, 'p.8 특약 2항') } }),
    L('LS-A03', 'A-03', '넥스트핀테크(주)', 'IT', -40, 20, 900_000_000, 98_000_000, { escalation: { type: 'cpi' }, caps: [{ itemId: 'REPAIR', monthlyCap: 1_500_000 }], specialTerms: '수선유지비 월 150만 원 상한(초과분 임대인 부담)' }),
    L('LS-A04', 'A-04', '글로벌컨설팅코리아', '전문서비스', -14, 46, 950_000_000, 102_000_000, { rentFreeMonths: 3 }),
    L('LS-A05', 'A-05', '메디케어바이오', '제약', -50, 2, 620_000_000, 66_000_000, { renewalNoticeMonths: 3 }),
    L('LS-A06', 'A-06', '스마트모빌리티(주)', '제조', -8, 28, 640_000_000, 68_000_000, { excludedItems: ['INSUR'], specialTerms: '화재보험료 임차인 부담 제외' }),
    L('LS-A07', 'A-07', '퍼스트증권', '금융', -26, 34, 980_000_000, 104_000_000, { escalation: { type: 'negotiated' } }),
    // A-08 공실
    L('LS-B01', 'B-01', '쿨체인로지스', '물류', -22, 14, 500_000_000, 92_000_000),
    L('LS-B02', 'B-02', '이커머스풀필먼트', '유통', -10, 26, 520_000_000, 95_000_000, { escalation: { type: 'cpi' } }),
    L('LS-B03', 'B-03', '대한택배', '물류', -34, 5, 500_000_000, 90_000_000),
    // B-04 공실
    L('LS-B05', 'B-05', '로지스운영사무소', '사무', -22, 14, 30_000_000, 8_000_000, { mgmtFeeType: 'fixed', fixedMgmtFee: 2_400_000 }),
  ];

  // ── 지출 원장 ──
  const expenses: Expense[] = [];
  const baseCost: Record<string, Record<string, [number, string]>> = {
    A: { CLEAN: [42_000_000, '클린파트너스'], SECURITY: [38_400_000, '세이프가드'], FACILITY: [46_500_000, '빌딩테크'], ELEV: [6_600_000, '한국승강기서비스'], REPAIR: [9_000_000, '각 시공사'], SUPPLY: [2_100_000, '오피스디포'], INSUR: [3_400_000, '케이손해보험'], WATER: [4_200_000, '서울시 상수도'], GAS: [7_000_000, '서울도시가스'], RESERVE: [12_800_000, '충당금 적립'] },
    B: { CLEAN: [9_600_000, '클린파트너스'], SECURITY: [21_000_000, '세이프가드'], FACILITY: [18_500_000, '빌딩테크'], ELEV: [2_200_000, '한국승강기서비스'], REPAIR: [5_500_000, '각 시공사'], SUPPLY: [1_300_000, '오피스디포'], INSUR: [6_100_000, '케이손해보험'], WATER: [1_900_000, '이천시 상수도'], RESERVE: [8_400_000, '충당금 적립'] },
  };
  const energy: EnergyMonth[] = [];
  const readings: MeterReading[] = [];
  for (const b of buildings) {
    const rnd = seededRandom(`exp-${b.id}`);
    months.forEach((m, mi) => {
      const mm = Number(m.slice(5));
      const yearUp = mi >= 12 ? 1.035 : 1;
      let seq = 0;
      const add = (itemId: string, amount: number, vendor: string, memo: string, account?: string) =>
        expenses.push({ id: `EX-${b.id}-${m}-${String(++seq).padStart(2, '0')}`, buildingId: b.id, month: m, itemId, account: account ?? CHARGE_ITEMS.find((i) => i.id === itemId)!.accounts[0], vendor, amount: Math.round(amount / 100) * 100, memo });
      for (const [itemId, [amt, vendor]] of Object.entries(baseCost[b.id])) {
        const jitter = itemId === 'REPAIR' || itemId === 'SUPPLY' ? 0.8 + rnd() * 0.4 : 1;
        const seasonal = itemId === 'GAS' ? (mm >= 11 || mm <= 3 ? 1.9 : mm >= 6 && mm <= 9 ? 0.25 : 0.8) : itemId === 'WATER' ? (mm >= 6 && mm <= 8 ? 1.2 : 1) : 1;
        add(itemId, amt * yearUp * jitter * seasonal, vendor, `${CHARGE_ITEMS.find((i) => i.id === itemId)!.name} ${mm}월분`);
      }
      // 전기: 15분 프로파일에서 사용량 도출 → 공용 30% / 전용 70%
      const usage = summarizeMonth(b, m);
      const elecCost = Math.round(usage.kwh * 168 + usage.peakKw * 7220);
      add('COMMON_ELEC', elecCost * 0.3, '한국전력공사', `공용 전기료 ${mm}월분`);
      add('UNIT_ELEC', elecCost * 0.7, '한국전력공사', `전용 전기료 ${mm}월분`);
      const gasCost = b.id === 'A' ? expenses.find((e) => e.buildingId === 'A' && e.month === m && e.itemId === 'GAS')!.amount : 0;
      energy.push({ buildingId: b.id, month: m, electricKwh: Math.round(usage.kwh), peakKw: Math.round(usage.peakKw), gasM3: Math.round(gasCost / 950), waterM3: Math.round(baseCost[b.id].WATER[0] / 1400) });
      // 호실 검침: 임차 호실은 면적·업종 가중, 공실은 최소 사용
      const bu = units.filter((u) => u.buildingId === b.id);
      const wts = bu.map((u) => (activeLease(leases, u.id, m) ? u.exclusiveArea * (0.85 + rnd() * 0.3) : u.exclusiveArea * 0.06));
      const wsum = wts.reduce((a, x) => a + x, 0);
      bu.forEach((u, i) => {
        readings.push({ unitId: u.id, month: m, type: 'electric', usage: Math.round((usage.kwh * 0.7 * wts[i]) / wsum) });
        readings.push({ unitId: u.id, month: m, type: 'water', usage: Math.round(((baseCost[b.id].WATER[0] / 1400) * wts[i]) / wsum) });
      });

      // ── 의도된 오류 (정산 대상 월) ──
      if (m === cur && b.id === 'A') {
        add('ELEV', baseCost.A.ELEV[0] * yearUp, '한국승강기서비스', `승강기유지비 ${mm}월분`); // 중복 청구: 위 정기분과 금액·거래처 동일
        add('REPAIR', 3_850_000, '오피스디포', '복사용지·토너 일괄 구매', '소모품비'); // 계정 오분류
        add('SECURITY', 11_500_000, '세이프가드', '임시 경비 증원(행사 대응)'); // 전월·전년 대비 급증
      }
    });
  }
  // 중복 청구 금액을 정기분과 정확히 일치시킨다
  const elevs = expenses.filter((e) => e.buildingId === 'A' && e.month === cur && e.itemId === 'ELEV');
  if (elevs.length === 2) elevs[1].amount = elevs[0].amount;

  // ── 외주 계약·실적·인보이스 ──
  const contracts: VendorContract[] = [
    { id: 'CT-A-CLEAN', buildingId: 'A', vendor: '클린파트너스', service: '청소', start: rel(-18), end: rel(6), slaResponseMin: 30, chargeItemId: 'CLEAN', items: [{ code: 'CL-P', desc: '미화원 상주', unit: '인', qty: 12, unitPrice: 3_150_000 }, { code: 'CL-G', desc: '외벽·유리 청소', unit: '회', qty: 1, unitPrice: 4_200_000 }] },
    { id: 'CT-A-SEC', buildingId: 'A', vendor: '세이프가드', service: '경비', start: rel(-18), end: rel(2), slaResponseMin: 10, chargeItemId: 'SECURITY', items: [{ code: 'SC-P', desc: '경비원 3교대', unit: '인', qty: 9, unitPrice: 4_100_000 }, { code: 'SC-M', desc: '관제 시스템 유지', unit: '식', qty: 1, unitPrice: 1_500_000 }] },
    { id: 'CT-A-FM', buildingId: 'A', vendor: '빌딩테크', service: '시설관리', start: rel(-30), end: rel(18), slaResponseMin: 20, chargeItemId: 'FACILITY', items: [{ code: 'FM-P', desc: '시설기사 상주', unit: '인', qty: 8, unitPrice: 4_900_000 }, { code: 'FM-C', desc: '소모자재 정액', unit: '식', qty: 1, unitPrice: 7_300_000 }] },
    { id: 'CT-A-ELEV', buildingId: 'A', vendor: '한국승강기서비스', service: '승강기', start: rel(-10), end: rel(14), slaResponseMin: 60, chargeItemId: 'ELEV', items: [{ code: 'EV-M', desc: '승강기 유지보수(12대)', unit: '대', qty: 12, unitPrice: 550_000 }] },
    { id: 'CT-B-SEC', buildingId: 'B', vendor: '세이프가드', service: '경비', start: rel(-12), end: rel(12), slaResponseMin: 10, chargeItemId: 'SECURITY', items: [{ code: 'SC-P', desc: '경비원 2교대', unit: '인', qty: 5, unitPrice: 4_000_000 }, { code: 'SC-M', desc: '관제 시스템 유지', unit: '식', qty: 1, unitPrice: 1_000_000 }] },
  ];
  const workRecords: WorkRecord[] = [];
  const invoices: Invoice[] = [];
  const invMonths = monthRange(cur, 6);
  for (const c of contracts) {
    const rnd = seededRandom(`wr-${c.id}`);
    invMonths.forEach((m, k) => {
      const isCur = m === cur;
      const performed = Object.fromEntries(c.items.map((i) => [i.code, i.qty]));
      let lines = c.items.map((i) => ({ code: i.code, desc: i.desc, qty: i.qty, unitPrice: i.unitPrice, amount: i.qty * i.unitPrice }));
      let resp = c.slaResponseMin * (0.6 + rnd() * 0.35);
      let incidents = 0;
      if (isCur && c.id === 'CT-A-CLEAN') { performed['CL-P'] = 12; performed['CL-G'] = 0; lines = [{ ...lines[0], qty: 14, amount: 14 * 3_150_000 }, lines[1]]; } // 인원 초과 + 미수행 청구
      if (isCur && c.id === 'CT-A-SEC') { lines = [{ ...lines[0], unitPrice: 4_280_000, amount: 9 * 4_280_000 }, lines[1], { code: 'SC-X', desc: '행사 지원 인력', qty: 1, unitPrice: 2_400_000, amount: 2_400_000 }]; resp = 14; incidents = 1; } // 단가 불일치 + 계약 외 항목 + SLA 미달
      if (k === 3 && c.id === 'CT-A-FM') { resp = 31; incidents = 2; }
      workRecords.push({ contractId: c.id, month: m, performed, avgResponseMin: Math.round(resp), incidents });
      const id = `INV-${c.id.slice(3)}-${m}`;
      invoices.push({ id, contractId: c.id, month: m, number: `${c.vendor.slice(0, 2)}-${m.replace('-', '')}-01`, issuedAt: `${addMonths(m, 1)}-03`, lines, total: lines.reduce((s, l) => s + l.amount, 0), status: isCur ? 'draft' : 'approved' });
    });
  }
  // 중복 인보이스
  const dupSrc = invoices.find((i) => i.contractId === 'CT-A-ELEV' && i.month === cur)!;
  invoices.push({ ...dupSrc, id: `${dupSrc.id}-R`, number: dupSrc.number.replace(/01$/, '02'), issuedAt: `${addMonths(cur, 1)}-07` });

  // ── 법정점검 ──
  const inspections: Inspection[] = [];
  for (const b of buildings) {
    applicableRules(b).forEach((r, idx) => {
      const offset = ((idx * 5 + (b.id === 'A' ? 0 : 3)) % Math.max(1, r.cycleMonths)) + 0;
      if (r.cycleMonths === 1) {
        inspections.push({ id: `${b.id}-${r.id}-${rel(-1, 25)}`, buildingId: b.id, ruleId: r.id, dueDate: rel(-1, 25), doneDate: rel(-1, 22), evidence: `${r.evidence} (${addMonths(today.slice(0, 7), -1)})`, findings: [] });
        inspections.push({ id: `${b.id}-${r.id}-${rel(0, 25)}`, buildingId: b.id, ruleId: r.id, dueDate: rel(0, 25), findings: [] });
      } else {
        const due = rel(offset - 1, 20);
        const prev = addMonthsToDate(due, -r.cycleMonths);
        inspections.push({ id: `${b.id}-${r.id}-${prev}`, buildingId: b.id, ruleId: r.id, dueDate: prev, doneDate: addMonthsToDate(prev, 0), evidence: r.evidence, findings: r.id === 'fire-op' && b.id === 'A' ? [{ text: '7층 유도등 2개소 점등 불량', done: true }, { text: '지하 2층 스프링클러 헤드 1개소 도장 오염', done: false }] : [] });
        inspections.push({ id: `${b.id}-${r.id}-${due}`, buildingId: b.id, ruleId: r.id, dueDate: due, findings: [] });
      }
    });
  }

  // ── 관리단 ──
  const meetings: Meeting[] = [
    { id: 'MT-1', buildingId: 'A', date: rel(-7, 18), title: '정기 관리단집회', type: 'regular', closed: true, agendas: [
      { id: 'AG-1', title: '전년도 관리비 결산 승인', kind: 'ordinary', votes: { OW1: 'yes', OW2: 'yes', OW3: 'yes', OW4: 'no', OW5: 'abstain' } },
      { id: 'AG-2', title: '관리인 재선임', kind: 'manager', votes: { OW1: 'yes', OW2: 'yes', OW3: 'yes', OW4: 'yes', OW5: 'yes' } },
    ] },
    { id: 'MT-2', buildingId: 'A', date: rel(1, 12), title: '임시 관리단집회', type: 'special', closed: false, agendas: [
      { id: 'AG-3', title: '주차장 운영 규약 변경', kind: 'bylaw', votes: { OW1: 'yes', OW2: 'yes', OW4: 'no' } },
      { id: 'AG-4', title: '승강기 교체 공사(장기수선충당금 사용) 승인', kind: 'ordinary', votes: { OW1: 'yes', OW3: 'yes' } },
    ] },
  ];

  const requests: CivilRequest[] = [
    { id: 'RQ-1', buildingId: 'A', receivedAt: rel(0, 3), channel: 'AI 콜센터', requester: '넥스트핀테크(주)', category: '시설', text: '4층 회의실 냉난방기 소음이 심합니다.', status: 'assigned', assignee: '빌딩테크', dueDate: rel(0, 10) },
    { id: 'RQ-2', buildingId: 'A', receivedAt: rel(0, 5), channel: '전화', requester: '카페 모닝브루', category: '관리비', text: '이번 달 공용전기료가 지난달보다 많이 나온 이유를 알고 싶습니다.', status: 'open', dueDate: rel(0, 12) },
    { id: 'RQ-3', buildingId: 'A', receivedAt: rel(-1, 21), channel: '앱', requester: '퍼스트증권', category: '주차', text: '방문 차량 등록 절차가 번거롭습니다.', status: 'done', assignee: '관리사무소', dueDate: rel(-1, 28) },
    { id: 'RQ-4', buildingId: 'B', receivedAt: rel(0, 2), channel: '방문', requester: '대한택배', category: '시설', text: '3층 도크 레벨러 1기 작동 불량.', status: 'assigned', assignee: '빌딩테크', dueDate: rel(0, 6) },
  ];

  const legalCases: LegalCase[] = [
    { id: 'LC-1', buildingId: 'A', title: '카페 모닝브루 임대료 인상률 이의', issueId: 'rent-change', status: 'negotiating', openedAt: rel(-1, 14), counterparty: '카페 모닝브루', amount: 5_208_000, summary: '계약서상 연 7% 인상 조항에 대해 임차인이 5% 상한 적용을 주장. 환산보증금이 기준액 이하인지 판정 필요.' },
    { id: 'LC-2', buildingId: 'A', title: '한결세무법인 관리비 정액 초과분 정산 요구', issueId: 'mgmt-fee', status: 'open', openedAt: rel(0, 4), counterparty: '한결세무법인', amount: 3_400_000, summary: '정액 관리비 계약임에도 전용 전기료 별도 청구에 이의 제기. 특약 2항 문언 해석 쟁점.' },
    { id: 'LC-3', buildingId: 'B', title: '전 임차인 원상복구 비용 공제 분쟁', issueId: 'restoration', status: 'closed', openedAt: rel(-9, 8), counterparty: '(전) 한진유통', amount: 42_000_000, summary: '바닥 에폭시 재시공 비용 공제에 대한 이의.', outcome: '통상 손모분을 제외하고 2,900만 원 공제로 합의 종결.' },
  ];

  // ── 재고 ──
  const S = (id: string, b: string, name: string, category: StockItem['category'], unit: string, qty: number, safetyQty: number, unitPrice: number, vendor: string): StockItem => ({ id, buildingId: b, name, category, unit, qty, safetyQty, unitPrice, vendor });
  const stock: StockItem[] = [
    S('ST-A1', 'A', 'LED 평판등 50W', '전기자재', '개', 14, 20, 28_000, '대한전기'), S('ST-A2', 'A', '공조기 필터 (중성능)', '설비자재', '매', 46, 24, 19_500, '에어텍'),
    S('ST-A3', 'A', '화장지 (점보롤)', '청소용품', '박스', 9, 12, 32_000, '오피스디포'), S('ST-A4', 'A', '소화기 3.3kg', '소방자재', '개', 18, 10, 24_000, '한국소방'),
    S('ST-A5', 'A', '핸드타월', '청소용품', '박스', 22, 10, 27_000, '오피스디포'), S('ST-A6', 'A', '차단기 MCCB 100A', '전기자재', '개', 3, 2, 86_000, '대한전기'),
    S('ST-B1', 'B', '고천장 LED 150W', '전기자재', '개', 6, 10, 112_000, '대한전기'), S('ST-B2', 'B', '도크 범퍼', '설비자재', '개', 12, 6, 45_000, '로지텍'),
    S('ST-B3', 'B', '스프링클러 헤드', '소방자재', '개', 40, 30, 6_800, '한국소방'),
  ];
  const stockMoves: StockMove[] = [];
  const outPerMonth: Record<string, number> = { 'ST-A1': 9, 'ST-A2': 12, 'ST-A3': 10, 'ST-A4': 1, 'ST-A5': 6, 'ST-A6': 0, 'ST-B1': 4, 'ST-B2': 1, 'ST-B3': 3 };
  for (const it of stock) for (let k = 3; k >= 1; k--) if (outPerMonth[it.id]) stockMoves.push({ id: `MV-${it.id}-${k}`, itemId: it.id, date: rel(-k, 15), type: 'out', qty: outPerMonth[it.id], memo: '정기 교체·보충' });
  const purchaseOrders: PurchaseOrder[] = [
    { id: 'PO-0001', buildingId: 'A', vendor: '에어텍', createdAt: rel(-1, 9), lines: [{ itemId: 'ST-A2', qty: 36, unitPrice: 19_500 }], total: 702_000, status: 'received' },
  ];

  // ── 회계: 예산·미수금 (직전 3개월 고지분) ──
  const budgets: Budget[] = [];
  const year = Number(cur.slice(0, 4));
  for (const b of buildings) for (const it of CHARGE_ITEMS) {
    const lastYear = expenses.filter((e) => e.buildingId === b.id && e.itemId === it.id && e.month.startsWith(String(year - 1))).reduce((s, e) => s + e.amount, 0);
    const monthsLast = new Set(expenses.filter((e) => e.buildingId === b.id && e.month.startsWith(String(year - 1))).map((e) => e.month)).size || 1;
    if (lastYear > 0) budgets.push({ buildingId: b.id, year, itemId: it.id, amount: Math.round(((lastYear / monthsLast) * 12 * 1.03) / 10000) * 10000 });
  }
  const receivables: Receivable[] = [];
  const om = ownerMap(owners);
  for (const b of buildings) for (const m of [addMonths(cur, -3), addMonths(cur, -2), addMonths(cur, -1)]) {
    const lines = allocate({ month: m, units: units.filter((u) => u.buildingId === b.id), leases, items: CHARGE_ITEMS, expenses: expenses.filter((e) => e.buildingId === b.id && e.month === m), readings: readings.filter((r) => r.month === m), ownerOf: om });
    const byUnit = new Map<string, { tenant: string; billed: number }>();
    for (const l of lines) if (l.payer === 'tenant') { const x = byUnit.get(l.unitId) ?? { tenant: l.payerName, billed: 0 }; x.billed += l.amount + l.vat; byUnit.set(l.unitId, x); }
    for (const [unitId, x] of byUnit) {
      const due = `${addMonths(m, 1)}-25`;
      const late = unitId === 'A-01' && m >= addMonths(cur, -2); // 연체 사례
      const partial = unitId === 'B-03' && m === addMonths(cur, -1);
      receivables.push({ id: `RC-${unitId}-${m}`, buildingId: b.id, month: m, unitId, tenant: x.tenant, billed: x.billed, paid: late ? 0 : partial ? Math.round(x.billed * 0.6) : x.billed, dueDate: due, paidDate: late ? undefined : due });
    }
  }

  return { seedMonth: cur, buildings, units, owners, leases, items: CHARGE_ITEMS, expenses, readings, contracts, workRecords, invoices, energy, inspections, meetings, requests, legalCases, receivables, budgets, stock, stockMoves, purchaseOrders };
}
