#!/bin/bash
# GP Connect - Launch Script (Bun version)

cd "$(dirname "$0")"

# Check if Bun is available
if ! command -v bun &> /dev/null; then
    if [ -f "$HOME/.bun/bin/bun" ]; then
        BUN="$HOME/.bun/bin/bun"
    else
        echo "❌ Bun not found!"
        echo ""
        echo "Install Bun first:"
        echo "  curl -fsSL https://bun.sh/install | bash"
        exit 1
    fi
else
    BUN="bun"
fi

# Check if openconnect is available
if ! command -v openconnect &> /dev/null; then
    echo "⚠️  WARNING: OpenConnect not found!"
    echo "   VPN connections will not work until installed."
    echo "   Install with: sudo apt install openconnect"
    echo ""
fi

echo "=============================================="
echo "   GP Connect - GlobalProtect VPN"
echo "   Powered by Bun 🚀"
echo "=============================================="
echo ""
echo "🌐 Open your browser and go to:"
echo "   http://localhost:5000"
echo ""
echo "Press Ctrl+C to stop the server."
echo "=============================================="
echo ""

exec $BUN run server.ts
