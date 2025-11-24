import React from 'react';
import { RiskItem } from '../types';
import { AlertTriangle, ShieldAlert, FileText } from 'lucide-react';

interface RiskTableProps {
  risks: RiskItem[];
}

const RiskTable: React.FC<RiskTableProps> = ({ risks }) => {
  
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'Financial': return <FileText className="w-4 h-4 text-blue-500" />;
      case 'Physical': return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case 'Legal': return <ShieldAlert className="w-4 h-4 text-amber-500" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'Financial': return '재무';
      case 'Physical': return '물리적';
      case 'Legal': return '법률';
      default: return type;
    }
  };

  const getScoreColor = (score: number) => {
      if (score >= 4) return 'bg-red-100 text-red-800';
      if (score === 3) return 'bg-amber-100 text-amber-800';
      return 'bg-emerald-100 text-emerald-800';
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="p-6 border-b border-slate-100">
        <h3 className="text-lg font-semibold text-slate-800">상세 리스크 평가 보고서</h3>
        <p className="text-sm text-slate-500 mt-1">완화 전략이 필요한 리스크 우선순위 목록입니다.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600 font-medium">
            <tr>
              <th className="px-6 py-4">리스크 ID</th>
              <th className="px-6 py-4">유형</th>
              <th className="px-6 py-4 max-w-xs">내용</th>
              <th className="px-6 py-4 text-center">확률</th>
              <th className="px-6 py-4 text-center">영향</th>
              <th className="px-6 py-4">권고 사항</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {risks.map((risk) => (
              <tr key={risk.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4 font-mono text-xs text-slate-500">{risk.id}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    {getTypeIcon(risk.type)}
                    <span className="font-medium text-slate-700">{getTypeLabel(risk.type)}</span>
                  </div>
                </td>
                <td className="px-6 py-4 max-w-xs text-slate-600 leading-relaxed">{risk.description}</td>
                <td className="px-6 py-4 text-center">
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${getScoreColor(risk.probability)}`}>
                        {risk.probability}
                    </span>
                </td>
                <td className="px-6 py-4 text-center">
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${getScoreColor(risk.impact)}`}>
                        {risk.impact}
                    </span>
                </td>
                <td className="px-6 py-4 text-slate-700">
                    <div className="bg-slate-50 p-2 rounded border border-slate-100 text-xs leading-relaxed">
                        {risk.recommendation}
                    </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RiskTable;