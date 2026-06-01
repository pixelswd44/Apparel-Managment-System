import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import db from '../db/index.js';
import { JWT_SECRET, verifyToken, requireRole } from '../middleware/auth.js';
import { isEmailConfigured, sendPasswordResetEmail } from '../lib/mailer.js';

const router = Router();

// ── POST /api/auth/login ───────────────────────────────────────────────────
router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password required' });

    const user = db.prepare(
      "SELECT * FROM users WHERE (username = ? OR email = ?) AND status = 'active'"
    ).get(username.trim(), username.trim());

    if (!user || !bcrypt.compareSync(password, user.password_hash))
      return res.status(401).json({ error: 'Invalid username or password' });

    const token = jwt.sign(
      { id: user.id, username: user.username, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: { id: user.id, name: user.name, username: user.username, email: user.email, role: user.role },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/auth/me ───────────────────────────────────────────────────────
router.get('/me', verifyToken, (req, res) => {
  try {
    const user = db.prepare('SELECT id, name, username, email, role, status FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/auth/users — super_admin only ─────────────────────────────────
router.get('/users', verifyToken, requireRole('super_admin'), (req, res) => {
  try {
    const rows = db.prepare(
      'SELECT id, name, username, email, role, status, created_at FROM users ORDER BY id ASC'
    ).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/auth/users — super_admin only ────────────────────────────────
router.post('/users', verifyToken, requireRole('super_admin'), (req, res) => {
  try {
    const { name, username, email, password, role } = req.body;
    if (!name || !username || !email || !password || !role)
      return res.status(400).json({ error: 'All fields required' });

    const validRoles = ['super_admin', 'sales', 'inventory'];
    if (!validRoles.includes(role))
      return res.status(400).json({ error: 'Invalid role' });

    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare(
      'INSERT INTO users (name, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)'
    ).run(name.trim(), username.trim(), email.trim(), hash, role);

    const user = db.prepare('SELECT id, name, username, email, role, status, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(user);
  } catch (err) {
    if (err.message.includes('UNIQUE'))
      return res.status(409).json({ error: 'Username or email already exists' });
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/auth/users/:id — super_admin only ─────────────────────────────
router.put('/users/:id', verifyToken, requireRole('super_admin'), (req, res) => {
  try {
    const { name, username, email, role, status, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const validRoles = ['super_admin', 'sales', 'inventory'];
    if (role && !validRoles.includes(role))
      return res.status(400).json({ error: 'Invalid role' });

    const hash = password ? bcrypt.hashSync(password, 10) : user.password_hash;
    db.prepare(`
      UPDATE users SET name=?, username=?, email=?, password_hash=?, role=?, status=?, updated_at=datetime('now')
      WHERE id=?
    `).run(
      name?.trim() || user.name,
      username?.trim() || user.username,
      email?.trim() || user.email,
      hash,
      role || user.role,
      status || user.status,
      req.params.id,
    );

    const updated = db.prepare('SELECT id, name, username, email, role, status, created_at FROM users WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    if (err.message.includes('UNIQUE'))
      return res.status(409).json({ error: 'Username or email already exists' });
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/auth/users/:id — super_admin only ─────────────────────────
router.delete('/users/:id', verifyToken, requireRole('super_admin'), (req, res) => {
  try {
    // Prevent deleting yourself
    if (parseInt(req.params.id) === req.user.id)
      return res.status(400).json({ error: 'You cannot delete your own account' });
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/auth/change-password ────────────────────────────────────────
router.post('/change-password', verifyToken, (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!bcrypt.compareSync(current_password, user.password_hash))
      return res.status(401).json({ error: 'Current password is incorrect' });
    if (!new_password || new_password.length < 6)
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    const hash = bcrypt.hashSync(new_password, 10);
    db.prepare("UPDATE users SET password_hash=?, updated_at=datetime('now') WHERE id=?").run(hash, req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/auth/forgot-password (public) ───────────────────────────────
// Generates a reset token. If SMTP is configured, sends email; otherwise
// returns the token so the frontend can show the reset link on-screen.
router.post('/forgot-password', async (req, res) => {
  try {
    const { username } = req.body;
    if (!username?.trim())
      return res.status(400).json({ error: 'Enter your username or email.' });

    const user = db.prepare(
      "SELECT * FROM users WHERE (username = ? OR email = ?) AND status = 'active'"
    ).get(username.trim(), username.trim());

    // Always respond the same way (don't reveal if user exists)
    if (!user) {
      return res.json({
        success: true,
        emailSent: isEmailConfigured(),
        message: isEmailConfigured()
          ? 'If that account exists, a reset link has been sent to the associated email.'
          : 'If that account exists, a reset link has been generated.',
      });
    }

    // Generate a secure token, valid for 1 hour
    const token   = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    db.prepare("UPDATE users SET reset_token=?, reset_token_expires=?, updated_at=datetime('now') WHERE id=?")
      .run(token, expires, user.id);

    // Build the reset URL from the request origin (or env)
    const origin   = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const resetUrl = `${origin.replace(/\/$/, '')}/reset-password?token=${token}`;

    // Get app name for email subject/body
    const appNameRow = db.prepare("SELECT value FROM settings WHERE key='app_name'").get();
    const appName    = appNameRow?.value || 'Apparel CRM';

    // If SMTP is configured, send the email and DO NOT return the token to the client
    if (isEmailConfigured()) {
      const result = await sendPasswordResetEmail({
        to:       user.email,
        name:     user.name,
        resetUrl,
        appName,
      });

      if (result.sent) {
        return res.json({
          success: true,
          emailSent: true,
          maskedEmail: maskEmail(user.email),
          message: 'Reset link sent. Check your inbox.',
        });
      }
      // If email failed, fall through to returning the link (better UX than erroring out)
      console.error('[auth] Email send failed, falling back to link:', result.reason);
    }

    // SMTP not configured (or failed) — return token so the frontend can show the link
    res.json({
      success: true,
      emailSent: false,
      token,
      name: user.name,
      message: 'Reset link generated. Open it in your browser to set a new password.',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mask "john.smith@example.com" → "j***h@example.com" (privacy)
function maskEmail(email) {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}***${local.slice(-1)}@${domain}`;
}

// ── POST /api/auth/reset-password (public) ────────────────────────────────
router.post('/reset-password', (req, res) => {
  try {
    const { token, new_password } = req.body;
    if (!token || !new_password)
      return res.status(400).json({ error: 'Token and new password are required.' });
    if (new_password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });

    const user = db.prepare(
      "SELECT * FROM users WHERE reset_token = ? AND reset_token_expires > datetime('now') AND status = 'active'"
    ).get(token);

    if (!user)
      return res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });

    const hash = bcrypt.hashSync(new_password, 10);
    db.prepare("UPDATE users SET password_hash=?, reset_token=NULL, reset_token_expires=NULL, updated_at=datetime('now') WHERE id=?")
      .run(hash, user.id);

    res.json({ success: true, message: 'Password updated. You can now sign in.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/auth/validate-reset-token (public) ───────────────────────────
router.get('/validate-reset-token/:token', (req, res) => {
  try {
    const user = db.prepare(
      "SELECT id, name, username FROM users WHERE reset_token = ? AND reset_token_expires > datetime('now') AND status = 'active'"
    ).get(req.params.token);
    if (!user) return res.status(400).json({ valid: false, error: 'Link is invalid or expired.' });
    res.json({ valid: true, name: user.name, username: user.username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
