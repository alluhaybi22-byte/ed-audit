import { validateBackup, value } from './model.mjs';

const DATABASE = 'miyar-ed-reviews-v1';
const AUTOMATIC_LIMIT = 5;
const AUTOMATIC_INTERVAL = 5 * 60 * 1000;
const STORES = ['projects', 'snapshots', 'meta'];

export class ReviewLibraryError extends Error {
  constructor(code, cause) {
    super(code, cause ? { cause } : undefined);
    this.name = 'ReviewLibraryError';
    this.code = code;
    this.quota = cause?.name === 'QuotaExceededError';
  }
}

function checkedDocument(input) {
  try { return validateBackup(input); }
  catch (cause) { throw new ReviewLibraryError('backup', cause); }
}

function checkedStoredDocument(input) {
  try { return validateBackup(input); }
  catch (cause) { throw new ReviewLibraryError('storage-corrupt', cause); }
}

function text(input, limit = 200) {
  return [...String(input ?? '').trim().slice(0, limit * 2).normalize('NFC')].slice(0, limit).join('');
}

function descriptive(doc) {
  return {
    facility: text(value(doc, 'Summary Sheet', 'C14')),
    month: text(value(doc, 'Summary Sheet', 'C11'), 30),
    year: text(value(doc, 'Summary Sheet', 'C12'), 20),
  };
}

function defaultTitle(doc, details) {
  const name = details.facility || text(doc.sourceName) || 'Review';
  return text(`${name}${details.month || details.year ? ` · ${details.month} ${details.year}` : ''}`);
}

function projectMetadata(record) {
  if (!record || typeof record.id !== 'string' || typeof record.title !== 'string' ||
      typeof record.createdAt !== 'string' || typeof record.updatedAt !== 'string' ||
      !Number.isFinite(Date.parse(record.createdAt)) || !Number.isFinite(Date.parse(record.updatedAt)) ||
      !['facility', 'month', 'year'].every(key => typeof record[key] === 'string'))
    throw new ReviewLibraryError('storage-corrupt');
  const { id, title, facility, month, year, createdAt, updatedAt } = record;
  return { id, title, facility, month, year, createdAt, updatedAt };
}

function projectResult(record) {
  return { ...projectMetadata(record), doc: checkedStoredDocument(record.doc) };
}

function snapshotMetadata(record) {
  if (!record || typeof record.id !== 'string' || typeof record.projectId !== 'string' ||
      typeof record.label !== 'string' || typeof record.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(record.createdAt)) ||
      !['automatic', 'manual', 'recovery', 'legacy'].includes(record.kind) ||
      (record.position != null && (!Number.isSafeInteger(record.position) || record.position < 0)))
    throw new ReviewLibraryError('storage-corrupt');
  const { id, projectId, label, kind, createdAt, position } = record;
  return { id, projectId, label, kind, createdAt, ...(position != null ? { position } : {}) };
}

const newestFirst = (a, b) => (b.position ?? Date.parse(b.createdAt)) -
  (a.position ?? Date.parse(a.createdAt)) || b.id.localeCompare(a.id);

function request(operation) {
  return new Promise((resolve, reject) => {
    operation.onsuccess = () => resolve(operation.result);
    operation.onerror = () => reject(operation.error);
  });
}

function cursorValues(source, query, project) {
  return new Promise((resolve, reject) => {
    const result = [];
    const operation = source.openCursor(query);
    operation.onerror = () => reject(operation.error);
    operation.onsuccess = () => {
      const cursor = operation.result;
      if (!cursor) return resolve(result);
      try { result.push(project(cursor.value)); }
      catch (error) { reject(error); return; }
      cursor.continue();
    };
  });
}

function transaction(db, mode, action) {
  return new Promise((resolve, reject) => {
    let tx;
    try { tx = db.transaction(STORES, mode); }
    catch (cause) { reject(new ReviewLibraryError('storage-unavailable', cause)); return; }
    let result;
    let failure;
    const code = mode === 'readwrite' ? 'storage-write' : 'storage-read';
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(failure instanceof ReviewLibraryError ? failure :
      new ReviewLibraryError(code, failure || tx.error));
    tx.onerror = () => { failure ||= tx.error; };
    const stores = Object.fromEntries(STORES.map(name => [name, tx.objectStore(name)]));
    Promise.resolve().then(() => action(stores)).then(value => { result = value; }).catch(error => {
      failure = error;
      try { tx.abort(); }
      catch { reject(error instanceof ReviewLibraryError ? error : new ReviewLibraryError(code, error)); }
    });
  });
}

function openDatabase(indexedDB, name) {
  return new Promise((resolve, reject) => {
    let operation;
    let failed = false;
    try {
      if (!indexedDB) throw new Error('IndexedDB unavailable');
      operation = indexedDB.open(name, 1);
    } catch (cause) { reject(new ReviewLibraryError('storage-unavailable', cause)); return; }
    operation.onupgradeneeded = () => {
      const db = operation.result;
      db.createObjectStore('projects', { keyPath: 'id' });
      const snapshots = db.createObjectStore('snapshots', { keyPath: 'id' });
      snapshots.createIndex('projectId', 'projectId');
      db.createObjectStore('meta', { keyPath: 'key' });
    };
    operation.onerror = () => reject(new ReviewLibraryError('storage-unavailable', operation.error));
    operation.onblocked = () => {
      failed = true;
      reject(new ReviewLibraryError('storage-unavailable'));
    };
    operation.onsuccess = () => {
      const db = operation.result;
      if (failed) { db.close(); return; }
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}

/**
 * A library belongs to the current browser/Windows profile; it never uploads data.
 * @param {{
 *   legacyRaw?: string|null,
 *   dbName?: string,
 *   indexedDB?: IDBFactory|null,
 *   now?: () => string,
 *   makeId?: () => string
 * }} [options]
 */
export async function openReviewLibrary({
  legacyRaw = null,
  dbName = DATABASE,
  indexedDB = globalThis.indexedDB,
  now = () => new Date().toISOString(),
  makeId = () => globalThis.crypto.randomUUID(),
} = {}) {
  const db = await openDatabase(indexedDB, dbName);
  const timestamp = () => {
    const date = now();
    if (typeof date !== 'string' || !Number.isFinite(Date.parse(date)))
      throw new ReviewLibraryError('storage-write');
    return date;
  };
  const newId = () => {
    const id = makeId();
    if (typeof id !== 'string' || !id) throw new ReviewLibraryError('storage-write');
    return id;
  };
  const requireProject = async (projects, id, validateDocument = true) => {
    const project = await request(projects.get(id));
    if (!project) throw new ReviewLibraryError('not-found');
    if (validateDocument) projectResult(project);
    else projectMetadata(project);
    return project;
  };
  const addSnapshot = async (stores, project, kind, label, at) => {
    const sequence = await request(stores.meta.get('snapshot-position'));
    let previous = sequence?.value;
    if (previous == null) {
      const older = await cursorValues(stores.snapshots, undefined, snapshotMetadata);
      previous = older.reduce((maximum, point) => Math.max(maximum,
        point.position ?? Date.parse(point.createdAt)), 0);
    }
    const position = Math.max(previous + 1, Date.parse(at));
    if (!Number.isSafeInteger(position)) throw new ReviewLibraryError('storage-corrupt');
    const snapshot = {
      id: newId(), projectId: project.id, createdAt: at, kind, position,
      label: text(label) || (kind === 'manual' ? 'Saved restore point' : 'Automatic backup'),
      doc: checkedStoredDocument(project.doc),
    };
    await request(stores.snapshots.add(snapshot));
    await request(stores.meta.put({ key: 'snapshot-position', value: position }));
    return snapshotMetadata(snapshot);
  };
  const automaticSnapshot = async (stores, project, at) => {
    const elapsed = Date.parse(at) - Date.parse(project.lastAutomaticAt);
    if (project.lastAutomaticAt && elapsed >= 0 && elapsed < AUTOMATIC_INTERVAL) return project.lastAutomaticAt;
    await addSnapshot(stores, project, 'automatic', 'Automatic backup', at);
    const all = await cursorValues(stores.snapshots.index('projectId'), project.id, snapshotMetadata);
    const automatic = all.filter(x => x.kind === 'automatic')
      .sort(newestFirst);
    for (const old of automatic.slice(AUTOMATIC_LIMIT)) await request(stores.snapshots.delete(old.id));
    return at;
  };

  let legacyInvalid = false;
  let legacyProjectId = null;
  let legacy;
  if (legacyRaw != null) {
    try { legacy = checkedDocument(JSON.parse(legacyRaw)); }
    catch { legacyInvalid = true; }
  }
  try {
    await transaction(db, 'readwrite', async stores => {
      const migrated = await request(stores.meta.get('legacy-migrated'));
      legacyProjectId = (await request(stores.meta.get('legacy-project-id')))?.value ?? null;
      if (migrated) { legacyInvalid = false; return; }
      const existing = await request(stores.projects.count());
      if (existing) {
        await request(stores.meta.put({ key: 'legacy-migrated', value: true }));
        legacyInvalid = false;
        return;
      }
      if (legacyInvalid) return;
      if (legacy) {
        const at = timestamp(), details = descriptive(legacy);
        const record = {
          id: newId(), title: defaultTitle(legacy, details), ...details,
          createdAt: at, updatedAt: at, doc: legacy,
        };
        await request(stores.projects.add(record));
        await addSnapshot(stores, record, 'legacy', 'Imported legacy review', at);
        await request(stores.meta.put({ key: 'active', value: record.id }));
        await request(stores.meta.put({ key: 'legacy-project-id', value: record.id }));
        legacyProjectId = record.id;
      }
      await request(stores.meta.put({ key: 'legacy-migrated', value: true }));
    });
  } catch (error) { db.close(); throw error; }

  return {
    legacyInvalid,
    legacyProjectId,
    async getCurrent() {
      return transaction(db, 'readonly', async stores => {
        const active = await request(stores.meta.get('active'));
        if (!active?.value) return null;
        const record = await request(stores.projects.get(active.value));
        if (!record) throw new ReviewLibraryError('storage-corrupt');
        return projectResult(record);
      });
    },
    async list() {
      return transaction(db, 'readonly', async stores => {
        const records = await cursorValues(stores.projects, undefined, projectMetadata);
        return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
      });
    },
    async save(input, { id = null, title, activate = true } = {}) {
      const doc = checkedDocument(input);
      if (title != null && (typeof title !== 'string' || !title.trim())) throw new ReviewLibraryError('backup');
      return transaction(db, 'readwrite', async stores => {
        const previous = id === null ? null : await requireProject(stores.projects, id);
        const at = timestamp(), details = descriptive(doc);
        let lastAutomaticAt = previous?.lastAutomaticAt;
        if (previous && JSON.stringify(previous.doc) !== JSON.stringify(doc))
          lastAutomaticAt = await automaticSnapshot(stores, previous, at);
        const record = {
          id: previous?.id || newId(),
          title: title == null ? previous?.title || defaultTitle(doc, details) : text(title),
          ...details, createdAt: previous?.createdAt || at, updatedAt: at, doc,
          ...(lastAutomaticAt ? { lastAutomaticAt } : {}),
        };
        await request(stores.projects.put(record));
        if (activate) await request(stores.meta.put({ key: 'active', value: record.id }));
        await request(stores.meta.put({ key: 'legacy-migrated', value: true }));
        return projectResult(record);
      });
    },
    async load(id) {
      return transaction(db, 'readwrite', async stores => {
        const record = await requireProject(stores.projects, id);
        await request(stores.meta.put({ key: 'active', value: record.id }));
        return projectResult(record);
      });
    },
    async checkpoint(id, label = '') {
      if (typeof label !== 'string') throw new ReviewLibraryError('backup');
      return transaction(db, 'readwrite', async stores => {
        const record = await requireProject(stores.projects, id);
        return addSnapshot(stores, record, 'manual', label, timestamp());
      });
    },
    async snapshots(id) {
      return transaction(db, 'readonly', async stores => {
        await requireProject(stores.projects, id, false);
        const rows = await cursorValues(stores.snapshots.index('projectId'), id, snapshotMetadata);
        return rows.sort(newestFirst);
      });
    },
    async restore(id, snapshotId) {
      return transaction(db, 'readwrite', async stores => {
        const current = await requireProject(stores.projects, id);
        const snapshot = await request(stores.snapshots.get(snapshotId));
        if (!snapshot || snapshot.projectId !== id) throw new ReviewLibraryError('not-found');
        snapshotMetadata(snapshot);
        const doc = checkedStoredDocument(snapshot.doc);
        const at = timestamp();
        await addSnapshot(stores, current, 'recovery', 'Before restoring a backup', at);
        const record = { ...current, ...descriptive(doc), doc, updatedAt: at };
        await request(stores.projects.put(record));
        await request(stores.meta.put({ key: 'active', value: id }));
        return projectResult(record);
      });
    },
    async remove(id) {
      return transaction(db, 'readwrite', async stores => {
        await requireProject(stores.projects, id, false);
        const rows = await cursorValues(stores.snapshots.index('projectId'), id, snapshotMetadata);
        for (const snapshot of rows) await request(stores.snapshots.delete(snapshot.id));
        await request(stores.projects.delete(id));
        const active = await request(stores.meta.get('active'));
        if (active?.value === id) await request(stores.meta.put({ key: 'active', value: null }));
      });
    },
    async clearCurrent() {
      return transaction(db, 'readwrite', async stores => {
        await request(stores.meta.put({ key: 'active', value: null }));
        await request(stores.meta.put({ key: 'legacy-migrated', value: true }));
      });
    },
    close() { db.close(); },
  };
}
