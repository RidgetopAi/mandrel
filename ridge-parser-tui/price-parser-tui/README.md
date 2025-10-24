# Price Parser TUI 🎯

A beautiful terminal-based UI for parsing and analyzing CSV price lists with AI-assisted mapping.

## Features

- 🎨 **Rich Terminal UI** - Polished interface with colors and icons
- 📊 **CSV Loading** - Load and view large CSV files
- 🎯 **Cell Selection** - Click and double-click cells to capture positions
- 🌈 **Color Coding** - Mark cells/rows/columns with colors for AI reference
- 💾 **JSON Export** - Export annotated data for AI processing
- 📁 **File Browser** - Built-in directory tree navigation

## Installation

### 1. Install JetBrains Mono Nerd Font (for beautiful icons)

```bash
# Download the font
wget https://github.com/ryanoasis/nerd-fonts/releases/download/v3.1.1/JetBrainsMono.zip

# Unzip
unzip JetBrainsMono.zip -d ~/.local/share/fonts/

# Rebuild font cache
fc-cache -fv

# Verify installation
fc-list | grep "JetBrains"
```

**Set your terminal to use JetBrains Mono Nerd Font:**
- Windows Terminal: Settings → Profiles → Defaults → Appearance → Font face
- VSCode Terminal: Settings → Terminal › Integrated: Font Family → `'JetBrains Mono Nerd Font'`
- Gnome Terminal: Preferences → Profile → Text → Custom font

### 2. Install Python Dependencies

```bash
# Navigate to project directory
cd price-parser-tui

# Install dependencies
pip install -r requirements.txt --break-system-packages
```

## Usage

### Basic Usage

```bash
# Run the app
python -m src.main
```

### Configuration

Edit `config.toml` to customize:

```toml
[paths]
data_dir = "data"        # Where your CSV files are
output_dir = "output"    # Where JSON exports go

[ui]
theme = "monokai"
max_column_width = 30
show_row_numbers = true
```

### Keyboard Shortcuts

- `o` - Open file (select from sidebar)
- `e` - Export to JSON
- `c` - Color selected cell (coming soon)
- `Ctrl+S` - Save/Export
- `q` - Quit

### Workflow

1. **Load CSV**: Click a CSV file in the left sidebar
2. **Select Cell**: Double-click a cell to see its position and content
3. **Color Code**: (Coming soon) Select cells and press `c` to color-code them
4. **Export**: Press `e` to export marked cells to JSON

## Project Structure

```
price-parser-tui/
├── config.toml           # Configuration
├── src/
│   ├── main.py          # Main application
│   ├── models/
│   │   ├── config.py    # Config loader
│   │   └── cell_state.py # Cell data models
│   └── widgets/
│       ├── price_table.py   # Main table widget
│       └── status_bar.py    # Status display
├── data/                # Your CSV files
└── output/              # JSON exports
```

## Next Steps

### Phase 2 Features (Coming):
- ✨ Color picker modal
- ✨ Multi-cell selection with Shift+Click
- ✨ Column/Row color coding
- ✨ Parser card panel
- ✨ @ file selector (CLI-style)
- ✨ Cell content preview

## Development

Built with:
- [Textual](https://textual.textualize.io/) - TUI framework
- [Rich](https://rich.readthedocs.io/) - Terminal styling
- [Pandas](https://pandas.pydata.org/) - Data handling
- [Pydantic](https://docs.pydantic.dev/) - Data validation

## License

MIT
