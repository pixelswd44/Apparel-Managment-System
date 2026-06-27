import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import {
  Users, Plus, Search, X, ChevronRight, Edit2, Trash2, Check,
  Phone, Mail, CreditCard, Briefcase, Building2, Calendar, ArrowLeft,
  AlertCircle, AlertTriangle, TrendingDown, Banknote, CheckCircle, Clock, RefreshCw,
} from 'lucide-react';
import Drawer from '../components/Drawer';

// ── Helpers ────────────────────────────────────────────────────────────────
const pkr = n => `₨${Number(n || 0).toLocaleString()}`;
const today = () => new Date().toISOString().split('T')[0];
const monthLabel = m => {
  if (!m) return '';
  const [y, mo] = m.split('-');
  return new Date(+y, +mo - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
};
const STATUS_DOT = { active: 'bg-emerald-400', inactive: 'bg-slate-400' };

const inputCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400';

// ── EmployeeModal ──────────────────────────────────────────────────────────
function EmployeeModal({ employee, onClose, onSave }) {
  const blank = {
    name: '', designation: '', department: '', phone: '', email: '',
    cnic: '', salary: '', joined_at: '', status: 'active',
    bank_name: '', bank_account: '', bank_iban: '', address: '', notes: '',
  };
  const [form, setForm] = useState(employee ? { ...blank, ...employee } : blank);
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, salary: parseFloat(form.salary) || 0 };
      const res = employee
        ? await api.put(`/employees/${employee.id}`, payload)
        : await api.post('/employees', payload);
      onSave(res.data);
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <Drawer open={true} onClose={onClose} title={employee ? 'Edit Employee' : 'Add Employee'} width="max-w-xl">
      <form onSubmit={handleSubmit} className="p-6">
        <div className="grid grid-cols-2 gap-4">
          {/* Personal */}
          <div className="col-span-2">
            <p className="text-2xs font-bold uppercase tracking-wider text-slate-400 mb-3">Personal Info</p>
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-slate-500 mb-1">Full Name *</label>
            <input type="text" value={form.name || ''} onChange={e => set('name', e.target.value)} className={inputCls} />
          </div>
          <div className="col-span-1">
            <label className="block text-xs font-semibold text-slate-500 mb-1">Designation / Role</label>
            <input type="text" value={form.designation || ''} onChange={e => set('designation', e.target.value)} className={inputCls} />
          </div>
          <div className="col-span-1">
            <label className="block text-xs font-semibold text-slate-500 mb-1">Department</label>
            <input type="text" value={form.department || ''} onChange={e => set('department', e.target.value)} className={inputCls} />
          </div>
          <div className="col-span-1">
            <label className="block text-xs font-semibold text-slate-500 mb-1">Phone</label>
            <input type="text" value={form.phone || ''} onChange={e => set('phone', e.target.value)} className={inputCls} />
          </div>
          <div className="col-span-1">
            <label className="block text-xs font-semibold text-slate-500 mb-1">Email</label>
            <input type="email" value={form.email || ''} onChange={e => set('email', e.target.value)} className={inputCls} />
          </div>
          <div className="col-span-1">
            <label className="block text-xs font-semibold text-slate-500 mb-1">CNIC / ID Number</label>
            <input type="text" value={form.cnic || ''} onChange={e => set('cnic', e.target.value)} className={inputCls} />
          </div>
          <div className="col-span-1">
            <label className="block text-xs font-semibold text-slate-500 mb-1">Join Date</label>
            <input type="date" value={form.joined_at || ''} onChange={e => set('joined_at', e.target.value)} className={inputCls} />
          </div>
          <div className="col-span-1">
            <label className="block text-xs font-semibold text-slate-500 mb-1">Status</label>
            <select value={form.status} onChange={e => set('status', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className="col-span-1">
            <label className="block text-xs font-semibold text-slate-500 mb-1">Address</label>
            <input type="text" value={form.address || ''} onChange={e => set('address', e.target.value)} className={inputCls} />
          </div>

          {/* Salary */}
          <div className="col-span-2 mt-2">
            <p className="text-2xs font-bold uppercase tracking-wider text-slate-400 mb-3">Salary</p>
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-slate-500 mb-1">Monthly Salary (PKR)</label>
            <input type="number" value={form.salary || ''} onChange={e => set('salary', e.target.value)} className={inputCls} />
          </div>

          {/* Bank */}
          <div className="col-span-2 mt-2">
            <p className="text-2xs font-bold uppercase tracking-wider text-slate-400 mb-3">Bank Details</p>
          </div>
          <div className="col-span-1">
            <label className="block text-xs font-semibold text-slate-500 mb-1">Bank Name</label>
            <input type="text" value={form.bank_name || ''} onChange={e => set('bank_name', e.target.value)} className={inputCls} />
          </div>
          <div className="col-span-1">
            <label className="block text-xs font-semibold text-slate-500 mb-1">Account Number</label>
            <input type="text" value={form.bank_account || ''} onChange={e => set('bank_account', e.target.value)} className={inputCls} />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-slate-500 mb-1">IBAN</label>
            <input type="text" value={form.bank_iban || ''} onChange={e => set('bank_iban', e.target.value)} className={inputCls} />
          </div>

          {/* Notes */}
          <div className="col-span-2 mt-2">
            <label className="block text-xs font-semibold text-slate-500 mb-1">Notes</label>
            <textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={2}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none" />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 font-medium">
            Cancel
          </button>
          <button type="submit" disabled={saving || !form.name}
            className="flex-1 px-4 py-2.5 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium disabled:opacity-50">
            {saving ? 'Saving…' : employee ? 'Save Changes' : 'Add Employee'}
          </button>
        </div>
      </form>
    </Drawer>
  );
}

// ── AdvanceModal ───────────────────────────────────────────────────────────
function AdvanceModal({ employeeId, advance, onClose, onSave }) {
  const [form, setForm] = useState(advance
    ? { amount: advance.amount, date: advance.date, reason: advance.reason, repaid_amount: advance.repaid_amount, status: advance.status, notes: advance.notes }
    : { amount: '', date: today(), reason: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, amount: parseFloat(form.amount) || 0, repaid_amount: parseFloat(form.repaid_amount) || 0 };
      const res = advance
        ? await api.put(`/employees/${employeeId}/advances/${advance.id}`, payload)
        : await api.post(`/employees/${employeeId}/advances`, payload);
      onSave(res.data);
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <Drawer open={true} onClose={onClose} title={advance ? 'Edit Advance' : 'New Advance'} width="max-w-sm">
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Amount (PKR) *</label>
          <input type="number" value={form.amount} onChange={e => set('amount', e.target.value)} required
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Date</label>
          <input type="date" value={form.date} onChange={e => set('date', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Reason</label>
          <input type="text" value={form.reason} onChange={e => set('reason', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
        </div>
        {advance && (
          <>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Repaid Amount (PKR)</label>
              <input type="number" value={form.repaid_amount} onChange={e => set('repaid_amount', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
                <option value="pending">Pending</option>
                <option value="partial">Partial</option>
                <option value="cleared">Cleared</option>
              </select>
            </div>
          </>
        )}
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Notes</label>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none" />
        </div>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 font-medium">
            Cancel
          </button>
          <button type="submit" disabled={saving}
            className="flex-1 px-4 py-2.5 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Drawer>
  );
}

// ── PayrollModal ───────────────────────────────────────────────────────────
function PayrollModal({ employee, record, onClose, onSave }) {
  const curMonth = new Date().toISOString().slice(0, 7);
  const pendingAdv = parseFloat(employee.pending_advance || 0);
  const [form, setForm] = useState(record
    ? { period: record.period, base_salary: record.base_salary, bonus: record.bonus, deductions: record.deductions, net_pay: record.net_pay, status: record.status, paid_at: record.paid_at || '', notes: record.notes }
    : { period: curMonth, base_salary: employee.salary || 0, bonus: 0, deductions: pendingAdv, net_pay: Math.max(0, (parseFloat(employee.salary) || 0) - pendingAdv), status: 'pending', paid_at: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => {
    const n = { ...f, [k]: v };
    if (['base_salary', 'bonus', 'deductions'].includes(k)) {
      n.net_pay = Math.max(0, (parseFloat(n.base_salary) || 0) + (parseFloat(n.bonus) || 0) - (parseFloat(n.deductions) || 0));
    }
    return n;
  });

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        base_salary: parseFloat(form.base_salary) || 0,
        bonus: parseFloat(form.bonus) || 0,
        deductions: parseFloat(form.deductions) || 0,
        net_pay: parseFloat(form.net_pay) || 0,
        paid_at: form.status === 'paid' ? (form.paid_at || today()) : null,
      };
      const res = record
        ? await api.put(`/employees/${employee.id}/payroll/${record.id}`, payload)
        : await api.post(`/employees/${employee.id}/payroll`, payload);
      onSave(res.data);
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <Drawer open={true} onClose={onClose} title={record ? 'Edit Salary Record' : 'Generate Salary'} width="max-w-sm">
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Month</label>
            <input type="month" value={form.period} onChange={e => set('period', e.target.value)} required
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Base Salary</label>
              <input type="number" value={form.base_salary} onChange={e => set('base_salary', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Bonus</label>
              <input type="number" value={form.bonus} onChange={e => set('bonus', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Advance Deduction</label>
              <input type="number" value={form.deductions} onChange={e => set('deductions', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
            </div>
          </div>
          {pendingAdv > 0 && !record && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-2">
              <AlertCircle size={14} className="text-amber-500 flex-shrink-0" />
              <span className="text-xs text-amber-700">Pending advance of {pkr(pendingAdv)} auto-filled in deductions.</span>
            </div>
          )}
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-indigo-700">Net Pay</span>
            <span className="text-lg font-bold text-indigo-700">{pkr(form.net_pay)}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
              </select>
            </div>
            {form.status === 'paid' && (
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Paid Date</label>
                <input type="date" value={form.paid_at || today()} onChange={e => set('paid_at', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 font-medium">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 px-4 py-2.5 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium disabled:opacity-50">
              {saving ? 'Saving…' : record ? 'Save Changes' : 'Generate'}
            </button>
          </div>
        </form>
    </Drawer>
  );
}

// ── EmployeePanel (side detail) ────────────────────────────────────────────
function EmployeePanel({ employee, onClose, onEdit, onRefresh, embedded = false }) {
  const [tab, setTab] = useState('advances');
  const [advances, setAdvances] = useState([]);
  const [payroll, setPayroll] = useState([]);
  const [advModal, setAdvModal] = useState(null);    // null | 'new' | advance obj
  const [payModal, setPayModal] = useState(null);    // null | 'new' | record obj
  const [delAdvTarget, setDelAdvTarget] = useState(null); // advance id pending delete
  const [delPayTarget, setDelPayTarget] = useState(null); // payroll id pending delete
  const [loading, setLoading] = useState(false);

  const loadAdvances = useCallback(async () => {
    const res = await api.get(`/employees/${employee.id}/advances`);
    setAdvances(res.data);
  }, [employee.id]);

  const loadPayroll = useCallback(async () => {
    setLoading(true);
    const res = await api.get(`/employees/${employee.id}/payroll`);
    setPayroll(res.data);
    setLoading(false);
  }, [employee.id]);

  useEffect(() => { loadAdvances(); }, [loadAdvances]);

  useEffect(() => {
    if (tab === 'payroll') loadPayroll();
  }, [tab, loadPayroll]);

  async function confirmDeleteAdvance() {
    await api.delete(`/employees/${employee.id}/advances/${delAdvTarget}`);
    setDelAdvTarget(null);
    loadAdvances();
    onRefresh();
  }

  async function confirmDeletePayroll() {
    await api.delete(`/employees/${employee.id}/payroll/${delPayTarget}`);
    setDelPayTarget(null);
    loadPayroll();
  }

  async function markPaid(rec) {
    await api.put(`/employees/${employee.id}/payroll/${rec.id}`, { ...rec, status: 'paid', paid_at: today() });
    loadPayroll();
  }

  const ADV_COLOR = { pending: 'bg-amber-100 text-amber-700', partial: 'bg-blue-100 text-blue-700', cleared: 'bg-emerald-100 text-emerald-700' };
  const totalAdv = advances.filter(a => a.status !== 'cleared').reduce((s, a) => s + (parseFloat(a.amount) - parseFloat(a.repaid_amount || 0)), 0);

  return (
    <div className={embedded ? 'flex flex-col h-full overflow-hidden bg-white' : 'fixed inset-0 z-40 flex justify-end animate-overlay'} onClick={embedded ? undefined : onClose}>
      <div className={embedded ? 'flex flex-col h-full overflow-hidden' : 'w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-drawer'} onClick={embedded ? undefined : e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {embedded && (
                <button onClick={onClose} className="lg:hidden p-1 -ml-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0">
                  <ArrowLeft size={16} />
                </button>
              )}
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[employee.status] || 'bg-slate-400'}`} />
              <h2 className="font-semibold text-slate-900 text-lg">{employee.name}</h2>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">{employee.designation || 'No designation'}{employee.department ? ` · ${employee.department}` : ''}</p>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg">
                {pkr(employee.salary)}/mo
              </span>
              {totalAdv > 0 && (
                <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg flex items-center gap-1">
                  <TrendingDown size={11} /> {pkr(totalAdv)} advance
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onEdit} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500">
              <Edit2 size={15} />
            </button>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500">
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Quick Info */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-100 grid grid-cols-2 gap-2 text-xs">
          {employee.phone && <span className="flex items-center gap-1.5 text-slate-600"><Phone size={11} />{employee.phone}</span>}
          {employee.email && <span className="flex items-center gap-1.5 text-slate-600 truncate"><Mail size={11} />{employee.email}</span>}
          {employee.cnic  && <span className="flex items-center gap-1.5 text-slate-600"><CreditCard size={11} />{employee.cnic}</span>}
          {employee.joined_at && <span className="flex items-center gap-1.5 text-slate-600"><Calendar size={11} />{employee.joined_at}</span>}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 px-6">
          {['advances', 'payroll', 'bank'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`py-3 mr-5 text-sm font-medium border-b-2 transition-colors capitalize
                ${tab === t ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
              {t === 'advances' ? 'Advances' : t === 'payroll' ? 'Payroll' : 'Bank / Notes'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* ── Advances Tab ── */}
          {tab === 'advances' && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Advances</p>
                  {totalAdv > 0 && <p className="text-sm font-semibold text-amber-600 mt-0.5">{pkr(totalAdv)} outstanding</p>}
                </div>
                <button onClick={() => setAdvModal('new')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-semibold">
                  <Plus size={12} /> New Advance
                </button>
              </div>

              {delAdvTarget && (
                <div className="flex items-center gap-3 px-4 py-3 mb-3 bg-rose-50 border border-rose-200 rounded-xl text-sm">
                  <AlertTriangle size={14} className="text-rose-500 flex-shrink-0" />
                  <span className="flex-1 text-rose-700 font-medium">Delete this advance record?</span>
                  <button onClick={() => setDelAdvTarget(null)}
                    className="px-2.5 py-1 text-xs border border-rose-200 rounded-lg text-rose-600 hover:bg-rose-100 font-medium">Cancel</button>
                  <button onClick={confirmDeleteAdvance}
                    className="px-2.5 py-1 text-xs bg-rose-600 text-white rounded-lg hover:bg-rose-700 font-medium">Delete</button>
                </div>
              )}
              {advances.length === 0
                ? <p className="text-sm text-slate-400 text-center py-8">No advance records</p>
                : <div className="space-y-3">
                    {advances.map(a => (
                      <div key={a.id} className="bg-slate-50 rounded-xl p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-800 text-sm">{pkr(a.amount)}</span>
                              <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full ${ADV_COLOR[a.status]}`}>
                                {a.status}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">{a.reason || 'No reason given'} · {a.date}</p>
                            {parseFloat(a.repaid_amount) > 0 && (
                              <p className="text-xs text-emerald-600 mt-0.5">Repaid: {pkr(a.repaid_amount)}</p>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <button onClick={() => setAdvModal(a)} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600">
                              <Edit2 size={12} />
                            </button>
                            <button onClick={() => setDelAdvTarget(a.id)} className="p-1.5 rounded-lg hover:bg-rose-100 text-slate-400 hover:text-rose-600">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
              }
            </div>
          )}

          {/* ── Payroll Tab ── */}
          {tab === 'payroll' && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Salary Records</p>
                <button onClick={() => setPayModal('new')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-semibold">
                  <Plus size={12} /> Generate Salary
                </button>
              </div>

              {delPayTarget && (
                <div className="flex items-center gap-3 px-4 py-3 mb-3 bg-rose-50 border border-rose-200 rounded-xl text-sm">
                  <AlertTriangle size={14} className="text-rose-500 flex-shrink-0" />
                  <span className="flex-1 text-rose-700 font-medium">Delete this salary record?</span>
                  <button onClick={() => setDelPayTarget(null)}
                    className="px-2.5 py-1 text-xs border border-rose-200 rounded-lg text-rose-600 hover:bg-rose-100 font-medium">Cancel</button>
                  <button onClick={confirmDeletePayroll}
                    className="px-2.5 py-1 text-xs bg-rose-600 text-white rounded-lg hover:bg-rose-700 font-medium">Delete</button>
                </div>
              )}
              {loading
                ? <p className="text-sm text-slate-400 text-center py-8">Loading…</p>
                : payroll.length === 0
                  ? <p className="text-sm text-slate-400 text-center py-8">No payroll records</p>
                  : <div className="space-y-3">
                      {payroll.map(r => (
                        <div key={r.id} className="bg-slate-50 rounded-xl p-4">
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-slate-800 text-sm">{monthLabel(r.period)}</span>
                                <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full ${r.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                  {r.status}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 mt-0.5">
                                Base {pkr(r.base_salary)}
                                {parseFloat(r.bonus) > 0 && ` + Bonus ${pkr(r.bonus)}`}
                                {parseFloat(r.deductions) > 0 && ` − ${pkr(r.deductions)}`}
                              </p>
                              <p className="text-sm font-bold text-indigo-600 mt-1">Net: {pkr(r.net_pay)}</p>
                              {r.paid_at && <p className="text-2xs text-slate-400">Paid on {r.paid_at}</p>}
                            </div>
                            <div className="flex gap-1">
                              {r.status !== 'paid' && (
                                <button onClick={() => markPaid(r)}
                                  className="p-1.5 rounded-lg hover:bg-emerald-100 text-slate-400 hover:text-emerald-600" title="Mark Paid">
                                  <Check size={13} />
                                </button>
                              )}
                              <button onClick={() => setPayModal(r)} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600">
                                <Edit2 size={12} />
                              </button>
                              <button onClick={() => setDelPayTarget(r.id)} className="p-1.5 rounded-lg hover:bg-rose-100 text-slate-400 hover:text-rose-600">
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
              }
            </div>
          )}

          {/* ── Bank / Notes Tab ── */}
          {tab === 'bank' && (
            <div className="p-6 space-y-4">
              {[
                { label: 'Bank Name', val: employee.bank_name },
                { label: 'Account Number', val: employee.bank_account },
                { label: 'IBAN', val: employee.bank_iban },
                { label: 'Address', val: employee.address },
              ].map(({ label, val }) => val ? (
                <div key={label}>
                  <p className="text-2xs font-bold uppercase tracking-wider text-slate-400 mb-1">{label}</p>
                  <p className="text-sm text-slate-700">{val}</p>
                </div>
              ) : null)}
              {employee.notes && (
                <div>
                  <p className="text-2xs font-bold uppercase tracking-wider text-slate-400 mb-1">Notes</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{employee.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modals */}
        {advModal && (
          <AdvanceModal
            employeeId={employee.id}
            advance={advModal === 'new' ? null : advModal}
            onClose={() => setAdvModal(null)}
            onSave={() => {
              loadAdvances();
              onRefresh();
            }}
          />
        )}
        {payModal && (
          <PayrollModal
            employee={employee}
            record={payModal === 'new' ? null : payModal}
            onClose={() => setPayModal(null)}
            onSave={() => loadPayroll()}
          />
        )}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function Payroll() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [modal, setModal] = useState(null);       // null | 'new' | employee obj
  const [selected, setSelected] = useState(null); // employee panel
  const [delTarget, setDelTarget] = useState(null); // employee id pending delete

  const load = useCallback(async () => {
    setLoading(true);
    const res = await api.get('/employees');
    setEmployees(res.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function confirmDelete() {
    await api.delete(`/employees/${delTarget}`);
    setEmployees(p => p.filter(e => e.id !== delTarget));
    if (selected?.id === delTarget) setSelected(null);
    setDelTarget(null);
  }

  const filtered = employees.filter(e => {
    const q = search.toLowerCase();
    const matchQ = !q || e.name.toLowerCase().includes(q) || (e.designation || '').toLowerCase().includes(q) || (e.department || '').toLowerCase().includes(q);
    const matchS = statusFilter === 'all' || e.status === statusFilter;
    return matchQ && matchS;
  });

  const totalActive = employees.filter(e => e.status === 'active').length;
  const totalSalary = employees.filter(e => e.status === 'active').reduce((s, e) => s + (parseFloat(e.salary) || 0), 0);
  const totalAdvances = employees.reduce((s, e) => s + (parseFloat(e.pending_advance) || 0), 0);

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 8.5rem)' }}>

      {/* ── Page header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Employees</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {totalActive} active · {pkr(totalSalary)}/mo payroll
            {totalAdvances > 0 ? ` · ${pkr(totalAdvances)} advances pending` : ''}
          </p>
        </div>
        <button onClick={() => setModal('new')}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-sm shadow-indigo-200 transition-colors">
          <Plus size={16} /> Add Employee
        </button>
      </div>

      {/* ── Two-panel split ── */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row rounded-2xl border border-slate-200 shadow-sm overflow-hidden bg-white">

        {/* LEFT: Employee list */}
        <div className={`w-full lg:w-80 flex-shrink-0 flex flex-col border-b lg:border-b-0 lg:border-r border-slate-200 bg-white ${selected ? 'hidden lg:flex' : ''}`}>

          {/* Search */}
          <div className="px-3 py-3 border-b border-slate-100">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 bg-slate-50"
                placeholder="Search employees…" />
            </div>
          </div>

          {/* Status filters */}
          <div className="px-3 py-2 border-b border-slate-100 flex gap-1">
            {['all', 'active', 'inactive'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`flex-1 py-1.5 text-xs rounded-lg font-medium transition-all capitalize ${
                  statusFilter === s ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}>
                {s}
              </button>
            ))}
          </div>

          {/* Delete confirmation banner */}
          {delTarget && (
            <div className="mx-3 mt-2 flex items-center gap-2 px-3 py-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs flex-shrink-0">
              <AlertTriangle size={13} className="text-rose-500 flex-shrink-0" />
              <span className="flex-1 text-rose-700 font-medium">Delete employee?</span>
              <button onClick={() => setDelTarget(null)}
                className="px-2.5 py-1 border border-rose-200 rounded-lg text-rose-600 hover:bg-rose-100">Cancel</button>
              <button onClick={confirmDelete}
                className="px-2.5 py-1 bg-rose-600 text-white rounded-lg hover:bg-rose-700 font-semibold">Delete</button>
            </div>
          )}

          {/* Employee list */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center px-4">
                <Users size={24} className="text-slate-200 mx-auto mb-2" />
                <p className="text-slate-400 text-sm">{search || statusFilter !== 'all' ? 'No matches' : 'No employees yet'}</p>
              </div>
            ) : filtered.map(emp => {
              const isSelected = selected?.id === emp.id;
              return (
                <button key={emp.id}
                  onClick={() => setSelected(isSelected ? null : emp)}
                  className={`w-full text-left px-4 py-3.5 border-b border-slate-100 transition-colors flex flex-col gap-1.5 relative group ${
                    isSelected
                      ? 'bg-indigo-50 border-l-[3px] border-l-indigo-600'
                      : 'hover:bg-slate-50/80 border-l-[3px] border-l-transparent'
                  }`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 bg-gradient-to-br from-indigo-400 to-violet-500 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                        {emp.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 leading-tight truncate">{emp.name}</p>
                        <p className="text-xs text-slate-400 truncate">{emp.designation || (emp.department || '—')}</p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-bold text-slate-700">{pkr(emp.salary)}</p>
                      <div className="flex items-center justify-end gap-1 mt-0.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[emp.status] || 'bg-slate-400'}`} />
                        <span className="text-2xs text-slate-400 capitalize">{emp.status}</span>
                      </div>
                    </div>
                  </div>
                  {parseFloat(emp.pending_advance) > 0 && (
                    <span className="text-2xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full w-fit flex items-center gap-1">
                      <TrendingDown size={9} /> {pkr(emp.pending_advance)} advance
                    </span>
                  )}
                  {/* Hover action buttons */}
                  <div className="absolute right-2 top-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={e => e.stopPropagation()}>
                    <button onClick={() => setModal(emp)} title="Edit"
                      className="p-1 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors">
                      <Edit2 size={11} />
                    </button>
                    <button onClick={() => setDelTarget(emp.id)} title="Delete"
                      className="p-1 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded transition-colors">
                      <Trash2 size={11} />
                    </button>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* RIGHT: Employee detail panel */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {selected ? (
            <EmployeePanel
              embedded={true}
              employee={selected}
              onClose={() => setSelected(null)}
              onEdit={() => setModal(selected)}
              onRefresh={() => load().then(() => {
                setSelected(p => employees.find(e => e.id === p?.id) || p);
              })}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-4">
                <Users size={28} className="text-indigo-300" />
              </div>
              <p className="font-semibold text-slate-600">Select an employee</p>
              <p className="text-sm text-slate-400 mt-1 max-w-xs">Click any employee to view advances, payroll records, and details</p>
              <button onClick={() => setModal('new')}
                className="mt-5 flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors">
                <Plus size={14} /> Add Employee
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Employee form drawer */}
      {modal && (
        <EmployeeModal
          employee={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSave={saved => {
            if (modal === 'new') setEmployees(p => [saved, ...p]);
            else setEmployees(p => p.map(e => e.id === saved.id ? saved : e));
            if (selected?.id === saved.id) setSelected(saved);
          }}
        />
      )}
    </div>
  );
}
