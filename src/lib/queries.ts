import { getClient } from './client';

// Legacy KnowledgeGraphItem access — all that remains (17.6c) is the updateItem fallback for
// Tag/ExternalLinks when no DC save callback is supplied. On live pages DcEntityHeader always
// passes a save cb, so this is currently unreached; it is removed with the schema model in 17.6e.
export async function updateItem(
  id: string,
  entityType: string,
  fields: Record<string, unknown>,
  userId: string,
) {
  const result = await getClient().models.KnowledgeGraphItem.update({
    id,
    entityType,
    ...fields,
    updatedAt: new Date().toISOString(),
    updatedBy: userId,
  });
  if (result.errors?.length) {
    console.error('updateItem errors:', result.errors);
    throw new Error(result.errors[0].message);
  }
  return result.data;
}
