import type { Agenda, AgendaKind, Owner, Unit } from '../domain/types';

/**
 * 관리단집회 의결 정족수 — 집합건물법의 구조(구분소유자 수 + 의결권 이중 기준)를 반영한 예시 룰.
 * 규약으로 달리 정할 수 있으므로 건물별 규약과 법무 검토를 거쳐 확정해야 한다.
 */
export const ASSOCIATION_VERSION = 'association-rules-0.1 (예시 · 법무 검토 전)';

export const QUORUM: Record<AgendaKind, { label: string; threshold: number; strict: boolean; basis: string }> = {
  ordinary: { label: '통상 결의', threshold: 1 / 2, strict: true, basis: '집합건물법 제38조 — 구분소유자의 과반수 및 의결권의 과반수' },
  manager: { label: '관리인 선임·해임', threshold: 1 / 2, strict: true, basis: '집합건물법 제24조 — 관리단집회의 결의' },
  bylaw: { label: '규약 설정·변경', threshold: 3 / 4, strict: false, basis: '집합건물법 제29조 — 구분소유자의 4분의 3 이상 및 의결권의 4분의 3 이상' },
};

/** 의결권 = 전유부분 면적 비율 (규약에 다른 정함이 없는 경우) */
export function votingRights(owners: Owner[], units: Unit[]): Record<string, number> {
  const area = (o: Owner) => o.unitIds.reduce((s, id) => s + (units.find((u) => u.id === id)?.exclusiveArea ?? 0), 0);
  const total = owners.reduce((s, o) => s + area(o), 0) || 1;
  return Object.fromEntries(owners.map((o) => [o.id, area(o) / total]));
}

export interface Tally {
  yesHeads: number;
  totalHeads: number;
  headRatio: number;
  rightsRatio: number;
  threshold: number;
  passed: boolean;
  trace: string[];
}

export function tally(agenda: Agenda, owners: Owner[], units: Unit[]): Tally {
  const rights = votingRights(owners, units);
  const q = QUORUM[agenda.kind];
  const yes = owners.filter((o) => agenda.votes[o.id] === 'yes');
  const headRatio = owners.length ? yes.length / owners.length : 0;
  const rightsRatio = yes.reduce((s, o) => s + rights[o.id], 0);
  const meets = (x: number) => (q.strict ? x > q.threshold + 1e-9 : x >= q.threshold - 1e-9);
  const passed = meets(headRatio) && meets(rightsRatio);
  const pc = (x: number) => `${(x * 100).toFixed(1)}%`;
  return {
    yesHeads: yes.length, totalHeads: owners.length, headRatio, rightsRatio, threshold: q.threshold, passed,
    trace: [
      `적용 기준: ${q.basis}`,
      `구분소유자 수 기준: 찬성 ${yes.length}명 / 전체 ${owners.length}명 = ${pc(headRatio)} → ${meets(headRatio) ? '충족' : '미달'}`,
      `의결권(전유면적 비율) 기준: 찬성 ${pc(rightsRatio)} → ${meets(rightsRatio) ? '충족' : '미달'}`,
      `결과: ${passed ? '가결' : '부결'} (두 기준을 모두 충족해야 가결)`,
    ],
  };
}
