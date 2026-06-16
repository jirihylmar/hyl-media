import { defineBackend } from '@aws-amplify/backend';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { metadataApi } from './functions/metadata-api/resource';
import { agent } from './functions/agent/resource';

const backend = defineBackend({
  auth,
  data,
  storage,
  metadataApi,
  agent,
});

// The CLI-created DC table (hyl-media-metadata-repository) is not an Amplify
// resource, so reference it by ARN (account 299, eu-central-1) when granting
// the Lambdas access.
const tableArn = 'arn:aws:dynamodb:eu-central-1:299025166536:table/hyl-media-metadata-repository';

// metadata-api: read + operator field edits + document-upload create (17.6c) on the DC table.
backend.metadataApi.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['dynamodb:GetItem', 'dynamodb:Query', 'dynamodb:Scan', 'dynamodb:UpdateItem', 'dynamodb:PutItem'],
    resources: [tableArn, `${tableArn}/index/*`],
  }),
);
// 17.6c — createDocumentMetadata writes the DC sidecar to S3 (the PDF is uploaded by the browser).
// The bucket name is the hardcoded constant in the handler (consistent with the agent/dc-emit).
backend.storage.resources.bucket.grantReadWrite(backend.metadataApi.resources.lambda);

// agent (Phase 21): read tools scan the DC table; the commit_plan executor
// (21.5+) writes records (Put) and enriches them (Update). The Anthropic key is
// read at runtime from Secrets Manager — grant GetSecretValue on that secret
// only (random 6-char suffix → wildcard). The S3 sidecars/descriptors are
// written to the Amplify storage bucket (granted via the storage construct).
backend.agent.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['dynamodb:GetItem', 'dynamodb:Query', 'dynamodb:Scan', 'dynamodb:PutItem', 'dynamodb:UpdateItem'],
    resources: [tableArn, `${tableArn}/index/*`],
  }),
);
backend.agent.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['secretsmanager:GetSecretValue'],
    resources: ['arn:aws:secretsmanager:eu-central-1:299025166536:secret:hyl-media/anthropic-api-key-*'],
  }),
);
backend.storage.resources.bucket.grantReadWrite(backend.agent.resources.lambda);
// Async transport (Phase 21.8): the dispatcher fire-and-forget invokes THIS
// function in worker mode. Grant invoke on the app's functions by name pattern
// (referencing the function's own ARN here would create a CDK circular dep).
backend.agent.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['lambda:InvokeFunction'],
    resources: ['arn:aws:lambda:eu-central-1:299025166536:function:amplify-d2r70lavusnzlx-*'],
  }),
);
