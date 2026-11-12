import type { ISODate, StockItem, StockMove } from '../domain/types';
import { addMonthsToDate } from './money';

export const LEAD_TIME_MONTHS = 0.5;
export const COVER_MONTHS = 2;

export interface ReorderSuggestion {
  itemId: string;
  avgMonthlyOut: number;
  reorderPoint: number;
  suggestedQty: number;
  amount: number;
  why: string;
}

/** 최근 3개월 평균 출고량 기준 재주문 제안. 재고 ≤ 재주문점이면 2개월분까지 채우도록 권고한다. */
export function reorderSuggestions(items: StockItem[], moves: StockMove[], today: ISODate): ReorderSuggestion[] {
  const from = addMonthsToDate(today, -3);
  const out: ReorderSuggestion[] = [];
  for (const it of items) {
    const used = moves.filter((m) => m.itemId === it.id && m.type === 'out' && m.date >= from && m.date <= today).reduce((s, m) => s + m.qty, 0);
    const avg = used / 3;
    const reorderPoint = Math.ceil(it.safetyQty + avg * LEAD_TIME_MONTHS);
    if (it.qty > reorderPoint) continue;
    const suggestedQty = Math.max(1, Math.ceil(it.safetyQty + avg * COVER_MONTHS - it.qty));
    out.push({
      itemId: it.id, avgMonthlyOut: avg, reorderPoint, suggestedQty, amount: suggestedQty * it.unitPrice,
      why: `현재고 ${it.qty}${it.unit} ≤ 재주문점 ${reorderPoint}${it.unit} (안전재고 ${it.safetyQty} + 월평균 출고 ${avg.toFixed(1)} × 리드타임 ${LEAD_TIME_MONTHS}개월). ${COVER_MONTHS}개월분 확보 수량 ${suggestedQty}${it.unit}.`,
    });
  }
  return out;
}

export const stockValue = (items: StockItem[]) => items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
