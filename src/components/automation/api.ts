/**
 * CRM 3.0 — Automations front-end API client.
 * Thin, typed wrappers around the automation REST endpoints.
 */

import type {
  AutomationRecord,
  ConfigField,
  ConditionFieldDef,
  TriggerDef,
  ActionDef,
  WorkflowStep,
} from '@/lib/automation/types';

export { }; // keep module

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as T & { error?: string; issues?: unknown }) : ({} as T);
  if (!res.ok) {
    const err = data as { error?: string };
    const error = new Error(err.error ?? `Request failed (${res.status})`);
    (error as Error & { status?: number; issues?: unknown }).status = res.status;
    (error as Error & { status?: number; issues?: unknown }).issues = (data as { issues?: unknown }).issues;
    throw error;
  }
  return data as T;
}

export interface AutomationStats {
  total: number;
  active: number;
  draft: number;
  paused: number;
  archived: number;
  error: number;
  executions: { total: number; completed: number; failed: number; running: number; waiting: number; successRate: number };
}

export interface BuilderMeta {
  triggers: TriggerDef[];
  actions: ActionDef[];
  condition_fields: ConditionFieldDef[];
  operators: { value: string; label: string; types: string[]; noValue?: boolean; listValue?: boolean }[];
  channels: ConfigField['options'];
  lead_statuses: ConfigField['options'];
  variables: { token: string; label: string; group: string }[];
  trigger_categories: Record<string, string>;
  agents: { value: string; label: string; role: string }[];
}

export interface ExecutionRow {
  id: string;
  status: string;
  trigger_type: string;
  contact_id: string | null;
  conversation_id: string | null;
  started_at: string;
  completed_at: string | null;
  current_step: number;
  total_steps: number;
  error_message: string | null;
  steps_log?: StepLogRow[];
}

export interface StepLogRow {
  step_type: string;
  status: 'completed' | 'failed' | 'skipped';
  detail: string;
  duration_ms: number;
  executed_at: string;
}

export interface TemplateRow {
  id: string;
  name: string;
  description: string;
  category: string;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  steps: WorkflowStep[];
  tags: string[];
  ai_nodes: unknown[];
}

export interface ValidationIssue { level: 'error' | 'warning'; step_index?: number; message: string }
export interface ValidationResult { valid: boolean; errors: ValidationIssue[]; warnings: ValidationIssue[] }

export interface TestResult {
  validation: ValidationResult;
  mode?: string;
  simulation?: { mode: string; status: string; steps_log: StepLogRow[]; note: string };
  error?: string;
}

export interface ContactOption { id: string; name: string | null; phone: string | null; email: string | null }

export async function searchContacts(search: string): Promise<ContactOption[]> {
  const qs = new URLSearchParams({ limit: '15' });
  if (search) qs.set('search', search);
  const res = await request<{ contacts: ContactOption[] }>(`/api/v3/contacts?${qs}`);
  return res.contacts ?? [];
}

export const AutomationApi = {
  list(params: Record<string, string | number | undefined>) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') qs.set(k, String(v)); });
    return request<{ automations: AutomationRecord[]; total: number; page: number; pageSize: number }>(`/api/v3/automations?${qs}`);
  },
  stats() {
    return request<AutomationStats>('/api/v3/automations/stats');
  },
  meta() {
    return request<BuilderMeta>('/api/v3/automations/meta');
  },
  templates() {
    return request<{ templates: TemplateRow[] }>('/api/v3/automations/templates');
  },
  get(id: string) {
    return request<{ automation: AutomationRecord; steps: WorkflowStep[]; executions: ExecutionRow[] }>(`/api/v3/automations/${id}`);
  },
  create(payload: Record<string, unknown>) {
    return request<{ automation: AutomationRecord; warnings?: ValidationIssue[] }>('/api/v3/automations', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  update(id: string, payload: Record<string, unknown>) {
    return request<{ automation: AutomationRecord }>(`/api/v3/automations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  remove(id: string) {
    return request<{ success: boolean }>(`/api/v3/automations/${id}`, { method: 'DELETE' });
  },
  duplicate(id: string) {
    return request<{ automation: AutomationRecord }>(`/api/v3/automations/${id}/duplicate`, { method: 'POST' });
  },
  test(id: string, payload: Record<string, unknown>) {
    return request<TestResult>(`/api/v3/automations/${id}/test`, { method: 'POST', body: JSON.stringify(payload) });
  },
  execute(id: string, payload: { contactId: string; dryRun?: boolean }) {
    return request<{ execution_id: string | null; status: string; simulated: boolean; steps_log: StepLogRow[]; error_message: string | null }>(
      `/api/v3/automations/${id}/execute`,
      { method: 'POST', body: JSON.stringify(payload) }
    );
  },
  executions(id: string, params: Record<string, string | number | undefined>) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') qs.set(k, String(v)); });
    return request<{ executions: ExecutionRow[]; total: number }>(`/api/v3/automations/${id}/executions?${qs}`);
  },
  executionDetail(id: string, executionId: string) {
    return request<{ execution: ExecutionRow }>(`/api/v3/automations/${id}/executions/${executionId}`);
  },
};
