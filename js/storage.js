// IndexedDB storage for larger files (attachments)

const STORAGE_DB_NAME = 'bfm_storage';
const STORAGE_DB_VERSION = 1;
const STORE_ATTACHMENTS = 'repair_attachments';

let storageDbPromise = null;

function openStorageDb() {
    if (storageDbPromise) return storageDbPromise;
    storageDbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(STORAGE_DB_NAME, STORAGE_DB_VERSION);
        request.onupgradeneeded = function(event) {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_ATTACHMENTS)) {
                db.createObjectStore(STORE_ATTACHMENTS, { keyPath: 'id' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    return storageDbPromise;
}

async function saveAttachment(file) {
    const db = await openStorageDb();
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const record = {
        id,
        name: file.name,
        type: file.type,
        size: file.size,
        blob: file,
        createdAt: new Date().toISOString()
    };
    
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_ATTACHMENTS, 'readwrite');
        const store = tx.objectStore(STORE_ATTACHMENTS);
        const req = store.put(record);
        req.onsuccess = () => resolve(record);
        req.onerror = () => reject(req.error);
    });
}

async function getAttachment(id) {
    const db = await openStorageDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_ATTACHMENTS, 'readonly');
        const store = tx.objectStore(STORE_ATTACHMENTS);
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
}

async function deleteAttachment(id) {
    const db = await openStorageDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_ATTACHMENTS, 'readwrite');
        const store = tx.objectStore(STORE_ATTACHMENTS);
        const req = store.delete(id);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
    });
}

if (typeof window !== 'undefined') {
    window.saveAttachment = saveAttachment;
    window.getAttachment = getAttachment;
    window.deleteAttachment = deleteAttachment;
}



