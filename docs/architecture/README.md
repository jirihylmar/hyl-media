# Architecture Documentation

## Diagram

![HYL Media Architecture](hyl_media_architecture.png)

## Components

| Component | Resource Name | Purpose |
|-----------|---------------|---------|
| Amplify App | `d2r70lavusnzlx` | Hosting, CI/CD from GitHub `main` |
| CloudFront | via Amplify Hosting | SPA delivery with custom rewrite rules |
| Cognito | `eu-central-1_GJhwO2ww5` | Email/password authentication |
| AppSync | `366ya64s65cqjhilw34nx5r2vu` | Auto-generated GraphQL CRUD API |
| DynamoDB | `KnowledgeGraphItem-g7elqzchivgt3g2i2zs6rfn64u-NONE` | Single-table: 905 items, 6 GSIs |

## S3 Buckets (all managed by Amplify stack)

| Bucket | Type | Contents |
|--------|------|----------|
| `...-hylmediastoragebucketefb-*` | User content | `library/` (307 books), `sheet-music/` (112 PDFs) |
| `...-amplifydataamplifycodege-*` | Amplify internal | CodeGen artifacts |
| `...-modelintrospectionschema-*` | Amplify internal | GraphQL schema introspection |

All 3 buckets are created and managed by the Amplify CloudFormation stack. Do not delete them manually.

## DynamoDB GSIs

| GSI | Purpose |
|-----|---------|
| byType | List entities by `entity_type` |
| byCastMovie | Find cast members for a movie |
| byPersonFilm | Find movies for a person |
| byRecording | Find recordings |
| byPerformer | Find performers for a recording |
| byLanguage | Filter by language |

## Regenerating

```bash
python3 docs/architecture/generate.py
```

Requirements:
- `pip3 install diagrams`
- `apt-get install graphviz`
