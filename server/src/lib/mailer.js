// ─── Email service ────────────────────────────────────────────────────────────
// Uses nodemailer + SMTP. If SMTP_HOST is not configured, email functions
// return { sent: false } so callers can fall back to showing the link on-screen.
//
// Configuration (set in server/.env):
//   SMTP_HOST       = smtp.gmail.com
//   SMTP_PORT       = 587
//   SMTP_USER       = your-email@gmail.com
//   SMTP_PASS       = your-app-password   (NOT your Gmail password — see README)
//   SMTP_FROM       = "Apparel CRM" <your-email@gmail.com>
//   APP_URL         = https://your-domain.com    (used in reset links)
//
// Gmail setup:
//   1. Enable 2-Step Verification on your Google account
//   2. Generate an "App Password" at https://myaccount.google.com/apppasswords
//   3. Use that 16-char password (not your real password) as SMTP_PASS

import nodemailer from 'nodemailer';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT || '587', 10),
    secure: parseInt(SMTP_PORT || '587', 10) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

export function isEmailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

// ─── Password reset email ──────────────────────────────────────────────────────
export async function sendPasswordResetEmail({ to, name, resetUrl, appName = 'Apparel CRM' }) {
  const tx = getTransporter();
  if (!tx) return { sent: false, reason: 'SMTP not configured' };

  const from = process.env.SMTP_FROM || `"${appName}" <${process.env.SMTP_USER}>`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Reset your password</title></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:40px 20px;">
    <tr><td align="center">
      <table width="500" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);padding:32px 32px 28px;text-align:center;">
          <div style="display:inline-flex;align-items:center;gap:10px;">
            <div style="width:38px;height:38px;background:rgba(255,255,255,0.2);border-radius:10px;display:inline-flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:20px;">🔐</div>
            <span style="color:white;font-size:20px;font-weight:700;letter-spacing:-0.3px;">${appName}</span>
          </div>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:36px 32px 28px;">
          <h1 style="margin:0 0 12px;color:#0f172a;font-size:22px;font-weight:700;letter-spacing:-0.4px;">Reset your password</h1>
          <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.6;">
            Hi ${name || 'there'}, we got a request to reset the password for your <strong>${appName}</strong> account.
            Click the button below to choose a new password — this link is valid for <strong>1 hour</strong>.
          </p>

          <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="background:#6366f1;border-radius:10px;">
              <a href="${resetUrl}" style="display:inline-block;padding:14px 28px;color:white;font-size:15px;font-weight:600;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                Reset Password →
              </a>
            </td></tr>
          </table>

          <p style="margin:0 0 8px;color:#94a3b8;font-size:13px;">Or paste this link into your browser:</p>
          <p style="margin:0 0 28px;color:#6366f1;font-size:12px;word-break:break-all;font-family:'SF Mono',Monaco,Consolas,monospace;background:#f8fafc;padding:10px 12px;border-radius:8px;border:1px solid #e2e8f0;">
            ${resetUrl}
          </p>

          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">

          <p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.6;">
            If you didn't request this password reset, you can safely ignore this email — your password will remain unchanged.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;text-align:center;">
          <p style="margin:0;color:#94a3b8;font-size:12px;">This is an automated message from ${appName}.<br>Please don't reply to this email.</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `Reset your ${appName} password

Hi ${name || 'there'},

We got a request to reset the password for your ${appName} account.

Click this link to choose a new password (valid for 1 hour):
${resetUrl}

If you didn't request this, ignore this email — your password will remain unchanged.
`;

  try {
    const info = await tx.sendMail({
      from,
      to,
      subject: `Reset your ${appName} password`,
      text,
      html,
    });
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    console.error('[mailer] Failed to send password reset email:', err.message);
    return { sent: false, reason: err.message };
  }
}

// ─── Connection test (useful for /api/setup or debug) ────────────────────────
export async function verifyEmailConnection() {
  const tx = getTransporter();
  if (!tx) return { ok: false, reason: 'SMTP not configured' };
  try {
    await tx.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}
