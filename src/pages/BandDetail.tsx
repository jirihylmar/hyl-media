import { useEffect, useState } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import { getEntityDetail, updateEntity, applyPatchToVm, groupByKind, type DcDetail } from '../lib/dcQueries';
import { DcEntityHeader } from '../components/DcEntityHeader';
import { Breadcrumb } from '../components/Breadcrumb';

const SECTIONS: { kind: string; label: string; path: string }[] = [
  { kind: 'recording', label: 'Discography', path: '/recordings' },
  { kind: 'sheet_music', label: 'Sheet Music', path: '/sheet-music' },
  { kind: 'movie', label: 'Soundtracks', path: '/movies' },
];

// Used for bands and collaborations.
export function BandDetail() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const [detail, setDetail] = useState<DcDetail | null>(null);

  const isCollab = location.pathname.startsWith('/collaborations');

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
        { label: 'Dossier', to: '/?tab=bands' },
        { label: isCollab ? 'Collaborations' : 'Bands', to: isCollab ? '/collaborations' : '/bands' },
        { label: vm.name },
      ]} />
      <DcEntityHeader vm={vm} onPatch={patch} />

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
