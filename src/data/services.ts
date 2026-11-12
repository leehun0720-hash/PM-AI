// 부가 서비스 안내. 링크 주소는 설정 화면에서 입력한다(코드에 임의 주소를 넣지 않는다).
export interface ExtraService { id: string; name: string; tag: string; desc: string; internal?: string }

export const SERVICES: ExtraService[] = [
  { id: 'studio', name: 'RUNIQ STUDIO', tag: '인테리어', desc: '상담부터 사진 AI 시안, 3D 편집, 가견적, 제안서까지 이어지는 인테리어 업무 도구입니다. 공사 이력을 건물 자산 이력으로 연결합니다.' },
  { id: 'academy', name: 'PMAI Academy', tag: '교육', desc: '도입 조직 임직원을 위한 레벨별 AI 교육과 모듈별 운영자 과정입니다. 사내 강사 양성까지 지원합니다.' },
  { id: 'office', name: '한판오피스', tag: '문서', desc: 'PMAI 데이터로 견적서·정산표·보고서를 만드는 문서·스프레드시트 도구입니다.' },
  { id: 'parking', name: 'QR 주차', tag: '현장', desc: '차단기·정산기 없이 QR로 운영하는 주차 관리 서비스입니다.' },
  { id: 'callcenter', name: 'AI 콜센터', tag: '현장', desc: '임차인·방문객 민원을 1차 응대하고 행정 메뉴의 민원 대장으로 넘깁니다.' },
  { id: 'ddr', name: '실사 리스크 분석 (DDR)', tag: '분석', desc: '매입·매각 실사 문서를 기준으로 재무·물리·법률 위험을 정리하는 보조 도구입니다.', internal: '/due-diligence' },
];
