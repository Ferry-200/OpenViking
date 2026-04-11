#!/usr/bin/env bash
set -euo pipefail

#
# agent-env.sh — Manage parallel dev environments (worktree + Docker)
#
# Usage:
#   ./scripts/agent-env.sh build                    Build once in main repo
#   ./scripts/agent-env.sh create <name> [base]      Create agent environment
#   ./scripts/agent-env.sh destroy <name>            Tear down environment
#   ./scripts/agent-env.sh list                      List all environments
#

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
WORKTREE_DIR="${REPO_ROOT}/.claude/worktrees"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.dev.yml"

# Port scan ranges
BACKEND_PORT_START=1933
BACKEND_PORT_END=1953
FRONTEND_PORT_START=3000
FRONTEND_PORT_END=3020
CONSOLE_OFFSET=6087  # 1933 + 6087 = 8020

# ── Helpers ──────────────────────────────────────────────────────────

usage() {
    cat <<'EOF'
Usage:
  agent-env.sh build                        Build/rebuild in main repo (run once)
  agent-env.sh create <name> [base-branch]  Create a new agent environment
  agent-env.sh destroy <name>               Tear down an agent environment
  agent-env.sh list                         List all agent environments

Examples:
  ./scripts/agent-env.sh build
  ./scripts/agent-env.sh create feature-auth main
  ./scripts/agent-env.sh destroy feature-auth
EOF
    exit 1
}

log() { echo "[agent-env] $*"; }
err() { echo "[agent-env] ERROR: $*" >&2; exit 1; }

is_port_free() {
    ! lsof -iTCP:"$1" -sTCP:LISTEN -P -n >/dev/null 2>&1
}

get_claimed_ports() {
    local env_file
    for env_file in "${WORKTREE_DIR}"/*/.agent-env; do
        [ -f "$env_file" ] && cat "$env_file"
    done 2>/dev/null
}

find_free_port() {
    local start=$1 end=$2
    local claimed
    claimed=$(get_claimed_ports)
    for port in $(seq "$start" "$end"); do
        if is_port_free "$port" && ! echo "$claimed" | grep -q "=${port}$"; then
            echo "$port"
            return 0
        fi
    done
    return 1
}

# ── Build ────────────────────────────────────────────────────────────

cmd_build() {
    log "Building artifacts in Docker (Linux)..."
    cd "${REPO_ROOT}"

    # 1. Build the builder image + compile everything inside Docker
    log "Step 1/2: Building Docker image with full toolchain (this may take a while)..."
    REPO_ROOT="${REPO_ROOT}" \
        docker compose -f "${COMPOSE_FILE}" build builder

    # 2. Run builder to copy artifacts into shared volumes
    log "Step 2/2: Copying artifacts to shared volumes..."
    REPO_ROOT="${REPO_ROOT}" \
        docker compose -f "${COMPOSE_FILE}" --profile build run --rm builder

    log ""
    log "========================================="
    log "  Build complete!"
    log "========================================="
    log "  Artifacts stored in Docker volumes:"
    log "    ov-dev-venv  → Python .venv"
    log "    ov-dev-bin   → Native binaries"
    log ""
    log "  Now run: ./scripts/agent-env.sh create <name> [branch]"
    log "========================================="
}

# ── Create ───────────────────────────────────────────────────────────

cmd_create() {
    local name="${1:?Missing environment name}"
    local base_branch="${2:-HEAD}"
    local worktree_path="${WORKTREE_DIR}/${name}"

    # Verify builder has been run (check named volume exists)
    if ! docker volume inspect ov-dev-venv >/dev/null 2>&1; then
        err "Build artifacts not found. Run './scripts/agent-env.sh build' first."
    fi

    if [ -d "$worktree_path" ]; then
        err "Environment '${name}' already exists at ${worktree_path}"
    fi

    # 1. Allocate ports
    log "Scanning for free ports..."
    local ov_port console_port frontend_port

    ov_port=$(find_free_port $BACKEND_PORT_START $BACKEND_PORT_END) \
        || err "No free backend port in ${BACKEND_PORT_START}-${BACKEND_PORT_END}"
    console_port=$((ov_port + CONSOLE_OFFSET))
    frontend_port=$(find_free_port $FRONTEND_PORT_START $FRONTEND_PORT_END) \
        || err "No free frontend port in ${FRONTEND_PORT_START}-${FRONTEND_PORT_END}"

    if ! is_port_free "$console_port"; then
        err "Console port ${console_port} is already in use"
    fi

    log "Ports: backend=${ov_port} console=${console_port} frontend=${frontend_port}"

    # 2. Create git worktree
    log "Creating worktree at ${worktree_path}..."
    mkdir -p "${WORKTREE_DIR}"
    if git -C "${REPO_ROOT}" show-ref --verify --quiet "refs/heads/agent/${name}"; then
        if [ "${base_branch}" != "HEAD" ]; then
            err "Branch agent/${name} already exists but base '${base_branch}' was specified. Delete first: git branch -D agent/${name}"
        fi
        log "Branch agent/${name} exists, reusing..."
        git -C "${REPO_ROOT}" worktree add "${worktree_path}" "agent/${name}"
    else
        git -C "${REPO_ROOT}" worktree add "${worktree_path}" -b "agent/${name}" "${base_branch}"
    fi

    # 3. Save environment config
    cat > "${worktree_path}/.agent-env" <<ENVEOF
AGENT_NAME=${name}
OV_PORT=${ov_port}
CONSOLE_PORT=${console_port}
FRONTEND_PORT=${frontend_port}
WORKTREE_PATH=${worktree_path}
COMPOSE_PROJECT=ov-${name}
ENVEOF

    # 4. Setup ov.conf and data
    local user_conf="${HOME}/.openviking/ov.conf"

    if [ -f "${user_conf}" ]; then
        # Read workspace path from user's config before overwriting it
        local user_data
        user_data=$(grep -o '"workspace":[[:space:]]*"[^"]*"' "${user_conf}" | head -1 | sed 's/.*"workspace":[[:space:]]*"//;s/"//')
        # Expand ~ if present
        user_data="${user_data/#\~/$HOME}"

        # Copy config, rewrite workspace to container-internal path
        sed 's|"workspace":.*|"workspace": "/app/data"|' "${user_conf}" > "${worktree_path}/ov.conf"
        log "Copied ~/.openviking/ov.conf (workspace → /app/data)"

        # Copy existing data as initial dataset
        if [ -n "${user_data}" ] && [ -d "${user_data}" ]; then
            log "Copying data from ${user_data}..."
            cp -a "${user_data}" "${worktree_path}/data"
            log "Data copied to ${worktree_path}/data/"
        else
            mkdir -p "${worktree_path}/data"
            log "Created empty data directory"
        fi
    elif [ -f "${REPO_ROOT}/examples/ov.conf.example" ]; then
        cp "${REPO_ROOT}/examples/ov.conf.example" "${worktree_path}/ov.conf"
        mkdir -p "${worktree_path}/data"
        log "Copied ov.conf.example (edit as needed)"
    else
        mkdir -p "${worktree_path}/data"
        log "No ov.conf found, created empty data directory"
    fi

    # 5. Start containers
    log "Starting containers (project: ov-${name})..."
    REPO_ROOT="${REPO_ROOT}" \
    WORKTREE_PATH="${worktree_path}" \
    OV_PORT="${ov_port}" \
    CONSOLE_PORT="${console_port}" \
    FRONTEND_PORT="${frontend_port}" \
    COMPOSE_PROJECT_NAME="ov-${name}" \
        docker compose -p "ov-${name}" -f "${COMPOSE_FILE}" up -d --build

    log ""
    log "========================================="
    log "  Environment '${name}' is ready!"
    log "========================================="
    log "  Worktree : ${worktree_path}"
    log "  Branch   : agent/${name}"
    log "  Backend  : http://localhost:${ov_port}"
    log "  Console  : http://localhost:${console_port}"
    log "  Frontend : http://localhost:${frontend_port}"
    log "========================================="
    log ""
    log "  Code changes in Python files → restart:"
    log "    docker compose -p ov-${name} restart backend"
    log ""
    log "  Frontend changes → auto HMR (no restart)"
    log "========================================="
}

# ── Destroy ──────────────────────────────────────────────────────────

cmd_destroy() {
    local name="${1:?Missing environment name}"
    local worktree_path="${WORKTREE_DIR}/${name}"

    if [ ! -d "$worktree_path" ]; then
        err "Environment '${name}' not found"
    fi

    # Stop containers
    log "Stopping containers (ov-${name})..."
    docker compose -p "ov-${name}" -f "${COMPOSE_FILE}" down --remove-orphans 2>/dev/null || true

    # Remove worktree
    log "Removing worktree..."
    git -C "${REPO_ROOT}" worktree remove "${worktree_path}" --force 2>/dev/null || {
        rm -rf "${worktree_path}"
        git -C "${REPO_ROOT}" worktree prune
    }

    # Try to delete branch
    git -C "${REPO_ROOT}" branch -d "agent/${name}" 2>/dev/null || \
        log "Branch agent/${name} kept (unmerged). Delete with: git branch -D agent/${name}"

    log "Environment '${name}' destroyed."
}

# ── List ─────────────────────────────────────────────────────────────

cmd_list() {
    if [ ! -d "$WORKTREE_DIR" ] || [ -z "$(ls -A "$WORKTREE_DIR" 2>/dev/null)" ]; then
        log "No agent environments found."
        return
    fi

    printf "%-15s %-10s %-10s %-10s %-8s\n" "NAME" "BACKEND" "CONSOLE" "FRONTEND" "STATUS"
    printf "%-15s %-10s %-10s %-10s %-8s\n" "----" "-------" "-------" "--------" "------"

    for dir in "${WORKTREE_DIR}"/*/; do
        [ -d "$dir" ] || continue
        local name env_file
        name=$(basename "$dir")
        env_file="${dir}.agent-env"

        if [ -f "$env_file" ]; then
            source "$env_file"
            local status="stopped"
            if docker compose -p "ov-${name}" -f "${COMPOSE_FILE}" ps --status running 2>/dev/null | grep -q "Up"; then
                status="running"
            fi
            printf "%-15s %-10s %-10s %-10s %-8s\n" "$name" ":${OV_PORT}" ":${CONSOLE_PORT}" ":${FRONTEND_PORT}" "$status"
        else
            printf "%-15s %-10s %-10s %-10s %-8s\n" "$name" "?" "?" "?" "no-config"
        fi
    done
}

# ── Main ─────────────────────────────────────────────────────────────

case "${1:-}" in
    build)   cmd_build ;;
    create)  shift; cmd_create "$@" ;;
    destroy) shift; cmd_destroy "$@" ;;
    list)    cmd_list ;;
    *)       usage ;;
esac
