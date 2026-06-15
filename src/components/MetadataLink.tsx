import { useEffect, useState } from 'react';
import { getUrl } from 'aws-amplify/storage';

/** Phase 19 — link to the raw Dublin Core metadata sidecar (the conformant example artifact) for a
 *  resource. The sidecar lives at metadata/<s3Key>.metadata.json (DH layout); we resolve a
 *  Cognito-signed URL and render a small "metadata" link next to the resource. */
export function MetadataLink({ s3Key }: { s3Key: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!s3Key) return;
    const path = `metadata/${s3Key}.metadata.json`;
    getUrl({ path }).then((r) => setUrl(r.url.toString())).catch(() => setUrl(''));
  }, [s3Key]);

  if (!s3Key || !url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="badge"
      title="View the raw Dublin Core metadata sidecar (JSON) for this resource"
    >
      ⧉ metadata
    </a>
  );
}
