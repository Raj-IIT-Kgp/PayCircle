#!/usr/bin/env bash
# =============================================================================
# PayCircle — Azure VM initial setup script
# Run this ONCE on a fresh Ubuntu 22.04 / 24.04 Azure VM as root or with sudo.
# Usage: sudo bash vm-setup.sh
# =============================================================================
set -euo pipefail

APP_DIR="/opt/paycircle"
REPO_URL="https://github.com/Raj-IIT-Kgp/PayCircle.git"

echo "==> [1/6] Updating system packages"
apt-get update -y && apt-get upgrade -y

echo "==> [2/6] Installing Docker Engine"
apt-get install -y ca-certificates curl gnupg lsb-release git

# Add Docker's official GPG key
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

# Add Docker repository
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  | tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

systemctl enable docker
systemctl start docker

echo "==> [3/6] Adding azureuser to docker group"
usermod -aG docker azureuser

echo "==> [4/6] Creating app directory"
mkdir -p "$APP_DIR/uploads"
cd "$APP_DIR"

echo "==> [5/6] Cloning repository (for compose files only)"
if [ ! -f "$APP_DIR/docker-compose.prod.yml" ]; then
  git clone --depth 1 "$REPO_URL" /tmp/paycircle-clone
  cp /tmp/paycircle-clone/docker-compose.prod.yml "$APP_DIR/"
  cp /tmp/paycircle-clone/frontend/nginx.conf "$APP_DIR/"
  rm -rf /tmp/paycircle-clone
fi

echo "==> [6/6] Creating .env file (EDIT THIS BEFORE STARTING THE APP)"
if [ ! -f "$APP_DIR/.env" ]; then
  cat > "$APP_DIR/.env" <<'ENV'
# ── Database ──────────────────────────────────────────────────────────────────
# If using Neon / Supabase / Azure Database for PostgreSQL, paste the URL here.
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/paycircle?sslmode=require

# ── JWT ───────────────────────────────────────────────────────────────────────
JWT_SECRET=CHANGE_ME_use_a_long_random_string

# ── Email (Gmail app password for OTP) ────────────────────────────────────────
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-gmail-app-password

# ── Twilio (voice/video calls) ────────────────────────────────────────────────
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1xxxxxxxxxx
ENV
  echo ""
  echo "  !! IMPORTANT: Edit $APP_DIR/.env before starting the app !!"
fi

echo ""
echo "============================================================"
echo " Setup complete!"
echo " Next steps:"
echo "   1. Edit /opt/paycircle/.env with real secrets"
echo "   2. Open ports 80 and 443 in Azure NSG"
echo "   3. Push to main branch — GitHub Actions will deploy"
echo "============================================================"
