import { ArrowRight, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge, Card, Note, Page } from '../components/ui';
import { SERVICES } from '../data/services';
import { useStore } from '../store/store';

export default function Services() {
  const links = useStore((s) => s.settings.serviceLinks);
  return (
    <Page title="부가 서비스" desc="PMAI와 함께 쓰는 서비스 안내입니다. 핵심 업무는 왼쪽 메뉴에서 처리합니다.">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SERVICES.map((x) => (
          <Card key={x.id} title={x.name} right={<Badge tone="blue">{x.tag}</Badge>}>
            <p className="min-h-16 text-sm leading-relaxed text-slate-600">{x.desc}</p>
            <div className="mt-3">
              {x.internal ? <Link to={x.internal} className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline">열기 <ArrowRight size={14} /></Link>
                : links[x.id] ? <a href={links[x.id]} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline">서비스 안내 보기 <ExternalLink size={13} /></a>
                : <Link to="/settings" className="text-sm text-slate-400 hover:underline">안내 링크 미설정 — 설정에서 입력</Link>}
            </div>
          </Card>
        ))}
      </div>
      <Note>안내 링크는 설정 화면에서 서비스별로 입력합니다.</Note>
    </Page>
  );
}
