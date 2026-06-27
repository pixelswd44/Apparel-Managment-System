import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db/index.js';

const router = Router();

// ── GET /api/setup/status ─────────────────────────────────────────────────
// Returns whether the app has been installed yet
router.get('/status', (req, res) => {
  try {
    const userCount = db.prepare('SELECT COUNT(*) as n FROM users').get().n;
    const installed = db.prepare("SELECT value FROM settings WHERE key = 'setup_complete'").get();
    res.json({
      installed: userCount > 0 && installed?.value === '1',
      needs_wizard: userCount === 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/setup/complete ──────────────────────────────────────────────
// Called at the end of the wizard — creates company + admin + seeds settings
router.post('/complete', (req, res) => {
  try {
    // Guard: only run if no users exist
    const userCount = db.prepare('SELECT COUNT(*) as n FROM users').get().n;
    if (userCount > 0)
      return res.status(400).json({ error: 'App is already configured.' });

    const {
      // Company / branding
      company_name, company_logo = '', company_address = '',
      company_city = '', company_country = '',
      company_phone = '', company_email = '', company_website = '',
      app_name = 'Apparel CRM',
      // Default currency
      default_currency = 'USD',
      // Admin account
      admin_name, admin_username, admin_email, admin_password,
      // Plan
      plan = 'trial',   // 'trial' | 'demo'
    } = req.body;

    if (!admin_name || !admin_username || !admin_email || !admin_password)
      return res.status(400).json({ error: 'Admin account fields are required.' });
    if (admin_password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });

    // 1. Create admin user
    const hash = bcrypt.hashSync(admin_password, 10);
    db.prepare(
      'INSERT INTO users (name, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)'
    ).run(admin_name.trim(), admin_username.trim(), admin_email.trim(), hash, 'super_admin');

    // 2. Create company
    if (company_name?.trim()) {
      db.prepare(`
        INSERT INTO companies (name, logo, address, city, country, phone, email, website, is_default)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).run(
        company_name.trim(), company_logo, company_address,
        company_city, company_country, company_phone, company_email, company_website,
      );
    }

    // 3. Save settings
    const upsert = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
    upsert.run('app_name',          app_name.trim() || 'Apparel CRM');
    upsert.run('app_logo',          company_logo);
    upsert.run('company_name',      company_name?.trim() || '');
    upsert.run('company_logo',      company_logo);
    upsert.run('company_address',   company_address);
    upsert.run('company_city',      company_city);
    upsert.run('company_country',   company_country);
    upsert.run('company_phone',     company_phone);
    upsert.run('company_email',     company_email);
    upsert.run('company_website',   company_website);
    upsert.run('setup_complete',    '1');

    // 4. Set default currency
    db.prepare("UPDATE currencies SET is_default = 0").run();
    db.prepare("UPDATE currencies SET is_default = 1 WHERE code = ?").run(default_currency);

    // 5. Set plan & trial expiry
    const now = new Date();
    const trialDays = plan === 'demo' ? 14 : 30;
    const expiresAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    upsert.run('plan',            plan === 'demo' ? 'demo' : 'trial');
    upsert.run('plan_status',     'active');
    upsert.run('plan_expires_at', expiresAt);
    upsert.run('plan_started_at', now.toISOString().slice(0, 10));

    res.json({ success: true, message: 'Setup complete!' });
  } catch (err) {
    if (err.message.includes('UNIQUE'))
      return res.status(409).json({ error: 'Username or email already exists.' });
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/setup/demo ──────────────────────────────────────────────────
// Creates a demo session — pre-fills the wizard or logs in a read-only demo user
router.post('/demo', (req, res) => {
  try {
    const userCount = db.prepare('SELECT COUNT(*) as n FROM users').get().n;

    // If already installed, return demo credentials if demo user exists
    if (userCount > 0) {
      const demoUser = db.prepare("SELECT id FROM users WHERE username = 'demo'").get();
      if (demoUser) return res.json({ demo: true, username: 'demo', password: 'demo1234' });
      return res.status(404).json({ error: 'No demo account on this instance.' });
    }

    // Fresh install — seed demo data and complete setup
    const hash = bcrypt.hashSync('demo1234', 10);

    // Create super_admin
    db.prepare('INSERT INTO users (name, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)')
      .run('Demo Admin', 'admin', 'admin@demo.com', bcrypt.hashSync('admin123', 10), 'super_admin');

    // Create demo viewer
    db.prepare('INSERT INTO users (name, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)')
      .run('Demo User', 'demo', 'demo@demo.com', hash, 'sales');

    // Seed minimal settings
    const upsert = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
    upsert.run('app_name',        'Apparel CRM — Demo');
    upsert.run('setup_complete',  '1');
    upsert.run('plan',            'demo');
    upsert.run('plan_status',     'active');
    const expires = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    upsert.run('plan_expires_at', expires);
    upsert.run('plan_started_at', new Date().toISOString().slice(0, 10));

    // Set USD as default
    db.prepare("UPDATE currencies SET is_default = 0").run();
    db.prepare("UPDATE currencies SET is_default = 1 WHERE code = 'USD'").run();

    res.json({ demo: true, username: 'demo', password: 'demo1234' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
