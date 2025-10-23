"""Main price table widget with cell selection and color coding"""
from pathlib import Path
from typing import Optional, Dict, Tuple
import pandas as pd
from textual.widgets import DataTable
from textual.coordinate import Coordinate
from textual.message import Message
from rich.text import Text
from ..models.cell_state import CellState, CellPosition, SelectionRange


class PriceTable(DataTable):
    """Enhanced DataTable with position tracking and color coding"""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.cell_states: Dict[Tuple[int, int], CellState] = {}
        self.current_file: Optional[Path] = None
        self.df: Optional[pd.DataFrame] = None
        self.selected_cells: set[Tuple[int, int]] = set()
        self.last_clicked: Optional[Tuple[int, int]] = None
        
        # Styling
        self.cursor_type = "row"
        self.zebra_stripes = True
    
    def load_csv(self, filepath: Path) -> bool:
        """Load CSV file into the table"""
        try:
            # Read CSV
            self.df = pd.read_csv(filepath)
            self.current_file = filepath
            
            # Clear existing data
            self.clear()
            self.cell_states.clear()
            self.selected_cells.clear()
            
            # Add columns
            columns = list(self.df.columns)
            for col in columns:
                self.add_column(str(col), key=str(col))
            
            # Add rows and initialize cell states
            for row_idx, row_data in self.df.iterrows():
                row_values = [str(val) for val in row_data.values]
                self.add_row(*row_values)
                
                # Initialize cell states
                for col_idx, (col_name, value) in enumerate(zip(columns, row_data.values)):
                    cell_state = CellState(
                        position=CellPosition(row=row_idx, column=col_idx),
                        content=str(value),
                        color=None
                    )
                    self.cell_states[(row_idx, col_idx)] = cell_state
            
            return True
            
        except Exception as e:
            self.app.notify(f"Error loading CSV: {e}", severity="error")
            return False
    
    def get_cell_state(self, row: int, col: int) -> Optional[CellState]:
        """Get the state of a specific cell"""
        return self.cell_states.get((row, col))
    
    def set_cell_color(self, row: int, col: int, color: str):
        """Set color for a specific cell"""
        if (row, col) in self.cell_states:
            self.cell_states[(row, col)].color = color
            self._refresh_cell_display(row, col)
    
    def set_range_color(self, selection: SelectionRange, color: str):
        """Set color for a range of cells"""
        for row, col in selection.get_cells():
            self.set_cell_color(row, col, color)
    
    def _refresh_cell_display(self, row: int, col: int):
        """Refresh the display of a single cell with its color"""
        # Note: Textual DataTable doesn't directly support cell background colors
        # We'll need to use Rich Text styling for this
        # This is a placeholder for the styling implementation
        pass
    
    def on_click(self, event) -> None:
        """Handle single click - track for multi-select"""
        try:
            # Get the cell coordinate from the click event
            cell_key = self.coordinate_to_cell_key(event.coordinate)
            if cell_key:
                row_key, col_key = cell_key
                # Convert keys to indices
                row_idx = self.get_row_index(row_key)
                col_idx = self.get_column_index(col_key)
                
                self.last_clicked = (row_idx, col_idx)
                
                # Toggle selection
                if (row_idx, col_idx) in self.selected_cells:
                    self.selected_cells.remove((row_idx, col_idx))
                else:
                    self.selected_cells.add((row_idx, col_idx))
                
        except Exception as e:
            pass  # Silently handle click outside table
    
    def on_double_click(self, event) -> None:
        """Handle double-click - emit cell position"""
        try:
            cell_key = self.coordinate_to_cell_key(event.coordinate)
            if cell_key:
                row_key, col_key = cell_key
                row_idx = self.get_row_index(row_key)
                col_idx = self.get_column_index(col_key)
                
                cell_state = self.get_cell_state(row_idx, col_idx)
                if cell_state:
                    # Post custom message with cell info
                    self.post_message(self.CellDoubleClicked(cell_state))
        except Exception as e:
            pass
    
    def export_to_json(self) -> dict:
        """Export table state to JSON format for AI parsing"""
        export_data = {
            "file": str(self.current_file) if self.current_file else None,
            "cells": []
        }
        
        for (row, col), state in self.cell_states.items():
            if state.color:  # Only export cells with colors (marked cells)
                export_data["cells"].append(state.to_dict())
        
        return export_data
    
    class CellDoubleClicked(Message):
        """Message emitted when a cell is double-clicked"""
        def __init__(self, cell_state: CellState):
            super().__init__()
            self.cell_state = cell_state
