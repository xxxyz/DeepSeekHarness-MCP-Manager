#!/usr/bin/env bash
# dsh-mcp-manager uninstall.sh — macOS / Linux uninstaller (thin wrapper around uninstall.mjs)
#
#   ./dsh-mcp-manager/uninstall.sh                    # default: ~/.dsh, web profile
#   ./uninstall.sh --dsh-home /path/.dsh --profile web
#
# If "permission denied", run: chmod +x dsh-mcp-manager/uninstall.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MJS="$SCRIPT_DIR/uninstall.mjs"

if ! command -v node >/dev/null 2>&1; then
  echo "未找到 node 命令，请先安装 Node.js 18+（https://nodejs.org）" >&2
  exit 1
fi

declare -a ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dsh-home) ARGS+=("--dsh-home" "${2:?--dsh-home 需要路径参数}"); shift 2 ;;
    --profile)  ARGS+=("--profile" "${2:?--profile 需要名称参数}"); shift 2 ;;
    -h|--help)  ARGS+=("--help"); shift ;;
    *) echo "未知参数: $1（用 --help 查看用法）" >&2; exit 2 ;;
  esac
done

exec node "$MJS" "${ARGS[@]}"
