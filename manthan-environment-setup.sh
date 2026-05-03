#!/usr/bin/env bash
set -euo pipefail

PYTHON_MIN_VERSION="3.10"
VENV_DIR=".venv"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()    { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

check_command() {
    command -v "$1" &>/dev/null || error "'$1' is not installed. Please install it and retry."
}

check_python_version() {
    local version
    version=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
    python3 -c "
import sys
major, minor = sys.version_info.major, sys.version_info.minor
required = tuple(int(x) for x in '${PYTHON_MIN_VERSION}'.split('.'))
if (major, minor) < required:
    sys.exit(1)
" || error "Python ${PYTHON_MIN_VERSION}+ is required (found ${version})."
    info "Python ${version} detected."
}

create_virtualenv() {
    if [ -d "${VENV_DIR}" ]; then
        warn "Virtual environment '${VENV_DIR}' already exists — skipping creation."
    else
        info "Creating virtual environment in '${VENV_DIR}'..."
        python3 -m venv "${VENV_DIR}"
    fi
}

install_dependencies() {
    local pip="${VENV_DIR}/bin/pip"
    info "Upgrading pip..."
    "${pip}" install --quiet --upgrade pip

    if [ -f "requirements.txt" ]; then
        info "Installing dependencies from requirements.txt..."
        "${pip}" install --quiet -r requirements.txt
    else
        warn "No requirements.txt found — skipping dependency installation."
    fi

    if [ -f "requirements-dev.txt" ]; then
        info "Installing dev dependencies from requirements-dev.txt..."
        "${pip}" install --quiet -r requirements-dev.txt
    fi
}

setup_env_file() {
    if [ ! -f ".env" ]; then
        if [ -f ".env.example" ]; then
            info "Copying .env.example → .env"
            cp .env.example .env
            warn "Please fill in the required values in .env before running the agent."
        else
            warn "No .env or .env.example found. Create a .env file with your API keys."
        fi
    else
        info ".env file already exists — skipping."
    fi
}

print_summary() {
    echo ""
    info "=========================================="
    info " Manthan AI Agency — environment ready"
    info "=========================================="
    echo ""
    echo "  Activate your virtual environment with:"
    echo "    source ${VENV_DIR}/bin/activate"
    echo ""
}

main() {
    info "Starting Manthan AI Agency environment setup..."
    echo ""

    check_command python3
    check_command git
    check_python_version
    create_virtualenv
    install_dependencies
    setup_env_file
    print_summary
}

main "$@"
