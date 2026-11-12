/**
 * 법무 쟁점 카탈로그. 조문은 "어디를 찾아봐야 하는지"의 길잡이이며 법률 자문이 아니다.
 * 판례는 여기 담지 않는다 — 국가법령정보 Open API 검색 결과만 화면에 표시한다(임의 생성 금지).
 */
export interface LegalIssue {
  id: string;
  name: string;
  desc: string;
  statutes: { law: string; article: string }[];
  keywords: string[]; // 판례 검색어
}

export const ISSUES: LegalIssue[] = [
  { id: 'mgmt-fee', name: '관리비 부과·분쟁', desc: '관리비 산정 기준, 공용부분 비용 부담, 체납 관리비 승계', statutes: [{ law: '집합건물의 소유 및 관리에 관한 법률', article: '제17조(공용부분의 부담·수익)' }, { law: '집합건물의 소유 및 관리에 관한 법률', article: '제18조(공용부분에 관하여 발생한 채권의 효력)' }, { law: '집합건물의 소유 및 관리에 관한 법률', article: '제26조(관리인의 보고의무 등)' }], keywords: ['관리비 부과', '체납 관리비 특별승계인', '공용부분 관리비'] },
  { id: 'rent-change', name: '차임 증감', desc: '임대료 인상 한도, 증감청구권 행사 요건', statutes: [{ law: '상가건물 임대차보호법', article: '제11조(차임 등의 증감청구권)' }, { law: '민법', article: '제628조(차임증감청구권)' }], keywords: ['차임증감청구', '상가 임대료 인상'] },
  { id: 'renewal', name: '계약갱신·해지', desc: '갱신요구권, 갱신 거절 사유, 차임 연체와 해지', statutes: [{ law: '상가건물 임대차보호법', article: '제10조(계약갱신 요구 등)' }, { law: '상가건물 임대차보호법', article: '제10조의8(차임연체와 해지)' }, { law: '민법', article: '제640조(차임연체와 해지)' }], keywords: ['계약갱신요구권 상가', '차임연체 해지'] },
  { id: 'restoration', name: '원상복구', desc: '원상회복 범위, 통상의 손모, 보증금 공제', statutes: [{ law: '민법', article: '제615조(차주의 원상회복의무와 철거권)' }, { law: '민법', article: '제654조(준용규정)' }], keywords: ['임차인 원상회복의무 범위', '원상복구 보증금 공제'] },
  { id: 'premium', name: '권리금', desc: '권리금 회수기회 보호, 임대인의 방해 행위', statutes: [{ law: '상가건물 임대차보호법', article: '제10조의4(권리금 회수기회 보호 등)' }], keywords: ['권리금 회수기회 보호'] },
  { id: 'association', name: '관리단 결의·관리인', desc: '집회 소집, 의결 정족수, 관리인 선임·해임, 결의 취소', statutes: [{ law: '집합건물의 소유 및 관리에 관한 법률', article: '제23조(관리단의 당연 설립 등)' }, { law: '집합건물의 소유 및 관리에 관한 법률', article: '제24조(관리인의 선임 등)' }, { law: '집합건물의 소유 및 관리에 관한 법률', article: '제38조(의결 방법)' }, { law: '집합건물의 소유 및 관리에 관한 법률', article: '제42조의2(결의취소의 소)' }], keywords: ['관리단집회 결의 무효', '관리인 선임 결의'] },
  { id: 'vendor', name: '용역계약', desc: '용역대금 과다 청구, 채무불이행, 계약 해지', statutes: [{ law: '민법', article: '제390조(채무불이행과 손해배상)' }, { law: '민법', article: '제544조(이행지체와 해제)' }], keywords: ['용역대금 과다청구 반환', '용역계약 해지'] },
];

export type LawTarget = 'law' | 'prec';

export interface LawHit {
  title: string;
  sub: string;
  date: string;
  url: string;
}

const text = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v : v ? [v as Record<string, unknown>] : []);

/** 국가법령정보 공동활용 Open API 응답(JSON)을 화면용으로 정리한다. */
export function parseLawResponse(target: LawTarget, json: unknown): LawHit[] {
  const root = (json ?? {}) as Record<string, Record<string, unknown>>;
  const abs = (u: string) => (u.startsWith('http') ? u : `https://www.law.go.kr${u}`);
  if (target === 'prec') {
    return arr(root.PrecSearch?.prec).map((r) => ({
      title: text(r['사건명']), sub: [text(r['법원명']), text(r['사건번호']), text(r['판결유형'])].filter(Boolean).join(' · '), date: text(r['선고일자']), url: abs(text(r['판례상세링크'])),
    }));
  }
  return arr(root.LawSearch?.law).map((r) => ({
    title: text(r['법령명한글']), sub: [text(r['법령구분명']), text(r['소관부처명'])].filter(Boolean).join(' · '), date: text(r['시행일자']), url: abs(text(r['법령상세링크'])),
  }));
}

/** 키 없이도 쓸 수 있는 국가법령정보센터 검색 페이지 링크 */
export const lawSiteSearchUrl = (target: LawTarget, query: string) =>
  `https://www.law.go.kr/LSW/${target === 'prec' ? 'precSc.do' : 'lsSc.do'}?query=${encodeURIComponent(query)}`;

export const lawApiPath = (target: LawTarget, query: string, oc: string) =>
  `/lawapi/DRF/lawSearch.do?OC=${encodeURIComponent(oc)}&target=${target}&type=JSON&display=20&query=${encodeURIComponent(query)}`;
