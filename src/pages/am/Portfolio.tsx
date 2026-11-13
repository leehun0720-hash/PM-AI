import { Note, Page, SampleTag, Stat, Table, td, tdNum, th } from '../../components/ui';
import { pct, won, wonShort } from '../../engine/money';
import { buildingKpi, PORTFOLIO_VERSION, portfolioTotal } from '../../engine/portfolio';
import { today, useStore } from '../../store/store';

/** AM — 운용 중인 모든 자산의 임대수입·NOI·임대율을 한 표로 */
export default function Portfolio() {
  const s = useStore();
  const now = today();
  const month = s.seedMonth;
  const kpis = s.buildings.map((b) => ({
    b,
    k: buildingKpi({ building: b, units: s.units, leases: s.leases, items: s.items, lines: s.computeLines(b.id, month), receivables: s.receivables, budgets: s.budgets, expenses: s.expenses, month, today: now }),
  }));
  const t = portfolioTotal(kpis.map((x) => x.k));

  return (
    <Page title="포트폴리오·NOI" desc={`운용 중인 자산 ${s.buildings.length}개의 임대수입, 소유자 부담 비용, 순영업소득(NOI), 임대율을 ${month} 정산 기준으로 봅니다.`} actions={<SampleTag />}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="월 실수령 임대료" value={wonShort(t.effectiveRent)} sub={`약정 ${wonShort(t.contractRent)} (렌트프리 차이 ${wonShort(t.contractRent - t.effectiveRent)})`} />
        <Stat label="월 NOI" value={wonShort(t.noi)} tone={t.noi > 0 ? 'good' : 'bad'} sub={`연환산 ${wonShort(t.noi * 12)}`} />
        <Stat label="임대율(면적 기준)" value={pct(t.occupancy)} tone={t.occupancy < 0.9 ? 'warn' : 'default'} sub={`${Math.round(t.leasedArea).toLocaleString('ko-KR')} / ${Math.round(t.rentableArea).toLocaleString('ko-KR')}㎡`} />
        <Stat label="WALT(임대료 가중)" value={`${t.waltYears.toFixed(1)}년`} tone={t.waltYears < 2 ? 'warn' : 'default'} sub={`미수 ${wonShort(t.receivable)} · 연체 ${wonShort(t.overdue)}`} />
      </div>

      <section className="rounded-xl border border-slate-200 bg-white">
        <Table head={<tr>
          <th className={th}>자산</th><th className={th}>임대율</th><th className={`${th} text-right`}>약정 임대료</th><th className={`${th} text-right`}>실수령</th>
          <th className={`${th} text-right`}>소유자 부담 운영비</th><th className={`${th} text-right`}>월 NOI</th><th className={`${th} text-right`}>충당금</th>
          <th className={`${th} text-right`}>보증금</th><th className={`${th} text-right`}>연체</th><th className={th}>WALT</th><th className={th}>예산 집행</th>
        </tr>}>
          {kpis.map(({ b, k }) => (
            <tr key={b.id}>
              <td className={td}><p className="font-medium text-ink">{b.name}</p><p className="text-xs text-slate-500">공실 {k.vacantUnits.map((u) => u.name).join(', ') || '없음'}</p></td>
              <td className={tdNum}>{pct(k.occupancy)}</td>
              <td className={tdNum}>{won(k.contractRent)}</td>
              <td className={tdNum}>{won(k.effectiveRent)}</td>
              <td className={tdNum}>{won(k.ownerOpex)}</td>
              <td className={`${tdNum} font-semibold ${k.noi < 0 ? 'text-red-600' : 'text-ink'}`}>{won(k.noi)}</td>
              <td className={tdNum}>{won(k.ownerReserve)}</td>
              <td className={tdNum}>{wonShort(k.deposits)}</td>
              <td className={`${tdNum} ${k.overdue ? 'text-red-600' : ''}`}>{won(k.overdue)}</td>
              <td className={tdNum}>{k.waltYears.toFixed(1)}년</td>
              <td className={tdNum}>{k.budgetUse === null ? '—' : <span className={k.budgetUse > k.budgetPace + 0.05 ? 'text-amber-600' : ''}>{pct(k.budgetUse, 0)} <span className="text-slate-400">/ 기준 {pct(k.budgetPace, 0)}</span></span>}</td>
            </tr>
          ))}
          <tr className="bg-slate-50 font-semibold">
            <td className={td}>합계</td><td className={tdNum}>{pct(t.occupancy)}</td><td className={tdNum}>{won(t.contractRent)}</td><td className={tdNum}>{won(t.effectiveRent)}</td>
            <td className={tdNum}>{won(t.ownerOpex)}</td><td className={tdNum}>{won(t.noi)}</td><td className={tdNum}>{won(t.ownerReserve)}</td>
            <td className={tdNum}>{wonShort(t.deposits)}</td><td className={tdNum}>{won(t.overdue)}</td><td className={tdNum}>{t.waltYears.toFixed(1)}년</td><td className={td} />
          </tr>
        </Table>
      </section>

      <Note>
        산식({PORTFOLIO_VERSION}): <b>월 NOI = 실수령 임대료 − 소유자 부담 운영비.</b> 관리비 중 임차인이 내는 몫은 들어오고 나가는 금액이 같아(실비 정산) NOI에서 빠지고,
        공실분·특약 상한 초과분·소유자 항목처럼 관리비 안분에서 소유자 부담으로 판정된 금액만 비용으로 잡습니다. 장기수선충당금 등 충당금은 자본적 지출 성격이라 NOI 아래에 따로 표시합니다.
        실수령 임대료는 렌트프리 기간을 0으로 봅니다. 임대율은 계약면적 기준, WALT는 남은 계약기간을 월 임대료로 가중 평균한 값입니다. 부가세·감가상각·이자·자산 가치(캡레이트)는 포함하지 않습니다.
      </Note>
    </Page>
  );
}
