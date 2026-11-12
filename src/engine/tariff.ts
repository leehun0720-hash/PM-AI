import type { Building, Month } from '../domain/types';
import { daysInMonth, seededRandom } from './money';

/**
 * 전기요금 모델 — 모든 단가는 화면 시연을 위한 "예시값"이다.
 * 실제 적용 전 한전 전기요금표(계약종별·전압·선택요금)로 교체해야 한다.
 */
export const TARIFF_VERSION = 'tariff-example-0.1 (예시값)';

export type Season = 'summer' | 'winter' | 'mid';
export type Tou = 'off' | 'mid' | 'peak';

export interface TariffOption {
  id: string;
  name: string;
  basicPerKw: number;
  energy: Record<Season, Record<Tou, number>>; // 원/kWh
}

export const TARIFFS: TariffOption[] = [
  { id: 'opt1', name: '선택Ⅰ (기본요금 낮음)', basicPerKw: 7220, energy: { summer: { off: 96, mid: 149, peak: 231 }, mid: { off: 96, mid: 119, peak: 149 }, winter: { off: 103, mid: 149, peak: 206 } } },
  { id: 'opt2', name: '선택Ⅱ (전력량요금 낮음)', basicPerKw: 8320, energy: { summer: { off: 91, mid: 143, peak: 225 }, mid: { off: 91, mid: 114, peak: 143 }, winter: { off: 98, mid: 143, peak: 200 } } },
];

export const SURCHARGE = { climatePerKwh: 9, fuelPerKwh: 5, vat: 0.1, fund: 0.037 };
export const OVER_CONTRACT_MULTIPLIER = 1.5; // 계약전력 초과분 기본요금 할증(예시)
export const MIN_DEMAND_RATIO = 0.3; // 요금적용전력 하한 = 계약전력의 30%(예시)

export const seasonOf = (month: Month): Season => {
  const m = Number(month.slice(5));
  return m >= 6 && m <= 8 ? 'summer' : m >= 11 || m <= 2 ? 'winter' : 'mid';
};

export function touOf(season: Season, hour: number): Tou {
  if (hour >= 22 || hour < 8) return 'off';
  if (season === 'winter') return (hour >= 9 && hour < 12) || (hour >= 16 && hour < 19) ? 'peak' : 'mid';
  return hour === 11 || (hour >= 13 && hour < 18) ? 'peak' : 'mid';
}

const cache = new Map<string, Float32Array>();

/** 15분 수요전력(kW) 샘플 프로파일. 건물·월로 시드가 고정되어 항상 같은 값을 만든다. */
export function loadProfile(b: Pick<Building, 'id' | 'type' | 'contractPowerKw'>, month: Month): Float32Array {
  const key = `${b.id}|${month}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const rnd = seededRandom(key);
  const days = daysInMonth(month);
  const season = seasonOf(month);
  const [y, m] = month.split('-').map(Number);
  const seasonal = season === 'summer' ? 1 : season === 'winter' ? 0.9 : 0.74;
  const base = b.contractPowerKw * (b.type === 'logistics' ? 0.3 : 0.16);
  const peak = b.contractPowerKw * (b.type === 'logistics' ? 0.52 : 0.62) * seasonal;
  const out = new Float32Array(days * 96);
  for (let d = 0; d < days; d++) {
    const dow = new Date(Date.UTC(y, m - 1, d + 1)).getUTCDay();
    const weekend = dow === 0 || dow === 6;
    const dayFactor = (weekend ? (b.type === 'logistics' ? 0.8 : 0.35) : 1) * (0.93 + rnd() * 0.14);
    for (let q = 0; q < 96; q++) {
      const h = q / 4;
      const shape = b.type === 'logistics' ? 0.75 + 0.25 * Math.sin(((h - 3) / 24) * Math.PI * 2) : Math.max(0, Math.sin(((h - 7) / 13) * Math.PI));
      out[d * 96 + q] = base + (peak - base) * shape * dayFactor * (0.97 + rnd() * 0.06);
    }
  }
  cache.set(key, out);
  return out;
}

export interface MonthUsage {
  month: Month;
  kwh: number;
  peakKw: number;
  byTou: Record<Tou, number>;
}

export function summarizeMonth(b: Pick<Building, 'id' | 'type' | 'contractPowerKw'>, month: Month, peakShave = 0): MonthUsage {
  const p = loadProfile(b, month);
  const season = seasonOf(month);
  const rawPeak = p.reduce((mx, v) => (v > mx ? v : mx), 0);
  const limit = rawPeak * (1 - peakShave);
  const byTou: Record<Tou, number> = { off: 0, mid: 0, peak: 0 };
  let peakKw = 0;
  for (let i = 0; i < p.length; i++) {
    const kw = Math.min(p[i], limit); // 피크 억제: 상한 초과분을 잘라냄(부하 이전 효과는 보수적으로 미반영)
    if (kw > peakKw) peakKw = kw;
    byTou[touOf(season, Math.floor((i % 96) / 4))] += kw / 4;
  }
  return { month, kwh: byTou.off + byTou.mid + byTou.peak, peakKw, byTou };
}

export interface BillBreakdown {
  month: Month;
  billingDemandKw: number;
  basic: number;
  overContract: number;
  energy: number;
  surcharge: number;
  vat: number;
  fund: number;
  total: number;
}

export function computeBill(usage: MonthUsage, annualPeakKw: number, contractKw: number, tariff: TariffOption): BillBreakdown {
  const season = seasonOf(usage.month);
  const billingDemandKw = Math.max(annualPeakKw, contractKw * MIN_DEMAND_RATIO);
  const within = Math.min(billingDemandKw, contractKw);
  const basic = Math.round(within * tariff.basicPerKw);
  const overContract = Math.round(Math.max(0, billingDemandKw - contractKw) * tariff.basicPerKw * OVER_CONTRACT_MULTIPLIER);
  const energy = Math.round((['off', 'mid', 'peak'] as Tou[]).reduce((s, t) => s + usage.byTou[t] * tariff.energy[season][t], 0));
  const surcharge = Math.round(usage.kwh * (SURCHARGE.climatePerKwh + SURCHARGE.fuelPerKwh));
  const subtotal = basic + overContract + energy + surcharge;
  const vat = Math.round(subtotal * SURCHARGE.vat);
  const fund = Math.floor((subtotal * SURCHARGE.fund) / 10) * 10;
  return { month: usage.month, billingDemandKw, basic, overContract, energy, surcharge, vat, fund, total: subtotal + vat + fund };
}

export interface Scenario {
  id: string;
  name: string;
  tariffId: string;
  contractKw: number;
  peakShave: number;
}

export interface ScenarioResult extends Scenario {
  annualTotal: number;
  annualBasic: number;
  annualEnergy: number;
  annualPeakKw: number;
  overContractMonths: number;
  bills: BillBreakdown[];
}

export function runScenario(b: Pick<Building, 'id' | 'type' | 'contractPowerKw'>, months: Month[], s: Scenario): ScenarioResult {
  const tariff = TARIFFS.find((t) => t.id === s.tariffId)!;
  const usages = months.map((m) => summarizeMonth(b, m, s.peakShave));
  const annualPeakKw = Math.max(...usages.map((u) => u.peakKw));
  const bills = usages.map((u) => computeBill(u, annualPeakKw, s.contractKw, tariff));
  return {
    ...s, bills, annualPeakKw,
    annualTotal: bills.reduce((a, x) => a + x.total, 0),
    annualBasic: bills.reduce((a, x) => a + x.basic + x.overContract, 0),
    annualEnergy: bills.reduce((a, x) => a + x.energy + x.surcharge, 0),
    overContractMonths: bills.filter((x) => x.overContract > 0).length,
  };
}

export function defaultScenarios(b: Building): Scenario[] {
  const rightSized = Math.ceil((b.contractPowerKw * 0.75) / 50) * 50;
  return [
    { id: 'current', name: '현행', tariffId: 'opt1', contractKw: b.contractPowerKw, peakShave: 0 },
    { id: 'tariff', name: '선택요금 변경', tariffId: 'opt2', contractKw: b.contractPowerKw, peakShave: 0 },
    { id: 'shave', name: '피크 5% 억제', tariffId: 'opt1', contractKw: b.contractPowerKw, peakShave: 0.05 },
    { id: 'contract', name: `계약전력 ${rightSized.toLocaleString()}kW`, tariffId: 'opt1', contractKw: rightSized, peakShave: 0 },
  ];
}
