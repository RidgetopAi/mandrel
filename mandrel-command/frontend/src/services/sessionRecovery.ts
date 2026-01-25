/**
 * Session Recovery Service
 * 
 * Handles session persistence, recovery, and reconnection logic
 * for seamless user experience across browser refreshes and network issues.
 */

import type { Session } from '../types/session';

interface SessionState {
  currentSession: Session | null;
  lastSyncTime: number;
  isConnected: boolean;
  reconnectAttempts: number;
}

const SESSION_STORAGE_KEY = 'aidis_session_state';
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_INTERVAL = 2000; // 2 seconds
const SESSION_SYNC_INTERVAL = 30000; // 30 seconds

class SessionRecoveryService {
  private state: SessionState = {
    currentSession: null,
    lastSyncTime: 0,
    isConnected: true,
    reconnectAttempts: 0
  };

  private syncInterval: NodeJS.Timeout | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private listeners: Array<(state: SessionState) => void> = [];

  constructor() {
    this.loadPersistedState();
    this.startSessionSync();
    this.setupBeforeUnloadHandler();
  }

  /**
   * Load persisted session state from localStorage
   */
  private loadPersistedState(): void {
    try {
      // Check if localStorage is available (browser environment)
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = localStorage.getItem(SESSION_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          this.state = {
            ...this.state,
            currentSession: parsed.currentSession,
            lastSyncTime: parsed.lastSyncTime || 0
          };
        }
      }
    } catch (error) {
      console.warn('Failed to load persisted session state:', error);
      // Clear corrupted data if localStorage is available
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.removeItem(SESSION_STORAGE_KEY);
      }
    }
  }

  /**
   * Persist current session state to localStorage
   */
  private persistState(): void {
    try {
      // Check if localStorage is available (browser environment)
      if (typeof window !== 'undefined' && window.localStorage) {
        const stateToPersist = {
          currentSession: this.state.currentSession,
          lastSyncTime: this.state.lastSyncTime
        };
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(stateToPersist));
      }
    } catch (error) {
      console.warn('Failed to persist session state:', error);
    }
  }

  /**
   * Start periodic session synchronization
   */
  private startSessionSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    this.syncInterval = setInterval(() => {
      this.syncWithBackend();
    }, SESSION_SYNC_INTERVAL);

    // Initial sync
    this.syncWithBackend();
  }

  /**
   * Sync current session with backend
   */
  private async syncWithBackend(): Promise<void> {
    try {
      // Import here to avoid circular dependencies
      const { sessionsClient } = await import('../api/sessionsClient');

      const currentSession = await sessionsClient.getCurrentSession();
      
      if (currentSession) {
        const hasChanged = !this.state.currentSession || 
                          this.state.currentSession.id !== currentSession.id;
        
        if (hasChanged) {
          console.log('Session changed detected, updating state');
          this.updateSession(currentSession);
        }
        
        this.state.lastSyncTime = Date.now();
        this.setConnectionStatus(true);
      }
    } catch (error) {
      console.warn('Session sync failed:', error);
      this.handleConnectionError();
    }
  }

  /**
   * Handle connection errors and start reconnection process
   */
  private handleConnectionError(): void {
    this.setConnectionStatus(false);
    
    if (this.state.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      this.state.reconnectAttempts++;
      
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
      }
      
      const delay = RECONNECT_INTERVAL * Math.pow(2, this.state.reconnectAttempts - 1);
      
      this.reconnectTimeout = setTimeout(() => {
        console.log(`Attempting reconnection ${this.state.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
        this.syncWithBackend();
      }, delay);
    } else {
      console.error('Maximum reconnection attempts reached');
      this.notifyListeners();
    }
  }

  /**
   * Update connection status
   */
  private setConnectionStatus(connected: boolean): void {
    if (this.state.isConnected !== connected) {
      this.state.isConnected = connected;
      
      if (connected) {
        this.state.reconnectAttempts = 0;
        if (this.reconnectTimeout) {
          clearTimeout(this.reconnectTimeout);
          this.reconnectTimeout = null;
        }
      }
      
      this.notifyListeners();
    }
  }

  /**
   * Update current session
   */
  public updateSession(session: Session | null): void {
    this.state.currentSession = session;
    this.state.lastSyncTime = Date.now();
    this.persistState();
    this.notifyListeners();
  }

  /**
   * Get current session state
   */
  public getCurrentSession(): Session | null {
    return this.state.currentSession;
  }

  /**
   * Get connection status
   */
  public isConnected(): boolean {
    return this.state.isConnected;
  }

  /**
   * Get reconnect attempts count
   */
  public getReconnectAttempts(): number {
    return this.state.reconnectAttempts;
  }

  /**
   * Force a session sync
   */
  public async forceSync(): Promise<void> {
    await this.syncWithBackend();
  }

  /**
   * Subscribe to session state changes
   */
  public subscribe(listener: (state: SessionState) => void): () => void {
    this.listeners.push(listener);
    
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Notify all listeners of state changes
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener({ ...this.state });
      } catch (error) {
        console.error('Error in session state listener:', error);
      }
    });
  }

  /**
   * Setup beforeunload handler to persist state
   */
  private setupBeforeUnloadHandler(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.persistState();
      });
    }
  }

  /**
   * Manual reconnection attempt
   */
  public async reconnect(): Promise<void> {
    this.state.reconnectAttempts = 0;
    await this.syncWithBackend();
  }

  /**
   * Clear persisted session data
   */
  public clearPersistedData(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
    this.state.currentSession = null;
    this.state.lastSyncTime = 0;
    this.notifyListeners();
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    this.listeners = [];
    this.persistState();
  }
}

// Export singleton instance
export const sessionRecovery = new SessionRecoveryService();
