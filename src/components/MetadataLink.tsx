import { useEffect, useState } from 'react';
import { getUrl } from 'aws-amplify/storage';

/** Phase 19 — link to the raw Dublin Core metadata sidecar (the conformant example artifact) for a
 *  resource. `sidecarKey` is the sidecar's own S3 key (metadata/…metadata.json, DH layout). Phase
 *  22: virtual rows have no content object, so the caller passes the sidecar key directly rather
 *  than deriving it from a (now-null) content key. We resolve a Cognito-signed URL and render it. */
export function MetadataLink({ sidecarKey }: { sidecarKey: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!sidecarKey) return;
    getUrl({ path: sidecarKey }).then((r) => setUrl(r.url.toString())).catch(() => setUrl(''));
  }, [sidecarKey]);

  if (!sidecarKey || !url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="btn btn-sm"
      title="Open the raw Dublin Core metadata sidecar (JSON) for this resource in S3"
      style={{
        border: '1px solid var(--green, #44dd55)',
        padding: '2px 8px',
        borderRadius: '3px',
        textDecoration: 'none',
        whiteSpace: 'nowrap',
        fontSize: '0.8rem',
      }}
    >
      ⧉ DC metadata (S3 JSON)
    </a>
  );
}
