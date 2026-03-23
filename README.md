# HYL Media

Personal media catalog — movies, music, books, sheet music.

## Live App

**URL**: https://main.d2r70lavusnzlx.amplifyapp.com

**Test Account**:
- Email: `jiri.hylmar@gmail.com`
- Password: `HylMedia123!`

## Architecture

![HYL Media Architecture](docs/architecture/hyl_media_architecture.png)

## Stack

- **Frontend**: React + TypeScript + Vite + Amplify UI
- **Backend**: Amplify Gen 2 (AppSync GraphQL + DynamoDB + Cognito + S3)
- **Hosting**: Amplify Hosting (auto-deploy from GitHub `main`)
- **Region**: eu-central-1

## Data

| Entity Type | Count |
|-------------|-------|
| Movies | 94 |
| Persons | 231 |
| Bands | 33 |
| Artists | 3 |
| Collaborations | 8 |
| Recordings | 94 |
| Books | 306 |
| Sheet Music | 112 |

## Development

```bash
# Install
npm install

# Generate Amplify outputs (requires AWS profile JiHy__vsb__299)
AWS_REGION=eu-central-1 npx ampx generate outputs --app-id d2r70lavusnzlx --branch main --profile JiHy__vsb__299

# Run locally
npm run dev
```
