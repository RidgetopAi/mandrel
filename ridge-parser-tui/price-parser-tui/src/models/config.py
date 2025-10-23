"""Configuration model for loading and validating config.toml"""
from pathlib import Path
from typing import Optional
from pydantic import BaseModel, Field
import tomli


class PathsConfig(BaseModel):
    """File path configuration"""
    data_dir: str = "data"
    output_dir: str = "output"


class UIConfig(BaseModel):
    """UI display configuration"""
    theme: str = "monokai"
    max_column_width: int = 30
    show_row_numbers: bool = True


class AppConfig(BaseModel):
    """Main application configuration"""
    paths: PathsConfig = Field(default_factory=PathsConfig)
    ui: UIConfig = Field(default_factory=UIConfig)

    @classmethod
    def load(cls, config_path: str = "config.toml") -> "AppConfig":
        """Load configuration from TOML file"""
        path = Path(config_path)
        
        if not path.exists():
            # Return defaults if config doesn't exist
            return cls()
        
        with open(path, "rb") as f:
            config_data = tomli.load(f)
        
        return cls(**config_data)

    def get_data_dir(self) -> Path:
        """Get absolute path to data directory"""
        return Path(self.paths.data_dir).resolve()

    def get_output_dir(self) -> Path:
        """Get absolute path to output directory"""
        return Path(self.paths.output_dir).resolve()
