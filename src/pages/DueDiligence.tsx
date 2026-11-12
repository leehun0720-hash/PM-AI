import { Activity, BarChart3, Building2, Loader2, PlayCircle, Printer, ShieldCheck, UploadCloud } from 'lucide-react';
import { useState } from 'react';
import MetricCard from '../components/MetricCard';
import RiskMatrix from '../components/RiskMatrix';
import RiskTable from '../components/RiskTable';
import { Badge, Btn, Card, Note, Page } from '../components/ui';
import type { AnalysisResult } from '../domain/ddr';
import { getProvider } from '../llm/adapter';
import { analyzeDueDiligence, type AiResult } from '../llm/tasks';
import { useStore } from '../store/store';

const ZONES = [
  { id: 'financial', title: '재무', icon: BarChart3, hint: 'T12 손익, 렌트롤, 운영 예산' },
  { id: 'physical', title: '물리', icon: Building2, hint: 'PCA 보고서, 설비 이력, CapEx 내역' },
  { id: 'legal', title: '법률·임대차', icon: ShieldCheck, hint: '임대차 요약, SNDA, 에스토펠' },
] as const;

export default function DueDiligence() {
  const s = useStore();
  const [files, setFiles] = useState<Record<string, string[]>>({ financial: [], physical: [], legal: [] });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [res, setRes] = useState<AiResult<AnalysisResult> | null>(null);
  const names = ZONES.flatMap((z) => files[z.id].map((f) => `[${z.title}] ${f}`));

  async function run() {
    setBusy(true); setErr('');
    try {
      const r = await analyzeDueDiligence(await getProvider(s.settings), names.length ? names : ['T12_Statement.pdf', 'PCA_Report.pdf', 'Lease_Abstract.pdf']);
      setRes(r);
      s.log('실사 리스크 분석', r.value.propertyName, `위험 ${r.value.risks.length}건`, { modelVersion: r.modelVersion });
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  const r = res?.value;
  return (
    <Page title="실사 리스크 분석 (DDR)" desc="매입·매각 실사 관점의 재무·물리·법률 위험을 정리하는 보조 도구입니다."
      actions={<>{res && <Btn onClick={() => window.print()}><Printer size={14} />인쇄·PDF</Btn>}<Btn variant="primary" disabled={busy} onClick={run}>{busy ? <Loader2 size={14} className="animate-spin" /> : <PlayCircle size={14} />}{names.length ? '분석 시작' : '시뮬레이션 실행'}</Btn></>}>
      <Note>현재 버전은 업로드한 파일의 본문을 읽지 않고 파일명만 모델에 전달해 가정 기반 시뮬레이션을 만듭니다. 실제 투자 판단에 쓰지 마세요. LLM 키가 없으면 고정 샘플 결과를 보여 줍니다.</Note>
      <div className="no-print grid gap-4 md:grid-cols-3">
        {ZONES.map((z) => (
          <Card key={z.id} title={<span className="flex items-center gap-2"><z.icon size={16} />{z.title}</span>}>
            <p className="text-xs text-slate-500">{z.hint}</p>
            <label className="mt-3 flex h-20 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 text-xs text-slate-500 hover:bg-slate-100">
              <UploadCloud size={20} className="mb-1 text-slate-400" />파일 선택
              <input type="file" multiple className="hidden" onChange={(e) => setFiles({ ...files, [z.id]: [...files[z.id], ...Array.from(e.target.files ?? []).map((f) => f.name)] })} />
            </label>
            <ul className="mt-2 space-y-1">{files[z.id].map((f, i) => <li key={i} className="flex justify-between rounded bg-slate-50 px-2 py-1 text-xs"><span className="truncate">{f}</span><button aria-label="삭제" className="text-slate-400 hover:text-red-500" onClick={() => setFiles({ ...files, [z.id]: files[z.id].filter((_, k) => k !== i) })}>×</button></li>)}</ul>
          </Card>
        ))}
      </div>
      {err && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{err}</p>}
      {r && res && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold">{r.propertyName}</h2><Badge tone={res.usedLlm ? 'blue' : 'violet'}>{res.modelVersion}</Badge></div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <MetricCard title="정규화 NOI" value={`₩${r.financial.normalizedNOI.toLocaleString()}`} subValue={`비반복 조정 −₩${r.financial.nonRecurringAdjustment.toLocaleString()}`} icon={BarChart3} color="blue" />
            <MetricCard title="WALT" value={`${r.financial.walt}년`} subValue={`임차인 집중도 ${r.financial.tenantConcentration}%`} icon={Activity} color={r.financial.walt < 3 ? 'red' : 'green'} />
            <MetricCard title="물리 등급 (SAC)" value={r.physical.sacScore} subValue={`즉시 수선비 ₩${r.physical.immediateCostToCure.toLocaleString()}`} icon={Building2} color={r.physical.sacScore < 3 ? 'red' : 'slate'} />
            <MetricCard title="SNDA" value={r.legal.sndaFlag ? '보호됨' : '위험 노출'} subValue={`CAM 상한 위험 ${r.legal.camCapRisk} · ${r.legal.terminationRisk ? '조기 종료 조항 있음' : '특이사항 없음'}`} icon={ShieldCheck} color={r.legal.sndaFlag ? 'green' : 'red'} />
          </div>
          <Card title="요약"><p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{r.summary}</p><p className="num mt-2 text-xs text-slate-500">HVAC 잔존수명 {r.physical.hvacRUL}년 · 지붕 {r.physical.roofRUL}년 · 시장 관리수수료 반영 영향 ₩{r.financial.marketManagementFeeImpact.toLocaleString()}</p></Card>
          <RiskMatrix risks={r.risks} />
          <RiskTable risks={r.risks} />
        </div>
      )}
    </Page>
  );
}
