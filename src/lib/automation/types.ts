/**
 * CRM 3.0 — Automation domain types
 * Shared between the server engine, API routes and the client builder.
 * Type-only module (no runtime exports) so it is safe to import anywhere.
 */

export type TriggerCategory =
  | 'contact'
  | 'lead'
  | 'conversation'
  | 'sales'
  | 'time'
  | 'integration';

export type TriggerKind = 'event' | 'scheduled';

export interface TriggerDef {
  type: string;
  label: string;
  description: string;
  category: TriggerCategory;
  kind: TriggerKind;
  /** Whether the platform currently emits / detects this event. */
  available: boolean;
  fields: ConfigField[];
}

export type ActionType =
  | 'send_message'
  | 'send_welcome_message'
  | 'send_list'
  | 'add_tag'
  | 'remove_tag'
  | 'assign_contact'
  | 'update_lead_status'
  | 'create_follow_up'
  | 'add_note'
  | 'wait'
  | 'webhook'
  | 'end_workflow';

export interface ActionDef {
  type: ActionType;
  label: string;
  description: string;
  color: string;
  icon: string;
  /** Action steps that need a contact context to run. */
  needsContact: boolean;
  fields: ConfigField[];
}

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'boolean'
  | 'tags'
  | 'datetime'
  | 'channel';

export interface ConfigField {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  help?: string;
  options?: { value: string; label: string }[];
  defaultValue?: string | number | boolean;
  min?: number;
  max?: number;
}

export interface ConditionFieldDef {
  key: string;
  label: string;
  group: string;
  type: 'text' | 'number' | 'select' | 'boolean' | 'tags' | 'datetime';
  options?: { value: string; label: string }[];
}

export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'greater_than'
  | 'less_than'
  | 'greater_or_equal'
  | 'less_or_equal'
  | 'in'
  | 'not_in'
  | 'is_set'
  | 'is_not_set'
  | 'before'
  | 'after'
  | 'within_days';

export interface ConditionRule {
  field: string;
  operator: ConditionOperator;
  value?: string | number | boolean | string[];
}

export interface ConditionConfig {
  match: 'all' | 'any';
  rules: ConditionRule[];
}

export interface WorkflowStep {
  id?: string;
  step_type: string;
  position: number;
  config: Record<string, unknown>;
  parent_step_id?: string | null;
  branch?: string | null;
}

export interface AutomationRecord {
  id: string;
  account_id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  is_active: boolean;
  status: string;
  ai_enabled: boolean;
  execution_count: number;
  success_count: number;
  failure_count: number;
  last_run_at: string | null;
  last_error: string | null;
  next_run_at?: string | null;
  workflow_version?: number;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExecutionContext {
  account_id: string;
  contact_id: string | null;
  conversation_id: string | null;
  trigger_type: string;
  trigger_data: Record<string, unknown>;
  /** Contact row fields for condition/interpolation. */
  contact?: Record<string, unknown> | null;
  conversation?: Record<string, unknown> | null;
  deal?: Record<string, unknown> | null;
  message?: Record<string, unknown> | null;
}

export interface StepLog {
  step_type: string;
  status: 'completed' | 'failed' | 'skipped';
  detail: string;
  duration_ms: number;
  executed_at: string;
}

export interface WorkflowValidationIssue {
  level: 'error' | 'warning';
  step_index?: number;
  field?: string;
  message: string;
}

export interface WorkflowValidationResult {
  valid: boolean;
  errors: WorkflowValidationIssue[];
  warnings: WorkflowValidationIssue[];
}
