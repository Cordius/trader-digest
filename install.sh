#!/usr/bin/env bash
# ============================================================================
# Trader Digest — 一键安装脚本
# ============================================================================
# 自动检测 AI Agent 平台，将 skill 安装到对应目录
# 支持: Claude Code / OpenClaw / Codex CLI / Hermes / 通用
#
# 用法:
#   bash install.sh              # 自动检测平台
#   bash install.sh --platform claude-code   # 指定平台
#   bash install.sh --list       # 列出支持的平台
# ============================================================================

set -euo pipefail

# -- 颜色 ------------------------------------------------------------------

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# -- 项目根目录 (install.sh 所在目录) ---------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# -- 平台定义 ---------------------------------------------------------------

declare -A PLATFORM_DIRS=(
  ["claude-code"]="$HOME/.claude/skills/trader-digest"
  ["openclaw"]="$HOME/.openclaw/skills/trader-digest"
  ["codex"]="$HOME/.codex/skills/trader-digest"
  ["hermes"]="$HOME/.hermes/skills/trader-digest"
  ["cursor"]=".cursor/skills/trader-digest"
  ["local"]="$SCRIPT_DIR"
)

declare -A PLATFORM_NAMES=(
  ["claude-code"]="Claude Code"
  ["openclaw"]="OpenClaw"
  ["codex"]="Codex CLI"
  ["hermes"]="Hermes Agent"
  ["cursor"]="Cursor"
  ["local"]="本地 (当前目录)"
)

# -- 辅助函数 ---------------------------------------------------------------

log_info()  { echo -e "${BLUE}[INFO]${NC} $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

list_platforms() {
  echo ""
  echo "支持的平台:"
  echo ""
  for key in "${!PLATFORM_NAMES[@]}"; do
    printf "  %-15s %s\n" "$key" "${PLATFORM_NAMES[$key]} → ${PLATFORM_DIRS[$key]}"
  done
  echo ""
}

# -- 平台自动检测 -----------------------------------------------------------

detect_platform() {
  # 按优先级检测
  if [ -d "$HOME/.claude" ]; then
    echo "claude-code"
  elif [ -d "$HOME/.openclaw" ]; then
    echo "openclaw"
  elif [ -d "$HOME/.codex" ]; then
    echo "codex"
  elif [ -d "$HOME/.hermes" ]; then
    echo "hermes"
  elif [ -d ".cursor" ]; then
    echo "cursor"
  else
    echo ""
  fi
}

# -- 安装文件 ---------------------------------------------------------------

install_files() {
  local target_dir="$1"

  log_info "安装目标: $target_dir"
  mkdir -p "$target_dir"

  # 必须复制的文件
  local files_to_copy=(
    "SKILL.md"
    "scripts/utils.js"
    "scripts/collect-rss.js"
    "scripts/collect-scrape.js"
    "scripts/collect-central-banks.js"
    "scripts/collect-calendar.js"
    "scripts/collect-sentiment.js"
    "scripts/collect.js"
    "scripts/prepare-digest.js"
    "scripts/deliver-webhook.js"
    "prompts/digest-brief.md"
    "prompts/digest-deep.md"
    "prompts/market-impact.md"
    "prompts/translate.md"
    "config/sources.json"
    "config/config.template.json"
    "package.json"
    "README.md"
  )

  local copied=0
  local skipped=0
  for file in "${files_to_copy[@]}"; do
    local src="$SCRIPT_DIR/$file"
    local dst="$target_dir/$file"
    if [ ! -f "$src" ]; then
      log_warn "源文件不存在: $file (跳过)"
      skipped=$((skipped + 1))
      continue
    fi
    mkdir -p "$(dirname "$dst")"
    cp "$src" "$dst"
    copied=$((copied + 1))
  done

  log_ok "已复制 $copied 个文件"
  [ "$skipped" -gt 0 ] && log_warn "跳过 $skipped 个文件"
}

# -- 安装依赖 ---------------------------------------------------------------

install_deps() {
  local target_dir="$1"

  if ! command -v node &>/dev/null; then
    log_error "未找到 Node.js，请先安装 Node.js 18+"
    echo "  https://nodejs.org/"
    return 1
  fi

  local node_version
  node_version=$(node -v | cut -d. -f1 | tr -d 'v')
  if [ "$node_version" -lt 18 ]; then
    log_error "Node.js 版本过低 ($(node -v))，需要 18+"
    return 1
  fi

  log_info "安装 npm 依赖..."
  (cd "$target_dir" && npm install --production 2>&1 | tail -3)
  log_ok "依赖安装完成"
}

# -- 初始化用户配置 ---------------------------------------------------------

init_config() {
  local config_dir="$HOME/.trader-digest"
  local config_file="$config_dir/config.json"

  if [ -f "$config_file" ]; then
    log_info "配置文件已存在: $config_file (跳过初始化)"
    return 0
  fi

  mkdir -p "$config_dir"
  cp "$SCRIPT_DIR/config/config.template.json" "$config_file"
  log_ok "配置文件已创建: $config_file"
  echo ""
  log_warn "请编辑配置文件，填入你的 Webhook URL:"
  echo "  $config_file"
}

# -- 主流程 -----------------------------------------------------------------

main() {
  local platform=""
  local skip_deps=false

  # 解析参数
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --platform|-p)
        platform="$2"
        shift 2
        ;;
      --list|-l)
        list_platforms
        exit 0
        ;;
      --skip-deps)
        skip_deps=true
        shift
        ;;
      --help|-h)
        echo "用法: bash install.sh [选项]"
        echo ""
        echo "选项:"
        echo "  --platform <name>   指定安装平台 (默认自动检测)"
        echo "  --list              列出支持的平台"
        echo "  --skip-deps         跳过 npm 依赖安装"
        echo "  --help              显示帮助"
        echo ""
        list_platforms
        exit 0
        ;;
      *)
        log_error "未知参数: $1"
        exit 1
        ;;
    esac
  done

  echo ""
  echo "╔══════════════════════════════════════════════╗"
  echo "║   Trader Digest — 全球金融信源日报安装器     ║"
  echo "║   追踪 82+ 专业信源 · 每日市场摘要 · IM 推送  ║"
  echo "╚══════════════════════════════════════════════╝"
  echo ""

  # 检测平台
  if [ -z "$platform" ]; then
    platform=$(detect_platform)
    if [ -z "$platform" ]; then
      log_warn "未检测到已安装的 AI Agent 平台"
      echo ""
      echo "请选择安装平台:"
      echo "  1) claude-code    — Claude Code"
      echo "  2) openclaw       — OpenClaw"
      echo "  3) codex          — Codex CLI"
      echo "  4) hermes         — Hermes Agent"
      echo "  5) cursor         — Cursor"
      echo "  6) local          — 本地 (当前目录)"
      echo ""
      read -rp "请选择 [1-6]: " choice
      case "$choice" in
        1) platform="claude-code" ;;
        2) platform="openclaw" ;;
        3) platform="codex" ;;
        4) platform="hermes" ;;
        5) platform="cursor" ;;
        6) platform="local" ;;
        *) log_error "无效选择"; exit 1 ;;
      esac
    else
      log_info "自动检测到平台: ${PLATFORM_NAMES[$platform]}"
    fi
  fi

  # 验证平台
  if [ -z "${PLATFORM_DIRS[$platform]+x}" ]; then
    log_error "未知平台: $platform"
    list_platforms
    exit 1
  fi

  local target_dir="${PLATFORM_DIRS[$platform]}"
  log_info "目标平台: ${PLATFORM_NAMES[$platform]}"
  log_info "安装目录: $target_dir"
  echo ""

  # 安装
  install_files "$target_dir"
  echo ""

  if [ "$skip_deps" = false ]; then
    install_deps "$target_dir"
    echo ""
  fi

  init_config
  echo ""

  # 完成
  echo "╔══════════════════════════════════════════════╗"
  echo "║              ✅ 安装完成!                     ║"
  echo "╚══════════════════════════════════════════════╝"
  echo ""
  echo "下一步:"
  echo ""
  echo "  1. 编辑配置 (填入 Webhook URL):"
  echo "     nano ~/.trader-digest/config.json"
  echo ""
  echo "  2. 测试运行:"
  echo "     cd $target_dir && node scripts/collect.js"
  echo ""
  echo "  3. 在 Agent 中使用:"
  if [ "$platform" = "claude-code" ]; then
    echo "     输入 /news 触发每日摘要"
    echo "     输入 /market-digest 也可触发"
  elif [ "$platform" = "openclaw" ]; then
    echo "     OpenClaw 会自动发现 skill，输入 /news 触发"
  elif [ "$platform" = "codex" ]; then
    echo "     在项目中使用 Codex CLI 时，skill 会自动加载"
    echo "     输入 '生成今日金融日报' 或 '/news' 触发"
  elif [ "$platform" = "hermes" ]; then
    echo "     Hermes Agent 启动后自动加载 skill"
  else
    echo "     参考目标平台的 skill 文档"
  fi
  echo ""
  echo "  4. 设置定时推送 (可选):"
  if [ "$platform" = "claude-code" ]; then
    echo "     Claude Code 中输入: '设置每日早8点推送金融日报'"
  else
    echo "     配置 cron 定时任务:"
    echo "     0 0 * * * cd $target_dir && node scripts/collect.js && node scripts/prepare-digest.js | node scripts/deliver-webhook.js"
  fi
  echo ""
}

main "$@"
