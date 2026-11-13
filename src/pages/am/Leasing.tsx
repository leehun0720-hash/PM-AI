import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AXIS, Badge, Card, ChartTip, Empty, GRID, Note, Page, SampleTag, SERIES, Stat, Table, td, tdNum, th } from '../../components/ui';
import { pct, won, wonShort } from '../../engine/money';
import { buildingKpi, expiryProfile, RENT_GAP, tenantRows } from '../../engine/portfolio';
import { today, useBuilding, useStore } from '../../store/store';

const flagTone = (f: string) => (f.includes('지남') || f.includes('이탈') ? 'red' : f.includes('만기') || f.includes('기한') ? 'amber' : f.includes('인상') ? 'blue' : 'gray');

/** AM — 만기 분포, 임대료 단가, 공실로 임대 전략을 세운다 */
export default function Leasing() {
  const b = useBuilding();
  const s = useStore();
  const now = today();
  const month = s.seedMonth;
  const leases = s.leases.filter((l) => l.buildingId === b.id);
  const units = s.units.filter((u) => u.buildingId === b.id);
  const lines = s.computeLines(b.id, month);
  const k = buildingKpi({ building: b, units: s.units, leases: s.leases, items: s.items, lines, receivables: s.receivables, budgets: s.budgets, expenses: s.expenses, month, today: now });
  const prof = expiryProfile(leases, units, now);
  const rows = tenantRows(leases, units, now);
  const within12 = prof[0]?.share ?? 0;
  const vacantCost = (unitId: string) => lines.filter((l) => l.unitId === unitId && l.payer === 'owner').reduce((a, l) => a + l.amount, 0);

  return (
    <Page title={`임대 전략 · ${b.name}`} desc="만기가 언제 몰리는지, 임차인별 임대료 단가가 건물 평균과 얼마나 다른지, 공실이 소유자에게 매달 얼마를 부담시키는지 봅니다." actions={<SampleTag />}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="평균 임대료 단가" value={`${Math.round(k.avgRentPerSqm).toLocaleString('ko-KR')}원/㎡`} sub="월 임대료 ÷ 계약면적(임대 중)" />
        <Stat label="WALT" value={`${k.waltYears.toFixed(1)}년`} tone={k.waltYears < 2 ? 'warn' : 'default'} />
        <Stat label="1년 안에 만기 오는 임대료" value={pct(within12)} tone={within12 >= 0.3 ? 'bad' : within12 >= 0.15 ? 'warn' : 'good'} sub={prof[0]?.tenants.join(', ') || '없음'} />
        <Stat label="공실" value={`${Math.round(k.rentableArea - k.leasedArea).toLocaleString('ko-KR')}㎡`} tone={k.vacantUnits.length ? 'warn' : 'good'} sub={`${k.vacantUnits.length}개 호실 · 임대율 ${pct(k.occupancy)}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <Card title="만기 분포(월 임대료 비중)">
          <div className="h-56">
            <ResponsiveContainer><BarChart data={prof.map((p) => ({ 구간: p.label, 비중: Math.round(p.share * 1000) / 10 }))} barCategoryGap="30%">
              <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="구간" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} unit="%" width={44} />
              <Tooltip content={<ChartTip unit="%" />} cursor={{ fill: '#f1f5f9' }} /><Bar isAnimationActive={false} dataKey="비중" fill={SERIES[0]} radius={[4, 4, 0, 0]} />
            </BarChart></ResponsiveContainer>
          </div>
        </Card>
        <Card title="공실 호실">
          {k.vacantUnits.length === 0 ? <Empty>공실이 없습니다.</Empty> : (
            <div className="space-y-3">
              {k.vacantUnits.map((u) => (
                <div key={u.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                  <p className="font-semibold text-ink">{u.name} <span className="font-normal text-slate-500">({u.floor} · {u.contractArea.toLocaleString('ko-KR')}㎡)</span></p>
                  <p className="mt-1 text-slate-600">평균 단가 기준 기대 월 임대료 <b className="num">{wonShort(k.avgRentPerSqm * u.contractArea)}</b></p>
                  <p className="text-slate-600">공실로 소유자가 낸 관리비({month}) <b className="num text-red-600">{won(vacantCost(u.id))}</b></p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title="임차인별 단가·만기">
        <Table head={<tr>
          <th className={th}>임차인</th><th className={th}>호실</th><th className={`${th} text-right`}>월 임대료</th><th className={`${th} text-right`}>단가(원/㎡)</th>
          <th className={`${th} text-right`}>평균 대비</th><th className={th}>만기</th><th className={th}>통지 기한</th><th className={th}>인상 조항</th><th className={th}>검토 신호</th>
        </tr>}>
          {rows.map((r) => (
            <tr key={r.lease.id}>
              <td className={td}><p className="font-medium text-ink">{r.lease.tenant}</p><p className="text-xs text-slate-500">{r.lease.industry}</p></td>
              <td className={td}>{r.unit?.name}</td>
              <td className={tdNum}>{won(r.lease.monthlyRent)}</td>
              <td className={tdNum}>{Math.round(r.rentPerSqm).toLocaleString('ko-KR')}</td>
              <td className={`${tdNum} ${r.vsAvg <= -RENT_GAP ? 'text-brand-600' : r.vsAvg >= RENT_GAP ? 'text-red-600' : ''}`}>{r.vsAvg >= 0 ? '+' : ''}{pct(r.vsAvg)}</td>
              <td className={td}>{r.lease.end}<p className="text-xs text-slate-500">{r.monthsLeft}개월 남음</p></td>
              <td className={td}>{r.noticeDate}</td>
              <td className={td}>{{ fixed: `정률 ${pct(r.lease.escalation.rate ?? 0, 0)}`, cpi: '물가 연동', negotiated: '협의' }[r.lease.escalation.type]}</td>
              <td className={td}><div className="flex flex-wrap gap-1">{r.flags.length ? r.flags.map((f) => <Badge key={f} tone={flagTone(f)}>{f}</Badge>) : <span className="text-xs text-slate-400">—</span>}</div></td>
            </tr>
          ))}
        </Table>
      </Card>

      <Note>
        단가 비교는 같은 건물 안의 평균(계약면적 기준)과 견준 것이며, 층·용도·면적 차이를 보정하지 않았습니다. 평균에서 ±{pct(RENT_GAP, 0)}를 넘으면 표시합니다(예시 기준).
        시장 임대료 비교와 인상 상한(상가건물 임대차보호법 5%) 판정은 임대차 화면의 시뮬레이션을 함께 보세요.
      </Note>
    </Page>
  );
}
