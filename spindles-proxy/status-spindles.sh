#!/bin/bash
# Check status of Spindles Proxy server

if lsof -ti:8082 > /dev/null 2>&1; then
    echo "✅ Spindles Proxy is running on port 8082"
    echo ""
    curl -s http://localhost:8082/health | jq .
    echo ""
    echo "📝 Recent spindles:"
    if [ -f logs/spindles.jsonl ]; then
        tail -n 5 logs/spindles.jsonl | jq -r '.spindle.timestamp + " - " + (.spindle.content | .[0:80]) + "..."'
    else
        echo "   (no spindles logged yet)"
    fi
else
    echo "❌ Spindles Proxy is not running"
fi
