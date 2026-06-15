import { defineBackend } from '@aws-amplify/backend';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { metadataApi } from './functions/metadata-api/resource';

const backend = defineBackend({
  auth,
  data,
  storage,
  metadataApi,
});

// Grant the metadata-api function read access to the CLI-created DC table
// (hyl-media-metadata-repository) and its resource-account-index GSI. The table
// is not an Amplify resource, so reference it by ARN (account 299, eu-central-1).
const tableArn = 'arn:aws:dynamodb:eu-central-1:299025166536:table/hyl-media-metadata-repository';
backend.metadataApi.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['dynamodb:GetItem', 'dynamodb:Query', 'dynamodb:Scan'],
    resources: [tableArn, `${tableArn}/index/*`],
  }),
);
