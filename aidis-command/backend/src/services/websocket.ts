import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';

export interface WebSocketClient extends WebSocket {
  userId?: string;
  isAuthenticated?: boolean;
}

export interface TaskUpdate {
  type: 'task_update';
  data: {
    taskId: string;
    title: string;
    status: string;
    assigned_to?: string;
    project_id: string;
  };
}

// Extended task-related message types
export interface TaskCreated {
  type: 'task_created';
  data: { task: any };
}

export interface TaskUpdated {
  type: 'task_updated';
  data: { task: any };
}

export interface TaskDeleted {
  type: 'task_deleted';
  data: { taskId: string };
}

export interface TasksulkUpdated {
  type: 'tasks_bulk_updated';
  data: { tasks: any[] };
}

export interface TaskAssigned {
  type: 'task_assigned';
  data: { task: any; assigned_to: string };
}

export interface TaskStatusChanged {
  type: 'task_status_changed';
  data: { task: any; previous_status: string; note?: string };
}

export type WebSocketMessage = TaskUpdate |
  TaskCreated | TaskUpdated | TaskDeleted | TasksulkUpdated | TaskAssigned | TaskStatusChanged;

class WebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, WebSocketClient[]> = new Map();

  initialize(server: any) {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws',
      verifyClient: this.verifyClient.bind(this)
    });

    this.wss.on('connection', this.handleConnection.bind(this));
    console.log('WebSocket server initialized on /ws');
  }

  private verifyClient(info: { req: IncomingMessage }): boolean {
    try {
      const url = new URL(info.req.url!, `http://${info.req.headers.host}`);
      const token = url.searchParams.get('token');
      
      if (!token) {
        console.log('WebSocket connection rejected: No token provided');
        return false;
      }

      // Verify JWT token
      jwt.verify(token, process.env.AIDIS_JWT_SECRET || process.env.JWT_SECRET || 'aidis-secret-key-change-in-production');
      return true;
    } catch (error) {
      console.log('WebSocket connection rejected: Invalid token', error);
      return false;
    }
  }

  private handleConnection(ws: WebSocketClient, req: IncomingMessage) {
    try {
      const url = new URL(req.url!, `http://${req.headers.host}`);
      const token = url.searchParams.get('token');
      
      if (!token) {
        ws.close(1008, 'Token required');
        return;
      }

      // Verify and decode token
      const decoded = jwt.verify(token, process.env.AIDIS_JWT_SECRET || process.env.JWT_SECRET || 'aidis-secret-key-change-in-production') as any;
      ws.userId = decoded.userId;
      ws.isAuthenticated = true;

      // Add to clients map
      const userClients = this.clients.get(decoded.userId) || [];
      userClients.push(ws);
      this.clients.set(decoded.userId, userClients);

      console.log(`WebSocket client connected: ${decoded.userId}`);

      // Handle client messages
      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleClientMessage(ws, message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid message format'
          }));
        }
      });

      // Handle client disconnect
      ws.on('close', () => {
        this.removeClient(ws);
        console.log(`WebSocket client disconnected: ${decoded.userId}`);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.removeClient(ws);
      });

      // Send connection confirmation
      ws.send(JSON.stringify({
        type: 'connection_established',
        message: 'WebSocket connection established'
      }));

    } catch (error) {
      console.error('Error handling WebSocket connection:', error);
      ws.close(1008, 'Authentication failed');
    }
  }

  private handleClientMessage(ws: WebSocketClient, message: any) {
    switch (message.type) {
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
      
      case 'agent_heartbeat':
        // Legacy agent heartbeat - no longer supported
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Agent functionality has been removed'
        }));
        break;
      
      default:
        console.log('Unknown WebSocket message type:', message.type);
    }
  }

  private removeClient(ws: WebSocketClient) {
    if (!ws.userId) return;

    const userClients = this.clients.get(ws.userId);
    if (userClients) {
      const index = userClients.indexOf(ws);
      if (index !== -1) {
        userClients.splice(index, 1);
        if (userClients.length === 0) {
          this.clients.delete(ws.userId);
        } else {
          this.clients.set(ws.userId, userClients);
        }
      }
    }
  }

  // Broadcast message to all connected clients
  broadcastToAll(message: WebSocketMessage) {
    const messageStr = JSON.stringify(message);
    this.clients.forEach((clientList) => {
      clientList.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(messageStr);
        }
      });
    });
  }

  // Generic broadcast method for any message
  broadcast(message: any) {
    const messageStr = JSON.stringify(message);
    this.clients.forEach((clientList) => {
      clientList.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(messageStr);
        }
      });
    });
  }

  // Broadcast message to specific user
  broadcastToUser(userId: string, message: WebSocketMessage) {
    const clients = this.clients.get(userId);
    if (clients) {
      const messageStr = JSON.stringify(message);
      clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(messageStr);
        }
      });
    }
  }

  // Get connection statistics
  getStats() {
    const totalConnections = Array.from(this.clients.values()).reduce(
      (sum, clients) => sum + clients.length, 0
    );
    
    return {
      totalConnections,
      uniqueUsers: this.clients.size,
      connectedUsers: Array.from(this.clients.keys())
    };
  }

  // Clean up dead connections
  cleanup() {
    this.clients.forEach((clientList, userId) => {
      const activeClients = clientList.filter(client => client.readyState === WebSocket.OPEN);
      if (activeClients.length === 0) {
        this.clients.delete(userId);
      } else {
        this.clients.set(userId, activeClients);
      }
    });
  }
}

export const webSocketService = new WebSocketService();
