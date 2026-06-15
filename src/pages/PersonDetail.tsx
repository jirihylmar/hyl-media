import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getEntityDetail, updateEntity, applyPatchToVm, groupByKind, type DcDetail } from '../lib/dcQueries';
import { DcEntityHeader } from '../components/DcEntityHeader';
import { Breadcrumb } from '../components/Breadcrumb';

const SECTIONS: { kind: string; label: string; path: string }[] = [
  { kind: 'movie', label: 'Filmography', path: '/movies' },
  { kind: 'recording', label: 'Recordings', path: '/recordings' },
  { kind: 'sheet_music', label: 'Sheet Music', path: '/sheet-music' },
  { kind: 'book', label: 'Books', path: '/library' },
];

export function PersonDetail() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<DcDetail | null>(null);

  useEffect(() => {
    if (!id) return;
    getEntityDetail(id).then(setDetail);
  }, [id]);

  if (!detail) return <p className="loading">Loading</p>;
  const { vm } = detail;
  const grouped = groupByKind(detail.relations);

  const patch = async (fields: Record<string, unknown>) => {
    await updateEntity(vm.id, fields);
    setDetail((d) => (d ? { ...d, vm: applyPatchToVm(d.vm, fields) } : d));
  };

  return (
    <div>
      <Breadcrumb items={[
        { label: 'Dossier', to: '/?tab=people' },
        { label: 'People', to: '/persons' },
        { label: vm.name },
      ]} />
      <DcEntityHeader vm={vm} entityType="person" onPatch={patch}>
        {(vm.givenName || vm.familyName || vm.roles.length > 0) && (
          <p>
            {[vm.givenName, vm.familyName].filter(Boolean).join(' ')}
            {vm.roles.length > 0 ? ` — ${vm.roles.join(', ')}` : ''}
          </p>
        )}
      </DcEntityHeader>

      {SECTIONS.map(({ kind, label, path }) => {
        const items = grouped[kind] || [];
        if (items.length === 0) return null;
        return (
          <div key={kind}>
            <h2>{label} ({items.length})</h2>
            <ul>
              {items.map((it) => (
                <li key={it.id}><Link to={`${path}/${it.id}`}>{it.name}</Link></li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
