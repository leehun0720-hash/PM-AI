import { Bot, Loader2, Send, User } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Btn, Card, inputCls, Note, Page } from '../components/ui';
import { buildFacts, type Fact } from '../engine/facts';
import { getProvider } from '../llm/adapter';
import { ask } from '../llm/tasks';
import { today, useBuilding, useStore } from '../store/store';

interface Msg { role: 'user' | 'ai'; text: string; facts?: Fact[]; model?: string }

const EXAMPLES = ['이번 달 관리비 중 전년 대비 가장 많이 오른 항목과 원인은?', '외주 인보이스에서 과청구로 의심되는 금액은?', '90일 안에 만기나 통지 기한이 오는 임대차는?', '미수금과 연체 현황을 알려줘', '전기요금을 줄일 방법이 있어?', '기한이 임박한 법정점검과 재주문할 자재는?'];

export default function Ask() {
  const b = useBuilding();
  const s = useStore();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const llm = (s.settings.provider === 'claude' && !!s.settings.claudeKey) || (s.settings.provider === 'gemini' && !!s.settings.geminiKey);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setQ(''); setBusy(true);
    setMsgs((m) => [...m, { role: 'user', text }]);
    try {
      const facts = buildFacts(useStore.getState(), b.id, today());
      const r = await ask(await getProvider(s.settings), text, facts);
      setMsgs((m) => [...m, { role: 'ai', text: r.value.text, facts: r.value.facts, model: r.modelVersion }]);
      s.log('AI 비서 질의', b.id, text, { modelVersion: r.modelVersion });
    } catch (e) {
      setMsgs((m) => [...m, { role: 'ai', text: `오류: ${e instanceof Error ? e.message : String(e)}` }]);
    } finally { setBusy(false); }
  }

  return (
    <Page title="AI 비서" desc={`${b.name}의 운영 데이터에 대해 질문하세요. 숫자는 엔진이 계산하고, AI는 그 사실만으로 설명합니다.`} actions={<Badge tone={llm ? 'blue' : 'gray'}>{llm ? `${s.settings.provider} 연결됨` : 'LLM 미연결 — 사실 조회 모드'}</Badge>}>
      <Card>
        <div className="min-h-[18rem] space-y-4">
          {msgs.length === 0 && (
            <div>
              <p className="text-sm text-slate-500">이렇게 물어보세요.</p>
              <div className="mt-3 flex flex-wrap gap-2">{EXAMPLES.map((e) => <button key={e} onClick={() => send(e)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-left text-sm text-slate-700 hover:border-brand-500 hover:text-brand-600">{e}</button>)}</div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : ''}`}>
              {m.role === 'ai' && <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600"><Bot size={16} /></div>}
              <div className={`max-w-2xl rounded-xl px-4 py-2.5 text-sm ${m.role === 'user' ? 'bg-brand-500 text-white' : 'bg-slate-50 text-slate-800'}`}>
                <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                {m.facts && m.facts.length > 0 && (
                  <div className="mt-3 border-t border-slate-200 pt-2">
                    <p className="text-xs font-semibold text-slate-500">근거</p>
                    <ul className="mt-1 space-y-1">{m.facts.map((f) => <li key={f.id} className="text-xs text-slate-600"><Link to={f.link} className="font-semibold text-brand-600 hover:underline">[{f.id}] {f.topic} 화면 열기</Link> — {f.text}</li>)}</ul>
                  </div>
                )}
                {m.model && <p className="mt-2 text-[11px] text-slate-400">{m.model}</p>}
              </div>
              {m.role === 'user' && <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-200 text-slate-600"><User size={16} /></div>}
            </div>
          ))}
          {busy && <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" />답변을 준비하고 있습니다…</p>}
        </div>
        <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); send(q); }}>
          <input aria-label="질문" className={inputCls} placeholder="질문을 입력하세요" value={q} onChange={(e) => setQ(e.target.value)} />
          <Btn variant="primary" type="submit" disabled={busy || !q.trim()}><Send size={14} />보내기</Btn>
        </form>
      </Card>
      <Note>AI 비서는 조회·설명만 합니다. 고지·지급·발주 같은 실행은 각 메뉴의 승인 게이트를 거쳐야 합니다. {!llm && '설정에서 API 키를 넣으면 자연어 설명이 추가됩니다.'}</Note>
    </Page>
  );
}
