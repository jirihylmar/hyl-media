/**
 * DC-sourced query adapters (Phase 17.3). Return objects structurally compatible with the
 * legacy KnowledgeGraphItem shape so existing pages/components render unchanged, but the data
 * comes from the Dublin Core metadata-repository via the 17.1 AppSync queries.
 */
import { listMetadataByType, DC_TYPE_BY_KIND } from './dcClient';
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
