import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { buildSeed, ownerMap, type SeedData } from '../data/seed';
import type {
  Approval, AuditEvent, CivilRequest, Expense, Inspection, ISODate, Lease, LegalCase, Month, PurchaseOrder, Role, Settlement, Vote,
} from '../domain/types';
import { ROLE_LABEL } from '../domain/types';
import { allocate, RULE_VERSION } from '../engine/allocation';
import { detectAllocationShift, detectExpenseAnomalies } from '../engine/anomaly';
import { nextInspection } from '../engine/compliance';
import { addMonths, snapshotHash } from '../engine/money';
import { matchInvoice } from '../engine/threeWay';

export const today = (): ISODate => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export interface Settings {
  role: Role;
  workspace?: 'am' | 'pm' | 'fm'; // 작업공간(AM·PM·FM). 없으면 역할 기본값
  userName: string;
  provider: 'claude' | 'gemini' | 'none';
  claudeKey: string;
  geminiKey: string;
  lawOc: string; // 국가법령정보 Open API 사용자 ID(OC)
  serviceLinks: Record<string, string>;
}

type LogExtra = Partial<Pick<AuditEvent, 'ruleVersion' | 'modelVersion' | 'inputHash'>>;

export interface State extends SeedData {
  buildingId: string;
  settlements: Settlement[];
  approvals: Approval[];
  audit: AuditEvent[];
  settings: Settings;

  setBuilding: (id: string) => void;
  updateSettings: (p: Partial<Settings>) => void;
  resetData: () => void;
  log: (action: string, target: string, detail: string, extra?: LogExtra) => void;

  computeLines: (buildingId: string, month: Month) => ReturnType<typeof allocate>;
  runSettlement: (buildingId: string, month: Month) => string;
  resolveAnomaly: (settlementId: string, anomalyId: string, note: string) => void;
  submitSettlement: (id: string) => string | null;
  requestPayment: (invoiceId: string) => void;
  decideApproval: (id: string, approve: boolean, comment: string) => string | null;

  addLease: (l: Lease, modelVersion: string) => void;
  confirmLease: (id: string) => void;
  addExpense: (e: Omit<Expense, 'id'>) => void;
  recordPayment: (receivableId: string) => void;
  completeInspection: (id: string, evidence: string) => void;
  toggleFinding: (id: string, index: number) => void;
  castVote: (meetingId: string, agendaId: string, ownerId: string, vote: Vote) => void;
  closeMeeting: (meetingId: string) => void;
  addRequest: (r: Omit<CivilRequest, 'id'>) => void;
  updateRequest: (id: string, p: Partial<CivilRequest>) => void;
  addLegalCase: (c: Omit<LegalCase, 'id'>) => void;
  moveStock: (itemId: string, type: 'in' | 'out', qty: number, memo: string) => void;
  createPurchaseOrder: (buildingId: string, vendor: string, lines: PurchaseOrder['lines']) => void;
  receivePurchaseOrder: (id: string) => void;
}

const uid = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const canApprove = (role: Role) => role === 'pm' || role === 'amc';

const defaultSettings: Settings = { role: 'pm', userName: '김관리', provider: 'claude', claudeKey: '', geminiKey: '', lawOc: '', serviceLinks: {} };

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      ...buildSeed(today()),
      buildingId: 'A',
      settlements: [],
      approvals: [],
      audit: [],
      settings: defaultSettings,

      setBuilding: (id) => set({ buildingId: id }),
      updateSettings: (p) => set((s) => ({ settings: { ...s.settings, ...p } })),
      resetData: () => set((s) => ({ ...buildSeed(today()), settlements: [], approvals: [], audit: [], buildingId: 'A', settings: s.settings })),

      log: (action, target, detail, extra) =>
        set((s) => ({ audit: [{ id: uid('AU'), at: new Date().toISOString(), actor: s.settings.userName, role: s.settings.role, action, target, detail, ...extra }, ...s.audit].slice(0, 500) })),

      computeLines: (buildingId, month) => {
        const s = get();
        return allocate({
          month, units: s.units.filter((u) => u.buildingId === buildingId), leases: s.leases, items: s.items,
          expenses: s.expenses.filter((e) => e.buildingId === buildingId && e.month === month),
          readings: s.readings.filter((r) => r.month === month), ownerOf: ownerMap(s.owners),
        });
      },

      runSettlement: (buildingId, month) => {
        const s = get();
        const expenses = s.expenses.filter((e) => e.buildingId === buildingId && e.month === month);
        const lines = s.computeLines(buildingId, month);
        const prevLines = s.computeLines(buildingId, addMonths(month, -1));
        const unitName = (id: string) => s.units.find((u) => u.id === id)?.name ?? id;
        const anomalies = [
          ...detectExpenseAnomalies(month, s.expenses.filter((e) => e.buildingId === buildingId), s.items),
          ...detectAllocationShift(lines, prevLines.length ? prevLines : undefined, unitName),
        ];
        const id = `ST-${buildingId}-${month}`;
        const old = s.settlements.find((x) => x.id === id);
        // 재실행 시 이미 해소한 플래그는 유지한다
        for (const a of anomalies) {
          const o = old?.anomalies.find((x) => x.id === a.id && x.resolved);
          if (o) Object.assign(a, { resolved: true, resolution: o.resolution, resolvedBy: o.resolvedBy });
        }
        const inputHash = snapshotHash({ expenses, leases: s.leases.filter((l) => l.buildingId === buildingId), readings: s.readings.filter((r) => r.month === month && r.unitId.startsWith(buildingId)) });
        const st: Settlement = { id, buildingId, month, status: 'draft', ruleVersion: RULE_VERSION, inputHash, createdAt: new Date().toISOString(), poolTotal: expenses.reduce((a, e) => a + e.amount, 0), lines, anomalies };
        set({ settlements: [st, ...s.settlements.filter((x) => x.id !== id)], approvals: s.approvals.filter((a) => !(a.targetId === id && a.status === 'pending')) });
        get().log('정산 실행', id, `안분 ${lines.length}행, 이상치 ${anomalies.length}건`, { ruleVersion: RULE_VERSION, inputHash });
        return id;
      },

      resolveAnomaly: (settlementId, anomalyId, note) => {
        set((s) => ({ settlements: s.settlements.map((st) => (st.id !== settlementId ? st : { ...st, anomalies: st.anomalies.map((a) => (a.id !== anomalyId ? a : { ...a, resolved: true, resolution: note, resolvedBy: s.settings.userName })) })) }));
        get().log('이상치 해소', `${settlementId}/${anomalyId}`, note);
      },

      submitSettlement: (id) => {
        const s = get();
        const st = s.settlements.find((x) => x.id === id);
        if (!st) return '정산을 찾을 수 없습니다.';
        const open = st.anomalies.filter((a) => !a.resolved).length;
        if (open > 0) {
          s.log('승인 요청 차단', id, `미해소 이상치 ${open}건`);
          return `미해소 이상치 ${open}건이 있어 승인 요청이 차단되었습니다.`;
        }
        const b = s.buildings.find((x) => x.id === st.buildingId)!;
        const amount = st.lines.filter((l) => l.payer === 'tenant').reduce((a, l) => a + l.amount + l.vat, 0);
        const ap: Approval = { id: uid('AP'), kind: 'settlement', targetId: id, buildingId: st.buildingId, title: `${b.name} ${st.month} 관리비 고지 확정`, amount, level: 'L2', status: 'pending', requestedBy: s.settings.userName, requestedAt: new Date().toISOString() };
        set({ settlements: s.settlements.map((x) => (x.id === id ? { ...x, status: 'pending' } : x)), approvals: [ap, ...s.approvals] });
        get().log('승인 요청', id, `고지 확정 요청 (L2)`, { ruleVersion: st.ruleVersion, inputHash: st.inputHash });
        return null;
      },

      requestPayment: (invoiceId) => {
        const s = get();
        const inv = s.invoices.find((i) => i.id === invoiceId)!;
        const c = s.contracts.find((x) => x.id === inv.contractId)!;
        const r = matchInvoice(inv, c, s.workRecords.find((w) => w.contractId === c.id && w.month === inv.month), s.invoices);
        const ap: Approval = { id: uid('AP'), kind: 'payment', targetId: invoiceId, buildingId: c.buildingId, title: `${c.vendor} ${inv.month} ${c.service} 지급 권고 (청구 ${inv.total.toLocaleString()}원 중)`, amount: r.payable, level: 'L2', status: 'pending', requestedBy: s.settings.userName, requestedAt: new Date().toISOString() };
        set({ invoices: s.invoices.map((i) => (i.id === invoiceId ? { ...i, status: 'pending' } : i)), approvals: [ap, ...s.approvals] });
        get().log('지급 승인 요청', invoiceId, `지급 적정액 ${r.payable.toLocaleString()}원, 지적 ${r.findings.length}건`, { ruleVersion: '3way-1.0.0' });
      },

      decideApproval: (id, approve, comment) => {
        const s = get();
        if (!canApprove(s.settings.role)) {
          s.log('승인 시도 거부', id, `${ROLE_LABEL[s.settings.role]} 역할은 승인 권한이 없습니다.`);
          return '현재 역할은 승인 권한이 없습니다. (PM사·운용사만 승인 가능)';
        }
        const ap = s.approvals.find((a) => a.id === id);
        if (!ap || ap.status !== 'pending') return '대기 중인 승인 건이 아닙니다.';
        const status = approve ? 'approved' : 'rejected';
        const patch: Partial<State> = { approvals: s.approvals.map((a) => (a.id === id ? { ...a, status, decidedBy: s.settings.userName, decidedAt: new Date().toISOString(), comment } : a)) };
        if (ap.kind === 'settlement') {
          const st = s.settlements.find((x) => x.id === ap.targetId)!;
          patch.settlements = s.settlements.map((x) => (x.id === ap.targetId ? { ...x, status: approve ? 'approved' : 'draft' } : x));
          if (approve) {
            const byUnit = new Map<string, { tenant: string; billed: number }>();
            for (const l of st.lines) if (l.payer === 'tenant') { const x = byUnit.get(l.unitId) ?? { tenant: l.payerName, billed: 0 }; x.billed += l.amount + l.vat; byUnit.set(l.unitId, x); }
            const fresh = [...byUnit].map(([unitId, x]) => ({ id: `RC-${unitId}-${st.month}`, buildingId: st.buildingId, month: st.month, unitId, tenant: x.tenant, billed: x.billed, paid: 0, dueDate: `${addMonths(st.month, 1)}-25` }));
            patch.receivables = [...s.receivables.filter((r) => !fresh.some((f) => f.id === r.id)), ...fresh];
          }
        } else if (ap.kind === 'payment') patch.invoices = s.invoices.map((i) => (i.id === ap.targetId ? { ...i, status: approve ? 'approved' : 'rejected' } : i));
        else if (ap.kind === 'purchase') patch.purchaseOrders = s.purchaseOrders.map((p) => (p.id === ap.targetId ? { ...p, status: approve ? 'approved' : 'rejected' } : p));
        set(patch);
        get().log(approve ? '승인' : '반려', ap.targetId, `${ap.title}${comment ? ` — ${comment}` : ''}`);
        return null;
      },

      addLease: (l, modelVersion) => {
        set((s) => ({ leases: [...s.leases, l] }));
        get().log('임대차 추출', l.id, `${l.tenant} — 검토 큐 등록`, { modelVersion });
      },
      confirmLease: (id) => {
        set((s) => ({ leases: s.leases.map((l) => (l.id === id ? { ...l, status: 'active' } : l)) }));
        get().log('임대차 검토 완료', id, '정본 확정');
      },
      addExpense: (e) => {
        const id = uid('EX');
        set((s) => ({ expenses: [...s.expenses, { ...e, id }] }));
        get().log('지출 등록', id, `${e.vendor} ${e.amount.toLocaleString()}원 (${e.account})`);
      },
      recordPayment: (receivableId) => {
        set((s) => ({ receivables: s.receivables.map((r) => (r.id === receivableId ? { ...r, paid: r.billed, paidDate: today() } : r)) }));
        get().log('수납 처리', receivableId, '전액 수납 확인');
      },
      completeInspection: (id, evidence) => {
        const s = get();
        const done: Inspection = { ...s.inspections.find((i) => i.id === id)!, doneDate: today(), evidence };
        const next = nextInspection(done);
        set({ inspections: [...s.inspections.map((i) => (i.id === id ? done : i)), ...(next && !s.inspections.some((i) => i.id === next.id) ? [next] : [])] });
        get().log('법정점검 완료', id, `증빙: ${evidence}`);
      },
      toggleFinding: (id, index) => set((s) => ({ inspections: s.inspections.map((i) => (i.id !== id ? i : { ...i, findings: i.findings.map((f, k) => (k === index ? { ...f, done: !f.done } : f)) })) })),
      castVote: (meetingId, agendaId, ownerId, vote) =>
        set((s) => ({ meetings: s.meetings.map((m) => (m.id !== meetingId || m.closed ? m : { ...m, agendas: m.agendas.map((a) => (a.id !== agendaId ? a : { ...a, votes: { ...a.votes, [ownerId]: vote } })) })) })),
      closeMeeting: (meetingId) => {
        set((s) => ({ meetings: s.meetings.map((m) => (m.id === meetingId ? { ...m, closed: true } : m)) }));
        get().log('관리단집회 종결', meetingId, '표결 마감·의사록 확정');
      },
      addRequest: (r) => {
        const id = uid('RQ');
        set((s) => ({ requests: [{ ...r, id }, ...s.requests] }));
        get().log('민원 접수', id, `${r.requester} — ${r.category}`);
      },
      updateRequest: (id, p) => set((s) => ({ requests: s.requests.map((r) => (r.id === id ? { ...r, ...p } : r)) })),
      addLegalCase: (c) => {
        const id = uid('LC');
        set((s) => ({ legalCases: [{ ...c, id }, ...s.legalCases] }));
        get().log('법무 사례 등록', id, c.title);
      },
      moveStock: (itemId, type, qty, memo) => {
        const s = get();
        const it = s.stock.find((x) => x.id === itemId)!;
        const applied = type === 'out' ? Math.min(qty, it.qty) : qty;
        if (applied <= 0) return;
        set({ stock: s.stock.map((x) => (x.id === itemId ? { ...x, qty: x.qty + (type === 'in' ? applied : -applied) } : x)), stockMoves: [{ id: uid('MV'), itemId, date: today(), type, qty: applied, memo }, ...s.stockMoves] });
        get().log(type === 'in' ? '입고' : '출고', itemId, `${it.name} ${applied}${it.unit} — ${memo}`);
      },
      createPurchaseOrder: (buildingId, vendor, lines) => {
        const s = get();
        const total = lines.reduce((a, l) => a + l.qty * l.unitPrice, 0);
        const id = `PO-${String(s.purchaseOrders.length + 1).padStart(4, '0')}`;
        const ap: Approval = { id: uid('AP'), kind: 'purchase', targetId: id, buildingId, title: `${vendor} 발주 ${lines.length}품목`, amount: total, level: 'L2', status: 'pending', requestedBy: s.settings.userName, requestedAt: new Date().toISOString() };
        set({ purchaseOrders: [{ id, buildingId, vendor, createdAt: today(), lines, total, status: 'pending' }, ...s.purchaseOrders], approvals: [ap, ...s.approvals] });
        get().log('발주 승인 요청', id, `${vendor} ${total.toLocaleString()}원`);
      },
      receivePurchaseOrder: (id) => {
        const po = get().purchaseOrders.find((p) => p.id === id);
        if (!po || po.status !== 'approved') return;
        for (const l of po.lines) get().moveStock(l.itemId, 'in', l.qty, `발주 ${id} 입고`);
        set((s) => ({ purchaseOrders: s.purchaseOrders.map((p) => (p.id === id ? { ...p, status: 'received' } : p)) }));
      },
    }),
    { name: 'pmai-state-v1', version: 1 },
  ),
);

export const useBuilding = () => useStore((s) => s.buildings.find((b) => b.id === s.buildingId) ?? s.buildings[0]);
