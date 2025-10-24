#!/bin/bash

# Price Parser TUI - Setup and Run Script

echo "🎯 Price Parser TUI Setup"
echo "========================="
echo ""

# Check if in correct directory
if [ ! -f "config.toml" ]; then
    echo "❌ Error: Please run this script from the price-parser-tui directory"
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
pip3 install -r requirements.txt --break-system-packages -q

if [ $? -eq 0 ]; then
    echo "✅ Dependencies installed"
else
    echo "❌ Failed to install dependencies"
    exit 1
fi

# Create directories
echo "📁 Creating directories..."
mkdir -p data output

# Check for Nerd Font
echo ""
echo "🔤 Checking for Nerd Font..."
if fc-list | grep -i "nerd" > /dev/null; then
    echo "✅ Nerd Font detected"
else
    echo "⚠️  No Nerd Font detected. Icons may not display correctly."
    echo "   Install JetBrains Mono Nerd Font for best experience."
    echo "   See README.md for instructions."
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "To run the app:"
echo "  python3 -m src.main"
echo ""
echo "Or run directly:"
echo "  ./run.sh"
