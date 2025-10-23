# 📚 Learning Guide: Understanding Price Parser TUI

## 🎯 Purpose of This Guide

This document explains **WHY** things are built the way they are, so you can confidently modify and extend the codebase.

---

## 🏛️ The Big Picture

### What Problem Are We Solving?

**Problem**: CSV price lists have inconsistent formats. You need to:
1. Visually identify which column is what (Product Name, Price, etc.)
2. Mark these columns with colors for reference
3. Export this mapping so AI can write parser code

**Solution**: A TUI that lets you:
- Load CSV
- Click cells to see positions
- Color-code columns/rows
- Export structured data for AI

---

## 🧩 Why Textual?

### The Alternatives:
1. **Web App** (React/Flask): Overkill, need server, browser
2. **GUI** (Tkinter/Qt): Platform-specific, heavy dependencies
3. **CLI Script**: No visual feedback, hard to interact
4. **Raw Terminal**: Too much low-level work

### Why Textual Wins:
```python
# With Textual, this just works:
class MyApp(App):
    def compose(self):
        yield Header()
        yield DataTable()
        yield Footer()

# You get:
# ✅ Mouse support (clicks, double-clicks)
# ✅ Keyboard shortcuts
# ✅ Responsive layouts
# ✅ Rich styling (colors, bold, etc.)
# ✅ Cross-platform (Linux, Mac, Windows)
```

**Key Insight**: Textual handles the hard stuff (event loops, rendering, input) so you focus on features.

---

## 📦 Why These Dependencies?

### Pandas
```python
df = pd.read_csv("prices.csv")
# Handles:
# ✅ Different encodings
# ✅ Data type inference
# ✅ Missing values
# ✅ Large files efficiently
```
**Alternative**: Built-in `csv` module → More code, less robust

### Pydantic
```python
class CellState(BaseModel):
    position: CellPosition
    content: str
    color: Optional[str]
    
# Gives you:
# ✅ Type validation at runtime
# ✅ Auto JSON serialization
# ✅ Great error messages
# ✅ Self-documenting code
```
**Alternative**: Plain dicts → Runtime bugs, no validation

### Rich (via Textual)
```python
Text("Hello", style="bold red")
# Gives you:
# ✅ Colors that work everywhere
# ✅ Tables, trees, progress bars
# ✅ Emoji support
```
**Alternative**: ANSI codes → Platform issues, manual work

---

## 🔍 Code Deep Dive

### 1. Why Cell State Tracking?

**Question**: Why not just store colors in the DataFrame?

**Answer**: Separation of concerns!

```python
# BAD: Mixing display with data
df['color'] = '#FF0000'  # Now CSV has color column!

# GOOD: Separate tracking
cell_states = {
    (row, col): CellState(position, content, color)
}
# ✅ Original CSV unchanged
# ✅ Can track more metadata later
# ✅ Easy to export/import
```

### 2. Why (row, col) Tuples as Keys?

```python
cell_states: Dict[Tuple[int, int], CellState]
```

**Why not**:
- `List[List[CellState]]` → Sparse matrix, wastes memory
- `df.loc[row, col]` → Ties us to Pandas
- String keys `"row_col"` → Have to parse strings

**Why tuples**:
- ✅ Immutable (safe as dict keys)
- ✅ Natural indexing
- ✅ O(1) lookup
- ✅ Memory efficient (only store colored cells)

### 3. Why Custom Messages?

```python
class CellDoubleClicked(DataTable.MessageClass):
    def __init__(self, cell_state: CellState):
        super().__init__()
        self.cell_state = cell_state
```

**This is the Textual way of inter-component communication!**

```python
# Child widget says: "Hey, something happened"
self.post_message(self.CellDoubleClicked(cell_state))

# Parent widget listens:
def on_price_table_cell_double_clicked(self, message):
    # React to it
```

**Why not**:
- Direct function calls → Tight coupling
- Global variables → Chaos
- Callbacks → Callback hell

**Why messages**:
- ✅ Loose coupling
- ✅ Multiple listeners possible
- ✅ Type-safe with message classes
- ✅ Easy to debug (message flow)

### 4. Why TOML for Config?

**Comparison**:

```toml
# TOML - Human friendly
[paths]
data_dir = "data"

[ui]
theme = "monokai"
```

```json
// JSON - Good for APIs, not humans
{
  "paths": {
    "data_dir": "data"
  },
  "ui": {
    "theme": "monokai"
  }
}
```

```yaml
# YAML - Indentation hell
paths:
  data_dir: data
ui:
  theme: monokai
```

**TOML wins**:
- ✅ Comments supported
- ✅ No indent issues
- ✅ Clear sections
- ✅ Python-friendly (tomli lib)

---

## 🎨 Design Patterns Explained

### 1. Widget Composition

```python
def compose(self):
    with Container():
        with Horizontal():
            yield FileTree()
            yield Table()
```

**This is React-style composition!**

- Each widget is self-contained
- Compose complex UIs from simple parts
- Easy to add/remove/rearrange

### 2. State + Events

```python
# State lives in widgets
class PriceTable:
    cell_states = {}  # State
    
    def on_click(self):
        # Update state
        self.cell_states[...] = ...
        
        # Emit event
        self.post_message(...)
```

**Unidirectional data flow**:
```
User Action → State Update → UI Update → Event Emission
```

### 3. Model-View Separation

```
Models (cell_state.py)     Widgets (price_table.py)
    CellState       ←uses→      PriceTable
    CellPosition    ←uses→      StatusBar
    SelectionRange  ←uses→      (future) ColorPicker
```

**Why**:
- Models: Pure data, no UI logic
- Widgets: Pure UI, no business logic
- Easy to test models independently
- Easy to change UI without breaking logic

---

## 🚀 How to Extend

### Adding a New Feature: "Cell History"

**Goal**: Track when each cell was last colored.

**Step 1: Update Model**
```python
# cell_state.py
class CellState(BaseModel):
    position: CellPosition
    content: str
    color: Optional[str]
    colored_at: Optional[datetime] = None  # NEW
```

**Step 2: Update Widget**
```python
# price_table.py
def set_cell_color(self, row, col, color):
    from datetime import datetime
    self.cell_states[(row, col)].color = color
    self.cell_states[(row, col)].colored_at = datetime.now()  # NEW
```

**Step 3: Update Export**
```python
# price_table.py
def export_to_json(self):
    # ... existing code ...
    cell_dict['colored_at'] = state.colored_at.isoformat()  # NEW
```

**Step 4: Update UI** (optional)
```python
# Show timestamp in status bar
self.status_bar.update(
    f"Cell {pos} | Colored: {state.colored_at}"
)
```

**That's it!** The pattern repeats for any feature.

---

## 🐛 Debugging Guide

### "Cell click not working"

**Check**:
1. Is the event handler registered?
   ```python
   def on_click(self, event):  # Must be named exactly this
   ```

2. Is the coordinate valid?
   ```python
   # Add logging
   print(f"Clicked: {event.coordinate}")
   ```

3. Is the table focused?
   ```python
   # Click table first to focus it
   ```

### "Colors not showing"

**Current Status**: `_refresh_cell_display()` is a stub!

**To fix** (Phase 2):
```python
def _refresh_cell_display(self, row, col):
    cell_state = self.cell_states[(row, col)]
    
    # Get the cell key
    cell_key = self._get_cell_key(row, col)
    
    # Update with Rich styling
    self.update_cell(
        cell_key,
        Text(cell_state.content, style=cell_state.get_rich_style())
    )
```

### "Export creates empty JSON"

**Reason**: We only export cells with colors!

```python
# In export_to_json()
if state.color:  # Only colored cells exported
    export_data["cells"].append(...)
```

**Fix**: Color some cells first, then export.

---

## 💡 Key Concepts to Master

### 1. Async/Await in Textual

Textual runs an async event loop:

```python
# This blocks the UI - BAD
def load_big_file(self):
    df = pd.read_csv("huge.csv")  # Freezes UI

# This doesn't block - GOOD
async def load_big_file(self):
    df = await self.run_in_thread(pd.read_csv, "huge.csv")
```

**Rule**: Anything slow → make it async or run in thread

### 2. CSS-in-Python

```python
CSS = """
#my-widget {
    background: red;
}
"""
```

**Not actual CSS!** It's Textual's CSS-like syntax:
- `#id` → ID selector
- `.class` → Class selector
- `Widget` → Type selector

**Learn by doing**: Change colors, see what breaks!

### 3. Coordinate Systems

Textual uses multiple coordinate systems:

```python
# Screen coordinates (pixels)
screen_coord = (x, y)

# Widget coordinates (relative to widget)
widget_coord = (x, y)

# Table coordinates (row, col)
table_coord = (row, col)
```

**Always convert** between them carefully!

---

## 🎓 Learning Path

### Week 1: Understand Current Code
- [ ] Read every file top to bottom
- [ ] Run the app, click everything
- [ ] Modify colors in CSS, see changes
- [ ] Add print statements, watch output

### Week 2: Make Small Changes
- [ ] Add a new config option
- [ ] Add a new keyboard shortcut
- [ ] Change the export format
- [ ] Add a new column to the table

### Week 3: Build Phase 2 Feature
- [ ] Start with color picker modal
- [ ] Follow the patterns you see
- [ ] Test incrementally
- [ ] Read Textual docs when stuck

---

## 📖 Recommended Reading

1. **Textual Docs**: https://textual.textualize.io/
   - Start with "Guide" section
   - Reference "Widget" docs as needed

2. **Rich Docs**: https://rich.readthedocs.io/
   - Focus on Text, Style, and Tables

3. **Pydantic Docs**: https://docs.pydantic.dev/
   - Read "Models" section

4. **Our Code**:
   - Read in order: models → widgets → main
   - Understand one file at a time

---

## 🤔 Common Questions

**Q: Why not use a database instead of JSON?**
A: For this use case, JSON is simpler and more portable. No server needed!

**Q: Can I use SQLite instead of Pandas?**
A: You could, but Pandas is better for CSV manipulation and you'd still need it for export.

**Q: Why Textual instead of Tkinter?**
A: Terminal-based is faster to develop, no GUI dependencies, works over SSH, looks cooler!

**Q: How do I add a new widget?**
A: Copy an existing widget file, modify it, add to `compose()` in main.py.

**Q: Where do I put business logic?**
A: Models for data logic, widgets for UI logic, main.py for orchestration.

---

## 🎯 Your Next Steps

1. **Run the code**: `./run.sh`
2. **Break something**: Change code, see what happens
3. **Fix it**: Read error, understand, fix
4. **Add feature**: Start with color picker (Phase 2)
5. **Ask questions**: I'm here to help!

---

**Remember**: The best way to learn is by doing. Start small, build confidence, then tackle bigger features!
