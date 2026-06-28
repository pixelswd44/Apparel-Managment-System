import { useState, useEffect } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp, Check, X, HandCoins } from 'lucide-react';
import api from '../lib/api';

const pkr  = n => `Rs ${Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const fmtD = d => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const TABS = [
  { key: 'borrowed', label: 'Borrowed from Friends', sub: 'Money friends lent me — I owe them', color: 'rose' },
  { key: 'lent',     label: 'Lent to Friends',       sub: 'Money I lent — they owe me',         color: 'emerald' },
];

function AddLoanModal({ direction, onSave, onClose }) {
  const [form, setForm] = useState({ person_name: '', amount: '', date: new Date().toISOString().slice(0,10), notes: '' });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSave() {
    if (!form.person_name || !form.amount || !form.date) { setError('Name, amount and date are required.'); return; }
    setSaving(true); setError('');
    try {
      const r = await api.post('/loans', { ...form, direction });
      onSave(r.data);
    } catch (e) { setError(e?.response?.data?.error || 'Save failed'); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-slate-900">
            {direction === 'borrowed' ? 'Add — Borrowed from Friend' : 'Add — Lent to Friend'}
          </h3>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"><X size={16} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Friend's Name</label>
            <input value={form.person_name} onChange={e => set('person_name', e.target.value)}
              placeholder="e.g. Ali, Ahmed…"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Amount (PKR)</label>
              <input type="number" min="0" value={form.amount} onChange={e => set('amount', e.target.value)}
                placeholder="0"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Date</label>
              <input type="date" value={form.date} onChange={e => set('date', e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Notes (optional)</label>
            <input value={form.notes} onChange={e => set('notes', e.target.value)}
              placeholder="Purpose, context…"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
          {error && <p className="text-xs text-rose-600">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-2.5 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-60 font-semibold">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddRepaymentRow({ loanId, onSave }) {
  const [open,   setOpen]   = useState(false);
  const [amount, setAmount] = useState('');
  const [date,   setDate]   = useState(new Date().toISOString().slice(0,10));
  const [notes,  setNotes]  = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!amount || !date) return;
    setSaving(true);
    try {
      const r = await api.post(`/loans/${loanId}/repayments`, { amount, date, notes });
      onSave(r.data);
      setAmount(''); setNotes(''); setOpen(false);
    } catch {}
    finally { setSaving(false); }
  }

  if (!open) return (
    <button onClick={() => setOpen(true)}
      className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-semibold mt-2">
      <Plus size={12} /> Record repayment
    </button>
  );

  return (
    <div className="mt-2 flex items-center gap-2 flex-wrap">
      <input type="number" min="0" placeholder="Amount" value={amount} onChange={e => setAmount(e.target.value)}
        className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-indigo-300" />
      <input type="date" value={date} onChange={e => setDate(e.target.value)}
        className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-300" />
      <input placeholder="Note" value={notes} onChange={e => setNotes(e.target.value)}
        className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs w-32 focus:outline-none focus:ring-1 focus:ring-indigo-300" />
      <button onClick={handleSave} disabled={saving}
        className="px-2.5 py-1.5 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 disabled:opacity-60 font-semibold">
        {saving ? '…' : 'Save'}
      </button>
      <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
    </div>
  );
}

function LoanCard({ loan, color, onDelete, onRepaymentAdded, onRepaymentDeleted }) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const repaid      = loan.repayments.reduce((s, r) => s + parseFloat(r.amount), 0);
  const outstanding = parseFloat(loan.amount) - repaid;
  const pct         = Math.min(100, Math.round((repaid / parseFloat(loan.amount)) * 100)) || 0;
  const settled     = outstanding <= 0;

  async function handleDelete() {
    if (!confirm(`Delete this loan record for ${loan.lender_name}?`)) return;
    setDeleting(true);
    try { await api.delete(`/loans/${loan.id}`); onDelete(loan.id); }
    catch {}
    finally { setDeleting(false); }
  }

  async function deleteRepayment(rid) {
    try { await api.delete(`/loans/${loan.id}/repayments/${rid}`); onRepaymentDeleted(loan.id, rid); }
    catch {}
  }

  const borderColor  = settled ? 'border-emerald-200' : color === 'rose' ? 'border-rose-100' : 'border-slate-200';
  const bgColor      = settled ? 'bg-emerald-50/40' : 'bg-white';
  const amtColor     = settled ? 'text-emerald-600' : color === 'rose' ? 'text-rose-600' : 'text-emerald-600';
  const progressColor= color === 'rose' ? 'bg-rose-400' : 'bg-emerald-500';

  return (
    <div className={`border ${borderColor} ${bgColor} rounded-2xl p-4 shadow-sm`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-slate-900 text-sm">{loan.lender_name}</p>
            {settled && <span className="text-2xs font-semibold px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full">Settled</span>}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">{fmtD(loan.date)}{loan.notes ? ` · ${loan.notes}` : ''}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xs text-slate-400">Total</p>
          <p className="font-bold text-slate-800 text-sm">{pkr(loan.amount)}</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-3">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-slate-500">Repaid: <span className="font-semibold text-slate-700">{pkr(repaid)}</span></span>
          <span className={`font-bold ${amtColor}`}>
            {settled ? 'Fully settled' : `Outstanding: ${pkr(outstanding)}`}
          </span>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full ${progressColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Expand toggle */}
      <div className="flex items-center justify-between mt-3">
        <button onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 font-medium">
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          {loan.repayments.length} repayment{loan.repayments.length !== 1 ? 's' : ''}
        </button>
        <button onClick={handleDelete} disabled={deleting}
          className="p-1.5 text-slate-300 hover:text-rose-500 rounded-lg transition-colors disabled:opacity-40">
          <Trash2 size={13} />
        </button>
      </div>

      {/* Repayment history */}
      {expanded && (
        <div className="mt-3 border-t border-slate-100 pt-3 space-y-1.5">
          {loan.repayments.length === 0 && (
            <p className="text-xs text-slate-400 italic">No repayments yet.</p>
          )}
          {loan.repayments.map(r => (
            <div key={r.id} className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Check size={11} className="text-emerald-500 flex-shrink-0" />
                <span className="font-semibold text-slate-700">{pkr(r.amount)}</span>
                <span className="text-slate-400">{fmtD(r.date)}</span>
                {r.notes && <span className="text-slate-400 truncate">· {r.notes}</span>}
              </div>
              <button onClick={() => deleteRepayment(r.id)} className="text-slate-300 hover:text-rose-500 flex-shrink-0">
                <X size={12} />
              </button>
            </div>
          ))}
          {!settled && (
            <AddRepaymentRow loanId={loan.id} onSave={rep => onRepaymentAdded(loan.id, rep)} />
          )}
        </div>
      )}
    </div>
  );
}

export default function Loans() {
  const [tab,    setTab]    = useState('borrowed');
  const [loans,  setLoans]  = useState([]);
  const [loading,setLoading]= useState(true);
  const [showAdd,setShowAdd]= useState(false);

  async function load(dir) {
    setLoading(true);
    try {
      const r = await api.get(`/loans?direction=${dir}`);
      setLoans(r.data);
    } catch {}
    finally { setLoading(false); }
  }

  useEffect(() => { load(tab); }, [tab]);

  function handleSaved(loan) { setLoans(prev => [loan, ...prev]); setShowAdd(false); }
  function handleDelete(id)  { setLoans(prev => prev.filter(l => l.id !== id)); }

  function handleRepaymentAdded(loanId, rep) {
    setLoans(prev => prev.map(l => l.id === loanId
      ? { ...l, repayments: [...l.repayments, rep] }
      : l
    ));
  }

  function handleRepaymentDeleted(loanId, rid) {
    setLoans(prev => prev.map(l => l.id === loanId
      ? { ...l, repayments: l.repayments.filter(r => r.id !== rid) }
      : l
    ));
  }

  const tabInfo   = TABS.find(t => t.key === tab);
  const totalAmt  = loans.reduce((s, l) => s + parseFloat(l.amount), 0);
  const totalPaid = loans.reduce((s, l) => s + l.repayments.reduce((ss, r) => ss + parseFloat(r.amount), 0), 0);
  const totalOut  = totalAmt - totalPaid;

  return (
    <div className="p-6 animate-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Personal Loans</h1>
          <p className="text-sm text-slate-500 mt-0.5">Track money borrowed from friends and lent to friends</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors">
          <Plus size={15} /> Add Entry
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-5 w-fit">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors
              ${tab === t.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      {!loading && loans.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-5">
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Total {tab === 'borrowed' ? 'Borrowed' : 'Lent'}</p>
            <p className="text-xl font-black text-slate-800">{pkr(totalAmt)}</p>
          </div>
          <div className={`border rounded-2xl p-4 ${tab === 'borrowed' ? 'bg-emerald-50 border-emerald-200' : 'bg-emerald-50 border-emerald-200'}`}>
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 mb-1">Total Repaid</p>
            <p className="text-xl font-black text-emerald-700">{pkr(totalPaid)}</p>
          </div>
          <div className={`border rounded-2xl p-4 ${tab === 'borrowed' ? 'bg-rose-50 border-rose-200' : 'bg-amber-50 border-amber-200'}`}>
            <p className={`text-xs font-bold uppercase tracking-wider mb-1 ${tab === 'borrowed' ? 'text-rose-600' : 'text-amber-600'}`}>
              {tab === 'borrowed' ? 'I Still Owe' : 'Still Owed to Me'}
            </p>
            <p className={`text-xl font-black ${tab === 'borrowed' ? 'text-rose-700' : 'text-amber-700'}`}>{pkr(totalOut)}</p>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16">
          <span className="w-6 h-6 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      ) : loans.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-200 rounded-2xl">
          <HandCoins size={32} className="text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium text-sm">{tabInfo.sub}</p>
          <p className="text-slate-400 text-xs mt-1">Press "Add Entry" to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {loans.map(loan => (
            <LoanCard
              key={loan.id}
              loan={loan}
              color={tab === 'borrowed' ? 'rose' : 'emerald'}
              onDelete={handleDelete}
              onRepaymentAdded={handleRepaymentAdded}
              onRepaymentDeleted={handleRepaymentDeleted}
            />
          ))}
        </div>
      )}

      {showAdd && (
        <AddLoanModal
          direction={tab}
          onSave={handleSaved}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}
