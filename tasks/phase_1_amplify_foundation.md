---
phase: 1
name: Amplify Foundation
status: pending
prerequisites: []
output:
  - Amplify Gen 2 project initialized
  - Data model defined with all entity types and GSIs
  - Auth and storage configured
  - First deployment successful
---

# Phase 1: Amplify Foundation

## Context Recovery
Before starting, read these files:
1. `CLAUDE.md` - Working instructions
2. `IMPLEMENTATION_PLAN.md` - Technical specification (sections 2-3)
3. `progress.json` - Current task state
4. `input/dynamo_implementation/WORKER_INSTRUCTIONS.md` - DynamoDB schema and Amplify data model

## Overview
Initialize the Amplify Gen 2 project with React + TypeScript, define the data model (DynamoDB single-table with 6 GSIs), configure Cognito auth and S3 storage, and deploy to verify everything works.

---

## Task 1.1: Initialize Amplify Gen 2 Project

**Goal**: Create a new Amplify Gen 2 app with React + TypeScript.

**Steps**:
1. Initialize React + TypeScript project in repo root:
   ```bash
   npm create amplify@latest
   ```
   Or manually: create React app, then `npx ampx init`
2. Verify project structure has `amplify/` directory
3. Install Amplify UI library:
   ```bash
   npm install @aws-amplify/ui-react
   ```
4. Verify local dev server starts: `npm run dev`

**Verification**:
- [ ] `amplify/` directory exists with backend definitions
- [ ] `package.json` has Amplify dependencies
- [ ] `npm run dev` starts without errors

---

## Task 1.2: Define Data Model

**Goal**: Create the KnowledgeGraphItem model with all fields and 6 GSIs.

**Steps**:
1. Edit `amplify/data/resource.ts` with the schema from IMPLEMENTATION_PLAN.md section 3
2. Include all entity fields: id, entityType, name, language, givenName, familyName, roles, role, movieId, movieName, personId, personName, recordingId, recordingName, performerId, performerName, performerType, author, format, s3Key, artistName, sheetMusicId, updatedAt, updatedBy
3. Define composite identifier: `['id', 'entityType']`
4. Define 6 GSIs: byType, byCastMovie, byPersonFilm, byRecording, byPerformer, byLanguage
5. Set authorization: `allow.authenticated()`

**Verification**:
- [ ] `amplify/data/resource.ts` contains complete schema
- [ ] All 6 GSIs defined
- [ ] `npx ampx sandbox` starts without schema errors (or `npx ampx generate outputs`)

---

## Task 1.3: Configure Auth

**Goal**: Set up Cognito authentication.

**Steps**:
1. Edit `amplify/auth/resource.ts`:
   - Email-based login
   - Self-signup enabled (personal project)
2. Wire auth into `amplify/backend.ts`

**Verification**:
- [ ] `amplify/auth/resource.ts` exists with config
- [ ] Auth referenced in `amplify/backend.ts`

---

## Task 1.4: Configure Storage

**Goal**: Set up S3 bucket for books and sheet music.

**Steps**:
1. Edit `amplify/storage/resource.ts`:
   - Define storage with path-based access
   - Paths: `library/*` and `sheet-music/*`
   - Access: authenticated users can read/write
2. Wire storage into `amplify/backend.ts`

**Verification**:
- [ ] `amplify/storage/resource.ts` exists with config
- [ ] Storage referenced in `amplify/backend.ts`

---

## Task 1.5: First Deployment

**Goal**: Deploy to AWS and verify all resources created.

**Steps**:
1. Verify AWS credentials: `aws sts get-caller-identity` (must be account 299)
2. Deploy: `npx ampx sandbox` (for dev) or `npx ampx deploy`
3. Verify resources created:
   - DynamoDB table with 6 GSIs
   - Cognito User Pool
   - S3 bucket
   - AppSync API
4. Note down resource names/ARNs

**Verification**:
- [ ] Deployment succeeds without errors
- [ ] DynamoDB table exists with correct schema
- [ ] Cognito User Pool exists
- [ ] S3 bucket exists
- [ ] AppSync API endpoint accessible
- [ ] Frontend loads and shows login screen

---

## Phase Completion Checklist
- [ ] All tasks 1.1-1.5 completed
- [ ] All artifacts documented in progress.json
- [ ] Session notes updated
- [ ] Git committed
- [ ] Ready for Phase 2 (Data Import)
