# Apparel CRM

A full-stack business management system built for apparel manufacturers and exporters. Manage clients, quotations, invoices, production, inventory, and finances — all in one place.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, Tailwind CSS v4 |
| Backend | Node.js, Express.js |
| Database | SQLite (better-sqlite3) |
| Auth | JWT + bcryptjs |
| Icons | Lucide React |

---

## Features

- **Quotations & Invoices** — Create professional documents with multi-currency support, tax, discount, and bank details
- **Product Catalogue** — Multi-currency pricing with a built-in cost calculator and profit margin tool
- **Client Management** — Full CRM with shipping info, payment terms, and transaction history
- **Project Tracking** — Production stages (Cutting → Decoration → Stitching → Press & Pack), vendor payments, box tracking
- **Inventory** — Raw material tracking with stock-in/out transactions
- **Vendors** — Supplier management with per-project payment tracking
- **Employees & Payroll** — Staff records, salary management, advance tracking
- **Expenses** — Business expense tracking with recurring support
- **Financials** — P&L overview, revenue vs expenses chart, cash flow
- **Multi-currency** — AED, USD, PKR, EUR, GBP and more with live exchange rates
- **Role-based Access** — Super Admin / Sales / Inventory roles with JWT auth
- **SaaS Wizard** — First-run setup wizard with demo mode and 30-day trial
- **Forgot Password** — Self-service reset link flow (no email required)
- **App Branding** — Custom logo and app name via Settings
- **Fully Responsive** — Mobile hamburger sidebar, tablet, and desktop layouts
- **Document Templates** — Classic and Modern layouts for quotations and invoices

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
# Clone the repo
git clone https://github.com/pixelswd44/marathon-staffing.git
cd marathon-staffing

# Install root dependencies
npm install

# Install server dependencies
cd server && npm install && cd ..

# Install client dependencies
cd client && npm install && cd ..
```

### Running in Development

Open two terminals:

```bash
# Terminal 1 — Backend (port 3001)
cd server
node src/index.js

# Terminal 2 — Frontend (port 5173)
cd client
npx vite --port 5173
```

Then open **http://localhost:5173** in your browser.

On first run, the **Setup Wizard** will appear to configure your company, currency, and admin account.

---

## Default Users (after Setup Wizard)

The wizard creates your Super Admin during setup. You can add more users from **Settings → Users**.

| Role | Access |
|------|--------|
| **Super Admin** | Full access to all modules |
| **Sales** | Quotations, Invoices, Clients |
| **Inventory** | Products, Inventory |

---

## Environment Variables

Create `server/.env` (optional — defaults work out of the box):

```env
PORT=3001
JWT_SECRET=your-secret-key-here
```

---

## Project Structure

```
├── client/                  # React frontend
│   └── src/
│       ├── components/      # Layout, Sidebar, shared UI
│       ├── lib/             # API client, auth context
│       └── pages/           # All page components
│
├── server/                  # Express backend
│   └── src/
│       ├── db/              # SQLite schema + seed data
│       ├── middleware/      # JWT auth middleware
│       └── routes/          # API route handlers
│
└── README.md
```

---

## API Overview

All routes under `/api/*` require a valid JWT Bearer token (except `/api/auth/login`, `/api/auth/forgot-password`, `/api/auth/reset-password`, and `/api/setup/*`).

| Endpoint | Description |
|----------|-------------|
| `POST /api/auth/login` | Sign in, returns JWT |
| `GET /api/auth/me` | Current user info |
| `POST /api/auth/forgot-password` | Generate password reset link |
| `POST /api/auth/reset-password` | Set new password with token |
| `GET /api/setup/status` | Check if app is configured |
| `POST /api/setup/complete` | Complete first-run wizard |
| `GET /api/clients` | List all clients |
| `GET /api/products` | List products with multi-currency prices |
| `GET /api/quotations` | List quotations |
| `GET /api/invoices` | List invoices |
| `GET /api/projects` | List projects with stages |
| `GET /api/overview` | Dashboard summary stats |
| `GET /api/financials/summary` | P&L overview |

---

## License

Private — All rights reserved.
