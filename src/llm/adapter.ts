// 모델 어댑터 계층: 모든 LLM 호출은 이 인터페이스 뒤에 둔다(3단계 TenOS·온프레미스 교체 대비).
// 원칙: 계산은 엔진이, 설명은 LLM이. LLM에는 엔진이 만든 사실(facts)만 전달한다.
import type { Settings } from '../store/store';

export interface LlmProvider {
  id: string;
  modelVersion: string;
  text(system: string, user: string): Promise<string>;
  json<T>(system: string, user: string, schema: Record<string, unknown>): Promise<T>;
}

export class LlmError extends Error {}

export async function getProvider(settings: Settings): Promise<LlmProvider | null> {
  if (settings.provider === 'claude' && settings.claudeKey) return (await import('./claude')).claudeProvider(settings.claudeKey);
  if (settings.provider === 'gemini' && settings.geminiKey) return (await import('./gemini')).geminiProvider(settings.geminiKey);
  return null;
}

export const FALLBACK_VERSION = 'rule-fallback-1.0 (LLM 미사용)';
