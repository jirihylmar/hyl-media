import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getEntityDetail, updateEntity, applyPatchToVm, type DcDetail } from '../lib/dcQueries';
import { DcEntityHeader } from '../components/DcEntityHeader';
import { Breadcrumb } from '../components/Breadcrumb';

export function MovieDetail() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<DcDetail | null>(null);

  useEffect(() => {
    if (!id) return;
    getEntityDetail(id).then(setDetail);
  }, [id]);

  if (!detail) return <p className="loading">Loading</p>;
  const { vm } = detail;

  const patch = async (fields: Record<string, unknown>) => {
    await updateEntity(vm.id, fields);
    setDetail((d) => (d ? { ...d, vm: applyPatchToVm(d.vm, fields) } : d));
  };

  return (
    <div>
      <Breadcrumb items={[
        { label: 'Dossier', to: '/?tab=movies' },
        { label: 'Movies', to: '/movies' },
        { label: vm.name },
      ]} />
      <DcEntityHeader vm={vm} entityType="movie" onPatch={patch} />

      {vm.creators.length > 0 && (
        <p><strong>Director{vm.creators.length > 1 ? 's' : ''}:</strong> {vm.creators.join(', ')}</p>
      )}

      {detail.creatorsResolved.length > 0 && (
        <>
          <h2>Cast</h2>
          <ul>
            {detail.creatorsResolved.map((p) => (
              <li key={p.id}><Link to={`/persons/${p.id}`}>{p.name}</Link></li>
            ))}
          </ul>
        </>
      )}
      {detail.contributors.length > 0 && detail.creatorsResolved.length === 0 && (
        <p className="meta">Cast: {detail.contributors.join(', ')}</p>
      )}

      {detail.hasParts.length > 0 && (
        <>
          <h2>Soundtrack</h2>
          <ul>
            {detail.hasParts.map((r) => (
              <li key={r.id}><Link to={`/recordings/${r.id}`}>{r.name}</Link></li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
