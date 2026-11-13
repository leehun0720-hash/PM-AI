import type { Building, Equipment, ISODate, Inspection } from '../domain/types';
import { addMonthsToDate, daysBetween } from './money';

/**
 * 법정점검 룰셋 — 주기·대상은 구조를 보여 주기 위한 예시다.
 * 법령 개정이 잦으므로 법무 검토를 거친 버전만 운영에 배포해야 한다.
 */
export const COMPLIANCE_VERSION = 'compliance-rules-0.1 (예시 · 법무 검토 전)';

export interface ComplianceRule {
  id: string;
  name: string;
  law: string;
  cycleMonths: number;
  evidence: string;
  equipment?: Equipment; // 관련 설비(설비 이력 화면에서 묶는 기준). 없으면 건물 공통
  applies: (b: Building) => boolean;
}

export const RULES: ComplianceRule[] = [
  { id: 'fire-op', equipment: 'sprinkler', name: '소방시설 작동점검', law: '소방시설 설치 및 관리에 관한 법률', cycleMonths: 12, evidence: '자체점검 실시결과 보고서', applies: () => true },
  { id: 'fire-full', equipment: 'sprinkler', name: '소방시설 종합점검', law: '소방시설 설치 및 관리에 관한 법률', cycleMonths: 12, evidence: '종합점검 결과 보고서', applies: (b) => b.equipment.includes('sprinkler') && b.gfa >= 5000 },
  { id: 'fire-monthly', name: '소방안전관리 업무 기록', law: '화재의 예방 및 안전관리에 관한 법률', cycleMonths: 1, evidence: '월간 업무수행 기록(2년 보관)', applies: () => true },
  { id: 'elec', equipment: 'substation', name: '전기설비 정기검사', law: '전기안전관리법', cycleMonths: 24, evidence: '정기검사 확인서', applies: (b) => b.equipment.includes('substation') },
  { id: 'elev-reg', equipment: 'elevator', name: '승강기 정기검사', law: '승강기 안전관리법', cycleMonths: 12, evidence: '검사 합격증명서', applies: (b) => b.equipment.includes('elevator') },
  { id: 'elev-self', equipment: 'elevator', name: '승강기 자체점검', law: '승강기 안전관리법', cycleMonths: 1, evidence: '자체점검 기록', applies: (b) => b.equipment.includes('elevator') },
  { id: 'bldg', name: '건축물 정기점검', law: '건축물관리법', cycleMonths: 36, evidence: '정기점검 결과 보고서', applies: (b) => b.gfa >= 3000 },
  { id: 'gas', equipment: 'gas', name: '가스사용시설 정기검사', law: '도시가스사업법', cycleMonths: 12, evidence: '검사 증명서', applies: (b) => b.equipment.includes('gas') },
  { id: 'boiler', equipment: 'boiler', name: '보일러 계속사용검사', law: '에너지이용 합리화법', cycleMonths: 12, evidence: '검사 증명서', applies: (b) => b.equipment.includes('boiler') },
  { id: 'tank', equipment: 'waterTank', name: '저수조 청소', law: '수도법', cycleMonths: 6, evidence: '청소 완료 기록·수질검사 성적서', applies: (b) => b.equipment.includes('waterTank') },
  { id: 'iaq', equipment: 'hvac', name: '실내공기질 측정', law: '실내공기질 관리법', cycleMonths: 12, evidence: '측정 결과 기록', applies: (b) => b.type !== 'logistics' && b.gfa >= 3000 },
];

export const applicableRules = (b: Building) => RULES.filter((r) => r.applies(b));

export type InspectionState = 'done' | 'overdue' | 'due30' | 'due90' | 'scheduled';

export function inspectionState(i: Inspection, today: ISODate): InspectionState {
  if (i.doneDate) return 'done';
  const d = daysBetween(today, i.dueDate);
  return d < 0 ? 'overdue' : d <= 30 ? 'due30' : d <= 90 ? 'due90' : 'scheduled';
}

export const STATE_LABEL: Record<InspectionState, string> = { done: '완료', overdue: '기한 경과', due30: '30일 이내', due90: '90일 이내', scheduled: '예정' };

/** 점검 완료 시 주기에 따라 다음 회차를 만든다 */
export function nextInspection(done: Inspection): Inspection | null {
  const rule = RULES.find((r) => r.id === done.ruleId);
  if (!rule || !done.doneDate) return null;
  const dueDate = addMonthsToDate(done.dueDate, rule.cycleMonths);
  return { id: `${done.buildingId}-${rule.id}-${dueDate}`, buildingId: done.buildingId, ruleId: rule.id, dueDate, findings: [] };
}
