/**
 * DC-sourced query adapters (Phase 17.3). Return objects structurally compatible with the
 * legacy KnowledgeGraphItem shape so existing pages/components render unchanged, but the data
 * comes from the Dublin Core metadata-repository via the 17.1 AppSync queries.
 */
import {
  listMetadataByType, getMetadataByLegacyId, resolveUris, DC_TYPE_BY_KIND,
} from './dcClient';
import { getClient } from './client';
import type { DcViewModel } from './dcMap';
import type { KnowledgeGraphItem } from './client';

// Map a DC view model to a legacy-shaped list item. All KnowledgeGraphItem fields are optional,
// so a structural subset + cast is safe. `id` is the legacy id (URLs unchanged); `_dcId` carries
// the DC PK for callers that want it.
function toListItem(vm: DcViewModel): KnowledgeGraphItem {
  return {
    id: vm.legacyId,
    entityType: vm.entityKind,
    name: vm.name,
    language: vm.language,
    tags: vm.tags,
    externalLinks: JSON.stringify(vm.externalLinks),
    roles: vm.roles,
    author: vm.creators[0] ?? null,
    artistName: vm.creators[0] ?? null,
    format: vm.fileBacked ? 'pdf' : '',
    // non-schema helper field (ignored by the UI, handy for 17.3a detail lookups):
    _dcId: vm.id,
  } as unknown as KnowledgeGraphItem;
}

/** List all entities of a UI kind (movie/person/band/recording/collaboration/book/sheet_music),
 *  sourced from the DC store. Filters by _entity_kind because several kinds share a dc_type
 *  (person/band/collaboration → Dataset; book/sheet_music → Text). */
export async function listEntitiesForList(kind: string): Promise<KnowledgeGraphItem[]> {
  const dcType = DC_TYPE_BY_KIND[kind] ?? 'Dataset';
  const all: DcViewModel[] = await listMetadataByType(dcType);
  return all.filter((vm) => vm.entityKind === kind).map(toListItem);
}

// A linked entity reference for relationship sections (name + legacy id for the route + kind).
export type DcLink = { id: string; name: string; kind: string };
const toLink = (vm: DcViewModel): DcLink => ({ id: vm.legacyId, name: vm.name, kind: vm.entityKind });

export type DcDetail = {
  vm: DcViewModel;
  // resolved relationship targets (for rendering links):
  creatorsResolved: DcLink[];     // dc_creator + _performer_uris / _cast_uris (directors+performers)
  contributors: string[];         // dc_contributor names (actors) — may not all have records
  relations: DcLink[];            // dc_relation (filmography / reverse edges)
  hasParts: DcLink[];             // dc_has_part (e.g. movie → soundtrack recordings)
  isPartOf: DcLink | null;        // dc_is_part_of (e.g. recording → movie)
};

/** Load a detail record by legacy id and resolve its relationship URIs to linkable entities. */
export async function getEntityDetail(legacyId: string): Promise<DcDetail | null> {
  const vm = await getMetadataByLegacyId(legacyId);
  if (!vm) return null;
  const [creatorRecs, relationRecs, hasPartRecs, isPartOfRecs] = await Promise.all([
    resolveUris([...vm.performerUris, ...vm.castUris]),
    resolveUris(vm.relationUris),
    resolveUris(vm.hasPartUris),
    resolveUris(vm.isPartOfUri ? [vm.isPartOfUri] : []),
  ]);
  return {
    vm,
    creatorsResolved: creatorRecs.map(toLink),
    contributors: vm.contributors,
    relations: relationRecs.map(toLink),
    hasParts: hasPartRecs.map(toLink),
    isPartOf: isPartOfRecs[0] ? toLink(isPartOfRecs[0]) : null,
  };
}

/** Patch editable DC fields (dc_title, language_code, _tags, _external_links) on a record by PK. */
export async function updateEntity(pk: string, patch: Record<string, unknown>): Promise<void> {
  const res = await getClient().mutations.updateMetadata({ pk, patch: JSON.stringify(patch) });
  if (res.errors?.length) {
    console.error('updateMetadata errors:', res.errors);
    throw new Error(res.errors[0].message);
  }
}

