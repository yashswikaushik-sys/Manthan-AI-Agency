#!/bin/bash
# Manthan Agency OS — One-command VPS deployer
# Run this on a fresh Ubuntu 22.04/24.04 VPS as root:
#   curl -sL https://raw.githubusercontent.com/Yashswikaushik/manthan-ai-agency/claude/code-session-work-iKPOx/deploy.sh | bash

set -e
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

echo -e "${GREEN}▶ Installing Node.js 20...${NC}"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

echo -e "${GREEN}▶ Installing pm2...${NC}"
npm install -g pm2

echo -e "${GREEN}▶ Cloning Manthan Agency OS...${NC}"
cd /opt
if [ -d "manthan-ai-agency" ]; then
  cd manthan-ai-agency
  git pull origin claude/code-session-work-iKPOx
else
  git clone -b claude/code-session-work-iKPOx https://github.com/Yashswikaushik/manthan-ai-agency.git
  cd manthan-ai-agency
fi

echo -e "${GREEN}▶ Installing dependencies...${NC}"
npm install

if [ ! -f ".env" ]; then
  cp .env.example .env
  echo -e "${YELLOW}⚠ Created .env — fill in your API keys before starting!${NC}"
  echo -e "${YELLOW}  Edit with: nano /opt/manthan-ai-agency/.env${NC}"
else
  echo -e "${GREEN}✓ .env already exists${NC}"
fi

echo -e "${GREEN}▶ Starting with pm2...${NC}"
pm2 delete manthan-os 2>/dev/null || true
pm2 start server.js --name manthan-os
pm2 save
pm2 startup | tail -1 | bash 2>/dev/null || true

PUBLIC_IP=$(curl -s --max-time 5 ifconfig.me || hostname -I | awk '{print $1}')
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Manthan Agency OS deployed!${NC}"
echo -e "   URL:   http://${PUBLIC_IP}:3000"
echo -e "   Logs:  pm2 logs manthan-os"
echo -e "   Stop:  pm2 stop manthan-os"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}Next: Add firewall rule to allow port 3000${NC}"
echo -e "  AWS:  Edit Security Group → add inbound TCP 3000"
echo -e "  GCP:  VPC Network → Firewall → add rule for tcp:3000"
echo -e "  DigitalOcean: Networking → Firewall → add TCP 3000"
