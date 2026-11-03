class MediaStore {
    constructor() {
        this.db = null;
        this.dbPromise = null;
        this.dbName = 'liquid_chat_media';
        this.version = 3;
    }

    async init() {
        if (this.db) {
            return this.db;
        }
        if (!this.dbPromise) {
            this.dbPromise = new Promise((resolve, reject) => {
                const request = indexedDB.open(this.dbName, this.version);
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (db.objectStoreNames.contains('downloads')) {
                        db.deleteObjectStore('downloads');
                    }
                    if (db.objectStoreNames.contains('cache')) {
                        db.deleteObjectStore('cache');
                    }
                    if (!db.objectStoreNames.contains('media_blobs')) {
                        const store = db.createObjectStore('media_blobs', { keyPath: 'media_id' });
                        store.createIndex('last_access', 'last_access', { unique: false });
                        store.createIndex('size', 'size', { unique: false });
                        store.createIndex('source', 'source', { unique: false });
                    }
                    if (!db.objectStoreNames.contains('media_thumbs')) {
                        const store = db.createObjectStore('media_thumbs', { keyPath: 'media_id' });
                        store.createIndex('last_access', 'last_access', { unique: false });
                        store.createIndex('size', 'size', { unique: false });
                    }
                    if (db.objectStoreNames.contains('media_refs')) {
                        db.deleteObjectStore('media_refs');
                    }
                    const refStore = db.createObjectStore('media_refs', { keyPath: 'ref_id' });
                    refStore.createIndex('message_id', 'message_id', { unique: false });
                    refStore.createIndex('media_id', 'media_id', { unique: false });
                    refStore.createIndex('chat_id', 'chat_id', { unique: false });
                    refStore.createIndex('kind', 'kind', { unique: false });
                    if (!db.objectStoreNames.contains('tombstones')) {
                        const store = db.createObjectStore('tombstones', { keyPath: 'id' });
                        store.createIndex('chat_id', 'chat_id', { unique: false });
                        store.createIndex('message_id', 'message_id', { unique: false });
                    }
                };
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }
        this.db = await this.dbPromise;
        return this.db;
    }

    async withStore(name, mode, callback) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(name, mode);
            const store = tx.objectStore(name);
            let request = null;
            try {
                request = callback(store, tx);
            } catch (err) {
                reject(err);
                return;
            }
            if (request && typeof request.onsuccess === 'function') {
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            } else {
                tx.oncomplete = () => resolve(request);
                tx.onerror = () => reject(tx.error);
            }
        });
    }

    async getMediaBlob(mediaId) {
        if (!mediaId) {
            return null;
        }
        return this.withStore('media_blobs', 'readonly', (store) => store.get(mediaId));
    }

    async saveMediaBlob(mediaId, data) {
        if (!mediaId || !data || !data.blob) {
            return;
        }
        const record = Object.assign({}, data, {
            media_id: mediaId,
            size: data.size || data.blob.size || 0,
            mime: data.mime || data.type || '',
            last_access: Date.now(),
            created_at: data.created_at || Date.now(),
            source: data.source || 'download'
        });
        return this.withStore('media_blobs', 'readwrite', (store) => store.put(record));
    }

    async touchMediaBlob(mediaId) {
        if (!mediaId) {
            return;
        }
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('media_blobs', 'readwrite');
            const store = tx.objectStore('media_blobs');
            const req = store.get(mediaId);
            req.onsuccess = () => {
                const record = req.result;
                if (record) {
                    record.last_access = Date.now();
                    store.put(record);
                }
                resolve();
            };
            req.onerror = () => reject(req.error);
        });
    }

    async deleteMediaBlob(mediaId) {
        if (!mediaId) {
            return;
        }
        return this.withStore('media_blobs', 'readwrite', (store) => store.delete(mediaId));
    }

    async deleteThumb(mediaId) {
        if (!mediaId) {
            return;
        }
        return this.withStore('media_thumbs', 'readwrite', (store) => store.delete(mediaId));
    }

    async getThumb(mediaId) {
        if (!mediaId) {
            return null;
        }
        return this.withStore('media_thumbs', 'readonly', (store) => store.get(mediaId));
    }

    async saveThumb(mediaId, data) {
        if (!mediaId || !data || !data.blob) {
            return;
        }
        const record = Object.assign({}, data, {
            media_id: mediaId,
            size: data.size || data.blob.size || 0,
            mime: data.mime || data.type || '',
            last_access: Date.now(),
            created_at: data.created_at || Date.now(),
            kind: data.kind || 'thumb'
        });
        return this.withStore('media_thumbs', 'readwrite', (store) => store.put(record));
    }

    async touchThumb(mediaId) {
        if (!mediaId) {
            return;
        }
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('media_thumbs', 'readwrite');
            const store = tx.objectStore('media_thumbs');
            const req = store.get(mediaId);
            req.onsuccess = () => {
                const record = req.result;
                if (record) {
                    record.last_access = Date.now();
                    store.put(record);
                }
                resolve();
            };
            req.onerror = () => reject(req.error);
        });
    }

    async saveMediaRef(messageId, mediaId, chatId, kind) {
        const parsedId = parseInt(messageId, 10);
        if (!parsedId || parsedId <= 0 || !mediaId) {
            return;
        }
        const safeMediaId = String(mediaId);
        const record = {
            ref_id: `${parsedId}:${safeMediaId}`,
            message_id: parsedId,
            media_id: safeMediaId,
            chat_id: chatId || '',
            kind: kind || '',
            created_at: Date.now()
        };
        return this.withStore('media_refs', 'readwrite', (store) => store.put(record));
    }

    async getMediaRef(messageId) {
        const refs = await this.getMediaRefsForMessage(messageId);
        return refs.length ? refs[0] : null;
    }

    async getMediaRefsForMessage(messageId) {
        const parsedId = parseInt(messageId, 10);
        if (!parsedId || parsedId <= 0) {
            return [];
        }
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('media_refs', 'readonly');
            const store = tx.objectStore('media_refs');
            const index = store.index('message_id');
            const req = index.getAll(IDBKeyRange.only(parsedId));
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    }

    async removeMediaRefsForMessage(messageId) {
        const refs = await this.getMediaRefsForMessage(messageId);
        if (!refs.length) {
            return;
        }
        return this.withStore('media_refs', 'readwrite', (store) => {
            refs.forEach((ref) => {
                store.delete(ref.ref_id);
            });
        });
    }

    async addTombstone(messageId, chatId) {
        const parsedId = parseInt(messageId, 10);
        if (!parsedId || !chatId) {
            return;
        }
        const record = {
            id: `${chatId}:${parsedId}`,
            message_id: parsedId,
            chat_id: chatId,
            deleted_at: Date.now()
        };
        return this.withStore('tombstones', 'readwrite', (store) => store.put(record));
    }

    async getTombstones(chatId) {
        if (!chatId) {
            return [];
        }
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('tombstones', 'readonly');
            const store = tx.objectStore('tombstones');
            const index = store.index('chat_id');
            const req = index.getAll(IDBKeyRange.only(chatId));
            req.onsuccess = () => {
                const rows = req.result || [];
                resolve(rows.map((row) => row.message_id));
            };
            req.onerror = () => reject(req.error);
        });
    }

    async getCacheSize() {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('media_thumbs', 'readonly');
            const store = tx.objectStore('media_thumbs');
            const req = store.getAll();
            req.onsuccess = () => {
                const total = (req.result || []).reduce((sum, item) => sum + (item.size || 0), 0);
                resolve(total);
            };
            req.onerror = () => reject(req.error);
        });
    }

    async getDownloadSize() {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('media_blobs', 'readonly');
            const store = tx.objectStore('media_blobs');
            const req = store.getAll();
            req.onsuccess = () => {
                const total = (req.result || []).reduce((sum, item) => sum + (item.size || 0), 0);
                resolve(total);
            };
            req.onerror = () => reject(req.error);
        });
    }

    mapKindToBucket(kind) {
        const type = String(kind || '').toLowerCase();
        if (type === 'image' || type === 'album') {
            return 'images';
        }
        if (type === 'video' || type === 'video_note') {
            return 'video';
        }
        if (type === 'audio' || type === 'voice') {
            return 'audio';
        }
        if (type === 'file') {
            return 'docs';
        }
        return 'docs';
    }

    buildChatMapFromLocalCache(userId) {
        const map = new Map();
        if (!userId || typeof localStorage === 'undefined') {
            return map;
        }
        const prefix = `lc_cache_${userId}_`;
        let length = 0;
        try {
            length = localStorage.length;
        } catch (err) {
            return map;
        }
        for (let i = 0; i < length; i += 1) {
            let key = null;
            try {
                key = localStorage.key(i);
            } catch (err) {
                continue;
            }
            if (!key || !key.startsWith(prefix)) {
                continue;
            }
            let raw = null;
            try {
                raw = localStorage.getItem(key);
            } catch (err) {
                continue;
            }
            if (!raw) {
                continue;
            }
            let parsed = null;
            try {
                parsed = JSON.parse(raw);
            } catch (err) {
                continue;
            }
            const messages = parsed && Array.isArray(parsed.messages) ? parsed.messages : [];
            if (!messages.length) {
                continue;
            }
            const suffix = key.slice(prefix.length);
            const parts = suffix.split('_');
            if (parts.length < 2) {
                continue;
            }
            const chatType = parts[0];
            const chatId = parts.slice(1).join('_');
            if (!chatType || !chatId) {
                continue;
            }
            const chatKey = `${chatType}:${chatId}`;
            messages.forEach((msg) => {
                const messageId = parseInt(msg && msg.message_id, 10);
                if (!Number.isFinite(messageId)) {
                    return;
                }
                if (!map.has(messageId)) {
                    map.set(messageId, chatKey);
                }
            });
        }
        return map;
    }

    async backfillChatIdsForRefs(refs, chatMap) {
        if (!refs.length || !chatMap || !chatMap.size) {
            return;
        }
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('media_refs', 'readwrite');
            const store = tx.objectStore('media_refs');
            refs.forEach((ref) => {
                if (!ref || !ref.message_id) {
                    return;
                }
                const messageId = parseInt(ref.message_id, 10);
                if (!Number.isFinite(messageId)) {
                    return;
                }
                const chatId = chatMap.get(messageId);
                if (!chatId) {
                    return;
                }
                const updated = Object.assign({}, ref, { chat_id: chatId });
                store.put(updated);
                ref.chat_id = chatId;
            });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async getMediaUsageByChat(userId) {
        const db = await this.init();
        const [refs, blobs, thumbs] = await Promise.all([
            this.withStore('media_refs', 'readonly', (store) => store.getAll()),
            this.withStore('media_blobs', 'readonly', (store) => store.getAll()),
            this.withStore('media_thumbs', 'readonly', (store) => store.getAll())
        ]);
        const missingRefs = (refs || []).filter((ref) => {
            if (!ref || !ref.message_id) {
                return false;
            }
            return !ref.chat_id || !String(ref.chat_id).trim();
        });
        let messageChatMap = null;
        if (missingRefs.length && userId) {
            messageChatMap = this.buildChatMapFromLocalCache(userId);
            if (messageChatMap.size) {
                try {
                    await this.backfillChatIdsForRefs(missingRefs, messageChatMap);
                } catch (err) {
                }
            }
        }
        const blobSizes = new Map();
        const thumbSizes = new Map();
        (blobs || []).forEach((entry) => {
            if (entry && entry.media_id) {
                blobSizes.set(String(entry.media_id), entry.size || 0);
            }
        });
        (thumbs || []).forEach((entry) => {
            if (entry && entry.media_id) {
                thumbSizes.set(String(entry.media_id), entry.size || 0);
            }
        });
        const usageMap = new Map();
        (refs || []).forEach((ref) => {
            if (!ref || !ref.chat_id || !ref.media_id) {
                if (!ref || !ref.media_id) {
                    return;
                }
                if (!messageChatMap || !messageChatMap.size) {
                    return;
                }
                const messageId = parseInt(ref.message_id, 10);
                const resolved = messageChatMap.get(messageId);
                if (!resolved) {
                    return;
                }
                ref.chat_id = resolved;
            }
            const mediaId = String(ref.media_id);
            const size = (blobSizes.get(mediaId) || 0) + (thumbSizes.get(mediaId) || 0);
            if (!size) {
                return;
            }
            const bucket = this.mapKindToBucket(ref.kind);
            const entry = usageMap.get(ref.chat_id) || {
                chat_id: ref.chat_id,
                total: 0,
                images: 0,
                video: 0,
                audio: 0,
                docs: 0,
                count: 0
            };
            entry.total += size;
            entry.count += 1;
            entry[bucket] += size;
            usageMap.set(ref.chat_id, entry);
        });
        return Array.from(usageMap.values());
    }

    async clearChatMedia(chatId) {
        if (!chatId) {
            return;
        }
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(['media_refs', 'media_blobs', 'media_thumbs'], 'readwrite');
            const refStore = tx.objectStore('media_refs');
            const index = refStore.index('chat_id');
            const req = index.getAll(IDBKeyRange.only(chatId));
            req.onsuccess = () => {
                const refs = req.result || [];
                const mediaIds = new Set();
                refs.forEach((ref) => {
                    if (ref && ref.ref_id) {
                        refStore.delete(ref.ref_id);
                    }
                    if (ref && ref.media_id) {
                        mediaIds.add(String(ref.media_id));
                    }
                });
                const blobStore = tx.objectStore('media_blobs');
                const thumbStore = tx.objectStore('media_thumbs');
                mediaIds.forEach((mediaId) => {
                    blobStore.delete(mediaId);
                    thumbStore.delete(mediaId);
                });
            };
            req.onerror = () => reject(req.error);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async clearCache() {
        return this.withStore('media_thumbs', 'readwrite', (store) => store.clear());
    }

    async clearDownloads() {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(['media_blobs', 'media_refs'], 'readwrite');
            tx.objectStore('media_blobs').clear();
            tx.objectStore('media_refs').clear();
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async enforceCacheLimit(maxBytes) {
        if (!maxBytes || maxBytes < 0) {
            return;
        }
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('media_thumbs', 'readwrite');
            const store = tx.objectStore('media_thumbs');
            const req = store.getAll();
            req.onsuccess = () => {
                let entries = req.result || [];
                let total = entries.reduce((sum, item) => sum + (item.size || 0), 0);
                if (total <= maxBytes) {
                    resolve();
                    return;
                }
                entries = entries.sort((a, b) => (a.last_access || 0) - (b.last_access || 0));
                for (const entry of entries) {
                    store.delete(entry.media_id);
                    total -= entry.size || 0;
                    if (total <= maxBytes) {
                        break;
                    }
                }
                resolve();
            };
            req.onerror = () => reject(req.error);
        });
    }
}

window.MediaStore = MediaStore;
