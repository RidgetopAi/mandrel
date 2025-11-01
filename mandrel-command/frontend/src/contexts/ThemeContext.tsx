import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { theme as antdTheme } from 'antd';
import type { ThemeConfig } from 'antd';

type ThemeMode = 'light' | 'dark';

interface ThemeContextType {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  antdThemeConfig: ThemeConfig;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Light theme configuration
const lightTheme: ThemeConfig = {
  token: {
    colorPrimary: '#1890ff',
    borderRadius: 8,
    wireframe: false,
  },
  components: {
    Layout: {
      siderBg: '#001529',
      headerBg: '#ffffff',
    },
  },
};

// Dark theme configuration
const darkTheme: ThemeConfig = {
  algorithm: antdTheme.darkAlgorithm,
  token: {
    colorPrimary: '#1890ff',
    borderRadius: 8,
    wireframe: false,
    colorBgContainer: '#1f1f1f',
    colorBgElevated: '#262626',
    colorBgLayout: '#141414',
  },
  components: {
    Layout: {
      siderBg: '#141414',
      headerBg: '#1f1f1f',
      bodyBg: '#141414',
      triggerBg: '#262626',
    },
    Menu: {
      // Override dark menu selected item to prevent blue background
      // Using all possible token names to ensure coverage
      itemSelectedBg: 'rgba(255, 255, 255, 0.08)',
      itemBg: 'transparent',
      subMenuItemBg: 'transparent',
      itemSelectedColor: '#fff',
      itemHoverBg: 'rgba(255, 255, 255, 0.05)',
      itemActiveBg: 'rgba(255, 255, 255, 0.12)',
      darkItemBg: 'transparent',
      darkItemSelectedBg: 'rgba(255, 255, 255, 0.08)',
      darkSubMenuItemBg: 'transparent',
      darkItemSelectedColor: '#fff',
      darkItemHoverBg: 'rgba(255, 255, 255, 0.05)',
      itemColor: 'rgba(255, 255, 255, 0.85)',
      darkItemColor: 'rgba(255, 255, 255, 0.85)',
    },
    Typography: {
      colorText: 'rgba(255, 255, 255, 0.85)',
      colorTextHeading: 'rgba(255, 255, 255, 0.85)',
    },
  },
};

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [themeMode, setThemeModeState] = useState<ThemeMode>('light');
  const [isInitialized, setIsInitialized] = useState(false);

  // Load theme preference from backend on mount
  useEffect(() => {
    const loadThemePreference = async () => {
      try {
        const token = localStorage.getItem('aidis_token');
        if (!token) {
          setIsInitialized(true);
          return;
        }

        const apiBaseUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
        const response = await fetch(`${apiBaseUrl}/auth/profile`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          const savedTheme = data.data?.user?.theme || 'light';
          setThemeModeState(savedTheme);

          // Apply theme to document root
          document.documentElement.setAttribute('data-theme', savedTheme);
        }
      } catch (error) {
        console.error('Failed to load theme preference:', error);
      } finally {
        setIsInitialized(true);
      }
    };

    loadThemePreference();
  }, []);

  // Update theme mode and apply to document root
  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    document.documentElement.setAttribute('data-theme', mode);
  };

  // Get the current Ant Design theme configuration
  const antdThemeConfig = themeMode === 'dark' ? darkTheme : lightTheme;

  // Don't render children until theme is loaded to prevent flash
  if (!isInitialized) {
    return null;
  }

  return (
    <ThemeContext.Provider value={{ themeMode, setThemeMode, antdThemeConfig }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
