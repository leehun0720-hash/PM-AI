import { PackagePlus } from 'lucide-react';
import { useState } from 'react';
import { Badge, Btn, Card, Empty, inputCls, Note, Page, Stat, StatusBadge, Table, Tabs, td, tdNum, th } from '../components/ui';
import { reorderSuggestions, stockValue } from '../engine/inventory';
import { won } from '../engine/money';
import { today, useBuilding, useStore } from '../store/store';

type Tab = 'stock' | 'reorder' | 'orders' | 'moves';

export default function Inventory() {
  const b = useBuilding();
  const s = useStore();
  const [tab, setTab] = useState<Tab>('stock');
  const [qty, setQty] = useState<Record<string, string>>({});
  const stock = s.stock.filter((x) => x.buildingId === b.id);
  const orders = s.purchaseOrders.filter((p) => p.buildingId === b.id);
  const moves = s.stockMoves.filter((m) => stock.some((x) => x.id === m.itemId)).sort((a, c) => c.date.localeCompare(a.date));
  const onOrder = new Set(orders.filter((p) => p.status === 'pending' || p.status === 'approved').flatMap((p) => p.lines.map((l) => l.itemId)));
  const sugg = reorderSuggestions(stock, s.stockMoves, today());
  const name = (id: string) => stock.find((x) => x.id === id)?.name ?? id;
  const unit = (id: string) => stock.find((x) => x.id === id)?.unit ?? '';

  function orderAll() {
    const todo = sugg.filter((x) => !onOrder.has(x.itemId));
    const byVendor = new Map<string, typeof todo>();
    for (const x of todo) { const v = stock.find((i) => i.id === x.itemId)!.vendor; byVendor.set(v, [...(byVendor.get(v) ?? []), x]); }
    for (const [vendor, list] of byVendor) s.createPurchaseOrder(b.id, vendor, list.map((x) => ({ itemId: x.itemId, qty: x.suggestedQty, unitPrice: stock.find((i) => i.id === x.itemId)!.unitPrice })));
    setTab('orders');
  }

  return (
    <Page title="수발주·재고" desc="자재·소모품 재고를 관리하고, 출고 실적으로 재주문을 제안합니다. 발주는 승인(L2)을 거쳐 입고 처리합니다.">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="품목 수" value={`${stock.length}개`} />
        <Stat label="재고 금액" value={won(stockValue(stock))} />
        <Stat label="재주문 필요" value={`${sugg.length}개`} tone={sugg.length ? 'warn' : 'good'} sub="재주문점 이하" />
        <Stat label="진행 중 발주" value={`${orders.filter((p) => p.status === 'pending' || p.status === 'approved').length}건`} />
      </div>

      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ id: 'stock', label: '재고 현황' }, { id: 'reorder', label: `발주 제안 (${sugg.length})` }, { id: 'orders', label: '발주서' }, { id: 'moves', label: '입출고 이력' }]} />

      {tab === 'stock' && (
        <Card title="재고 현황">
          <Table head={<tr><th className={th}>품목</th><th className={th}>분류</th><th className={`${th} text-right`}>현재고</th><th className={`${th} text-right`}>안전재고</th><th className={`${th} text-right`}>단가</th><th className={th}>거래처</th><th className={th}>상태</th><th className={th}>출고</th></tr>}>
            {stock.map((x) => (
              <tr key={x.id}><td className={`${td} font-medium`}>{x.name}</td><td className={td}>{x.category}</td><td className={`${tdNum} ${x.qty < x.safetyQty ? 'font-semibold text-red-600' : ''}`}>{x.qty}{x.unit}</td><td className={tdNum}>{x.safetyQty}{x.unit}</td><td className={tdNum}>{won(x.unitPrice)}</td><td className={td}>{x.vendor}</td>
                <td className={td}>{x.qty < x.safetyQty ? <Badge tone="red">안전재고 미달</Badge> : onOrder.has(x.id) ? <Badge tone="blue">발주 중</Badge> : <Badge tone="green">정상</Badge>}</td>
                <td className={td}><div className="flex gap-1"><input aria-label={`${x.name} 출고 수량`} className={`${inputCls} !w-16 !py-1`} inputMode="numeric" placeholder="수량" value={qty[x.id] ?? ''} onChange={(e) => setQty({ ...qty, [x.id]: e.target.value.replace(/\D/g, '') })} /><Btn disabled={!Number(qty[x.id])} onClick={() => { s.moveStock(x.id, 'out', Number(qty[x.id]), '현장 사용'); setQty({ ...qty, [x.id]: '' }); }}>출고</Btn></div></td></tr>
            ))}
          </Table>
        </Card>
      )}

      {tab === 'reorder' && (
        <Card title="발주 제안 (L1)" right={<Btn variant="primary" disabled={!sugg.some((x) => !onOrder.has(x.itemId))} onClick={orderAll}><PackagePlus size={14} />거래처별 발주서 만들기</Btn>}>
          {sugg.length === 0 ? <Empty>재주문이 필요한 품목이 없습니다.</Empty> : (
            <Table head={<tr><th className={th}>품목</th><th className={`${th} text-right`}>월평균 출고</th><th className={`${th} text-right`}>재주문점</th><th className={`${th} text-right`}>제안 수량</th><th className={`${th} text-right`}>금액</th><th className={th}>근거</th></tr>}>
              {sugg.map((x) => <tr key={x.itemId} className="align-top"><td className={`${td} font-medium`}>{name(x.itemId)}{onOrder.has(x.itemId) && <Badge tone="blue">발주 중</Badge>}</td><td className={tdNum}>{x.avgMonthlyOut.toFixed(1)}</td><td className={tdNum}>{x.reorderPoint}</td><td className={`${tdNum} font-semibold`}>{x.suggestedQty}{unit(x.itemId)}</td><td className={tdNum}>{won(x.amount)}</td><td className={`${td} max-w-sm text-xs text-slate-500`}>{x.why}</td></tr>)}
            </Table>
          )}
          <div className="mt-3"><Note>제안은 최근 3개월 출고 실적으로 계산합니다. 발주서를 만들면 승인함에 올라가며, 승인 후 입고 처리할 수 있습니다.</Note></div>
        </Card>
      )}

      {tab === 'orders' && (
        <Card title="발주서">
          {orders.length === 0 ? <Empty>발주서가 없습니다.</Empty> : (
            <Table head={<tr><th className={th}>번호</th><th className={th}>일자</th><th className={th}>거래처</th><th className={th}>품목</th><th className={`${th} text-right`}>금액</th><th className={th}>상태</th><th className={th}></th></tr>}>
              {orders.map((p) => <tr key={p.id} className="align-top"><td className={`${td} num`}>{p.id}</td><td className={`${td} num`}>{p.createdAt}</td><td className={td}>{p.vendor}</td><td className={td}>{p.lines.map((l) => <div key={l.itemId} className="num text-xs">{name(l.itemId)} {l.qty}{unit(l.itemId)} × {won(l.unitPrice)}</div>)}</td><td className={tdNum}>{won(p.total)}</td><td className={td}><StatusBadge status={p.status} /></td><td className={td}>{p.status === 'approved' && <Btn onClick={() => s.receivePurchaseOrder(p.id)}>입고 처리</Btn>}{p.status === 'pending' && <span className="text-xs text-slate-500">승인함에서 승인</span>}</td></tr>)}
            </Table>
          )}
        </Card>
      )}

      {tab === 'moves' && (
        <Card title="입출고 이력">
          <Table head={<tr><th className={th}>일자</th><th className={th}>구분</th><th className={th}>품목</th><th className={`${th} text-right`}>수량</th><th className={th}>비고</th></tr>}>
            {moves.slice(0, 60).map((m) => <tr key={m.id}><td className={`${td} num`}>{m.date}</td><td className={td}><Badge tone={m.type === 'in' ? 'green' : 'gray'}>{m.type === 'in' ? '입고' : '출고'}</Badge></td><td className={td}>{name(m.itemId)}</td><td className={tdNum}>{m.qty}{unit(m.itemId)}</td><td className={td}>{m.memo}</td></tr>)}
          </Table>
        </Card>
      )}
    </Page>
  );
}
