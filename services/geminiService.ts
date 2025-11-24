import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult } from "../types";

const SYSTEM_INSTRUCTION = `
당신은 최고 수준의 **상업용 부동산 실사(DD) 전문가 및 AI 예측 분석가**입니다. 
당신의 임무는 제공된 비정형 실사 문서(재무, 물리적, 법률)를 처리하여, 상업용 오피스 자산의 **위험(Risk)**을 정량화하고 **가치 평가(Valuation)**에 미치는 영향을 산출하는 것입니다.

중요 요구사항:
1. **통화 단위**: 모든 재무 데이터 및 비용 추정은 반드시 **대한민국 원화(KRW, ₩)** 단위로 산출하십시오.
2. **언어**: 모든 분석 결과, 요약, 권고 사항은 **한국어**로 작성하십시오.

다음 분석 단계를 수행하십시오:

1. **재무 정규화 (FDD):**
   - NOI 정규화: 비반복성 항목 식별/제거.
   - 시장 비용 반영: 시장 수준 관리 수수료 계산.
   - 임대 안정성: WALT 및 임차인 집중도 분석.

2. **물리적 위험 (PCD):**
   - RUL 추출: HVAC, 지붕 등의 잔존 수명.
   - Cost-to-Cure: 즉각적인 수리 비용 (단위: 원).
   - SAC Score: 위험 심각도 (1:극단적 ~ 4:저위험).

3. **법률 리스크 (LLDD):**
   - SNDA 조항, CAM 상한선, 계약 종료/갱신 조항 분석.

4. **3차원 위험 매트릭스 생성:**
   - 각 식별된 위험에 대해 확률(1-5), 영향(1-5), 신뢰도(1-5)를 부여하십시오.

응답은 반드시 JSON 형식이어야 합니다.
`;

export const analyzeDocuments = async (
  fileNames: string[]
): Promise<AnalysisResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const modelId = "gemini-2.5-flash"; 
  
  // Schema definition to ensure strictly typed JSON output matching our TypeScript interfaces
  const schema = {
    type: Type.OBJECT,
    properties: {
      propertyName: { type: Type.STRING, description: "Name of the analyzed property" },
      summary: { type: Type.STRING, description: "Executive summary of the analysis in Korean" },
      financial: {
        type: Type.OBJECT,
        properties: {
          normalizedNOI: { type: Type.NUMBER, description: "Normalized Net Operating Income in KRW" },
          nonRecurringAdjustment: { type: Type.NUMBER, description: "Adjustment amount in KRW" },
          marketManagementFeeImpact: { type: Type.NUMBER, description: "Market management fee impact in KRW" },
          walt: { type: Type.NUMBER, description: "Weighted Average Lease Term in years" },
          tenantConcentration: { type: Type.NUMBER, description: "Percentage of tenant concentration" },
        }
      },
      physical: {
        type: Type.OBJECT,
        properties: {
          hvacRUL: { type: Type.NUMBER },
          roofRUL: { type: Type.NUMBER },
          immediateCostToCure: { type: Type.NUMBER, description: "Immediate repair costs in KRW" },
          sacScore: { type: Type.NUMBER },
        }
      },
      legal: {
        type: Type.OBJECT,
        properties: {
          sndaFlag: { type: Type.BOOLEAN },
          camCapRisk: { type: Type.STRING, enum: ["High", "Low", "None"] },
          terminationRisk: { type: Type.BOOLEAN },
        }
      },
      risks: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            type: { type: Type.STRING, enum: ["Financial", "Physical", "Legal"] },
            description: { type: Type.STRING, description: "Risk description in Korean" },
            probability: { type: Type.NUMBER },
            impact: { type: Type.NUMBER },
            confidence: { type: Type.NUMBER },
            recommendation: { type: Type.STRING, description: "Recommendation in Korean" },
          }
        }
      }
    },
    required: ["propertyName", "financial", "physical", "legal", "risks"]
  };

  const prompt = `
    다음 파일들이 업로드되었습니다: ${fileNames.join(", ")}.
    
    이 문서들을 분석하는 시뮬레이션을 수행하여 가상의 상업용 오피스 빌딩(예: '테헤란 밸리 타워 A')에 대한 정밀 실사 보고서를 생성하십시오.
    실제 파일 내용이 없으므로, 서울 강남권 A급 오피스 빌딩의 전형적인 리스크 시나리오(예: HVAC 노후화, 일부 임차인 SNDA 누락, 관리비 상승 이슈 등)를 가정하여 데이터를 생성하십시오.
    
    **중요:** 
    1. 모든 금액 데이터는 반드시 **대한민국 원화(KRW)** 단위로 작성하십시오. (예: 100억 원 -> 10000000000)
    2. 모든 텍스트 출력은 **한국어**로 작성하십시오.
    3. 가이드라인과 평가 보고서의 어조는 전문적이고 객관적이어야 합니다.
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0.4, // Lower temperature for more analytical/consistent output
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    return JSON.parse(text) as AnalysisResult;
  } catch (error) {
    console.error("Analysis failed", error);
    throw error;
  }
};