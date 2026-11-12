import type { Building, EnergyMonth } from '../domain/types';

/**
 * 배출계수·허용량·감축 경로는 모두 화면 시연용 "예시값"이다.
 * 실제 보고 전 국가 고시 배출계수, 서울시 총량제 고시, CRREM 공식 경로로 교체해야 한다.
 */
export const EMISSION_VERSION = 'emission-example-0.1 (예시값)';

export const FACTORS = {
  electricTPerMwh: 0.4781, // 전력 (Scope 2)
  gasKgPerM3: 2.176, // 도시가스 LNG (Scope 1)
};

export interface EmissionSummary {
  scope1: number; // tCO2e
  scope2: number;
  total: number;
  intensity: number; // kgCO2e/㎡
  eui: number; // kWh/㎡ (전력 기준)
}

export function emissions(b: Building, months: EnergyMonth[]): EmissionSummary {
  const kwh = months.reduce((s, m) => s + m.electricKwh, 0);
  const gas = months.reduce((s, m) => s + m.gasM3, 0);
  const scope1 = (gas * FACTORS.gasKgPerM3) / 1000;
  const scope2 = (kwh / 1000) * FACTORS.electricTPerMwh;
  const total = scope1 + scope2;
  return { scope1, scope2, total, intensity: (total * 1000) / b.gfa, eui: kwh / b.gfa };
}

/** 총량제 허용 배출 원단위(kgCO2e/㎡·년) 예시 — 5년 단위로 강화되는 구조만 반영 */
const CAP_BASE: Record<Building['type'], number> = { office: 62, logistics: 30, retail: 80 };

export function capIntensity(type: Building['type'], year: number): number {
  const step = Math.max(0, Math.floor((year - 2026) / 5));
  return CAP_BASE[type] * Math.pow(0.87, step);
}

/** CRREM식 탈탄소 경로 예시: 2025년 기준값에서 2050년까지 선형 감축 */
const PATH_2025: Record<Building['type'], number> = { office: 70, logistics: 34, retail: 90 };
const PATH_2050: Record<Building['type'], number> = { office: 6, logistics: 4, retail: 8 };

export function pathwayIntensity(type: Building['type'], year: number): number {
  const t = Math.min(1, Math.max(0, (year - 2025) / 25));
  return PATH_2025[type] + (PATH_2050[type] - PATH_2025[type]) * t;
}

/** 현재 원단위를 유지할 때 경로를 처음 넘어서는 해. 2050년까지 넘지 않으면 null */
export function misalignmentYear(type: Building['type'], intensity: number, fromYear: number): number | null {
  for (let y = fromYear; y <= 2050; y++) if (intensity > pathwayIntensity(type, y)) return y;
  return null;
}
