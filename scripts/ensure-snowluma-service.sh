#!/usr/bin/env bash
set -Eeuo pipefail

SERVICE_NAME="napcat-plugin-pixiv"
SERVICE_USER="napcat-plugin-pixiv"
SERVICE_GROUP="napcat-plugin-pixiv"
APP_ROOT="/opt/napcat-plugin-pixiv"
STATE_DIR="/var/lib/napcat-plugin-pixiv"
CREDENTIAL_DIR="/etc/napcat-plugin-pixiv"
CREDENTIAL_FILE="$CREDENTIAL_DIR/connection.json"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
SNOWLUMA_CONTAINER="${SNOWLUMA_CONTAINER:-snowluma}"
SNOWLUMA_UIN="${SNOWLUMA_UIN:-}"
ROLLBACK_DIR=""
NEW_CREDENTIAL=""
ROLLBACK_COMPLETE=0
DID_TOUCH_SYSTEMD=0
PREVIOUS_UNIT=0
PREVIOUS_CREDENTIAL=0
PREVIOUS_ENABLED=""
PREVIOUS_ACTIVE=""

fail() { printf '\n错误：%s\n' "$*" >&2; exit 1; }
log() { printf '\n==> %s\n' "$*"; }

rollback_on_exit() {
  local status=$?
  trap - EXIT
  if [[ "$status" -ne 0 && "$ROLLBACK_COMPLETE" -ne 1 && "$DID_TOUCH_SYSTEMD" -eq 1 ]]; then
    printf '\n==> 安装未通过健康检查，正在恢复之前的 systemd 配置\n' >&2
    set +e
    systemctl stop "$SERVICE_NAME" >/dev/null 2>&1
    if [[ "$PREVIOUS_UNIT" -eq 1 ]]; then
      install -m 0644 "$ROLLBACK_DIR/previous.service" "$SERVICE_FILE"
    else
      rm -f "$SERVICE_FILE"
    fi
    if [[ "$PREVIOUS_CREDENTIAL" -eq 1 ]]; then
      install -m 0600 "$ROLLBACK_DIR/previous-connection.json" "$CREDENTIAL_FILE"
    else
      rm -f "$CREDENTIAL_FILE"
    fi
    systemctl daemon-reload >/dev/null 2>&1
    if [[ "$PREVIOUS_UNIT" -eq 1 && "$PREVIOUS_ENABLED" == "enabled" ]]; then
      systemctl enable "$SERVICE_NAME" >/dev/null 2>&1
    else
      systemctl disable "$SERVICE_NAME" >/dev/null 2>&1
    fi
    if [[ "$PREVIOUS_UNIT" -eq 1 && "$PREVIOUS_ACTIVE" == "active" ]]; then
      systemctl restart "$SERVICE_NAME" >/dev/null 2>&1
    else
      systemctl stop "$SERVICE_NAME" >/dev/null 2>&1
    fi
  fi
  if [[ -n "$NEW_CREDENTIAL" ]]; then rm -f "$NEW_CREDENTIAL"; fi
  if [[ -n "$ROLLBACK_DIR" ]]; then rm -rf "$ROLLBACK_DIR"; fi
  exit "$status"
}
trap rollback_on_exit EXIT

if [[ ! "$SNOWLUMA_CONTAINER" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]{0,254}$ ]]; then
  fail "SNOWLUMA_CONTAINER 必须是 1-255 个字符的 Docker 容器名称或 ID"
fi
if [[ -n "$SNOWLUMA_UIN" && ! "$SNOWLUMA_UIN" =~ ^[0-9]{1,20}$ ]]; then
  fail "SNOWLUMA_UIN 必须是 1-20 位数字"
fi

[[ "$(uname -s)" == "Linux" ]] || fail "systemd 守护仅适用于 Linux"
[[ "$(id -u)" -eq 0 ]] || fail "安装 systemd 守护需要 root 权限"
for cmd in systemctl systemd-analyze journalctl docker node git install useradd getent nologin \
  readlink mktemp find id date chmod chown cp mv rm sed seq sleep awk tr grep; do
  command -v "$cmd" >/dev/null 2>&1 || fail "当前系统缺少命令：$cmd"
done
command -v systemd-analyze >/dev/null 2>&1 || fail "当前系统缺少 systemd-analyze，无法验证生成的服务配置"
SYSTEMD_VERSION="$(systemctl --version | awk 'NR == 1 {print $2}')"
[[ "$SYSTEMD_VERSION" =~ ^[0-9]+$ && "$SYSTEMD_VERSION" -ge 247 ]] \
  || fail "需要 systemd 247 或更高版本以安全加载连接凭据；当前版本：${SYSTEMD_VERSION:-未知}"

docker inspect "$SNOWLUMA_CONTAINER" >/dev/null 2>&1 || fail "未找到 SnowLuma 容器：$SNOWLUMA_CONTAINER"
ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || fail "请在 napcat-plugin-pixiv 仓库中运行"
cd "$ROOT"
[[ -f "$ROOT/dist/snowluma.mjs" ]] || fail "缺少 dist/snowluma.mjs，请先运行 npm run build"

NODE_SOURCE="$(readlink -f "$(command -v node)")" || fail "无法解析 Node.js 可执行文件路径"
[[ -x "$NODE_SOURCE" ]] || fail "Node.js 可执行文件不可用：$NODE_SOURCE"
RELEASE_COMMIT="$(git rev-parse HEAD)"
[[ "$RELEASE_COMMIT" =~ ^[a-f0-9]{40}$ ]] || fail "无法验证当前部署提交"
RELEASE_ID="${RELEASE_COMMIT:0:12}-$(date -u +%Y%m%d%H%M%S)"
RELEASE_DIR="$APP_ROOT/releases/$RELEASE_ID"

if ! getent passwd "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system --user-group --no-create-home --home-dir "$STATE_DIR" --shell "$(command -v nologin)" "$SERVICE_USER" \
    || fail "无法创建专用 systemd 用户 $SERVICE_USER"
elif ! getent group "$SERVICE_GROUP" >/dev/null 2>&1; then
  fail "已存在 $SERVICE_USER 用户但缺少同名组；请先修正该服务账户"
fi
if id -nG "$SERVICE_USER" | tr ' ' '\n' | grep -Eq '^(docker|sudo|wheel)$'; then
  fail "服务账户 $SERVICE_USER 属于特权组；请移除 docker/sudo/wheel 组后重试"
fi

FRAGMENT_PATH="$(systemctl show -p FragmentPath --value "$SERVICE_NAME" 2>/dev/null || true)"
if [[ -n "$FRAGMENT_PATH" && "$FRAGMENT_PATH" != "$SERVICE_FILE" ]]; then
  fail "发现由其他位置管理的同名 systemd 服务（$FRAGMENT_PATH）；拒绝覆盖"
fi

ROLLBACK_DIR="$(mktemp -d "/run/${SERVICE_NAME}.rollback.XXXXXX")"
chmod 0700 "$ROLLBACK_DIR"
if [[ -f "$SERVICE_FILE" ]]; then
  cp -a "$SERVICE_FILE" "$ROLLBACK_DIR/previous.service"
  PREVIOUS_UNIT=1
fi
if [[ -f "$CREDENTIAL_FILE" ]]; then
  cp -a "$CREDENTIAL_FILE" "$ROLLBACK_DIR/previous-connection.json"
  PREVIOUS_CREDENTIAL=1
fi
PREVIOUS_ENABLED="$(systemctl is-enabled "$SERVICE_NAME" 2>/dev/null || true)"
PREVIOUS_ACTIVE="$(systemctl is-active "$SERVICE_NAME" 2>/dev/null || true)"

log "在 systemd 之外通过 Docker 发现 OneBot 连接，并将密钥交由 systemd 凭据存储"
if ! CONNECTION_JSON="$(node "$ROOT/dist/snowluma.mjs" --export-connection --auto)"; then
  fail "无法从 SnowLuma Docker 配置读取 OneBot WebSocket 连接"
fi
[[ "$CONNECTION_JSON" == \{*\} ]] || fail "连接发现未返回有效凭据数据"

log "准备不可由普通用户修改的发布目录：$RELEASE_DIR"
install -d -o root -g root -m 0755 "$APP_ROOT" "$APP_ROOT/releases" "$RELEASE_DIR" \
  "$RELEASE_DIR/dist" "$RELEASE_DIR/runtime" "$CREDENTIAL_DIR"
chown root:root "$APP_ROOT" "$APP_ROOT/releases" "$RELEASE_DIR" \
  "$RELEASE_DIR/dist" "$RELEASE_DIR/runtime" "$CREDENTIAL_DIR"
chmod 0755 "$APP_ROOT" "$APP_ROOT/releases" "$RELEASE_DIR" \
  "$RELEASE_DIR/dist" "$RELEASE_DIR/runtime" "$CREDENTIAL_DIR"
cp -a "$ROOT/dist/." "$RELEASE_DIR/dist/"
install -o root -g root -m 0755 "$NODE_SOURCE" "$RELEASE_DIR/runtime/node"
find "$RELEASE_DIR" -type d -exec chmod 0755 {} +
find "$RELEASE_DIR" -type f -exec chmod 0644 {} +
chmod 0755 "$RELEASE_DIR/runtime/node"
chown -R root:root "$RELEASE_DIR"
"$RELEASE_DIR/runtime/node" --version >/dev/null || fail "复制后的 Node.js 运行时无法启动"

NEW_CREDENTIAL="$(mktemp "$CREDENTIAL_DIR/connection.json.XXXXXX")"
printf '%s\n' "$CONNECTION_JSON" >"$NEW_CREDENTIAL"
chown root:root "$NEW_CREDENTIAL"
chmod 0600 "$NEW_CREDENTIAL"
unset CONNECTION_JSON

cat >"$ROLLBACK_DIR/new.service" <<EOF
[Unit]
Description=napcat-plugin-pixiv for SnowLuma OneBot
Documentation=https://github.com/ShiYuPIay/napcat-plugin-pixiv
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=0

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_GROUP
WorkingDirectory=$STATE_DIR
ExecStart=$RELEASE_DIR/runtime/node $RELEASE_DIR/dist/snowluma.mjs
LoadCredential=onebot-connection:$CREDENTIAL_FILE
Environment=ONEBOT_CONNECTION_FILE=%d/onebot-connection
Environment=PIXIV_CONFIG_FILE=$STATE_DIR/config.json
Environment=NODE_ENV=production
StateDirectory=napcat-plugin-pixiv
StateDirectoryMode=0750
Restart=always
RestartSec=5s
KillSignal=SIGTERM
TimeoutStartSec=30s
TimeoutStopSec=20s
UMask=0077
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectKernelLogs=true
ProtectControlGroups=true
ProtectHostname=true
RestrictSUIDSGID=true
RestrictNamespaces=true
RestrictRealtime=true
LockPersonality=true
CapabilityBoundingSet=
AmbientCapabilities=
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
SystemCallArchitectures=native
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_NAME

[Install]
WantedBy=multi-user.target
EOF

DID_TOUCH_SYSTEMD=1
mv -f "$NEW_CREDENTIAL" "$CREDENTIAL_FILE"
install -m 0644 "$ROLLBACK_DIR/new.service" "$SERVICE_FILE"
systemd-analyze verify "$SERVICE_FILE" || fail "systemd 服务文件验证失败"

log "启用并启动隔离后的非 root 服务"
systemctl daemon-reload
systemctl enable "$SERVICE_NAME" >/dev/null
systemctl restart "$SERVICE_NAME"

for _ in $(seq 1 15); do
  if ! systemctl is-active --quiet "$SERVICE_NAME"; then
    sleep 2
    continue
  fi
  if journalctl -u "$SERVICE_NAME" --since "30 seconds ago" --no-pager 2>/dev/null \
    | grep -q 'OneBot WebSocket 已连接'; then
    log "systemd 服务已启动并确认真实 OneBot WebSocket 已连接"
    systemctl is-enabled "$SERVICE_NAME"
    systemctl is-active "$SERVICE_NAME"
    systemctl --no-pager --full status "$SERVICE_NAME" | sed -n '1,12p'
    ROLLBACK_COMPLETE=1
    exit 0
  fi
  sleep 2
done

systemctl --no-pager --full status "$SERVICE_NAME" || true
journalctl -u "$SERVICE_NAME" -n 120 --no-pager || true
fail "30 秒内没有确认 OneBot WebSocket 已连接；部署失败并恢复之前的服务配置"
