import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { verifyToken } from './middleware/auth.js';
import authRouter from './routes/auth.js';
import setupRouter from './routes/setup.js';
import clientsRouter from './routes/clients.js';
import uploadsRouter from './routes/uploads.js';
import productsRouter from './routes/products.js';
import categoriesRouter from './routes/categories.js';
import calcTemplatesRouter from './routes/calculator-templates.js';
import costItemsRouter from './routes/cost-breakdown-items.js';
import settingsRouter from './routes/settings.js';
import currenciesRouter from './routes/currencies.js';
import quotationsRouter from './routes/quotations.js';
import invoicesRouter from './routes/invoices.js';
import overviewRouter from './routes/overview.js';
import paymentsRouter from './routes/payments.js';
import companiesRouter from './routes/companies.js';
import remindersRouter from './routes/reminders.js';
import projectsRouter from './routes/projects.js';
import vendorsRouter from './routes/vendors.js';
import inventoryRouter from './routes/inventory.js';
import employeesRouter from './routes/employees.js';
import expensesRouter from './routes/expenses.js';
import financialsRouter from './routes/financials.js';
import documentTemplatesRouter from './routes/document-templates.js';
import backupRouter from './routes/backup.js';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
// Lift JSON body limit so big backups can be imported.
// (Default is ~100kb; backups with images can be 50MB+.)
app.use(express.json({ limit: '200mb' }));

// Serve uploaded files statically
app.use('/uploads', express.static(join(__dirname, '../uploads')));

// ── Public routes ──────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/auth',  authRouter);
app.use('/api/setup', setupRouter);

// ── All routes below require a valid JWT ──────────────────────────────────
app.use('/api', verifyToken);

app.use('/api/clients',            clientsRouter);
app.use('/api/uploads',            uploadsRouter);
app.use('/api/products',           productsRouter);
app.use('/api/categories',         categoriesRouter);
app.use('/api/calculator-templates', calcTemplatesRouter);
app.use('/api/cost-breakdown-items', costItemsRouter);
app.use('/api/settings',           settingsRouter);
app.use('/api/currencies',         currenciesRouter);
app.use('/api/quotations',         quotationsRouter);
app.use('/api/invoices',           invoicesRouter);
app.use('/api/overview',           overviewRouter);
app.use('/api/payments',           paymentsRouter);
app.use('/api/companies',          companiesRouter);
app.use('/api/reminders',          remindersRouter);
app.use('/api/projects',           projectsRouter);
app.use('/api/vendors',            vendorsRouter);
app.use('/api/inventory',          inventoryRouter);
app.use('/api/employees',          employeesRouter);
app.use('/api/expenses',           expensesRouter);
app.use('/api/financials',         financialsRouter);
app.use('/api/document-templates', documentTemplatesRouter);
app.use('/api/backup',             backupRouter);

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
