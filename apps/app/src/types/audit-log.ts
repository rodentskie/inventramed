export type AuditAction = 'created' | 'updated' | 'deleted';

export interface AuditLogActor {
  id: string;
  username: string;
}

export interface AuditLogChanges {
  before: unknown;
  after: unknown;
}

export interface AuditLog {
  id: string;
  entityType: string;
  entityId: string;
  action: AuditAction;
  changes: AuditLogChanges | null;
  actor: AuditLogActor | null;
  createdAt: string;
}

export interface AuditLogList {
  items: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
}
