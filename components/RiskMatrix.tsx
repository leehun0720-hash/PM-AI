import React from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';
import { RiskItem } from '../types';

interface RiskMatrixProps {
  risks: RiskItem[];
}

const RiskMatrix: React.FC<RiskMatrixProps> = ({ risks }) => {
  
  // Not strictly needed for color mapping but useful for logic if needed
  const getColor = (type: string) => {
    switch (type) {
      case 'Financial': return '#3b82f6'; // blue-500
      case 'Physical': return '#ef4444'; // red-500
      case 'Legal': return '#f59e0b'; // amber-500
      default: return '#64748b';
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

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload as RiskItem;
      return (
        <div className="bg-slate-800 text-white p-3 rounded shadow-lg max-w-xs text-xs z-50">
          <p className="font-bold mb-1">{data.id} ({getTypeLabel(data.type)})</p>
          <p className="mb-2">{data.description}</p>
          <div className="flex gap-2 text-slate-300">
             <span>확률: {data.probability}</span>
             <span>영향: {data.impact}</span>
             <span>신뢰도: {data.confidence}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-[400px] w-full bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-800 mb-4">3차원 리스크 매트릭스 (확률 vs 영향도)</h3>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis 
            type="number" 
            dataKey="probability" 
            name="확률" 
            domain={[0, 6]} 
            ticks={[1, 2, 3, 4, 5]}
            label={{ value: '발생 확률 (Likelihood)', position: 'insideBottom', offset: -10, fontSize: 12 }} 
          />
          <YAxis 
            type="number" 
            dataKey="impact" 
            name="영향" 
            domain={[0, 6]} 
            ticks={[1, 2, 3, 4, 5]}
            label={{ value: '영향도 (Impact)', angle: -90, position: 'insideLeft', fontSize: 12 }} 
          />
          <ZAxis 
            type="number" 
            dataKey="confidence" 
            range={[60, 400]} 
            name="신뢰도" 
          />
          <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
          <Legend verticalAlign="top" height={36}/>
          
          <Scatter name="재무 (Financial)" data={risks.filter(r => r.type === 'Financial')} fill="#3b82f6">
             {risks.filter(r => r.type === 'Financial').map((entry, index) => (
               <Cell key={`cell-f-${index}`} fill="#3b82f6" />
             ))}
          </Scatter>
          <Scatter name="물리적 (Physical)" data={risks.filter(r => r.type === 'Physical')} fill="#ef4444">
             {risks.filter(r => r.type === 'Physical').map((entry, index) => (
               <Cell key={`cell-p-${index}`} fill="#ef4444" />
             ))}
          </Scatter>
          <Scatter name="법률 (Legal)" data={risks.filter(r => r.type === 'Legal')} fill="#f59e0b">
             {risks.filter(r => r.type === 'Legal').map((entry, index) => (
               <Cell key={`cell-l-${index}`} fill="#f59e0b" />
             ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
};

export default RiskMatrix;