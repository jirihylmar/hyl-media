import { Amplify } from 'aws-amplify';
import { signIn } from 'aws-amplify/auth';
import { post } from 'aws-amplify/api';
import { readFileSync } from 'fs';

const outputs = JSON.parse(readFileSync('amplify_outputs.json', 'utf-8'));
Amplify.configure(outputs);

async function test() {
  console.log('Signing in...');
  await signIn({ username: 'jiri.hylmar@gmail.com', password: 'HylMedia123!' });

  // Raw GraphQL query
  const query = `query {
    listKnowledgeGraphItemByEntityTypeAndName(entityType: "movie", limit: 2) {
      items {
        id
        entityType
        name
        language
      }
    }
  }`;

  console.log('\nRaw GraphQL query...');
  const response = await fetch(outputs.data.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // We need the auth token - get it from the current session
    },
    body: JSON.stringify({ query }),
  });

  // Actually, let's use the Amplify internals
  const { fetchAuthSession } = await import('aws-amplify/auth');
  const session = await fetchAuthSession();
  console.log('Has tokens:', !!session.tokens);

  const authResponse = await fetch(outputs.data.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': session.tokens.accessToken.toString(),
    },
    body: JSON.stringify({ query }),
  });

  const data = await authResponse.json();
  console.log('GraphQL response:', JSON.stringify(data, null, 2));
}

test().catch(e => console.error('Fatal:', e));
