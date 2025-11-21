# Markdown Preview Test

This is a test file to verify markdown-preview.nvim is working with Mermaid support.

## Regular Markdown Features

- **Bold text**
- *Italic text*
- `code inline`

```javascript
// Code block
function test() {
  console.log("Hello, world!");
}
```

## Mermaid Diagram Test

```mermaid
graph TD
    A[LazyVim] -->|Opens| B[Markdown File]
    B --> C{Preview Working?}
    C -->|Yes| D[See Rendered Mermaid]
    C -->|No| E[Check Configuration]
    E --> F[Run :Lazy sync]
    F --> B
    D --> G[Success!]

    style A fill:#2ea043
    style D fill:#2ea043
    style G fill:#2ea043
    style E fill:#d29922
```

## Another Mermaid Example - Sequence Diagram

```mermaid
sequenceDiagram
    participant User
    participant Neovim
    participant Browser

    User->>Neovim: Open markdown file
    User->>Neovim: Press <leader>mp
    Neovim->>Browser: Launch preview
    Browser->>User: Display rendered markdown
    Note over Browser: Mermaid charts render!
```

## Instructions

1. Open this file in Neovim: `nvim test-mermaid.md`
2. Press `<leader>mp` (usually Space + m + p) to toggle preview
3. Your browser should open with the rendered markdown
4. Mermaid diagrams should be visible!

If it doesn't work immediately:
- Run `:Lazy sync` in Neovim to install/update the plugin
- Restart Neovim
- Try again
