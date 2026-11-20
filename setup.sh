#!/bin/bash
# GP Connect - Setup Script (Bun version)

set -e

echo "=============================================="
echo "   GP Connect - Setup Script (Bun)"
echo "=============================================="
echo ""

# Check Bun
if ! command -v bun &> /dev/null && [ ! -f "$HOME/.bun/bin/bun" ]; then
    echo "📦 Installing Bun..."
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
    echo "✅ Bun installed: $(bun --version)"
else
    if command -v bun &> /dev/null; then
        echo "✅ Bun found: $(bun --version)"
    else
        echo "✅ Bun found: $($HOME/.bun/bin/bun --version)"
    fi
fi

# Install system packages
echo ""
echo "📦 Installing system dependencies..."
echo "   This requires sudo privileges."

if command -v apt &> /dev/null; then
    sudo apt update
    sudo apt install -y openconnect
elif command -v dnf &> /dev/null; then
    sudo dnf install -y openconnect
elif command -v pacman &> /dev/null; then
    sudo pacman -S --noconfirm openconnect
else
    echo "⚠️  Package manager not recognized. Please install manually:"
    echo "   - openconnect"
fi

# Install npm dependencies
echo ""
echo "📦 Installing Bun dependencies..."
if command -v bun &> /dev/null; then
    bun install
else
    "$HOME/.bun/bin/bun" install
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

echo "%sudo ALL=(ALL) NOPASSWD: /usr/sbin/openconnect, /usr/bin/gpclient, /usr/bin/gpauth" | sudo tee "$SUDOERS_FILE" > /dev/null
sudo chmod 0440 "$SUDOERS_FILE"
echo "✅ Sudoers rule configured."

echo ""
echo "=============================================="
echo "✅ Setup Complete!"
echo "=============================================="
echo ""
echo "To start GP Connect:"
echo "  ./run.sh"
echo ""
echo "Or manually:"
echo "  bun run server.ts"
echo ""
