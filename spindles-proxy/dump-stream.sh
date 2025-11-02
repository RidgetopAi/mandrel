#!/bin/bash
# Capture raw stream to see the actual format

# ============================================================
# ADD YOUR ANTHROPIC API KEY HERE:
# Get it from: https://console.anthropic.com/settings/keys
# ============================================================
API_KEY="${ANTHROPIC_API_KEY:-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}"

# Check if API key is set
if [ "$API_KEY" = "YOUR_API_KEY_HERE" ]; then
  echo "❌ ERROR: Please add your Anthropic API key to this script"
  echo "   Edit line 8 and replace YOUR_API_KEY_HERE with your actual key"
  echo "   Or set ANTHROPIC_API_KEY environment variable"
  exit 1
fi

echo "📡 Dumping API stream format..."

curl -X POST http://localhost:8082/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-sonnet-4-5-20250929",
    "max_tokens": 4096,
    "stream": true,
    "thinking": {
      "type": "enabled",
      "budget_tokens": 2000
    },
    "messages": [
      {
        "role": "user",
        "content": "Think carefully about why the sky is blue, then explain it simply."
      }
    ]
  }' 2>&1 | tee logs/raw-stream-dump.txt

echo ""
echo "✅ Stream dumped to logs/raw-stream-dump.txt"
echo ""
echo "Checking for 'thinking' in response:"
grep -i "thinking" logs/raw-stream-dump.txt && echo "✅ Found 'thinking'!" || echo "❌ No 'thinking' found"
