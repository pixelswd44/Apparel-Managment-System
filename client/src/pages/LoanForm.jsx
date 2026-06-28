import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Save, Check, HandCoins } from 'lucide-react';
import api from '../lib/api';

const inputCls = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all bg-white placeholder:text-slate-400';

function Field({ label, required, hint, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
        {label}{required && <span className="text-rose-400 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-2xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

export default function LoanForm() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const direction = params.get('direction') || 'borrowed';

  const isBorrowed = direction === 'borrowed';
  const label      = isBorrowed ? 'Borrowed from Friend' : 'Lent to Friend';

  const [form, setForm] = useState({
    person_name: '',
    amount:      '',
    date:        new Date().toISOString().slice(0, 10),
    notes:       '',
  });
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSave() {
    if (!form.person_name) { setError('Friend\'s name is required.'); return; }
    if (!form.amount)      { setError('Amount is required.'); return; }
    if (!form.date)        { setError('Date is required.'); return; }
    setSaving(true); setError('');
    try {
      await api.post('/loans', { ...form, direction });
      setSaved(true);
      setTimeout(() => navigate('/loans'), 800);
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to save.');
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-xl mx-auto animate-page">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/loans')}
          className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-2.5">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0
            ${isBorrowed ? 'bg-rose-50 border border-rose-200' : 'bg-emerald-50 border border-emerald-200'}`}>
            <HandCoins size={16} className={isBorrowed ? 'text-rose-600' : 'text-emerald-600'} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Add {label}</h1>
            <p className="text-xs text-slate-500">
              {isBorrowed ? 'Record money a friend lent you' : 'Record money you lent to a friend'}
            </p>
          </div>
        </div>
      </div>

      {/* Form card */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-5">

        {/* Direction badge */}
        <div className={`flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl w-fit
          ${isBorrowed ? 'bg-rose-50 text-rose-700 border border-rose-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'}`}>
          <HandCoins size={12} />
          {isBorrowed ? 'I borrowed this money — I owe them' : 'I lent this money — they owe me'}
        </div>

        <Field label="Friend's Name" required>
          <input
            className={inputCls}
            placeholder="e.g. Ali, Ahmed, Sara…"
            value={form.person_name}
            onChange={e => set('person_name', e.target.value)}
            autoFocus
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Amount (PKR)" required>
            <input
              type="number" min="0" step="1"
              className={inputCls}
              placeholder="0"
              value={form.amount}
              onChange={e => set('amount', e.target.value)}
            />
          </Field>

          <Field label="Date" required>
            <input
              type="date"
              className={inputCls}
              value={form.date}
              onChange={e => set('date', e.target.value)}
            />
          </Field>
        </div>

        <Field label="Notes" hint="Optional — purpose, occasion, or any context">
          <textarea
            className={`${inputCls} resize-none`}
            rows={3}
            placeholder="e.g. For business investment, wedding expenses…"
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
          />
        </Field>

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-2.5 rounded-xl">
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button onClick={() => navigate('/loans')}
            className="flex-1 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors font-medium">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || saved}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-xl text-white transition-colors disabled:opacity-70
              ${saved ? 'bg-emerald-500' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
            {saving ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              : saved ? <Check size={15} /> : <Save size={15} />}
            {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Entry'}
          </button>
        </div>
      </div>
    </div>
  );
}
