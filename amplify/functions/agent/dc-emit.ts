/**
 * Conformant Dublin Core emit for the agent's write path (Phase 21.5).
 *
 * A faithful TypeScript port of the canonical pure emit logic the migration uses
 * (scripts/lib/build-dc-sidecar.mjs + dc-paths.mjs) — kept in-Lambda and typed
 * rather than importing the .mjs across the amplify/scripts boundary. Behaviour
 * is pinned by those modules' self-tests and re-checked end-to-end by
 * scripts/audit-dc-conformance.mjs after every write.
 *
 * Produces the S3 sidecar (6-key envelope with Attributes in exact DH 28-key
 * order, then hyl-media extensions) AND the metadata-repository DDB item shape
 * (PK/id/SK/Title/ContentType/Attributes + the CLI's ingest fields:
 * resource_account, top-level s3_key = sidecar key, s3_bucket, s3_size,
 * s3_last_modified, last_synced). The S3 sidecar is authoritative (CLAUDE.md
 * source-of-truth rule); both are written together.
 */
import { createHash } from 'node:crypto';

export const BUCKET = 'amplify-d2r70lavusnzlx-ma-hylmediastoragebucketefb-p0iq0m7stthq';
export const REGION = 'eu-central-1';
export const RESOURCE_ACCOUNT = 'hylm';

// --- ASCII fold + slug (ported from build-dc-sidecar.mjs convertToAscii / sortKeySlug) ---
const ASCII_FOLD_MAP: Record<string, string> = {
  á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ý: 'y',
  č: 'c', ď: 'd', ě: 'e', ň: 'n', ř: 'r', š: 's', ť: 't', ž: 'z',
  Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U', Ý: 'Y',
  Č: 'C', Ď: 'D', Ě: 'E', Ň: 'N', Ř: 'R', Š: 'S', Ť: 'T', Ž: 'Z',
};
export function convertToAscii(text: string): string {
  if (!text) return text;
  const mapped = text.replace(/[áéíóúýčďěňřšťžÁÉÍÓÚÝČĎĚŇŘŠŤŽ]/g, (c) => ASCII_FOLD_MAP[c] ?? c);
  return Array.from(mapped.normalize('NFD')).filter((c) => c.charCodeAt(0) < 128).join('');
}
export function sortKeySlug(title: string): string {
  if (!title) return '';
  return convertToAscii(title)
    .toLowerCase()
    .replace(/[\s.]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Deterministic UUIDv5-shaped id (idempotent create) — ported from derivedArtifactId. */
export function derivedId(...parts: string[]): string {
  const h = createHash('sha1').update(parts.join(':')).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** Per-kind DC typing: dc_type (DCMI), ContentType, S3 category. */
export interface KindSpec {
  dcType: string;
  contentType: string;
  category: 'datasets' | 'documents' | 'agents';
  entityKind: string;
}
// Phase 22 metadata-only model: every agent-created kind is VIRTUAL (no media file). ContentType
// is the honest entity kind (not DATASET); the row carries s3_key=null, dc_source_uri=null,
// _file_type=null, _virtual=true, and NO content descriptor object is written to S3.
const KIND_SPECS: Record<string, KindSpec> = {
  movie: { dcType: 'MovingImage', contentType: 'MOVIE', category: 'datasets', entityKind: 'movie' },
  recording: { dcType: 'Sound', contentType: 'RECORDING', category: 'datasets', entityKind: 'recording' },
  person: { dcType: 'Agent', contentType: 'PERSON', category: 'agents', entityKind: 'person' },
  band: { dcType: 'Agent', contentType: 'BAND', category: 'agents', entityKind: 'band' },
  collaboration: { dcType: 'Agent', contentType: 'COLLABORATION', category: 'agents', entityKind: 'collaboration' },
};
export function kindSpec(kind: string): KindSpec {
  const k = KIND_SPECS[kind];
  if (!k) throw new Error(`unsupported kind '${kind}' (agent create supports: ${Object.keys(KIND_SPECS).join(', ')})`);
  return k;
}

export interface EmitInput {
  kind: string;
  title: string;
  year?: string;
  language?: string;
  abstract?: string;
  subjects?: string[]; // → dc_subject
  tags?: string[]; // → _tags
  externalLinks?: { type: string; url: string }[];
  // agent fields
  givenName?: string;
  familyName?: string;
  roles?: string[];
  // relationship edges (set by 21.6; passed through here)
  creators?: string[]; // dc_creator
  contributors?: string[]; // dc_contributor
  castUris?: string[]; // _cast_uris
  performerUris?: string[]; // _performer_uris
  relations?: string[]; // dc_relation (reverse edges, e.g. an agent's filmography)
}

export interface EmittedRecord {
  id: string;
  contentKey: string;
  sidecarKey: string;
  logicalUri: string; // https form of contentKey — stable cross-link IDENTITY (uuid-parsed by
                      // consumers); NOT a fetchable object for virtual rows. Distinct from the
                      // row's own dc_source_uri, which is null when virtual.
  virtual: boolean;
  sidecar: any; // 6-key envelope, Attributes in DH order + extensions (S3-authoritative)
  ddbItem: any; // metadata-repository ingest shape
  descriptor: any; // null for virtual rows (Phase 22 metadata-only — no content object written)
}

/**
 * Build the conformant record (S3 sidecar + DDB item + descriptor). `id` is
 * derived from kind+title+year so re-creating the same resource is idempotent.
 */
export function buildRecord(input: EmitInput, now: string): EmittedRecord {
  const ks = kindSpec(input.kind);
  const title = input.title.trim();
  const id = derivedId(ks.entityKind, title, input.year || '');
  const language = input.language || 'auto';
  const slug = sortKeySlug(title) || id;
  const sk = `#${language}#${slug}`;
  const asciiTitle = convertToAscii(title);
  const filename = `${slug || id}.json`;
  const contentKey = `${ks.category}/${id}/${filename}`;
  const sidecarKey = `metadata/${contentKey}.metadata.json`;
  // Logical identity URI (uuid-parsed by consumers). The row itself is virtual, so its own
  // dc_source_uri is null; this value is used ONLY to seed cross-link references between rows.
  const logicalUri = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${contentKey}`;
  const links = input.externalLinks || [];
  const creators = input.creators || [];
  const contributors = input.contributors || [];

  // Attributes: the canonical DH 28 (in order) … then hyl-media extensions.
  const attributes: Record<string, unknown> = {
    _authors: ['hyl-media'],
    _category: ks.category,
    _created_at: now,
    _document_title: asciiTitle,
    _explicit_fields: [],
    _file_type: null,
    _last_updated_at: now,
    s3_bucket: BUCKET,
    s3_key: null,
    dc_source_uri: null,
    sort_key: sk,
    language_code: language,
    additional_languages: [],
    size_estimate: '',
    daytime_estimate: '',
    dc_title: title,
    dc_type: ks.dcType,
    dc_abstract: input.abstract || '',
    dc_subject: input.subjects || [],
    dc_rights_holder: null,
    dc_license: 'copyright',
    dc_accrual_method: 'creation',
    dc_source: null,
    dc_relation: input.relations && input.relations.length ? input.relations : null,
    dc_has_format: null,
    dc_is_format_of: null,
    dc_has_part: null,
    dc_is_part_of: null,
    // --- hyl-media extensions (after the canonical 28) ---
    _entity_kind: ks.entityKind,
    _legacy_id: id,
    _tags: input.tags || [],
    _external_links: links,
    dc_creator: creators.length ? creators : null,
    dc_contributor: contributors.length ? contributors : null,
    _virtual: true, // Phase 22: metadata-only resource, no content object
  };
  if (ks.category === 'agents') {
    attributes._given_name = input.givenName || '';
    attributes._family_name = input.familyName || '';
    attributes._roles = input.roles || [];
  } else {
    attributes._cast_uris = input.castUris || [];
    attributes._performer_uris = input.performerUris || [];
  }

  const sidecar = { id, SK: sk, DocumentId: id, Title: asciiTitle, ContentType: ks.contentType, Attributes: attributes };
  const sidecarJson = JSON.stringify(sidecar, null, 2);

  const ddbItem = {
    PK: id,
    ...sidecar, // id, SK, DocumentId, Title, ContentType, Attributes
    resource_account: RESOURCE_ACCOUNT,
    s3_key: sidecarKey, // top-level s3_key = the sidecar key (CLI ingest shape)
    s3_bucket: BUCKET,
    s3_size: Buffer.byteLength(sidecarJson, 'utf8'),
    s3_last_modified: now,
    last_synced: now,
  };

  // Phase 22: virtual resources are metadata-only — no content descriptor object is written.
  return { id, contentKey, sidecarKey, logicalUri, virtual: true, sidecar, ddbItem, descriptor: null };
}
