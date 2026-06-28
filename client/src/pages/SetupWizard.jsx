import { useState, useRef } from 'react';
import {
  Layers, Building2, Palette, User, CreditCard, Check,
  ChevronRight, ChevronLeft, Upload, Eye, EyeOff,
  Zap, Shield, Globe, BarChart2, FileText, Package,
  Sparkles, ArrowRight, Play,
} from 'lucide-react';
import api, { imgUrl } from '../lib/api';

// ── Step indicator ─────────────────────────────────────────────────────────
function StepDot({ n, current, label }) {
  const done = current > n;
  const active = current === n;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all duration-300 ${
        done   ? 'bg-indigo-600 border-indigo-600 text-white'
               : active ? 'bg-[#1c1c1e] border-indigo-500 text-indigo-400'
               : 'bg-[#1c1c1e] border-white/10 text-white/20'
      }`}>
        {done ? <Check size={14} /> : n}
      </div>
      <span className={`text-2xs font-medium whitespace-nowrap transition-colors duration-200 ${
        active ? 'text-white/70' : done ? 'text-indigo-400' : 'text-white/20'
      }`}>{label}</span>
    </div>
  );
}

function StepLine({ done }) {
  return (
    <div className="flex-1 h-px mx-1 mt-[-18px] transition-colors duration-300"
      style={{ background: done ? '#6366f1' : 'rgba(255,255,255,0.08)' }} />
  );
}

// ── Input helpers ─────────────────────────────────────────────────────────
const inputCls = 'w-full bg-white/[0.06] border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/25 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all';
const labelCls = 'block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5';

function Field({ label, children }) {
  return <div><label className={labelCls}>{label}</label>{children}</div>;
}

// ── CURRENCIES ────────────────────────────────────────────────────────────
const CURRENCIES = [
  { code: 'USD', name: 'US Dollar',       symbol: '$',   flag: '🇺🇸' },
  { code: 'AED', name: 'UAE Dirham',      symbol: 'د.إ', flag: '🇦🇪' },
  { code: 'PKR', name: 'Pakistani Rupee', symbol: '₨',  flag: '🇵🇰' },
  { code: 'EUR', name: 'Euro',            symbol: '€',   flag: '🇪🇺' },
  { code: 'GBP', name: 'British Pound',   symbol: '£',   flag: '🇬🇧' },
  { code: 'SAR', name: 'Saudi Riyal',     symbol: 'ر.س', flag: '🇸🇦' },
  { code: 'QAR', name: 'Qatari Riyal',    symbol: 'ر.ق', flag: '🇶🇦' },
  { code: 'OMR', name: 'Omani Rial',      symbol: 'ر.ع', flag: '🇴🇲' },
];

// ── STEP 1: Welcome ───────────────────────────────────────────────────────
function StepWelcome({ onNext, onDemo, demoLoading }) {
  const features = [
    { icon: FileText,  title: 'Quotations & Invoices', desc: 'Create professional docs in seconds' },
    { icon: Package,   title: 'Product Catalogue',     desc: 'Multi-currency pricing & calculator' },
    { icon: BarChart2, title: 'Financial Overview',    desc: 'P&L, revenue trends, cash flow' },
    { icon: Globe,     title: 'Multi-currency',        desc: 'AED, USD, PKR and more' },
    { icon: Shield,    title: 'Role-based Access',     desc: 'Sales, Inventory, Admin roles' },
    { icon: Zap,       title: 'Project Tracking',      desc: 'Production stages end-to-end' },
  ];
  return (
    <div className="text-center">
      {/* Hero */}
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold px-3 py-1.5 rounded-full mb-4">
          <Sparkles size={12} /> Welcome to Apparel CRM
        </div>
        <h1 className="text-3xl font-bold text-white mb-3 tracking-tight">
          The complete management system<br />for apparel businesses
        </h1>
        <p className="text-white/50 text-sm max-w-md mx-auto leading-relaxed">
          Set up your workspace in under 2 minutes. Manage clients, quotations, production and finances — all in one place.
        </p>
      </div>

      {/* Features grid */}
      <div className="grid grid-cols-2 gap-3 mb-8 text-left max-w-lg mx-auto">
        {features.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-3.5 flex gap-3 items-start">
            <div className="w-8 h-8 bg-indigo-500/15 rounded-lg flex items-center justify-center flex-shrink-0">
              <Icon size={14} className="text-indigo-400" />
            </div>
            <div>
              <p className="text-white text-xs font-semibold">{title}</p>
              <p className="text-white/40 text-2xs mt-0.5 leading-snug">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <button onClick={onNext}
          className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-7 py-3 rounded-xl transition-colors">
          Start Setup <ArrowRight size={16} />
        </button>
        <button onClick={onDemo} disabled={demoLoading}
          className="flex items-center justify-center gap-2 bg-white/[0.06] hover:bg-white/[0.10] border border-white/10 text-white/70 hover:text-white font-medium px-7 py-3 rounded-xl transition-all disabled:opacity-60">
          {demoLoading
            ? <span className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
            : <Play size={14} />}
          {demoLoading ? 'Loading demo…' : 'Try Live Demo'}
        </button>
      </div>
      <p className="text-white/25 text-xs mt-4">No credit card required · 30-day free trial</p>
    </div>
  );
}

// ── STEP 2: Company ───────────────────────────────────────────────────────
function StepCompany({ data, onChange }) {
  const logoRef = useRef();
  const [uploading, setUploading] = useState(false);

  async function handleLogo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data: uploaded } = await api.post('/uploads', fd);
      onChange('company_logo', uploaded.url);
      onChange('app_name', data.app_name); // keep
    } finally { setUploading(false); e.target.value = ''; }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Your Business</h2>
        <p className="text-white/40 text-sm">Tell us about your company</p>
      </div>

      {/* Logo */}
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl border-2 border-dashed border-white/15 flex items-center justify-center overflow-hidden bg-white/[0.04] flex-shrink-0">
          {data.company_logo
            ? <img src={imgUrl(data.company_logo)} alt="logo" className="w-full h-full object-contain" />
            : <Layers size={22} className="text-white/20" />}
        </div>
        <div>
          <button type="button" onClick={() => logoRef.current?.click()}
            className="flex items-center gap-2 bg-white/[0.08] hover:bg-white/[0.12] border border-white/10 text-white/70 hover:text-white text-sm px-4 py-2 rounded-xl transition-all">
            <Upload size={14} />
            {uploading ? 'Uploading…' : data.company_logo ? 'Change Logo' : 'Upload Logo'}
          </button>
          <p className="text-white/25 text-xs mt-1.5">PNG, JPG, SVG · Square recommended</p>
          <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={handleLogo} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Company Name *">
          <input value={data.company_name} onChange={e => onChange('company_name', e.target.value)}
            className={inputCls} placeholder="Your Company Ltd." />
        </Field>
        <Field label="App Name">
          <input value={data.app_name} onChange={e => onChange('app_name', e.target.value)}
            className={inputCls} placeholder="Apparel CRM" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="City">
          <input value={data.company_city} onChange={e => onChange('company_city', e.target.value)}
            className={inputCls} placeholder="Dubai" />
        </Field>
        <Field label="Country">
          <input value={data.company_country} onChange={e => onChange('company_country', e.target.value)}
            className={inputCls} placeholder="United Arab Emirates" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Email">
          <input type="email" value={data.company_email} onChange={e => onChange('company_email', e.target.value)}
            className={inputCls} placeholder="info@yourcompany.com" />
        </Field>
        <Field label="Phone">
          <input value={data.company_phone} onChange={e => onChange('company_phone', e.target.value)}
            className={inputCls} placeholder="+971 50 000 0000" />
        </Field>
      </div>
    </div>
  );
}

// ── STEP 3: Currency ──────────────────────────────────────────────────────
function StepCurrency({ data, onChange }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Default Currency</h2>
        <p className="text-white/40 text-sm">This will be your primary currency for calculations and reports</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {CURRENCIES.map(c => (
          <button key={c.code} type="button" onClick={() => onChange('default_currency', c.code)}
            className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
              data.default_currency === c.code
                ? 'border-indigo-500 bg-indigo-500/10'
                : 'border-white/[0.08] bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]'
            }`}>
            <span className="text-2xl">{c.flag}</span>
            <div>
              <p className="text-white font-semibold text-sm">{c.code} <span className="text-white/40 font-normal">{c.symbol}</span></p>
              <p className="text-white/40 text-xs">{c.name}</p>
            </div>
            {data.default_currency === c.code && (
              <div className="ml-auto w-5 h-5 bg-indigo-500 rounded-full flex items-center justify-center">
                <Check size={11} className="text-white" />
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── STEP 4: Admin Account ─────────────────────────────────────────────────
function StepAdmin({ data, onChange }) {
  const [showPass, setShowPass] = useState(false);
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Admin Account</h2>
        <p className="text-white/40 text-sm">Create your Super Admin account. This has full access to everything.</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Full Name *">
          <input value={data.admin_name} onChange={e => onChange('admin_name', e.target.value)}
            className={inputCls} placeholder="John Smith" autoFocus />
        </Field>
        <Field label="Username *">
          <input value={data.admin_username} onChange={e => onChange('admin_username', e.target.value.toLowerCase().replace(/\s/g, ''))}
            className={inputCls} placeholder="admin" />
        </Field>
      </div>
      <Field label="Email Address *">
        <input type="email" value={data.admin_email} onChange={e => onChange('admin_email', e.target.value)}
          className={inputCls} placeholder="admin@yourcompany.com" />
      </Field>
      <Field label="Password *">
        <div className="relative">
          <input type={showPass ? 'text' : 'password'} value={data.admin_password}
            onChange={e => onChange('admin_password', e.target.value)}
            className={`${inputCls} pr-11`} placeholder="Min. 6 characters" />
          <button type="button" onClick={() => setShowPass(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 p-1">
            {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </Field>
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-4">
        <p className="text-white/50 text-xs leading-relaxed">
          You can also add <span className="text-white/70 font-medium">Sales</span> and{' '}
          <span className="text-white/70 font-medium">Inventory</span> users from Settings after setup is complete.
        </p>
      </div>
    </div>
  );
}

// ── STEP 5: Plan ──────────────────────────────────────────────────────────
function StepPlan({ data, onChange }) {
  const plans = [
    {
      key: 'trial',
      title: 'Free Trial',
      price: 'Free for 30 days',
      badge: 'Most Popular',
      badgeColor: 'bg-emerald-500/20 text-emerald-400',
      features: ['Full access to all modules', 'Unlimited clients & products', 'All 3 user roles', 'Priority support'],
      border: 'border-indigo-500',
      bg: 'bg-indigo-500/5',
    },
    {
      key: 'demo',
      title: 'Demo Mode',
      price: '14-day preview',
      badge: 'Quick Look',
      badgeColor: 'bg-amber-500/20 text-amber-400',
      features: ['Full feature access', 'Pre-loaded sample data', 'Perfect for evaluation', 'No commitment'],
      border: 'border-white/15',
      bg: 'bg-white/[0.03]',
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Choose Your Plan</h2>
        <p className="text-white/40 text-sm">Start free — upgrade any time for continued access</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {plans.map(p => (
          <button key={p.key} type="button" onClick={() => onChange('plan', p.key)}
            className={`text-left border-2 rounded-2xl p-5 transition-all ${p.border} ${p.bg} ${
              data.plan === p.key ? 'ring-2 ring-indigo-500/30' : 'hover:border-white/25'
            }`}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-white font-bold text-base">{p.title}</p>
                <p className="text-indigo-300 text-sm font-semibold mt-0.5">{p.price}</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className={`text-2xs font-bold px-2 py-0.5 rounded-full ${p.badgeColor}`}>{p.badge}</span>
                {data.plan === p.key && (
                  <div className="w-5 h-5 bg-indigo-500 rounded-full flex items-center justify-center">
                    <Check size={11} className="text-white" />
                  </div>
                )}
              </div>
            </div>
            <ul className="space-y-1.5">
              {p.features.map(f => (
                <li key={f} className="flex items-center gap-2 text-xs text-white/60">
                  <Check size={11} className="text-indigo-400 flex-shrink-0" />{f}
                </li>
              ))}
            </ul>
          </button>
        ))}
      </div>

      <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4 text-center">
        <p className="text-white/40 text-xs">
          After your trial, continue at <span className="text-white/70 font-semibold">$49/month</span> · Cancel anytime ·{' '}
          <span className="text-indigo-400 cursor-pointer hover:underline">Contact us</span> for volume pricing
        </p>
      </div>
    </div>
  );
}

// ── STEP 6: Done ──────────────────────────────────────────────────────────
function StepDone({ data }) {
  return (
    <div className="text-center py-4">
      <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-indigo-500/30">
        <Check size={36} className="text-white" strokeWidth={2.5} />
      </div>
      <h2 className="text-2xl font-bold text-white mb-2">You're all set!</h2>
      <p className="text-white/50 text-sm mb-6">
        {data.company_name ? `${data.company_name} is` : 'Your workspace is'} ready to use.
        {data.plan === 'trial' ? ' Your 30-day free trial starts now.' : ' Your 14-day demo is active.'}
      </p>

      <div className="grid grid-cols-3 gap-3 mb-8 text-center max-w-sm mx-auto">
        {[
          { label: 'Admin',    value: data.admin_username || 'admin', icon: User },
          { label: 'Currency', value: data.default_currency || 'USD', icon: Globe },
          { label: 'Plan',     value: data.plan === 'trial' ? '30-day trial' : '14-day demo', icon: CreditCard },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-white/[0.05] border border-white/[0.08] rounded-xl p-3">
            <Icon size={16} className="text-indigo-400 mx-auto mb-1.5" />
            <p className="text-white/40 text-2xs font-medium uppercase tracking-wider">{label}</p>
            <p className="text-white text-xs font-semibold mt-0.5 truncate">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── MAIN WIZARD ───────────────────────────────────────────────────────────
const STEPS = [
  { label: 'Welcome' },
  { label: 'Company' },
  { label: 'Currency' },
  { label: 'Account' },
  { label: 'Plan' },
  { label: 'Done' },
];

export default function SetupWizard({ onComplete }) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState({
    company_name:     '',
    company_logo:     '',
    company_email:    '',
    company_phone:    '',
    company_city:     '',
    company_country:  '',
    app_name:         'Apparel CRM',
    default_currency: 'USD',
    admin_name:       '',
    admin_username:   'admin',
    admin_email:      '',
    admin_password:   '',
    plan:             'trial',
  });

  function set(k, v) { setData(d => ({ ...d, [k]: v })); }

  function validate() {
    setError('');
    if (step === 2 && !data.company_name.trim()) { setError('Company name is required.'); return false; }
    if (step === 4) {
      if (!data.admin_name.trim())     { setError('Full name is required.'); return false; }
      if (!data.admin_username.trim()) { setError('Username is required.'); return false; }
      if (!data.admin_email.trim())    { setError('Email is required.'); return false; }
      if (data.admin_password.length < 6) { setError('Password must be at least 6 characters.'); return false; }
    }
    return true;
  }

  async function handleNext() {
    if (!validate()) return;
    if (step < 5) { setStep(s => s + 1); return; }
    // Step 5 → submit
    setSaving(true); setError('');
    try {
      await api.post('/setup/complete', data);
      setStep(6);
    } catch (err) {
      setError(err?.response?.data?.error || 'Setup failed. Please try again.');
    } finally { setSaving(false); }
  }

  async function handleDemo() {
    setDemoLoading(true); setError('');
    try {
      const { data: demo } = await api.post('/setup/demo');
      onComplete({ username: demo.username, password: demo.password, autoLogin: true });
    } catch (err) {
      setError(err?.response?.data?.error || 'Could not start demo.');
    } finally { setDemoLoading(false); }
  }

  async function handleLaunch() {
    onComplete({ username: data.admin_username, password: data.admin_password, autoLogin: true });
  }

  const showSteps = step > 1;
  const isLastSetupStep = step === 5;
  const isDone = step === 6;

  return (
    <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center p-4">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-indigo-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-2xl">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center shadow-lg">
            <Layers size={18} className="text-white" />
          </div>
          <span className="text-white font-bold text-lg tracking-tight">Apparel CRM</span>
        </div>

        {/* Step indicators (steps 2-6) */}
        {showSteps && (
          <div className="flex items-start justify-center mb-8 px-4">
            {STEPS.slice(1).map((s, i) => (
              <div key={s.label} className="flex items-start flex-1">
                <StepDot n={i + 2} current={step} label={s.label} />
                {i < STEPS.length - 2 && <StepLine done={step > i + 2} />}
              </div>
            ))}
          </div>
        )}

        {/* Card */}
        <div className="bg-[#111113] border border-white/[0.07] rounded-2xl shadow-2xl overflow-hidden">
          <div className="p-8">
            {error && (
              <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm px-4 py-3 rounded-xl mb-5">
                {error}
              </div>
            )}

            {step === 1 && <StepWelcome onNext={() => setStep(2)} onDemo={handleDemo} demoLoading={demoLoading} />}
            {step === 2 && <StepCompany  data={data} onChange={set} />}
            {step === 3 && <StepCurrency data={data} onChange={set} />}
            {step === 4 && <StepAdmin    data={data} onChange={set} />}
            {step === 5 && <StepPlan     data={data} onChange={set} />}
            {step === 6 && <StepDone     data={data} />}
          </div>

          {/* Footer nav */}
          {step > 1 && (
            <div className="px-8 pb-6 flex items-center justify-between">
              {!isDone ? (
                <>
                  <button onClick={() => { setError(''); setStep(s => s - 1); }}
                    className="flex items-center gap-1.5 text-white/40 hover:text-white/70 text-sm transition-colors">
                    <ChevronLeft size={16} /> Back
                  </button>
                  <button onClick={handleNext} disabled={saving}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-semibold px-6 py-2.5 rounded-xl transition-colors">
                    {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                    {isLastSetupStep ? (saving ? 'Setting up…' : 'Complete Setup') : 'Continue'}
                    {!isLastSetupStep && <ChevronRight size={16} />}
                  </button>
                </>
              ) : (
                <div className="w-full flex justify-center">
                  <button onClick={handleLaunch}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-10 py-3 rounded-xl transition-colors text-base">
                    Launch Dashboard <ArrowRight size={18} />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {step === 1 && (
          <p className="text-center text-white/20 text-xs mt-5">
            Already have an account?{' '}
            <button className="text-indigo-400 hover:text-indigo-300 transition-colors" onClick={() => onComplete({ skipWizard: true })}>
              Sign in
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
