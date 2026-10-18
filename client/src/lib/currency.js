// Display currency for every PKR figure in the app (Dashboard, Ledger, Expenses, Employees …).
// All data is stored in PKR; the default currency chosen in Settings → Currencies only changes
// how those PKR amounts are shown (PKR ÷ that currency's rate_to_pkr). Documents such as
// invoices and quotations keep showing their own currency.

let cur = { code: 'PKR', symbol: '₨', rate: 1 };

export function setDisplayCurrency(list = []) {
  const d = list.find(c => c.is_default === 1 || c.is_default === true);
  const rate = d && d.code !== 'PKR' ? parseFloat(d.rate_to_pkr) : 1;
  if (d && d.code !== 'PKR' && rate > 0) cur = { code: d.code, symbol: d.symbol || d.code, rate };
  else cur = { code: 'PKR', symbol: '₨', rate: 1 };
}

export const displayCurrency = () => cur;

// PKR → display currency (number)
export const convert = v => (parseFloat(v) || 0) / cur.rate;

// Full amount, e.g. ₨5,695,870  or  $20,711.35
export function pkr(v) {
  const n = convert(v);
  const abs = Math.abs(n);
  const frac = cur.rate === 1 || abs >= 10000 ? 0 : 2;
  const body = abs.toLocaleString('en-US', { minimumFractionDigits: frac, maximumFractionDigits: frac });
  return `${n < 0 ? '−' : ''}${cur.symbol}${body}`;
}

// Compact axis / legend figure: 26.1M, 410k
export function pkrShort(v) {
  const n = convert(v);
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (a >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(Math.round(n * 100) / 100);
}
