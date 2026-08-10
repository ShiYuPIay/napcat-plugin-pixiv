#!/usr/bin/env bash
set -Eeuo pipefail

SERVICE_NAME="napcat-plugin-pixiv"
BRANCH="${PIXIV_BRANCH:-main}"
SNOWLUMA_CONTAINER="${SNOWLUMA_CONTAINER:-snowluma}"
SNOWLUMA_UIN="${SNOWLUMA_UIN:-}"
INSTALL_SERVICE=1

usage() {
  cat <<'EOF'
SnowLuma Pixiv 插件一键部署

用法：
  bash scripts/deploy-snowluma.sh [--no-service]

环境变量：
  PIXIV_BRANCH        要部署的 Git 分支，默认 main
  SNOWLUMA_CONTAINER  SnowLuma Docker 容器名，默认 snowluma
  SNOWLUMA_UIN        多 QQ 环境下指定机器人 QQ 号

默认流程：
  同步远端分支 -> npm 11.19.0 -> 安装依赖 -> check -> SnowLuma doctor
  -> 安装/更新 systemd 服务 -> 启动服务 -> 打印状态
EOF
}

for arg in "$@"; do
  case "$arg" in
    --no-service) INSTALL_SERVICE=0 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "未知参数：$arg" >&2; usage; exit 2 ;;
  esac
done

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31m错误：%s\033[0m\n' "$*" >&2; exit 1; }

for cmd in git node npm docker; do
  command -v "$cmd" >/dev/null 2>&1 || fail "缺少命令：$cmd"
done

docker inspect "$SNOWLUMA_CONTAINER" >/dev/null 2>&1 \
  || fail "未找到 SnowLuma 容器：$SNOWLUMA_CONTAINER"

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" \
  || fail "请在 napcat-plugin-pixiv Git 仓库中运行此脚本"
cd "$ROOT"

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  fail "仓库存在未提交的已跟踪文件修改。为避免覆盖你的改动，部署已停止。"
fi

log "同步 Git 分支：$BRANCH"
git fetch --prune origin "$BRANCH"
git checkout -B "$BRANCH" "origin/$BRANCH"

log "检查 Node.js / npm"
node -v
CURRENT_NPM="$(npm -v)"
if [[ "$CURRENT_NPM" != "11.19.0" ]]; then
  echo "当前 npm=$CURRENT_NPM，升级到项目固定版本 11.19.0"
  npm install --global npm@11.19.0
fi
npm -v

log "安装依赖"
npm install --no-audit --no-fund

log "执行完整项目检查"
npm run check

log "执行 SnowLuma WebSocket / OneBot 真实诊断"
DOCTOR_ENV=("SNOWLUMA_CONTAINER=$SNOWLUMA_CONTAINER")
if [[ -n "$SNOWLUMA_UIN" ]]; then
  DOCTOR_ENV+=("SNOWLUMA_UIN=$SNOWLUMA_UIN")
fi
env "${DOCTOR_ENV[@]}" npm run doctor:snowluma

if [[ "$INSTALL_SERVICE" -eq 0 ]]; then
  log "检查通过；按 --no-service 要求不安装 systemd 服务"
  echo "前台启动：SNOWLUMA_CONTAINER=$SNOWLUMA_CONTAINER ${SNOWLUMA_UIN:+SNOWLUMA_UIN=$SNOWLUMA_UIN }npm run start:snowluma"
  exit 0
fi

[[ "$(id -u)" -eq 0 ]] || fail "安装 systemd 服务需要 root。请使用 sudo/root 运行，或加 --no-service。"
command -v systemctl >/dev/null 2>&1 || fail "系统没有 systemctl；请使用 --no-service 后交给现有进程管理器运行"

NODE_BIN="$(command -v node)"
DOCKER_BIN="$(command -v docker)"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

log "写入 systemd 服务：$SERVICE_FILE"
cat >"$SERVICE_FILE" <<EOF
[Unit]
Description=napcat-plugin-pixiv for SnowLuma OneBot
After=network-online.target docker.service
Wants=network-online.target
Requires=docker.service

[Service]
Type=simple
WorkingDirectory=$ROOT
ExecStart=$NODE_BIN $ROOT/dist/snowluma.mjs --auto
Restart=on-failure
RestartSec=5
TimeoutStopSec=15
Environment=NODE_ENV=production
Environment=SNOWLUMA_CONTAINER=$SNOWLUMA_CONTAINER
Environment=PATH=$(dirname "$NODE_BIN"):$(dirname "$DOCKER_BIN"):/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
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
sleep 2

log "部署结果"
systemctl --no-pager --full status "$SERVICE_NAME" || {
  journalctl -u "$SERVICE_NAME" -n 80 --no-pager || true
  fail "systemd 服务启动失败"
}

cat <<EOF

✅ 部署完成

QQ 验收：
  #pixivping
  #pixiv帮助

查看实时日志：
  journalctl -u $SERVICE_NAME -f

重新部署/更新：
  cd $ROOT
  bash scripts/deploy-snowluma.sh
EOF
