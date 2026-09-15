#!/usr/bin/env bash
# 启动 paper-reader 的公网隧道，并把当前地址发布到 jsonbin，
# 供博客 /paper 页面运行时读取（快速隧道地址每次重启都会变，所以要动态下发）。
#
# 用法：
#   ./scripts/paper-tunnel.sh              # 前台运行，Ctrl-C 结束
#   ./scripts/paper-tunnel.sh --daemon      # 后台运行（nohup）
#
# 依赖：cloudflared（brew install cloudflared）
set -uo pipefail

LOCAL_PORT="${PAPER_PORT:-8010}"
BIN_ID="${PAPER_BIN_ID:-6aa92c68ac6210605acfe457}"
MASTER_KEY="${JSONBIN_MASTER_KEY:-\$2a\$10\$Iyqn3eO8f2SOtdwE9A9k1uY7MIXfb5k1Z7pYYkWZW9lYtxc1bJlbi}"
CF="$(command -v cloudflared || echo /opt/homebrew/bin/cloudflared)"
LOG="${TMPDIR:-/tmp}/paper-tunnel.log"

publish() {
  local url="$1"
  local now
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  curl -s --max-time 20 -X PUT "https://api.jsonbin.io/v3/b/${BIN_ID}" \
    -H "X-Master-Key: ${MASTER_KEY}" -H "Content-Type: application/json" \
    -d "{\"paperUrl\":\"${url}\",\"updatedAt\":\"${now}\"}" >/dev/null \
    && echo "已发布到 jsonbin：${url}"
}

if [[ "${1:-}" == "--daemon" ]]; then
  nohup "$0" >/dev/null 2>&1 &
  echo "已在后台启动（日志：${LOG}）"
  exit 0
fi

if [[ ! -x "$CF" ]]; then
  echo "未找到 cloudflared，请先：brew install cloudflared" >&2
  exit 1
fi

echo "启动隧道 → http://localhost:${LOCAL_PORT}（日志：${LOG}）"
: > "$LOG"
"$CF" tunnel --url "http://localhost:${LOCAL_PORT}" --no-autoupdate >>"$LOG" 2>&1 &
CF_PID=$!
trap 'kill "$CF_PID" 2>/dev/null; exit 0' INT TERM

# 等待分配地址，并持续监控地址变化（隧道重连时会换地址）
LAST=""
for _ in $(seq 1 900); do
  URL="$(grep -oE 'https://[a-z0-9-]{5,}\.trycloudflare\.com' "$LOG" 2>/dev/null \
        | grep -vE 'api\.|developers\.' | tail -1)"
  if [[ -n "$URL" && "$URL" != "$LAST" ]]; then
    LAST="$URL"
    publish "$URL"
  fi
  if ! kill -0 "$CF_PID" 2>/dev/null; then
    echo "隧道进程已退出，见 ${LOG}" >&2
    exit 1
  fi
  sleep 2
done
