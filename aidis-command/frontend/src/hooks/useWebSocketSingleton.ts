import { useState, useEffect, useRef, useCallback } from 'react';

export interface WebSocketMessage {
  type: string;
  data?: any;
  message?: string;
}

export interface UseWebSocketOptions {
  onOpen?: (event: Event) => void;
  onMessage?: (message: WebSocketMessage) => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (event: Event) => void;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export interface UseWebSocketReturn {
  socket: WebSocket | null;
  connectionState: 'CONNECTING' | 'OPEN' | 'CLOSING' | 'CLOSED';
  sendMessage: (message: any) => void;
  reconnect: () => void;
  disconnect: () => void;
  isConnected: boolean;
}

// Singleton WebSocket manager
class WebSocketManager {
  private static instance: WebSocketManager;
  private connections: Map<string, {
    socket: WebSocket;
    listeners: Set<(message: WebSocketMessage) => void>;
    openListeners: Set<(event: Event) => void>;
    closeListeners: Set<(event: CloseEvent) => void>;
    errorListeners: Set<(event: Event) => void>;
  }> = new Map();

  static getInstance(): WebSocketManager {
    if (!WebSocketManager.instance) {
      WebSocketManager.instance = new WebSocketManager();
    }
    return WebSocketManager.instance;
  }

  connect(
    url: string,
    options: {
      onMessage?: (message: WebSocketMessage) => void;
      onOpen?: (event: Event) => void;
      onClose?: (event: CloseEvent) => void;
      onError?: (event: Event) => void;
    } = {}
  ): WebSocket | null {
    if (this.connections.has(url)) {
      const connection = this.connections.get(url)!;
      
      // Add listeners
      if (options.onMessage) connection.listeners.add(options.onMessage);
      if (options.onOpen) connection.openListeners.add(options.onOpen);
      if (options.onClose) connection.closeListeners.add(options.onClose);
      if (options.onError) connection.errorListeners.add(options.onError);
      
      // If already connected, call onOpen immediately
      if (connection.socket.readyState === WebSocket.OPEN && options.onOpen) {
        options.onOpen(new Event('open'));
      }
      
      return connection.socket;
    }

    // Create new connection
    const socket = new WebSocket(url);
    const connection = {
      socket,
      listeners: new Set(options.onMessage ? [options.onMessage] : []),
      openListeners: new Set(options.onOpen ? [options.onOpen] : []),
      closeListeners: new Set(options.onClose ? [options.onClose] : []),
      errorListeners: new Set(options.onError ? [options.onError] : [])
    };

    this.connections.set(url, connection);

    socket.onopen = (event) => {
      console.log(`WebSocket connected: ${url}`);
      connection.openListeners.forEach(listener => listener(event));
    };

    socket.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        connection.listeners.forEach(listener => listener(message));
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    socket.onclose = (event) => {
      console.log(`WebSocket disconnected: ${url}`, event.code, event.reason);
      connection.closeListeners.forEach(listener => listener(event));
      
      // Clean up connection
      this.connections.delete(url);
    };

    socket.onerror = (event) => {
      console.error(`WebSocket error: ${url}`, event);
      connection.errorListeners.forEach(listener => listener(event));
    };

    return socket;
  }

  disconnect(url: string, listener?: {
    onMessage?: (message: WebSocketMessage) => void;
    onOpen?: (event: Event) => void;
    onClose?: (event: CloseEvent) => void;
    onError?: (event: Event) => void;
  }) {
    const connection = this.connections.get(url);
    if (!connection) return;

    // Remove specific listeners if provided
    if (listener) {
      if (listener.onMessage) connection.listeners.delete(listener.onMessage);
      if (listener.onOpen) connection.openListeners.delete(listener.onOpen);
      if (listener.onClose) connection.closeListeners.delete(listener.onClose);
      if (listener.onError) connection.errorListeners.delete(listener.onError);
    } else {
      // If no specific listener provided, remove all listeners (for complete disconnection)
      connection.listeners.clear();
      connection.openListeners.clear();
      connection.closeListeners.clear();
      connection.errorListeners.clear();
    }

    // If no more listeners, close the connection
    if (connection.listeners.size === 0 && 
        connection.openListeners.size === 0 && 
        connection.closeListeners.size === 0 && 
        connection.errorListeners.size === 0) {
      connection.socket.close(1000, 'No more listeners');
      this.connections.delete(url);
    }
  }

  send(url: string, message: any): boolean {
    const connection = this.connections.get(url);
    if (connection && connection.socket.readyState === WebSocket.OPEN) {
      connection.socket.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  getConnectionState(url: string): number | null {
    const connection = this.connections.get(url);
    return connection ? connection.socket.readyState : null;
  }
}

const useWebSocketSingleton = (
  url: string | null,
  options: UseWebSocketOptions = {}
): UseWebSocketReturn => {
  const {
    onOpen,
    onMessage,
    onClose,
    onError,
    reconnectInterval = 5000,
    maxReconnectAttempts = 10
  } = options;

  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [connectionState, setConnectionState] = useState<'CONNECTING' | 'OPEN' | 'CLOSING' | 'CLOSED'>('CLOSED');
  
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttemptsRef = useRef(0);
  const shouldReconnectRef = useRef(true);
  const listenersRef = useRef({ onOpen, onMessage, onClose, onError });
  
  // Update listeners ref when they change
  listenersRef.current = { onOpen, onMessage, onClose, onError };

  const manager = WebSocketManager.getInstance();

  const connect = useCallback(() => {
    if (!url) return;

    setConnectionState('CONNECTING');
    
    // Declare ws variable first, then initialize
    let ws: WebSocket | null = null;
    
    ws = manager.connect(url, {
      onOpen: (event) => {
        setConnectionState('OPEN');
        if (ws) setSocket(ws);
        reconnectAttemptsRef.current = 0;
        listenersRef.current.onOpen?.(event);
      },
      onMessage: (message) => {
        listenersRef.current.onMessage?.(message);
      },
      onClose: (event) => {
        setConnectionState('CLOSED');
        setSocket(null);
        listenersRef.current.onClose?.(event);

        // Attempt to reconnect if not manually closed
        if (shouldReconnectRef.current && 
            event.code !== 1000 && 
            reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          console.log(`Attempting to reconnect (${reconnectAttemptsRef.current}/${maxReconnectAttempts})...`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectInterval);
        }
      },
      onError: (event) => {
        listenersRef.current.onError?.(event);
      }
    });

    if (ws) setSocket(ws);
  }, [url, reconnectInterval, maxReconnectAttempts]);

  const sendMessage = useCallback((message: any) => {
    if (url && !manager.send(url, message)) {
      console.warn('WebSocket is not connected. Message not sent:', message);
    }
  }, [url]);

  const reconnect = useCallback(() => {
    shouldReconnectRef.current = true;
    reconnectAttemptsRef.current = 0;
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    connect();
  }, [connect]);

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    if (url) {
      manager.disconnect(url, listenersRef.current);
    }
    
    setSocket(null);
    setConnectionState('CLOSED');
  }, [url]);

  useEffect(() => {
    if (url) {
      shouldReconnectRef.current = true;
      connect();
    }

    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (url) {
        // Force complete cleanup of listeners for this component
        manager.disconnect(url, listenersRef.current);
      }
    };
  }, [url, connect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  const isConnected = connectionState === 'OPEN';

  return {
    socket,
    connectionState,
    sendMessage,
    reconnect,
    disconnect,
    isConnected
  };
};

export default useWebSocketSingleton;
