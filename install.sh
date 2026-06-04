#!/bin/bash
# install.sh — Install opencode-costs globally
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/caertos/opencode-costs/main/install.sh | bash
#   or: ./install.sh
#
# Requirements:
#   - Python 3.10+
#   - pip (or pipx)
#
# This script:
#   1. Installs the Python package via pip
#   2. Creates a costs-terminal wrapper in ~/.local/bin

set -e

echo "Installing opencode-costs..."

# Check Python version
if ! command -v python3 &>/dev/null; then
    echo "Error: python3 is required but not found" >&2
    exit 1
fi

PYTHON_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
PYTHON_MAJOR=$(echo "$PYTHON_VERSION" | cut -d. -f1)
PYTHON_MINOR=$(echo "$PYTHON_VERSION" | cut -d. -f2)

if [ "$PYTHON_MAJOR" -lt 3 ] || ([ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -lt 10 ]); then
    echo "Error: Python 3.10+ required, found $PYTHON_VERSION" >&2
    exit 1
fi

# Install via pip
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if command -v pip3 &>/dev/null; then
    pip3 install --user "$SCRIPT_DIR"
elif command -v pipx &>/dev/null; then
    pipx install "$SCRIPT_DIR"
else
    echo "Error: pip or pipx is required" >&2
    exit 1
fi

# Create costs-terminal wrapper
mkdir -p ~/.local/bin

cat > ~/.local/bin/costs-terminal << 'WRAPPER'
#!/bin/bash
# costs-terminal — open costs in a separate terminal window
CMD="costs $*"

# Try terminal emulators in order
for term in mate-terminal gnome-terminal xfce4-terminal xterm; do
    if command -v "$term" &>/dev/null; then
        case "$term" in
            mate-terminal|gnome-terminal)
                "$term" -- bash -c "$CMD; echo ''; echo 'Presiona Enter para cerrar...'; read"
                ;;
            xfce4-terminal)
                "$term" -e "bash -c '$CMD; echo; echo Press Enter to close; read'"
                ;;
            xterm)
                "$term" -e "bash -c '$CMD; echo; echo Press Enter to close; read'"
                ;;
        esac
        exit 0
    fi
done

echo "Error: No supported terminal emulator found (mate-terminal, gnome-terminal, xfce4-terminal, xterm)" >&2
exit 1
WRAPPER

chmod +x ~/.local/bin/costs-terminal

echo ""
echo "Installation complete!"
echo ""
echo "Usage:"
echo "  costs                    # Most recent session"
echo "  costs --all              # Global statistics"
echo "  costs --last 5           # Last 5 sessions"
echo "  costs --json             # JSON output"
echo "  costs --window           # Open in separate terminal"
echo "  costs-terminal           # Same as --window"
echo ""
echo "Make sure ~/.local/bin is in your PATH:"
echo '  export PATH="$HOME/.local/bin:$PATH"'
