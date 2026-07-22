#!/usr/bin/env bash
set -euo pipefail

echo "=== Oracle Cloud Setup - Telegram Deals Bot ==="

# 1. Update system
sudo apt update && sudo apt upgrade -y

# 2. Install Node.js 22 (LTS)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# 3. Enable corepack for pnpm
sudo corepack enable
corepack prepare pnpm@latest --activate

# 4. Install pm2 globally
pnpm add -g pm2

# 5. Create project directory
mkdir -p /opt/bot-telegram
cd /opt/bot-telegram

echo "=== Setup complete ==="
echo ""
echo "Next steps:"
echo "  1. Copy your project files to /opt/bot-telegram"
echo "     rsync -avz ./bot-telegram/ ubuntu@<vm-ip>:/opt/bot-telegram/"
echo ""
echo "  2. Create .env file with your tokens"
echo "     nano /opt/bot-telegram/.env"
echo ""
echo "  3. Install dependencies and start"
echo "     cd /opt/bot-telegram"
echo "     pnpm install"
echo "     pnpm db:push"
echo "     pm2 start ecosystem.config.js"
echo "     pm2 save"
echo "     pm2 startup"
echo ""
