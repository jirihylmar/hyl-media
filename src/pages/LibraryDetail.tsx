import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getUrl } from 'aws-amplify/storage';
import { getEntityDetail, updateEntity, applyPatchToVm, type DcDetail } from '../lib/dcQueries';
import { DcEntityHeader } from '../components/DcEntityHeader';
import { Breadcrumb } from '../components/Breadcrumb';

export function LibraryDetail() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<DcDetail | null>(null);
  const [downloadUrl, setDownloadUrl] = useState('');

  useEffect(() => {
    if (!id) return;
    getEntityDetail(id).then((d) => {
      setDetail(d);
      if (d?.vm.fileBacked && d.vm.s3Key) {
        getUrl({ path: d.vm.s3Key }).then((r) => setDownloadUrl(r.url.toString())).catch(() => {});
      }
    });
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
        { label: 'Dossier', to: '/?tab=library' },
        { label: 'Library', to: '/library' },
        { label: vm.name },
      ]} />
      <DcEntityHeader vm={vm} entityType="book" onPatch={patch}>
        {vm.creators.length > 0 && <p>Author: {vm.creators.join(', ')}</p>}
      </DcEntityHeader>

      {downloadUrl && (
        <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary"
          style={{ display: 'inline-block', marginTop: '1rem' }}>
          Download / View
        </a>
      )}
      {!vm.fileBacked && <p className="meta">No file attached.</p>}
    </div>
  );
}
