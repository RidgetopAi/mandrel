/**
 * Spindles WebSocket Service
 *
 * Connects to spindles-proxy WebSocket for real-time Claude activity streaming.
 * Provides thinking blocks, tool calls, tool results, and text output.
 */

import { create } from "zustand";

// Activity types from spindles-proxy
export interface ThinkingActivity {
  type: "thinking";
  content: string;
  timestamp: string;
}

export interface ToolCallActivity {
  type: "tool_call";
  toolName: string;
  toolId: string;
  input: unknown;
  timestamp: string;
}

export interface ToolResultActivity {
  type: "tool_result";
  toolId: string;
  content: unknown;
  isError: boolean;
  timestamp: string;
}

export interface TextActivity {
  type: "text";
  content: string;
  timestamp: string;
}

export interface ErrorActivity {
  type: "error";
  message: string;
  timestamp: string;
}

export type ActivityMessage =
  | ThinkingActivity
  | ToolCallActivity
  | ToolResultActivity
  | TextActivity
  | ErrorActivity;

// Store for activity state
interface SpindlesState {
  activities: ActivityMessage[];
  isConnected: boolean;
  error: string | null;
  addActivity: (activity: ActivityMessage) => void;
  clearActivities: () => void;
  setConnected: (connected: boolean) => void;
  setError: (error: string | null) => void;
  addRawOutput: (chunk: string) => void;
}

export const useSpindlesStore = create<SpindlesState>((set) => ({
  activities: [],
  isConnected: false,
  error: null,
  addActivity: (activity) =>
    set((state) => ({
      activities: [...state.activities, activity].slice(-200), // Keep last 200
    })),
  clearActivities: () => set({ activities: [] }),
  setConnected: (isConnected) => set({ isConnected }),
  setError: (error) => set({ error }),
  addRawOutput: (chunk) => {
    // Parse chunk and create activity message
    const activity: TextActivity = {
      type: "text",
      content: chunk,
      timestamp: new Date().toISOString(),
    };
    set((state) => ({
      activities: [...state.activities, activity].slice(-200),
    }));
  },
}));

// Expose store on window for SSE service
if (typeof window  !== "undefined") {
  (window as unknown as Record<string, unknown>).spindlesStore = useSpindlesStore;
}

/**
 * Singleton WebSocket connection manager
 */
class SpindlesWSService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private debug = true;

  private log(message: string, ...args: unknown[]) {
    if (this.debug) {
      console.log(`[SpindlesWS] ${message}`, ...args);
    }
  }

  /**
   * Connect to spindles WebSocket
   */
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.log("Already connected");
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/spindles`;

    this.log("Connecting to", url);

    try {
      this.ws = new WebSocket(url);
      const store = useSpindlesStore.getState();

      this.ws.onopen = () => {
        this.log("Connected");
        this.reconnectAttempts = 0;
        store.setConnected(true);
        store.setError(null);
      };

      this.ws.onclose = (event) => {
        this.log("Disconnected", event.code, event.reason);
        store.setConnected(false);
        this.handleReconnect();
      };

      this.ws.onerror = (event) => {
        this.log("Error", event);
        store.setError("WebSocket connection error");
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          // Skip connection ack
          if (message.type === "connection_ack") {
            this.log("Connection acknowledged");
            return;
          }

          // Add activity to store
          store.addActivity(message as ActivityMessage);
          this.log("Activity:", message.type);
        } catch (err) {
          this.log("Failed to parse message:", err);
        }
      };
    } catch (err) {
      this.log("Failed to create WebSocket:", err);
      useSpindlesStore.getState().setError(`Failed to connect: ${err}`);
    }
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    if (this.ws) {
      this.log("Disconnecting");
      this.ws.close(1000, "Client disconnect");
      this.ws = null;
      useSpindlesStore.getState().setConnected(false);
    }
  }

  /**
   * Handle reconnection with exponential backoff
   */
  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.log("Max reconnect attempts reached");
      useSpindlesStore.getState().setError("Connection lost - max retries exceeded");
      return;
    }

    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    this.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    setTimeout(() => this.connect(), delay);
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Export singleton
export const spindlesWS = new SpindlesWSService();

// Expose for debugging
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).spindlesWS = spindlesWS;
}
