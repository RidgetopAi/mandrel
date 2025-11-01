# Mandrel Command Backend - Comprehensive Logging Guide

## Overview

This guide documents the comprehensive request/response logging system implemented for the Mandrel Command Backend, providing complete refactoring visibility and operational insights.

## Features Implemented

### ✅ 1. Express Middleware - Request/Response Logging
- **Correlation ID tracking** across all requests
- **Request metadata capture**: method, URL, headers, body (sanitized)
- **Response timing and status code tracking**
- **Automatic sensitive data sanitization**

### ✅ 2. Error Handling - Structured Error Logging
- **Contextual error information** with correlation IDs
- **Stack trace capture** in development
- **Security-aware error responses** (no sensitive data exposure)
- **Different log levels** based on error severity

### ✅ 3. Database Query Logging
- **Query performance monitoring** with execution timing
- **Slow query detection** (> 1s warnings, > 5s alerts)
- **Connection pool monitoring** and health tracking
- **Query sanitization** to remove sensitive parameters

### ✅ 4. Correlation IDs
- **Header-based correlation ID** propagation (`x-correlation-id`, `x-request-id`)
- **Automatic UUID generation** for requests without IDs
- **Response header injection** for client tracking
- **End-to-end request tracing**

### ✅ 5. Security Logging
- **Authentication failure tracking** (401 errors)
- **Authorization denial logging** (403 errors)
- **Rate limit breach detection** (429 errors)
- **Slow response alerts** (potential DoS detection)

## Log File Structure

All logs are stored in `/home/ridgetop/aidis/aidis-command/logs/` with daily rotation:

```
logs/
├── combined-YYYY-MM-DD.log    # All application logs (JSON format)
├── error-YYYY-MM-DD.log       # Error logs only
├── requests-YYYY-MM-DD.log    # HTTP request/response logs
├── database-YYYY-MM-DD.log    # Database operation logs
├── security-YYYY-MM-DD.log    # Security event logs
└── debug-YYYY-MM-DD.log       # Debug level logs
```

## Configuration

### Environment Variables

Add to your `.env` file:

```bash
# Log Levels: error, warn, info, debug
LOG_LEVEL=info
DB_LOG_LEVEL=warn

# File Rotation Settings
ENABLE_LOG_ROTATION=true
LOG_MAX_FILE_SIZE=20m
LOG_MAX_FILES=30d

# Development vs Production
NODE_ENV=development  # Enables console logging
```

### Log Levels

- **ERROR**: System errors, failed operations, critical issues
- **WARN**: Warnings, slow queries, security alerts
- **INFO**: General application flow, request completion
- **DEBUG**: Detailed debugging information, query details

## JSON Log Format

All logs use structured JSON format for easy parsing:

```json
{
  "timestamp": "2025-09-12 15:55:54.293",
  "level": "INFO",
  "message": "Request completed",
  "service": "aidis-command-backend",
  "correlationId": "test-001",
  "method": "GET",
  "url": "/api/health",
  "statusCode": 200,
  "responseTime": 45,
  "ip": "127.0.0.1",
  "userAgent": "Mozilla/5.0..."
}
```

## Usage Examples

### 1. Application Logging

```typescript
import { logger } from '../config/logger';

// Info logging
logger.info('User action completed', {
  userId: 'user-123',
  action: 'profile_update',
  correlationId: req.correlationId
});

// Error logging
logger.error('Database operation failed', {
  error: error.message,
  stack: error.stack,
  correlationId: req.correlationId,
  operation: 'user_create'
});
```

### 2. Security Event Logging

```typescript
import { securityLogger } from '../config/logger';

securityLogger.warn('Failed login attempt', {
  email: 'user@example.com',
  ip: req.ip,
  userAgent: req.get('User-Agent'),
  correlationId: req.correlationId,
  event: 'login_failure'
});
```

### 3. Database Query Logging

```typescript
import { dbWithLogging } from '../database/connection';

// Automatic logging for all queries
const result = await dbWithLogging.query(
  'SELECT * FROM users WHERE email = $1',
  [email],
  req.correlationId  // Optional correlation ID
);
```

## Security Features

### Data Sanitization

Sensitive fields are automatically redacted in logs:

- `password` → `[REDACTED]`
- `token` → `[REDACTED]`
- `secret` → `[REDACTED]`
- `authorization` → `[REDACTED]`
- `api_key` → `[REDACTED]`

### Security Event Types

- **auth_failure**: Authentication failures (401)
- **authz_failure**: Authorization failures (403) 
- **rate_limit**: Rate limit exceeded (429)
- **slow_response**: Potential DoS detection (>5s responses)
- **suspicious_activity**: Custom security events

## Performance Monitoring

### Database Performance

- **Query timing**: All queries logged with execution time
- **Slow query alerts**: Queries >1s logged as warnings
- **Connection pool monitoring**: Pool stats logged every minute
- **Connection health**: Connect/disconnect events tracked

### HTTP Performance

- **Response timing**: All requests timed in milliseconds
- **Slow response detection**: >5s responses flagged
- **Error rate monitoring**: 4xx/5xx response tracking
- **Endpoint performance**: Per-endpoint timing analysis

## Log Rotation and Cleanup

### Automatic Rotation

- **Daily rotation**: New files created each day
- **Size limits**: Files rotate at 20MB (configurable)
- **Compression**: Rotated files automatically gzipped
- **Retention**: 30 days retention (configurable)

### Manual Cleanup

```bash
# Remove logs older than 7 days
find /home/ridgetop/aidis/aidis-command/logs -name "*.log" -mtime +7 -delete

# Compress current logs
gzip /home/ridgetop/aidis/aidis-command/logs/*.log
```

## Testing and Verification

### Basic Functionality Test

```bash
cd /home/ridgetop/aidis/aidis-command/backend
npx tsx src/test-basic-logging.ts
```

### Server Integration Test

1. Start the server: `npm run dev`
2. Run tests: `npx tsx src/test-server-logging.ts`
3. Check log files in `/logs/` directory

### Manual Testing with cURL

```bash
# Test with correlation ID
curl -X GET "http://localhost:5001/api/health" \
  -H "x-correlation-id: manual-test-001" \
  -H "User-Agent: Manual-Test/1.0"

# Test error handling
curl -X GET "http://localhost:5001/api/nonexistent" \
  -H "x-correlation-id: manual-test-404"

# Test POST with sensitive data
curl -X POST "http://localhost:5001/api/auth/login" \
  -H "Content-Type: application/json" \
  -H "x-correlation-id: manual-test-auth" \
  -d '{"email":"test@example.com","password":"secret123"}'
```

## Log Analysis Examples

### Find all requests by correlation ID

```bash
grep "manual-test-001" logs/combined-2025-09-12.log
```

### Find slow database queries

```bash
grep "slow_query" logs/database-2025-09-12.log
```

### Security events in last 24 hours

```bash
tail -100 logs/security-2025-09-12.log | jq '.event'
```

### Error rate analysis

```bash
grep "ERROR" logs/combined-2025-09-12.log | wc -l
```

## Troubleshooting

### Common Issues

1. **Logs not appearing**: Check `LOG_LEVEL` environment variable
2. **Permission errors**: Ensure `/logs/` directory is writable
3. **Missing correlation IDs**: Verify middleware order in server setup
4. **Large log files**: Adjust `LOG_MAX_FILE_SIZE` setting

### Debug Mode

Enable debug logging:

```bash
export LOG_LEVEL=debug
export DB_LOG_LEVEL=debug
```

### Monitoring Disk Usage

```bash
# Check log directory size
du -sh /home/ridgetop/aidis/aidis-command/logs/

# Monitor real-time logging
tail -f logs/combined-$(date +%Y-%m-%d).log
```

## Integration with Monitoring Tools

### Log Aggregation

The JSON format works well with:
- **ELK Stack** (Elasticsearch, Logstash, Kibana)
- **Fluentd/Fluent Bit**
- **Grafana Loki**
- **Datadog**
- **New Relic**

### Example Logstash Configuration

```ruby
input {
  file {
    path => "/home/ridgetop/aidis/aidis-command/logs/combined-*.log"
    codec => json
    type => "aidis-backend"
  }
}

filter {
  if [correlationId] {
    mutate {
      add_tag => ["correlated"]
    }
  }
}

output {
  elasticsearch {
    hosts => ["localhost:9200"]
    index => "aidis-logs-%{+YYYY.MM.dd}"
  }
}
```

## Best Practices

### Development

1. Use correlation IDs in all API calls
2. Include relevant context in log messages
3. Avoid logging sensitive data directly
4. Use appropriate log levels
5. Test logging functionality with each change

### Production

1. Set `NODE_ENV=production` to disable console logs
2. Monitor log file sizes regularly
3. Set up log rotation and cleanup
4. Configure external log aggregation
5. Set up alerting for error patterns

### Security

1. Never log passwords, tokens, or secrets
2. Sanitize user input in logs
3. Use correlation IDs to track security events
4. Monitor authentication failure patterns
5. Set up alerts for suspicious activity

## Future Enhancements

Potential improvements for the logging system:

1. **Metrics Integration**: Add Prometheus metrics
2. **Real-time Alerts**: Webhook notifications for critical errors
3. **Log Analytics**: Built-in log analysis dashboard
4. **Performance Profiling**: Request profiling and tracing
5. **Custom Log Formats**: Support for multiple output formats

---

**Implementation Date**: September 12, 2025  
**Version**: 1.0.0  
**Status**: ✅ Complete and Operational
