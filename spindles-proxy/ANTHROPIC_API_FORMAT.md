# Anthropic API Streaming Format

## Critical Discovery

**The thinking blocks are NOT sent as XML tags `<thinking>...</thinking>` in the API response!**

## Actual Format: Server-Sent Events (SSE) + JSON

### SSE Structure
```
event: message_start
data: {"type":"message_start","message":{...}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_stop
data: {"type":"message_stop"}
```

### Event Types
1. **message_start** - Stream begins, contains model info, message ID
2. **content_block_start** - New content block (text, thinking, tool_use, etc.)
3. **content_block_delta** - Incremental text deltas for the content block
4. **content_block_stop** - Content block finished
5. **message_delta** - Message metadata updates (stop_reason, etc.)
6. **message_stop** - Stream complete

### Content Block Types
Based on Anthropic API docs:
- `text` - Normal response text
- `thinking` - Extended thinking (if enabled with `thinking` parameter)
- `tool_use` - Tool/function calls

### Example: Captured from Proxy
```
event: message_start
data: {"type":"message_start","message":{"model":"claude-sonnet-4-5-20250929","id":"msg_01Ro9FCyFskcH5GP2sk3r1ab","type":"message","role":"assistant","content":[],"stop_reason":null,...}}
```

## What This Means for Spindles

### Current Implementation (WRONG)
`streamProcessor.ts` uses regex to find `<thinking>...</thinking>` XML tags:
```typescript
const thinkingRegex = /<thinking>([\s\S]*?)<\/thinking>/g;
```
**This will NEVER match because the API doesn't send XML!**

### Required Changes
1. **Parse SSE format** - Split by `event:` and `data:` lines
2. **Parse JSON** - Each `data:` line contains JSON
3. **Track content blocks** - Monitor `content_block_start` events
4. **Check block type** - Look for `content_block.type === "thinking"`
5. **Accumulate deltas** - Collect `content_block_delta` text for thinking blocks
6. **Extract on stop** - Capture complete thinking block on `content_block_stop`

### Questions to Answer
1. Does the API actually send thinking blocks in responses?
2. Is there a parameter we need to pass to enable thinking output?
3. What does Claude Code CLI do to show thinking blocks in the UI?
4. Are thinking blocks client-side only (not in API response)?

## Next Steps
1. ✅ Capture full stream dump to see all event types
2. ⏳ Check if `type: "thinking"` content blocks exist
3. ⏳ Review Anthropic API docs for thinking parameter
4. ⏳ Rewrite streamProcessor for SSE/JSON format
5. ⏳ Test with requests that should generate thinking

## Testing Evidence
- Date: 2025-11-01
- Proxy successfully intercepted 10-105 chunk streams
- No XML `<thinking>` tags found
- No "thinking" string in first 3 chunks
- Format confirmed as SSE with JSON payloads
