import { useState } from 'react';
import { Card, Empty, inputCls, Page, Table, td, th } from '../components/ui';
import { ROLE_LABEL } from '../domain/types';
import { useStore } from '../store/store';

export default function AuditLog() {
  const audit = useStore((s) => s.audit);
  const [q, setQ] = useState('');
  const rows = audit.filter((a) => !q || `${a.action} ${a.target} ${a.detail} ${a.actor}`.includes(q));
  return (
    <Page title="감사 로그" desc="누가 언제 무엇을 했는지, 어떤 규칙·모델 버전과 입력으로 만들어졌는지 기록합니다." actions={<input aria-label="검색" className={`${inputCls} !w-56`} placeholder="검색" value={q} onChange={(e) => setQ(e.target.value)} />}>
      <Card>
        {rows.length === 0 ? <Empty>기록이 없습니다. 정산 실행·승인·발주 등을 하면 여기에 남습니다.</Empty> : (
          <Table head={<tr><th className={th}>시각</th><th className={th}>사용자</th><th className={th}>행위</th><th className={th}>대상</th><th className={th}>내용</th><th className={th}>규칙·모델 버전</th><th className={th}>입력 해시</th></tr>}>
            {rows.map((a) => <tr key={a.id} className="align-top"><td className={`${td} num whitespace-nowrap text-xs`}>{new Date(a.at).toLocaleString('ko-KR')}</td><td className={`${td} whitespace-nowrap`}>{a.actor}<span className="block text-xs text-slate-400">{ROLE_LABEL[a.role]}</span></td><td className={`${td} whitespace-nowrap font-medium`}>{a.action}</td><td className={`${td} num text-xs`}>{a.target}</td><td className={`${td} max-w-md`}>{a.detail}</td><td className={`${td} text-xs`}>{a.ruleVersion ?? a.modelVersion ?? '—'}</td><td className={`${td} num text-xs`}>{a.inputHash ?? '—'}</td></tr>)}
          </Table>
        )}
      </Card>
    </Page>
  );
}
