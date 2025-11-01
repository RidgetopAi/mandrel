export type AidisEntity = 'contexts' | 'tasks' | 'decisions' | 'projects' | 'sessions';

export interface AidisDbEvent {
  entity: AidisEntity;
  operation: 'insert' | 'update' | 'delete';
  id?: string;
  projectId?: string;
  timestamp: string;
}
