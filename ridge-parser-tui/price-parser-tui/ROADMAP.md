# 🗺️ Development Roadmap

## ✅ Phase 1: Foundation (COMPLETE)

**Goal**: Basic TUI with CSV loading and cell tracking

### Completed Features:
- ✅ Textual app structure
- ✅ CSS-based layout (sidebar + table + status)
- ✅ File browser with DirectoryTree
- ✅ CSV loading via Pandas
- ✅ DataTable display
- ✅ Cell state tracking (position + content)
- ✅ Double-click event handling
- ✅ Status bar with current selection
- ✅ JSON export (basic)
- ✅ Keyboard shortcuts
- ✅ Configuration system (TOML)
- ✅ Data models (CellState, Config)
- ✅ Sample CSV for testing

### Code Stats:
- **Files**: 12 Python files, 3 config/docs
- **Lines**: ~500 lines of code
- **Dependencies**: 5 packages

---

## 🚧 Phase 2: Color System (NEXT)

**Goal**: Visual cell/row/column marking with color coding

### Features to Add:

#### 1. Color Picker Modal (Priority 1)
```python
class ColorPickerModal(ModalScreen):
    """Modal dialog for selecting colors"""
    # Preset colors + custom hex input
    # Apply to single cell or selection
```

**Tasks**:
- [ ] Create ColorPickerModal widget
- [ ] Add preset color palette (8-10 colors)
- [ ] Add custom hex input field
- [ ] Connect to PriceTable.set_cell_color()
- [ ] Update keybinding: `c` → open color picker

**Acceptance Criteria**:
- Can select from preset colors
- Can enter custom hex code
- Color persists on cell
- Color visible in table display

#### 2. Multi-Cell Selection (Priority 2)
```python
# Shift+Click for range selection
# Ctrl+Click for multi-selection
```

**Tasks**:
- [ ] Detect Shift modifier in click handler
- [ ] Implement SelectionRange logic
- [ ] Visual feedback for selected range
- [ ] Apply colors to entire selection

**Acceptance Criteria**:
- Shift+Click selects range
- Can color entire range at once
- Clear visual indication of selection

#### 3. Row/Column Selection (Priority 3)
```python
# Click row header → select entire row
# Click column header → select entire column
```

**Tasks**:
- [ ] Add row/column header click detection
- [ ] Implement bulk selection
- [ ] Add visual indicator (highlight header)
- [ ] Bulk color application

**Acceptance Criteria**:
- Can select full row/column
- Can color full row/column
- Header shows when selected

#### 4. Enhanced Export (Priority 4)
```python
# Export includes:
# - All colored cells
# - Selection ranges
# - Color meanings (from legend)
```

**Tasks**:
- [ ] Update export_to_json() format
- [ ] Include selection metadata
- [ ] Add color legend to export
- [ ] Pretty-print JSON

---

## 🎯 Phase 3: Parser Card Panel

**Goal**: Add second panel for mapping cell positions to parser fields

### UI Layout:
```
┌─────────────┬─────────────────┬──────────────┐
│ File        │ Price Table     │ Parser Card  │
│ Browser     │                 │ ┌──────────┐ │
│             │                 │ │Field Name│ │
│             │                 │ │Position  │ │
│             │                 │ │Type      │ │
│             │                 │ │Color     │ │
│             │                 │ └──────────┘ │
└─────────────┴─────────────────┴──────────────┘
```

### Features:

#### 1. Parser Card Widget
```python
class ParserCard(Widget):
    """Card for defining parser field mappings"""
    fields: List[ParserField]
    
    class ParserField:
        name: str           # "Product Name"
        position: CellPosition
        data_type: str      # "string", "float", "date"
        color: str          # Links to table colors
```

**Tasks**:
- [ ] Create ParserCard widget
- [ ] Add field list display
- [ ] Add "New Field" button
- [ ] Create field editing UI
- [ ] Link to table double-click

#### 2. Position Capture Flow
```
1. User double-clicks table cell
2. If parser card has focus:
   → Position auto-fills in active field
3. Visual feedback (highlight)
4. Save to parser definition
```

**Tasks**:
- [ ] Implement focus detection
- [ ] Auto-populate position on double-click
- [ ] Visual feedback (flash/highlight)
- [ ] Validation (can't reuse positions)

#### 3. Parser Export Format
```json
{
  "parser_definition": {
    "source_file": "sample_prices.csv",
    "fields": [
      {
        "name": "product_name",
        "position": {"row": 0, "column": 1},
        "type": "string",
        "color": "#00FF00",
        "example_value": "Widget A"
      }
    ]
  }
}
```

**Tasks**:
- [ ] Design JSON schema
- [ ] Implement export logic
- [ ] Add validation
- [ ] Include example values

---

## 🔮 Phase 4: Advanced Features

### 1. @ File Selector (CLI-style)
```
Type: @prod/january_prices.csv
↓
Searches in data_dir/prod/
Auto-completes filename
Loads file
```

**Tasks**:
- [ ] Create command input widget
- [ ] Implement @ command parser
- [ ] Add autocomplete
- [ ] Fuzzy file search

### 2. Cell Content Preview Panel
```
┌─────────────────────┐
│ Cell Preview        │
│ ─────────────────── │
│ Position: (3, 5)    │
│ Content: "Widget A" │
│ Type: string        │
│ Length: 8 chars     │
└─────────────────────┘
```

**Tasks**:
- [ ] Create preview widget
- [ ] Auto-detect data types
- [ ] Show formatted preview
- [ ] Add copy button

### 3. Undo/Redo System
```python
class ActionHistory:
    """Track user actions for undo/redo"""
    # Stack-based undo/redo
    # Ctrl+Z, Ctrl+Y bindings
```

**Tasks**:
- [ ] Implement action stack
- [ ] Track colorization actions
- [ ] Track cell edits
- [ ] Add keybindings

### 4. JSON Schema Viewer Mode
```
For viewing parsed output:
- Tree view of JSON
- Syntax highlighting
- Collapsible sections
- Search functionality
```

**Tasks**:
- [ ] Create JSON viewer widget
- [ ] Add Tree display
- [ ] Syntax highlighting
- [ ] Search/filter

### 5. Themes and Customization
```toml
[ui.themes.monokai]
primary = "#F92672"
secondary = "#66D9EF"
background = "#272822"

[ui.themes.gruvbox]
primary = "#FB4934"
secondary = "#B8BB26"
background = "#282828"
```

**Tasks**:
- [ ] Define theme schema
- [ ] Add theme switcher
- [ ] Create 3-4 themes
- [ ] Runtime theme switching

---

## 📊 Technical Debt & Refactoring

### Current Issues to Address:

1. **Cell Coloring Implementation**
   - Current: Placeholder in `_refresh_cell_display()`
   - Need: Actual Rich styling application to DataTable

2. **Performance with Large CSVs**
   - Current: Load entire file to memory
   - Future: Virtual scrolling, pagination

3. **Error Handling**
   - Current: Basic try/catch
   - Need: Comprehensive error messages

4. **Testing**
   - Current: None
   - Need: Unit tests for models, integration tests

### Refactoring Opportunities:

1. **Separate Concerns**:
   ```python
   # Current: PriceTable does everything
   # Better:
   class TableDataManager:  # Data loading/export
   class TableUIRenderer:   # Display logic
   class TableInteraction:  # Event handling
   ```

2. **Event System**:
   ```python
   # Current: Direct coupling
   # Better: Event bus pattern
   class EventBus:
       emit(event_name, data)
       subscribe(event_name, handler)
   ```

3. **State Management**:
   ```python
   # Current: Scattered state
   # Better: Centralized store
   class AppState:
       current_file: Optional[Path]
       cell_states: Dict
       parser_definition: ParserDef
   ```

---

## 🎯 MVP Feature Set

**Minimum for "proud project"**:
- ✅ CSV loading
- ✅ Cell selection
- ⏳ Color coding (visual feedback)
- ⏳ Parser card panel
- ⏳ Position capture
- ⏳ JSON export with parser definition
- ⏳ Polished UI (themes, icons)

**Target Completion**: Phase 3

---

## 🚀 Future Enhancements (Post-MVP)

### Advanced Parsing Features:
- Regex pattern testing
- Data transformation preview
- Multi-file batch processing
- Template saving/loading

### AI Integration:
- Direct API calls to Claude
- In-app parser code generation
- Validation against schema
- Error correction suggestions

### Collaboration:
- Export/import parser definitions
- Share color schemes
- Parser template library

---

## 📈 Progress Tracking

| Phase | Features | Status | Target |
|-------|----------|--------|--------|
| Phase 1 | Foundation | ✅ 100% | Done |
| Phase 2 | Colors | ⏳ 0% | Next |
| Phase 3 | Parser Panel | ⏳ 0% | 2 weeks |
| Phase 4 | Advanced | ⏳ 0% | Future |

---

## 🎓 Learning Checkpoints

After each phase, you should understand:

**Phase 1** ✓:
- Textual app structure
- Widget composition
- Event handling
- Data models with Pydantic
- File I/O basics

**Phase 2** (Next):
- Modal dialogs
- Complex user interactions
- State management
- Color systems

**Phase 3**:
- Multi-panel layouts
- Inter-widget communication
- Advanced data structures
- Export formats

---

**Ready to start Phase 2?** Let's tackle the color picker first! 🎨
