# 🚀 Quick Start Guide

## Get Running in 3 Steps

### Step 1: Setup
```bash
cd price-parser-tui
./setup.sh
```

### Step 2: Run
```bash
./run.sh
```

Or manually:
```bash
python -m src.main
```

### Step 3: Try It Out

1. **Load the sample file**: 
   - Look at left sidebar
   - Click on `sample_prices.csv`
   - Table loads with data

2. **Interact with cells**:
   - **Single click**: Select cell
   - **Double click**: See position and content in status bar
   - Watch the notification popup!

3. **Export**:
   - Press `e` (or `Ctrl+S`)
   - Check `output/sample_prices_parsed.json`

## 🎮 Current Controls

| Key | Action |
|-----|--------|
| `o` | Open file (reminder - use sidebar) |
| `e` | Export to JSON |
| `c` | Color cell (placeholder) |
| `Ctrl+S` | Save/Export |
| `q` | Quit |

## 📁 File Structure

```
price-parser-tui/
├── config.toml          ← Edit this for settings
├── data/                ← Put your CSV files here
│   └── sample_prices.csv
├── output/              ← JSON exports appear here
├── src/
│   ├── main.py         ← Main app
│   ├── models/         ← Data structures
│   └── widgets/        ← UI components
└── README.md
```

## 🐛 Troubleshooting

**Icons look weird?**
- Install JetBrains Mono Nerd Font (see README.md)
- Set your terminal to use it

**Can't load CSV?**
- Make sure it's in the `data/` folder
- Check file has `.csv` extension
- File must be comma-delimited

**Table looks broken?**
- Maximize your terminal window
- Try a smaller CSV first
- Check CSV doesn't have weird characters

## 🎯 What Works Now (Phase 1)

✅ CSV loading from sidebar
✅ Cell position tracking
✅ Double-click to select
✅ Status bar updates
✅ JSON export (exports colored cells)
✅ Keyboard shortcuts
✅ File browser
✅ Rich styling

## 🔮 Coming Next (Phase 2)

⏳ Color picker modal
⏳ Multi-cell selection (Shift+Click)
⏳ Row/Column coloring
⏳ Parser card panel
⏳ @ file selector
⏳ Cell content preview
⏳ Undo/Redo

## 💡 Tips

1. **Start small**: Use the sample CSV to understand the flow
2. **Check status bar**: It shows what's happening
3. **Watch notifications**: They appear top-right
4. **Use keyboard**: It's faster than mouse
5. **Export often**: JSON files are small, export frequently

## 🤔 Understanding the Code

**Want to understand what's happening?**

Read in this order:
1. `ARCHITECTURE.md` - High-level overview
2. `src/main.py` - See the app structure
3. `src/widgets/price_table.py` - Core table logic
4. `src/models/cell_state.py` - Data structures

**Each file is commented** - read the docstrings!

## 📝 Example Workflow (Future)

Here's where we're going:

1. Load CSV: `sample_prices.csv`
2. Double-click "Product Name" header → Position captured
3. Click parser card field → Position populated
4. Color code "Product Name" column → Green (indicates field mapping)
5. Color code "Unit Price" column → Blue (indicates price field)
6. Export → AI receives:
   ```json
   {
     "fields": [
       {"name": "product", "position": {"row": 0, "col": 1}, "color": "#00FF00"},
       {"name": "price", "position": {"row": 0, "col": 3}, "color": "#0000FF"}
     ]
   }
   ```
7. AI writes parser code based on positions and colors

## 🎨 Customization

Edit `config.toml`:
```toml
[paths]
data_dir = "data"           # Your CSV location
output_dir = "output"       # Where JSON goes

[ui]
max_column_width = 30       # Adjust column width
show_row_numbers = true     # Show row indices
```

## Need Help?

1. Check `README.md` for full docs
2. Check `ARCHITECTURE.md` to understand design
3. Look at the code - it's well commented!

---

**Pro tip**: Run with `--dev` flag (when we add it) for hot reload during development!
