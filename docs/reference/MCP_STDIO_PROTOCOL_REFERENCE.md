# MCP STDIO Protocol Reference

## What We Know (from research)

### Message Framing
- Messages use HTTP-like framing with Content-Length headers
- Format: `Content-Length: <bytes>\r\n\r\n<json-body>`
- Each message must be exactly the specified byte length
- JSON body is UTF-8 encoded

### Required Methods
1. **initialize** - Handshake to establish connection
2. **tools/list** - Return available tools with schemas  
3. **tools/call** - Execute a tool with parameters

### Initialize Response Format
```json
{
  "jsonrpc": "2.0",
  "id": <request_id>,
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "tools": {},
      "resources": {}  
    },
    "serverInfo": {
      "name": "server-name",
      "version": "1.0.0"
    }
  }
}
```

### Tools List Response Format
```json
{
  "jsonrpc": "2.0", 
  "id": <request_id>,
  "result": {
    "tools": [
      {
        "name": "tool_name",
        "description": "Tool description", 
        "inputSchema": {
          "type": "object",
          "properties": { ... },
          "required": [ ... ]
        }
      }
    ]
  }
}
```

## What We DON'T Know
- Exact handshake sequence Amp expects
- Whether there are additional required methods
- Specific capability flags needed
- Error handling protocol details
- Whether there are authentication steps

## Amp Configuration (CONFIRMED)
- File: `~/.config/amp/settings.json`
- Format:
```json
{
  "amp.mcpServers": {
    "server-name": {
      "command": "/path/to/executable",
      "args": ["arg1", "arg2"],
      "env": {
        "ENV_VAR": "value"
      }
    }
  }
}
```

## Sources
- VS Code MCP documentation (partial compatibility)
- Amp manual (configuration only)
- Oracle analysis (framing requirements)

## Status: INCOMPLETE
We need to trace actual protocol messages to understand missing pieces.
