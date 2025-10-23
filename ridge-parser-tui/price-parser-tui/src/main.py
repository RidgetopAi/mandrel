"""Main Textual application"""
from pathlib import Path
from textual.app import App, ComposeResult
from textual.containers import Container, Vertical, Horizontal
from textual.widgets import Header, Footer, Static, DirectoryTree, Button
from textual.binding import Binding
from rich.text import Text

from .models.config import AppConfig
from .widgets.price_table import PriceTable
from .widgets.status_bar import StatusBar


class PriceParserApp(App):
    """Price Parser TUI Application"""
    
    CSS = """
    Screen {
        background: $surface;
    }
    
    #main-container {
        height: 100%;
        layout: vertical;
    }
    
    #toolbar {
        height: 3;
        background: $primary;
        padding: 0 2;
    }
    
    #content-area {
        height: 1fr;
        layout: horizontal;
    }
    
    #file-sidebar {
        width: 30;
        background: $panel;
        border-right: solid $primary;
    }
    
    #table-container {
        width: 1fr;
        padding: 1 2;
    }
    
    PriceTable {
        height: 100%;
    }
    
    StatusBar {
        height: 1;
        background: $primary-background;
        padding: 0 2;
    }
    
    DirectoryTree {
        height: 100%;
    }
    
    .toolbar-title {
        text-align: center;
        content-align: center middle;
    }
    """
    
    BINDINGS = [
        Binding("q", "quit", "Quit", show=True),
        Binding("o", "open_file", "Open", show=True),
        Binding("e", "export", "Export", show=True),
        Binding("c", "color_cell", "Color", show=True),
        Binding("ctrl+s", "save", "Save", show=False),
    ]
    
    def __init__(self):
        super().__init__()
        self.config = AppConfig.load()
        self.price_table = PriceTable()
        self.status_bar = StatusBar()
        self.file_tree = None
    
    def compose(self) -> ComposeResult:
        """Compose the UI layout"""
        yield Header(show_clock=True)
        
        with Container(id="main-container"):
            # Toolbar
            with Horizontal(id="toolbar"):
                yield Static(
                    Text("🎯 Price Parser TUI", style="bold magenta"),
                    classes="toolbar-title"
                )
            
            # Main content area
            with Horizontal(id="content-area"):
                # File browser sidebar
                with Vertical(id="file-sidebar"):
                    data_dir = self.config.get_data_dir()
                    data_dir.mkdir(exist_ok=True)  # Ensure it exists
                    self.file_tree = DirectoryTree(str(data_dir))
                    yield self.file_tree
                
                # Table area
                with Container(id="table-container"):
                    yield self.price_table
            
            # Status bar
            yield self.status_bar
        
        yield Footer()
    
    def on_mount(self) -> None:
        """Called when app is mounted"""
        self.title = "Price Parser TUI"
        self.sub_title = "CSV Price List Parser"
    
    def on_directory_tree_file_selected(self, event: DirectoryTree.FileSelected) -> None:
        """Handle file selection from directory tree"""
        file_path = Path(event.path)
        
        if file_path.suffix.lower() == '.csv':
            if self.price_table.load_csv(file_path):
                self.status_bar.update_file(file_path.name)
                self.notify(f"Loaded: {file_path.name}", severity="information")
        else:
            self.notify("Please select a CSV file", severity="warning")
    
    def on_price_table_cell_double_clicked(self, message: PriceTable.CellDoubleClicked) -> None:
        """Handle cell double-click event"""
        cell_state = message.cell_state
        
        # Update status bar
        info = f"{cell_state.position} | Content: {cell_state.content[:20]}"
        self.status_bar.update_cell(info)
        
        # Notify user
        self.notify(
            f"Cell clicked: {cell_state.position}\nContent: {cell_state.content}",
            title="Cell Selected",
            severity="information"
        )
    
    def action_open_file(self) -> None:
        """Open file action"""
        self.notify("Select a CSV file from the sidebar", severity="information")
    
    def action_export(self) -> None:
        """Export current state to JSON"""
        if not self.price_table.current_file:
            self.notify("No file loaded", severity="warning")
            return
        
        try:
            export_data = self.price_table.export_to_json()
            
            # Generate output filename
            output_dir = self.config.get_output_dir()
            output_dir.mkdir(exist_ok=True)
            
            original_name = self.price_table.current_file.stem
            output_file = output_dir / f"{original_name}_parsed.json"
            
            import json
            with open(output_file, 'w') as f:
                json.dump(export_data, f, indent=2)
            
            self.notify(f"Exported to: {output_file}", severity="information")
            
        except Exception as e:
            self.notify(f"Export failed: {e}", severity="error")
    
    def action_color_cell(self) -> None:
        """Color selected cells"""
        # Placeholder - we'll implement a color picker modal
        self.notify("Color picker coming soon!", severity="information")
    
    def action_save(self) -> None:
        """Save current state"""
        self.action_export()


def main():
    """Entry point"""
    app = PriceParserApp()
    app.run()


if __name__ == "__main__":
    main()
