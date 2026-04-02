#!/usr/bin/env node
/**
 * Full CRUD test runner — runs all category tests sequentially.
 * Usage: node scripts/test-crud.mjs
 */
import { setup, cleanupTestItems, resetResults, getResults } from './test-helpers.mjs';
import { execSync } from 'child_process';

const TESTS = [
  { name: 'Movies', script: 'scripts/test-movies.mjs' },
  { name: 'Persons', script: 'scripts/test-persons.mjs' },
  { name: 'Bands + Recordings', script: 'scripts/test-bands-recordings.mjs' },
  { name: 'Books + Sheet Music', script: 'scripts/test-books-sheets.mjs' },
];

async function run() {
  console.log('========================================');
  console.log('  HYL Media — Full CRUD Test Suite');
  console.log('========================================\n');

  // Pre-cleanup: remove any orphaned test items from previous runs
  await setup();
  const preClean = await cleanupTestItems();
  if (preClean > 0) console.log(`Pre-cleanup: removed ${preClean} orphaned _test_ items\n`);

  const results = [];

  for (const test of TESTS) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Running: ${test.name}`);
    console.log('='.repeat(50) + '\n');

    try {
      execSync(`node ${test.script}`, { stdio: 'inherit', timeout: 60000 });
      results.push({ name: test.name, status: 'PASS' });
    } catch (e) {
      results.push({ name: test.name, status: 'FAIL', error: e.message });
    }
  }

  // Post-cleanup: safety net
  const postClean = await cleanupTestItems();
  if (postClean > 0) console.log(`\nPost-cleanup: removed ${postClean} orphaned _test_ items`);

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('  SUMMARY');
  console.log('='.repeat(50));
  for (const r of results) {
    const icon = r.status === 'PASS' ? 'OK' : 'XX';
    console.log(`  [${icon}] ${r.name}`);
  }

  const failed = results.filter(r => r.status === 'FAIL');
  console.log(`\nTotal: ${results.length} suites, ${results.length - failed.length} passed, ${failed.length} failed`);

  process.exit(failed.length > 0 ? 1 : 0);
}

run().catch(e => { console.error('FATAL:', e); process.exit(1); });
