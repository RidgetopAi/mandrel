#!/bin/bash
# Test the spindles proxy with a simple API call

echo "🧪 Testing Spindles Proxy..."
echo ""

# Check if proxy is running
if ! lsof -ti:8082 > /dev/null 2>&1; then
    echo "❌ Proxy not running on port 8082"
    echo "Run: ./start-spindles.sh"
    exit 1
fi

echo "✅ Proxy is running on port 8082"
echo ""

# Check if ANTHROPIC_API_KEY is set
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "❌ ANTHROPIC_API_KEY not set"
    echo "Please set your API key first"
    exit 1
fi

echo "✅ ANTHROPIC_API_KEY is set"
echo ""

echo "📡 Sending test request through proxy..."
echo ""

# Send a test request
curl -X POST http://localhost:8082/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-sonnet-4-5-20250929",
    "max_tokens": 100,
    "messages": [
      {
        "role": "user",
        "content": "Say hello in exactly 3 words"
      }
    ]
  }' 2>&1

echo ""
echo ""
echo "📝 Check logs/spindles.jsonl for captured thinking blocks"
echo ""
