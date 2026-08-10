#!/usr/bin/env bash
set -Eeuo pipefail

SERVICE_NAME="napcat-plugin-pixiv"
ACTION="${1:-status}"

need_systemd() {
  command -v systemctl >/dev/null 2>&1 || {
    echo "错误：当前系统没有 systemctl。" >&2
    exit 1
  }
}

need_systemd

case "$ACTION" in
  status)
    systemctl --no-pager --full status "$SERVICE_NAME"
    ;;
  start)
    systemctl start "$SERVICE_NAME"
    systemctl --no-pager --full status "$SERVICE_NAME"
    ;;
  stop)
    systemctl stop "$SERVICE_NAME"
    systemctl --no-pager --full status "$SERVICE_NAME" || true
    ;;
  restart)
    systemctl restart "$SERVICE_NAME"
    sleep 2
    systemctl --no-pager --full status "$SERVICE_NAME"
    ;;
  logs)
    journalctl -u "$SERVICE_NAME" -n 100 --no-pager
    ;;
  follow)
    journalctl -u "$SERVICE_NAME" -f
    ;;
  enable)
    systemctl enable "$SERVICE_NAME"
    ;;
  disable)
    systemctl disable "$SERVICE_NAME"
    ;;
  *)
    cat >&2 <<'EOF'
用法：bash scripts/service-snowluma.sh <命令>

命令：
  status   查看运行状态
  start    启动
  stop     停止
  restart  重启
  logs     查看最近 100 行日志
  follow   实时查看日志
  enable   设置开机自启
  disable  取消开机自启
EOF
    exit 2
    ;;
esac
