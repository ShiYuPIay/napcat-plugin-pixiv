#!/usr/bin/env bash
set -Eeuo pipefail

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
  同步代码 -> npm 11.19.0 -> 安装依赖 -> 纯代码检查 -> 迁移旧反向 WS 配置
  -> 真实 SnowLuma doctor -> 安装/刷新 systemd 守护 -> 启动并验证
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

log "执行纯代码检查（不在此步骤启动守护，避免递归）"
PIXIV_CHECK_ONLY=1 npm run check

RUNTIME_ENV=("SNOWLUMA_CONTAINER=$SNOWLUMA_CONTAINER")
if [[ -n "$SNOWLUMA_UIN" ]]; then
  RUNTIME_ENV+=("SNOWLUMA_UIN=$SNOWLUMA_UIN")
fi

log "迁移旧版 SnowLuma Pixiv 反向 WebSocket 配置"
env "${RUNTIME_ENV[@]}" node scripts/migrate-legacy-snowluma.mjs

log "执行真实 SnowLuma WebSocket / OneBot 诊断"
env "${RUNTIME_ENV[@]}" node dist/snowluma.mjs --doctor --auto

if [[ "$INSTALL_SERVICE" -eq 0 ]]; then
  log "检查通过；按 --no-service 要求不安装 systemd"
  echo "前台启动：SNOWLUMA_CONTAINER=$SNOWLUMA_CONTAINER ${SNOWLUMA_UIN:+SNOWLUMA_UIN=$SNOWLUMA_UIN }node dist/snowluma.mjs --auto"
  exit 0
fi

log "安装并启动 systemd 守护"
env "${RUNTIME_ENV[@]}" bash scripts/ensure-snowluma-service.sh

cat <<EOF

✅ 部署完成。

插件现在由 systemd 后台守护，可以安全断开 SSH。

QQ 验收：
  #pixivping
  #pixiv帮助

查看状态：
  npm run service:status

查看日志：
  npm run service:logs
EOF
