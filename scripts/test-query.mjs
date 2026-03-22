import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { signIn } from 'aws-amplify/auth';
import { readFileSync } from 'fs';

const outputs = JSON.parse(readFileSync('amplify_outputs.json', 'utf-8'));
Amplify.configure(outputs);

async function test() {
  // Sign in
  console.log('Signing in...');
  try {
    const result = await signIn({
      username: 'jiri.hylmar@gmail.com',
      password: 'HylMedia123!',
    });
    console.log('Sign in result:', result.isSignedIn);
  } catch (e) {
    console.log('Sign in error:', e.message);
  }

  // Query
  console.log('\nQuerying movies...');
  const client = generateClient();
  const result = await client.models.KnowledgeGraphItem
    .listKnowledgeGraphItemByEntityTypeAndName(
      { entityType: 'movie' },
      { limit: 5 },
    );

  console.log('Data count:', result.data?.length);
  console.log('Errors:', result.errors);
  console.log('First item null?', result.data?.[0] === null);
  console.log('First item name:', result.data?.[0]?.name);
  console.log('First 3 names:', result.data?.slice(0, 3)?.map(i => i?.name));
}

test().catch(e => console.error('Fatal:', e));
