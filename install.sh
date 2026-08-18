#!/usr/bin/env bash
# dsh-mcp-manager install.sh — macOS / Linux installer (thin wrapper around install.mjs)
#
#   ./dsh-mcp-manager/install.sh                      # default: ~/.dsh, web profile
#   ./install.sh --dsh-home /path/.dsh --profile web
#   ./install.sh --repair --port 3080
#
# If "permission denied", run: chmod +x dsh-mcp-manager/install.sh
# See install.mjs for the full cross-platform logic and options.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MJS="$SCRIPT_DIR/install.mjs"

if ! command -v node >/dev/null 2>&1; then
  echo "未找到 node 命令，请先安装 Node.js 18+（https://nodejs.org）" >&2
  exit 1
fi

declare -a ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dsh-home)   ARGS+=("--dsh-home" "${2:?--dsh-home 需要路径参数}"); shift 2 ;;
    --profile)    ARGS+=("--profile" "${2:?--profile 需要名称参数}"); shift 2 ;;
    --port)       ARGS+=("--port" "${2:?--port 需要数字参数}"); shift 2 ;;
    --repair)     ARGS+=("--repair"); shift ;;
    --skip-patch) ARGS+=("--skip-patch"); shift ;;
    -h|--help)    ARGS+=("--help"); shift ;;
    *) echo "未知参数: $1（用 --help 查看用法）" >&2; exit 2 ;;
  esac
done

exec node "$MJS" "${ARGS[@]}"
