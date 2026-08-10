#!/usr/bin/env bash
set -Eeuo pipefail

SERVICE_NAME="napcat-plugin-pixiv"
SNOWLUMA_CONTAINER="${SNOWLUMA_CONTAINER:-snowluma}"
SNOWLUMA_UIN="${SNOWLUMA_UIN:-}"

fail() { printf '\n错误：%s\n' "$*" >&2; exit 1; }
log() { printf '\n==> %s\n' "$*"; }

[[ "$(uname -s)" == "Linux" ]] || fail "systemd 守护仅适用于 Linux"
[[ "$(id -u)" -eq 0 ]] || fail "安装 systemd 守护需要 root 权限"
command -v systemctl >/dev/null 2>&1 || fail "当前系统没有 systemctl"
command -v docker >/dev/null 2>&1 || fail "当前系统没有 docker"
docker inspect "$SNOWLUMA_CONTAINER" >/dev/null 2>&1 || fail "未找到 SnowLuma 容器：$SNOWLUMA_CONTAINER"

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || fail "请在 napcat-plugin-pixiv 仓库中运行"
cd "$ROOT"
[[ -f "$ROOT/dist/snowluma.mjs" ]] || fail "缺少 dist/snowluma.mjs，请先运行 npm run build"

NODE_BIN="$(command -v node)"
DOCKER_BIN="$(command -v docker)"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

log "写入 systemd 守护：$SERVICE_FILE"
cat >"$SERVICE_FILE" <<EOF
[Unit]
Description=napcat-plugin-pixiv for SnowLuma OneBot
Documentation=https://github.com/ShiYuPIay/napcat-plugin-pixiv
After=network-online.target docker.service
Wants=network-online.target docker.service
StartLimitIntervalSec=0

[Service]
Type=simple
WorkingDirectory=$ROOT
ExecStart=$NODE_BIN $ROOT/dist/snowluma.mjs --auto
Restart=always
RestartSec=5s
KillSignal=SIGTERM
TimeoutStartSec=30s
TimeoutStopSec=20s
Environment=NODE_ENV=production
Environment=SNOWLUMA_CONTAINER=$SNOWLUMA_CONTAINER
Environment=PATH=$(dirname "$NODE_BIN"):$(dirname "$DOCKER_BIN"):/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_NAME
EOF

if [[ -n "$SNOWLUMA_UIN" ]]; then
  printf 'Environment=SNOWLUMA_UIN=%s\n' "$SNOWLUMA_UIN" >>"$SERVICE_FILE"
fi

cat >>"$SERVICE_FILE" <<'EOF'

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME" >/dev/null
systemctl restart "$SERVICE_NAME"
sleep 3

if ! systemctl is-active --quiet "$SERVICE_NAME"; then
  systemctl --no-pager --full status "$SERVICE_NAME" || true
  journalctl -u "$SERVICE_NAME" -n 100 --no-pager || true
  fail "systemd 守护启动失败"
fi

log "systemd 守护已启动"
systemctl is-enabled "$SERVICE_NAME"
systemctl is-active "$SERVICE_NAME"
systemctl --no-pager --full status "$SERVICE_NAME" | sed -n '1,12p'
