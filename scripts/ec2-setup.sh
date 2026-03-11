#!/bin/bash
# EC2 Ubuntu 22.04 초기 서버 설정 스크립트 (us-west-2 / foket.com)
# 사용법: sudo bash ec2-setup.sh

set -e

echo "=== 1. 시스템 업데이트 ==="
apt-get update -y && apt-get upgrade -y

echo "=== 2. Node.js 20 설치 ==="
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

echo "=== 3. PM2 설치 ==="
npm install -g pm2
pm2 startup systemd -u ubuntu --hp /home/ubuntu

echo "=== 4. MySQL 설치 ==="
apt-get install -y mysql-server
systemctl start mysql
systemctl enable mysql

echo "=== 5. Nginx 설치 ==="
apt-get install -y nginx
systemctl start nginx
systemctl enable nginx

echo "=== 6. Certbot (SSL) 설치 ==="
apt-get install -y certbot python3-certbot-nginx

echo "=== 7. Git 설치 ==="
apt-get install -y git

echo "=== 8. 앱 디렉토리 생성 ==="
mkdir -p /var/www/foket
chown ubuntu:ubuntu /var/www/foket

echo ""
echo "============================================"
echo "  설치 완료! 다음 단계를 순서대로 실행하세요"
echo "============================================"
echo ""
echo "[1] MySQL DB 및 유저 생성:"
echo "    sudo mysql"
echo "    > CREATE DATABASE foketcrypto_db CHARACTER SET utf8mb4;"
echo "    > CREATE USER 'foket'@'localhost' IDENTIFIED BY 'STRONG_PASSWORD';"
echo "    > GRANT ALL ON foketcrypto_db.* TO 'foket'@'localhost';"
echo "    > FLUSH PRIVILEGES; EXIT;"
echo ""
echo "[2] 앱 클론:"
echo "    cd /var/www/foket"
echo "    git clone https://github.com/kocana7/foket.git ."
echo ""
echo "[3] .env 파일 생성:"
echo "    nano /var/www/foket/.env"
echo ""
echo "[4] 앱 실행:"
echo "    cd /var/www/foket && npm install --production"
echo "    node database/setup.js"
echo "    pm2 start ecosystem.config.js --env production"
echo "    pm2 save"
echo ""
echo "[5] Nginx 설정:"
echo "    sudo cp /var/www/foket/scripts/nginx.conf /etc/nginx/sites-available/foket"
echo "    sudo ln -s /etc/nginx/sites-available/foket /etc/nginx/sites-enabled/"
echo "    sudo rm -f /etc/nginx/sites-enabled/default"
echo "    sudo nginx -t && sudo systemctl reload nginx"
echo ""
echo "[6] SSL 인증서 발급 (DNS A레코드 설정 후):"
echo "    sudo certbot --nginx -d foket.com -d www.foket.com"
echo ""
