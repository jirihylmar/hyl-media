import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getEntityDetail, updateEntity, applyPatchToVm, type DcDetail } from '../lib/dcQueries';
import { DcEntityHeader } from '../components/DcEntityHeader';
import { Breadcrumb } from '../components/Breadcrumb';

export function RecordingDetail() {
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
        { label: 'Dossier', to: '/?tab=recordings' },
        { label: 'Recordings', to: '/recordings' },
        { label: vm.name },
      ]} />
      <DcEntityHeader vm={vm} onPatch={patch} />

      {detail.creatorsResolved.length > 0 && (
        <>
          <h2>Performers</h2>
          <ul>
            {detail.creatorsResolved.map((p) => (
              <li key={p.id}><Link to={`/${p.kind === 'band' ? 'bands' : 'persons'}/${p.id}`}>{p.name}</Link></li>
            ))}
          </ul>
        </>
      )}
      {detail.creatorsResolved.length === 0 && vm.creators.length > 0 && (
        <p className="meta">Performers: {vm.creators.join(', ')}</p>
      )}

      {detail.isPartOf && (
        <>
          <h2>Featured in</h2>
          <p><Link to={`/movies/${detail.isPartOf.id}`}>{detail.isPartOf.name}</Link></p>
        </>
      )}
    </div>
  );
}
