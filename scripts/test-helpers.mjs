/**
 * Shared test helpers for CRUD integration tests.
 * Configures Amplify, signs in, provides assert/CRUD/cleanup utilities.
 */
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { signIn } from 'aws-amplify/auth';
import { readFileSync } from 'fs';

// --- Setup ---
const outputs = JSON.parse(readFileSync('amplify_outputs.json', 'utf-8'));
Amplify.configure(outputs);

let _client = null;
function getClient() {
  if (!_client) _client = generateClient();
  return _client;
}

export async function setup() {
  console.log('Signing in...');
  const result = await signIn({
    username: 'jiri.hylmar@gmail.com',
    password: 'HylMedia123!',
  });
  if (!result.isSignedIn) throw new Error('Sign-in failed');
  console.log('Authenticated.\n');
}

// --- CRUD ---
export async function createItem(fields) {
  const result = await getClient().models.KnowledgeGraphItem.create(fields);
  if (result.errors?.length) throw new Error(`Create failed: ${result.errors[0].message}`);
  return result.data;
}

export async function getItem(id, entityType) {
  const result = await getClient().models.KnowledgeGraphItem.get({ id, entityType });
  if (result.errors?.length) throw new Error(`Get failed: ${result.errors[0].message}`);
  return result.data;
}

export async function updateItem(id, entityType, fields) {
  const result = await getClient().models.KnowledgeGraphItem.update({
    id,
    entityType,
    ...fields,
    updatedAt: new Date().toISOString(),
    updatedBy: 'test-runner',
  });
  if (result.errors?.length) throw new Error(`Update failed: ${result.errors[0].message}`);
  // Re-fetch to get full item (Amplify update may not return array fields)
  const full = await getClient().models.KnowledgeGraphItem.get({ id, entityType });
  return full.data;
}

export async function deleteItem(id, entityType) {
  const result = await getClient().models.KnowledgeGraphItem.delete({ id, entityType });
  if (result.errors?.length) throw new Error(`Delete failed: ${result.errors[0].message}`);
  return result.data;
}

export async function listByType(entityType) {
  const result = await getClient().models.KnowledgeGraphItem
    .listKnowledgeGraphItemByEntityTypeAndName({ entityType }, { limit: 1000 });
  return (result.data || []).filter(Boolean);
}

// --- Assertions ---
let _passed = 0;
let _failed = 0;
let _errors = [];

export function assert(condition, message) {
  if (condition) {
    console.log(`  PASS: ${message}`);
    _passed++;
  } else {
    console.log(`  FAIL: ${message}`);
    _failed++;
    _errors.push(message);
  }
}

export function assertEqual(actual, expected, message) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (pass) {
    console.log(`  PASS: ${message}`);
    _passed++;
  } else {
    console.log(`  FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    _failed++;
    _errors.push(message);
  }
}

export function assertIncludes(arr, item, message) {
  const pass = Array.isArray(arr) && arr.includes(item);
  assert(pass, message);
}

export function getResults() {
  return { passed: _passed, failed: _failed, errors: _errors };
}

export function resetResults() {
  _passed = 0;
  _failed = 0;
  _errors = [];
}

export function reportResults(label) {
  console.log(`\n--- ${label} ---`);
  console.log(`Passed: ${_passed}  Failed: ${_failed}`);
  if (_failed > 0) {
    console.log('Failures:');
    for (const e of _errors) console.log(`  - ${e}`);
  }
  console.log('');
  return _failed === 0;
}

// --- Cleanup ---
export async function cleanupTestItems() {
  const types = ['movie', 'person', 'band', 'recording', 'book', 'sheet_music',
    'movie_cast', 'recording_performer', 'sheet_music_performer', 'collaboration'];
  let total = 0;
  for (const t of types) {
    const items = await listByType(t);
    const testItems = items.filter(i => i.name?.startsWith('_test_') || i.id?.startsWith('_test_'));
    for (const item of testItems) {
      await deleteItem(item.id, t);
      total++;
    }
  }
  return total;
}
