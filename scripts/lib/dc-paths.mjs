/**
 * S3 organization for the hyl-media → Digital Horizon metadata-repository.
 *
 * Mirrors the DH layout exactly (docs/metadata-repository-producers.md §Path 2):
 *   <bucket>/<category>/<uuid>/<filename>                        ← content artifact
 *   <bucket>/metadata/<category>/<uuid>/<filename>.metadata.json ← Dublin Core sidecar
 *   dc_source_uri = https://<bucket>.s3.<region>.amazonaws.com/<content-key>
 *
 * <category> ∈ { audio, datasets, documents, agents }. hyl-media uses:
 *   - documents : file-backed assets (book, sheet_music PDFs)
 *   - datasets  : JSON descriptors for non-file MEDIA resources (movie, recording)
 *   - agents    : JSON descriptors for agent entities (person, band, collaboration) — dc_type=Agent
 *
 * Pure module — no AWS calls. See docs/dc-metadata-mapping.md §4 and tasks/phase_15_*.md.
 */

// The hyl-media resource bucket (existing Amplify storage bucket; holds library/ + sheet-music/
// today, gains documents/ + datasets/ + metadata/ for the DC layout). Registered in the
// metadata-repository CLI under resource_account=hylm (task 15.6).
export const BUCKET = 'amplify-d2r70lavusnzlx-ma-hylmediastoragebucketefb-p0iq0m7stthq';
export const REGION = 'eu-central-1';
export const RESOURCE_ACCOUNT = 'hylm';

export const CATEGORIES = Object.freeze(['audio', 'datasets', 'documents', 'agents']);

// File-backed entity types live in documents/; agent entities (person/band/collaboration) live in
// agents/ (dc_type=Agent); other non-file MEDIA resources (movie/recording) are descriptors in datasets/.
const DOCUMENT_ENTITY_TYPES = new Set(['book', 'sheet_music']);
const AGENT_ENTITY_TYPES = new Set(['person', 'band', 'collaboration']);

export function categoryForEntityType(entityType) {
  if (DOCUMENT_ENTITY_TYPES.has(entityType)) return 'documents';
  if (AGENT_ENTITY_TYPES.has(entityType)) return 'agents';
  return 'datasets';
}

function assertCategory(category) {
  if (!CATEGORIES.includes(category)) {
    throw new Error(`invalid category '${category}' (expected one of ${CATEGORIES.join(', ')})`);
  }
}

/** Content object key: <category>/<uuid>/<filename> */
export function contentKey(category, uuid, filename) {
  assertCategory(category);
  if (!uuid || !filename) throw new Error('contentKey requires uuid and filename');
  return `${category}/${uuid}/${filename}`;
}

/** Dublin Core sidecar key: metadata/<category>/<uuid>/<filename>.metadata.json */
export function sidecarKey(category, uuid, filename) {
  return `metadata/${contentKey(category, uuid, filename)}.metadata.json`;
}

/** Public https form of a content key (→ dc_source_uri). */
export function dcSourceUri(contentObjectKey, bucket = BUCKET, region = REGION) {
  return `https://${bucket}.s3.${region}.amazonaws.com/${contentObjectKey}`;
}

/** s3:// form of a content key (→ _data_source_id, when needed by legacy consumers). */
export function s3Uri(contentObjectKey, bucket = BUCKET) {
  return `s3://${bucket}/${contentObjectKey}`;
}

// --- self-test: `node scripts/lib/dc-paths.mjs --selftest` ---
if (process.argv[1] && process.argv[1].endsWith('dc-paths.mjs') && process.argv.includes('--selftest')) {
  let fail = 0;
  const eq = (label, got, want) => {
    const ok = got === want;
    if (!ok) fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label}\n       got:  ${got}\n       want: ${want}`);
  };

  // Sample book (file-backed → documents)
  const bookUuid = '8b1f0a2c-1111-5aaa-bbbb-ccccdddd0001';
  const bookFile = '100+1 otázek a odpovědí o krevním tlaku by Eliška Sovová.pdf';
  eq('book category', categoryForEntityType('book'), 'documents');
  eq('book contentKey', contentKey('documents', bookUuid, bookFile),
     `documents/${bookUuid}/${bookFile}`);
  eq('book sidecarKey', sidecarKey('documents', bookUuid, bookFile),
     `metadata/documents/${bookUuid}/${bookFile}.metadata.json`);
  eq('book dc_source_uri', dcSourceUri(contentKey('documents', bookUuid, bookFile)),
     `https://${BUCKET}.s3.${REGION}.amazonaws.com/documents/${bookUuid}/${bookFile}`);

  // Sample movie (non-file → datasets, JSON descriptor)
  const movieUuid = '8b1f0a2c-2222-5aaa-bbbb-ccccdddd0002';
  const movieFile = '12-angry-men.json';
  eq('movie category', categoryForEntityType('movie'), 'datasets');
  eq('movie contentKey', contentKey('datasets', movieUuid, movieFile),
     `datasets/${movieUuid}/${movieFile}`);
  eq('movie sidecarKey', sidecarKey('datasets', movieUuid, movieFile),
     `metadata/datasets/${movieUuid}/${movieFile}.metadata.json`);

  // Agent entities → agents; recording (media descriptor) → datasets
  eq('person category', categoryForEntityType('person'), 'agents');
  eq('band category', categoryForEntityType('band'), 'agents');
  eq('collaboration category', categoryForEntityType('collaboration'), 'agents');
  eq('recording category', categoryForEntityType('recording'), 'datasets');
  eq('sheet_music category', categoryForEntityType('sheet_music'), 'documents');

  console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILURES`);
  process.exit(fail === 0 ? 0 : 1);
}
