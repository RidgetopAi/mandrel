# Price Parser TUI - Architecture Overview

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Price Parser TUI                          │
│                   (Textual App - main.py)                    │
└──────────────────────┬──────────────────────────────────────┘
                       │
        ┌──────────────┴───────────────┐
        │                              │
┌───────▼──────┐              ┌────────▼────────┐
│  UI Widgets  │              │  Data Models    │
└──────────────┘              └─────────────────┘
        │                              │
   ┌────┴────┐                   ┌─────┴──────┐
   │         │                   │            │
┌──▼──┐  ┌──▼──┐          ┌─────▼────┐ ┌─────▼─────┐
│Table│  │Status│         │CellState │ │ Config    │
│     │  │Bar  │          │          │ │           │
└─────┘  └─────┘          └──────────┘ └───────────┘
```

## 📦 Component Breakdown

### 1. **Main App (`src/main.py`)**
**Purpose**: Orchestrates the entire application

**Key Responsibilities**:
- Layout management (header, sidebar, table, status bar)
- Event routing (file selection, cell clicks, exports)
- Keyboard binding handling
- Application lifecycle

**Key Methods**:
```python
compose()                          # Build UI layout
on_directory_tree_file_selected()  # Handle CSV selection
on_price_table_cell_double_clicked() # Handle cell interactions
action_export()                    # Export to JSON
```

### 2. **PriceTable Widget (`src/widgets/price_table.py`)**
**Purpose**: Core table display and interaction

**Features**:
- CSV loading via Pandas
- Cell state tracking (position + content + color)
- Click/double-click event handling
- Multi-cell selection
- JSON export functionality

**Key Data Structures**:
```python
cell_states: Dict[Tuple[int, int], CellState]  # Maps (row, col) to cell info
selected_cells: set[Tuple[int, int]]           # Currently selected cells
df: pd.DataFrame                                # Raw CSV data
```

**Event Flow**:
```
CSV Load → Parse with Pandas → Initialize CellStates → Display in DataTable
              ↓
User Double-Clicks Cell → Emit CellDoubleClicked message → Update status bar
              ↓
User Selects Color → Update cell_states color → Refresh display
              ↓
User Exports → Serialize colored cells to JSON
```

### 3. **StatusBar Widget (`src/widgets/status_bar.py`)**
**Purpose**: Display current state information

**Shows**:
- 📁 Current loaded file
- 📍 Currently selected cell (position + content preview)

**Update Pattern**:
```python
Table Event → StatusBar.update_cell() → Rich Text formatting → Display
```

### 4. **Data Models (`src/models/`)**

#### **CellState (`cell_state.py`)**
Tracks everything about a cell:
```python
CellState:
  - position: CellPosition(row, column)  # Where it is
  - content: str                         # What it contains
  - color: Optional[str]                 # Hex color code
  
  Methods:
  - to_dict() → JSON serializable        # For AI export
  - get_rich_style() → Style object      # For display
```

#### **SelectionRange (`cell_state.py`)**
Represents a rectangular selection:
```python
SelectionRange:
  - start_row, start_col
  - end_row, end_col
  
  Methods:
  - contains(row, col) → bool           # Is this cell in selection?
  - get_cells() → List[(row, col)]      # All cells in range
```

#### **AppConfig (`config.py`)**
Loads and validates `config.toml`:
```python
AppConfig:
  - paths: PathsConfig
    - data_dir: where CSVs live
    - output_dir: where JSON exports go
  
  - ui: UIConfig
    - theme, column width, etc.
```

## 🔄 Data Flow

### Loading a CSV:
```
User clicks file in sidebar
         ↓
DirectoryTree.FileSelected event
         ↓
App.on_directory_tree_file_selected()
         ↓
PriceTable.load_csv(filepath)
         ↓
1. Read CSV with Pandas
2. Create CellState for each cell
3. Add columns to DataTable
4. Add rows to DataTable
5. Store DataFrame reference
         ↓
Update StatusBar with filename
```

### Double-Clicking a Cell:
```
User double-clicks cell
         ↓
PriceTable.on_double_click(event)
         ↓
1. Get cell coordinate from event
2. Look up CellState from cell_states dict
3. Emit CellDoubleClicked message
         ↓
App.on_price_table_cell_double_clicked()
         ↓
1. Extract position and content
2. Update StatusBar
3. Show notification
```

### Exporting to JSON:
```
User presses 'e' or Ctrl+S
         ↓
App.action_export()
         ↓
PriceTable.export_to_json()
         ↓
1. Iterate through cell_states
2. Filter cells with colors (marked cells)
3. Serialize to dict with to_dict()
4. Return JSON structure
         ↓
Write to output/{filename}_parsed.json
```

## 🎨 Styling System

**CSS-like Styling in Textual**:
```css
#main-container → Full height vertical layout
#toolbar → 3-line height, primary color background
#content-area → Horizontal split (sidebar + table)
#file-sidebar → 30 columns wide, panel background
#table-container → Takes remaining space (1fr)
```

**Color Application** (Future):
```python
# Rich Style objects for cell colors
cell.style = Style(bgcolor="#FF5733")

# Will be applied when rendering cells
# Currently using DataTable's built-in styling
```

## 🔮 Next Phase Architecture

### Color Picker Modal:
```
User presses 'c' → Open ColorPicker modal
                 → User selects color
                 → Apply to selected_cells
                 → Update cell_states
                 → Refresh table display
```

### Parser Card Panel:
```
┌──────────────┬─────────────────┐
│ File Browser │ Price Table     │
├──────────────┤                 │
│ Parser Card  │                 │
│ ┌──────────┐ │                 │
│ │Field: [] │ │                 │
│ │Type:  [] │ │                 │
│ │Pos:   [] │ ← Double-click here
│ └──────────┘ │    captures position
└──────────────┴─────────────────┘
```

### @ File Selector:
```
CLI-style input: @subdirectory/file.csv
                 ↓
Parse '@' command → Look up in data_dir
                  → Load file
                  → Update display
```

## 🧩 Extension Points

**Where to add features**:

1. **New Widgets**: `src/widgets/your_widget.py`
2. **Data Models**: `src/models/your_model.py`
3. **Color Themes**: Modify CSS in `PriceParserApp.CSS`
4. **Export Formats**: Extend `PriceTable.export_to_*()`
5. **Keyboard Shortcuts**: Add to `BINDINGS` in main.py

## 🎯 Key Design Patterns

### Event-Driven Architecture:
```python
# Widgets emit messages
self.post_message(self.CellDoubleClicked(cell_state))

# App handles messages
def on_price_table_cell_double_clicked(self, message):
    # React to event
```

### State Management:
```python
# Centralized in PriceTable
cell_states: Dict[Tuple[int, int], CellState]

# Single source of truth
# All UI updates driven by this state
```

### Configuration as Code:
```python
# Type-safe config with Pydantic
config = AppConfig.load()  # Validates TOML
config.get_data_dir()      # Type hints everywhere
```

## 📊 Performance Considerations

**Current**:
- Loads entire CSV into memory (Pandas DataFrame)
- All cells tracked in dict
- Fine for thousands of rows

**Future Optimization** (if needed):
- Implement virtual scrolling (lazy load rows)
- Only track colored/selected cells
- Stream large CSVs in chunks

## 🛠️ Tech Stack Rationale

**Textual**: 
- Native mouse events (double-click, drag)
- Reactive layouts
- Built-in widgets (DataTable, DirectoryTree)
- Professional TUI without low-level terminal handling

**Rich**:
- Beautiful text rendering
- Color support
- Text styling (bold, italic, colors)
- Integrated with Textual

**Pandas**:
- Robust CSV parsing
- Data type inference
- Easy data manipulation
- Industry standard

**Pydantic**:
- Type validation
- Config validation
- JSON serialization
- Self-documenting code

---

**Remember**: This is Phase 1 - the foundation. Everything is built to be extended!
