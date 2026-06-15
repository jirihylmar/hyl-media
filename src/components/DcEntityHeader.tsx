import { InlineEdit } from './InlineEdit';
import { ExternalLinks, type ExternalLink } from './ExternalLinks';
import { TagManager } from './TagManager';
import type { DcViewModel } from '../lib/dcMap';

type Props = {
  vm: DcViewModel;
  entityType: string;
  onPatch: (fields: Record<string, unknown>) => Promise<void>;
  /** Extra rows rendered between the title and the links (e.g. author/artist line). */
  children?: React.ReactNode;
};

/** Shared editable header for DC-backed detail pages: title + language + abstract + links + tags,
 *  all writing to the DC store via onPatch. */
export function DcEntityHeader({ vm, entityType, onPatch, children }: Props) {
  return (
    <>
      <InlineEdit value={vm.name} onSave={(v) => onPatch({ dc_title: v })} as="h1" />
      {children}
      <p><InlineEdit value={vm.language || ''} onSave={(v) => onPatch({ language_code: v })} label="Language" /></p>
      {vm.abstract && <p>{vm.abstract}</p>}

      <ExternalLinks
        id={vm.id} entityType={entityType}
        externalLinks={JSON.stringify(vm.externalLinks)}
        save={(links: ExternalLink[]) => onPatch({ _external_links: links })}
        onUpdate={() => {}}
      />

      <TagManager
        id={vm.id} entityType={entityType}
        tags={vm.tags}
        save={(tags) => onPatch({ _tags: tags })}
        onUpdate={() => {}}
      />
    </>
  );
}
