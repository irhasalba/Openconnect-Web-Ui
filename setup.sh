#!/bin/bash
# GP Connect - Setup Script

set -e

echo "=============================================="
echo "   GP Connect MVP - Setup Script"
echo "=============================================="
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 not found. Please install Python 3.8+."
    exit 1
fi

PYTHON_VERSION=$(python3 --version | awk '{print $2}')
echo "✅ Python found: $PYTHON_VERSION"

# Install system packages
echo ""
echo "📦 Installing system dependencies..."
echo "   This requires sudo privileges."

if command -v apt &> /dev/null; then
    sudo apt update
    sudo apt install -y python3-flask python3-requests python3-urllib3 openconnect
elif command -v dnf &> /dev/null; then
    sudo dnf install -y python3-flask python3-requests python3-urllib3 openconnect
elif command -v pacman &> /dev/null; then
    sudo pacman -S --noconfirm python-flask python-requests python-urllib3 openconnect
else
    echo "⚠️  Package manager not recognized. Please install manually:"
    echo "   - python3-flask"
    echo "   - python3-requests"
    echo "   - openconnect"
fi

# Check OpenConnect
if command -v openconnect &> /dev/null; then
    echo "✅ OpenConnect installed: $(which openconnect)"
else
    echo "⚠️  OpenConnect not found. VPN tunneling will not work."
fi

# Setup passwordless sudo for gpclient and openconnect
echo ""
echo "🔐 Setting up passwordless sudo for GlobalProtect tools..."
SUDOERS_FILE="/etc/sudoers.d/globalprotect-openconnect"

if [ ! -f "$SUDOERS_FILE" ]; then
    echo "   Creating sudoers rule: $SUDOERS_FILE"
    echo "%sudo ALL=(ALL) NOPASSWD: /usr/sbin/openconnect, /usr/bin/gpclient, /usr/bin/gpauth" | sudo tee "$SUDOERS_FILE" > /dev/null
    sudo chmod 0440 "$SUDOERS_FILE"
    echo "✅ Sudoers rule created successfully."
else
    # Update existing rule to include gpclient and gpauth
    echo "   Updating existing sudoers rule..."
    echo "%sudo ALL=(ALL) NOPASSWD: /usr/sbin/openconnect, /usr/bin/gpclient, /usr/bin/gpauth" | sudo tee "$SUDOERS_FILE" > /dev/null
    echo "✅ Sudoers rule updated."
fi

echo ""
echo "=============================================="
echo "✅ Setup Complete!"
echo "=============================================="
echo ""
echo "To start GP Connect:"
echo "  ./run.sh"
echo ""
echo "Or manually:"
echo "  python3 app.py"
echo ""
