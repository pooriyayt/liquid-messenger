#!/usr/bin/env bash
# ==============================================================================
# Liquid Chat - Automated Server Installer for Linux (Ubuntu, Debian, CentOS)
# Fast, secure one-command setup with Nginx, PHP 8.x, MariaDB & PWA Configuration
# ==============================================================================

set -euo pipefail

# ANSI Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo -e "${CYAN}${BOLD}"
echo "=================================================================="
echo "      💧 Liquid Chat - Automated Server & Host Installer         "
echo "      High-Performance, Privacy-Focused & PWA Messenger          "
echo "=================================================================="
echo -e "${NC}"

# Check for root/sudo
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}[ERROR] This script must be run as root or with sudo.${NC}"
   exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 1. Detect Operating System
echo -e "${BLUE}[1/7] Detecting Linux distribution...${NC}"
OS=""
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    echo -e "${RED}[ERROR] Cannot detect Linux distribution.${NC}"
    exit 1
fi

echo -e "${GREEN}Detected OS: $OS ($VERSION_ID)${NC}"

# 2. Collect Configuration Parameters
echo -e "\n${BLUE}[2/7] Configuration Parameters${NC}"
read -rp "Enter Domain Name or Public IP (e.g., chat.example.com or 1.2.3.4): " DOMAIN_NAME
if [ -z "$DOMAIN_NAME" ]; then
    DOMAIN_NAME="localhost"
fi

read -rp "Enter Database Name [default: liquid_chat]: " DB_NAME
DB_NAME=${DB_NAME:-liquid_chat}

read -rp "Enter Database Username [default: liquid_user]: " DB_USER
DB_USER=${DB_USER:-liquid_user}

DB_PASS_GENERATED=$(openssl rand -base64 18 | tr -dc 'a-zA-Z0-9' | head -c 16)
read -rp "Enter Database Password [default: $DB_PASS_GENERATED]: " DB_PASS
DB_PASS=${DB_PASS:-$DB_PASS_GENERATED}

SITE_URL="http://${DOMAIN_NAME}"

# 3. Install Packages
echo -e "\n${BLUE}[3/7] Installing dependencies (Nginx, PHP, MariaDB, OpenSSL)...${NC}"

if [[ "$OS" == "ubuntu" || "$OS" == "debian" ]]; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y
    apt-get install -y software-properties-common curl wget git unzip openssl nginx mariadb-server

    # Install PHP and essential extensions
    apt-get install -y php-fpm php-cli php-mysql php-mbstring php-curl php-gd php-imagick php-xml php-zip php-json

    # Detect PHP-FPM socket path
    PHP_VERSION=$(php -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;')
    PHP_FPM_SOCK="/run/php/php${PHP_VERSION}-fpm.sock"
    WEB_USER="www-data"

elif [[ "$OS" == "centos" || "$OS" == "rhel" || "$OS" == "almalinux" || "$OS" == "rocky" ]]; then
    dnf install -y epel-release
    dnf install -y nginx mariadb-server mariadb openssl curl wget git unzip
    dnf install -y php-fpm php-cli php-mysqlnd php-mbstring php-gd php-xml php-json

    systemctl enable mariadb
    systemctl start mariadb
    systemctl enable nginx
    systemctl start nginx

    PHP_FPM_SOCK="/run/php-fpm/www.sock"
    WEB_USER="nginx"
else
    echo -e "${YELLOW}[WARNING] Unsupported distribution detected ($OS). Proceeding with generic fallback...${NC}"
    PHP_FPM_SOCK="/run/php/php-fpm.sock"
    WEB_USER="www-data"
fi

# 4. Database Setup & Migration
echo -e "\n${BLUE}[4/7] Configuring Database and schema...${NC}"
systemctl enable mariadb || systemctl enable mysql || true
systemctl start mariadb || systemctl start mysql || true

mysql -e "CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -e "CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';"
mysql -e "GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';"
mysql -e "FLUSH PRIVILEGES;"

SQL_FILE="$SCRIPT_DIR/database_complete.sql"
if [ ! -f "$SQL_FILE" ]; then
    SQL_FILE="$SCRIPT_DIR/includes/database.sql"
fi

if [ -f "$SQL_FILE" ]; then
    echo -e "${CYAN}Importing database schema from $(basename "$SQL_FILE")...${NC}"
    mysql -u "${DB_USER}" -p"${DB_PASS}" "${DB_NAME}" < "$SQL_FILE"
    echo -e "${GREEN}Database imported successfully.${NC}"
else
    echo -e "${RED}[WARNING] Schema SQL file not found. Please import manually.${NC}"
fi

# 5. Generate Encryption Keys & Application Config
echo -e "\n${BLUE}[5/7] Generating AES-256 keys, VAPID push keys and config.php...${NC}"
mkdir -p "$SCRIPT_DIR/uploads/images" "$SCRIPT_DIR/uploads/voice" "$SCRIPT_DIR/uploads/files" "$SCRIPT_DIR/storage" "$SCRIPT_DIR/logs"

# Generate 32-byte Base64 key
APP_ENC_KEY=$(openssl rand -base64 32)

# Write includes/config.php
cat <<EOF > "$SCRIPT_DIR/includes/config.php"
<?php
// Liquid Chat - Application Configuration
// Generated automatically by install.sh on $(date -u +"%Y-%m-%d %H:%M:%S UTC")

define('CSP_REPORT_ONLY', true);
require_once __DIR__ . '/security_headers.php';

// Database credentials
define('DB_HOST', 'localhost');
define('DB_USERNAME', '${DB_USER}');
define('DB_PASSWORD', '${DB_PASS}');
define('DB_NAME', '${DB_NAME}');

// Establish Database Connection
\$conn = new mysqli(DB_HOST, DB_USERNAME, DB_PASSWORD, DB_NAME);
if (\$conn->connect_error) {
    die("Database connection failed: " . \$conn->connect_error);
}
\$conn->set_charset("utf8mb4");

// Application URL & Upload Paths
define('SITE_URL', '${SITE_URL}');
define('APP_DEBUG', false);
define('MAX_UPLOAD_BYTES', 100 * 1024 * 1024);
define('UPLOAD_DIR', dirname(__DIR__) . '/uploads/');
define('IMAGE_UPLOAD_DIR', UPLOAD_DIR . 'images/');
define('VOICE_UPLOAD_DIR', UPLOAD_DIR . 'voice/');
define('FILE_UPLOAD_DIR', UPLOAD_DIR . 'files/');

define('UPLOAD_URL', 'uploads/');
define('IMAGE_UPLOAD_URL', UPLOAD_URL . 'images/');
define('VOICE_UPLOAD_URL', UPLOAD_URL . 'voice/');
define('FILE_UPLOAD_URL', UPLOAD_URL . 'files/');

// Server-side encryption key (AES-256-GCM)
define('APP_ENC_KEY', '${APP_ENC_KEY}');

// Set Timezone
date_default_timezone_set('UTC');

// Session Security & Cookie Configuration
\$cookieSecure = (!empty(\$_SERVER['HTTPS']) && \$_SERVER['HTTPS'] !== 'off') || (!empty(\$_SERVER['SERVER_PORT']) && (int) \$_SERVER['SERVER_PORT'] === 443);
\$cookieParams = session_get_cookie_params();
\$cookieParams['secure'] = \$cookieSecure;
\$cookieParams['httponly'] = true;
\$cookieParams['samesite'] = 'Lax';
session_set_cookie_params(\$cookieParams);
ini_set('session.cookie_httponly', '1');
ini_set('session.cookie_samesite', 'Lax');
ini_set('session.cookie_secure', \$cookieSecure ? '1' : '0');
ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}
EOF

# Generate Web Push VAPID keys if not present
if [ ! -f "$SCRIPT_DIR/storage/vapid_keys.json" ]; then
    php -r "
    \$res = openssl_pkey_new(['private_key_type' => OPENSSL_KEYTYPE_EC, 'curve_name' => 'prime256v1']);
    if (\$res) {
        openssl_pkey_export(\$res, \$priv);
        \$d = openssl_pkey_get_details(\$res);
        \$raw = \"\x04\" . \$d['ec']['x'] . \$d['ec']['y'];
        \$pub = rtrim(strtr(base64_encode(\$raw), '+/', '-_'), '=');
        file_put_contents('$SCRIPT_DIR/storage/vapid_keys.json', json_encode(['public_key' => \$pub, 'private_pem' => \$priv], JSON_PRETTY_PRINT));
    }
    " || true
fi

# Lock install
touch "$SCRIPT_DIR/installed.lock"
touch "$SCRIPT_DIR/storage/installed.lock"

# 6. File Permissions
echo -e "\n${BLUE}[6/7] Setting permissions for web user ($WEB_USER)...${NC}"
chown -R "$WEB_USER":"$WEB_USER" "$SCRIPT_DIR"
find "$SCRIPT_DIR" -type d -exec chmod 755 {} \;
find "$SCRIPT_DIR" -type f -exec chmod 644 {} \;
chmod -R 775 "$SCRIPT_DIR/uploads" "$SCRIPT_DIR/storage" "$SCRIPT_DIR/logs"
chmod +x "$SCRIPT_DIR/install.sh"

# 7. Configure Nginx Server Block
echo -e "\n${BLUE}[7/7] Configuring Nginx Web Server...${NC}"
NGINX_CONF="/etc/nginx/sites-available/liquid.conf"
if [ ! -d /etc/nginx/sites-available ]; then
    NGINX_CONF="/etc/nginx/conf.d/liquid.conf"
fi

cat <<EOF > "$NGINX_CONF"
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN_NAME};
    root ${SCRIPT_DIR};
    index index.php index.html;

    client_max_body_size 100M;

    # Gzip Compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;

    # Security Headers
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "microphone=(self), camera=(self)" always;

    # PWA Service Worker & Manifest
    location /service-worker.js {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        access_log off;
    }

    location /manifest.json {
        add_header Cache-Control "public, max-age=604800";
        access_log off;
    }

    # Static Assets Cache
    location ~* \.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2)$ {
        expires 30d;
        add_header Cache-Control "public, no-transform";
        access_log off;
    }

    # Block direct access to storage and sensitive files
    location ^~ /storage/ {
        deny all;
        return 404;
    }

    location ^~ /logs/ {
        deny all;
        return 404;
    }

    # Clean URL Rewriting for PHP without extension
    location / {
        try_files \$uri \$uri/ \$uri.php?\$args;
    }

    # PHP-FPM Handler
    location ~ \.php$ {
        include fastcgi_params;
        fastcgi_pass unix:${PHP_FPM_SOCK};
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME \$document_root\$fastcgi_script_name;
        fastcgi_intercept_errors on;
        fastcgi_buffer_size 128k;
        fastcgi_buffers 256 16k;
        fastcgi_busy_buffers_size 256k;
        fastcgi_temp_file_write_size 256k;
    }

    location ~ /\. {
        deny all;
    }
}
EOF

if [ -d /etc/nginx/sites-enabled ]; then
    ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/liquid.conf
    rm -f /etc/nginx/sites-enabled/default || true
fi

# Test and reload Nginx & PHP-FPM
nginx -t && systemctl reload nginx || systemctl restart nginx
systemctl restart "php${PHP_VERSION:-}-fpm" || systemctl restart php-fpm || true

echo -e "\n${GREEN}${BOLD}==================================================================${NC}"
echo -e "${GREEN}${BOLD}       🚀 Liquid Chat Installation Completed Successfully!       ${NC}"
echo -e "${GREEN}${BOLD}==================================================================${NC}"
echo -e "Web URL:       ${CYAN}${SITE_URL}${NC}"
echo -e "Database:      ${YELLOW}${DB_NAME}${NC} (User: ${YELLOW}${DB_USER}${NC})"
echo -e "Install Path:  ${SCRIPT_DIR}"
echo -e "\n${BOLD}Next Recommended Steps:${NC}"
echo -e "1. Open ${CYAN}${SITE_URL}/register.php${NC} in your browser to create your admin account."
echo -e "2. Enable HTTPS via Let's Encrypt Certbot: ${YELLOW}certbot --nginx -d ${DOMAIN_NAME}${NC}"
echo -e "3. Install the app on your phone or desktop: Open the URL in Chrome/Safari and click 'Install App'."
echo -e "${GREEN}==================================================================${NC}\n"
