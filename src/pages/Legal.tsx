import { ExternalLink, Loader2, Search } from 'lucide-react';
import { useState } from 'react';
import { Badge, Btn, Card, Empty, Field, inputCls, Note, Page, Stat, Tabs } from '../components/ui';
import type { LegalCase } from '../domain/types';
import { ISSUES, lawApiPath, lawSiteSearchUrl, parseLawResponse, type LawHit, type LawTarget } from '../engine/legal';
import { won } from '../engine/money';
import { getProvider } from '../llm/adapter';
import { legalMemo, type AiResult } from '../llm/tasks';
import { today, useBuilding, useStore } from '../store/store';

type Tab = 'cases' | 'search' | 'issues';
const ST = { open: ['접수', 'amber'], negotiating: ['협의 중', 'blue'], closed: ['종결', 'gray'] } as const;

export default function Legal() {
  const b = useBuilding();
  const s = useStore();
  const [tab, setTab] = useState<Tab>('cases');
  const cases = s.legalCases.filter((c) => c.buildingId === b.id);
  const [sel, setSel] = useState<LegalCase | null>(cases[0] ?? null);
  const [issueId, setIssueId] = useState(sel?.issueId ?? ISSUES[0].id);
  const issue = ISSUES.find((i) => i.id === issueId)!;
  const [target, setTarget] = useState<LawTarget>('prec');
  const [query, setQuery] = useState(issue.keywords[0]);
  const [hits, setHits] = useState<LawHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [memo, setMemo] = useState<AiResult<string> | null>(null);
  const [memoBusy, setMemoBusy] = useState(false);
  const [form, setForm] = useState({ title: '', counterparty: '', amount: '', summary: '' });

  async function search(q = query, t = target) {
    setQuery(q); setTarget(t); setErr(''); setHits(null);
    if (!s.settings.lawOc) { setErr('국가법령정보 Open API 사용자 ID(OC)가 설정되지 않았습니다. 설정에서 입력하거나, 아래 링크로 국가법령정보센터에서 직접 검색하세요.'); return; }
    setBusy(true);
    try {
      const res = await fetch(lawApiPath(t, q, s.settings.lawOc));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.text();
      let json: unknown;
      try { json = JSON.parse(body); } catch { throw new Error('API가 JSON이 아닌 응답을 돌려주었습니다. OC 값과 API 활용 신청 상태를 확인하세요.'); }
      setHits(parseLawResponse(t, json));
      s.log('법령 API 검색', t === 'prec' ? '판례' : '법령', q);
    } catch (e) {
      setErr(`법령 API 호출 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
  }

  async function writeMemo() {
    setMemoBusy(true); setErr('');
    try {
      const r = await legalMemo(await getProvider(s.settings), issue, sel?.summary ?? '', hits ?? []);
      setMemo(r);
      s.log('법무 검토 메모 초안', sel?.id ?? issue.id, issue.name, { modelVersion: r.modelVersion });
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setMemoBusy(false); }
  }

  function pick(c: LegalCase) { setSel(c); setIssueId(c.issueId); setQuery(ISSUES.find((i) => i.id === c.issueId)!.keywords[0]); setHits(null); setMemo(null); setTab('search'); }

  return (
    <Page title="법무" desc="분쟁 사례를 쟁점별로 관리하고, 국가법령정보 Open API로 법령·판례를 찾아 검토 메모 초안을 만듭니다.">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="진행 중 사례" value={`${cases.filter((c) => c.status !== 'closed').length}건`} />
        <Stat label="다툼 금액" value={won(cases.filter((c) => c.status !== 'closed').reduce((a, c) => a + c.amount, 0))} />
        <Stat label="종결 사례" value={`${cases.filter((c) => c.status === 'closed').length}건`} sub="유사 사례 참고용" />
        <Stat label="법령 API" value={s.settings.lawOc ? '연결됨' : '미설정'} tone={s.settings.lawOc ? 'good' : 'warn'} sub="국가법령정보 공동활용" />
      </div>

      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ id: 'cases', label: '사례' }, { id: 'search', label: '법령·판례 검색' }, { id: 'issues', label: '쟁점별 기준 조문' }]} />

      {tab === 'cases' && (
        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <Card title="분쟁·자문 사례">
            {cases.length === 0 ? <Empty>등록된 사례가 없습니다.</Empty> : (
              <ul className="space-y-3">
                {cases.map((c) => (
                  <li key={c.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{c.title}</span>
                      <Badge tone="blue">{ISSUES.find((i) => i.id === c.issueId)?.name}</Badge><Badge tone={ST[c.status][1]}>{ST[c.status][0]}</Badge>
                      <span className="num ml-auto text-sm text-slate-600">{won(c.amount)}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{c.openedAt} · 상대방 {c.counterparty}</p>
                    <p className="mt-2 text-sm text-slate-700">{c.summary}</p>
                    {c.outcome && <p className="mt-1 text-sm text-emerald-700">결과: {c.outcome}</p>}
                    <Btn variant="ghost" className="mt-2 !px-0" onClick={() => pick(c)}><Search size={14} />관련 법령·판례 찾기</Btn>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="사례 등록">
            <div className="space-y-3">
              <Field label="제목"><input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
              <Field label="쟁점"><select className={inputCls} value={issueId} onChange={(e) => setIssueId(e.target.value)}>{ISSUES.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></Field>
              <Field label="상대방"><input className={inputCls} value={form.counterparty} onChange={(e) => setForm({ ...form, counterparty: e.target.value })} /></Field>
              <Field label="다툼 금액(원)"><input className={inputCls} inputMode="numeric" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/\D/g, '') })} /></Field>
              <Field label="사실관계"><textarea className={`${inputCls} h-24`} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} /></Field>
              <Btn variant="primary" className="w-full" disabled={!form.title.trim() || !form.summary.trim()} onClick={() => { s.addLegalCase({ buildingId: b.id, title: form.title.trim(), issueId, status: 'open', openedAt: today(), counterparty: form.counterparty.trim() || '—', amount: Number(form.amount) || 0, summary: form.summary.trim() }); setForm({ title: '', counterparty: '', amount: '', summary: '' }); }}>등록</Btn>
            </div>
          </Card>
        </div>
      )}

      {tab === 'search' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="검색">
            {sel && <p className="mb-3 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">사례: {sel.title}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="쟁점"><select className={inputCls} value={issueId} onChange={(e) => { setIssueId(e.target.value); setQuery(ISSUES.find((i) => i.id === e.target.value)!.keywords[0]); }}>{ISSUES.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></Field>
              <Field label="대상"><select className={inputCls} value={target} onChange={(e) => setTarget(e.target.value as LawTarget)}><option value="prec">판례</option><option value="law">법령</option></select></Field>
            </div>
            <div className="mt-3 flex gap-2">
              <input aria-label="검색어" className={inputCls} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} />
              <Btn variant="primary" disabled={busy || !query.trim()} onClick={() => search()}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}검색</Btn>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">{issue.keywords.map((k) => <button key={k} onClick={() => search(k, 'prec')} className="rounded-full border border-slate-200 px-2.5 py-0.5 text-xs text-slate-600 hover:bg-slate-50">{k}</button>)}</div>
            {err && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{err}</p>}
            <a className="mt-3 inline-flex items-center gap-1 text-sm text-brand-600 hover:underline" href={lawSiteSearchUrl(target, query)} target="_blank" rel="noreferrer">국가법령정보센터에서 “{query}” 검색 <ExternalLink size={13} /></a>

            <div className="mt-4">
              {hits === null ? <Empty>검색 결과가 여기에 표시됩니다.</Empty> : hits.length === 0 ? <Empty>검색 결과가 없습니다.</Empty> : (
                <ul className="divide-y divide-slate-100">
                  {hits.map((h, i) => (
                    <li key={i} className="py-2"><a href={h.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-brand-700 hover:underline">{h.title}</a><p className="num text-xs text-slate-500">{h.sub} · {h.date}</p></li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
          <Card title="검토 메모 초안 (L0)" right={<Btn disabled={memoBusy} onClick={writeMemo}>{memoBusy && <Loader2 size={14} className="animate-spin" />}초안 작성</Btn>}>
            <h4 className="text-xs font-semibold text-slate-500">기준 조문</h4>
            <ul className="mt-1 space-y-1 text-sm">{issue.statutes.map((x, i) => <li key={i}><a className="text-brand-700 hover:underline" href={lawSiteSearchUrl('law', x.law)} target="_blank" rel="noreferrer">{x.law}</a> {x.article}</li>)}</ul>
            {memo ? <><pre className="mt-4 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-sans text-sm leading-relaxed text-slate-800">{memo.value}</pre><p className="mt-2 text-xs text-slate-500">작성: {memo.modelVersion}</p></> : <Empty>‘초안 작성’을 누르면 쟁점·조문·검색된 판례를 묶어 메모 초안을 만듭니다.</Empty>}
            <Note>이 화면은 법률 자문이 아닙니다. 판례는 API 검색 결과만 표시하며 임의로 만들어 내지 않습니다. 판시 내용은 반드시 원문으로 확인하고 변호사 검토를 거치세요.</Note>
          </Card>
        </div>
      )}

      {tab === 'issues' && (
        <div className="grid gap-4 md:grid-cols-2">
          {ISSUES.map((i) => (
            <Card key={i.id} title={i.name}>
              <p className="text-sm text-slate-600">{i.desc}</p>
              <ul className="mt-3 space-y-1 text-sm">{i.statutes.map((x, k) => <li key={k}><a className="text-brand-700 hover:underline" href={lawSiteSearchUrl('law', x.law)} target="_blank" rel="noreferrer">{x.law}</a> <span className="text-slate-700">{x.article}</span></li>)}</ul>
              <div className="mt-3 flex flex-wrap gap-1.5">{i.keywords.map((k) => <a key={k} href={lawSiteSearchUrl('prec', k)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-0.5 text-xs text-slate-600 hover:bg-slate-50">판례: {k}<ExternalLink size={11} /></a>)}</div>
            </Card>
          ))}
        </div>
      )}
    </Page>
  );
}
