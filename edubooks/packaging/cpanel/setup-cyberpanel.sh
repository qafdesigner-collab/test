#!/bin/bash
# Knowledge Gate on CyberPanel / OpenLiteSpeed — one-time server setup.
# Run once as root (CyberPanel → Terminal, or SSH):   bash <app folder>/setup-cyberpanel.sh
# It starts the app as a service that restarts by itself (also after updates and reboots), connects the website to it,
# and tries to issue an SSL certificate. Running it again is safe.
set -euo pipefail

say() { printf '\n\033[1;35m▶ %s\033[0m\n' "$*"; }
ok() { printf '  \033[1;32m✔ %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m✘ %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || die "Please run this as root (CyberPanel → Terminal is root), e.g.:  sudo bash $0"

APP="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOME_DIR="$(dirname "$APP")"
[ -f "$APP/app.js" ] || die "app.js not found in $APP. Finish the install wizard first (click Install), then run this again."
NODE="$APP/runtime/bin/node"
[ -x "$NODE" ] || chmod 755 "$APP/runtime/bin/"* 2>/dev/null || true
[ -x "$NODE" ] || die "The Node.js program is missing ($NODE). Extract the zip again."

# The website: CyberPanel keeps each site in /home/<domain>/public_html.
DOMAIN="${DOMAIN:-$(basename "$HOME_DIR")}"
DOCROOT="$HOME_DIR/public_html"
VHOST="/usr/local/lsws/conf/vhosts/$DOMAIN/vhost.conf"
[ -d "$DOCROOT" ] || die "Website folder $DOCROOT not found."
[ -f "$VHOST" ] || die "OpenLiteSpeed settings for $DOMAIN not found ($VHOST). Is this a CyberPanel website? You can set the domain: DOMAIN=your.domain bash $0"
SITE_USER="$(stat -c %U "$APP")"
NAME="kgate-$(echo "$DOMAIN" | tr -c 'a-zA-Z0-9\n' '-')"
UNIT="/etc/systemd/system/$NAME.service"
echo "Website: $DOMAIN · app: $APP · runs as: $SITE_USER"

# ---- 1. a free local port (kept when this runs again)
say "1/5 Choosing a local port"
PORT=""
[ -f "$UNIT" ] && PORT="$(grep -oP 'PORT=\K[0-9]+' "$UNIT" || true)"
if [ -z "$PORT" ]; then
  for p in $(seq 3100 3199); do
    if ! (ss -ltn 2>/dev/null || netstat -ltn 2>/dev/null) | grep -qE "[:.]$p\b"; then PORT=$p; break; fi
  done
fi
[ -n "$PORT" ] || die "No free port between 3100 and 3199."
ok "port $PORT (only reachable from this server)"

# ---- 2. the service
say "2/5 Starting Knowledge Gate as a service"
cat > "$UNIT" <<EOF
[Unit]
Description=Knowledge Gate ($DOMAIN)
After=network.target

[Service]
User=$SITE_USER
WorkingDirectory=$APP
Environment=PORT=$PORT
Environment=HOST=127.0.0.1
ExecStart=$NODE $APP/app.js
Restart=always
RestartSec=3
LimitNOFILE=65536
StandardOutput=append:$APP/stdout.log
StandardError=append:$APP/stderr.log

[Install]
WantedBy=multi-user.target
EOF
touch "$APP/stdout.log" "$APP/stderr.log" && chown "$SITE_USER": "$APP/stdout.log" "$APP/stderr.log"
systemctl daemon-reload
systemctl enable "$NAME" >/dev/null 2>&1
systemctl restart "$NAME"
for i in $(seq 1 60); do
  curl -fsS -o /dev/null "http://127.0.0.1:$PORT/install-status" 2>/dev/null && break
  curl -fsS -o /dev/null "http://127.0.0.1:$PORT/api/health" 2>/dev/null && break
  sleep 1
done
systemctl is-active --quiet "$NAME" || die "The app did not start. Last lines of $APP/stderr.log:
$(tail -n 20 "$APP/stderr.log" 2>/dev/null)"
ok "service $NAME is running"

# ---- 3. OpenLiteSpeed: pass the website to the app
say "3/5 Connecting the website to the app"
cp -n "$VHOST" "$VHOST.before-kgate" 2>/dev/null || true
# remove an earlier block of ours, then add the current one
sed -i '/# BEGIN Knowledge Gate/,/# END Knowledge Gate/d' "$VHOST"
cat >> "$VHOST" <<EOF
# BEGIN Knowledge Gate
extprocessor kgate {
  type                    proxy
  address                 127.0.0.1:$PORT
  maxConns                1000
  pcKeepAliveTimeout      60
  initTimeout             600
  retryTimeout            0
  respBuffer              0
}
# END Knowledge Gate
EOF
# make sure .htaccess files are read for this site
if ! grep -q 'autoLoadHtaccess' "$VHOST"; then
  printf 'rewrite  {\n  enable                  1\n  autoLoadHtaccess        1\n}\n' >> "$VHOST"
fi
HT="$DOCROOT/.htaccess"
[ -f "$HT" ] && [ ! -f "$HT.before-kgate" ] && cp "$HT" "$HT.before-kgate"
OLD=""
[ -f "$HT" ] && OLD="$(sed -e '/# BEGIN EduBooks LMS/,/# END EduBooks LMS/d' -e '/# BEGIN Knowledge Gate/,/# END Knowledge Gate/d' "$HT")"
{
  echo "# BEGIN Knowledge Gate"
  echo "RewriteEngine On"
  echo "RewriteRule ^(.*)\$ http://kgate/\$1 [P,L]"
  echo "# END Knowledge Gate"
  [ -n "$OLD" ] && echo "$OLD"
} > "$HT"
chown "$SITE_USER": "$HT" 2>/dev/null || true
ok "website passes all requests to the app"

# ---- 4. restart the web server
say "4/5 Restarting OpenLiteSpeed"
systemctl restart lsws 2>/dev/null || /usr/local/lsws/bin/lswsctrl restart >/dev/null 2>&1 || die "Could not restart OpenLiteSpeed. Restart it in CyberPanel (Server Status → LiteSpeed Status → Reboot), then open the site."
sleep 3
ok "restarted"

# ---- 5. SSL
say "5/5 SSL certificate (https)"
if command -v cyberpanel >/dev/null 2>&1; then
  if cyberpanel issueSSL --domainName "$DOMAIN" >/tmp/kgate-ssl.log 2>&1; then ok "SSL issued for $DOMAIN"
  else echo "  SSL could not be issued now (is the domain pointing to this server?). Later: CyberPanel → SSL → Manage SSL → $DOMAIN → Issue SSL."; fi
else
  echo "  CyberPanel command not found; issue SSL in CyberPanel → SSL → Manage SSL."
fi

CODE="$(curl -s -o /dev/null -w '%{http_code}' -H "Host: $DOMAIN" http://127.0.0.1/ || true)"
printf '\n\033[1;32m✅ Done.\033[0m Open https://%s\n' "$DOMAIN"
echo "   (website answered: HTTP $CODE). If the install page is still open in your browser, it continues by itself."
echo "   Service: systemctl status $NAME · logs: $APP/stderr.log · run this script again any time."
