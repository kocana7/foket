#!/bin/bash
# EC2 Ubuntu 22.04 초기 서버 설정 스크립트
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

echo "=== 6. Git 설치 ==="
apt-get install -y git

echo "=== 7. 앱 디렉토리 생성 ==="
mkdir -p /var/www/foket
chown ubuntu:ubuntu /var/www/foket

echo ""
echo "=== 설치 완료 ==="
echo ""
echo "다음 단계:"
echo "1. MySQL 보안 설정: sudo mysql_secure_installation"
echo "2. DB 생성: sudo mysql -u root -p"
echo "   > CREATE DATABASE foketcrypto_db CHARACTER SET utf8mb4;"
echo "   > CREATE USER 'foket'@'localhost' IDENTIFIED BY 'YOUR_DB_PASSWORD';"
echo "   > GRANT ALL ON foketcrypto_db.* TO 'foket'@'localhost';"
echo "   > FLUSH PRIVILEGES;"
echo "3. 앱 클론:"
echo "   cd /var/www/foket && git clone https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPO.git ."
echo "4. .env 파일 생성: nano /var/www/foket/.env"
echo "5. DB 스키마 적용: cd /var/www/foket && node database/setup.js"
echo "6. Nginx 설정: sudo nano /etc/nginx/sites-available/foket"
