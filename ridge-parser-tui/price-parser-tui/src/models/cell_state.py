"""Cell state management - tracks position, content, and styling"""
from typing import Optional, Tuple
from pydantic import BaseModel
from rich.style import Style


class CellPosition(BaseModel):
    """Represents a cell's position in the table"""
    row: int
    column: int
    
    def __str__(self) -> str:
        return f"Row: {self.row}, Col: {self.column}"
    
    def to_dict(self) -> dict:
        return {"row": self.row, "column": self.column}


class CellState(BaseModel):
    """Complete state of a cell including position, content, and styling"""
    position: CellPosition
    content: str
    color: Optional[str] = None  # Hex color code like "#FF5733"
    
    class Config:
        arbitrary_types_allowed = True
    
    def get_rich_style(self) -> Style:
        """Convert color to Rich Style object"""
        if self.color:
            return Style(bgcolor=self.color)
        return Style()
    
    def to_dict(self) -> dict:
        """Export to JSON-serializable dict"""
        return {
            "position": self.position.to_dict(),
            "content": self.content,
            "color": self.color
        }


class SelectionRange(BaseModel):
    """Represents a range of selected cells"""
    start_row: int
    start_col: int
    end_row: int
    end_col: int
    
    def contains(self, row: int, col: int) -> bool:
        """Check if a position is within this selection"""
        return (
            self.start_row <= row <= self.end_row and
            self.start_col <= col <= self.end_col
        )
    
    def get_cells(self) -> list[Tuple[int, int]]:
        """Get all cell positions in this range"""
        cells = []
        for row in range(self.start_row, self.end_row + 1):
            for col in range(self.start_col, self.end_col + 1):
                cells.append((row, col))
        return cells
