importScripts('js/api-client.js');

const DB_NAME = 'lc_notify_db';
const STORE_NAME = 'state';
const STATE_KEY = 'notify_state';

function openDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function readState() {
    const db = await openDb();
    return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(STATE_KEY);
        request.onsuccess = () => resolve(request.result || {});
        request.onerror = () => resolve({});
    });
}

async function writeState(state) {
    const db = await openDb();
    return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(state, STATE_KEY);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
    });
}

function normalizeSettings(settings) {
    const mode = settings && settings.notify_mode === 'latest' ? 'latest' : 'all';
    return {
        notify_enabled: settings && parseInt(settings.notify_enabled ?? 1, 10) ? 1 : 0,
        notify_show_sender: settings && parseInt(settings.notify_show_sender ?? 1, 10) ? 1 : 0,
        notify_show_preview: settings && parseInt(settings.notify_show_preview ?? 1, 10) ? 1 : 0,
        notify_mode: mode
    };
}

function getConversationId(conversation) {
    if (!conversation) {
        return null;
    }
    if (conversation.type === 'group') {
        return conversation.group_id;
    }
    if (conversation.type === 'channel') {
        return conversation.channel_id;
    }
    return conversation.user_id;
}

function getConversationKey(conversation) {
    if (!conversation || !conversation.type) {
        return null;
    }
    const id = getConversationId(conversation);
    if (!id) {
        return null;
    }
    return `${conversation.type}:${id}`;
}

function isConversationMuted(conversation) {
    if (!conversation || typeof conversation !== 'object') {
        return false;
    }
    if (conversation.notify_enabled === 0 || conversation.notifications_enabled === 0) {
        return true;
    }
    if (conversation.is_muted || conversation.notifications_muted) {
        return true;
    }
    if (conversation.mute_until) {
        const until = Date.parse(conversation.mute_until);
        if (!Number.isNaN(until) && until > Date.now()) {
            return true;
        }
    }
    return false;
}

function getMessageTypeLabel(type) {
    switch (type) {
        case 'image':
            return 'Photo';
        case 'voice':
            return 'Voice message';
        case 'audio':
            return 'Audio';
        case 'video':
            return 'Video';
        case 'file':
            return 'File';
        default:
            return 'Message';
    }
}

function isMentionNotification(message, conversation, userId) {
    if (message && Number(message.mention_flag || 0) === 1) {
        return true;
    }
    if (conversation && Number(conversation.mention_flag || 0) === 1) {
        return true;
    }
    if (userId && message && Array.isArray(message.mentions)) {
        return message.mentions.map((id) => parseInt(id, 10)).includes(userId);
    }
    return false;
}

function buildNotificationContent(conversation, message, settings, userId) {
    const type = conversation && conversation.type ? conversation.type : 'direct';
    const showSender = settings.notify_show_sender;
    const showPreview = settings.notify_show_preview;
    let title = 'New message';
    if (showSender) {
        if (type === 'group') {
            const groupName = conversation.group_name || 'Group';
            const sender = message.username || conversation.last_sender_name || 'Someone';
            title = `${groupName} - ${sender}`;
        } else if (type === 'channel') {
            const channelName = conversation.channel_name || 'Channel';
            const sender = message.username || conversation.last_sender_name || '';
            title = sender ? `${channelName} - ${sender}` : channelName;
        } else if (type === 'saved') {
            title = 'Saved Messages';
        } else {
            title = conversation.full_name || conversation.username || message.username || 'New message';
        }
    }

    let body = 'You have a new message';
    if (showPreview) {
        if (message.message_type === 'text') {
            body = 'New message';
        } else {
            body = getMessageTypeLabel(message.message_type || 'text');
        }
    }
    const isMention = isMentionNotification(message, conversation, userId);
    if (Number(conversation.content_protection) === 1) {
        body = isMention ? 'Mentioned you' : 'New message';
        return { title, body };
    }
    if (isMention) {
        body = showPreview ? `Mentioned you: ${body}` : 'Mentioned you';
    }
    return { title, body };
}

function buildTag(chatKey, messageId, settings) {
    const safeKey = String(chatKey || 'chat').replace(/[^a-zA-Z0-9_-]/g, '_');
    if (settings.notify_mode === 'latest') {
        return `lc-chat-${safeKey}`;
    }
    return `lc-msg-${messageId || safeKey}`;
}

async function fetchConversationMessages(conversation, sinceId) {
    let url = '';
    if (conversation.type === 'group') {
        url = ApiClient.url('messages', { group_id: conversation.group_id });
    } else if (conversation.type === 'channel') {
        url = ApiClient.url('messages', { channel_id: conversation.channel_id });
    } else {
        url = ApiClient.url('messages', { user_id: conversation.user_id });
    }
    if (sinceId && Number.isFinite(sinceId)) {
        url += `&since_message_id=${sinceId}`;
    }
    const res = await fetch(url, { cache: 'no-store', credentials: 'include' });
    if (!res.ok) {
        return [];
    }
    const data = await res.json();
    if (!data.success || !Array.isArray(data.messages)) {
        return [];
    }
    return data.messages;
}

async function checkNotifications(source) {
    const isPush = source === 'push';
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const hasChatClient = clientsList.some((client) => client.url && client.url.includes('chat'));
    if (hasChatClient) {
        return;
    }
    const state = await readState();
    const settings = normalizeSettings(state.settings || {});
    if (!settings.notify_enabled) {
        return;
    }
    if (!state.userId) {
        return;
    }
    const res = await ApiClient.fetch('conversations', { cache: 'no-store', credentials: 'include' });
    if (!res.ok) {
        return;
    }
    const data = await res.json();
    if (!data.success || !Array.isArray(data.conversations)) {
        return;
    }
    const lastNotified = state.lastNotified || {};
    for (const conversation of data.conversations) {
        if (!conversation || !conversation.type || conversation.type === 'saved') {
            continue;
        }
        if (isConversationMuted(conversation)) {
            continue;
        }
        const chatKey = getConversationKey(conversation);
        if (!chatKey) {
            continue;
        }
        const latestId = parseInt(conversation.message_id, 10);
        if (!Number.isFinite(latestId) || latestId <= 0) {
            continue;
        }
        const senderId = parseInt(conversation.last_sender_id || conversation.sender_id, 10);
        if (senderId && senderId === state.userId) {
            continue;
        }
        const lastSeen = parseInt(lastNotified[chatKey] || 0, 10) || 0;
        const hasBaseline = lastSeen > 0;
        if (!hasBaseline && !isPush) {
            lastNotified[chatKey] = latestId;
            continue;
        }
        if (latestId <= lastSeen) {
            continue;
        }
        if (settings.notify_mode === 'latest' || (!hasBaseline && isPush)) {
            const message = {
                message_id: latestId,
                message_type: conversation.message_type || 'text',
                username: conversation.last_sender_name || '',
                sender_id: senderId,
                mention_flag: conversation.mention_flag || 0
            };
            const copy = buildNotificationContent(conversation, message, settings, state.userId);
            const tag = buildTag(chatKey, latestId, settings);
            await self.registration.showNotification(copy.title, {
                body: copy.body,
                tag,
                renotify: true,
                data: {
                    chatType: conversation.type,
                    chatId: getConversationId(conversation),
                    messageId: latestId
                }
            });
            lastNotified[chatKey] = latestId;
            continue;
        }
        const sinceId = !hasBaseline && isPush ? Math.max(0, latestId - 1) : lastSeen;
        const messages = await fetchConversationMessages(conversation, sinceId);
        for (const msg of messages) {
            const msgId = parseInt(msg.message_id, 10);
            if (!Number.isFinite(msgId) || msgId <= lastSeen) {
                continue;
            }
            if (msg.sender_id && parseInt(msg.sender_id, 10) === state.userId) {
                continue;
            }
            const message = Object.assign({}, msg, {
                message_type: msg.message_type || 'text',
                username: msg.username || conversation.last_sender_name || ''
            });
            const copy = buildNotificationContent(conversation, message, settings, state.userId);
            const tag = buildTag(chatKey, msgId, settings);
            await self.registration.showNotification(copy.title, {
                body: copy.body,
                tag,
                renotify: false,
                data: {
                    chatType: conversation.type,
                    chatId: getConversationId(conversation),
                    messageId: msgId
                }
            });
            lastNotified[chatKey] = Math.max(lastNotified[chatKey] || 0, msgId);
        }
    }
    state.lastNotified = lastNotified;
    state.settings = settings;
    state.updated_at = Date.now();
    await writeState(state);
}

self.addEventListener('install', (event) => {
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
    const data = event.data || {};
    if (data.type === 'notify-sync') {
        event.waitUntil((async () => {
            const state = await readState();
            if (data.userId) {
                state.userId = parseInt(data.userId, 10) || state.userId;
            }
            if (data.settings) {
                state.settings = normalizeSettings(data.settings);
            }
            if (data.lastNotified && typeof data.lastNotified === 'object') {
                state.lastNotified = Object.assign({}, state.lastNotified || {}, data.lastNotified);
            }
            state.updated_at = Date.now();
            await writeState(state);
        })());
    }
});

self.addEventListener('notificationclick', (event) => {
    const data = event.notification.data || {};
    event.notification.close();
    event.waitUntil((async () => {
        const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of clientList) {
            if ('focus' in client) {
                await client.focus();
                client.postMessage({
                    type: 'open-chat',
                    chatType: data.chatType,
                    chatId: data.chatId
                });
                return;
            }
        }
        const params = data.chatType && data.chatId
            ? `?chat_type=${encodeURIComponent(data.chatType)}&chat_id=${encodeURIComponent(data.chatId)}`
            : '';
        await self.clients.openWindow(`chat${params}`);
    })());
});

self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'lc-notify-sync') {
        event.waitUntil(checkNotifications('periodic'));
    }
});

self.addEventListener('sync', (event) => {
    if (event.tag === 'lc-notify-sync') {
        event.waitUntil(checkNotifications('sync'));
    }
});

self.addEventListener('push', (event) => {
    event.waitUntil(checkNotifications('push'));
});
