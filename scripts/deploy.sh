#!/usr/bin/env bash
# Self-host deploy for jira-triage on a Linux or macOS host.
#
# Steps: preflight -> npm ci -> npm test (unless --skip-tests) -> npm run build
#        -> start or restart the server -> health check on /api/health.
#
# Process manager: pm2 if installed (app name "jira-triage"); otherwise nohup,
# with the PID and log files in .deploy/ (gitignored).
#
# Secrets: .env is never sourced or printed. Only the NAMES of required
# variables are checked, plus whether .env is readable by group/others.

set -euo pipefail

APP_NAME="jira-triage"
MIN_NODE="22.13.0"
HEALTH_RETRIES=30
HEALTH_DELAY=1

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$ROOT/.env"
RUN_DIR="$ROOT/.deploy"
PID_FILE="$RUN_DIR/$APP_NAME.pid"
LOG_FILE="$RUN_DIR/$APP_NAME.log"

SKIP_TESTS=0
ACTION="deploy"

usage() {
  cat <<'EOF'
Usage: scripts/deploy.sh [options]

Deploys jira-triage on this host: checks prerequisites, installs dependencies,
runs tests, builds the UI, starts (or restarts) the server, and verifies
GET /api/health on 127.0.0.1.

Options:
  --skip-tests   Skip npm test
  --stop         Stop the server (pm2 app and/or nohup process)
  --status       Show process state and health; exit 0 only if healthy
  -h, --help     Show this help and exit

Configuration is read from .env in the project root, or from the environment
(environment wins). Required unless JIRA_MOCK=1:
  JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN
Optional: PORT (default 3001), JIRA_MOCK (1 = mock Jira), DB_PATH.

Process manager: if pm2 is installed, the server runs as pm2 app "jira-triage".
Otherwise it runs under nohup, with PID and logs in .deploy/.
EOF
}

log()  { printf '[deploy] %s\n' "$*"; }
warn() { printf '[deploy] WARNING: %s\n' "$*" >&2; }
die()  { printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

# Print the value of KEY from .env (last assignment wins). Never echoed by callers.
env_file_value() {
  local key="$1" line
  [[ -f "$ENV_FILE" ]] || return 0
  line="$(grep -E "^[[:space:]]*(export[[:space:]]+)?${key}[[:space:]]*=" "$ENV_FILE" | tail -n 1 || true)"
  [[ -n "$line" ]] || return 0
  line="${line#*=}"
  line="${line%$'\r'}"
  line="${line#"${line%%[![:space:]]*}"}"
  line="${line%"${line##*[![:space:]]}"}"
  if [[ ${#line} -ge 2 ]]; then
    case "$line" in
      \"*\"|\'*\') line="${line:1:${#line}-2}" ;;
    esac
  fi
  printf '%s' "$line"
}

# Effective value: environment first (dotenv does not override it), then .env.
effective_value() {
  local key="$1"
  if [[ -n "${!key:-}" ]]; then
    printf '%s' "${!key}"
  else
    env_file_value "$key"
  fi
}

file_mode() {
  if [[ "$(uname -s)" == "Darwin" ]]; then
    stat -f '%Lp' "$1"
  else
    stat -c '%a' "$1"
  fi
}

node_version_ok() {
  node -e '
    const need = process.argv[1].split(".").map(Number);
    const have = process.versions.node.split(".").map(Number);
    let ok = false;
    for (let i = 0; i < 3; i++) {
      if (have[i] !== need[i]) { ok = have[i] > need[i]; break; }
      if (i === 2) ok = true;
    }
    process.exit(ok ? 0 : 1);
  ' "$MIN_NODE"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "'$1' is required but not found on PATH."
}

resolve_port() {
  local port
  port="$(effective_value PORT)"
  port="${port:-3001}"
  [[ "$port" =~ ^[0-9]+$ ]] && (( port >= 1 && port <= 65535 )) \
    || die "PORT must be an integer between 1 and 65535."
  PORT="$port"
  HEALTH_URL="http://127.0.0.1:${PORT}/api/health"
}

health_ok() {
  local body
  body="$(curl -fsS --max-time 2 "$HEALTH_URL" 2>/dev/null || true)"
  [[ "$body" == *'"ok":true'* ]]
}

pm2_available() { command -v pm2 >/dev/null 2>&1; }
pm2_has_app()   { pm2_available && pm2 describe "$APP_NAME" >/dev/null 2>&1; }

# Prints the PID from PID_FILE if that process is alive and is our server.
nohup_pid() {
  local pid
  [[ -f "$PID_FILE" ]] || return 1
  pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  local cmd
  cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
  [[ "$cmd" == *server/index.js* ]] || return 1
  printf '%s' "$pid"
}

preflight() {
  log "Checking prerequisites"
  command -v node >/dev/null 2>&1 || die "node not found. Install Node.js >= $MIN_NODE."
  node_version_ok || die "Node $(node -p 'process.versions.node') found; need >= $MIN_NODE."
  require_cmd npm
  require_cmd curl

  if [[ "$(effective_value JIRA_MOCK)" == "1" ]]; then
    log "JIRA_MOCK=1: running against mock Jira; credentials not required."
  else
    [[ -f "$ENV_FILE" ]] || die ".env not found. Run: cp .env.example .env  then fill in the Jira values (or set JIRA_MOCK=1)."
    local var missing=""
    for var in JIRA_BASE_URL JIRA_EMAIL JIRA_API_TOKEN; do
      if [[ -z "$(effective_value "$var")" ]]; then
        missing="${missing:+$missing, }$var"
      fi
    done
    [[ -z "$missing" ]] || die "Missing required variable(s) in .env: $missing (names only; values are never printed)."
  fi

  if [[ -f "$ENV_FILE" ]]; then
    local mode
    mode="$(file_mode "$ENV_FILE")"
    if (( (8#$mode & 077) != 0 )); then
      warn ".env is readable by group or others (mode $mode). Setting it to 600."
      chmod 600 "$ENV_FILE"
    fi
  fi
}

install_deps() {
  log "Installing dependencies (npm ci)"
  (cd "$ROOT" && npm ci)
}

run_tests() {
  if (( SKIP_TESTS )); then
    log "Skipping tests (--skip-tests)"
    return 0
  fi
  log "Running tests"
  (cd "$ROOT" && npm test)
}

build_ui() {
  log "Building UI (npm run build)"
  (cd "$ROOT" && npm run build)
  [[ -f "$ROOT/web/dist/index.html" ]] || die "Build finished but web/dist/index.html is missing."
}

stop_nohup() {
  local pid i
  if pid="$(nohup_pid)"; then
    log "Stopping nohup process $pid"
    kill "$pid" 2>/dev/null || true
    for i in 1 2 3 4 5 6 7 8 9 10; do
      kill -0 "$pid" 2>/dev/null || break
      sleep 1
    done
    if kill -0 "$pid" 2>/dev/null; then
      warn "Process $pid did not exit after SIGTERM; sending SIGKILL."
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
    return 0
  fi
  rm -f "$PID_FILE"
  return 1
}

stop_all() {
  local stopped=1
  if pm2_has_app; then
    log "Stopping pm2 app $APP_NAME"
    pm2 delete "$APP_NAME" >/dev/null
    stopped=0
  fi
  if stop_nohup; then
    stopped=0
  fi
  if (( stopped )); then
    log "No jira-triage server found to stop."
  else
    log "Stopped."
  fi
}

start_server() {
  mkdir -p "$RUN_DIR"
  if pm2_available; then
    if pm2_has_app; then
      log "Restarting pm2 app $APP_NAME"
      pm2 restart "$APP_NAME" --update-env >/dev/null
    else
      log "Starting pm2 app $APP_NAME"
      pm2 start "$ROOT/server/index.js" --name "$APP_NAME" --cwd "$ROOT" --update-env >/dev/null
    fi
    START_MODE="pm2"
  else
    log "pm2 not found; starting with nohup (logs: .deploy/$APP_NAME.log)"
    printf '\n[deploy] starting %s at %s\n' "$APP_NAME" "$(date '+%Y-%m-%dT%H:%M:%S%z')" >>"$LOG_FILE"
    nohup node "$ROOT/server/index.js" >>"$LOG_FILE" 2>&1 </dev/null &
    printf '%s\n' "$!" >"$PID_FILE"
    START_MODE="nohup"
  fi
}

show_recent_log() {
  if [[ "$START_MODE" == "pm2" ]]; then
    pm2 logs "$APP_NAME" --lines 20 --nostream 2>/dev/null || true
  elif [[ -f "$LOG_FILE" ]]; then
    tail -n 20 "$LOG_FILE" >&2 || true
  fi
}

wait_healthy() {
  local i pid=""
  if [[ "$START_MODE" == "nohup" ]]; then
    pid="$(cat "$PID_FILE")"
  fi
  for ((i = 1; i <= HEALTH_RETRIES; i++)); do
    if health_ok; then
      return 0
    fi
    if [[ -n "$pid" ]] && ! kill -0 "$pid" 2>/dev/null; then
      warn "Server process $pid exited before becoming healthy."
      show_recent_log
      return 1
    fi
    sleep "$HEALTH_DELAY"
  done
  warn "Health check failed after $HEALTH_RETRIES attempts: $HEALTH_URL"
  show_recent_log
  return 1
}

show_status() {
  local healthy=1 pid
  if pm2_has_app; then
    log "pm2 app $APP_NAME: registered"
    pm2 describe "$APP_NAME" 2>/dev/null | grep -E 'status' || true
  fi
  if pid="$(nohup_pid)"; then
    log "nohup process: running (pid $pid)"
  else
    log "nohup process: not running"
  fi
  if health_ok; then
    log "Health: OK ($HEALTH_URL)"
    healthy=0
  else
    log "Health: not responding ($HEALTH_URL)"
  fi
  return "$healthy"
}

main() {
  while (( $# > 0 )); do
    case "$1" in
      --skip-tests) SKIP_TESTS=1 ;;
      --stop)       ACTION="stop" ;;
      --status)     ACTION="status" ;;
      -h|--help)    usage; exit 0 ;;
      *)            printf 'Unknown option: %s\n\n' "$1" >&2; usage >&2; exit 2 ;;
    esac
    shift
  done

  cd "$ROOT"
  resolve_port

  case "$ACTION" in
    stop)
      stop_all
      exit 0
      ;;
    status)
      require_cmd curl
      if show_status; then
        exit 0
      fi
      exit 1
      ;;
  esac

  preflight

  install_deps
  run_tests
  build_ui

  # Free the port of our own nohup process; leave pm2 apps for a graceful restart.
  if ! pm2_has_app; then
    stop_nohup || true
  fi

  # Fresh start: refuse if something else already answers on the port.
  if ! pm2_has_app && health_ok; then
    die "Port $PORT already answers $HEALTH_URL but is not managed by this script. Stop that process or change PORT."
  fi

  start_server

  if wait_healthy; then
    log "Deployed. Health OK at $HEALTH_URL (mode: $START_MODE)"
    exit 0
  fi
  die "Deploy finished but the server is not healthy. Check the log above, or run: scripts/deploy.sh --status"
}

main "$@"
