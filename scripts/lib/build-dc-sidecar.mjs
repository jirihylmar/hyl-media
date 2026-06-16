/**
 * Faithful port of the Digital Horizon canonical Dublin Core sidecar builder.
 * Source of truth: digital-horizon-playbook/digital-horizon-platform/amplify/functions/
 *                  recordings/_shared/metadata.ts  (buildDublinCoreSidecar + helpers).
 *
 * Pure functions only — no AWS/Anthropic deps — so any script can import it.
 * This module produces EXACTLY the DH 5 top-level + 28 Attributes keys, in DH order.
 * hyl-media extensions (_entity_kind, _tags, _external_links, …) are layered on top by
 * scripts/lib/entity-to-dc.mjs (task 15.5), NOT here, to keep this a pristine DH port.
 *
 * SK note: we port the TS `sortKeySlug` (the DH enricher / reference producer path), which
 * the metadata-repository CLI trusts verbatim (top-level `SK` wins on ingest). The CLI's
 * fallback `_normalize_for_sk` (models.py) differs ONLY on internal punctuation — e.g.
 * "(I've Had)…" → TS "ive-had-…" vs CLI "i-ve-had-…". Because we always emit an explicit SK,
 * the TS form is authoritative. See pyNormalizeForSk() below for the cross-check.
 */
import { createHash } from 'node:crypto';

// ASCII-fold mirroring metadata.ts convertToAscii: explicit Czech map, then NFD + drop >=128.
const ASCII_FOLD_MAP = {
  á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ý: 'y',
  č: 'c', ď: 'd', ě: 'e', ň: 'n', ř: 'r', š: 's', ť: 't', ž: 'z',
  Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U', Ý: 'Y',
  Č: 'C', Ď: 'D', Ě: 'E', Ň: 'N', Ř: 'R', Š: 'S', Ť: 'T', Ž: 'Z',
};

export function convertToAscii(text) {
  if (!text) return text;
  const mapped = text.replace(/[áéíóúýčďěňřšťžÁÉÍÓÚÝČĎĚŇŘŠŤŽ]/g, (c) => ASCII_FOLD_MAP[c] ?? c);
  return Array.from(mapped.normalize('NFD')).filter((c) => c.charCodeAt(0) < 128).join('');
}

// sort_key slug mirroring metadata.ts sortKeySlug.
export function sortKeySlug(title) {
  if (!title) return '';
  return convertToAscii(title)
    .toLowerCase()
    .replace(/[\s.]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Independent cross-check: JS reimplementation of the CLI's Python _normalize_for_sk
// (models.py). Used only by the self-test to document where the two algorithms agree/diverge.
export function pyNormalizeForSk(text) {
  if (!text) return '';
  const asciiOnly = text.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  return asciiOnly.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const CONTENT_TYPE_BY_EXT = {
  pdf: 'PDF', txt: 'TEXT', md: 'MARKDOWN', doc: 'WORD', docx: 'WORD',
  xls: 'EXCEL', xlsx: 'EXCEL', ppt: 'POWERPOINT', pptx: 'POWERPOINT',
  jpg: 'JPEG', jpeg: 'JPEG', png: 'PNG', gif: 'GIF', svg: 'SVG',
  mp3: 'MP3', wav: 'WAV', mp4: 'MP4', mov: 'MOV',
  json: 'JSON', csv: 'CSV', tsv: 'TSV', html: 'HTML',
};
export function contentTypeForExt(ext) {
  return CONTENT_TYPE_BY_EXT[String(ext).toLowerCase()] ?? String(ext).toUpperCase();
}

export function sizeEstimate(bytes) {
  if (bytes === undefined || bytes === null) return '';
  if (bytes < 10 * 1024 * 1024) return 'small file';
  if (bytes <= 100 * 1024 * 1024) return 'medium file';
  return 'big file';
}

export function dcSourceUriFor(bucket, region, s3Key) {
  return `https://${bucket}.s3.${region}.amazonaws.com/${s3Key}`;
}

// Deterministic UUIDv5-shaped id from parent id + role (idempotent re-runs). Faithful port.
export function derivedArtifactId(parentId, role) {
  const h = createHash('sha1').update(`${parentId}:${role}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export function normalizeExplicitFields(fields) {
  if (!fields || fields.length === 0) return [];
  return Array.from(new Set(fields)).sort();
}

export const NO_LINKS = Object.freeze({
  dc_source: null, dc_relation: null, dc_has_format: null,
  dc_is_format_of: null, dc_has_part: null, dc_is_part_of: null,
});

/**
 * Faithful port of buildDublinCoreSidecar. `spec` carries:
 *   { resourceId, contentType, dcType, category, s3Key, fileType, title? }
 * `enrichment` = { title, abstract, keywords }, `resource` = { s3Bucket, language, authors, license }.
 * Returns { id, SK, DocumentId, Title, ContentType, Attributes } with DH key order preserved.
 */
export function buildDublinCoreSidecar(spec, enrichment, resource, now, region, sizeBytes, links = NO_LINKS, explicitFields) {
  const effectiveTitle = (spec.title && spec.title.trim()) || enrichment.title;
  const languageCode = resource.language ?? 'auto';
  const slug = sortKeySlug(effectiveTitle) || spec.resourceId;
  const sk = `#${languageCode}#${slug}`;
  const asciiTitle = convertToAscii(effectiveTitle);
  // Virtual / metadata-only resources carry no content object (Phase 22): s3_key and
  // dc_source_uri are null. A real DH row always has spec.s3Key, so this is a no-op there.
  const dcSourceUri = spec.s3Key ? dcSourceUriFor(resource.s3Bucket, region, spec.s3Key) : null;
  return {
    id: spec.resourceId,
    SK: sk,
    DocumentId: spec.resourceId,
    Title: asciiTitle,
    ContentType: spec.contentType,
    Attributes: {
      _authors: resource.authors ?? ['hyl-media'],
      _category: spec.category,
      _created_at: now,
      _document_title: asciiTitle,
      _explicit_fields: normalizeExplicitFields(explicitFields),
      _file_type: spec.fileType,
      _last_updated_at: now,
      s3_bucket: resource.s3Bucket,
      s3_key: spec.s3Key ?? null,
      dc_source_uri: dcSourceUri,
      sort_key: sk,
      language_code: languageCode,
      additional_languages: [],
      size_estimate: sizeEstimate(sizeBytes),
      daytime_estimate: '',
      dc_title: effectiveTitle,
      dc_type: spec.dcType,
      dc_abstract: enrichment.abstract,
      dc_subject: enrichment.keywords,
      dc_rights_holder: (resource.authors ?? [])[0] ?? null,
      dc_license: resource.license ?? 'copyright',
      dc_accrual_method: 'creation',
      dc_source: links.dc_source,
      dc_relation: links.dc_relation,
      dc_has_format: links.dc_has_format,
      dc_is_format_of: links.dc_is_format_of,
      dc_has_part: links.dc_has_part,
      dc_is_part_of: links.dc_is_part_of,
    },
  };
}

/** metadata-repository DDB item: sidecar + PK=resourceId. Faithful port. */
export function buildMetadataRepoItem(spec, enrichment, resource, now, region, sizeBytes, links = NO_LINKS, explicitFields) {
  return { PK: spec.resourceId, ...buildDublinCoreSidecar(spec, enrichment, resource, now, region, sizeBytes, links, explicitFields) };
}

// Exact DH Attributes key order (metadata.ts lines 248-275) — used by the self-test.
export const DH_ATTRIBUTE_ORDER = [
  '_authors', '_category', '_created_at', '_document_title', '_explicit_fields', '_file_type',
  '_last_updated_at', 's3_bucket', 's3_key', 'dc_source_uri', 'sort_key', 'language_code',
  'additional_languages', 'size_estimate', 'daytime_estimate', 'dc_title', 'dc_type',
  'dc_abstract', 'dc_subject', 'dc_rights_holder', 'dc_license', 'dc_accrual_method',
  'dc_source', 'dc_relation', 'dc_has_format', 'dc_is_format_of', 'dc_has_part', 'dc_is_part_of',
];
export const DH_TOPLEVEL_ORDER = ['id', 'SK', 'DocumentId', 'Title', 'ContentType', 'Attributes'];

// --- self-test: `node scripts/lib/build-dc-sidecar.mjs --selftest` ---
if (process.argv[1] && process.argv[1].endsWith('build-dc-sidecar.mjs') && process.argv.includes('--selftest')) {
  let fail = 0;
  const check = (label, cond, detail = '') => { if (!cond) { fail++; console.log(`FAIL ${label} ${detail}`); } else console.log(`PASS ${label}`); };
  const eq = (label, got, want) => check(label, got === want, `\n       got:  ${got}\n       want: ${want}`);

  // 1. ASCII fold (Czech)
  eq('ascii: Tři sestry', convertToAscii('Tři sestry'), 'Tri sestry');
  eq('ascii: DIGITÁLNÍ záznam', convertToAscii('Audio záznam DIGITÁLNÍ'), 'Audio zaznam DIGITALNI');

  // 2. sortKeySlug matches the DH/CLI hyphenated form on a diacritic+date title
  eq('slug: audio zaznam date',
     sortKeySlug('Audio záznam - DIGITÁLNÍ HORIZONT BRAINMARKET Dopolední setkání 6.6.2025'),
     'audio-zaznam-digitalni-horizont-brainmarket-dopoledni-setkani-6-6-2025');

  // 3. Documented divergence on internal punctuation (apostrophe): TS strips, CLI hyphenates.
  eq('slug TS: apostrophe stripped', sortKeySlug("(I've Had) The Time of My Life"), 'ive-had-the-time-of-my-life');
  eq('slug CLI: apostrophe hyphenated', pyNormalizeForSk("(I've Had) The Time of My Life"), 'i-ve-had-the-time-of-my-life');
  check('divergence is expected & documented', sortKeySlug("(I've Had) The Time of My Life") !== pyNormalizeForSk("(I've Had) The Time of My Life"));
  // …but they AGREE on plain titles (the common case)
  eq('slug agree: plain title (TS)', sortKeySlug('Dirty Dancing'), 'dirty-dancing');
  eq('slug agree: plain title (CLI)', pyNormalizeForSk('Dirty Dancing'), 'dirty-dancing');

  // 4. derivedArtifactId is a deterministic UUIDv5-shaped id
  const id1 = derivedArtifactId('12-angry-men_v7jp', 'movie');
  eq('derivedArtifactId deterministic', derivedArtifactId('12-angry-men_v7jp', 'movie'), id1);
  check('derivedArtifactId uuid shape', /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id1), id1);

  // 5. Full sidecar: exact key set + order
  const sidecar = buildDublinCoreSidecar(
    { resourceId: id1, contentType: 'DATASET', dcType: 'MovingImage', category: 'datasets', s3Key: `datasets/${id1}/12-angry-men.json`, fileType: 'json' },
    { title: '12 Angry Men', abstract: '', keywords: ['drama'] },
    { s3Bucket: 'bucket-x', language: 'en', authors: [], license: undefined },
    '2026-06-14T00:00:00.000Z', 'eu-central-1', undefined,
  );
  const topKeys = Object.keys(sidecar);
  check('top-level keys exact & ordered', JSON.stringify(topKeys) === JSON.stringify(DH_TOPLEVEL_ORDER), JSON.stringify(topKeys));
  const attrKeys = Object.keys(sidecar.Attributes);
  check('Attributes keys exact & ordered (28, DH order)', JSON.stringify(attrKeys) === JSON.stringify(DH_ATTRIBUTE_ORDER), `\n       got: ${JSON.stringify(attrKeys)}`);
  eq('SK format', sidecar.SK, '#en#12-angry-men');
  eq('Title ASCII-folded', sidecar.Title, '12 Angry Men');
  eq('dc_license default', sidecar.Attributes.dc_license, 'copyright');
  eq('dc_accrual_method', sidecar.Attributes.dc_accrual_method, 'creation');
  eq('sort_key == SK', sidecar.Attributes.sort_key, sidecar.SK);
  eq('dc_source_uri', sidecar.Attributes.dc_source_uri, `https://bucket-x.s3.eu-central-1.amazonaws.com/datasets/${id1}/12-angry-men.json`);

  console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILURES`);
  process.exit(fail === 0 ? 0 : 1);
}
