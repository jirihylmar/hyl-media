/**
 * Resolver: hyl-media KnowledgeGraphItem (+ its cross-refs) → DC conformant record.
 *
 * Produces, per entity:
 *   - descriptor : the JSON content object for non-file entities (movie/recording/person/
 *                  band/collaboration). null for file-backed entities (book/sheet_music),
 *                  whose content object is the existing PDF.
 *   - sidecar    : buildDublinCoreSidecar output (DH 28 Attributes) + hyl-media `_` extensions.
 *   - contentKey / sidecarKey : S3 keys (dc-paths).
 *
 * Relationships (recording_performer, recording_movie, sheet_music_performer, book.author)
 * collapse into DC terms per docs/dc-metadata-mapping.md §2.8:
 *   dc_creator (names) · dc_is_part_of / dc_has_part / dc_relation (URIs) · _performer_uris.
 *
 * See task 15.5. Pure module (no AWS).
 */
import {
  buildDublinCoreSidecar, derivedArtifactId, sortKeySlug, NO_LINKS,
} from './build-dc-sidecar.mjs';
import {
  BUCKET, REGION, contentKey, sidecarKey, dcSourceUri, categoryForEntityType,
} from './dc-paths.mjs';

// dc_type + file/content type per entity (docs/dc-metadata-mapping.md §3).
const ENTITY_DC = {
  movie:         { dcType: 'MovingImage', fileType: 'json', contentType: 'DATASET' },
  recording:     { dcType: 'Sound',       fileType: 'json', contentType: 'DATASET' },
  person:        { dcType: 'Dataset',     fileType: 'json', contentType: 'DATASET' },
  band:          { dcType: 'Dataset',     fileType: 'json', contentType: 'DATASET' },
  collaboration: { dcType: 'Dataset',     fileType: 'json', contentType: 'DATASET' },
  book:          { dcType: 'Text',        fileType: 'pdf',  contentType: 'PDF' },
  sheet_music:   { dcType: 'Text',        fileType: 'pdf',  contentType: 'PDF' },
};

// Tags excluded from dc_subject (kept in _tags): role + curation categories (provenance/internal).
const EXCLUDED_FROM_SUBJECT = new Set([
  'actor', 'director', 'artist', 'author', 'composer', 'producer',  // role
  'recommended', 'favorite', 'hidden-gem',                          // curation
]);

export function entityUuid(id, entityType) {
  return derivedArtifactId(id, entityType);
}

function basename(s3Key) {
  return String(s3Key || '').split('/').pop();
}

function descriptorFilename(name, fallbackId) {
  return `${sortKeySlug(name) || sortKeySlug(fallbackId) || 'item'}.json`;
}

/**
 * Resolve the artifact shape for an entity. A file-backed entity (book/sheet_music) WITH an s3Key
 * → its PDF in documents/. A file-LESS book/sheet_music (e.g. a catalog entry with no upload) →
 * a JSON descriptor in datasets/ (dc_type preserved, e.g. Text), so nothing is skipped. All other
 * entities → JSON descriptor in datasets/.
 */
export function resolveArtifact(entity) {
  const meta = ENTITY_DC[entity.entityType];
  if (!meta) throw new Error(`no DC mapping for entityType '${entity.entityType}'`);
  const nativeCat = categoryForEntityType(entity.entityType);
  const pdf = nativeCat === 'documents' ? basename(entity.s3Key) : '';
  if (nativeCat === 'documents' && pdf) {
    return { category: 'documents', filename: pdf, fileType: meta.fileType, contentType: meta.contentType, dcType: meta.dcType, isDescriptor: false, fileMissing: false };
  }
  return {
    category: 'datasets',
    filename: descriptorFilename(entity.name, entity.id),
    fileType: 'json', contentType: 'DATASET', dcType: meta.dcType,
    isDescriptor: true,
    fileMissing: nativeCat === 'documents', // a book/sheet_music with no PDF
  };
}

/** Content key for an entity, given its raw item. */
export function entityContentKey(entity) {
  const a = resolveArtifact(entity);
  return contentKey(a.category, entityUuid(entity.id, entity.entityType), a.filename);
}

/** Default URI resolver — valid for dataset (non-file) targets; the audit/migration supplies a
 *  full map-backed uriFor that also resolves document (book/sheet_music) targets correctly. */
export function defaultUriFor(id, type, name) {
  const cat = categoryForEntityType(type);
  const uuid = entityUuid(id, type);
  const filename = cat === 'documents' ? descriptorFilename(name) : descriptorFilename(name);
  return dcSourceUri(contentKey(cat, uuid, filename));
}

function parseLinks(externalLinks) {
  if (!externalLinks) return [];
  try { const v = JSON.parse(externalLinks); return Array.isArray(v) ? v : []; }
  catch { return []; }
}

function splitTags(tags) {
  const all = Array.isArray(tags) ? tags : [];
  const subject = all.filter((t) => !EXCLUDED_FROM_SUBJECT.has(t));
  return { all, subject };
}

/**
 * @param entity   raw KnowledgeGraphItem (a core entity, not a relationship item)
 * @param crossRefs array of relationship items in which this entity participates (either side)
 * @param opts     { now, uriFor }
 */
export function entityToDc(entity, crossRefs = [], opts = {}) {
  const now = opts.now || entity.updatedAt || entity.createdAt || '1970-01-01T00:00:00.000Z';
  const uriFor = opts.uriFor || defaultUriFor;
  const art = resolveArtifact(entity);
  const cat = art.category;
  const uuid = entityUuid(entity.id, entity.entityType);
  const filename = art.filename;
  const cKey = contentKey(cat, uuid, filename);
  const sKey = sidecarKey(cat, uuid, filename);

  // dc_creator / dc_contributor (names) + relationship URI buckets.
  const dcCreator = [];
  const dcContributor = [];
  const performerUris = [];
  const castUris = [];
  let dcIsPartOf = null;
  const dcHasPart = [];
  const dcRelation = [];

  // book/sheet author/artist → dc_creator.
  if (entity.entityType === 'book' && entity.author) dcCreator.push(entity.author);
  if (entity.entityType === 'sheet_music' && entity.artistName) dcCreator.push(entity.artistName);

  for (const xr of crossRefs) {
    if (xr.entityType === 'recording_performer') {
      if (entity.id === xr.recordingId) {
        if (xr.performerName) dcCreator.push(xr.performerName);
        performerUris.push(uriFor(xr.performerId, xr.performerType || 'person', xr.performerName));
      } else if (entity.id === xr.performerId) {
        dcRelation.push(uriFor(xr.recordingId, 'recording', xr.recordingName));
      }
    } else if (xr.entityType === 'sheet_music_performer') {
      if (entity.id === xr.sheetMusicId) {
        if (xr.performerName) dcCreator.push(xr.performerName);
        performerUris.push(uriFor(xr.performerId, xr.performerType || 'person', xr.performerName));
      } else if (entity.id === xr.performerId) {
        dcRelation.push(uriFor(xr.sheetMusicId, 'sheet_music', xr.sheetMusicName || xr.recordingName));
      }
    } else if (xr.entityType === 'recording_movie') {
      if (entity.id === xr.recordingId) {
        const movieUri = uriFor(xr.movieId, 'movie', xr.movieName);
        if (!dcIsPartOf) dcIsPartOf = movieUri;     // first soundtrack-of
        else dcRelation.push(movieUri);             // additional movies
      } else if (entity.id === xr.movieId) {
        dcHasPart.push(uriFor(xr.recordingId, 'recording', xr.recordingName));
      }
    } else if (xr.entityType === 'movie_cast') {
      // role ∈ {actor, director}: director is a primary creator, actor a contributor.
      if (entity.id === xr.movieId) {
        if (xr.role === 'director') dcCreator.push(xr.personName);
        else dcContributor.push(xr.personName);
        castUris.push(uriFor(xr.personId, 'person', xr.personName));
      } else if (entity.id === xr.personId) {
        dcRelation.push(uriFor(xr.movieId, 'movie', xr.movieName)); // filmography
      }
    }
  }

  const links = {
    ...NO_LINKS,
    dc_relation: dcRelation.length ? dcRelation : null,
    dc_has_part: dcHasPart.length ? dcHasPart : null,
    dc_is_part_of: dcIsPartOf,
  };

  const { all: tagsAll, subject } = splitTags(entity.tags);
  const externalLinks = parseLinks(entity.externalLinks);

  const author = dcCreator[0] ?? null;
  const sidecar = buildDublinCoreSidecar(
    {
      resourceId: uuid,
      contentType: art.contentType,
      dcType: art.dcType,
      category: cat,
      s3Key: cKey,
      fileType: art.fileType,
    },
    { title: entity.name || entity.id, abstract: '', keywords: subject },
    {
      s3Bucket: BUCKET,
      language: entity.language,
      authors: dcCreator.length ? dcCreator : [],
      license: undefined, // → 'copyright'
    },
    now, REGION, undefined, links,
  );

  // dc_creator / dc_contributor are recognized DC terms but NOT in DH's default template (DH adds
  // dc_creator only via its Phase 28.5 editor). We add them explicitly — natural for performers,
  // authors, directors (creator) and actors (contributor).
  sidecar.Attributes.dc_creator = dcCreator.length ? dcCreator : null;
  sidecar.Attributes.dc_contributor = dcContributor.length ? dcContributor : null;
  // dc_rights_holder: builder sets it to authors[0]; for agents/no-author keep null.
  if (author) sidecar.Attributes.dc_rights_holder = author;

  // hyl-media `_`-prefixed extensions (lossless round-trip; DH consumers ignore them).
  sidecar.Attributes._entity_kind = entity.entityType;
  sidecar.Attributes._legacy_id = entity.id;
  sidecar.Attributes._tags = tagsAll;
  sidecar.Attributes._external_links = externalLinks;
  if (performerUris.length) sidecar.Attributes._performer_uris = performerUris;
  if (castUris.length) sidecar.Attributes._cast_uris = castUris;
  if (entity.givenName) sidecar.Attributes._given_name = entity.givenName;
  if (entity.familyName) sidecar.Attributes._family_name = entity.familyName;
  if (Array.isArray(entity.roles) && entity.roles.length) sidecar.Attributes._roles = entity.roles;
  // Flag a file-backed entity that had no actual PDF (emitted as a descriptor instead).
  if (art.fileMissing) sidecar.Attributes._file_missing = true;

  // Descriptor content — emitted whenever the artifact is a JSON descriptor (datasets/ or a
  // file-less book/sheet_music); null when the content object is a real PDF.
  const descriptor = art.isDescriptor ? {
    id: uuid,
    legacy_id: entity.id,
    entity_kind: entity.entityType,
    name: entity.name,
    language: entity.language ?? null,
    given_name: entity.givenName ?? null,
    family_name: entity.familyName ?? null,
    roles: entity.roles ?? null,
    tags: tagsAll,
    external_links: externalLinks,
    creators: dcCreator,
    contributors: dcContributor,
    performer_uris: performerUris,
    cast_uris: castUris,
    is_part_of: dcIsPartOf,
    has_part: dcHasPart,
    relation: dcRelation,
  } : null;

  return { contentKey: cKey, sidecarKey: sKey, descriptor, sidecar };
}

// --- self-test: `node scripts/lib/entity-to-dc.mjs --selftest` ---
if (process.argv[1] && process.argv[1].endsWith('entity-to-dc.mjs') && process.argv.includes('--selftest')) {
  let fail = 0;
  const check = (label, cond, detail = '') => { if (!cond) { fail++; console.log(`FAIL ${label} ${detail}`); } else console.log(`PASS ${label}`); };
  const eq = (label, got, want) => check(label, JSON.stringify(got) === JSON.stringify(want), `\n       got:  ${JSON.stringify(got)}\n       want: ${JSON.stringify(want)}`);

  const NOW = '2026-06-14T00:00:00.000Z';
  const recording = {
    id: 'i-ve-had-the-time-of-my-life_27d8', entityType: 'recording',
    name: "(I've Had) The Time of My Life", language: 'en',
    tags: ['pop', 'soundtrack', 'recommended'], externalLinks: '[]',
  };
  const xrPerformer = {
    entityType: 'recording_performer', recordingId: recording.id, recordingName: recording.name,
    performerId: 'bill-medley_aa01', performerName: 'Bill Medley', performerType: 'person',
  };
  const xrMovie = {
    entityType: 'recording_movie', recordingId: recording.id, recordingName: recording.name,
    movieId: 'dirty-dancing_e9cg', movieName: 'Dirty Dancing',
  };

  const out = entityToDc(recording, [xrPerformer, xrMovie], { now: NOW });
  const A = out.sidecar.Attributes;

  // Expected movie URI (datasets descriptor)
  const movieUri = defaultUriFor('dirty-dancing_e9cg', 'movie', 'Dirty Dancing');
  const performerUri = defaultUriFor('bill-medley_aa01', 'person', 'Bill Medley');

  eq('dc_type Sound', A.dc_type, 'Sound');
  eq('_category datasets', A._category, 'datasets');
  eq('dc_creator = performer name', A.dc_creator, ['Bill Medley']);
  eq('dc_is_part_of = movie URI', A.dc_is_part_of, movieUri);
  eq('_performer_uris', A._performer_uris, [performerUri]);
  eq('dc_subject excludes curation tag', A.dc_subject, ['pop', 'soundtrack']);
  eq('_tags keeps all', A._tags, ['pop', 'soundtrack', 'recommended']);
  eq('_entity_kind', A._entity_kind, 'recording');
  eq('_legacy_id', A._legacy_id, recording.id);
  eq('SK', out.sidecar.SK, '#en#ive-had-the-time-of-my-life');
  check('descriptor present for non-file entity', out.descriptor && out.descriptor.creators[0] === 'Bill Medley');
  check('contentKey under datasets/', out.contentKey.startsWith('datasets/') && out.contentKey.endsWith('.json'), out.contentKey);

  // Reverse direction: the performer person sees the recording in dc_relation.
  const person = { id: 'bill-medley_aa01', entityType: 'person', name: 'Bill Medley', language: 'en', tags: ['artist'], roles: ['artist'] };
  const pout = entityToDc(person, [xrPerformer], { now: NOW });
  const PA = pout.sidecar.Attributes;
  const recUri = defaultUriFor(recording.id, 'recording', recording.name);
  eq('person dc_relation has recording URI', PA.dc_relation, [recUri]);
  eq('person dc_subject excludes role tag', PA.dc_subject, []);
  eq('person _tags keeps role', PA._tags, ['artist']);
  eq('person dc_type Dataset (agent)', PA.dc_type, 'Dataset');
  eq('person _roles', PA._roles, ['artist']);

  // Book: author → dc_creator + dc_rights_holder; document category.
  const book = { id: 'krevni-tlak_8009', entityType: 'book', name: '100+1 otázek', author: 'Eliška Sovová', format: 'pdf', language: 'cs', s3Key: 'library/100+1 otázek by Eliška Sovová.pdf', tags: ['non-fiction'] };
  const bout = entityToDc(book, [], { now: NOW });
  const BA = bout.sidecar.Attributes;
  eq('book dc_type Text', BA.dc_type, 'Text');
  eq('book _category documents', BA._category, 'documents');
  eq('book dc_creator', BA.dc_creator, ['Eliška Sovová']);
  eq('book dc_rights_holder', BA.dc_rights_holder, 'Eliška Sovová');
  eq('book contentKey keeps PDF basename', bout.contentKey, `documents/${entityUuid(book.id, 'book')}/100+1 otázek by Eliška Sovová.pdf`);
  check('book descriptor is null (uses PDF)', bout.descriptor === null);

  // Movie reverse: has_part includes the recording; movie_cast → dc_creator(director)+dc_contributor(actor).
  const movie = { id: 'the-graduate_nsvc', entityType: 'movie', name: 'The Graduate', language: 'en', tags: ['entertainment'] };
  const castDirector = { entityType: 'movie_cast', movieId: movie.id, movieName: movie.name, personId: 'mike-nichols_oa5z', personName: 'Mike Nichols', role: 'director' };
  const castActor = { entityType: 'movie_cast', movieId: movie.id, movieName: movie.name, personId: 'dustin-hoffman_x1', personName: 'Dustin Hoffman', role: 'actor' };
  const mout = entityToDc(movie, [xrMovie, castDirector, castActor], { now: NOW });
  // xrMovie references a different recording/movie pair, so dc_has_part stays null here; assert cast instead.
  eq('movie dc_type MovingImage', mout.sidecar.Attributes.dc_type, 'MovingImage');
  eq('movie_cast director → dc_creator', mout.sidecar.Attributes.dc_creator, ['Mike Nichols']);
  eq('movie_cast actor → dc_contributor', mout.sidecar.Attributes.dc_contributor, ['Dustin Hoffman']);
  check('movie _cast_uris present', Array.isArray(mout.sidecar.Attributes._cast_uris) && mout.sidecar.Attributes._cast_uris.length === 2);

  // File-less book (no s3Key) → JSON descriptor in datasets/, dc_type stays Text, _file_missing.
  const filelessBook = { id: 'syndikat_synd', entityType: 'book', name: 'Syndikát', author: 'Leoš Kýša', language: 'cs', tags: ['prose', 'entertainment'] };
  const fb = entityToDc(filelessBook, [], { now: NOW });
  eq('fileless book dc_type still Text', fb.sidecar.Attributes.dc_type, 'Text');
  eq('fileless book _category datasets', fb.sidecar.Attributes._category, 'datasets');
  eq('fileless book _file_type json', fb.sidecar.Attributes._file_type, 'json');
  eq('fileless book _file_missing flag', fb.sidecar.Attributes._file_missing, true);
  eq('fileless book dc_creator', fb.sidecar.Attributes.dc_creator, ['Leoš Kýša']);
  check('fileless book emits descriptor', fb.descriptor !== null && fb.contentKey.startsWith('datasets/') && fb.contentKey.endsWith('.json'), fb.contentKey);

  // Person filmography: movie_cast reverse → dc_relation has movie URI.
  const director = { id: 'mike-nichols_oa5z', entityType: 'person', name: 'Mike Nichols', language: 'en', roles: ['director'], tags: ['director'] };
  const dout = entityToDc(director, [castDirector], { now: NOW });
  eq('person filmography dc_relation', dout.sidecar.Attributes.dc_relation, [defaultUriFor(movie.id, 'movie', movie.name)]);

  console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILURES`);
  process.exit(fail === 0 ? 0 : 1);
}
