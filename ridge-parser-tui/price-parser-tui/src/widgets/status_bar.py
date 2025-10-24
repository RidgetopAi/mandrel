"""Status bar widget for displaying current state"""
from textual.widgets import Static
from rich.text import Text


class StatusBar(Static):
    """Bottom status bar showing current selection and info"""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.current_file = "No file loaded"
        self.current_cell = "No cell selected"
    
    def update_file(self, filename: str):
        """Update current file display"""
        self.current_file = filename
        self._refresh_display()
    
    def update_cell(self, cell_info: str):
        """Update current cell display"""
        self.current_cell = cell_info
        self._refresh_display()
    
    def _refresh_display(self):
        """Refresh the status bar content"""
        text = Text()
        text.append("📁 ", style="bold cyan")
        text.append(self.current_file, style="cyan")
        text.append(" | ", style="dim")
        text.append("📍 ", style="bold yellow")
        text.append(self.current_cell, style="yellow")
        
        self.update(text)
