#!/bin/bash

# AIDIS Port Discovery Utility
# Shows current port assignments for all AIDIS services

cd "$(dirname "$0")/.." || exit 1

REGISTRY_FILE="run/port-registry.json"

echo "🔍 AIDIS Service Port Discovery"
echo "================================"

if [ ! -f "$REGISTRY_FILE" ]; then
    echo "❌ Port registry not found: $REGISTRY_FILE"
    echo "💡 Start AIDIS services to create the registry"
    exit 1
fi

echo "📄 Reading registry: $REGISTRY_FILE"
echo ""

# Check if jq is available for better JSON parsing
if command -v jq &> /dev/null; then
    echo "📊 Active Services:"
    echo ""

    jq -r 'to_entries[] | "\(.key):"' "$REGISTRY_FILE" | while read service; do
        service_name=$(echo "$service" | sed 's/:$//')
        port=$(jq -r --arg service "$service_name" '.[$service].port' "$REGISTRY_FILE")
        pid=$(jq -r --arg service "$service_name" '.[$service].pid' "$REGISTRY_FILE")
        started_at=$(jq -r --arg service "$service_name" '.[$service].startedAt' "$REGISTRY_FILE")
        health_endpoint=$(jq -r --arg service "$service_name" '.[$service].healthEndpoint // "N/A"' "$REGISTRY_FILE")

        echo "🔸 $service_name"
        echo "   📡 Port: $port"
        echo "   🆔 PID: $pid"
        echo "   🏥 Health: $health_endpoint"
        echo "   ⏰ Started: $started_at"

        # Test if service is responding
        if curl -s "http://localhost:$port$health_endpoint" >/dev/null 2>&1; then
            echo "   ✅ Status: Healthy"
        else
            echo "   ❌ Status: Not responding"
        fi
        echo ""
    done
else
    echo "⚠️  jq not available, using basic parsing"
    echo ""

    # Basic parsing without jq
    grep -o '"[^"]*":{[^}]*}' "$REGISTRY_FILE" | while IFS= read -r service_block; do
        service_name=$(echo "$service_block" | grep -o '^"[^"]*"' | sed 's/"//g')
        port=$(echo "$service_block" | grep -o '"port":[0-9]*' | cut -d':' -f2)
        pid=$(echo "$service_block" | grep -o '"pid":[0-9]*' | cut -d':' -f2)

        echo "🔸 $service_name"
        echo "   📡 Port: $port"
        echo "   🆔 PID: $pid"

        # Test if service is responding
        if curl -s "http://localhost:$port" >/dev/null 2>&1; then
            echo "   ✅ Status: Responding"
        else
            echo "   ❌ Status: Not responding"
        fi
        echo ""
    done
fi

echo "🔧 Environment Variables:"
echo "=========================="
echo "AIDIS_MCP_PORT=${AIDIS_MCP_PORT:-unset}"
echo "AIDIS_MCP_BRIDGE_PORT=${AIDIS_MCP_BRIDGE_PORT:-unset}"
echo "AIDIS_COMMAND_DEV_PORT=${AIDIS_COMMAND_DEV_PORT:-unset}"
echo "AIDIS_COMMAND_PROD_PORT=${AIDIS_COMMAND_PROD_PORT:-unset}"
echo "PORT=${PORT:-unset}"
echo ""

echo "💡 Usage Tips:"
echo "=============="
echo "• Set environment variables to 0 for dynamic assignment"
echo "• Set to specific numbers for fixed ports"
echo "• Use './scripts/port-discovery.sh' to check current assignments"
echo "• Check 'run/port-registry.json' for detailed service info"
echo ""

echo "🔗 Quick Health Checks:"
echo "======================="
if [ -f "$REGISTRY_FILE" ]; then
    if command -v jq &> /dev/null; then
        jq -r 'to_entries[] | "curl http://localhost:\(.value.port)\(.value.healthEndpoint // "")"' "$REGISTRY_FILE"
    else
        echo "Install jq for detailed health check commands"
    fi
fi