import { useState } from 'react';
import { Btn, Card, Field, inputCls, Note, Page } from '../components/ui';
import { SERVICES } from '../data/services';
import { useStore, type Settings as S } from '../store/store';

export default function Settings() {
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  const reset = useStore((s) => s.resetData);
  const [confirm, setConfirm] = useState(false);
  return (
    <Page title="설정" desc="사용자, AI 모델, 법령 API, 부가 서비스 링크를 설정합니다. 모든 값은 이 브라우저에만 저장됩니다.">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="사용자">
          <Field label="이름 (감사 로그에 기록)"><input className={inputCls} value={settings.userName} onChange={(e) => update({ userName: e.target.value })} /></Field>
          <div className="mt-3"><Note>역할은 상단 바에서 전환합니다. 시연용 전환이며 실제 로그인·권한 관리는 서버 구축 단계에서 붙입니다.</Note></div>
        </Card>
        <Card title="AI 모델 (어댑터)">
          <div className="space-y-3">
            <Field label="제공자"><select className={inputCls} value={settings.provider} onChange={(e) => update({ provider: e.target.value as S['provider'] })}><option value="claude">Claude (기본)</option><option value="gemini">Gemini</option><option value="none">사용 안 함 — 규칙 기반</option></select></Field>
            <Field label="Claude API 키"><input type="password" autoComplete="off" className={inputCls} placeholder="sk-ant-..." value={settings.claudeKey} onChange={(e) => update({ claudeKey: e.target.value.trim() })} /></Field>
            <Field label="Gemini API 키"><input type="password" autoComplete="off" className={inputCls} value={settings.geminiKey} onChange={(e) => update({ geminiKey: e.target.value.trim() })} /></Field>
            <Note>키는 이 브라우저에 저장되고 브라우저에서 모델 API로 직접 전송됩니다. 시연·내부 검증용으로만 쓰고, 고객 운영 전에는 서버 프록시 뒤로 옮기세요. 키가 없으면 모든 AI 기능이 규칙 기반으로 동작합니다.</Note>
          </div>
        </Card>
        <Card title="국가법령정보 Open API">
          <Field label="사용자 ID (OC)"><input className={inputCls} placeholder="open.law.go.kr에서 발급받은 ID" value={settings.lawOc} onChange={(e) => update({ lawOc: e.target.value.trim() })} /></Field>
          <div className="mt-3"><Note>법무 메뉴의 법령·판례 검색에 사용합니다. 국가법령정보 공동활용 사이트에서 Open API 활용 신청 후 받은 ID를 넣으세요. 호출은 같은 출처의 /lawapi 경로로 중계됩니다(개발 서버·배포 설정에 포함).</Note></div>
        </Card>
        <Card title="부가 서비스 안내 링크">
          <div className="space-y-3">
            {SERVICES.filter((x) => !x.internal).map((x) => <Field key={x.id} label={x.name}><input className={inputCls} type="url" placeholder="https://" value={settings.serviceLinks[x.id] ?? ''} onChange={(e) => update({ serviceLinks: { ...settings.serviceLinks, [x.id]: e.target.value.trim() } })} /></Field>)}
          </div>
        </Card>
        <Card title="데이터">
          <p className="text-sm text-slate-600">정산·승인·감사 로그를 지우고 샘플 데이터를 처음 상태로 되돌립니다. 설정값은 유지됩니다.</p>
          <div className="mt-3 flex gap-2">
            {confirm ? <><Btn variant="danger" onClick={() => { reset(); setConfirm(false); }}>정말 초기화</Btn><Btn onClick={() => setConfirm(false)}>취소</Btn></> : <Btn variant="danger" onClick={() => setConfirm(true)}>샘플 데이터로 초기화</Btn>}
          </div>
        </Card>
      </div>
    </Page>
  );
}
