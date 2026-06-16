/**
 * Pure types + mappers for Dublin Core records from hyl-media-metadata-repository.
 * No Amplify/browser imports — node-testable. The AppSync calls live in dcClient.ts.
 */

export type ExternalLink = { url: string; type: string };

export type DcAttributes = {
  dc_title: string;
  dc_type: string;
  dc_abstract: string;
  dc_subject: string[];
  dc_creator?: string[] | null;
  dc_contributor?: string[] | null;
  dc_rights_holder?: string | null;
  dc_license: string;
  dc_source_uri: string | null;
  s3_key?: string | null;
  language_code: string;
  _category: string;
  _entity_kind: string;
  _legacy_id: string;
  _tags?: string[];
  _external_links?: ExternalLink[];
  _given_name?: string;
  _family_name?: string;
  _roles?: string[];
  _performer_uris?: string[];
  _cast_uris?: string[];
  dc_relation?: string[] | null;
  dc_has_part?: string[] | null;
  dc_is_part_of?: string | null;
  _file_missing?: boolean; // legacy marker (pre-Phase-22); superseded by _virtual
  _virtual?: boolean;      // Phase 22: metadata-only resource, no content object
};

export type DcRecord = {
  PK: string;
  SK: string;
  id: string;
  Title: string;
  ContentType: string;
  s3_key?: string | null; // top-level: the sidecar's own S3 key (metadata/…metadata.json)
  Attributes: DcAttributes;
};

export type DcViewModel = {
  id: string;            // PK (uuid)
  legacyId: string;      // original KnowledgeGraphItem id
  entityKind: string;    // movie | recording | person | band | collaboration | book | sheet_music
  name: string;          // dc_title (full Unicode)
  language: string | null;
  dcType: string;        // DCMI type
  abstract: string;
  tags: string[];
  subjects: string[];
  creators: string[];
  contributors: string[];
  externalLinks: ExternalLink[];
  givenName: string | null;
  familyName: string | null;
  roles: string[];
  sourceUri: string | null;  // the artifact URI (real PDF for documents; null for virtual rows)
  s3Key: string;         // Attributes.s3_key — the content object key (for Storage.getUrl); '' if virtual
  sidecarKey: string;    // the DC sidecar's own S3 key (metadata/…metadata.json) — always present
  category: string;      // documents | datasets
  fileBacked: boolean;   // true → sourceUri is a real PDF to open/download
  // relationship URIs (resolve to records via pkFromUri + getMetadata)
  relationUris: string[];
  hasPartUris: string[];
  isPartOfUri: string | null;
  performerUris: string[];
  castUris: string[];
};

const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);

/** Extract the PK (uuid) from a dc_source_uri / relationship URI.
 *  URI form: https://<bucket>.s3.<region>.amazonaws.com/<category>/<uuid>/<file> */
export function pkFromUri(uri: string | null | undefined): string | null {
  if (!uri) return null;
  try {
    const path = new URL(uri).pathname.replace(/^\/+/, '');
    const parts = path.split('/');
    // [category, uuid, ...file]
    return parts.length >= 2 ? parts[1] : null;
  } catch {
    // not a URL — maybe already a bare path
    const parts = String(uri).replace(/^\/+/, '').split('/');
    return parts.length >= 2 ? parts[1] : null;
  }
}

export function dcToViewModel(rec: DcRecord): DcViewModel {
  const a = rec.Attributes;
  return {
    id: rec.PK ?? rec.id,
    legacyId: a._legacy_id,
    entityKind: a._entity_kind,
    name: a.dc_title ?? rec.Title,
    language: a.language_code && a.language_code !== 'auto' ? a.language_code : null,
    dcType: a.dc_type,
    abstract: a.dc_abstract ?? '',
    tags: arr(a._tags),
    subjects: arr(a.dc_subject),
    creators: arr(a.dc_creator),
    contributors: arr(a.dc_contributor),
    externalLinks: Array.isArray(a._external_links) ? a._external_links : [],
    givenName: a._given_name ?? null,
    familyName: a._family_name ?? null,
    roles: arr(a._roles),
    sourceUri: a.dc_source_uri,
    s3Key: a.s3_key ?? '',
    // The sidecar's own key: prefer the top-level s3_key (the metadata/… address the producer
    // wrote); fall back to deriving it from the content key for older/file-backed rows.
    sidecarKey: (typeof rec.s3_key === 'string' && rec.s3_key.startsWith('metadata/'))
      ? rec.s3_key
      : (a.s3_key ? `metadata/${a.s3_key}.metadata.json` : ''),
    category: a._category,
    // file-backed only when it's a documents row that is NOT virtual (Phase 22). Tolerates the
    // legacy _file_missing marker on un-migrated rows until the migration runs.
    fileBacked: a._category === 'documents' && a._virtual !== true && a._file_missing !== true,
    relationUris: arr(a.dc_relation),
    hasPartUris: arr(a.dc_has_part),
    isPartOfUri: a.dc_is_part_of ?? null,
    performerUris: arr(a._performer_uris),
    castUris: arr(a._cast_uris),
  };
}

/** Map an array of DC records, tolerating nulls. */
export function dcListToViewModels(recs: (DcRecord | null)[]): DcViewModel[] {
  return recs.filter((r): r is DcRecord => !!r && !!r.Attributes).map(dcToViewModel);
}
