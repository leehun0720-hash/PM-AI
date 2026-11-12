import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AXIS, Badge, Btn, Card, ChartTip, GRID, Note, Page, SampleTag, SERIES, Stat, Table, Tabs, td, tdNum, th } from '../components/ui';
import { capIntensity, EMISSION_VERSION, emissions, FACTORS, misalignmentYear, pathwayIntensity } from '../engine/emissions';
import { monthRange, pct, won, wonShort } from '../engine/money';
import { defaultScenarios, loadProfile, runScenario, TARIFF_VERSION } from '../engine/tariff';
import { useBuilding, useStore } from '../store/store';

type Tab = 'usage' | 'tariff' | 'meters' | 'carbon';

export default function Utilities() {
  const b = useBuilding();
  const s = useStore();
  const [tab, setTab] = useState<Tab>('usage');
  const months = monthRange(s.seedMonth, 12);
  const energy = s.energy.filter((e) => e.buildingId === b.id);
  const last12 = energy.filter((e) => months.includes(e.month));
  const prev12 = energy.filter((e) => monthRange(months[0], 13).slice(0, 12).includes(e.month));
  const cost = (m: string, items: string[]) => s.expenses.filter((e) => e.buildingId === b.id && e.month === m && items.includes(e.itemId)).reduce((a, e) => a + e.amount, 0);
  const scenarios = useMemo(() => defaultScenarios(b).map((x) => runScenario(b, months, x)), [b.id, s.seedMonth]); // eslint-disable-line react-hooks/exhaustive-deps
  const base = scenarios[0];
  const em = emissions(b, last12);
  const year = Number(s.seedMonth.slice(0, 4));
  const cap = capIntensity(b.type, year);
  const mis = misalignmentYear(b.type, em.intensity, year);
  const kwh = last12.reduce((a, e) => a + e.electricKwh, 0);
  const kwhPrev = prev12.reduce((a, e) => a + e.electricKwh, 0);

  const usageData = last12.map((e) => ({ month: e.month.slice(2), 전기: cost(e.month, ['COMMON_ELEC', 'UNIT_ELEC']), 가스: cost(e.month, ['GAS']), 수도: cost(e.month, ['WATER']) }));
  const peakData = last12.map((e) => ({ month: e.month.slice(2), 최대수요: e.peakKw }));
  const dayProfile = useMemo(() => {
    const p = loadProfile(b, s.seedMonth);
    let best = 0;
    for (let i = 0; i < p.length; i++) if (p[i] > p[best]) best = i;
    const d = Math.floor(best / 96);
    return Array.from({ length: 96 }, (_, q) => ({ t: `${String(Math.floor(q / 4)).padStart(2, '0')}:${String((q % 4) * 15).padStart(2, '0')}`, 수요전력: Math.round(p[d * 96 + q]) }));
  }, [b.id, s.seedMonth]); // eslint-disable-line react-hooks/exhaustive-deps
  const pathData = Array.from({ length: 6 }, (_, i) => year + i * 5).map((y) => ({ year: String(y), 감축경로: +pathwayIntensity(b.type, y).toFixed(1), 현재수준: +em.intensity.toFixed(1) }));

  function exportCsv() {
    const rows = [['asset', 'month', 'electricity_kwh', 'gas_m3', 'water_m3', 'scope1_tco2e', 'scope2_tco2e'], ...last12.map((e) => [b.name, e.month, e.electricKwh, e.gasM3, e.waterM3, ((e.gasM3 * FACTORS.gasKgPerM3) / 1000).toFixed(2), ((e.electricKwh / 1000) * FACTORS.electricTPerMwh).toFixed(2)])];
    const url = URL.createObjectURL(new Blob(['﻿' + rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' }));
    Object.assign(document.createElement('a'), { href: url, download: `pmai-energy-${b.id}-${s.seedMonth}.csv` }).click();
    URL.revokeObjectURL(url);
  }

  return (
    <Page title="수광열비" desc="전기·가스·수도 사용량과 요금을 추적하고, 요금제·계약전력 시나리오와 탄소 배출을 계산합니다." actions={<SampleTag>검침·요금표 예시값</SampleTag>}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="최근 12개월 수광열비" value={`${wonShort(usageData.reduce((a, d) => a + d.전기 + d.가스 + d.수도, 0))}원`} sub="지출 원장 기준" />
        <Stat label="전력 사용량" value={`${(kwh / 1000).toFixed(0)} MWh`} sub={kwhPrev ? `직전 12개월 대비 ${pct(kwh / kwhPrev - 1)}` : ''} />
        <Stat label="최대수요 / 계약전력" value={`${Math.round(base.annualPeakKw).toLocaleString()} / ${b.contractPowerKw.toLocaleString()} kW`} sub={`이용률 ${pct(base.annualPeakKw / b.contractPowerKw, 0)}`} tone={base.annualPeakKw / b.contractPowerKw < 0.7 ? 'warn' : 'default'} />
        <Stat label="탄소 원단위" value={`${em.intensity.toFixed(1)} kg/㎡`} sub={`허용 원단위 예시 ${cap.toFixed(1)}`} tone={em.intensity > cap ? 'bad' : 'good'} />
      </div>

      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ id: 'usage', label: '사용·요금 추이' }, { id: 'tariff', label: '전기요금 시나리오' }, { id: 'meters', label: '호실 검침' }, { id: 'carbon', label: '탄소·ESG' }]} />

      {tab === 'usage' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="월별 수광열비 (원)">
            <div className="h-64">
              <ResponsiveContainer><BarChart data={usageData} barCategoryGap="28%">
                <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="month" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} /><YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => wonShort(v)} width={52} />
                <Tooltip content={<ChartTip unit="원" />} cursor={{ fill: '#f1f5f9' }} /><Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
                <Bar isAnimationActive={false} dataKey="전기" stackId="a" fill={SERIES[0]} stroke="#fff" strokeWidth={1} /><Bar isAnimationActive={false} dataKey="가스" stackId="a" fill={SERIES[1]} stroke="#fff" strokeWidth={1} /><Bar isAnimationActive={false} dataKey="수도" stackId="a" fill={SERIES[2]} stroke="#fff" strokeWidth={1} radius={[4, 4, 0, 0]} />
              </BarChart></ResponsiveContainer>
            </div>
          </Card>
          <Card title="월별 최대수요전력 (kW)">
            <div className="h-64">
              <ResponsiveContainer><LineChart data={peakData}>
                <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="month" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} /><YAxis tick={AXIS} tickLine={false} axisLine={false} domain={[0, Math.ceil((b.contractPowerKw * 1.05) / 100) * 100]} width={48} />
                <Tooltip content={<ChartTip unit=" kW" />} /><ReferenceLine y={b.contractPowerKw} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: `계약전력 ${b.contractPowerKw.toLocaleString()}kW`, position: 'insideTopRight', fontSize: 11, fill: '#5b6779' }} />
                <Line isAnimationActive={false} dataKey="최대수요" stroke={SERIES[0]} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </LineChart></ResponsiveContainer>
            </div>
          </Card>
          <Card title={`피크 발생일 15분 수요전력 (${s.seedMonth})`} className="lg:col-span-2">
            <div className="h-56">
              <ResponsiveContainer><LineChart data={dayProfile}>
                <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="t" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} interval={11} /><YAxis tick={AXIS} tickLine={false} axisLine={false} width={48} />
                <Tooltip content={<ChartTip unit=" kW" />} /><Line isAnimationActive={false} dataKey="수요전력" stroke={SERIES[0]} strokeWidth={2} dot={false} />
              </LineChart></ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}

      {tab === 'tariff' && (
        <Card title="연간 전기요금 시나리오 비교" right={<SampleTag>{TARIFF_VERSION}</SampleTag>}>
          <Table head={<tr><th className={th}>시나리오</th><th className={`${th} text-right`}>계약전력</th><th className={`${th} text-right`}>기본요금</th><th className={`${th} text-right`}>전력량요금 등</th><th className={`${th} text-right`}>연간 합계(세금 포함)</th><th className={`${th} text-right`}>현행 대비</th><th className={th}>주의</th></tr>}>
            {scenarios.map((r) => (
              <tr key={r.id} className={r.id === 'current' ? 'bg-slate-50' : ''}>
                <td className={`${td} font-medium`}>{r.name}</td><td className={tdNum}>{r.contractKw.toLocaleString()} kW</td><td className={tdNum}>{won(r.annualBasic)}</td><td className={tdNum}>{won(r.annualEnergy)}</td>
                <td className={`${tdNum} font-semibold`}>{won(r.annualTotal)}</td>
                <td className={`${tdNum} ${r.annualTotal < base.annualTotal ? 'text-emerald-600' : r.annualTotal > base.annualTotal ? 'text-red-600' : ''}`}>{r.id === 'current' ? '—' : `${r.annualTotal <= base.annualTotal ? '−' : '+'} ${won(Math.abs(base.annualTotal - r.annualTotal))}`}</td>
                <td className={td}>{r.overContractMonths > 0 ? <Badge tone="red">계약전력 초과 {r.overContractMonths}개월</Badge> : r.id === 'shave' ? <Badge tone="amber">운영 조치 필요</Badge> : '—'}</td>
              </tr>
            ))}
          </Table>
          <div className="mt-3"><Note>요금 단가·할증·요금적용전력 산식은 구조를 보여 주기 위한 예시값입니다. 실제 의사결정 전 한전 요금표와 파워플래너 15분 데이터로 교체하세요. 계산 방식: 15분 수요전력 → 시간대별(경부하·중간·최대) 사용량 → 기본요금(연중 최대수요 기준) + 전력량요금 + 부가 요금 + 부가세·기금.</Note></div>
        </Card>
      )}

      {tab === 'meters' && (
        <Card title={`호실별 검침 (${s.seedMonth})`}>
          <Table head={<tr><th className={th}>호실</th><th className={`${th} text-right`}>전기 (kWh)</th><th className={`${th} text-right`}>전기 비중</th><th className={`${th} text-right`}>수도 (㎥)</th><th className={`${th} text-right`}>전용면적당 kWh</th></tr>}>
            {(() => {
              const rs = s.readings.filter((r) => r.month === s.seedMonth && r.unitId.startsWith(`${b.id}-`));
              const tot = rs.filter((r) => r.type === 'electric').reduce((a, r) => a + r.usage, 0) || 1;
              return s.units.filter((u) => u.buildingId === b.id).map((u) => {
                const e = rs.find((r) => r.unitId === u.id && r.type === 'electric')?.usage ?? 0;
                return <tr key={u.id}><td className={td}>{u.floor} {u.name}</td><td className={tdNum}>{e.toLocaleString()}</td><td className={tdNum}>{pct(e / tot)}</td><td className={tdNum}>{(rs.find((r) => r.unitId === u.id && r.type === 'water')?.usage ?? 0).toLocaleString()}</td><td className={tdNum}>{(e / u.exclusiveArea).toFixed(1)}</td></tr>;
              });
            })()}
          </Table>
          <div className="mt-3"><Note>이 검침값이 관리비의 전용전기료·수도료·공용전기료(혼합 50%) 안분 기준으로 그대로 쓰입니다.</Note></div>
        </Card>
      )}

      {tab === 'carbon' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="온실가스 배출 (최근 12개월)" right={<Btn onClick={exportCsv}>자산 데이터 CSV</Btn>}>
            <dl className="num space-y-2 text-sm">
              <div className="flex justify-between"><dt>Scope 1 (도시가스)</dt><dd>{em.scope1.toFixed(1)} tCO2e</dd></div>
              <div className="flex justify-between"><dt>Scope 2 (전력)</dt><dd>{em.scope2.toFixed(1)} tCO2e</dd></div>
              <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold"><dt>합계</dt><dd>{em.total.toFixed(1)} tCO2e</dd></div>
              <div className="flex justify-between"><dt>전력 원단위(EUI)</dt><dd>{em.eui.toFixed(1)} kWh/㎡</dd></div>
              <div className="flex justify-between"><dt>허용 배출량 대비</dt><dd className={em.intensity > cap ? 'text-red-600' : 'text-emerald-600'}>{pct(em.intensity / cap, 0)} ({em.intensity > cap ? '초과' : '이내'})</dd></div>
              <div className="flex justify-between"><dt>감축 경로 이탈 예상 연도</dt><dd>{mis ?? '2050년까지 경로 이내'}</dd></div>
            </dl>
            <div className="mt-3"><Note>{EMISSION_VERSION} — 배출계수(전력 {FACTORS.electricTPerMwh} tCO2e/MWh, 가스 {FACTORS.gasKgPerM3} kg/㎥), 허용 원단위, 감축 경로는 예시값입니다. 임차인 사용분(Scope 3) 수집은 포함하지 않았습니다.</Note></div>
          </Card>
          <Card title="감축 경로 대비 현재 수준 (kgCO2e/㎡)">
            <div className="h-64">
              <ResponsiveContainer><LineChart data={pathData}>
                <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="year" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} /><YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} />
                <Tooltip content={<ChartTip unit=" kg/㎡" />} /><Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
                <Line isAnimationActive={false} dataKey="감축경로" stroke={SERIES[0]} strokeWidth={2} dot={{ r: 3 }} /><Line isAnimationActive={false} dataKey="현재수준" stroke={SERIES[1]} strokeWidth={2} strokeDasharray="5 4" dot={false} />
              </LineChart></ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}
    </Page>
  );
}
