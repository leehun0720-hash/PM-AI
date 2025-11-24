import React, { useState } from 'react';
import { UploadCloud, ShieldCheck, BarChart3, FileText, Building2, Activity, PlayCircle, Loader2, CheckCircle2, AlertCircle, Download } from 'lucide-react';
import { AnalysisResult, AppState } from './types';
import { analyzeDocuments } from './services/geminiService';
import MetricCard from './components/MetricCard';
import RiskMatrix from './components/RiskMatrix';
import RiskTable from './components/RiskTable';
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

// Categories for the split upload
type Category = 'financial' | 'physical' | 'legal';

interface UploadState {
  financial: File[];
  physical: File[];
  legal: File[];
}

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(AppState.IDLE);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [uploads, setUploads] = useState<UploadState>({
    financial: [],
    physical: [],
    legal: []
  });
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleFileChange = (category: Category, e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      setUploads(prev => ({
        ...prev,
        [category]: [...prev[category], ...newFiles]
      }));
    }
  };

  const removeFile = (category: Category, index: number) => {
    setUploads(prev => ({
      ...prev,
      [category]: prev[category].filter((_, i) => i !== index)
    }));
  };

  const handleAnalyze = async () => {
    if (!process.env.API_KEY) {
      setError("환경 변수(process.env.API_KEY)에서 API 키를 찾을 수 없습니다.");
      return;
    }
    
    // Combine all file names for the simulation
    const allFiles = [
      ...uploads.financial.map(f => `[재무] ${f.name}`),
      ...uploads.physical.map(f => `[물리] ${f.name}`),
      ...uploads.legal.map(f => `[법률] ${f.name}`)
    ];

    // If no files selected, use demo files
    const filesToAnalyze = allFiles.length > 0 
      ? allFiles 
      : ["T12_Statement.pdf (Demo)", "PCA_Report_2024.pdf (Demo)", "Lease_Abstract_Anchor.pdf (Demo)"];
    
    setState(AppState.ANALYZING);
    setError(null);

    try {
      const data = await analyzeDocuments(filesToAnalyze);
      setResult(data);
      setState(AppState.COMPLETE);
    } catch (err) {
      setState(AppState.ERROR);
      setError("분석에 실패했습니다. API 키를 확인하고 다시 시도해주세요.");
    }
  };

  const handleDownloadPDF = async () => {
    const element = document.getElementById('report-container');
    if (!element) return;
    
    setIsDownloading(true);
    try {
      // Capture the element as a canvas
      const canvas = await html2canvas(element, {
        scale: 2, // Higher quality
        useCORS: true,
        logging: false,
        backgroundColor: '#f8fafc' // Match app background
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4'
      });
      
      const imgWidth = 210; // A4 width in mm
      const pageHeight = 297; // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      let heightLeft = imgHeight;
      let position = 0;
      
      // Add first page
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      
      // Add subsequent pages if content overflows
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      
      // Save the PDF
      pdf.save(`DDR_Report_${result?.propertyName || 'Analysis'}.pdf`);
    } catch (err) {
      console.error("PDF generation failed", err);
      setError("PDF 생성 중 오류가 발생했습니다.");
    } finally {
      setIsDownloading(false);
    }
  };

  const UploadZone = ({ 
    category, 
    title, 
    icon: Icon, 
    description, 
    requirements, 
    files 
  }: { 
    category: Category, 
    title: string, 
    icon: any, 
    description: string,
    requirements: string[],
    files: File[] 
  }) => (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-full transition-all hover:border-indigo-300 hover:shadow-md group">
      <div className="p-5 border-b border-slate-100 bg-slate-50/50 rounded-t-xl">
        <div className="flex items-center gap-3 mb-2">
          <div className={`p-2 rounded-lg ${
            category === 'financial' ? 'bg-blue-100 text-blue-600' :
            category === 'physical' ? 'bg-red-100 text-red-600' :
            'bg-amber-100 text-amber-600'
          }`}>
            <Icon size={20} />
          </div>
          <h3 className="font-bold text-slate-800">{title}</h3>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">{description}</p>
      </div>
      
      <div className="p-5 flex-1 flex flex-col">
        <div className="mb-4">
          <p className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1">
            <AlertCircle size={12} className="text-indigo-500"/> AI 분석 필수 데이터:
          </p>
          <ul className="space-y-1.5">
            {requirements.map((req, idx) => (
              <li key={idx} className="text-[11px] text-slate-600 flex items-start gap-1.5">
                <span className="mt-0.5 w-1 h-1 rounded-full bg-slate-400 flex-shrink-0"></span>
                {req}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-auto">
          <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors relative">
            <div className="flex flex-col items-center justify-center pt-2 pb-3">
              <UploadCloud className="w-6 h-6 text-slate-400 mb-1 group-hover:text-indigo-500 transition-colors" />
              <p className="text-xs text-slate-500">클릭하여 파일 업로드</p>
            </div>
            <input type="file" className="hidden" multiple onChange={(e) => handleFileChange(category, e)} />
          </label>

          {files.length > 0 && (
            <div className="mt-3 space-y-1 max-h-24 overflow-y-auto custom-scrollbar">
              {files.map((file, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs bg-slate-50 px-2 py-1.5 rounded border border-slate-100">
                  <span className="truncate max-w-[80%] text-slate-600">{file.name}</span>
                  <button onClick={() => removeFile(category, idx)} className="text-slate-400 hover:text-red-500">
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setState(AppState.IDLE)}>
            <div className="bg-indigo-600 p-1.5 rounded-lg">
              <ShieldCheck className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">DDR AI</h1>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Risk Synthesis Engine</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
             <span className="text-xs font-medium px-2 py-1 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-100">
                Beta v1.0
             </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {state === AppState.IDLE && (
          <div className="max-w-5xl mx-auto mt-4">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold text-slate-900 mb-4">
                상업용 오피스 실사 (DD) 자동화
              </h2>
              <p className="text-slate-600 text-lg max-w-2xl mx-auto">
                방대한 비정형 문서를 AI가 분석하여 위험을 정량화합니다.<br/>
                각 분야별 문서를 아래 구분된 영역에 업로드해 주세요.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
              
              <UploadZone 
                category="financial"
                title="재무 보고서 (Financial)"
                icon={BarChart3}
                description="T12 및 Rent Roll을 기반으로 현금 흐름 안정성을 평가합니다."
                requirements={[
                  "T12 손익계산서 (비반복성 비용 식별용)",
                  "Rent Roll (WALT, 임차인 구성 분석용)",
                  "최근 3년 운영 예산 (OpEx 변동성 확인)"
                ]}
                files={uploads.financial}
              />

              <UploadZone 
                category="physical"
                title="물리적 상태 (Physical)"
                icon={Building2}
                description="PCA 보고서를 분석하여 즉시 수선 비용 및 설비 수명을 예측합니다."
                requirements={[
                  "물리적 상태 평가서 (PCA Report)",
                  "주요 설비(HVAC, 엘리베이터) 이력",
                  "최근 5년 자본적 지출(CapEx) 내역"
                ]}
                files={uploads.physical}
              />

              <UploadZone 
                category="legal"
                title="법률/임대차 (Legal)"
                icon={ShieldCheck}
                description="주요 계약의 독소 조항과 법적 리스크를 추출합니다."
                requirements={[
                  "주요 임차인 임대차 계약 요약본 (Lease Abstract)",
                  "SNDA (비교란 계약) 조항",
                  "Estoppel 증명서 샘플"
                ]}
                files={uploads.legal}
              />
              
            </div>

            <div className="flex flex-col items-center">
              <button 
                onClick={handleAnalyze}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-4 px-10 rounded-full shadow-lg shadow-indigo-200 transition-all transform hover:-translate-y-1 flex items-center gap-2"
              >
                <PlayCircle size={20} />
                {uploads.financial.length + uploads.physical.length + uploads.legal.length === 0 
                  ? "샘플 데이터로 시뮬레이션 실행" 
                  : "종합 리스크 분석 시작"}
              </button>
              {error && <p className="text-red-500 mt-4 text-sm">{error}</p>}
              <p className="mt-4 text-xs text-slate-400">
                * 실제 파일이 업로드되지 않을 경우, AI가 서울 강남권 오피스 시나리오를 가정하여 분석을 수행합니다.
              </p>
            </div>
          </div>
        )}

        {state === AppState.ANALYZING && (
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <Loader2 className="w-16 h-16 text-indigo-600 animate-spin mb-6" />
            <h3 className="text-xl font-semibold text-slate-800">종합 위험 분석 실행 중...</h3>
            <div className="w-72 mt-6 space-y-4">
               <div className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>NOI 정규화 (Financial)</span>
                    <span className="text-indigo-600">처리 중...</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 animate-[pulse_1s_ease-in-out_infinite] w-3/4 rounded-full"></div>
                  </div>
               </div>
               <div className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>RUL 및 CapEx 산출 (Physical)</span>
                    <span className="text-slate-400">대기 중</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-red-400 animate-[pulse_1.5s_ease-in-out_infinite] w-1/2 rounded-full"></div>
                  </div>
               </div>
               <div className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>SNDA/독소 조항 검토 (Legal)</span>
                    <span className="text-slate-400">대기 중</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-400 animate-[pulse_2s_ease-in-out_infinite] w-1/4 rounded-full"></div>
                  </div>
               </div>
            </div>
          </div>
        )}

        {state === AppState.COMPLETE && result && (
          <div className="animate-fade-in space-y-6">
            
            {/* Top Actions Bar */}
            <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div>
                 <h2 className="text-2xl font-bold text-slate-800">{result.propertyName}</h2>
                 <p className="text-sm text-slate-500">분석 완료일: {new Date().toLocaleDateString()}</p>
              </div>
              <button 
                onClick={handleDownloadPDF} 
                disabled={isDownloading}
                className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 text-indigo-700 px-4 py-2 rounded-lg font-medium text-sm transition-colors shadow-sm"
              >
                {isDownloading ? <Loader2 className="animate-spin w-4 h-4"/> : <Download className="w-4 h-4" />}
                PDF 리포트 다운로드
              </button>
            </div>

            {/* Report Container for Capture */}
            <div id="report-container" className="space-y-6 p-1">
              {/* Top Summary Section */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard 
                  title="정규화된 NOI (순영업소득)" 
                  value={`₩${result.financial.normalizedNOI.toLocaleString()}`} 
                  subValue={`조정액: -₩${result.financial.nonRecurringAdjustment.toLocaleString()}`}
                  icon={BarChart3}
                  color="blue"
                />
                <MetricCard 
                  title="평균 임대 잔여기간 (WALT)" 
                  value={`${result.financial.walt}년`} 
                  subValue={`임차인 집중도: ${result.financial.tenantConcentration}%`}
                  icon={Activity}
                  color={result.financial.walt < 3 ? 'red' : 'green'}
                />
                <MetricCard 
                  title="물리적 등급 (SAC)" 
                  value={result.physical.sacScore} 
                  subValue={`즉시 복구 비용: ₩${result.physical.immediateCostToCure.toLocaleString()}`}
                  icon={Building2}
                  color={result.physical.sacScore < 3 ? 'red' : 'slate'}
                />
                 <MetricCard 
                  title="법률 SNDA (비교란)" 
                  value={result.legal.sndaFlag ? "보호됨" : "위험 노출"} 
                  subValue={result.legal.terminationRisk ? "조기 종료 조항 발견" : "주요 특이사항 없음"}
                  icon={ShieldCheck}
                  color={!result.legal.sndaFlag ? 'red' : 'green'}
                />
              </div>

              {/* Executive Summary Text */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 relative overflow-hidden">
                 <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                 <h3 className="text-lg font-semibold text-slate-800 mb-2 flex items-center gap-2">
                   <CheckCircle2 className="text-indigo-500" size={20}/> 
                   AI 핵심 투자 가이드라인
                 </h3>
                 <p className="text-slate-600 leading-relaxed whitespace-pre-line">{result.summary}</p>
              </div>

              {/* Main Analysis: Matrix and Stats */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <RiskMatrix risks={result.risks} />
                </div>
                <div className="space-y-4">
                   {/* Detailed Physical Breakdown */}
                   <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm h-full">
                      <h4 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                         <Building2 size={18} className="text-indigo-500"/> 
                         물리적 시스템 잔존 수명 (RUL)
                      </h4>
                      <div className="space-y-6">
                         <div>
                            <div className="flex justify-between text-sm mb-1">
                               <span className="text-slate-600 font-medium">HVAC (공조) 시스템</span>
                               <span className="font-bold text-slate-800">{result.physical.hvacRUL}년</span>
                            </div>
                            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                               <div className={`h-full rounded-full transition-all duration-1000 ${result.physical.hvacRUL < 5 ? 'bg-red-500' : 'bg-emerald-500'}`} style={{width: `${Math.min((result.physical.hvacRUL / 20) * 100, 100)}%`}}></div>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-1">권장 교체 주기: 20년</p>
                         </div>
                         <div>
                            <div className="flex justify-between text-sm mb-1">
                               <span className="text-slate-600 font-medium">지붕(Roof) 시스템</span>
                               <span className="font-bold text-slate-800">{result.physical.roofRUL}년</span>
                            </div>
                            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                               <div className={`h-full rounded-full transition-all duration-1000 ${result.physical.roofRUL < 5 ? 'bg-red-500' : 'bg-emerald-500'}`} style={{width: `${Math.min((result.physical.roofRUL / 20) * 100, 100)}%`}}></div>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-1">권장 교체 주기: 20년</p>
                         </div>
                      </div>
                      
                      <div className="mt-8 pt-6 border-t border-slate-100">
                         <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                            <ShieldCheck size={18} className="text-amber-500"/> 
                            법률 리스크 심층 검토
                         </h4>
                         <ul className="space-y-3 text-sm">
                            <li className="flex items-center justify-between bg-slate-50 p-2 rounded">
                               <span className="text-slate-600">관리비(CAM) 상한선</span>
                               <span className={`font-medium px-2 py-0.5 rounded text-xs ${result.legal.camCapRisk === 'High' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                 {result.legal.camCapRisk === 'High' ? '높음 (수익성 악화 우려)' : (result.legal.camCapRisk === 'Low' ? '낮음' : '없음')}
                               </span>
                            </li>
                            <li className="flex items-center justify-between bg-slate-50 p-2 rounded">
                               <span className="text-slate-600">조기 종료 위험</span>
                               <span className={`font-medium px-2 py-0.5 rounded text-xs ${result.legal.terminationRisk ? 'bg-red-100 text-red-700' : 'bg-slate-200 text-slate-600'}`}>{result.legal.terminationRisk ? "발견됨 (안정성 저하)" : "없음"}</span>
                            </li>
                         </ul>
                      </div>
                   </div>
                </div>
              </div>

              {/* Detailed Table */}
              <RiskTable risks={result.risks} />
            </div>

            <div className="flex justify-center pb-12 pt-4">
               <button 
                  onClick={() => {
                    setState(AppState.IDLE);
                    setUploads({ financial: [], physical: [], legal: [] });
                    setResult(null);
                  }}
                  className="text-sm text-slate-500 hover:text-indigo-600 font-medium flex items-center gap-2 px-6 py-3 rounded-lg hover:bg-indigo-50 transition-colors"
               >
                  <UploadCloud size={16} />
                  새로운 프로젝트 분석하기
               </button>
            </div>

          </div>
        )}
      </main>
    </div>
  );
};

export default App;