import { LlmError, type LlmProvider } from './adapter';

const MODEL = 'gemini-2.5-flash';

/** 선택 제공자. 표준 JSON Schema를 그대로 전달한다(responseJsonSchema). */
export async function geminiProvider(apiKey: string): Promise<LlmProvider> {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });
  async function call(system: string, user: string, schema?: Record<string, unknown>): Promise<string> {
    try {
      const res = await ai.models.generateContent({
        model: MODEL,
        contents: user,
        config: { systemInstruction: system, temperature: 0.2, ...(schema ? { responseMimeType: 'application/json', responseJsonSchema: schema } : {}) },
      });
      if (!res.text) throw new LlmError('Gemini 응답이 비어 있습니다.');
      return res.text;
    } catch (e) {
      if (e instanceof LlmError) throw e;
      throw new LlmError(`Gemini API 오류: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return {
    id: 'gemini',
    modelVersion: MODEL,
    text: (system, user) => call(system, user),
    json: async <T,>(system: string, user: string, schema: Record<string, unknown>) => JSON.parse(await call(system, user, schema)) as T,
  };
}
