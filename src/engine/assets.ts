// 시설관리(FM) — 설비 대장과 작업지시.
// 설비별로 법정점검 이력·다음 회차·미조치 지적을 묶고, 점검 지적과 시설 민원을 하나의 작업 목록으로 만든다.
import type { Building, CivilRequest, Equipment, ISODate, Inspection } from '../domain/types';
import { applicableRules, type ComplianceRule, inspectionState, type InspectionState } from './compliance';
import { addMonthsToDate } from './money';

/** 점검 지적의 시정 기한: 점검일 + 1개월(예시 기준 — 법정 시정 기한은 점검 종류마다 다르므로 법무 검토 필요) */
export const FIX_MONTHS = 1;

export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  elevator: '승강기', boiler: '보일러', gas: '가스 사용시설', waterTank: '저수조', substation: '수변전 설비', sprinkler: '소방(스프링클러)', hvac: '공조(냉난방)',
};

const STATE_RANK: Record<InspectionState, number> = { overdue: 0, due30: 1, due90: 2, scheduled: 3, done: 4 };

export interface RuleStatus { rule: ComplianceRule; last?: Inspection; next?: Inspection; state: InspectionState | 'none' }
export interface EquipmentRow { equipment: Equipment | 'common'; label: string; rules: RuleStatus[]; openFindings: number; worst: InspectionState | 'none' }

function ruleStatus(rule: ComplianceRule, inspections: Inspection[], today: ISODate): RuleStatus {
  const mine = inspections.filter((i) => i.ruleId === rule.id);
  const last = mine.filter((i) => i.doneDate).sort((a, b) => b.doneDate!.localeCompare(a.doneDate!))[0];
  const next = mine.filter((i) => !i.doneDate).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  return { rule, last, next, state: next ? inspectionState(next, today) : 'none' };
}

/** 설비 대장: 건물이 가진 설비 + 설비에 묶이지 않는 건물 공통 점검 */
export function equipmentRegister(b: Building, inspections: Inspection[], today: ISODate): EquipmentRow[] {
  const ins = inspections.filter((i) => i.buildingId === b.id);
  const rules = applicableRules(b);
  const groups: (Equipment | 'common')[] = [...b.equipment, 'common'];
  return groups
    .map((g) => {
      const rs = rules.filter((r) => (g === 'common' ? !r.equipment || !b.equipment.includes(r.equipment) : r.equipment === g)).map((r) => ruleStatus(r, ins, today));
      const openFindings = ins.filter((i) => rs.some((x) => x.rule.id === i.ruleId)).reduce((a, i) => a + i.findings.filter((f) => !f.done).length, 0);
      const states = rs.map((r) => r.state).filter((s): s is InspectionState => s !== 'none');
      const worst: InspectionState | 'none' = states.length ? states.sort((a, c) => STATE_RANK[a] - STATE_RANK[c])[0] : 'none';
      return { equipment: g, label: g === 'common' ? '건물 공통' : EQUIPMENT_LABEL[g], rules: rs, openFindings, worst };
    })
    .filter((row) => row.equipment !== 'common' || row.rules.length > 0);
}

// 민원 글에서 관련 설비를 추정(키워드). 화면에는 '추정'으로 표시한다.
const KEYWORDS: [Equipment, RegExp][] = [
  ['elevator', /엘리베이터|승강기|엘베/],
  ['hvac', /냉방|난방|공조|에어컨|온도|덥|춥/],
  ['waterTank', /누수|단수|수압|물탱크|저수조/],
  ['substation', /정전|전기|차단기|조명/],
  ['sprinkler', /스프링클러|소화|화재|감지기/],
  ['boiler', /보일러|온수/],
  ['gas', /가스/],
];
export const guessEquipment = (text: string): Equipment | undefined => KEYWORDS.find(([, re]) => re.test(text))?.[0];

export interface WorkOrder {
  id: string;
  source: 'finding' | 'request';
  title: string;
  equipment?: Equipment;
  equipmentGuessed: boolean;
  due: ISODate;
  overdue: boolean;
  assignee?: string;
  status: 'open' | 'assigned' | 'done';
  ref: { inspectionId?: string; findingIndex?: number; requestId?: string };
}

/** 미조치 점검 지적 + 처리 전 시설 민원 → 작업지시 목록(기한 순) */
export function workOrders(b: Building, inspections: Inspection[], requests: CivilRequest[], today: ISODate): WorkOrder[] {
  const rules = applicableRules(b);
  const fromFindings: WorkOrder[] = inspections
    .filter((i) => i.buildingId === b.id)
    .flatMap((i) => {
      const rule = rules.find((r) => r.id === i.ruleId);
      return i.findings.map((f, k) => ({ f, k, i, rule })).filter((x) => !x.f.done);
    })
    .map(({ f, k, i, rule }) => {
      const due = addMonthsToDate(i.doneDate ?? i.dueDate, FIX_MONTHS);
      return {
        id: `WO-F-${i.id}-${k}`, source: 'finding' as const, title: `[${rule?.name ?? i.ruleId} 지적] ${f.text}`,
        equipment: rule?.equipment, equipmentGuessed: false, due, overdue: due < today, status: 'open' as const,
        ref: { inspectionId: i.id, findingIndex: k },
      };
    });
  const fromRequests: WorkOrder[] = requests
    .filter((r) => r.buildingId === b.id && r.category === '시설' && r.status !== 'done')
    .map((r) => {
      const eq = guessEquipment(r.text);
      return {
        id: `WO-R-${r.id}`, source: 'request' as const, title: `[민원] ${r.text}`, equipment: eq, equipmentGuessed: !!eq,
        due: r.dueDate, overdue: r.dueDate < today, assignee: r.assignee, status: r.status, ref: { requestId: r.id },
      };
    });
  return [...fromFindings, ...fromRequests].sort((a, c) => a.due.localeCompare(c.due));
}
