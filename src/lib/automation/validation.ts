/**
 * CRM 3.0 — Workflow validation.
 * Runs on both the client (immediate feedback) and the server (authoritative).
 */

import type { WorkflowStep, WorkflowValidationResult, WorkflowValidationIssue } from './types';
import { getTrigger, getAction } from './catalog';
import { validateRule } from './conditions';

export interface WorkflowInput {
  name?: string;
  trigger_type?: string;
  trigger_config?: Record<string, unknown>;
  steps?: WorkflowStep[];
}

function isBlank(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

const BLOCKED_HOSTS = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^\[?::1\]?$/,
  /\.local$/i,
  /^metadata\./i,
];

/** Basic SSRF guard: reject non-http(s) and private / loopback destinations. */
export function isSafeWebhookUrl(url: string): { ok: boolean; reason?: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: 'Invalid URL' };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, reason: 'Only http(s) URLs are allowed' };
  }
  const host = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTS.some((re) => re.test(host))) {
    return { ok: false, reason: 'Private, loopback and link-local addresses are not allowed' };
  }
  return { ok: true };
}

export function validateWorkflow(input: WorkflowInput): WorkflowValidationResult {
  const errors: WorkflowValidationIssue[] = [];
  const warnings: WorkflowValidationIssue[] = [];

  if (isBlank(input.name)) {
    errors.push({ level: 'error', field: 'name', message: 'Automation name is required.' });
  }

  const trigger = input.trigger_type ? getTrigger(input.trigger_type) : undefined;
  if (!trigger) {
    errors.push({ level: 'error', field: 'trigger_type', message: 'A valid trigger is required.' });
  } else {
    if (!trigger.available) {
      errors.push({ level: 'error', field: 'trigger_type', message: `The "${trigger.label}" trigger is not available yet.` });
    }
    const cfg = input.trigger_config ?? {};
    for (const f of trigger.fields) {
      if (f.required && isBlank(cfg[f.key])) {
        errors.push({ level: 'error', field: `trigger_config.${f.key}`, message: `${f.label} is required for this trigger.` });
      }
    }
  }

  const steps = (input.steps ?? []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const actionSteps = steps.filter((s) => s.step_type !== 'condition');

  if (steps.length === 0) {
    errors.push({ level: 'error', message: 'Add at least one step to the workflow.' });
  }
  if (actionSteps.length === 0) {
    errors.push({ level: 'error', message: 'Add at least one action step.' });
  }

  let endCount = 0;

  steps.forEach((step, index) => {
    const label = `Step ${index + 1}`;

    if (step.step_type === 'condition') {
      const cfg = (step.config ?? {}) as { rules?: unknown[]; match?: string };
      const rules = Array.isArray(cfg.rules) ? cfg.rules : [];
      if (rules.length === 0) {
        errors.push({ level: 'error', step_index: index, message: `${label}: add at least one condition rule.` });
      }
      rules.forEach((r, ri) => {
        const err = validateRule(r as never);
        if (err) errors.push({ level: 'error', step_index: index, message: `${label} rule ${ri + 1}: ${err}` });
      });
      if (cfg.match && cfg.match !== 'all' && cfg.match !== 'any') {
        errors.push({ level: 'error', step_index: index, message: `${label}: invalid match mode.` });
      }
      return;
    }

    const action = getAction(step.step_type);
    if (!action) {
      errors.push({ level: 'error', step_index: index, message: `${label}: unknown action "${step.step_type}".` });
      return;
    }

    const cfg = (step.config ?? {}) as Record<string, unknown>;
    for (const f of action.fields) {
      if (f.required && isBlank(cfg[f.key])) {
        errors.push({ level: 'error', step_index: index, message: `${label} (${action.label}): ${f.label} is required.` });
      }
    }

    if (step.step_type === 'send_list' && cfg.channel && cfg.channel !== 'whatsapp') {
      warnings.push({ level: 'warning', step_index: index, message: `${label}: interactive lists are only supported on WhatsApp.` });
    }

    if (step.step_type === 'webhook' && typeof cfg.url === 'string' && cfg.url.trim() !== '') {
      const safe = isSafeWebhookUrl(cfg.url);
      if (!safe.ok) {
        errors.push({ level: 'error', step_index: index, message: `${label}: ${safe.reason}.` });
      }
    }

    if (step.step_type === 'end_workflow') {
      endCount++;
      if (index !== steps.length - 1) {
        warnings.push({ level: 'warning', step_index: index, message: `${label}: steps after an "End workflow" step will never run.` });
      }
    }
  });

  if (endCount > 1) {
    warnings.push({ level: 'warning', message: 'Multiple "End workflow" steps found.' });
  }

  return { valid: errors.length === 0, errors, warnings };
}
