export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

export interface Website {
  id: string;
  url: string;
  name: string | null;
  platform: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  userId: string;
}

export interface MonitoringCheck {
  id: string;
  websiteId: string;
  success: boolean;
  statusCode: number | null;
  responseTimeMs: number;
  checkedAt: string;
}

export type IncidentStatus = "OPEN" | "RESOLVED";

export interface Incident {
  id: string;
  websiteId: string;
  status: IncidentStatus;
  startedAt: string;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
