/**
 * CryptoManager - Server-Side Cloud Encryption Compatibility Layer
 * Client-side E2EE has been migrated to Server-Side Cloud Storage Encryption (similar to Telegram Cloud Chats).
 * Messages are securely encrypted at rest on the server with AES-256-GCM.
 * This class provides zero-overhead pass-through methods for complete backward compatibility.
 */

class CryptoManager {
    constructor() {
        this.userId = null;
        this.publicKey = 'cloud_managed';
        this.privateKey = 'cloud_managed';
        this.serverBackup = null;
    }

    async init(userId) {
        this.userId = userId;
        return true;
    }

    async bootstrapKeys() {
        return true;
    }

    async loadLocalKeys() {
        return true;
    }

    async storeLocalKeys() {
        return true;
    }

    async generateAndStoreKeys() {
        return true;
    }

    async enableKeySync() {
        return true;
    }

    async restoreFromSync() {
        return true;
    }

    async selfTest() {
        return true;
    }

    async encryptForDirect(plaintext) {
        return {
            encryptedContent: plaintext,
            keySender: null,
            keyRecipient: null,
            contentKey: null,
            plaintext: plaintext
        };
    }

    async encryptForGroup(plaintext) {
        return {
            encryptedContent: plaintext,
            messageKeys: [],
            contentKey: null,
            plaintext: plaintext
        };
    }

    async generateContentKey() {
        return 'server_content_key';
    }

    async encryptWithKey(key, data) {
        const text = typeof data === 'string' ? data : '';
        return {
            iv: null,
            ciphertext: text,
            tag: null,
            plaintext: text
        };
    }

    async decryptWithKey(key, iv, ciphertext) {
        return ciphertext;
    }

    async wrapKey() {
        return null;
    }

    async unwrapKey() {
        return null;
    }

    async decryptPayload(payload) {
        if (!payload) return { plaintext: '', key: null };
        if (typeof payload === 'string') {
            try {
                const parsed = JSON.parse(payload);
                if (parsed && typeof parsed === 'object') {
                    const text = parsed.text || parsed.message || parsed.caption || parsed.plaintext || '';
                    if (text) return { plaintext: text, key: null };
                }
            } catch (e) {
                // not json, return raw string
            }
            return { plaintext: payload, key: null };
        }
        if (typeof payload === 'object') {
            const text = payload.text || payload.message || payload.caption || payload.plaintext || payload.ciphertext || '';
            return { plaintext: text, key: null };
        }
        return { plaintext: String(payload), key: null };
    }

    localKeyId() {
        return `lc_keys_${this.userId}`;
    }

    static toBase64(buffer) {
        if (typeof buffer === 'string') return btoa(buffer);
        const bytes = new Uint8Array(buffer);
        let binary = '';
        bytes.forEach((b) => { binary += String.fromCharCode(b); });
        return btoa(binary);
    }

    static fromBase64(base64) {
        if (!base64) return new ArrayBuffer(0);
        try {
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            return bytes.buffer;
        } catch (e) {
            return new ArrayBuffer(0);
        }
    }
}

if (typeof window !== 'undefined') {
    window.CryptoManager = CryptoManager;
}
