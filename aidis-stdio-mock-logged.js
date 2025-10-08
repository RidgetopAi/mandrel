#!/usr/bin/env node

/**
 * Wrapper for aidis-stdio-mock.js that logs all stderr to a file
 * This allows us to see stdio-mock diagnostic output when AmpCode starts it
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logFile = path.join(logsDir, 'stdio-mock.log');
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

// Log startup
const timestamp = new Date().toISOString();
logStream.write(`\n${'='.repeat(80)}\n`);
logStream.write(`STDIO-MOCK WRAPPER STARTED: ${timestamp}\n`);
logStream.write(`${'='.repeat(80)}\n\n`);

// Start the actual stdio-mock process
const child = spawn('node', [path.join(__dirname, 'aidis-stdio-mock.js')], {
  stdio: ['inherit', 'inherit', 'pipe'] // stdin/stdout passthrough, stderr captured
});

// Pipe stderr to both the log file AND passthrough to parent
child.stderr.on('data', (data) => {
  logStream.write(data);
  // Also write to process.stderr so AmpCode can still see it
  process.stderr.write(data);
});

child.on('exit', (code) => {
  const exitTimestamp = new Date().toISOString();
  logStream.write(`\n${'='.repeat(80)}\n`);
  logStream.write(`STDIO-MOCK EXITED: ${exitTimestamp} (code: ${code})\n`);
  logStream.write(`${'='.repeat(80)}\n\n`);
  logStream.end();
  process.exit(code);
});

child.on('error', (error) => {
  logStream.write(`\nFATAL ERROR: ${error.message}\n`);
  logStream.end();
  process.exit(1);
});
