#!/bin/bash
# Hetzner VPS Initial Setup Script
# Sets up directories and tools needed for Mandrel backups

set -e

echo "🚀 Setting up Hetzner VPS for Mandrel..."

# 1. Create backup directory structure
echo "📁 Creating backup directories..."
mkdir -p /root/mandrel-backups
mkdir -p /root/websites
mkdir -p /root/archives

# 2. Update system
echo "📦 Updating system packages..."
apt update
apt upgrade -y

# 3. Install essential tools
echo "🔧 Installing essential tools..."
apt install -y \
    postgresql-16 \
    postgresql-client-16 \
    postgresql-contrib-16 \
    nginx \
    certbot \
    python3-certbot-nginx \
    rsync \
    htop \
    curl \
    git \
    build-essential

# 4. Install Node.js 20.x
echo "📦 Installing Node.js 20.x..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# 5. Install Ollama
echo "🤖 Installing Ollama..."
curl -fsSL https://ollama.ai/install.sh | sh

# 6. Configure PostgreSQL
echo "🐘 Configuring PostgreSQL..."
systemctl enable postgresql
systemctl start postgresql

# Set postgres user password
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'ridgetop2024';"

# Create ridgetop user
sudo -u postgres psql -c "CREATE USER ridgetop WITH PASSWORD 'ridgetop2024' CREATEDB CREATEROLE;"

# Create keymaker database
sudo -u postgres createdb -O ridgetop keymaker_production

# Enable pgvector extension
sudo -u postgres psql -d keymaker_production -c "CREATE EXTENSION IF NOT EXISTS vector;"

# 7. Configure firewall
echo "🔥 Configuring firewall..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# 8. Set timezone
echo "⏰ Setting timezone..."
timedatectl set-timezone America/Chicago

# 9. Create deployment directory for Keymaker
echo "📂 Creating Keymaker deployment directory..."
mkdir -p /root/keymaker

echo "✅ Hetzner VPS setup complete!"
echo ""
echo "Next steps:"
echo "1. Deploy Keymaker application"
echo "2. Sync backups from DO VPS"
echo "3. Update local backup scripts"
echo "4. Set up nginx + SSL"
