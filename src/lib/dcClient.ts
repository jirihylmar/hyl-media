/**
 * Frontend data access for the Dublin Core metadata-repository (Phase 17.2).
 * Calls the custom AppSync queries added in 17.1 and maps records to view models.
 */
import { getClient } from './client';
import {
  type DcRecord, type DcViewModel,
  dcToViewModel, dcListToViewModels, pkFromUri,
} from './dcMap';

// The Amplify client returns AWSJSON (a.json()) already parsed to JS.
function parse<T>(data: unknown): T | null {
  if (data == null) return null;
  if (typeof data === 'string') {
    try { return JSON.parse(data) as T; } catch { return null; }
  }
  return data as T;
}

export async function getMetadata(pk: string): Promise<DcViewModel | null> {
  const res = await getClient().queries.getMetadata({ pk });
  if (res.errors?.length) console.error('getMetadata errors:', res.errors);
  const rec = parse<DcRecord>(res.data);
  return rec && rec.Attributes ? dcToViewModel(rec) : null;
}

export async function getMetadataByLegacyId(legacyId: string): Promise<DcViewModel | null> {
  const res = await getClient().queries.getMetadataByLegacyId({ legacyId });
  if (res.errors?.length) console.error('getMetadataByLegacyId errors:', res.errors);
  const rec = parse<DcRecord>(res.data);
  return rec && rec.Attributes ? dcToViewModel(rec) : null;
}

export async function listMetadataByType(dcType: string, limit?: number): Promise<DcViewModel[]> {
  const res = await getClient().queries.listMetadataByType({ dcType, limit });
  if (res.errors?.length) console.error('listMetadataByType errors:', res.errors);
  const recs = parse<DcRecord[]>(res.data) ?? [];
  return dcListToViewModels(recs);
}

export async function searchMetadata(q: string, limit?: number): Promise<DcViewModel[]> {
  const res = await getClient().queries.searchMetadata({ q, limit });
  if (res.errors?.length) console.error('searchMetadata errors:', res.errors);
  const recs = parse<DcRecord[]>(res.data) ?? [];
  return dcListToViewModels(recs);
}

/** Resolve relationship URIs (dc_relation/dc_has_part/etc.) to view models via their PK. */
export async function resolveUris(uris: string[]): Promise<DcViewModel[]> {
  const pks = Array.from(new Set(uris.map(pkFromUri).filter((p): p is string => !!p)));
  const records = await Promise.all(pks.map((pk) => getMetadata(pk)));
  return records.filter((r): r is DcViewModel => !!r);
}

// Map each entity kind to the dc_type the lists query by. Agent entities (person/band/
// collaboration) are dc_type=Agent (dcterms:Agent); listEntitiesForList still narrows by
// _entity_kind, so the three agent kinds sharing 'Agent' are separated downstream.
export const DC_TYPE_BY_KIND: Record<string, string> = {
  movie: 'MovingImage',
  recording: 'Sound',
  book: 'Text',
  sheet_music: 'Text',
  person: 'Agent',
  band: 'Agent',
  collaboration: 'Agent',
};
