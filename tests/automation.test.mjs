import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateConditions,
  evaluateRule,
  validateRule,
  summarizeRule,
} from '../src/lib/automation/conditions.ts';
import {
  interpolate,
  extractVariables,
  findUnknownVariables,
} from '../src/lib/automation/template.ts';

// ── Condition engine ────────────────────────────────────────
test('empty condition set always passes', () => {
  const { passed } = evaluateConditions({ match: 'all', rules: [] }, makeCtx());
  assert.equal(passed, true);
});

test('string equals is case-insensitive', () => {
  assert.equal(evaluateRule({ field: 'contact.source', operator: 'equals', value: 'WHATSAPP' }, 'whatsapp'), true);
  assert.equal(evaluateRule({ field: 'contact.source', operator: 'not_equals', value: 'web' }, 'whatsapp'), true);
});

test('contains works on string and array fields', () => {
  assert.equal(evaluateRule({ field: 'contact.name', operator: 'contains', value: 'jo' }, 'John'), true);
  assert.equal(evaluateRule({ field: 'contact.tags', operator: 'contains', value: 'vip' }, ['vip', 'lead']), true);
  assert.equal(evaluateRule({ field: 'contact.tags', operator: 'not_contains', value: 'vip' }, ['lead']), true);
});

test('numeric comparisons handle strings and reject junk', () => {
  assert.equal(evaluateRule({ field: 'contact.lead_score', operator: 'greater_than', value: 70 }, '85'), true);
  assert.equal(evaluateRule({ field: 'contact.lead_score', operator: 'less_than', value: 70 }, 85), false);
  assert.equal(evaluateRule({ field: 'contact.lead_score', operator: 'greater_than', value: 70 }, 'abc'), false);
});

test('in / not_in compare against a list', () => {
  assert.equal(evaluateRule({ field: 'contact.lead_status', operator: 'in', value: ['won', 'qualified'] }, 'qualified'), true);
  assert.equal(evaluateRule({ field: 'contact.lead_status', operator: 'not_in', value: ['won'], }, 'lost'), true);
});

test('is_set / is_not_set', () => {
  assert.equal(evaluateRule({ field: 'contact.email', operator: 'is_set' }, 'a@b.com'), true);
  assert.equal(evaluateRule({ field: 'contact.email', operator: 'is_set' }, '   '), false);
  assert.equal(evaluateRule({ field: 'contact.email', operator: 'is_not_set' }, ''), true);
});

test('match=all requires every rule, match=any requires one', () => {
  const ctx = makeCtx({ contact: { source: 'whatsapp', lead_score: 90 } });
  const rules = [
    { field: 'contact.source', operator: 'equals', value: 'whatsapp' },
    { field: 'contact.lead_score', operator: 'greater_than', value: 100 },
  ];
  assert.equal(evaluateConditions({ match: 'all', rules }, ctx).passed, false);
  assert.equal(evaluateConditions({ match: 'any', rules }, ctx).passed, true);
});

test('resolveFieldValue reads nested contact fields', () => {
  const ctx = makeCtx({ contact: { company: 'Acme' } });
  assert.equal(evaluateRule({ field: 'contact.company', operator: 'equals', value: 'acme' }, ctx.contact.company), true);
});

// ── Rule validation & summary ──────────────────────────────
test('validateRule rejects unknown fields and wrong operators', () => {
  assert.match(validateRule({ field: 'nope', operator: 'equals', value: 'x' }) ?? '', /Unknown condition/);
  assert.match(validateRule({ field: 'contact.email', operator: 'greater_than', value: 1 }) ?? '', /not valid/);
  assert.equal(validateRule({ field: 'contact.email', operator: 'equals', value: 'x' }), null);
});

test('validateRule requires a value unless operator is boolean', () => {
  assert.match(validateRule({ field: 'contact.email', operator: 'equals', value: '' }) ?? '', /value is required/);
  assert.equal(validateRule({ field: 'contact.email', operator: 'is_set' }), null);
});

test('summarizeRule produces a readable string', () => {
  const s = summarizeRule({ field: 'contact.lead_score', operator: 'greater_than', value: 70 });
  assert.match(s, /Lead score/);
  assert.match(s, /70/);
});

// ── Template interpolation ─────────────────────────────────
test('interpolate replaces known tokens', () => {
  const out = interpolate('Hi {{contact.name}} from {{account.name}}!', {
    contact: { name: 'Ada Lovelace' },
    account: { name: 'Acme' },
  });
  assert.equal(out, 'Hi Ada Lovelace from Acme!');
});

test('first_name token uses the first word', () => {
  assert.equal(interpolate('Hi {{contact.first_name}}', { contact: { name: 'Ada Lovelace' } }), 'Hi Ada');
});

test('unknown tokens resolve to empty string (no leakage)', () => {
  assert.equal(interpolate('Hi {{contact.secret}}', { contact: { name: 'Ada' } }), 'Hi ');
});

test('extractVariables dedupes and findUnknownVariables flags extras', () => {
  assert.deepEqual(extractVariables('{{contact.name}} {{contact.name}} {{bogus.thing}}').sort(), ['bogus.thing', 'contact.name']);
  assert.deepEqual(findUnknownVariables('{{contact.name}} {{bogus.thing}}'), ['bogus.thing']);
});

export function makeCtx(overrides = {}) {
  return {
    account_id: 'acct',
    contact_id: 'c1',
    conversation_id: null,
    trigger_type: 'contact_created',
    trigger_data: {},
    contact: null,
    conversation: null,
    deal: null,
    ...overrides,
  };
}
