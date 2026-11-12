import Anthropic from '@anthropic-ai/sdk';
import { LlmError, type LlmProvider } from './adapter';

const MODEL = 'claude-opus-5-5';

/**
 * 브라우저에서 직접 호출한다(시연용). 키는 사용자의 브라우저에만 저장된다.
 * 실고객 운영 전에는 서버 프록시 뒤로 옮겨야 한다.
 */
export function claudeProvider(apiKey: string): LlmProvider {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  async function call(system: string, user: string, schema?: Record<string, unknown>): Promise<string> {
    try {
      const res = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default', // 안전 분류기가 거절하면 서버가 대체 모델로 재시도
        output_config: { effort: 'medium', ...(schema ? { format: { type: 'json_schema', schema } } : {}) },
        system,
        messages: [{ role: 'user', content: user }],
      });
      if (res.stop_reason === 'refusal') throw new LlmError('모델이 이 요청에 응답하지 않았습니다.');
      if (res.stop_reason === 'max_tokens') throw new LlmError('응답이 길이 제한으로 잘렸습니다. 입력을 줄여 다시 시도하세요.');
      return res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    } catch (e) {
      if (e instanceof LlmError) throw e;
      if (e instanceof Anthropic.AuthenticationError) throw new LlmError('Claude API 키가 올바르지 않습니다. 설정에서 확인하세요.');
      if (e instanceof Anthropic.RateLimitError) throw new LlmError('요청 한도를 초과했습니다. 잠시 후 다시 시도하세요.');
      if (e instanceof Anthropic.APIConnectionError) throw new LlmError('Claude API에 연결하지 못했습니다. 네트워크를 확인하세요.');
      if (e instanceof Anthropic.APIError) throw new LlmError(`Claude API 오류 (${e.status}): ${e.message}`);
      throw e;
    }
  }

  return {
    id: 'claude',
    modelVersion: MODEL,
    text: (system, user) => call(system, user),
    json: async <T,>(system: string, user: string, schema: Record<string, unknown>) => JSON.parse(await call(system, user, schema)) as T,
  };
}
