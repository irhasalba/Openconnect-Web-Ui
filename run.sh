#!/bin/bash
# GP Connect - Launch Script

cd "$(dirname "$0")"

# Check if Flask is available
if ! python3 -c "import flask" 2>/dev/null; then
    echo "❌ Flask not found!"
    echo ""
    echo "Please run setup first:"
    echo "  ./setup.sh"
    echo ""
    echo "Or install Flask manually:"
    echo "  sudo apt install python3-flask"
    exit 1
fi

# Check if openconnect is available
if ! command -v openconnect &> /dev/null; then
    echo "⚠️  WARNING: OpenConnect not found!"
    echo "   VPN connections will not work until installed."
    echo "   Install with: sudo apt install openconnect"
    echo ""
fi

echo "=============================================="
echo "   GP Connect - GlobalProtect MVP"
echo "=============================================="
echo ""
echo "🌐 Open your browser and go to:"
echo "   http://localhost:5000"
echo ""
echo "Press Ctrl+C to stop the server."
echo "=============================================="
echo ""

exec python3 app.py