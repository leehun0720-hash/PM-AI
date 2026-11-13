import { useState } from 'react';
import { Badge, Btn, Card, Empty, Field, inputCls, Note, Page, Stat, Table, Tabs, td, tdNum, th } from '../components/ui';
import { daysBetween, monthRange, pct, won } from '../engine/money';
import { today, useBuilding, useStore } from '../store/store';
import ImportDialog from './accounting/ImportDialog';
import RecvImportDialog from './accounting/RecvImportDialog';

type Tab = 'ledger' | 'receivables' | 'budget';

export default function Accounting() {
  const b = useBuilding();
  const s = useStore();
  const now = today();
  const [tab, setTab] = useState<Tab>('ledger');
  const [month, setMonth] = useState(s.seedMonth);
  const [importOpen, setImportOpen] = useState(false);
  const [recvOpen, setRecvOpen] = useState(false);
  const [undoMsg, setUndoMsg] = useState<Record<string, string>>({});
  const batches = s.importBatches.filter((x) => x.buildingId === b.id && x.kind === (tab === 'receivables' ? 'receivable' : 'expense'));
  const [form, setForm] = useState({ itemId: s.items[0].id, account: s.items[0].accounts[0], vendor: '', amount: '', memo: '' });
  const ledger = s.expenses.filter((e) => e.buildingId === b.id && e.month === month);
  const accounts = [...new Set(s.items.flatMap((i) => i.accounts))];
  const rc = s.receivables.filter((r) => r.buildingId === b.id).sort((a, c) => c.month.localeCompare(a.month));
  const unpaid = rc.filter((r) => r.paid < r.billed);
  const overdue = unpaid.filter((r) => r.dueDate < now);
  const year = Number(s.seedMonth.slice(0, 4));
  const ytdMonths = monthRange(s.seedMonth, 12).filter((m) => m.startsWith(String(year)));
  const budgets = s.budgets.filter((x) => x.buildingId === b.id && x.year === year);
  const actual = (itemId: string) => s.expenses.filter((e) => e.buildingId === b.id && e.itemId === itemId && ytdMonths.includes(e.month)).reduce((a, e) => a + e.amount, 0);
  const itemName = (id: string) => s.items.find((i) => i.id === id)?.name ?? id;
  const byAccount = accounts.map((a) => ({ a, sum: ledger.filter((e) => e.account === a).reduce((x, e) => x + e.amount, 0) })).filter((x) => x.sum);

  return (
    <Page title="회계" desc="지출 원장, 관리비 수납·미수, 예산 대비 실적을 관리합니다. 쓰던 엑셀이나 ERP에서 내보낸 파일을 그대로 올려 받을 수 있습니다."
      actions={<select aria-label="월" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm" value={month} onChange={(e) => setMonth(e.target.value)}>{monthRange(s.seedMonth, 12).reverse().map((m) => <option key={m}>{m}</option>)}</select>}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={`${month} 지출`} value={won(ledger.reduce((a, e) => a + e.amount, 0))} sub={`원장 ${ledger.length}건`} />
        <Stat label="미수금" value={won(unpaid.reduce((a, r) => a + r.billed - r.paid, 0))} tone={unpaid.length ? 'warn' : 'good'} sub={`${unpaid.length}건`} />
        <Stat label="연체(납기 경과)" value={won(overdue.reduce((a, r) => a + r.billed - r.paid, 0))} tone={overdue.length ? 'bad' : 'good'} sub={`${overdue.length}건`} />
        <Stat label={`${year}년 예산 집행률`} value={budgets.length ? pct(budgets.reduce((a, x) => a + actual(x.itemId), 0) / budgets.reduce((a, x) => a + x.amount, 0), 0) : '—'} sub={`${ytdMonths.length}개월 경과 (기준 ${pct(ytdMonths.length / 12, 0)})`} />
      </div>

      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ id: 'ledger', label: '지출 원장' }, { id: 'receivables', label: `수납·미수 (${unpaid.length})` }, { id: 'budget', label: '예산 대비 실적' }]} />

      {(tab === 'ledger' || tab === 'receivables') && (
        <div className="flex justify-end"><Btn onClick={() => (tab === 'ledger' ? setImportOpen(true) : setRecvOpen(true))}>{tab === 'ledger' ? '지출 파일로 가져오기' : '수납 파일로 가져오기'}</Btn></div>
      )}
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} buildingId={b.id} month={month} />
      <RecvImportDialog open={recvOpen} onClose={() => setRecvOpen(false)} buildingId={b.id} month={month} />

      {tab === 'ledger' && (
        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <Card title={`${month} 지출 원장`} right={<span className="num text-xs text-slate-500">{byAccount.map((x) => `${x.a} ${won(x.sum)}`).slice(0, 2).join(' · ')}</span>}>
            <Table head={<tr><th className={th}>번호</th><th className={th}>계정</th><th className={th}>관리비 항목</th><th className={th}>거래처</th><th className={th}>적요</th><th className={`${th} text-right`}>금액</th></tr>}>
              {ledger.map((e) => {
                const mis = !s.items.find((i) => i.id === e.itemId)?.accounts.includes(e.account);
                return <tr key={e.id}><td className={`${td} num text-xs text-slate-500`}>{e.id}</td><td className={td}>{e.account}{mis && <Badge tone="amber">매핑 불일치</Badge>}</td><td className={td}>{itemName(e.itemId)}</td><td className={td}>{e.vendor}</td><td className={td}>{e.memo}</td><td className={tdNum}>{won(e.amount)}</td></tr>;
              })}
            </Table>
          </Card>
          <Card title="지출 등록">
            <div className="space-y-3">
              <Field label="관리비 항목"><select className={inputCls} value={form.itemId} onChange={(e) => setForm({ ...form, itemId: e.target.value, account: s.items.find((i) => i.id === e.target.value)!.accounts[0] })}>{s.items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></Field>
              <Field label="회계 계정"><select className={inputCls} value={form.account} onChange={(e) => setForm({ ...form, account: e.target.value })}>{accounts.map((a) => <option key={a}>{a}</option>)}</select></Field>
              <Field label="거래처"><input className={inputCls} value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} /></Field>
              <Field label="금액(원)"><input className={inputCls} inputMode="numeric" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/\D/g, '') })} /></Field>
              <Field label="적요"><input className={inputCls} value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} /></Field>
              <Btn variant="primary" className="w-full" disabled={!form.vendor.trim() || !Number(form.amount)} onClick={() => { s.addExpense({ buildingId: b.id, month, itemId: form.itemId, account: form.account, vendor: form.vendor.trim(), amount: Number(form.amount), memo: form.memo.trim() || itemName(form.itemId) }); setForm({ ...form, vendor: '', amount: '', memo: '' }); }}>{month} 원장에 등록</Btn>
              <Note>등록 후 관리비 메뉴에서 정산을 재실행하면 안분과 이상치 탐지에 반영됩니다.</Note>
            </div>
          </Card>
        </div>
      )}
      {(tab === 'ledger' || tab === 'receivables') && batches.length > 0 && (
        <Card title="가져온 기록">
          <Table head={<tr><th className={th}>파일</th><th className={th}>가져온 시각</th><th className={`${th} text-right`}>건수</th><th className={`${th} text-right`}>{tab === 'receivables' ? '수납액' : '금액'}</th><th className={th}>대상 월</th><th className={th}>상태</th></tr>}>
            {batches.map((x) => (
              <tr key={x.id}>
                <td className={td}>{x.fileName}<p className="text-xs text-slate-500">{x.actor}</p></td>
                <td className={`${td} num text-xs`}>{x.at.slice(0, 16).replace('T', ' ')}</td>
                <td className={tdNum}>{x.count}건</td>
                <td className={tdNum}>{won(x.amount)}</td>
                <td className={td}>{x.months.join(', ')}</td>
                <td className={td}>
                  {x.undoneAt ? <Badge tone="gray">되돌림</Badge> : <Btn onClick={() => { const r = s.undoImport(x.id); setUndoMsg({ ...undoMsg, [x.id]: r.ok ? '' : r.reason }); }}>되돌리기</Btn>}
                  {undoMsg[x.id] && <p className="mt-1 text-xs text-red-600">{undoMsg[x.id]}</p>}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      {tab === 'receivables' && (
        <Card title="관리비 수납 현황">
          {rc.length === 0 ? <Empty>고지 내역이 없습니다.</Empty> : (
            <Table head={<tr><th className={th}>고지 월</th><th className={th}>임차인</th><th className={`${th} text-right`}>고지액</th><th className={`${th} text-right`}>수납액</th><th className={`${th} text-right`}>미수</th><th className={th}>납기</th><th className={th}>상태</th><th className={th}></th></tr>}>
              {rc.map((r) => {
                const due = r.billed - r.paid;
                const late = due > 0 && r.dueDate < now;
                return (
                  <tr key={r.id}><td className={`${td} num`}>{r.month}</td><td className={td}>{r.tenant}</td><td className={tdNum}>{won(r.billed)}</td><td className={tdNum}>{won(r.paid)}</td><td className={`${tdNum} ${due ? 'font-semibold text-red-600' : ''}`}>{won(due)}</td><td className={`${td} num`}>{r.dueDate}</td>
                    <td className={td}>{due === 0 ? <Badge tone="green">완납</Badge> : late ? <Badge tone="red">연체 {daysBetween(r.dueDate, now)}일</Badge> : r.paid > 0 ? <Badge tone="amber">부분 수납</Badge> : <Badge>납기 전</Badge>}</td>
                    <td className={td}>{due > 0 && <Btn onClick={() => s.recordPayment(r.id)}>수납 확인</Btn>}</td></tr>
                );
              })}
            </Table>
          )}
          <div className="mt-3"><Note>고지액은 승인된 정산에서 자동 생성됩니다. 수납 확인은 은행 거래내역 연동 전 단계로, 담당자가 입금을 확인한 뒤 수동 처리합니다.</Note></div>
        </Card>
      )}

      {tab === 'budget' && (
        <Card title={`${year}년 예산 대비 실적 (${ytdMonths.length}개월 누계)`}>
          <Table head={<tr><th className={th}>항목</th><th className={`${th} text-right`}>연 예산</th><th className={`${th} text-right`}>누계 실적</th><th className={`${th} text-right`}>집행률</th><th className={th}>진행</th><th className={th}>판정</th></tr>}>
            {budgets.map((x) => {
              const a = actual(x.itemId);
              const r = a / x.amount;
              const pace = ytdMonths.length / 12;
              return (
                <tr key={x.itemId}><td className={td}>{itemName(x.itemId)}</td><td className={tdNum}>{won(x.amount)}</td><td className={tdNum}>{won(a)}</td><td className={tdNum}>{pct(r, 0)}</td>
                  <td className={td}><div className="relative h-2 w-32 rounded-full bg-slate-100"><div className={`h-2 rounded-full ${r > pace * 1.1 ? 'bg-red-500' : 'bg-brand-500'}`} style={{ width: `${Math.min(100, r * 100)}%` }} /><div className="absolute top-[-3px] h-[14px] w-px bg-slate-500" style={{ left: `${pace * 100}%` }} /></div></td>
                  <td className={td}>{r > pace * 1.1 ? <Badge tone="red">초과 추세</Badge> : r < pace * 0.8 ? <Badge tone="blue">집행 저조</Badge> : <Badge tone="green">정상</Badge>}</td></tr>
              );
            })}
          </Table>
          <div className="mt-3"><Note>세로선은 경과 월 기준 집행 기준선입니다. 예산은 전년 실적의 103%로 만든 샘플입니다.</Note></div>
        </Card>
      )}
    </Page>
  );
}
