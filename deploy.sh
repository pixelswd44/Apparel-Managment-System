#!/bin/bash
# Apparel CRM — Deployment Script
# Run this on your server after initial setup
# Usage: bash deploy.sh

set -e

APP_DIR="/var/www/apparel-crm"
REPO="https://github.com/pixelswd44/Apparel-Managment-System.git"

echo "🚀 Deploying Apparel CRM..."

# ── Pull latest code ──────────────────────────────────────────────────────────
if [ -d "$APP_DIR/.git" ]; then
  echo "📥 Pulling latest changes..."
  cd "$APP_DIR"
  git pull origin master
else
  echo "📥 Cloning repository..."
  git clone "$REPO" "$APP_DIR"
  cd "$APP_DIR"
fi

# ── Install dependencies ──────────────────────────────────────────────────────
echo "📦 Installing server dependencies..."
cd "$APP_DIR/server" && npm install --omit=dev

echo "📦 Installing client dependencies..."
cd "$APP_DIR/client" && npm install

# ── Build frontend ────────────────────────────────────────────────────────────
echo "🔨 Building frontend..."
cd "$APP_DIR/client" && npm run build

# ── Create logs directory ─────────────────────────────────────────────────────
mkdir -p "$APP_DIR/logs"

# ── Restart backend with PM2 ──────────────────────────────────────────────────
echo "♻️  Restarting backend..."
cd "$APP_DIR"
pm2 restart ecosystem.config.cjs || pm2 start ecosystem.config.cjs
pm2 save

# ── Reload Nginx ──────────────────────────────────────────────────────────────
echo "🔄 Reloading Nginx..."
sudo nginx -t && sudo systemctl reload nginx

echo "✅ Deployment complete!"
echo "   App running at: http://your-domain.com"
