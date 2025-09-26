#!/bin/bash

# AIDIS Staging Frontend Server Startup Script
# Serves frontend on port 3001

cd "$(dirname "$0")"

echo "🎨 Starting AIDIS Staging Frontend Server..."

# Check if already running
FRONTEND_PID_FILE="run/staging-frontend.pid"
if [ -f "$FRONTEND_PID_FILE" ]; then
    PID=$(cat "$FRONTEND_PID_FILE")
    if ps -p $PID > /dev/null 2>&1; then
        echo "⚠️  Staging Frontend already running (PID: $PID)"
        echo "💡 Use ./stop-staging.sh first"
        exit 1
    else
        echo "🧹 Cleaning stale frontend PID file"
        rm "$FRONTEND_PID_FILE"
    fi
fi

# Load staging environment
export NODE_ENV=staging
export $(cat .env.staging | grep -v '^#' | xargs)

# Create staging frontend configuration
cat > staging-frontend-config.js << 'EOF'
// Staging Frontend Configuration
const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.FRONTEND_PORT || 3001;

// Enable CORS for staging
app.use(cors({
    origin: '*',
    credentials: true
}));

// Serve static files from client directory
app.use(express.static(path.join(__dirname, '../client')));

// API proxy to staging backend
app.use('/api', (req, res) => {
    const backendUrl = `http://localhost:6000${req.url}`;
    console.log(`Proxying ${req.method} ${req.url} to ${backendUrl}`);
    
    // Simple proxy implementation
    const http = require('http');
    const options = {
        hostname: 'localhost',
        port: 6000,
        path: req.url,
        method: req.method,
        headers: req.headers
    };
    
    const proxyReq = http.request(options, (proxyRes) => {
        res.statusCode = proxyRes.statusCode;
        res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'application/json');
        proxyRes.pipe(res);
    });
    
    proxyReq.on('error', (err) => {
        console.error('Proxy error:', err);
        res.status(500).json({ error: 'Backend unavailable' });
    });
    
    if (req.method !== 'GET') {
        req.pipe(proxyReq);
    } else {
        proxyReq.end();
    }
});

// Staging banner
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>AIDIS Staging Environment</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; background: #f0f8ff; }
        .banner { background: #ff6b35; color: white; padding: 20px; margin-bottom: 20px; border-radius: 8px; }
        .status { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .link { display: block; margin: 10px 0; color: #0066cc; }
    </style>
</head>
<body>
    <div class="banner">
        <h1>🧪 AIDIS Staging Environment</h1>
        <p>This is the isolated staging environment for AIDIS testing.</p>
    </div>
    
    <div class="status">
        <h2>Staging Services</h2>
        <a href="/api/healthz" class="link">Backend Health Check</a>
        <a href="/dashboard.html" class="link">AIDIS Dashboard</a>
        <a href="/test.html" class="link">Test Interface</a>
        
        <h3>Service Ports</h3>
        <ul>
            <li>Frontend: 3001 (this server)</li>
            <li>Backend: 6000</li>
            <li>MCP: 9080</li>
        </ul>
        
        <h3>Database</h3>
        <p>Connected to: <strong>aidis_staging</strong></p>
    </div>
</body>
</html>
    `);
});

app.listen(PORT, () => {
    console.log(\`🎨 Staging Frontend running on port \${PORT}\`);
    console.log(\`🔗 Access: http://localhost:\${PORT}\`);
});
EOF

# Start staging frontend
node staging-frontend-config.js > logs/frontend-staging.log 2>&1 &
FRONTEND_PID=$!

# Save PID for management
echo $FRONTEND_PID > "$FRONTEND_PID_FILE"

# Wait a moment and verify startup
sleep 3

if ps -p $FRONTEND_PID > /dev/null 2>&1; then
    echo "✅ Staging Frontend started successfully (PID: $FRONTEND_PID)"
    echo "🔗 Frontend: http://localhost:3001"
    echo "📋 Frontend Logs: tail -f staging/logs/frontend-staging.log"
    
    # Test frontend
    echo "🔍 Testing frontend..."
    if curl -s http://localhost:3001 > /dev/null 2>&1; then
        echo "✅ Frontend accessible"
    else
        echo "❌ Frontend not accessible"
    fi
else
    echo "❌ Failed to start Staging Frontend"
    echo "📋 Check logs: tail staging/logs/frontend-staging.log"
    rm -f "$FRONTEND_PID_FILE"
    exit 1
fi
