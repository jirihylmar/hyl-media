#!/usr/bin/env node
/**
 * Cleanup script — find and delete any orphaned _test_* items.
 * Usage: node scripts/test-cleanup.mjs
 */
import { setup, cleanupTestItems } from './test-helpers.mjs';

async function run() {
  await setup();
  console.log('Scanning for _test_* items across all entity types...\n');
  const count = await cleanupTestItems();
  if (count > 0) {
    console.log(`Cleaned up ${count} _test_ items.`);
  } else {
    console.log('No _test_ items found. Database is clean.');
  }
}

run().catch(e => { console.error('FATAL:', e); process.exit(1); });
