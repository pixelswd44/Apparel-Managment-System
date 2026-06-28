# Apparel CRM

A full-stack business management system built for apparel manufacturers and exporters. Manage clients, quotations, invoices, production, inventory, finances, and personal loans — all in one place.

---

## Tech Stack

| Layer      | Technology                          |
|------------|-------------------------------------|
| Frontend   | React 19, Vite, Tailwind CSS v4     |
| Backend    | Node.js, Express.js                 |
| Database   | SQLite (via sql.js)                 |
| Auth       | JWT + bcryptjs                      |
| Icons      | Lucide React                        |
| PDF Export | jsPDF + jspdf-autotable             |
| Excel Export | xlsx (SheetJS)                    |

---

## Features

### Sales & Operations
- **Quotations & Invoices** — Professional documents with multi-currency support, tax, discount, shipping cost, and bank details
- **Document Templates** — Classic and Modern layouts per document type
- **Multi-currency** — AED, USD, PKR, EUR, GBP and more with configurable exchange rates
- **Client Management** — Full CRM with shipping info, payment terms, language, and transaction history
- **Product Catalogue** — Multi-currency pricing with a built-in cost calculator and profit margin tool
- **Purchases** — Purchase order tracking

### Production & Inventory
- **Project Tracking** — Production stages (Cutting → Decoration → Stitching → Press & Pack), vendor payments, worker payments, box tracking with shipping
- **Inventory** — Raw material tracking with stock-in/out transactions and valuation
- **Vendors** — Supplier management with per-project payment tracking and balance overview

### Finance & HR
- **Financials** — P&L overview, revenue vs expenses chart, outstanding balances
- **Ledger** — Full chronological transaction history with running balance, date filtering, Excel/PDF export
- **Opening Balance** — Set a starting account balance and cutoff date for a clean-slate ledger view
- **Expenses** — Business expense tracking by category with recurring support
- **Employees & Payroll** — Staff records, salary management, advance tracking
- **Personal Loans** — Track money borrowed from friends and money lent out, with repayment history per person

### Settings & Admin
- **Backup & Restore** — Compressed (gzip) backups with selective module export (choose which data to include)
- **Opening Balance** — Financial fresh-start without deleting historical data
- **Role-based Access** — Super Admin / Sales / Inventory roles with JWT auth
- **App Branding** — Custom logo and app name via Settings
- **Multi-company** — Multiple company profiles each with their own logo and bank details
- **Reminders** — Client-linked reminders with due dates

### UX
- **Fully Responsive** — Mobile hamburger sidebar, tablet, and desktop layouts
- **SaaS Wizard** — First-run setup wizard
- **Forgot Password** — Self-service password reset flow
- **Mockup Generator** — Product mockup tool

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
# Clone the repo
git clone https://github.com/pixelswd44/Apparel-Managment-System.git
cd Apparel-Managment-System

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
npm run dev

# Terminal 2 — Frontend (port 5173)
cd client
npm run dev
```

Then open **http://localhost:5173** in your browser.

On first run, the **Setup Wizard** will appear to configure your company, currency, and admin account.

---

## Production Deployment

```bash
# On your server — pull, build, and restart
bash deploy.sh
```

The deploy script:
1. Pulls latest code from GitHub
2. Installs dependencies
3. Builds the React frontend
4. Restarts the backend with PM2
5. Reloads Nginx

---

## Default Roles

| Role            | Access                                   |
|-----------------|------------------------------------------|
| **Super Admin** | Full access to all modules               |
| **Sales**       | Quotations, Invoices, Clients            |
| **Inventory**   | Products, Inventory                      |

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
├── client/                  # React frontend (Vite)
│   └── src/
│       ├── components/      # Layout, Sidebar, shared UI
│       ├── lib/             # API client, auth context
│       └── pages/           # All page components
│
├── server/                  # Express backend
│   └── src/
│       ├── db/              # SQLite schema, migrations, seed data
│       ├── middleware/      # JWT auth middleware
│       └── routes/          # API route handlers
│
├── deploy.sh                # Production deployment script
├── ecosystem.config.cjs     # PM2 process config
└── README.md
```

---

## API Overview

All routes under `/api/*` require a valid JWT Bearer token (except auth and setup endpoints).

| Endpoint                          | Description                        |
|-----------------------------------|------------------------------------|
| `POST /api/auth/login`            | Sign in, returns JWT               |
| `GET  /api/auth/me`               | Current user info                  |
| `POST /api/auth/forgot-password`  | Generate password reset link       |
| `POST /api/auth/reset-password`   | Set new password with token        |
| `GET  /api/setup/status`          | Check if app is configured         |
| `POST /api/setup/complete`        | Complete first-run wizard          |
| `GET  /api/clients`               | List all clients                   |
| `GET  /api/products`              | List products with prices          |
| `GET  /api/quotations`            | List quotations                    |
| `GET  /api/invoices`              | List invoices                      |
| `GET  /api/projects`              | List projects with stages          |
| `GET  /api/overview`              | Dashboard summary stats            |
| `GET  /api/financials/summary`    | P&L overview                       |
| `GET  /api/financials/ledger`     | Full ledger with running balance   |
| `GET  /api/loans`                 | Personal loans (borrowed / lent)   |
| `GET  /api/backup/export`         | Download compressed backup (.gz)   |
| `POST /api/backup/import`         | Restore from backup file           |

---

## License

Private — All rights reserved.
