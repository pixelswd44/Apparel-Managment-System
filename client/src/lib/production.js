// Production jobs paid per project to a person on that job's list (Expenses →
// Production). label must match an EXPENSE_PRESETS label in Expenses.jsx and
// the server's KINDS in routes/production-agents.js.
export const PRODUCTION_KINDS = [
  { kind: 'embroidery',  label: 'Embroidery',        person: 'Embroidery agent' },
  { kind: 'sublimation', label: 'Sublimation',       person: 'Sublimation agent' },
  { kind: 'cutting',     label: 'Cutting & Threads', person: 'Cutting & threads person' },
  { kind: 'belts',       label: 'Belts',             person: 'Belt maker' },
];
