class DraftStore {
  constructor(userId) {
    this.userId = userId;
    this.db = null;
    this.useLocalStorage = false;
  }

  async init() {
    if (!this.userId || typeof indexedDB === "undefined") {
      this.useLocalStorage = true;
      return;
    }
    try {
      this.db = await new Promise((resolve, reject) => {
        const request = indexedDB.open("lc_drafts", 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains("drafts")) {
            db.createObjectStore("drafts", { keyPath: "key" });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch (err) {
      this.useLocalStorage = true;
    }
  }

  buildKey(chatKey) {
    return `lc_draft_${this.userId}_${chatKey}`;
  }

  async get(chatKey) {
    const key = this.buildKey(chatKey);
    if (this.useLocalStorage || !this.db) {
      try {
        return localStorage.getItem(key) || "";
      } catch (err) {
        return "";
      }
    }
    return new Promise((resolve) => {
      const tx = this.db.transaction("drafts", "readonly");
      const store = tx.objectStore("drafts");
      const request = store.get(key);
      request.onsuccess = () =>
        resolve(
          request.result && request.result.text ? request.result.text : "",
        );
      request.onerror = () => resolve("");
    });
  }

  async getAll() {
    if (this.useLocalStorage || !this.db) {
      const items = [];
      try {
        const prefix = `lc_draft_${this.userId}_`;
        for (let i = 0; i < localStorage.length; i += 1) {
          const key = localStorage.key(i);
          if (!key || !key.startsWith(prefix)) {
            continue;
          }
          const text = localStorage.getItem(key) || "";
          items.push({ key, text });
        }
      } catch (err) {
        return [];
      }
      return items;
    }
    return new Promise((resolve) => {
      const tx = this.db.transaction("drafts", "readonly");
      const store = tx.objectStore("drafts");
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });
  }

  async set(chatKey, text) {
    const key = this.buildKey(chatKey);
    if (!text) {
      await this.delete(chatKey);
      return;
    }
    if (this.useLocalStorage || !this.db) {
      try {
        localStorage.setItem(key, text);
      } catch (err) {}
      return;
    }
    return new Promise((resolve) => {
      const tx = this.db.transaction("drafts", "readwrite");
      const store = tx.objectStore("drafts");
      store.put({ key, text, updated_at: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  async delete(chatKey) {
    const key = this.buildKey(chatKey);
    if (this.useLocalStorage || !this.db) {
      try {
        localStorage.removeItem(key);
      } catch (err) {}
      return;
    }
    return new Promise((resolve) => {
      const tx = this.db.transaction("drafts", "readwrite");
      const store = tx.objectStore("drafts");
      store.delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }
}

class LiquidChat {
  constructor() {
    if (typeof window !== "undefined") {
      window.chatApp = this;
      window.chatManager = this;
      window.closeActiveChat = () => this.closeCurrentChat();
    }
    const userMeta = document.querySelector('meta[name="user-id"]');
    this.userId = userMeta ? parseInt(userMeta.content, 10) : null;
    const nameMeta = document.querySelector('meta[name="user-name"]');
    this.userName = nameMeta ? nameMeta.content : "You";

    this.crypto = new CryptoManager();
    this.conversations = [];
    this.contacts = [];
    this.currentChat = null;

    this.publicKeyCache = new Map();
    this.groupMemberCache = new Map();
    this.channelMemberCache = new Map();
    this.groupMemberInfoCache = new Map();
    this.channelMemberInfoCache = new Map();
    this.groupKeyCache = new Map();
    this.channelKeyCache = new Map();
    this.groupKeyIdCache = new Map();
    this.channelKeyIdCache = new Map();
    this.groupKeyPending = new Map();
    this.channelKeyPending = new Map();
    this.messageCache = new Map();
    this.messageElements = new Map();
    this.messageKeyCache = new Map();
    this.pendingMessages = new Map();
    this.draftStore = null;
    this.draftSaveTimer = null;
    this.draftSaveDelay = 320;
    this.lastDraftKey = null;
    this.lastDraftText = "";
    this.draftCache = new Map();
    this.draftCacheLoaded = false;
    this.lastSentDraftCache = new Map();
    this.uploadTasks = new Map();
    this.mediaStore = window.MediaStore ? new MediaStore() : null;
    this.mediaObserver = null;
    this.activeMediaDownloads = new Map();
    this.mediaDownloadHandlers = new Map();
    this.mediaDownloadQueue = [];
    this.maxMediaDownloads = 3;
    this.maxUploadBytes = this.resolveMaxUploadBytes();
    this.quickReactions = [
      "\u{1F44D}",
      "\u{2764}",
      "\u{1F602}",
      "\u{1F62E}",
      "\u{1F622}",
      "\u{1F621}",
      "\u{1F44E}",
      "\u{1F389}",
      "\u{1F525}",
      "\u{1F92F}",
      "\u{1F44F}",
      "\u{1F60E}",
      "\u{1F494}",
      "\u{1F634}",
      "\u{1F64F}",
      "\u{1F914}",
      "\u{1F60D}",
      "\u{1F64C}",
      "\u{2705}",
      "\u{1F62D}",
    ];
    this.fastReaction = "\u{1F44D}";
    this.quickReactionHideTimer = null;
    this.pinnedMessageId = null;
    this.pinnedMessage = null;
    this.decryptRetry = new Set();
    this.channelDecryptTimers = new Map();
    this.channelDecryptAttempts = new Map();

    this.lastMessageUnix = 0;
    this.lastMessageId = 0;
    this.lastEventId = 0;
    this.tempMessageId = -1;
    this.pollTimer = null;
    this.pollAbort = null;
    this.pollingActive = false;
    this.pollFailureCount = 0;
    this.pollInFlight = false;
    this.activityTimer = null;
    this.conversationTimer = null;
    this.presenceTimer = null;
    this.expiryTimer = null;
    this.lastTypingSent = 0;
    this.typingStopTimer = null;
    this.replyTo = null;
    this.editingMessage = null;
    this.slowModeState = { chatKey: null, until: 0, reason: "", timer: null };
    this.conversationsLoaded = false;
    this.conversationsLoading = false;
    this.cacheLimit = 200;
    this.localCache = new Map();
    this.deletedMessageIds = new Set();
    this.profileCache = new Map();
    this.profileFetches = new Map();
    this.profileTtlMs = 90000;
    this.avatarTokenCache = new Map();
    this.newMessagesCount = 0;
    this.notifiedMessageIds = new Set();
    this.folders = [];
    this.folderAssignments = new Map();
    this.activeFolderId = null;
    this.folderFilters = { unreadOnly: false };
    this.folderManageState = { selectedId: null, assignments: new Set() };
    this.chatSearch = {
      query: "",
      results: [],
      index: 0,
      busy: false,
      beforeId: 0,
      hasMore: true,
    };
    this.chatSearchTimer = null;
    this.seenRateLimitMs = 900;
    this.seenSendTimer = null;
    this.pendingSeen = null;
    this.lastSeenSentAt = 0;
    this.seenRequestInFlight = false;
    this.lastSeenByChat = new Map();
    this.disappearSeconds = 0;
    this.mentionState = {
      active: false,
      triggerIndex: -1,
      query: "",
      results: [],
      selectedIndex: 0,
    };
    this.lastInputAt = 0;
    this.scheduledMessages = new Map();
    this.scheduledLoaded = false;
    this.commandPalette = { open: false, items: [], filtered: [], index: 0 };
    this.onboardingShown = false;
    this.onboardingIndex = 0;
    this.mutedChats = new Map();
    this.permalinkTarget = null;
    this.scheduleContext = null;

    this.notificationSettings = {
      notify_enabled: 1,
      notify_show_sender: 1,
      notify_show_preview: 1,
      notify_mode: "all",
    };
    this.mediaSettings = {
      auto_download_images_wifi: 1,
      auto_download_images_mobile: 1,
      auto_download_videos_wifi: 1,
      auto_download_videos_mobile: 0,
      auto_download_video_limit: 15,
      auto_download_audio_wifi: 1,
      auto_download_audio_mobile: 1,
      auto_download_docs_wifi: 0,
      auto_download_docs_mobile: 0,
      auto_download_doc_limit: 10,
      cache_limit_mb: 512,
      cache_thumbnails_only: 0,
    };
    this.notificationReady = false;
    this.notificationState = {
      lastNotified: new Map(),
      persistTimer: null,
    };
    this.notificationStorageKey = this.userId
      ? `lc_notify_settings_${this.userId}`
      : "lc_notify_settings";
    this.notificationStateKey = this.userId
      ? `lc_notify_state_${this.userId}`
      : "lc_notify_state";
    this.notificationChannel = null;
    this.serviceWorkerRegistration = null;
    this.swMessageBound = false;
    this.initialChatHandled = false;
    this.vapidPublicKey = null;
    this.pushSubscriptionPending = false;
    this.chatTransitionTimer = null;
    this.debugEnabled =
      typeof window !== "undefined" &&
      (window.APP_DEBUG === true || window.APP_DEBUG === "true");

    this.recordingState = {
      active: false,
      recorder: null,
      chunks: [],
      startedAt: 0,
      elapsedMs: 0,
      paused: false,
      timer: null,
      stream: null,
      sendOnStop: true,
      audioContext: null,
      analyser: null,
      analyserData: null,
      waveRaf: null,
      waveBars: [],
    };
    this.videoNoteState = {
      active: false,
      recorder: null,
      chunks: [],
      startedAt: 0,
      elapsedMs: 0,
      paused: false,
      timer: null,
      stream: null,
      mimeType: "",
      previewBlob: null,
      previewUrl: null,
      durationSec: 0,
      maxDurationMs: 60000,
      discardOnStop: false,
    };

    this.uploading = false;
    this.pendingAttachment = null;
    this.typingActive = false;
    this.typingLabel = "";
    this.typingUsers = new Map();
    this.imageViewerState = { blob: null, url: null, scale: 1, name: null };
    this.activeMessageActionId = null;
    this.globalPlayer = {
      container: null,
      audio: null,
      title: null,
      artist: null,
      timeLabel: null,
      seek: null,
      volume: null,
      volumeBtn: null,
      volumeWrap: null,
      loopBtn: null,
      playBtn: null,
      prevBtn: null,
      nextBtn: null,
      closeBtn: null,
      playlist: [],
      index: -1,
      entry: null,
      url: null,
      tiles: new Map(),
      seeking: false,
      loop: false,
      lastVolume: 1,
      volumeHideTimer: null,
    };
    if (this.typingStopTimer) {
      clearTimeout(this.typingStopTimer);
      this.typingStopTimer = null;
    }

    this.ready = this.init();
  }
  async init() {
    this.cacheElements();
    if (!this.userId) {
      if (this.elements.conversationsList) {
        this.elements.conversationsList.innerHTML =
          '<p class="text-center">Error loading conversations</p>';
      }
      return;
    }
    this.draftStore = new DraftStore(this.userId);
    this.ensureTopbar();
    this.ensureGlobalPlayer();
    this.ensureInputHelpers();
    this.createContextMenus();
    this.bindUI();
    this.loadFolderFilters();
    this.bindSearch();

    // Load conversations immediately to prevent stuck loading screen
    this.loadConversations();

    // Initialize non-blocking background tasks in parallel
    (async () => {
      try {
        await this.draftStore.init();
        await this.loadDraftCache();
      } catch (err) {}
      try {
        this.loadMutedChats();
      } catch (err) {}
      try {
        await this.crypto.init(this.userId);
      } catch (err) {
        this.showToast("Encryption init failed");
      }
      try {
        await this.loadUserSettings();
      } catch (err) {}
      try {
        this.initNotificationSync();
      } catch (err) {}
      if (this.mediaStore) {
        try {
          await this.mediaStore.init();
          const limit = this.getCacheLimitBytes();
          await this.mediaStore.enforceCacheLimit(limit);
        } catch (err) {
          console.error("Media cache init failed", err);
        }
      }
      try {
        this.ensureNotifications();
      } catch (err) {}
      try {
        this.registerNotificationWorker();
      } catch (err) {}
      try {
        await this.loadFolders();
      } catch (err) {}
    })();

    this.startPolling();
    this.deferInitialChatOpen();
    this.maybeShowOnboarding();
  }

  cacheElements() {
    this.elements = {
      conversationsList: document.getElementById("conversations-list"),
      messageContainer: document.getElementById("message-container"),
      messageInput: document.getElementById("message-input"),
      sendBtn: document.getElementById("send-btn"),
      scheduleBtn: document.getElementById("schedule-btn"),
      fileInput: document.getElementById("file-input"),
      attachBtn: document.getElementById("attach-btn"),
      voiceBtn: document.getElementById("voice-btn"),
      voiceRecorder: document.getElementById("voice-recorder"),
      voiceRecorderTime: document.getElementById("voice-recorder-time"),
      voiceRecorderPause: document.getElementById("voice-recorder-pause"),
      voiceRecorderStop: document.getElementById("voice-recorder-stop"),
      voiceRecorderCancel: document.getElementById("voice-recorder-cancel"),
      voiceRecorderWave: document.getElementById("voice-recorder-wave"),
      recordingToggle: document.getElementById("recording-toggle"),
      videoNoteBtn: document.getElementById("video-note-btn"),
      videoNoteRecorder: document.getElementById("video-note-recorder"),
      videoNoteVideo: document.getElementById("video-note-video"),
      videoNoteRing: document.getElementById("video-note-ring"),
      videoNotePlay: document.getElementById("video-note-play"),
      videoNoteTimer: document.getElementById("video-note-timer"),
      videoNotePause: document.getElementById("video-note-pause"),
      videoNoteStop: document.getElementById("video-note-stop"),
      videoNoteCancel: document.getElementById("video-note-cancel"),
      videoNoteSend: document.getElementById("video-note-send"),
      videoNoteRerecord: document.getElementById("video-note-rerecord"),
      videoNoteActionsRecord: document.getElementById(
        "video-note-actions-record",
      ),
      videoNoteActionsPreview: document.getElementById(
        "video-note-actions-preview",
      ),
      chatInputContainer: document.getElementById("chat-input-container"),
      welcomeMessage: document.getElementById("welcome-message"),
      emojiBtn: document.getElementById("emoji-btn"),
      folderBar: document.getElementById("folder-bar"),
      folderList: document.getElementById("folder-list"),
      folderManageBtn: document.getElementById("folder-manage-btn"),
      folderUnreadToggle: document.getElementById("folder-filter-unread"),
    };
    if (this.elements.welcomeMessage) {
      this._originalWelcomeHtml = this.elements.welcomeMessage.innerHTML;
    }
  }

  ensureTopbar() {
    const chatMain = document.querySelector(".chat-main");
    let topbar = document.getElementById("chat-topbar");
    if (!topbar) {
      topbar = document.createElement("div");
      topbar.id = "chat-topbar";
      topbar.className = "chat-topbar";
      topbar.innerHTML =
        '<div class="chat-topbar-avatar" id="chat-topbar-avatar"></div>' +
        '<button class="chat-topbar-info chat-topbar-info-btn" id="chat-topbar-info-btn" type="button" aria-label="Open chat info" disabled>' +
        '<span class="chat-topbar-title" id="chat-topbar-title">Select a chat</span>' +
        '<span class="chat-topbar-subtitle" id="chat-topbar-subtitle"></span>' +
        '<span class="chat-topbar-meta" id="chat-topbar-meta" style="display:none;"></span>' +
        "</button>" +
        '<div class="chat-topbar-actions">' +
        '<button class="btn btn-icon" id="chat-topbar-search" type="button" title="Search in chat">' +
        this.iconHtml("search") +
        "</button>" +
        '<button class="btn btn-icon" id="chat-topbar-settings" type="button" title="Chat settings">' +
        this.iconHtml("settings") +
        "</button>" +
        '<button class="btn btn-icon chat-topbar-close" id="chat-topbar-close" type="button" title="Close chat">' +
        this.iconHtml("close") +
        "</button>" +
        "</div>";
      topbar.classList.add("empty");
      if (
        this.elements.securityBanner &&
        this.elements.securityBanner.parentNode
      ) {
        this.elements.securityBanner.insertAdjacentElement("afterend", topbar);
      } else {
        chatMain.insertBefore(topbar, chatMain.firstChild);
      }
    }
    const directCloseBtn = topbar.querySelector("#chat-topbar-close");
    if (directCloseBtn && !directCloseBtn.dataset.boundDirect) {
      directCloseBtn.dataset.boundDirect = "1";
      directCloseBtn.onclick = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        this.closeCurrentChat();
      };
    }
    let pinnedBanner = document.getElementById("pinned-banner");
    if (!pinnedBanner) {
      pinnedBanner = document.createElement("div");
      pinnedBanner.id = "pinned-banner";
      pinnedBanner.className = "pinned-banner";
      pinnedBanner.style.display = "none";
      pinnedBanner.innerHTML =
        '<div class="pinned-banner-icon">' +
        this.iconHtml("pin") +
        "</div>" +
        '<div class="pinned-banner-body">' +
        '<div class="pinned-banner-title">Pinned message</div>' +
        '<div class="pinned-banner-text" id="pinned-banner-text"></div>' +
        "</div>" +
        '<button class="btn btn-icon pinned-banner-close" id="pinned-banner-close" title="Unpin">' +
        this.iconHtml("close") +
        "</button>";
      topbar.insertAdjacentElement("afterend", pinnedBanner);
    }
    this.elements.chatTopbar = topbar;
    this.elements.chatTopbarAvatar =
      document.getElementById("chat-topbar-avatar");
    this.elements.chatTopbarInfoBtn = document.getElementById(
      "chat-topbar-info-btn",
    );
    this.elements.chatTopbarTitle =
      document.getElementById("chat-topbar-title");
    this.elements.chatTopbarSubtitle = document.getElementById(
      "chat-topbar-subtitle",
    );
    this.elements.chatTopbarMeta = document.getElementById("chat-topbar-meta");
    this.elements.chatTopbarSearch =
      document.getElementById("chat-topbar-search");
    this.elements.chatTopbarSettings = document.getElementById(
      "chat-topbar-settings",
    );
    this.elements.chatTopbarClose =
      document.getElementById("chat-topbar-close");
    this.elements.pinnedBanner = pinnedBanner;
    this.elements.pinnedBannerText =
      document.getElementById("pinned-banner-text");
    this.elements.pinnedBannerClose = document.getElementById(
      "pinned-banner-close",
    );
    this.elements.pinChatBtn = null;
  }

  ensureGlobalPlayer() {
    const chatMain = document.querySelector(".chat-main");
    if (!chatMain) {
      return;
    }
    let player = document.getElementById("global-player");
    const playerMarkup =
      '<div class="global-player-core">' +
      '<div class="global-player-controls">' +
      '<button class="btn btn-icon global-player-btn" id="global-player-prev">' +
      this.iconHtml("prev") +
      "</button>" +
      '<button class="btn btn-icon global-player-btn" id="global-player-play">' +
      this.iconHtml("play") +
      "</button>" +
      '<button class="btn btn-icon global-player-btn" id="global-player-next">' +
      this.iconHtml("next") +
      "</button>" +
      '<button class="btn btn-icon global-player-btn global-player-loop" id="global-player-loop">' +
      this.iconHtml("loop") +
      "</button>" +
      "</div>" +
      '<div class="global-player-meta">' +
      '<div class="global-player-title" id="global-player-title"></div>' +
      '<div class="global-player-artist" id="global-player-artist"></div>' +
      '<div class="global-player-progress">' +
      '<input type="range" class="global-player-seek" id="global-player-seek" min="0" max="100" value="0" step="0.1">' +
      '<span class="global-player-time" id="global-player-time">0:00 / 0:00</span>' +
      "</div>" +
      "</div>" +
      "</div>" +
      '<div class="global-player-actions">' +
      '<div class="global-player-volume-wrap" id="global-player-volume-wrap">' +
      '<button class="btn btn-icon global-player-btn global-player-volume-btn" id="global-player-volume-btn">' +
      this.iconHtml("volume") +
      "</button>" +
      '<div class="global-player-volume-pop">' +
      '<input type="range" class="global-player-volume" id="global-player-volume" min="0" max="1" step="0.05" value="1" style="writing-mode: vertical-lr; direction: rtl;">' +
      "</div>" +
      "</div>" +
      '<button class="btn btn-icon global-player-close" id="global-player-close">' +
      this.iconHtml("close") +
      "</button>" +
      "</div>";
    if (!player) {
      player = document.createElement("div");
      player.id = "global-player";
      player.className = "global-player";
      player.style.display = "none";
      player.innerHTML = playerMarkup;
      player.dataset.version = "2";
      if (this.elements.pinnedBanner && this.elements.pinnedBanner.parentNode) {
        this.elements.pinnedBanner.insertAdjacentElement("afterend", player);
      } else if (
        this.elements.chatTopbar &&
        this.elements.chatTopbar.parentNode
      ) {
        this.elements.chatTopbar.insertAdjacentElement("afterend", player);
      } else {
        chatMain.insertBefore(player, chatMain.firstChild);
      }
    } else if (player.dataset.version !== "2") {
      player.innerHTML = playerMarkup;
      player.dataset.version = "2";
    }

    this.globalPlayer.container = player;
    this.globalPlayer.title = document.getElementById("global-player-title");
    this.globalPlayer.artist = document.getElementById("global-player-artist");
    this.globalPlayer.timeLabel = document.getElementById("global-player-time");
    this.globalPlayer.seek = document.getElementById("global-player-seek");
    this.globalPlayer.volume = document.getElementById("global-player-volume");
    this.globalPlayer.volumeBtn = document.getElementById(
      "global-player-volume-btn",
    );
    this.globalPlayer.volumeWrap = document.getElementById(
      "global-player-volume-wrap",
    );
    this.globalPlayer.loopBtn = document.getElementById("global-player-loop");
    this.globalPlayer.playBtn = document.getElementById("global-player-play");
    this.globalPlayer.prevBtn = document.getElementById("global-player-prev");
    this.globalPlayer.nextBtn = document.getElementById("global-player-next");
    this.globalPlayer.closeBtn = document.getElementById("global-player-close");

    if (!this.globalPlayer.audio) {
      const audio = new Audio();
      audio.preload = "metadata";
      this.globalPlayer.audio = audio;
      audio.addEventListener("play", () => this.updateGlobalPlayerState());
      audio.addEventListener("pause", () => this.updateGlobalPlayerState());
      audio.addEventListener("ended", () => {
        if (this.globalPlayer.loop) {
          audio.currentTime = 0;
          audio.play().catch(() => {});
          return;
        }
        this.playNextGlobal();
      });
      audio.addEventListener("timeupdate", () => this.updateGlobalPlayerTime());
      audio.addEventListener("loadedmetadata", () =>
        this.updateGlobalPlayerTime(),
      );
      audio.addEventListener("durationchange", () =>
        this.updateGlobalPlayerTime(),
      );
    }

    if (this.globalPlayer.playBtn && !this.globalPlayer.playBtn.dataset.bound) {
      this.globalPlayer.playBtn.dataset.bound = "1";
      this.globalPlayer.playBtn.addEventListener("click", () =>
        this.toggleGlobalPlayback(),
      );
    }
    if (this.globalPlayer.prevBtn && !this.globalPlayer.prevBtn.dataset.bound) {
      this.globalPlayer.prevBtn.dataset.bound = "1";
      this.globalPlayer.prevBtn.addEventListener("click", () =>
        this.playPrevGlobal(),
      );
    }
    if (this.globalPlayer.nextBtn && !this.globalPlayer.nextBtn.dataset.bound) {
      this.globalPlayer.nextBtn.dataset.bound = "1";
      this.globalPlayer.nextBtn.addEventListener("click", () =>
        this.playNextGlobal(),
      );
    }
    if (
      this.globalPlayer.closeBtn &&
      !this.globalPlayer.closeBtn.dataset.bound
    ) {
      this.globalPlayer.closeBtn.dataset.bound = "1";
      this.globalPlayer.closeBtn.addEventListener("click", () =>
        this.stopGlobalPlayer(),
      );
    }
    if (this.globalPlayer.loopBtn && !this.globalPlayer.loopBtn.dataset.bound) {
      this.globalPlayer.loopBtn.dataset.bound = "1";
      this.globalPlayer.loopBtn.addEventListener("click", () =>
        this.toggleGlobalLoop(),
      );
    }
    if (this.globalPlayer.seek && !this.globalPlayer.seek.dataset.bound) {
      this.globalPlayer.seek.dataset.bound = "1";
      this.globalPlayer.seek.addEventListener("input", () => {
        const audio = this.globalPlayer.audio;
        if (!audio || !audio.duration) {
          return;
        }
        this.globalPlayer.seeking = true;
        const next =
          (parseFloat(this.globalPlayer.seek.value) / 100) * audio.duration;
        audio.currentTime = Math.max(0, Math.min(audio.duration, next));
        this.setGlobalPlayerSeekFill(this.globalPlayer.seek.value);
      });
      this.globalPlayer.seek.addEventListener("change", () => {
        this.globalPlayer.seeking = false;
      });
      this.globalPlayer.seek.addEventListener("mouseup", () => {
        this.globalPlayer.seeking = false;
      });
      this.globalPlayer.seek.addEventListener("touchend", () => {
        this.globalPlayer.seeking = false;
      });
    }
    if (this.globalPlayer.volume && !this.globalPlayer.volume.dataset.bound) {
      this.globalPlayer.volume.dataset.bound = "1";
      this.globalPlayer.volume.addEventListener("input", () => {
        const next = parseFloat(this.globalPlayer.volume.value);
        this.applyGlobalPlayerVolume(next);
      });
      this.globalPlayer.volume.addEventListener(
        "wheel",
        (event) => {
          event.preventDefault();
          const step =
            parseFloat(this.globalPlayer.volume.step || "0.05") || 0.05;
          const delta = event.deltaY < 0 ? step : -step;
          const next =
            parseFloat(this.globalPlayer.volume.value || "0") + delta;
          this.applyGlobalPlayerVolume(next);
        },
        { passive: false },
      );
    }
    if (
      this.globalPlayer.volumeBtn &&
      !this.globalPlayer.volumeBtn.dataset.bound
    ) {
      this.globalPlayer.volumeBtn.dataset.bound = "1";
      this.globalPlayer.volumeBtn.addEventListener("click", () => {
        const audio = this.globalPlayer.audio;
        if (!audio) {
          return;
        }
        if (audio.volume > 0) {
          this.globalPlayer.lastVolume = audio.volume;
          this.applyGlobalPlayerVolume(0);
        } else {
          this.applyGlobalPlayerVolume(this.globalPlayer.lastVolume || 0.5);
        }
      });
      this.globalPlayer.volumeBtn.addEventListener(
        "wheel",
        (event) => {
          event.preventDefault();
          const step =
            parseFloat(this.globalPlayer.volume?.step || "0.05") || 0.05;
          const delta = event.deltaY < 0 ? step : -step;
          const next =
            parseFloat(this.globalPlayer.volume?.value || "0") + delta;
          this.applyGlobalPlayerVolume(next);
        },
        { passive: false },
      );
    }
    if (
      this.globalPlayer.volumeWrap &&
      !this.globalPlayer.volumeWrap.dataset.bound
    ) {
      this.globalPlayer.volumeWrap.dataset.bound = "1";
      this.globalPlayer.volumeWrap.addEventListener("mouseenter", () => {
        if (this.globalPlayer.volumeHideTimer) {
          clearTimeout(this.globalPlayer.volumeHideTimer);
          this.globalPlayer.volumeHideTimer = null;
        }
        this.globalPlayer.volumeWrap.classList.add("is-open");
      });
      this.globalPlayer.volumeWrap.addEventListener("mouseleave", () => {
        if (this.globalPlayer.volumeHideTimer) {
          clearTimeout(this.globalPlayer.volumeHideTimer);
        }
        this.globalPlayer.volumeHideTimer = setTimeout(() => {
          if (this.globalPlayer.volumeWrap) {
            this.globalPlayer.volumeWrap.classList.remove("is-open");
          }
        }, 400);
      });
      this.globalPlayer.volumeWrap.addEventListener("focusin", () => {
        if (this.globalPlayer.volumeHideTimer) {
          clearTimeout(this.globalPlayer.volumeHideTimer);
          this.globalPlayer.volumeHideTimer = null;
        }
        this.globalPlayer.volumeWrap.classList.add("is-open");
      });
      this.globalPlayer.volumeWrap.addEventListener("focusout", () => {
        if (this.globalPlayer.volumeHideTimer) {
          clearTimeout(this.globalPlayer.volumeHideTimer);
        }
        this.globalPlayer.volumeHideTimer = setTimeout(() => {
          if (this.globalPlayer.volumeWrap) {
            this.globalPlayer.volumeWrap.classList.remove("is-open");
          }
        }, 400);
      });
    }
    if (this.globalPlayer.audio && this.globalPlayer.volume) {
      const stored = this.getStoredPlayerVolume();
      const initial =
        stored === null ? this.globalPlayer.audio.volume || 1 : stored;
      this.applyGlobalPlayerVolume(initial, true);
      this.setGlobalLoopState(this.getStoredPlayerLoop(), true);
    }
    this.updateGlobalPlayerState();
  }

  ensureInputHelpers() {
    const container = this.elements.chatInputContainer;
    if (!container) {
      return;
    }

    let replyContainer = document.getElementById("reply-container");
    if (!replyContainer) {
      replyContainer = document.createElement("div");
      replyContainer.id = "reply-container";
      replyContainer.className = "reply-container";
      replyContainer.style.display = "none";
      replyContainer.innerHTML =
        '<div class="reply-content">' +
        '<div class="reply-header">' +
        this.iconHtml("reply") +
        '<span id="reply-user"></span></div>' +
        '<div class="reply-text" id="reply-text"></div>' +
        "</div>" +
        '<button class="btn btn-icon" id="reply-cancel">' +
        this.iconHtml("close") +
        "</button>";
      container.insertBefore(replyContainer, container.firstChild);
    }

    let editingContainer = document.getElementById("editing-container");
    if (!editingContainer) {
      editingContainer = document.createElement("div");
      editingContainer.id = "editing-container";
      editingContainer.className = "editing-container";
      editingContainer.style.display = "none";
      editingContainer.innerHTML =
        '<div class="editing-content">' +
        '<div class="editing-header">' +
        this.iconHtml("edit") +
        " Editing message</div>" +
        "</div>" +
        '<button class="btn btn-icon" id="editing-cancel">' +
        this.iconHtml("close") +
        "</button>";
      container.insertBefore(editingContainer, container.firstChild);
    }

    let activityIndicator = document.getElementById("activity-indicator");
    if (!activityIndicator) {
      activityIndicator = document.createElement("div");
      activityIndicator.id = "activity-indicator";
      activityIndicator.className = "activity-indicator";
      activityIndicator.style.display = "none";
      container.appendChild(activityIndicator);
    }

    let slowModeIndicator = document.getElementById("slow-mode-indicator");
    if (!slowModeIndicator) {
      slowModeIndicator = document.createElement("div");
      slowModeIndicator.id = "slow-mode-indicator";
      slowModeIndicator.className = "slow-mode-indicator";
      slowModeIndicator.style.display = "none";
      container.appendChild(slowModeIndicator);
    }

    let mentionSuggest = document.getElementById("mention-suggest");
    if (!mentionSuggest) {
      mentionSuggest = document.createElement("div");
      mentionSuggest.id = "mention-suggest";
      mentionSuggest.className = "mention-suggest";
      mentionSuggest.style.display = "none";
      mentionSuggest.innerHTML =
        '<div class="mention-suggest-list" id="mention-suggest-list"></div>';
      container.appendChild(mentionSuggest);
    }

    let uploadProgress = document.getElementById("upload-progress");
    if (!uploadProgress) {
      uploadProgress = document.createElement("div");
      uploadProgress.id = "upload-progress";
      uploadProgress.className = "upload-progress";
      uploadProgress.innerHTML =
        '<div class="upload-progress-bar"></div><span class="upload-progress-text"></span>';
      uploadProgress.style.display = "none";
      container.appendChild(uploadProgress);
    }

    let attachmentPreview = document.getElementById("attachment-preview");
    if (!attachmentPreview) {
      attachmentPreview = document.createElement("div");
      attachmentPreview.id = "attachment-preview";
      attachmentPreview.className = "attachment-preview";
      attachmentPreview.style.display = "none";
      attachmentPreview.innerHTML =
        '<div class="attachment-thumb" id="attachment-thumb"></div>' +
        '<div class="attachment-info">' +
        '<div class="attachment-name" id="attachment-name"></div>' +
        '<div class="attachment-size" id="attachment-size"></div>' +
        '<div class="attachment-hint">Add a caption or send now</div>' +
        "</div>" +
        '<div class="attachment-actions">' +
        '<button class="btn btn-secondary attachment-send" id="attachment-send">Send</button>' +
        '<button class="btn btn-icon attachment-remove" id="attachment-remove">' +
        this.iconHtml("close") +
        "</button>" +
        "</div>";
      const inputBox = container.querySelector(".chat-input-box");
      if (inputBox) {
        container.insertBefore(attachmentPreview, inputBox);
      } else {
        container.insertBefore(attachmentPreview, container.firstChild);
      }
    }

    let toast = document.getElementById("toast-notification");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "toast-notification";
      document.body.appendChild(toast);
    }

    const chatMain = document.querySelector(".chat-main");
    let newMessagesJump = document.getElementById("new-messages-jump");
    if (!newMessagesJump && chatMain) {
      newMessagesJump = document.createElement("button");
      newMessagesJump.id = "new-messages-jump";
      newMessagesJump.className = "new-messages-jump";
      newMessagesJump.type = "button";
      newMessagesJump.style.display = "none";
      newMessagesJump.innerHTML =
        '<span class="new-messages-jump-arrow">&#8595;</span><span class="new-messages-jump-count" id="new-messages-jump-count">0</span>';
      chatMain.appendChild(newMessagesJump);
    }
    let mentionNavBtn = document.getElementById("mentionNavBtn");
    if (!mentionNavBtn && chatMain) {
      mentionNavBtn = document.createElement("button");
      mentionNavBtn.id = "mentionNavBtn";
      mentionNavBtn.className = "mention-nav-btn";
      mentionNavBtn.type = "button";
      mentionNavBtn.title = "پیام‌های منشن";
      mentionNavBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10h5v-2h-5c-4.34 0-8-3.66-8-8s3.66-8 8-8 8 3.66 8 8v1.43c0 .79-.71 1.57-1.5 1.57s-1.5-.78-1.5-1.57V12c0-2.76-2.24-5-5-5s-5 2.24-5 5 2.24 5 5 5c1.38 0 2.64-.56 3.54-1.47.65.89 1.77 1.47 2.96 1.47 1.97 0 3.5-1.6 3.5-3.57V12c0-5.52-4.48-10-10-10zm0 13c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z"/>
                </svg>
                @ منشن‌ها
                <span class="mention-nav-count" id="mentionNavCount">0</span>
            `;
      chatMain.appendChild(mentionNavBtn);
    }

    this.elements.replyContainer = replyContainer;
    this.elements.replyUser = document.getElementById("reply-user");
    this.elements.replyText = document.getElementById("reply-text");
    this.elements.replyCancel = document.getElementById("reply-cancel");
    this.elements.editingContainer = editingContainer;
    this.elements.editingCancel = document.getElementById("editing-cancel");
    this.elements.activityIndicator = activityIndicator;
    this.elements.slowModeIndicator = slowModeIndicator;
    this.elements.mentionSuggest = mentionSuggest;
    this.elements.mentionSuggestList = document.getElementById(
      "mention-suggest-list",
    );
    this.elements.uploadProgress = uploadProgress;
    this.elements.uploadProgressBar = uploadProgress.querySelector(
      ".upload-progress-bar",
    );
    this.elements.uploadProgressText = uploadProgress.querySelector(
      ".upload-progress-text",
    );
    this.elements.attachmentPreview = attachmentPreview;
    this.elements.attachmentThumb = document.getElementById("attachment-thumb");
    this.elements.attachmentName = document.getElementById("attachment-name");
    this.elements.attachmentSize = document.getElementById("attachment-size");
    this.elements.attachmentSend = document.getElementById("attachment-send");
    this.elements.attachmentRemove =
      document.getElementById("attachment-remove");
    this.elements.toast = toast;
    this.elements.newMessagesJump = newMessagesJump;
    this.elements.newMessagesJumpCount = document.getElementById(
      "new-messages-jump-count",
    );
  }

  ensureTypingBubble() {
    if (!this.elements.messageContainer) {
      this.elements.messageContainer = document.getElementById("message-container");
    }
    if (!this.elements.messageContainer) {
      return;
    }
    let bubble = document.getElementById("typing-bubble");
    if (!bubble) {
      bubble = document.createElement("div");
      bubble.id = "typing-bubble";
      bubble.className = "typing-bubble";
      bubble.style.setProperty("display", "none", "important");
      bubble.innerHTML =
        '<div class="typing-bubble-pill"><div class="typing-dots"><span></span><span></span><span></span></div></div>';
    }
    if (bubble.parentElement !== this.elements.messageContainer) {
      this.elements.messageContainer.appendChild(bubble);
    }
    this.elements.typingBubble = bubble;
    this.elements.typingBubbleText = null;
  }

  triggerChatTransition() {
    const chatMain = document.querySelector(".chat-main");
    if (!chatMain) {
      return;
    }
    chatMain.classList.remove("chat-transition");
    void chatMain.offsetWidth;
    chatMain.classList.add("chat-transition");
    if (this.chatTransitionTimer) {
      clearTimeout(this.chatTransitionTimer);
    }
    this.chatTransitionTimer = setTimeout(() => {
      chatMain.classList.remove("chat-transition");
    }, 220);
  }

  createContextMenus() {
    const quickSet = this.quickReactions.slice(0, 6);
    const messageMenu = document.createElement("div");
    messageMenu.className = "context-menu";
    messageMenu.id = "message-context-menu";
    messageMenu.innerHTML =
      '<div class="menu-meta" id="menu-seen-meta"></div>' +
      '<div class="menu-reactions" id="menu-reactions">' +
      quickSet
        .map(
          (emoji) =>
            '<button class="menu-reaction" data-emoji="' +
            emoji +
            '" type="button">' +
            emoji +
            "</button>",
        )
        .join("") +
      '<button class="menu-reaction menu-reaction-more" data-more-reactions="1" type="button">' +
      this.iconHtml("plus") +
      "</button>" +
      "</div>" +
      '<div class="menu-item" data-action="reply">' +
      this.iconHtml("reply") +
      " Reply</div>" +
      '<div class="menu-item" data-action="edit">' +
      this.iconHtml("edit") +
      " Edit</div>" +
      '<div class="menu-item" data-action="retry">' +
      this.iconHtml("send") +
      " Retry</div>" +
      '<div class="menu-item" data-action="delete">' +
      this.iconHtml("trash") +
      " Delete</div>" +
      '<div class="menu-item" data-action="seen-time">' +
      this.iconHtml("eye") +
      '<span class="menu-text">Seen time</span></div>' +
      '<div class="menu-item" data-action="pin-message">' +
      this.iconHtml("pin") +
      " Pin message</div>" +
      '<div class="menu-item" data-action="unpin-message">' +
      this.iconHtml("pin") +
      " Unpin message</div>" +
      '<div class="menu-item" data-action="save">' +
      this.iconHtml("bookmark") +
      " Save</div>" +
      '<div class="menu-item" data-action="forward">' +
      this.iconHtml("share") +
      " Forward</div>" +
      '<div class="menu-item" data-action="download-image">' +
      this.iconHtml("download") +
      " Download image</div>" +
      '<div class="menu-item" data-action="copy">' +
      this.iconHtml("copy") +
      " Copy</div>" +
      '<div class="menu-item" data-action="copy-link">' +
      this.iconHtml("link") +
      " Copy message link</div>" +
      '<div class="menu-item" data-action="select-message">' +
      this.iconHtml("check") +
      " Select</div>" +
      '<div class="menu-item" data-action="schedule-edit">' +
      this.iconHtml("clock") +
      " Edit schedule</div>" +
      '<div class="menu-item" data-action="schedule-cancel">' +
      this.iconHtml("close") +
      " Cancel scheduled</div>";
    document.body.appendChild(messageMenu);
    this.parseTwemoji(messageMenu);

    const chatMenu = document.createElement("div");
    chatMenu.className = "context-menu";
    chatMenu.id = "chat-context-menu";
    chatMenu.innerHTML =
      '<div class="menu-item" data-action="pin">' +
      this.iconHtml("pin") +
      " Pin</div>" +
      '<div class="menu-item" data-action="unpin">' +
      this.iconHtml("pin") +
      " Unpin</div>" +
      '<div class="menu-item" data-action="view-profile">' +
      this.iconHtml("user") +
      " View profile</div>" +
      '<div class="menu-item" data-action="view-group">' +
      this.iconHtml("users") +
      " View group</div>" +
      '<div class="menu-item" data-action="view-channel">' +
      this.iconHtml("channel") +
      " View channel</div>" +
      '<div class="menu-item" data-action="clear-chat">' +
      this.iconHtml("broom") +
      " Clear chat</div>" +
      '<div class="menu-item" data-action="delete-chat-me">' +
      this.iconHtml("eye-off") +
      " Delete for me</div>" +
      '<div class="menu-item" data-action="delete-chat-all">' +
      this.iconHtml("trash") +
      " Delete for everyone</div>";
    document.body.appendChild(chatMenu);

    const reactionPicker = document.createElement("div");
    reactionPicker.className = "reaction-picker";
    reactionPicker.id = "reaction-picker";
    reactionPicker.innerHTML =
      quickSet
        .map(
          (emoji) =>
            '<button class="reaction-item" data-emoji="' +
            emoji +
            '" type="button">' +
            emoji +
            "</button>",
        )
        .join("") +
      '<button class="reaction-item reaction-more" data-more-reactions="1" type="button">' +
      this.iconHtml("plus") +
      "</button>";
    document.body.appendChild(reactionPicker);

    const quickBar = document.createElement("div");
    quickBar.className = "reaction-quick-bar";
    quickBar.id = "reaction-quick-bar";
    quickBar.style.display = "none";
    quickBar.innerHTML = quickSet
      .map(
        (emoji) =>
          '<button class="reaction-quick" data-emoji="' +
          emoji +
          '" type="button">' +
          emoji +
          "</button>",
      )
      .join("");
    document.body.appendChild(quickBar);

    const reactionSheet = document.createElement("div");
    reactionSheet.className = "reaction-sheet";
    reactionSheet.id = "reaction-sheet";
    reactionSheet.style.display = "none";
    reactionSheet.innerHTML =
      '<div class="reaction-sheet-inner">' +
      this.quickReactions
        .map(
          (emoji) =>
            '<button class="reaction-sheet-item" data-emoji="' +
            emoji +
            '" type="button">' +
            emoji +
            "</button>",
        )
        .join("") +
      "</div>";
    document.body.appendChild(reactionSheet);
    this.parseTwemoji(reactionSheet);

    const forwardModal = document.createElement("div");
    forwardModal.className = "modal";
    forwardModal.id = "forward-modal";
    forwardModal.style.display = "none";
    forwardModal.innerHTML =
      '<div class="modal-content glass-card forward-modal">' +
      '<div class="modal-header"><h3>Forward Message</h3><button class="btn btn-icon" id="forward-close">' +
      this.iconHtml("close") +
      "</button></div>" +
      '<div class="modal-body"><input type="text" id="forward-search" class="form-control" placeholder="Search chats..." autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="text" data-lpignore="true" data-form-type="other" data-1p-ignore="true" data-bwignore="true">' +
      '<div id="forward-list" class="forward-list"></div></div>' +
      "</div>";
    document.body.appendChild(forwardModal);

    const confirmModal = document.createElement("div");
    confirmModal.className = "modal";
    confirmModal.id = "confirm-modal";
    confirmModal.style.display = "none";
    confirmModal.innerHTML =
      '<div class="modal-content glass-card confirm-modal">' +
      '<div class="modal-header"><h3 id="confirm-title">Confirm action</h3></div>' +
      '<div class="modal-body"><p id="confirm-message"></p></div>' +
      '<div class="modal-footer">' +
      '<button class="btn btn-secondary" id="confirm-cancel">Cancel</button>' +
      '<button class="btn btn-primary" id="confirm-accept">Confirm</button>' +
      "</div>" +
      "</div>";
    document.body.appendChild(confirmModal);

    const deleteModal = document.createElement("div");
    deleteModal.className = "modal";
    deleteModal.id = "delete-scope-modal";
    deleteModal.style.display = "none";
    deleteModal.innerHTML =
      '<div class="modal-content glass-card confirm-modal">' +
      '<div class="modal-header"><h3>Delete message</h3></div>' +
      '<div class="modal-body"><p id="delete-scope-message">Delete this message for yourself or everyone?</p></div>' +
      '<div class="modal-footer">' +
      '<button class="btn btn-secondary" id="delete-scope-cancel">Cancel</button>' +
      '<button class="btn btn-secondary" id="delete-scope-me">Delete for me</button>' +
      '<button class="btn btn-primary" id="delete-scope-all">Delete for everyone</button>' +
      "</div>" +
      "</div>";
    document.body.appendChild(deleteModal);

    const seenTimeModal = document.createElement("div");
    seenTimeModal.className = "modal";
    seenTimeModal.id = "seen-time-modal";
    seenTimeModal.style.display = "none";
    seenTimeModal.innerHTML =
      '<div class="modal-content glass-card seen-time-modal">' +
      '<div class="modal-header"><h3>Seen time</h3><button class="btn btn-icon" id="seen-time-close">' +
      this.iconHtml("close") +
      "</button></div>" +
      '<div class="modal-body"><p id="seen-time-text"></p></div>' +
      "</div>";
    document.body.appendChild(seenTimeModal);

    const imageViewerModal = document.createElement("div");
    imageViewerModal.className = "modal";
    imageViewerModal.id = "image-viewer-modal";
    imageViewerModal.style.display = "none";
    imageViewerModal.innerHTML =
      '<div class="modal-content glass-card image-viewer">' +
      '<div class="modal-header"><h3>Image</h3><button class="btn btn-icon" id="image-viewer-close">' +
      this.iconHtml("close") +
      "</button></div>" +
      '<div class="modal-body">' +
      '<div class="image-viewer-body"><img id="image-viewer-img" alt="Image"></div>' +
      '<div class="image-viewer-actions">' +
      '<button class="btn btn-icon" id="image-zoom-out">-</button>' +
      '<button class="btn btn-icon" id="image-zoom-in">+</button>' +
      '<button class="btn btn-secondary" id="image-zoom-reset">1x</button>' +
      '<button class="btn btn-primary" id="image-download-btn">Download</button>' +
      "</div>" +
      "</div>" +
      "</div>";
    document.body.appendChild(imageViewerModal);

    const profileModal = document.createElement("div");
    profileModal.className = "modal";
    profileModal.id = "profile-modal";
    profileModal.style.display = "none";
    profileModal.innerHTML =
      '<div class="modal-content glass-card profile-modal">' +
      '<div class="modal-header"><h3>Profile</h3><button class="btn btn-icon" id="profile-close">' +
      this.iconHtml("close") +
      "</button></div>" +
      '<div class="modal-body">' +
      '<div class="profile-modal-body">' +
      '<div class="profile-modal-header">' +
      '<div class="profile-modal-avatar" id="profile-modal-avatar"></div>' +
      '<div class="profile-modal-summary">' +
      '<div class="profile-modal-name" id="profile-modal-name"></div>' +
      '<div class="profile-modal-username" id="profile-modal-username"></div>' +
      '<div class="profile-modal-status" id="profile-modal-status"></div>' +
      '<div class="profile-modal-lastseen" id="profile-modal-lastseen"></div>' +
      "</div>" +
      "</div>" +
      '<div class="profile-modal-about">' +
      '<div class="profile-modal-about-title">About</div>' +
      '<div class="profile-modal-bio" id="profile-modal-bio"></div>' +
      "</div>" +
      "</div>" +
      "</div>" +
      "</div>";
    document.body.appendChild(profileModal);

    this.elements.messageMenu = messageMenu;
    this.elements.chatMenu = chatMenu;
    this.elements.reactionPicker = reactionPicker;
    this.elements.quickReactionBar = quickBar;
    this.elements.reactionSheet = reactionSheet;
    this.elements.forwardModal = forwardModal;
    this.elements.forwardList = document.getElementById("forward-list");
    this.elements.forwardSearch = document.getElementById("forward-search");
    this.elements.forwardClose = document.getElementById("forward-close");
    this.elements.confirmModal = confirmModal;
    this.elements.confirmMessage = document.getElementById("confirm-message");
    this.elements.confirmAccept = document.getElementById("confirm-accept");
    this.elements.confirmCancel = document.getElementById("confirm-cancel");
    this.elements.deleteScopeModal = deleteModal;
    this.elements.deleteScopeMessage = document.getElementById(
      "delete-scope-message",
    );
    this.elements.deleteScopeCancel = document.getElementById(
      "delete-scope-cancel",
    );
    this.elements.deleteScopeMe = document.getElementById("delete-scope-me");
    this.elements.deleteScopeAll = document.getElementById("delete-scope-all");
    this.elements.seenTimeModal = seenTimeModal;
    this.elements.seenTimeClose = document.getElementById("seen-time-close");
    this.elements.seenTimeText = document.getElementById("seen-time-text");
    this.elements.imageViewerModal = imageViewerModal;
    this.elements.imageViewerClose =
      document.getElementById("image-viewer-close");
    this.elements.imageViewerImg = document.getElementById("image-viewer-img");
    this.elements.imageZoomIn = document.getElementById("image-zoom-in");
    this.elements.imageZoomOut = document.getElementById("image-zoom-out");
    this.elements.imageZoomReset = document.getElementById("image-zoom-reset");
    this.elements.imageDownloadBtn =
      document.getElementById("image-download-btn");
    this.elements.profileModal = profileModal;
    this.elements.profileClose = document.getElementById("profile-close");
    this.elements.profileAvatar = document.getElementById(
      "profile-modal-avatar",
    );
    this.elements.profileName = document.getElementById("profile-modal-name");
    this.elements.profileUsername = document.getElementById(
      "profile-modal-username",
    );
    this.elements.profileStatus = document.getElementById(
      "profile-modal-status",
    );
    this.elements.profileLastSeen = document.getElementById(
      "profile-modal-lastseen",
    );
    this.elements.profileBio = document.getElementById("profile-modal-bio");
  }
  bindUI() {
    if (this.elements.sendBtn) {
      this.elements.sendBtn.addEventListener("click", () => this.handleSend());
    }
    if (this.elements.scheduleBtn) {
      this.elements.scheduleBtn.addEventListener("click", () => {
        this.openScheduleModal({ mode: "schedule" });
      });
    }
    if (this.elements.messageInput) {
      this.elements.messageInput.addEventListener("keydown", (event) => {
        if (this.handleMentionKeydown(event)) {
          return;
        }
        if (event.key === "ArrowUp") {
          const handled = this.maybeEditLastMessage(event);
          if (handled) {
            return;
          }
        }
        if (event.key === "Enter") {
          if (event.isComposing) {
            return;
          }
          if (event.shiftKey) {
            return;
          }
          event.preventDefault();
          this.handleSend();
        }
      });
      this.elements.messageInput.addEventListener("input", () => {
        this.handleTyping();
        this.handleDraftInput();
        this.handleMentionInput();
        this.resizeComposer();
      });
      this.elements.messageInput.addEventListener("paste", (event) =>
        this.handlePaste(event),
      );
      this.elements.messageInput.addEventListener("blur", () => {
        this.sendActivity("typing", "");
        if (this.typingStopTimer) {
          clearTimeout(this.typingStopTimer);
          this.typingStopTimer = null;
        }
      });
    }
    if (
      this.elements.chatTopbarClose &&
      !this.elements.chatTopbarClose.dataset.bound
    ) {
      this.elements.chatTopbarClose.dataset.bound = "1";
      this.elements.chatTopbarClose.addEventListener("click", () =>
        this.closeCurrentChat(),
      );
    }
    if (
      this.elements.chatTopbarSearch &&
      !this.elements.chatTopbarSearch.dataset.bound
    ) {
      this.elements.chatTopbarSearch.dataset.bound = "1";
      this.elements.chatTopbarSearch.addEventListener("click", () =>
        this.openChatSearch(),
      );
    }
    if (
      this.elements.chatTopbarSettings &&
      !this.elements.chatTopbarSettings.dataset.bound
    ) {
      this.elements.chatTopbarSettings.dataset.bound = "1";
      this.elements.chatTopbarSettings.addEventListener("click", () =>
        this.openChatSettings(),
      );
    }
    if (
      this.elements.chatTopbarInfoBtn &&
      !this.elements.chatTopbarInfoBtn.dataset.bound
    ) {
      this.elements.chatTopbarInfoBtn.dataset.bound = "1";
      this.elements.chatTopbarInfoBtn.addEventListener("click", () =>
        this.handleTopbarInfoClick(),
      );
    }
    if (this.elements.fileInput) {
      this.elements.fileInput.addEventListener("change", (event) =>
        this.handleFileSelected(event),
      );
    }
    if (this.elements.voiceBtn) {
      this.elements.voiceBtn.addEventListener("click", () => {
        this.setRecorderToggle("voice");
        if (this.videoNoteState.active) {
          this.stopVideoNoteRecording(true);
        } else if (this.videoNoteState.previewBlob) {
          this.cleanupVideoNotePreview();
          this.showVideoNoteUI(null);
        }
        this.toggleRecording();
      });
    }
    if (this.elements.voiceRecorderPause) {
      this.elements.voiceRecorderPause.addEventListener("click", () =>
        this.toggleRecordingPause(),
      );
    }
    if (this.elements.voiceRecorderStop) {
      this.elements.voiceRecorderStop.addEventListener("click", () =>
        this.stopRecording(true),
      );
    }
    if (this.elements.voiceRecorderCancel) {
      this.elements.voiceRecorderCancel.addEventListener("click", () =>
        this.stopRecording(false),
      );
    }
    if (this.elements.videoNoteBtn) {
      this.elements.videoNoteBtn.addEventListener("click", () => {
        this.setRecorderToggle("video");
        this.toggleVideoNoteRecording();
      });
    }
    if (this.elements.videoNotePause) {
      this.elements.videoNotePause.addEventListener("click", () =>
        this.toggleVideoNotePause(),
      );
    }
    if (this.elements.videoNoteStop) {
      this.elements.videoNoteStop.addEventListener("click", () =>
        this.stopVideoNoteRecording(false),
      );
    }
    if (this.elements.videoNoteCancel) {
      this.elements.videoNoteCancel.addEventListener("click", () =>
        this.stopVideoNoteRecording(true),
      );
    }
    if (this.elements.videoNoteSend) {
      this.elements.videoNoteSend.addEventListener("click", () =>
        this.sendVideoNote(),
      );
    }
    if (this.elements.videoNoteRerecord) {
      this.elements.videoNoteRerecord.addEventListener("click", () =>
        this.restartVideoNoteRecording(),
      );
    }
    if (this.elements.videoNotePlay) {
      this.elements.videoNotePlay.addEventListener("click", () =>
        this.toggleVideoNotePreviewPlayback(),
      );
    }
    if (this.elements.emojiBtn) {
      this.initEmojiPicker();
    }
    if (this.elements.replyCancel) {
      this.elements.replyCancel.addEventListener("click", () =>
        this.clearReply(),
      );
    }
    if (this.elements.editingCancel) {
      this.elements.editingCancel.addEventListener("click", () =>
        this.clearEditing(),
      );
    }
    if (this.elements.attachmentSend) {
      this.elements.attachmentSend.addEventListener("click", () =>
        this.handleSend(),
      );
    }
    if (this.elements.attachmentRemove) {
      this.elements.attachmentRemove.addEventListener("click", () =>
        this.clearAttachment(),
      );
    }
    if (this.elements.forwardClose) {
      this.elements.forwardClose.addEventListener("click", () =>
        this.closeForwardModal(),
      );
    }
    if (this.elements.forwardSearch) {
      this.elements.forwardSearch.addEventListener("input", () =>
        this.renderForwardList(),
      );
    }
    if (this.elements.confirmCancel) {
      this.elements.confirmCancel.addEventListener("click", () =>
        this.resolveConfirm(false),
      );
    }
    if (this.elements.confirmAccept) {
      this.elements.confirmAccept.addEventListener("click", () =>
        this.resolveConfirm(true),
      );
    }
    if (this.elements.deleteScopeCancel) {
      this.elements.deleteScopeCancel.addEventListener("click", () =>
        this.resolveDeleteScope(null),
      );
    }
    if (this.elements.deleteScopeMe) {
      this.elements.deleteScopeMe.addEventListener("click", () =>
        this.resolveDeleteScope("me"),
      );
    }
    if (this.elements.deleteScopeAll) {
      this.elements.deleteScopeAll.addEventListener("click", () =>
        this.resolveDeleteScope("all"),
      );
    }
    if (
      this.elements.folderManageBtn &&
      !this.elements.folderManageBtn.dataset.bound
    ) {
      this.elements.folderManageBtn.dataset.bound = "1";
      this.elements.folderManageBtn.addEventListener("click", () =>
        this.openFolderManager(),
      );
    }
    if (
      this.elements.folderUnreadToggle &&
      !this.elements.folderUnreadToggle.dataset.bound
    ) {
      this.elements.folderUnreadToggle.dataset.bound = "1";
      this.elements.folderUnreadToggle.addEventListener("change", () =>
        this.updateFolderFilters(),
      );
    }
    if (
      this.elements.mentionSuggestList &&
      !this.elements.mentionSuggestList.dataset.bound
    ) {
      this.elements.mentionSuggestList.dataset.bound = "1";
      this.elements.mentionSuggestList.addEventListener("click", (event) => {
        const item = event.target.closest("[data-mention-id]");
        if (!item) {
          return;
        }
        const userId = parseInt(item.dataset.mentionId, 10);
        const username = item.dataset.mentionUsername || "";
        this.applyMentionSelection(userId, username);
      });
    }
    if (this.elements.profileClose) {
      this.elements.profileClose.addEventListener("click", () =>
        this.closeProfile(),
      );
    }
    if (this.elements.confirmModal) {
      this.elements.confirmModal.addEventListener("click", (event) => {
        if (event.target === this.elements.confirmModal) {
          this.resolveConfirm(false);
        }
      });
    }
    if (this.elements.deleteScopeModal) {
      this.elements.deleteScopeModal.addEventListener("click", (event) => {
        if (event.target === this.elements.deleteScopeModal) {
          this.resolveDeleteScope(null);
        }
      });
    }
    if (this.elements.profileModal) {
      this.elements.profileModal.addEventListener("click", (event) => {
        if (event.target === this.elements.profileModal) {
          this.closeProfile();
        }
      });
    }
    if (this.elements.seenTimeClose) {
      this.elements.seenTimeClose.addEventListener("click", () =>
        this.closeSeenTimeModal(),
      );
    }
    if (this.elements.seenTimeModal) {
      this.elements.seenTimeModal.addEventListener("click", (event) => {
        if (event.target === this.elements.seenTimeModal) {
          this.closeSeenTimeModal();
        }
      });
    }
    if (this.elements.imageViewerClose) {
      this.elements.imageViewerClose.addEventListener("click", () =>
        this.closeImageViewer(),
      );
    }
    if (this.elements.imageViewerModal) {
      this.elements.imageViewerModal.addEventListener("click", (event) => {
        if (event.target === this.elements.imageViewerModal) {
          this.closeImageViewer();
        }
      });
    }
    if (this.elements.imageZoomIn) {
      this.elements.imageZoomIn.addEventListener("click", () =>
        this.adjustImageZoom(0.2),
      );
    }
    if (this.elements.imageZoomOut) {
      this.elements.imageZoomOut.addEventListener("click", () =>
        this.adjustImageZoom(-0.2),
      );
    }
    if (this.elements.imageZoomReset) {
      this.elements.imageZoomReset.addEventListener("click", () =>
        this.setImageZoom(1),
      );
    }
    if (this.elements.imageDownloadBtn) {
      this.elements.imageDownloadBtn.addEventListener("click", () =>
        this.downloadImageFromViewer(),
      );
    }
    document.addEventListener("keydown", (event) => {
      this.handleGlobalKeydown(event);
    });
    if (this.elements.pinnedBanner) {
      this.elements.pinnedBanner.addEventListener("click", (event) => {
        if (event.target.closest(".pinned-banner-close")) {
          return;
        }
        if (this.pinnedMessageId) {
          this.scrollToMessage(this.pinnedMessageId);
        }
      });
    }
    if (this.elements.pinnedBannerClose) {
      this.elements.pinnedBannerClose.addEventListener(
        "click",
        async (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!this.currentChat) {
            return;
          }
          await this.pinMessage(null, "unpin");
        },
      );
    }
    if (this.elements.messageContainer) {
      this.elements.messageContainer.addEventListener("copy", (event) => {
        if (this.isContentProtected()) {
          event.preventDefault();
          this.showToast("Copying is disabled for this chat");
        }
      });
      this.elements.messageContainer.addEventListener("scroll", () => {
        this.handleMessageScroll();
      });
    }
    if (
      this.elements.newMessagesJump &&
      !this.elements.newMessagesJump.dataset.bound
    ) {
      this.elements.newMessagesJump.dataset.bound = "1";
      this.elements.newMessagesJump.addEventListener("click", () => {
        this.scrollToBottom("smooth");
        this.resetNewMessagesJump();
        this.queueMarkSeen();
      });
    }

    document.addEventListener("click", () => {
      this.hideMessageMenu();
      this.hideChatMenu();
      this.hideReactionPicker();
      this.closeReactionSheet();
      if (this.elements.quickReactionBar) {
        this.elements.quickReactionBar.style.display = "none";
      }
    });

    this.elements.messageMenu.addEventListener("click", (event) => {
      event.stopPropagation();
      const reactionBtn = event.target.closest(".menu-reaction");
      if (reactionBtn) {
        const messageId = this.elements.messageMenu.dataset.messageId;
        const message = this.messageCache.get(parseInt(messageId, 10));
        if (message && reactionBtn.dataset.moreReactions) {
          this.openReactionSheet(message, event.clientX, event.clientY);
          this.hideMessageMenu();
          return;
        }
        const emoji = reactionBtn.dataset.emoji;
        if (message && emoji) {
          this.hideMessageMenu();
          this.toggleReaction(message, emoji);
        }
        return;
      }
      const item = event.target.closest(".menu-item");
      if (!item) {
        return;
      }
      const action = item.dataset.action;
      const messageId = this.elements.messageMenu.dataset.messageId;
      const message = this.messageCache.get(parseInt(messageId, 10));
      if (!message) {
        return;
      }
      this.hideMessageMenu();
      this.handleMessageMenuAction(action, message);
    });

    this.elements.chatMenu.addEventListener("click", (event) => {
      event.stopPropagation();
      const item = event.target.closest(".menu-item");
      if (!item) {
        return;
      }
      const action = item.dataset.action;
      const chatId = this.elements.chatMenu.dataset.chatId;
      const chatType = this.elements.chatMenu.dataset.chatType;
      const conversation = this.conversations.find(
        (conv) =>
          String(this.getConversationId(conv)) === chatId &&
          conv.type === chatType,
      );
      if (!conversation) {
        return;
      }
      this.hideChatMenu();
      this.handleChatMenuAction(action, conversation);
    });

    this.elements.reactionPicker.addEventListener("click", (event) => {
      event.stopPropagation();
      const item = event.target.closest(".reaction-item");
      if (!item) {
        return;
      }
      const messageId = this.elements.reactionPicker.dataset.messageId;
      const message = this.messageCache.get(parseInt(messageId, 10));
      if (message && item.dataset.moreReactions) {
        this.openReactionSheet(message, event.clientX, event.clientY);
        this.hideReactionPicker();
        return;
      }
      const emoji = item.dataset.emoji;
      if (!message) {
        return;
      }
      this.hideReactionPicker();
      this.toggleReaction(message, emoji);
    });

    if (this.elements.quickReactionBar) {
      this.elements.quickReactionBar.addEventListener("click", (event) => {
        event.stopPropagation();
        const item = event.target.closest(".reaction-quick");
        if (!item) {
          return;
        }
        const emoji = item.dataset.emoji;
        const messageId = this.elements.quickReactionBar.dataset.messageId;
        const message = this.messageCache.get(parseInt(messageId, 10));
        if (!message || !emoji) {
          return;
        }
        this.elements.quickReactionBar.style.display = "none";
        this.toggleReaction(message, emoji);
      });
      this.elements.quickReactionBar.addEventListener("mouseenter", () => {
        if (this.quickReactionHideTimer) {
          clearTimeout(this.quickReactionHideTimer);
          this.quickReactionHideTimer = null;
        }
      });
      this.elements.quickReactionBar.addEventListener("mouseleave", () => {
        this.deferHideQuickReactionBar();
      });
    }

    if (this.elements.reactionSheet) {
      this.elements.reactionSheet.addEventListener("click", (event) => {
        event.stopPropagation();
        const item = event.target.closest(".reaction-sheet-item");
        if (!item) {
          return;
        }
        const messageId = this.elements.reactionSheet.dataset.messageId;
        const message = this.messageCache.get(parseInt(messageId, 10));
        if (!message) {
          return;
        }
        const emoji = item.dataset.emoji;
        if (emoji) {
          this.toggleReaction(message, emoji);
        }
        this.closeReactionSheet();
      });
    }
  }

  isEditableTarget(target) {
    if (!target) {
      return false;
    }
    const tag = target.tagName ? target.tagName.toLowerCase() : "";
    if (tag === "input" || tag === "textarea" || tag === "select") {
      return true;
    }
    return !!target.isContentEditable;
  }

  handleGlobalKeydown(event) {
    if (!event) {
      return;
    }
    const key = event.key || "";
    const lowerKey = key.toLowerCase();
    if (key === "F12") {
      event.preventDefault();
      return;
    }
    if (event.ctrlKey && event.shiftKey && lowerKey === "i") {
      event.preventDefault();
      return;
    }
    const isMeta = event.metaKey || event.ctrlKey;
    if (key === "Escape") {
      this.closeChatSearch();
      this.closeSeenTimeModal();
      this.closeImageViewer();
      this.closeReactionSheet();
      this.closeScheduleModal();
      this.closeCommandPalette();
      this.closeOnboarding();
      return;
    }
    if (!isMeta) {
      return;
    }
    if (lowerKey === "k" && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      this.toggleCommandPalette();
      return;
    }
    if (lowerKey === "f" && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      if (this.currentChat) {
        this.openChatSearch();
      }
      return;
    }
    if (lowerKey === "m" && event.shiftKey) {
      event.preventDefault();
      this.toggleMuteCurrentChat();
    }
  }

  bindSearch() {
    const searchInput = document.getElementById("search-contacts");
    if (!searchInput) {
      return;
    }
    searchInput.setAttribute("autocomplete", "off");
    searchInput.setAttribute("readonly", "readonly");
    const unlockInput = () => {
      searchInput.removeAttribute("readonly");
    };
    searchInput.addEventListener("focus", unlockInput, { once: true });
    searchInput.addEventListener("pointerdown", unlockInput, { once: true });
    searchInput.addEventListener("mousedown", unlockInput, { once: true });
    const clearAutofill = () => {
      if (searchInput.dataset.userTyped || document.activeElement === searchInput) {
        return;
      }
      const value = searchInput.value || "";
      if (value && value.includes("@") && value.includes(".com")) {
        searchInput.value = "";
        this.filterList(this.elements.conversationsList, "");
      }
    };
    const markUserTyped = () => {
      searchInput.dataset.userTyped = "1";
    };
    searchInput.addEventListener("input", markUserTyped);
    searchInput.addEventListener("keydown", markUserTyped);
    searchInput.addEventListener("paste", markUserTyped);
    searchInput.addEventListener("focus", clearAutofill);
    setTimeout(clearAutofill, 300);
    setTimeout(clearAutofill, 1200);
    let globalSearchTimer = null;
    searchInput.addEventListener("input", () => {
      const term = searchInput.value.trim();
      this.filterList(this.elements.conversationsList, term.toLowerCase());
      if (globalSearchTimer) {
        clearTimeout(globalSearchTimer);
      }
      if (term.length >= 2) {
        globalSearchTimer = setTimeout(() => {
          this.performGlobalSearch(term);
        }, 250);
      } else {
        this.clearGlobalSearch();
      }
    });
  }

  async performGlobalSearch(term) {
    if (!this.elements.conversationsList || !term || term.length < 2) {
      this.clearGlobalSearch();
      return;
    }
    try {
      const res = await window.ApiClient.fetch(`search_users&term=${encodeURIComponent(term)}`);
      const data = await res.json();
      if (!data.success) {
        return;
      }
      this.renderGlobalSearchResults(data, term);
    } catch (err) {
      console.error("Global search error", err);
    }
  }

  clearGlobalSearch() {
    const el = document.getElementById("global-search-container");
    if (el) {
      el.remove();
    }
  }

  renderGlobalSearchResults(data, term) {
    this.clearGlobalSearch();
    const users = (data.users || []).filter(u => Number(u.user_id) !== Number(this.userId));
    const groups = data.groups || [];
    const channels = data.channels || [];

    if (!users.length && !groups.length && !channels.length) {
      return;
    }

    const container = document.createElement("div");
    container.id = "global-search-container";
    container.className = "global-search-container";

    const header = document.createElement("div");
    header.className = "global-search-header";
    header.innerHTML = `<span>Global Search</span>`;
    container.appendChild(header);

    users.forEach((user) => {
      const item = document.createElement("div");
      item.className = "contact-item conversation-item global-search-item";
      const avatarSrc = this.getAvatarUrl(user.profile_pic, user.full_name || user.username, { type: "user" });
      const displayName = user.full_name || user.username || "User";
      const usernameText = user.username ? `@${user.username}` : "";

      item.innerHTML = `
        <div class="contact-avatar">
          <img src="${avatarSrc}" alt="${displayName}">
        </div>
        <div class="contact-info">
          <div class="contact-name">${displayName}</div>
          <div class="contact-preview" style="color: var(--tg-primary, var(--primary-color)); font-size: 12px;">${usernameText}</div>
        </div>
      `;
      item.addEventListener("click", () => {
        this.openChat(user.user_id, "direct", user);
        this.clearGlobalSearch();
        const searchInput = document.getElementById("search-contacts");
        if (searchInput) searchInput.value = "";
        this.filterList(this.elements.conversationsList, "");
      });
      container.appendChild(item);
    });

    groups.forEach((group) => {
      const item = document.createElement("div");
      item.className = "contact-item conversation-item global-search-item";
      const avatarSrc = this.getAvatarUrl(group.group_pic, group.group_name, { type: "group" });
      item.innerHTML = `
        <div class="contact-avatar group-avatar">
          <img src="${avatarSrc}" alt="${group.group_name}">
        </div>
        <div class="contact-info">
          <div class="contact-name">${group.group_name}</div>
          <div class="contact-preview" style="color: var(--text-muted); font-size: 12px;">Public Group • ${group.members_count || 1} members</div>
        </div>
      `;
      item.addEventListener("click", () => {
        this.openChat(group.group_id, "group", group);
        this.clearGlobalSearch();
        const searchInput = document.getElementById("search-contacts");
        if (searchInput) searchInput.value = "";
        this.filterList(this.elements.conversationsList, "");
      });
      container.appendChild(item);
    });

    channels.forEach((channel) => {
      const item = document.createElement("div");
      item.className = "contact-item conversation-item global-search-item";
      const avatarSrc = this.getAvatarUrl(channel.channel_pic, channel.channel_name, { type: "channel" });
      item.innerHTML = `
        <div class="contact-avatar channel-avatar">
          <img src="${avatarSrc}" alt="${channel.channel_name}">
        </div>
        <div class="contact-info">
          <div class="contact-name">${channel.channel_name}</div>
          <div class="contact-preview" style="color: var(--text-muted); font-size: 12px;">Channel • ${channel.subscribers_count || 1} subscribers</div>
        </div>
      `;
      item.addEventListener("click", () => {
        this.openChat(channel.channel_id, "channel", channel);
        this.clearGlobalSearch();
        const searchInput = document.getElementById("search-contacts");
        if (searchInput) searchInput.value = "";
        this.filterList(this.elements.conversationsList, "");
      });
      container.appendChild(item);
    });

    this.elements.conversationsList.appendChild(container);
  }

  filterList(container, term) {
    if (!container) {
      return;
    }
    if (window.telegramZShell && window.telegramZShell.active) {
      window.telegramZShell.filterChats(window.telegramZShell.currentFolder, term);
      return;
    }
    container.querySelectorAll(".contact-item").forEach((item) => {
      const name = (item.dataset.name || "").toLowerCase();
      item.style.display = name.includes(term) ? "flex" : "none";
    });
  }

  handleDraftInput() {
    if (!this.currentChat || !this.elements.messageInput) {
      return;
    }
    this.lastInputAt = Date.now();
    const text = this.elements.messageInput.value || "";
    this.scheduleDraftSave(text);
  }

  resizeComposer() {
    if (!this.elements.messageInput) {
      return;
    }
    const input = this.elements.messageInput;
    if (
      !input ||
      !input.tagName ||
      input.tagName.toLowerCase() !== "textarea"
    ) {
      return;
    }
    input.style.height = "auto";
    const maxHeight = 160;
    const nextHeight = Math.min(input.scrollHeight, maxHeight);
    input.style.height = `${nextHeight}px`;
    input.style.overflowY = input.scrollHeight > maxHeight ? "auto" : "hidden";
  }

  scheduleDraftSave(text) {
    if (!this.currentChat || !this.draftStore) {
      return;
    }
    const chatKey = this.getChatKeyFromChat(this.currentChat);
    if (!chatKey) {
      return;
    }
    if (this.lastDraftKey === chatKey && text === this.lastDraftText) {
      return;
    }
    if (this.draftSaveTimer) {
      clearTimeout(this.draftSaveTimer);
    }
    this.draftSaveTimer = setTimeout(() => {
      this.saveDraft(chatKey, text);
    }, this.draftSaveDelay);
  }

  getConversationByKey(chatKey) {
    if (!chatKey) {
      return null;
    }
    const parts = chatKey.split(":");
    if (parts.length !== 2) {
      return null;
    }
    const type = parts[0];
    const id = parseInt(parts[1], 10);
    if (!type || !id) {
      return null;
    }
    return this.getConversation(id, type);
  }

  findConversationItemByKey(chatKey) {
    if (!this.elements.conversationsList || !chatKey) {
      return null;
    }
    const parts = chatKey.split(":");
    if (parts.length !== 2) {
      return null;
    }
    const type = parts[0];
    const id = parts[1];
    return this.elements.conversationsList.querySelector(
      `.conversation-item[data-chat-type="${type}"][data-chat-id="${id}"]`,
    );
  }

  updateDraftCache(chatKey, text) {
    if (!chatKey) {
      return;
    }
    const trimmed = (text || "").trim();
    if (trimmed) {
      this.draftCache.set(chatKey, text);
    } else {
      this.draftCache.delete(chatKey);
    }
    const conversation = this.getConversationByKey(chatKey);
    const item = this.findConversationItemByKey(chatKey);
    if (conversation && item) {
      this.updateConversationPreview(item, conversation);
    }
  }

  async saveDraft(chatKey, text) {
    if (!this.draftStore || !chatKey) {
      return;
    }
    this.lastDraftKey = chatKey;
    this.lastDraftText = text;
    await this.draftStore.set(chatKey, text);
    this.updateDraftCache(chatKey, text);
  }

  async restoreDraftForChat(chat) {
    if (!this.draftStore || !this.elements.messageInput || !chat) {
      return;
    }
    const chatKey = this.getChatKeyFromChat(chat);
    if (!chatKey) {
      return;
    }
    let text = await this.draftStore.get(chatKey);
    const normalizedDraft = (text || "").trim();
    const lastSent = this.getRememberedSentDraft(chatKey);
    if (normalizedDraft && lastSent && normalizedDraft === lastSent) {
      await this.draftStore.delete(chatKey);
      text = "";
    }
    this.lastDraftKey = chatKey;
    this.lastDraftText = text || "";
    this.elements.messageInput.value = text || "";
    this.resizeComposer();
    this.updateDraftCache(chatKey, text || "");
  }

  async clearDraftForChat(chat) {
    if (!this.draftStore || !chat) {
      return;
    }
    if (this.draftSaveTimer) {
      clearTimeout(this.draftSaveTimer);
      this.draftSaveTimer = null;
    }
    const chatKey = this.getChatKeyFromChat(chat);
    if (!chatKey) {
      return;
    }
    this.lastDraftKey = chatKey;
    this.lastDraftText = "";
    await this.draftStore.delete(chatKey);
    this.updateDraftCache(chatKey, "");
  }

  getLastSentDraftStorageKey(chatKey) {
    if (!this.userId || !chatKey) {
      return null;
    }
    return `lc_last_sent_${this.userId}_${chatKey}`;
  }

  getRememberedSentDraft(chatKey) {
    if (!chatKey) {
      return "";
    }
    if (this.lastSentDraftCache.has(chatKey)) {
      return this.lastSentDraftCache.get(chatKey) || "";
    }
    const key = this.getLastSentDraftStorageKey(chatKey);
    if (!key) {
      return "";
    }
    try {
      const value = localStorage.getItem(key) || "";
      this.lastSentDraftCache.set(chatKey, value);
      return value;
    } catch (err) {
      return "";
    }
  }

  rememberLastSentDraft(chat, text) {
    const chatKey = this.getChatKeyFromChat(chat);
    if (!chatKey) {
      return;
    }
    const normalized = (text || "").trim();
    if (!normalized) {
      return;
    }
    this.lastSentDraftCache.set(chatKey, normalized);
    const key = this.getLastSentDraftStorageKey(chatKey);
    if (!key) {
      return;
    }
    try {
      localStorage.setItem(key, normalized);
    } catch (err) {}
  }

  async loadDraftCache() {
    if (!this.draftStore || this.draftCacheLoaded || !this.userId) {
      return;
    }
    try {
      const items = await this.draftStore.getAll();
      const prefix = `lc_draft_${this.userId}_`;
      items.forEach((item) => {
        const key = item.key || "";
        if (!key.startsWith(prefix)) {
          return;
        }
        const chatKey = key.slice(prefix.length);
        const text = item.text || "";
        if (chatKey && text.trim()) {
          this.draftCache.set(chatKey, text);
        }
      });
    } catch (err) {}
    this.draftCacheLoaded = true;
  }

  getMuteStorageKey() {
    return this.userId ? `lc_chat_mutes_${this.userId}` : "lc_chat_mutes";
  }

  loadMutedChats() {
    const key = this.getMuteStorageKey();
    if (!key) {
      return;
    }
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return;
      }
      parsed.forEach((chatKey) => {
        if (typeof chatKey === "string" && chatKey) {
          this.mutedChats.set(chatKey, true);
        }
      });
    } catch (err) {
      // ignore storage failures
    }
    this.syncMuteFlagsToConversations();
  }

  persistMutedChats() {
    const key = this.getMuteStorageKey();
    if (!key) {
      return;
    }
    const list = Array.from(this.mutedChats.keys());
    try {
      localStorage.setItem(key, JSON.stringify(list));
    } catch (err) {
      // ignore storage failures
    }
  }

  syncMuteFlagsToConversations() {
    this.conversations.forEach((conversation) => {
      const chatKey = this.getConversationKey(conversation);
      if (!chatKey) {
        return;
      }
      conversation.notifications_muted = this.mutedChats.has(chatKey) ? 1 : 0;
    });
  }

  toggleMuteCurrentChat() {
    if (!this.currentChat) {
      return;
    }
    const chatKey = this.getChatKeyFromChat(this.currentChat);
    if (!chatKey) {
      return;
    }
    if (this.mutedChats.has(chatKey)) {
      this.mutedChats.delete(chatKey);
      this.persistMutedChats();
      this.syncMuteFlagsToConversations();
      this.showToast("Chat unmuted");
    } else {
      this.mutedChats.set(chatKey, true);
      this.persistMutedChats();
      this.syncMuteFlagsToConversations();
      this.showToast("Chat muted");
    }
  }

  handleMentionInput() {
    if (!this.elements.messageInput || !this.elements.mentionSuggestList) {
      return;
    }
    const caret = this.elements.messageInput.selectionStart || 0;
    const text = this.elements.messageInput.value || "";
    const trigger = this.findMentionTrigger(text, caret);
    if (!trigger) {
      this.hideMentionSuggest();
      return;
    }
    this.mentionState.active = true;
    this.mentionState.triggerIndex = trigger.index;
    this.mentionState.query = trigger.query;
    this.loadMentionCandidates(trigger.query).then((results) => {
      if (!this.mentionState.active) {
        return;
      }
      this.mentionState.results = results;
      this.mentionState.selectedIndex = 0;
      this.renderMentionSuggest(results);
    });
  }

  handleMentionKeydown(event) {
    if (
      !this.mentionState.active ||
      !this.elements.mentionSuggest ||
      this.elements.mentionSuggest.style.display === "none"
    ) {
      return false;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      this.mentionState.selectedIndex = Math.min(
        this.mentionState.results.length - 1,
        this.mentionState.selectedIndex + 1,
      );
      this.updateMentionSelection();
      return true;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      this.mentionState.selectedIndex = Math.max(
        0,
        this.mentionState.selectedIndex - 1,
      );
      this.updateMentionSelection();
      return true;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      const selected =
        this.mentionState.results[this.mentionState.selectedIndex];
      if (selected) {
        this.applyMentionSelection(selected.user_id, selected.username || "");
      } else {
        this.hideMentionSuggest();
      }
      return true;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      this.hideMentionSuggest();
      return true;
    }
    return false;
  }

  findMentionTrigger(text, caret) {
    if (!text) {
      return null;
    }
    const before = text.slice(0, caret);
    const atIndex = before.lastIndexOf("@");
    if (atIndex === -1) {
      return null;
    }
    if (atIndex > 0 && /[A-Za-z0-9_]/.test(before[atIndex - 1])) {
      return null;
    }
    const query = before.slice(atIndex + 1);
    if (!/^[A-Za-z0-9_]{0,32}$/.test(query)) {
      return null;
    }
    return { index: atIndex, query: query };
  }

  async loadMentionCandidates(query) {
    if (!this.currentChat) {
      return [];
    }
    const term = (query || "").toLowerCase();
    let members = [];
    if (this.currentChat.type === "group") {
      members = await this.getGroupMemberInfo(this.currentChat.id);
    } else if (this.currentChat.type === "channel") {
      members = await this.getChannelMemberInfo(this.currentChat.id);
    } else if (this.currentChat.type === "direct") {
      const conversation =
        this.getConversation(this.currentChat.id, "direct") ||
        this.currentChat.meta ||
        {};
      members = [
        {
          user_id: conversation.user_id || this.currentChat.id,
          username: conversation.username || "",
          full_name: conversation.full_name || "",
        },
      ];
    } else if (this.currentChat.type === "saved") {
      members = [
        {
          user_id: this.userId,
          username: this.userName || "",
          full_name: this.userName || "",
        },
      ];
    }
    if (!members || !members.length) {
      return [];
    }
    return members
      .filter((member) => {
        const username = (member.username || "").toLowerCase();
        const fullName = (member.full_name || "").toLowerCase();
        return !term || username.includes(term) || fullName.includes(term);
      })
      .slice(0, 8);
  }

  renderMentionSuggest(results) {
    if (!this.elements.mentionSuggest || !this.elements.mentionSuggestList) {
      return;
    }
    if (!results.length) {
      this.hideMentionSuggest();
      return;
    }
    this.elements.mentionSuggestList.innerHTML = "";
    results.forEach((member, index) => {
      const item = document.createElement("div");
      item.className = "mention-suggest-item";
      if (index === this.mentionState.selectedIndex) {
        item.classList.add("active");
      }
      item.dataset.mentionId = member.user_id;
      item.dataset.mentionUsername = member.username || "";
      const name = member.full_name || member.username || "User";
      item.innerHTML = `<span class=\"mention-name\">${this.escapeHtml(name)}</span><span class=\"mention-handle\">@${this.escapeHtml(member.username || "")}</span>`;
      this.elements.mentionSuggestList.appendChild(item);
    });
    this.elements.mentionSuggest.style.display = "block";
  }

  updateMentionSelection() {
    if (!this.elements.mentionSuggestList) {
      return;
    }
    const items = Array.from(this.elements.mentionSuggestList.children);
    items.forEach((item, index) => {
      item.classList.toggle(
        "active",
        index === this.mentionState.selectedIndex,
      );
    });
  }

  hideMentionSuggest() {
    if (this.elements.mentionSuggest) {
      this.elements.mentionSuggest.style.display = "none";
    }
    this.mentionState.active = false;
    this.mentionState.results = [];
    this.mentionState.query = "";
    this.mentionState.triggerIndex = -1;
  }

  applyMentionSelection(userId, username) {
    if (!this.elements.messageInput) {
      return;
    }
    const input = this.elements.messageInput;
    const caret = input.selectionStart || 0;
    const start = this.mentionState.triggerIndex;
    if (start < 0) {
      return;
    }
    const before = input.value.slice(0, start);
    const after = input.value.slice(caret);
    const handle = username ? `@${username}` : `@user${userId}`;
    const next = `${before}${handle} ${after}`;
    input.value = next;
    const nextCaret = (before + handle + " ").length;
    input.setSelectionRange(nextCaret, nextCaret);
    input.focus();
    this.lastInputAt = Date.now();
    this.hideMentionSuggest();
    this.scheduleDraftSave(input.value);
  }

  async getMentionsForText(text, chat) {
    if (!text || !chat) {
      return [];
    }
    const matches = text.match(/(^|\\s)@([A-Za-z0-9_]{2,32})/g);
    if (!matches) {
      return [];
    }
    let members = [];
    if (chat.type === "group") {
      members = await this.getGroupMemberInfo(chat.id);
    } else if (chat.type === "channel") {
      members = await this.getChannelMemberInfo(chat.id);
    } else if (chat.type === "direct") {
      const convo = this.getConversation(chat.id, "direct") || chat.meta || {};
      members = [
        {
          user_id: convo.user_id || chat.id,
          username: convo.username || "",
          full_name: convo.full_name || "",
        },
        { user_id: this.userId, username: this.userName || "" },
      ];
    } else if (chat.type === "saved") {
      members = [{ user_id: this.userId, username: this.userName || "" }];
    }
    const memberMap = new Map();
    members.forEach((member) => {
      if (member.username) {
        memberMap.set(member.username.toLowerCase(), member.user_id);
      }
    });
    const ids = new Set();
    matches.forEach((raw) => {
      const match = raw.trim().slice(1);
      const id = memberMap.get(match.toLowerCase());
      if (id) {
        ids.add(id);
      }
    });
    return Array.from(ids);
  }

  async computeContentHash(text) {
    if (!text || typeof crypto === "undefined" || !crypto.subtle) {
      return null;
    }
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(text);
      const hash = await crypto.subtle.digest("SHA-256", data);
      const bytes = new Uint8Array(hash);
      return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    } catch (err) {
      return null;
    }
  }

  loadFolderFilters() {
    if (!this.userId) {
      return;
    }
    const key = `lc_folder_filters_${this.userId}`;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        this.folderFilters.unreadOnly = !!parsed.unreadOnly;
        this.activeFolderId = parsed.activeFolderId || null;
      }
    } catch (err) {}
    if (this.elements.folderUnreadToggle) {
      this.elements.folderUnreadToggle.checked =
        !!this.folderFilters.unreadOnly;
    }
  }

  persistFolderFilters() {
    if (!this.userId) {
      return;
    }
    const key = `lc_folder_filters_${this.userId}`;
    try {
      localStorage.setItem(
        key,
        JSON.stringify({
          unreadOnly: !!this.folderFilters.unreadOnly,
          activeFolderId: this.activeFolderId || null,
        }),
      );
    } catch (err) {}
  }

  updateFolderFilters() {
    if (this.elements.folderUnreadToggle) {
      this.folderFilters.unreadOnly =
        !!this.elements.folderUnreadToggle.checked;
    }
    this.persistFolderFilters();
    this.renderConversations();
  }

  async loadFolders() {
    if (!this.userId) {
      return;
    }
    const res = await window.ApiClient.fetch("folders", { cache: "no-store" });
    const data = await res.json();
    if (!data.success) {
      return;
    }
    this.folders = Array.isArray(data.folders) ? data.folders : [];
    this.folderAssignments = new Map();
    if (data.assignments && typeof data.assignments === "object") {
      Object.keys(data.assignments).forEach((folderId) => {
        const items = data.assignments[folderId] || [];
        const set = new Set();
        items.forEach((entry) => {
          if (!entry || !entry.type || !entry.id) {
            return;
          }
          set.add(`${entry.type}:${entry.id}`);
        });
        this.folderAssignments.set(parseInt(folderId, 10), set);
      });
    }
    if (
      this.activeFolderId &&
      !this.folders.find(
        (folder) => String(folder.id) === String(this.activeFolderId),
      )
    ) {
      this.activeFolderId = null;
    }
    this.renderFolderBar();
  }

  renderFolderBar() {
    if (!this.elements.folderBar || !this.elements.folderList) {
      return;
    }
    this.elements.folderBar.style.display = "flex";
    this.elements.folderList.innerHTML = "";
    const buildFolderButton = (label, id) => {
      const btn = document.createElement("button");
      btn.className = "folder-pill";
      btn.type = "button";
      btn.dataset.folderId = id === null ? "" : String(id);
      btn.textContent = label;
      if (
        (id === null && !this.activeFolderId) ||
        (id !== null && String(id) === String(this.activeFolderId))
      ) {
        btn.classList.add("active");
      }
      btn.addEventListener("click", () => {
        this.setActiveFolder(id);
      });
      return btn;
    };
    this.elements.folderList.appendChild(buildFolderButton("All", null));
    this.folders.forEach((folder) => {
      this.elements.folderList.appendChild(
        buildFolderButton(folder.name, folder.id),
      );
    });
  }

  setActiveFolder(folderId) {
    this.activeFolderId = folderId;
    this.persistFolderFilters();
    this.renderFolderBar();
    this.renderConversations();
  }

  getFilteredConversations() {
    let items = Array.isArray(this.conversations)
      ? this.conversations.slice()
      : [];

    if (window.telegramZShell && window.telegramZShell.active && window.telegramZShell.currentFolder) {
      const tgFolder = window.telegramZShell.currentFolder;
      if (tgFolder === "direct") {
        items = items.filter(c => c.type === "direct" || c.type === "saved");
      } else if (tgFolder === "group") {
        items = items.filter(c => c.type === "group");
      } else if (tgFolder === "channel") {
        items = items.filter(c => c.type === "channel");
      } else if (tgFolder === "unread") {
        items = items.filter(c => Number(c.is_unread || 0) === 1);
      } else if (tgFolder.startsWith("custom-")) {
        const fId = parseInt(tgFolder.replace("custom-", ""), 10);
        const assigned = this.folderAssignments.get(fId) || new Set();
        items = items.filter(c => assigned.has(`${c.type}:${this.getConversationId(c)}`));
      }
    }

    if (this.activeFolderId) {
      const assigned =
        this.folderAssignments.get(parseInt(this.activeFolderId, 10)) ||
        new Set();
      items = items.filter((conversation) => {
        const id = this.getConversationId(conversation);
        if (!id) {
          return false;
        }
        return assigned.has(`${conversation.type}:${id}`);
      });
    }
    if (this.folderFilters.unreadOnly) {
      items = items.filter(
        (conversation) => Number(conversation.is_unread || 0) === 1,
      );
    }
    return this.sanitizeConversations(items);
  }

  openFolderManager() {
    this.ensureFolderManager();
    if (this.elements.folderModal) {
      this.elements.folderModal.style.display = "flex";
      this.renderFolderManager();
    }
  }

  ensureFolderManager() {
    if (this.elements.folderModal) {
      return;
    }
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.id = "folder-modal";
    modal.style.display = "none";
    modal.innerHTML =
      '<div class="modal-content glass-card folder-modal">' +
      '<div class="modal-header"><h3>Folders</h3><button class="btn btn-icon" id="folder-modal-close">' +
      this.iconHtml("close") +
      "</button></div>" +
      '<div class="modal-body">' +
      '<div class="folder-modal-body">' +
      '<div class="folder-modal-left">' +
      '<div class="folder-manage-list" id="folder-manage-list"></div>' +
      '<div class="folder-create-row"><input type="text" id="folder-create-input" class="form-control" placeholder="New folder name" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="text" data-lpignore="true" data-form-type="other" data-1p-ignore="true" data-bwignore="true"><button class="btn btn-secondary" id="folder-create-btn">Add</button></div>' +
      "</div>" +
      '<div class="folder-modal-right">' +
      '<div class="folder-assign-title" id="folder-assign-title">Select a folder</div>' +
      '<div class="folder-assign-list" id="folder-assign-list"></div>' +
      "</div>" +
      "</div>" +
      "</div>" +
      '<div class="modal-footer"><button class="btn btn-primary" id="folder-assign-save">Save</button></div>' +
      "</div>";
    document.body.appendChild(modal);

    this.elements.folderModal = modal;
    this.elements.folderManageList =
      document.getElementById("folder-manage-list");
    this.elements.folderAssignList =
      document.getElementById("folder-assign-list");
    this.elements.folderAssignTitle = document.getElementById(
      "folder-assign-title",
    );
    this.elements.folderCreateInput = document.getElementById(
      "folder-create-input",
    );
    this.elements.folderCreateBtn =
      document.getElementById("folder-create-btn");
    this.elements.folderAssignSave =
      document.getElementById("folder-assign-save");

    const closeBtn = document.getElementById("folder-modal-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        modal.style.display = "none";
      });
    }
    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        modal.style.display = "none";
      }
    });
    if (this.elements.folderCreateBtn) {
      this.elements.folderCreateBtn.addEventListener("click", () =>
        this.createFolderFromInput(),
      );
    }
    if (this.elements.folderAssignSave) {
      this.elements.folderAssignSave.addEventListener("click", () =>
        this.saveFolderAssignments(),
      );
    }
  }

  async createFolderFromInput() {
    if (!this.elements.folderCreateInput) {
      return;
    }
    const name = this.elements.folderCreateInput.value.trim();
    if (!name) {
      return;
    }
    const res = await window.ApiClient.fetch("folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", name: name }),
    });
    const data = await res.json();
    if (data.success && data.folder) {
      this.elements.folderCreateInput.value = "";
      await this.loadFolders();
      this.renderFolderManager();
    }
  }

  renderFolderManager() {
    if (!this.elements.folderManageList || !this.elements.folderAssignList) {
      return;
    }
    this.elements.folderManageList.innerHTML = "";
    this.folders.forEach((folder, index) => {
      const row = document.createElement("div");
      row.className = "folder-manage-row";
      if (String(folder.id) === String(this.folderManageState.selectedId)) {
        row.classList.add("active");
      }
      const label = document.createElement("button");
      label.type = "button";
      label.className = "folder-manage-name";
      label.textContent = folder.name;
      label.addEventListener("click", () => {
        this.folderManageState.selectedId = folder.id;
        const assigned =
          this.folderAssignments.get(parseInt(folder.id, 10)) || new Set();
        this.folderManageState.assignments = new Set(Array.from(assigned));
        this.renderFolderManager();
      });
      const actions = document.createElement("div");
      actions.className = "folder-manage-actions";
      const up = document.createElement("button");
      up.type = "button";
      up.className = "btn btn-icon folder-action folder-action-up";
      up.innerHTML = this.iconHtml("arrow-left");
      up.title = "Move up";
      up.disabled = index === 0;
      up.addEventListener("click", () => this.moveFolder(folder.id, -1));
      const down = document.createElement("button");
      down.type = "button";
      down.className = "btn btn-icon folder-action folder-action-down";
      down.innerHTML = this.iconHtml("arrow-left");
      down.title = "Move down";
      down.disabled = index === this.folders.length - 1;
      down.addEventListener("click", () => this.moveFolder(folder.id, 1));
      const rename = document.createElement("button");
      rename.type = "button";
      rename.className = "btn btn-icon folder-action";
      rename.innerHTML = this.iconHtml("edit");
      rename.title = "Rename";
      rename.addEventListener("click", () => this.renameFolder(folder));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "btn btn-icon folder-action";
      remove.innerHTML = this.iconHtml("trash");
      remove.title = "Delete";
      remove.addEventListener("click", () => this.deleteFolder(folder));
      actions.appendChild(up);
      actions.appendChild(down);
      actions.appendChild(rename);
      actions.appendChild(remove);
      row.appendChild(label);
      row.appendChild(actions);
      this.elements.folderManageList.appendChild(row);
    });
    this.renderFolderAssignmentsList();
  }

  renderFolderAssignmentsList() {
    if (!this.elements.folderAssignList || !this.elements.folderAssignTitle) {
      return;
    }
    const folderId = this.folderManageState.selectedId;
    if (!folderId) {
      this.elements.folderAssignTitle.textContent = "Select a folder";
      this.elements.folderAssignList.innerHTML =
        '<div class=\"settings-empty\">Choose a folder to assign chats.</div>';
      return;
    }
    const folder = this.folders.find(
      (item) => String(item.id) === String(folderId),
    );
    this.elements.folderAssignTitle.textContent = folder
      ? `Chats in ${folder.name}`
      : "Chats in folder";
    const assignments = this.folderManageState.assignments || new Set();
    const conversations = this.conversations || [];
    if (!conversations.length) {
      this.elements.folderAssignList.innerHTML =
        '<div class=\"settings-empty\">No chats available.</div>';
      return;
    }
    this.elements.folderAssignList.innerHTML = "";
    conversations.forEach((conversation) => {
      const id = this.getConversationId(conversation);
      if (!id) {
        return;
      }
      const key = `${conversation.type}:${id}`;
      const row = document.createElement("label");
      row.className = "folder-assign-row";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = assignments.has(key);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          assignments.add(key);
        } else {
          assignments.delete(key);
        }
      });
      const text = document.createElement("span");
      text.textContent = this.getConversationName(conversation);
      row.appendChild(checkbox);
      row.appendChild(text);
      this.elements.folderAssignList.appendChild(row);
    });
    this.folderManageState.assignments = assignments;
  }

  async moveFolder(folderId, direction) {
    const index = this.folders.findIndex(
      (folder) => String(folder.id) === String(folderId),
    );
    if (index === -1) {
      return;
    }
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= this.folders.length) {
      return;
    }
    const updated = this.folders.slice();
    const [moved] = updated.splice(index, 1);
    updated.splice(nextIndex, 0, moved);
    const order = updated.map((item) => item.id);
    await window.ApiClient.fetch("folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reorder", order: order }),
    });
    this.folders = updated;
    this.renderFolderBar();
    this.renderFolderManager();
  }

  async renameFolder(folder) {
    if (!folder) {
      return;
    }
    const showDlg = (window.telegramZShell && typeof window.telegramZShell.showDialog === 'function')
      ? (opt) => window.telegramZShell.showDialog(opt)
      : (window.TelegramZ && typeof window.TelegramZ.showDialog === 'function')
        ? (opt) => window.TelegramZ.showDialog(opt)
        : null;

    if (showDlg) {
      showDlg({
        title: "Rename Folder",
        subtitle: "Enter a new name for this folder.",
        fields: [{ id: "name", label: "Folder Name", value: folder.name || "", placeholder: "Folder name", required: true }],
        confirmText: "Save",
        cancelText: "Cancel",
        onSubmit: async (values, setStatus) => {
          const name = (values.name || "").trim();
          if (!name) {
            setStatus("Folder name cannot be empty");
            return false;
          }
          await window.ApiClient.fetch("folders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "rename",
              folder_id: folder.id,
              name: name,
            }),
          });
          await this.loadFolders();
          this.renderFolderManager();
          return true;
        }
      });
      return;
    }

    const overlay = document.createElement("div");
    overlay.className = "modal";
    overlay.style.display = "flex";
    overlay.style.zIndex = "10005";
    overlay.innerHTML = `
      <div class="modal-content glass-card" style="max-width:360px; padding:20px;">
        <div class="modal-header" style="border:none; padding:0 0 12px 0;">
          <h3 style="margin:0; font-size:17px;">Rename Folder</h3>
        </div>
        <div class="modal-body" style="padding:0;">
          <input type="text" class="input-field" id="rename-folder-input" value="${(folder.name || "").replace(/"/g, "&quot;")}" placeholder="Folder name" style="width:100%; box-sizing:border-box; margin-bottom:16px;" />
        </div>
        <div class="modal-footer" style="border:none; padding:0; display:flex; justify-content:flex-end; gap:8px;">
          <button class="btn btn-secondary btn-cancel-rename" type="button">Cancel</button>
          <button class="btn btn-primary btn-save-rename" type="button">Save</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const inp = overlay.querySelector("#rename-folder-input");
    setTimeout(() => { inp?.focus(); inp?.select(); }, 50);

    const close = () => { overlay.remove(); };
    overlay.querySelector(".btn-cancel-rename").onclick = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };

    const save = async () => {
      const name = (inp.value || "").trim();
      if (!name) return;
      close();
      await window.ApiClient.fetch("folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "rename",
          folder_id: folder.id,
          name: name,
        }),
      });
      await this.loadFolders();
      this.renderFolderManager();
    };
    overlay.querySelector(".btn-save-rename").onclick = save;
    inp.onkeydown = (e) => { if (e.key === "Enter") save(); if (e.key === "Escape") close(); };
  }

  async deleteFolder(folder) {
    if (!folder) {
      return;
    }
    const confirm = await this.confirmAction("Delete this folder?");
    if (!confirm) {
      return;
    }
    await window.ApiClient.fetch("folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", folder_id: folder.id }),
    });
    if (String(this.activeFolderId) === String(folder.id)) {
      this.activeFolderId = null;
    }
    await this.loadFolders();
    this.renderFolderManager();
    this.renderConversations();
  }

  async saveFolderAssignments() {
    const folderId = this.folderManageState.selectedId;
    if (!folderId) {
      return;
    }
    const assignments = Array.from(this.folderManageState.assignments || []);
    const chats = assignments
      .map((entry) => {
        const parts = entry.split(":");
        return { type: parts[0], id: parseInt(parts[1], 10) };
      })
      .filter((item) => item.type && item.id);
    const res = await window.ApiClient.fetch("folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "assign",
        folder_id: folderId,
        chats: chats,
      }),
    });
    let data = null;
    try {
      data = await res.json();
    } catch (err) {}
    if (!res.ok || !data || !data.success) {
      this.showToast(
        data && data.message ? data.message : "Unable to save folder",
      );
      return;
    }
    this.showToast("Folder saved");
    await this.loadFolders();
    this.renderFolderManager();
    this.renderConversations();
  }

  resetChatSearch() {
    if (this.chatSearchTimer) {
      clearTimeout(this.chatSearchTimer);
      this.chatSearchTimer = null;
    }
    this.chatSearch = {
      query: "",
      results: [],
      index: 0,
      busy: false,
      beforeId: 0,
      hasMore: true,
    };
    this.updateSearchHighlights("");
    if (this.elements.chatSearchModal) {
      this.elements.chatSearchModal.style.display = "none";
    }
    if (window.TelegramZ && typeof window.TelegramZ.closeMiddleSearch === "function") {
      window.TelegramZ.closeMiddleSearch();
    }
  }

  openChatSearch() {
    if (!this.currentChat) {
      return;
    }
    if (window.TelegramZ && window.TelegramZ.active && typeof window.TelegramZ.openMiddleSearch === "function") {
      window.TelegramZ.openMiddleSearch();
      return;
    }
    this.ensureChatSearchModal();
    if (this.elements.chatSearchModal) {
      this.elements.chatSearchModal.style.display = "flex";
    }
    if (this.elements.chatSearchInput) {
      this.elements.chatSearchInput.value = this.chatSearch.query || "";
      this.elements.chatSearchInput.focus();
    }
    this.renderSearchResults();
    if (this.chatSearch.query) {
      this.runChatSearch(this.chatSearch.query);
    }
  }

  closeChatSearch() {
    if (window.TelegramZ && typeof window.TelegramZ.closeMiddleSearch === "function") {
      window.TelegramZ.closeMiddleSearch();
    }
    this.resetChatSearch();
  }

  ensureChatSearchModal() {
    if (this.elements.chatSearchModal) {
      return;
    }
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.id = "chat-search-modal";
    modal.style.display = "none";
    modal.innerHTML =
      '<div class="modal-content glass-card chat-settings-modal">' +
      '<div class="modal-header"><h3>Search in chat</h3><button class="btn btn-icon" id="chat-search-close">' +
      this.iconHtml("close") +
      "</button></div>" +
      '<div class="modal-body">' +
      '<div class="chat-search-panel">' +
      '<div class="chat-search-row">' +
      '<input type="text" id="chat-search-input" class="form-control" placeholder="Search in chat..." autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="text" data-lpignore="true" data-form-type="other" data-1p-ignore="true" data-bwignore="true">' +
      '<button class="btn btn-icon chat-search-nav" id="chat-search-prev" title="Previous result">' +
      this.iconHtml("arrow-left") +
      "</button>" +
      '<button class="btn btn-icon chat-search-nav chat-search-next" id="chat-search-next" title="Next result">' +
      this.iconHtml("arrow-left") +
      "</button>" +
      "</div>" +
      '<div class="chat-search-results" id="chat-search-results"></div>' +
      '<div class="chat-search-footer">' +
      '<div class="chat-search-count" id="chat-search-count"></div>' +
      '<button class="btn btn-secondary" id="chat-search-more">Load more history</button>' +
      "</div>" +
      "</div>" +
      "</div>" +
      "</div>";
    document.body.appendChild(modal);

    this.elements.chatSearchModal = modal;
    this.elements.chatSearchInput =
      document.getElementById("chat-search-input");
    this.elements.chatSearchResults = document.getElementById(
      "chat-search-results",
    );
    this.elements.chatSearchPrev = document.getElementById("chat-search-prev");
    this.elements.chatSearchNext = document.getElementById("chat-search-next");
    this.elements.chatSearchMore = document.getElementById("chat-search-more");
    this.elements.chatSearchClose =
      document.getElementById("chat-search-close");
    this.elements.chatSearchCount =
      document.getElementById("chat-search-count");

    if (this.elements.chatSearchClose) {
      this.elements.chatSearchClose.addEventListener("click", () =>
        this.closeChatSearch(),
      );
    }
    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        this.closeChatSearch();
      }
    });
    if (this.elements.chatSearchInput) {
      this.elements.chatSearchInput.addEventListener("input", () => {
        const query = this.elements.chatSearchInput.value.trim();
        if (this.chatSearchTimer) {
          clearTimeout(this.chatSearchTimer);
        }
        this.chatSearchTimer = setTimeout(() => {
          this.runChatSearch(query);
        }, 300);
      });
    }
    if (this.elements.chatSearchPrev) {
      this.elements.chatSearchPrev.addEventListener("click", () =>
        this.navigateSearch(-1),
      );
    }
    if (this.elements.chatSearchNext) {
      this.elements.chatSearchNext.addEventListener("click", () =>
        this.navigateSearch(1),
      );
    }
    if (this.elements.chatSearchMore) {
      this.elements.chatSearchMore.addEventListener("click", () => {
        if (this.chatSearch.query) {
          this.loadMoreHistoryForSearch(this.chatSearch.query);
        }
      });
    }
    if (this.elements.chatSearchResults) {
      this.elements.chatSearchResults.addEventListener("click", (event) => {
        const item = event.target.closest("[data-search-index]");
        if (!item) {
          return;
        }
        const index = parseInt(item.dataset.searchIndex, 10);
        if (Number.isNaN(index)) {
          return;
        }
        this.jumpToSearchResult(index);
      });
    }
  }

  navigateSearch(delta) {
    if (!this.chatSearch.results.length) {
      return;
    }
    let nextIndex = this.chatSearch.index + delta;
    if (nextIndex < 0) {
      nextIndex = this.chatSearch.results.length - 1;
    } else if (nextIndex >= this.chatSearch.results.length) {
      nextIndex = 0;
    }
    this.jumpToSearchResult(nextIndex);
  }

  async runChatSearch(query) {
    if (!this.currentChat) {
      return;
    }
    const term = (query || "").trim();
    this.chatSearch.query = term;
    this.updateSearchHighlights(term);
    if (!term) {
      this.chatSearch.results = [];
      this.chatSearch.index = 0;
      this.chatSearch.beforeId = 0;
      this.chatSearch.hasMore = true;
      this.renderSearchResults();
      return;
    }
    this.chatSearch.busy = true;
    this.renderSearchResults();
    const results = await this.searchMessagesList(
      this.getSearchableMessages(),
      term,
    );
    this.chatSearch.results = results;
    this.chatSearch.index = results.length ? 0 : -1;
    this.chatSearch.beforeId = this.getOldestMessageId();
    this.chatSearch.hasMore = this.chatSearch.beforeId > 0;
    if (!results.length && this.chatSearch.hasMore) {
      await this.loadMoreHistoryForSearch(term, { initial: true, force: true });
    }
    this.chatSearch.busy = false;
    this.renderSearchResults();
    if (this.chatSearch.index >= 0) {
      this.setSearchActiveIndex(this.chatSearch.index);
    }
  }

  getSearchableMessages() {
    if (!this.currentChat) {
      return [];
    }
    const cache = this.loadConversationCache(this.currentChat);
    if (cache && cache.messages && cache.messages.length) {
      return cache.messages;
    }
    return Array.from(this.messageCache.values());
  }

  getOldestMessageId() {
    let oldest = 0;
    const messages = this.getSearchableMessages();
    messages.forEach((msg) => {
      const id = parseInt(msg.message_id, 10);
      if (!Number.isFinite(id) || id <= 0) {
        return;
      }
      if (!oldest || id < oldest) {
        oldest = id;
      }
    });
    return oldest;
  }

  async searchMessagesList(messages, term) {
    const results = [];
    const seen = new Set();
    const lowerTerm = term.toLowerCase();
    for (const message of messages) {
      if (!message) {
        continue;
      }
      const messageId = parseInt(message.message_id, 10);
      if (Number.isFinite(messageId) && seen.has(messageId)) {
        continue;
      }
      const fields = await this.getSearchFields(message);
      const text = fields.text || "";
      const sender = fields.sender || "";
      const haystack = (text + " " + sender).trim().toLowerCase();
      if (!haystack || !haystack.includes(lowerTerm)) {
        continue;
      }
      results.push({
        message_id: message.message_id,
        created_at: message.created_at,
        text: text,
        sender: sender,
        message_type: message.message_type,
      });
      if (Number.isFinite(messageId)) {
        seen.add(messageId);
      }
    }
    results.sort((a, b) => {
      const aId = parseInt(a.message_id, 10) || 0;
      const bId = parseInt(b.message_id, 10) || 0;
      return bId - aId;
    });
    return results;
  }

  async getSearchFields(message) {
    await this.ensureMessageSearchFields(message);
    let text = "";
    if (message.message_type === "text") {
      const parsed = this.extractTextPayload(message._plaintext || "");
      text = parsed.text || "";
    } else if (message._meta && message._meta.caption) {
      text = message._meta.caption;
    }
    const sender = message.username || "";
    return { text, sender };
  }

  async ensureMessageSearchFields(message) {
    if (!message) {
      return;
    }
    if (message.message_type === "text") {
      if (!message._plaintext && message.encrypted_content) {
        try {
          const decrypted = await this.decryptMessage(message);
          if (decrypted && decrypted.plaintext) {
            const parsed = this.extractTextPayload(decrypted.plaintext);
            message._plaintext = parsed.text || "";
            this.messageCache.set(message.message_id, message);
          }
        } catch (err) {}
      }
      return;
    }
    if (message._meta && message._meta.caption) {
      return;
    }
    if (message._plaintext) {
      try {
        const parsed = JSON.parse(message._plaintext);
        if (parsed && typeof parsed === "object") {
          message._meta = Object.assign({}, message._meta || {}, parsed);
          this.messageCache.set(message.message_id, message);
          return;
        }
      } catch (err) {}
    }
    if (message.encrypted_content) {
      try {
        const decrypted = await this.decryptMessage(message);
        if (decrypted && decrypted.plaintext) {
          const parsed = JSON.parse(decrypted.plaintext);
          if (parsed && typeof parsed === "object") {
            message._meta = Object.assign({}, message._meta || {}, parsed);
            this.messageCache.set(message.message_id, message);
          }
        }
      } catch (err) {}
    }
  }

  async loadMoreHistoryForSearch(term, options) {
    const allowBusy = options && options.force;
    if (
      !this.currentChat ||
      (!allowBusy && this.chatSearch.busy) ||
      !this.chatSearch.hasMore
    ) {
      return;
    }
    this.chatSearch.busy = true;
    this.renderSearchResults();
    const beforeId = this.chatSearch.beforeId || this.getOldestMessageId();
    const batch = await this.fetchHistoryBatch(beforeId);
    if (!batch.length) {
      this.chatSearch.hasMore = false;
      this.chatSearch.busy = false;
      this.renderSearchResults();
      return;
    }
    await this.prependMessages(batch, { fromSearch: true });
    const minId = batch.reduce((min, msg) => {
      const id = parseInt(msg.message_id, 10) || min;
      return !min || id < min ? id : min;
    }, 0);
    if (minId) {
      this.chatSearch.beforeId = minId;
    }
    this.chatSearch.hasMore = batch.length === 50;
    const newResults = await this.searchMessagesList(batch, term);
    const combined = new Map();
    (this.chatSearch.results || []).forEach((result) => {
      combined.set(String(result.message_id), result);
    });
    newResults.forEach((result) => {
      combined.set(String(result.message_id), result);
    });
    this.chatSearch.results = Array.from(combined.values()).sort((a, b) => {
      const aId = parseInt(a.message_id, 10) || 0;
      const bId = parseInt(b.message_id, 10) || 0;
      return bId - aId;
    });
    if (!this.chatSearch.results.length && !options?.initial) {
      this.chatSearch.hasMore = batch.length > 0;
    }
    this.chatSearch.busy = false;
    this.renderSearchResults();
  }

  async fetchHistoryBatch(beforeId) {
    if (!this.currentChat) {
      return [];
    }
    const chatType = this.currentChat.type;
    const chatId = this.currentChat.id;
    let url = window.ApiClient.url("messages_history", { chat_type: chatType, chat_id: chatId });
    if (beforeId && Number.isFinite(beforeId)) {
      url += `&before_id=${beforeId}`;
    }
    url += "&limit=50";
    try {
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json();
      if (data.success && Array.isArray(data.messages)) {
        return data.messages;
      }
    } catch (err) {}
    return [];
  }

  renderSearchResults() {
    if (!this.elements.chatSearchResults) {
      return;
    }
    const list = this.elements.chatSearchResults;
    const count = this.elements.chatSearchCount;
    list.innerHTML = "";
    if (!this.chatSearch.query) {
      list.innerHTML =
        '<div class="settings-empty">Type to search this chat.</div>';
      if (count) {
        count.textContent = "";
      }
      if (this.elements.chatSearchMore) {
        this.elements.chatSearchMore.style.display = "none";
      }
      return;
    }
    if (this.chatSearch.busy && !this.chatSearch.results.length) {
      list.innerHTML = '<div class="spinner"></div>';
      return;
    }
    if (!this.chatSearch.results.length) {
      list.innerHTML = '<div class="settings-empty">No results found.</div>';
      if (count) {
        count.textContent = "0 results";
      }
    } else {
      this.chatSearch.results.forEach((result, index) => {
        const item = document.createElement("div");
        item.className = "chat-search-item";
        if (index === this.chatSearch.index) {
          item.classList.add("active");
        }
        item.dataset.searchIndex = String(index);
        const snippet = document.createElement("div");
        const preview =
          result.text ||
          this.getMessageTypeLabel(result.message_type || "text");
        this.appendHighlightedText(
          snippet,
          this.truncate(preview, 120),
          this.chatSearch.query,
        );
        const meta = document.createElement("div");
        meta.className = "chat-search-meta";
        const stamp = result.created_at
          ? this.formatFullDateTime(result.created_at)
          : "";
        const sender = result.sender ? `${result.sender} \u2022 ` : "";
        meta.textContent = sender + stamp;
        item.appendChild(snippet);
        item.appendChild(meta);
        list.appendChild(item);
      });
      if (count) {
        count.textContent = `${this.chatSearch.results.length} result${this.chatSearch.results.length === 1 ? "" : "s"}`;
      }
    }
    if (this.elements.chatSearchMore) {
      this.elements.chatSearchMore.style.display = this.chatSearch.hasMore
        ? "inline-flex"
        : "none";
    }
    if (window.TelegramZ && typeof window.TelegramZ.syncMiddleSearchResults === "function") {
      window.TelegramZ.syncMiddleSearchResults();
    }
  }

  setSearchActiveIndex(index) {
    this.chatSearch.index = index;
    if (window.TelegramZ && typeof window.TelegramZ.syncMiddleSearchResults === "function") {
      window.TelegramZ.syncMiddleSearchResults();
    }
    if (!this.elements.chatSearchResults) {
      return;
    }
    Array.from(this.elements.chatSearchResults.children).forEach(
      (child, idx) => {
        child.classList.toggle("active", idx === index);
      },
    );
  }

  async jumpToSearchResult(index) {
    const result = this.chatSearch.results[index];
    if (!result) {
      return;
    }
    this.setSearchActiveIndex(index);
    const messageId = parseInt(result.message_id, 10);
    if (!Number.isFinite(messageId)) {
      return;
    }
    if (!this.messageElements.get(messageId)) {
      await this.ensureMessageLoaded(messageId);
    }
    this.scrollToMessage(messageId);
  }

  async ensureMessageLoaded(messageId) {
    if (!this.currentChat) {
      return;
    }
    let attempts = 0;
    let beforeId = this.chatSearch.beforeId || this.getOldestMessageId();
    while (
      attempts < 6 &&
      beforeId > 0 &&
      !this.messageElements.get(messageId)
    ) {
      const batch = await this.fetchHistoryBatch(beforeId);
      if (!batch.length) {
        this.chatSearch.hasMore = false;
        break;
      }
      await this.prependMessages(batch, { fromSearch: true });
      const minId = batch.reduce((min, msg) => {
        const id = parseInt(msg.message_id, 10) || min;
        return !min || id < min ? id : min;
      }, 0);
      if (minId) {
        beforeId = minId;
        this.chatSearch.beforeId = minId;
      }
      attempts += 1;
    }
  }

  updateSearchHighlights(query) {
    if (!this.currentChat) {
      return;
    }
    const term = (query || "").trim();
    this.messageElements.forEach((element, messageId) => {
      const message = this.messageCache.get(messageId);
      if (!message || !element) {
        return;
      }
      if (message.message_type === "text") {
        const textEl = element.querySelector(".message-text");
        if (textEl && message._plaintext) {
          this.renderMessageText(textEl, message, term);
        }
      } else {
        const captionText =
          message._meta && message._meta.caption ? message._meta.caption : null;
        if (!captionText) {
          return;
        }
        element.querySelectorAll(".file-caption").forEach((caption) => {
          this.renderCaptionText(caption, captionText, message, term);
        });
      }
    });
  }

  appendHighlightedText(container, text, query) {
    if (!query) {
      container.appendChild(document.createTextNode(text));
      return;
    }
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    let index = 0;
    while (index < text.length) {
      const matchIndex = lowerText.indexOf(lowerQuery, index);
      if (matchIndex === -1) {
        container.appendChild(document.createTextNode(text.slice(index)));
        break;
      }
      if (matchIndex > index) {
        container.appendChild(
          document.createTextNode(text.slice(index, matchIndex)),
        );
      }
      const mark = document.createElement("span");
      mark.className = "search-highlight";
      mark.textContent = text.slice(matchIndex, matchIndex + lowerQuery.length);
      container.appendChild(mark);
      index = matchIndex + lowerQuery.length;
    }
  }

  buildMentionMap(message) {
    const mentionIds = Array.isArray(message && message.mentions)
      ? message.mentions
      : [];
    const mentionMap = new Map();
    if (!mentionIds.length) {
      return mentionMap;
    }
    let members = [];
    if (message && message.group_id) {
      members = this.groupMemberInfoCache.get(message.group_id) || [];
    } else if (message && message.channel_id) {
      members = this.channelMemberInfoCache.get(message.channel_id) || [];
    } else if (message && (message.receiver_id || message.sender_id)) {
      const otherId =
        message.sender_id === this.userId
          ? message.receiver_id
          : message.sender_id;
      const convo = otherId
        ? this.getConversation(otherId, "direct") || {}
        : {};
      members = [
        { user_id: otherId, username: convo.username || "" },
        { user_id: this.userId, username: this.userName || "" },
      ];
    }
    members.forEach((member) => {
      if (!member || !member.username) {
        return;
      }
      mentionMap.set(member.username.toLowerCase(), {
        user_id: member.user_id,
        username: member.username,
      });
    });
    return mentionMap;
  }

  renderTextWithMentions(element, text, message, query) {
    if (!element) {
      return;
    }
    const mentionMap = this.buildMentionMap(message);
    if (!mentionMap.size) {
      this.appendHighlightedText(element, text, query || "");
      return;
    }
    const regex = /@([A-Za-z0-9_]{2,32})/g;
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const matchStart = match.index;
      const matchText = match[0];
      const handle = match[1].toLowerCase();
      const info = mentionMap.get(handle);
      if (!info) {
        continue;
      }
      if (matchStart > lastIndex) {
        this.appendHighlightedText(
          element,
          text.slice(lastIndex, matchStart),
          query || "",
        );
      }
      const span = document.createElement("span");
      span.className = "mention-token";
      if (query && matchText.toLowerCase().includes(query.toLowerCase())) {
        span.classList.add("search-highlight");
      }
      span.textContent = matchText;
      span.dataset.userId = info.user_id;
      span.addEventListener("click", () => {
        if (info.user_id) {
          this.openProfile({
            type: "direct",
            user_id: info.user_id,
            username: info.username,
          });
        }
      });
      element.appendChild(span);
      lastIndex = matchStart + matchText.length;
    }
    if (lastIndex < text.length) {
      this.appendHighlightedText(element, text.slice(lastIndex), query || "");
    }
  }

  renderCaptionText(element, text, message, query) {
    if (!element) {
      return;
    }
    const value = text == null ? "" : String(text);
    element.textContent = "";
    element.setAttribute("dir", this.getTextDirection(value));
    this.renderTextWithMentions(element, value, message, query);
    this.parseTwemoji(element);
  }

  parseFencedBlocks(text) {
    if (typeof text !== "string" || !text.includes("```")) {
      return null;
    }
    const parts = [];
    let index = 0;
    while (index < text.length) {
      const start = text.indexOf("```", index);
      if (start === -1) {
        break;
      }
      const end = text.indexOf("```", start + 3);
      if (end === -1) {
        return null;
      }
      if (start > index) {
        parts.push({ type: "text", content: text.slice(index, start) });
      }
      let lang = "";
      let codeStart = start + 3;
      if (text[codeStart] === "\r" && text[codeStart + 1] === "\n") {
        codeStart += 2;
      } else if (text[codeStart] === "\n") {
        codeStart += 1;
      } else {
        const newline = text.indexOf("\n", codeStart);
        if (newline !== -1 && newline < end) {
          lang = text.slice(codeStart, newline).trim();
          codeStart = newline + 1;
        }
      }
      const code = text.slice(codeStart, end);
      parts.push({ type: "code", content: code, lang: lang });
      index = end + 3;
    }
    if (!parts.length) {
      return null;
    }
    if (index < text.length) {
      parts.push({ type: "text", content: text.slice(index) });
    }
    return parts;
  }

  getPreviewFromMarkdown(text) {
    if (typeof text !== "string") {
      return "";
    }
    const blocks = this.parseFencedBlocks(text);
    if (!blocks) {
      return text;
    }
    const textParts = blocks
      .filter((part) => part.type === "text")
      .map((part) => part.content || "")
      .join("");
    const trimmed = textParts.trim();
    if (!trimmed) {
      return "Code";
    }
    const firstLine = trimmed.split(/\r?\n/).find((line) => line.trim() !== "");
    return firstLine ? firstLine.trim() : "Code";
  }

  normalizeCodeLanguage(lang) {
    if (!lang) {
      return "";
    }
    const lower = String(lang).trim().toLowerCase();
    if (lower === "javascript" || lower === "jsx") {
      return "js";
    }
    if (lower === "typescript" || lower === "tsx") {
      return "ts";
    }
    if (lower === "shell" || lower === "sh" || lower === "zsh") {
      return "bash";
    }
    return lower;
  }

  getHighlightRules(lang) {
    const rules = [];
    const add = (pattern, className) => {
      rules.push({ regex: new RegExp(pattern, "g"), className: className });
    };
    const language = this.normalizeCodeLanguage(lang);
    if (language === "js" || language === "ts") {
      add("\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/", "comment");
      add(
        "`(?:\\\\.|[^`\\\\])*`|\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*'",
        "string",
      );
      add(
        "\\b(const|let|var|function|return|if|else|for|while|switch|case|break|continue|new|class|extends|async|await|try|catch|throw|import|from|export|default|this)\\b",
        "keyword",
      );
      add("\\b(true|false|null|undefined)\\b", "boolean");
      add("\\b[0-9]+(\\.[0-9]+)?\\b", "number");
    } else if (language === "html") {
      add("<!--([\\s\\S]*?)-->", "comment");
      add("<\\/?[A-Za-z][^\\s>]*", "tag");
      add("\\b[A-Za-z-:]+(?=\\=)", "attr");
      add("\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*'", "string");
    } else if (language === "css") {
      add("\\/\\*[\\s\\S]*?\\*\\/", "comment");
      add("\"([^\"\\\\]|\\\\.)*\"|'([^'\\\\]|\\\\.)*'", "string");
      add("\\b(@media|@keyframes|@import|@supports|@font-face)\\b", "keyword");
      add("\\#[0-9a-fA-F]{3,6}\\b", "number");
      add("\\b[0-9]+(\\.[0-9]+)?(px|em|rem|vh|vw|%)?\\b", "number");
    } else if (language === "json") {
      add('"([^"\\\\]|\\\\.)*"(?=\\s*:)', "attr");
      add('"(?:\\\\.|[^"\\\\])*"', "string");
      add("\\b(true|false|null)\\b", "boolean");
      add("\\b[0-9]+(\\.[0-9]+)?\\b", "number");
    } else if (language === "php") {
      add("\\/\\/[^\\n]*|#.*|\\/\\*[\\s\\S]*?\\*\\/", "comment");
      add("\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*'", "string");
      add(
        "\\b(function|class|public|private|protected|return|if|else|foreach|as|try|catch|throw|new)\\b",
        "keyword",
      );
      add("\\b(true|false|null)\\b", "boolean");
      add("\\b[0-9]+(\\.[0-9]+)?\\b", "number");
    } else if (language === "python") {
      add("#[^\\n]*", "comment");
      add(
        "\"\"\"[\\s\\S]*?\"\"\"|'''[\\s\\S]*?'''|\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*'",
        "string",
      );
      add(
        "\\b(def|class|return|if|else|elif|for|while|try|except|import|from|as|with|lambda)\\b",
        "keyword",
      );
      add("\\b(True|False|None)\\b", "boolean");
      add("\\b[0-9]+(\\.[0-9]+)?\\b", "number");
    } else if (language === "sql") {
      add("--[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/", "comment");
      add("\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*'", "string");
      add(
        "\\b(SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|JOIN|LEFT|RIGHT|INNER|OUTER|GROUP|BY|ORDER|LIMIT|VALUES|INTO|AS|ON|AND|OR)\\b",
        "keyword",
      );
      add("\\b[0-9]+(\\.[0-9]+)?\\b", "number");
    } else if (language === "bash") {
      add("#[^\\n]*", "comment");
      add("\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*'", "string");
      add(
        "\\b(if|then|else|elif|fi|for|in|do|done|case|esac|export|function)\\b",
        "keyword",
      );
      add("\\b[0-9]+\\b", "number");
    } else {
      add("\"([^\"\\\\]|\\\\.)*\"|'([^'\\\\]|\\\\.)*'", "string");
      add("\\b[0-9]+(\\.[0-9]+)?\\b", "number");
    }
    return rules;
  }

  highlightCodeFragment(code, lang) {
    const fragment = document.createDocumentFragment();
    if (!code) {
      return fragment;
    }
    const rules = this.getHighlightRules(lang);
    if (!rules.length) {
      fragment.appendChild(document.createTextNode(code));
      return fragment;
    }
    let index = 0;
    while (index < code.length) {
      let nextMatch = null;
      let nextRule = null;
      for (const rule of rules) {
        rule.regex.lastIndex = index;
        const match = rule.regex.exec(code);
        if (match && (nextMatch === null || match.index < nextMatch.index)) {
          nextMatch = match;
          nextRule = rule;
        }
      }
      if (!nextMatch) {
        fragment.appendChild(document.createTextNode(code.slice(index)));
        break;
      }
      if (nextMatch.index > index) {
        fragment.appendChild(
          document.createTextNode(code.slice(index, nextMatch.index)),
        );
      }
      const span = document.createElement("span");
      span.className = "code-token " + nextRule.className;
      span.textContent = nextMatch[0];
      fragment.appendChild(span);
      index = nextMatch.index + nextMatch[0].length;
    }
    return fragment;
  }

  renderCodeBlock(code, lang) {
    const block = document.createElement("div");
    block.className = "code-block";
    const header = document.createElement("div");
    header.className = "code-block-header";
    const label = document.createElement("span");
    label.className = "code-block-lang";
    const normalizedLang = this.normalizeCodeLanguage(lang);
    label.textContent = normalizedLang ? normalizedLang.toUpperCase() : "CODE";
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "btn btn-secondary code-copy-btn";
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", async () => {
      const text = code || "";
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          const temp = document.createElement("textarea");
          temp.value = text;
          temp.style.position = "fixed";
          temp.style.opacity = "0";
          document.body.appendChild(temp);
          temp.select();
          document.execCommand("copy");
          temp.remove();
        }
        this.showToast("Code copied");
      } catch (err) {
        this.showToast("Unable to copy");
      }
    });
    header.appendChild(label);
    header.appendChild(copyBtn);
    const pre = document.createElement("pre");
    pre.className = "code-block-pre";
    const codeEl = document.createElement("code");
    codeEl.className = "code-block-code";
    codeEl.appendChild(this.highlightCodeFragment(code, normalizedLang));
    pre.appendChild(codeEl);
    block.appendChild(header);
    block.appendChild(pre);
    return block;
  }

  renderMessageText(element, message, query) {
    if (!element) {
      return;
    }
    let text = message && message._plaintext ? String(message._plaintext) : "";
    if (text) {
      const trimmed = text.trim();
      if (trimmed.startsWith("{")) {
        try {
          const payload = JSON.parse(trimmed);
          if (payload && payload.type === "video_note") {
            text = "Video Message";
            if (message) {
              message._plaintext = text;
            }
          }
        } catch (err) {
          if (/"type"\s*:\s*"video_note"/.test(trimmed)) {
            text = "Video Message";
            if (message) {
              message._plaintext = text;
            }
          }
        }
      }
    }
    element.textContent = "";
    element.setAttribute("dir", this.getTextDirection(text));
    const blocks = this.parseFencedBlocks(text);
    if (!blocks) {
      this.renderTextWithMentions(element, text, message, query);
      this.parseTwemoji(element);
      return;
    }
    blocks.forEach((part) => {
      if (part.type === "text") {
        const content = part.content || "";
        if (!content) {
          return;
        }
        const textWrap = document.createElement("div");
        textWrap.className = "message-text-fragment";
        this.renderTextWithMentions(textWrap, content, message, query);
        element.appendChild(textWrap);
      } else if (part.type === "code") {
        element.appendChild(
          this.renderCodeBlock(part.content || "", part.lang || ""),
        );
      }
    });
    this.parseTwemoji(element);
  }

  parseTwemoji(target) {
    if (typeof twemoji !== "undefined" && target) {
      try {
        twemoji.parse(target, {
          base: "assets/twemoji/",
          folder: "svg",
          ext: ".svg",
        });
      } catch (err) {}
    }
  }

  initEmojiPicker() {
    if (this.elements.emojiPanel) {
      return;
    }
    const panel = document.createElement("div");
    panel.className = "emoji-panel";
    panel.style.display = "none";

    let categoryList = [];
    if (window.TWEMOJI_FULL_CATEGORIES && typeof window.TWEMOJI_FULL_CATEGORIES === "object") {
      categoryList = Object.entries(window.TWEMOJI_FULL_CATEGORIES).map(([key, cat]) => ({
        id: key,
        label: cat.label || "😀",
        name: cat.name || key,
        list: Array.isArray(cat.list) ? cat.list : []
      }));
    } else {
      const fallbackCategories = {
        "😀": [
          "😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","😉","😊","😇",
          "🥰","😍","🤩","😘","😗","😚","😙","😋","😛","😜","🤪","😝","🤑",
          "🤗","🤭","🤫","🤔","🤐","🤨","😐","😑","😶","😏","😒","🙄","😬",
          "🤥","😌","😔","😪","🤤","😴","😷","🤒","🤕","🤢","🤮","🤧","🥵",
          "🥶","🥴","😵","🤯","🤠","🥳","😎","🤓","🧐","😕","😟","🙁","😮",
          "😯","😲","😳","🥺","😦","😧","😨","😰","😥","😢","😭","😱","😖",
          "😣","😞","😓","😩","😫","🥱","😤","😡","😠","🤬","😈","👿","💀",
          "💩","🤡","👻","👽","🤖"
        ],
        "👍": [
          "👋","🤚","🖐️","✋","🖖","👌","🤌","🤏","✌️","🤞","🤟","🤘","🤙",
          "👈","👉","👆","🖕","👇","☝️","👍","👎","✊","👊","🤛","🤜","👏",
          "🙌","👐","🤲","🤝","🙏","✍️","💅","🤳","💪"
        ],
        "❤️": [
          "❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞",
          "💓","💗","💖","💘","💝","💟","💥","✨","💫","⭐","🌟","⚡","🔥",
          "💯","🎉","🎊"
        ],
        "🐱": [
          "🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷",
          "🐸","🐵","🐔","🐧","🐦","🦆","🦅","🦉","🦇","🐺","🐗","🐴","🦄",
          "🐝","🐛","🦋","🐌","🐞","🐜","🐢","🐍","🐙","🐬","🐳","🦈","🌸",
          "🌹","🌻","🍀","🌲"
        ],
        "🍕": [
          "🍏","🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🍒","🍑","🥭","🍍",
          "🥥","🥝","🍅","🥑","🍔","🍟","🍕","🌭","🥪","🌮","🌯","🍿","🍦",
          "🍰","🧁","🍫","🍬","🍭","☕","🍵","🧃","🥤","🍺","🍻"
        ],
        "🇮🇷": [
          "🚗","🚕","🚙","🚌","🏎️","🚓","🚑","🚒","🛵","🏍️","🚲","🚀","✈️",
          "⛵","⚓","🌍","🪐","🏁","🚩","🏳️‍🌈","🇮🇷","🇬🇧","🇺🇸","🇫🇷","🇩🇪","🇮🇹",
          "🇪🇸","🇷🇺","🇨🇳","🇯🇵","🇰🇷","🇨🇦","🇧🇷","🇹🇷","🇦🇪"
        ]
      };
      categoryList = Object.entries(fallbackCategories).map(([key, list]) => ({
        id: key,
        label: key,
        name: key,
        list: list
      }));
    }

    const tabsBar = document.createElement("div");
    tabsBar.className = "emoji-panel-tabs";

    const grid = document.createElement("div");
    grid.className = "emoji-panel-grid";

    const categoryHtmlCache = new Map();

    const renderCategory = (catObj) => {
      if (!catObj) return;
      if (categoryHtmlCache.has(catObj.id)) {
        grid.innerHTML = categoryHtmlCache.get(catObj.id);
        return;
      }
      grid.innerHTML = (catObj.list || [])
        .map(
          (emoji) =>
            '<button class="emoji-item" type="button" data-emoji="' +
            emoji +
            '">' +
            emoji +
            "</button>",
        )
        .join("");
      this.parseTwemoji(grid);
      categoryHtmlCache.set(catObj.id, grid.innerHTML);
    };

    categoryList.forEach((catObj, index) => {
      const tab = document.createElement("button");
      tab.className = "emoji-tab-btn" + (index === 0 ? " active" : "");
      tab.type = "button";
      tab.title = catObj.name;
      tab.textContent = catObj.label;
      tab.onclick = (e) => {
        e.stopPropagation();
        tabsBar.querySelectorAll(".emoji-tab-btn").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        renderCategory(catObj);
      };
      tabsBar.appendChild(tab);
    });

    panel.appendChild(tabsBar);
    panel.appendChild(grid);
    this.parseTwemoji(tabsBar);
    if (categoryList.length > 0) {
      renderCategory(categoryList[0]);
    }

    this.elements.chatInputContainer.appendChild(panel);
    this.elements.emojiPanel = panel;

    this.elements.emojiBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      const isOpen = panel.classList.contains("open") || panel.style.display === "flex";
      if (isOpen) {
        panel.classList.remove("open");
        panel.style.display = "none";
      } else {
        panel.classList.add("open");
        panel.style.display = "flex";
      }
    });

    panel.addEventListener("click", (event) => {
      event.stopPropagation();
      const item = event.target.closest(".emoji-item");
      if (!item) {
        return;
      }
      const emoji = item.dataset.emoji;
      this.elements.messageInput.value += emoji;
      this.elements.messageInput.focus();
    });

    document.addEventListener("click", () => {
      panel.classList.remove("open");
      panel.style.display = "none";
    });
  }

  async updateSecurityBanner() {
    if (!this.elements.securityBanner) {
      return;
    }
    try {
      const ok = await this.crypto.selfTest();
      if (ok) {
        this.elements.securityBanner.classList.add("secure");
        const title = this.elements.securityBanner.querySelector(
          ".security-text strong",
        );
        const subtitle = this.elements.securityBanner.querySelector(
          ".security-text span",
        );
        if (title) {
          title.textContent = "End-to-end encrypted and verified";
        }
        if (subtitle) {
          subtitle.textContent = "Encryption keys are secured on your device.";
        }
      }
    } catch (err) {
      console.error("Security banner update failed", err);
    }
  }

  async loadUserSettings() {
    try {
      const res = await window.ApiClient.fetch("settings");
      const data = await res.json();
      if (data.success && data.settings) {
        this.notificationSettings = {
          notify_enabled: parseInt(data.settings.notify_enabled ?? 1, 10)
            ? 1
            : 0,
          notify_show_sender: parseInt(
            data.settings.notify_show_sender ?? 1,
            10,
          )
            ? 1
            : 0,
          notify_show_preview: parseInt(
            data.settings.notify_show_preview ?? 1,
            10,
          )
            ? 1
            : 0,
          notify_mode:
            data.settings.notify_mode === "latest" ||
            data.settings.notify_mode === "all"
              ? data.settings.notify_mode
              : "all",
        };
        if (data.settings.fast_reaction) {
          this.fastReaction = data.settings.fast_reaction;
        }
        const normalized = {
          auto_download_images_wifi: parseInt(
            data.settings.auto_download_images_wifi ??
              this.mediaSettings.auto_download_images_wifi,
            10,
          )
            ? 1
            : 0,
          auto_download_images_mobile: parseInt(
            data.settings.auto_download_images_mobile ??
              this.mediaSettings.auto_download_images_mobile,
            10,
          )
            ? 1
            : 0,
          auto_download_videos_wifi: parseInt(
            data.settings.auto_download_videos_wifi ??
              this.mediaSettings.auto_download_videos_wifi,
            10,
          )
            ? 1
            : 0,
          auto_download_videos_mobile: parseInt(
            data.settings.auto_download_videos_mobile ??
              this.mediaSettings.auto_download_videos_mobile,
            10,
          )
            ? 1
            : 0,
          auto_download_video_limit:
            parseInt(
              data.settings.auto_download_video_limit ??
                this.mediaSettings.auto_download_video_limit,
              10,
            ) || this.mediaSettings.auto_download_video_limit,
          cache_limit_mb:
            parseInt(
              data.settings.cache_limit_mb ?? this.mediaSettings.cache_limit_mb,
              10,
            ) || this.mediaSettings.cache_limit_mb,
          cache_thumbnails_only: parseInt(
            data.settings.cache_thumbnails_only ??
              this.mediaSettings.cache_thumbnails_only,
            10,
          )
            ? 1
            : 0,
        };
        this.mediaSettings = Object.assign(
          {},
          this.mediaSettings,
          normalized,
          this.loadLocalMediaPrefs(),
        );
      }
    } catch (err) {
      console.error("Failed to load settings", err);
    }
  }

  loadLocalMediaPrefs() {
    if (!this.userId) {
      return {};
    }
    const key = `lc_media_prefs_${this.userId}`;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        return {};
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        return {};
      }
      return {
        auto_download_audio_wifi: parsed.auto_download_audio_wifi ? 1 : 0,
        auto_download_audio_mobile: parsed.auto_download_audio_mobile ? 1 : 0,
        auto_download_docs_wifi: parsed.auto_download_docs_wifi ? 1 : 0,
        auto_download_docs_mobile: parsed.auto_download_docs_mobile ? 1 : 0,
        auto_download_doc_limit:
          parseInt(
            parsed.auto_download_doc_limit ??
              this.mediaSettings.auto_download_doc_limit,
            10,
          ) || this.mediaSettings.auto_download_doc_limit,
      };
    } catch (err) {
      return {};
    }
  }

  initNotificationSync() {
    this.loadNotificationState();
    this.loadNotificationSettingsFromStorage();
    if (typeof window === "undefined") {
      return;
    }
    if ("BroadcastChannel" in window) {
      this.notificationChannel = new BroadcastChannel("lc_notify_settings");
      this.notificationChannel.onmessage = (event) => {
        this.applyNotificationSettingsUpdate(
          event && event.data ? event.data : null,
        );
      };
    }
    window.addEventListener("storage", (event) => {
      if (!event) {
        return;
      }
      if (event.key === this.notificationStorageKey) {
        this.loadNotificationSettingsFromStorage();
      }
      if (event.key === this.notificationStateKey) {
        this.loadNotificationState();
      }
    });
  }

  loadNotificationSettingsFromStorage() {
    if (!this.notificationStorageKey) {
      return;
    }
    try {
      const raw = localStorage.getItem(this.notificationStorageKey);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw);
      this.applyNotificationSettingsUpdate(parsed);
    } catch (err) {}
  }

  applyNotificationSettingsUpdate(data) {
    if (!data || typeof data !== "object") {
      return;
    }
    const mode = data.notify_mode === "latest" ? "latest" : "all";
    const next = {
      notify_enabled: parseInt(
        data.notify_enabled ?? this.notificationSettings.notify_enabled ?? 1,
        10,
      )
        ? 1
        : 0,
      notify_show_sender: parseInt(
        data.notify_show_sender ??
          this.notificationSettings.notify_show_sender ??
          1,
        10,
      )
        ? 1
        : 0,
      notify_show_preview: parseInt(
        data.notify_show_preview ??
          this.notificationSettings.notify_show_preview ??
          1,
        10,
      )
        ? 1
        : 0,
      notify_mode: mode,
    };
    this.notificationSettings = Object.assign(
      {},
      this.notificationSettings,
      next,
    );
    this.ensureNotifications();
    if (this.notificationSettings.notify_enabled) {
      this.registerNotificationWorker();
      this.ensurePushSubscription();
    } else {
      this.clearPushSubscription();
    }
    this.syncNotificationStateToServiceWorker();
  }

  loadNotificationState() {
    if (!this.notificationStateKey) {
      return;
    }
    try {
      const raw = localStorage.getItem(this.notificationStateKey);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        parsed.lastNotified &&
        typeof parsed.lastNotified === "object"
      ) {
        this.notificationState.lastNotified = new Map(
          Object.entries(parsed.lastNotified).map(([key, value]) => [
            key,
            parseInt(value, 10) || 0,
          ]),
        );
      }
    } catch (err) {}
  }

  persistNotificationState() {
    if (!this.notificationStateKey) {
      return;
    }
    if (this.notificationState.persistTimer) {
      clearTimeout(this.notificationState.persistTimer);
    }
    this.notificationState.persistTimer = setTimeout(() => {
      const snapshot = {};
      this.notificationState.lastNotified.forEach((value, key) => {
        snapshot[key] = value;
      });
      try {
        localStorage.setItem(
          this.notificationStateKey,
          JSON.stringify({
            lastNotified: snapshot,
            updated_at: Date.now(),
          }),
        );
      } catch (err) {}
    }, 200);
  }

  updateNotificationState(chatKey, messageId) {
    if (!chatKey) {
      return;
    }
    const numericId = parseInt(messageId, 10);
    if (!Number.isFinite(numericId) || numericId <= 0) {
      return;
    }
    const current = this.notificationState.lastNotified.get(chatKey) || 0;
    if (numericId <= current) {
      return;
    }
    this.notificationState.lastNotified.set(chatKey, numericId);
    this.persistNotificationState();
    this.syncNotificationStateToServiceWorker();
  }

  recordNotificationBaseline(message) {
    const info = this.getNotificationChatInfo(message);
    if (!info) {
      return;
    }
    this.updateNotificationState(info.chatKey, message.message_id);
  }

  seedNotificationStateFromConversations(list) {
    const conversations = Array.isArray(list) ? list : this.conversations;
    if (!Array.isArray(conversations)) {
      return;
    }
    conversations.forEach((conversation) => {
      if (!conversation || !conversation.type) {
        return;
      }
      const messageId = parseInt(conversation.message_id, 10);
      if (!Number.isFinite(messageId) || messageId <= 0) {
        return;
      }
      const chatKey = this.getConversationKey(conversation);
      if (!chatKey) {
        return;
      }
      this.updateNotificationState(chatKey, messageId);
    });
  }

  async ensureNotifications() {
    if (!("Notification" in window)) {
      return;
    }
    if (!this.notificationSettings.notify_enabled) {
      this.notificationReady = false;
      return;
    }
    if (Notification.permission === "granted") {
      this.notificationReady = true;
      this.ensurePushSubscription();
      return;
    }
    if (Notification.permission !== "denied") {
      const permission = await Notification.requestPermission();
      this.notificationReady = permission === "granted";
      if (this.notificationReady) {
        this.ensurePushSubscription();
      }
    }
  }

  showNotification(title, body, options = {}) {
    if (!this.notificationReady) {
      return false;
    }
    try {
      const payload = {
        body: body,
        tag: options.tag || "lc-message",
        silent: !!options.silent,
        renotify: !!options.renotify,
        data: options.data || null,
      };
      const notification = new Notification(title, payload);
      notification.onclick = () => {
        if (typeof window !== "undefined" && window.focus) {
          window.focus();
        }
        if (payload.data && payload.data.chatType && payload.data.chatId) {
          this.openChatFromNotification(
            payload.data.chatType,
            payload.data.chatId,
          );
        }
        notification.close();
      };
      return true;
    } catch (err) {
      console.error("Notification failed", err);
    }
    return false;
  }

  async loadConversations() {
    if (!this.elements.conversationsList || this.conversationsLoading) {
      return;
    }
    this.conversationsLoading = true;
    const cached = this.loadConversationsCache();
    if (!this.conversationsLoaded && cached.length) {
      this.conversations = cached;
      try {
        await this.renderConversations();
        this.conversationsLoaded = true;
      } catch (err) {
        this.elements.conversationsList.innerHTML =
          '<p class="text-center">Error loading conversations</p>';
      }
    }
    if (
      !this.conversationsLoaded &&
      !this.elements.conversationsList.children.length
    ) {
      this.elements.conversationsList.innerHTML = '<div class="spinner"></div>';
    }
    const fetchWithRetry = async () => {
      const controller =
        typeof AbortController !== "undefined" ? new AbortController() : null;
      const timeout = setTimeout(() => {
        if (controller) {
          controller.abort();
        }
      }, 8000);
      try {
        const res = await window.ApiClient.fetch("conversations", {
          cache: "no-store",
          signal: controller ? controller.signal : undefined,
        });
        const text = await res.text();
        let data = null;
        try {
          data = JSON.parse(text);
        } catch (err) {
          data = null;
        }
        if (!res.ok) {
          const message =
            data && data.message ? data.message : "Error loading conversations";
          throw new Error(message);
        }
        if (!data || !data.success || !Array.isArray(data.conversations)) {
          throw new Error("Invalid response");
        }
        return data.conversations;
      } finally {
        clearTimeout(timeout);
      }
    };
    try {
      let conversations = [];
      try {
        conversations = await fetchWithRetry();
      } catch (err) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        conversations = await fetchWithRetry();
      }
      let sanitized = this.sanitizeConversations(conversations);
      const hasSaved = sanitized.some(c => c.type === 'saved');
      if (!hasSaved && this.userId) {
        sanitized.unshift({
          type: 'saved',
          user_id: this.userId,
          full_name: 'Saved Messages',
          username: 'saved',
          profile_pic: 'saved.png',
          status: 'online',
          is_pinned: 1,
          pinned_at: new Date().toISOString(),
          message_id: null,
          message_date: null
        });
        sanitized = this.sanitizeConversations(sanitized);
      }
      const previousSnapshot = this.conversations.slice();
      if (sanitized.length) {
        this.conversations = sanitized;
        this.syncMuteFlagsToConversations();
        await this.renderConversations();
        this.persistConversationsCache();
        if (previousSnapshot.length || this.conversationsLoaded) {
          await this.notifyConversationUpdates(previousSnapshot, sanitized);
        }
        this.seedNotificationStateFromConversations(sanitized);
        if (this.currentChat) {
          const latest = this.getConversation(
            this.currentChat.id,
            this.currentChat.type,
          );
          if (latest) {
            this.currentChat.meta = latest;
            this.updateChatTopbar();
            this.updateChatInputState();
          }
        }
        this.conversationsLoaded = true;
      } else {
        if (!cached.length) {
          this.elements.conversationsList.innerHTML =
            '<p class="text-center">No conversations yet</p>';
        }
        this.conversationsLoaded = true;
      }
    } catch (err) {
      if (!this.conversations.length && this.userId) {
        this.conversations = [{
          type: 'saved',
          user_id: this.userId,
          full_name: 'Saved Messages',
          username: 'saved',
          profile_pic: 'saved.png',
          status: 'online',
          is_pinned: 1,
          pinned_at: new Date().toISOString(),
          message_id: null,
          message_date: null
        }];
        try {
          await this.renderConversations();
        } catch (e) {}
      } else if (!cached.length || !this.elements.conversationsList.children.length) {
        this.elements.conversationsList.innerHTML =
          '<p class="text-center">No conversations yet</p>';
      }
      this.conversationsLoaded = true;
    } finally {
      this.conversationsLoading = false;
    }
  }

  async renderConversations() {
    this.elements.conversationsList.innerHTML = "";
    let rendered = 0;
    const list = this.getFilteredConversations();
    for (const conversation of list) {
      try {
        const item = this.createConversationItem(conversation);
        if (!item) {
          continue;
        }
        this.elements.conversationsList.appendChild(item);
        this.updateConversationPreview(item, conversation);
        this.updateConversationPresenceIndicator(item, conversation);
        rendered += 1;
      } catch (err) {
        // skip invalid conversation entries
      }
    }
    if (!rendered) {
      this.elements.conversationsList.innerHTML =
        '<p class="text-center">No conversations yet</p>';
    }
  }

  createConversationItem(conversation) {
    const item = document.createElement("div");
    item.className = "contact-item conversation-item";
    const chatId = this.getConversationId(conversation);
    item.dataset.chatId = String(chatId);
    item.dataset.chatType = conversation.type;
    item.dataset.name = this.getConversationName(conversation).toLowerCase();

    if (conversation.is_pinned) {
      item.classList.add("pinned");
    }

    const avatar = document.createElement("div");
    avatar.className = "contact-avatar";
    if (conversation.type === "group") {
      avatar.classList.add("group-avatar");
      const img = document.createElement("img");
      img.src = this.getAvatarUrl(
        conversation.group_pic,
        conversation.group_name,
        {
          type: "group",
          cacheKey: conversation.group_id || conversation.group_name,
        },
      );
      img.alt = conversation.group_name || "Group";
      this.disableImageDrag(img);
      avatar.appendChild(img);
    } else if (conversation.type === "channel") {
      avatar.classList.add("channel-avatar");
      const img = document.createElement("img");
      img.src = this.getAvatarUrl(
        conversation.channel_pic,
        conversation.channel_name,
        {
          type: "channel",
          cacheKey: conversation.channel_id || conversation.channel_name,
        },
      );
      img.alt = conversation.channel_name || "Channel";
      this.disableImageDrag(img);
      avatar.appendChild(img);
    } else if (conversation.type === "saved") {
      avatar.classList.add("saved-avatar");
      avatar.innerHTML = this.iconHtml("saved");
    } else {
      const img = document.createElement("img");
      img.src = this.getAvatarUrl(
        conversation.profile_pic,
        conversation.full_name || conversation.username,
        {
          type: "user",
          cacheKey:
            conversation.user_id ||
            conversation.username ||
            conversation.full_name,
        },
      );
      img.alt = conversation.username || conversation.full_name || "User";
      img.draggable = false;
      img.addEventListener("dragstart", (event) => event.preventDefault());
      avatar.appendChild(img);
    }

    const info = document.createElement("div");
    info.className = "contact-info";

    const name = document.createElement("div");
    name.className = "contact-name";
    name.textContent = this.getConversationName(conversation);
    if (conversation.type === "direct") {
      const status = document.createElement("span");
      status.className =
        "status-indicator status-" + this.getPresenceState(conversation);
      avatar.appendChild(status);
    } else if (conversation.type === "channel") {
      const badge = document.createElement("span");
      badge.className = "badge badge-secondary channel-badge";
      badge.textContent = "Channel";
      name.appendChild(badge);
    }
    if (Number(conversation.mention_flag || 0) === 1) {
      const mention = document.createElement("span");
      mention.className = "mention-badge";
      mention.textContent = "@";
      name.appendChild(mention);
    }

    const status = document.createElement("div");
    status.className = "contact-status";
    status.textContent = "Loading...";

    info.appendChild(name);
    info.appendChild(status);

    item.appendChild(avatar);
    item.appendChild(info);

    if (conversation.is_pinned) {
      const pin = document.createElement("span");
      pin.className = "pin-indicator";
      pin.innerHTML = this.iconHtml("pin");
      item.appendChild(pin);
    }
    if (Number(conversation.is_unread || 0) === 1) {
      item.classList.add("unread");
    }

    item.addEventListener("click", () => {
      this.openChat(chatId, conversation.type, conversation);
    });

    item.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.showChatMenu(event, conversation);
    });

    return item;
  }

  updateConversationPresenceIndicator(item, conversation) {
    if (!item || !conversation || conversation.type !== "direct") {
      return;
    }
    let indicator = item.querySelector(".contact-avatar .status-indicator") || item.querySelector(".status-indicator");
    if (!indicator) {
      const avatar = item.querySelector(".contact-avatar");
      if (avatar) {
        indicator = document.createElement("span");
        avatar.appendChild(indicator);
      }
    }
    if (indicator) {
      indicator.className =
        "status-indicator status-" + this.getPresenceState(conversation);
    }
  }

  async updateConversationPreview(item, conversation) {
    const statusEl = item.querySelector(".contact-status");
    if (!statusEl) {
      return;
    }
    const chatKey = this.getConversationKey(conversation);
    const draftText = chatKey ? this.draftCache.get(chatKey) : "";
    if (draftText && draftText.trim()) {
      const firstLine = draftText.split(/\r?\n/)[0] || "";
      const preview = this.truncate(firstLine.trim(), 48);
      statusEl.removeAttribute("dir");
      statusEl.innerHTML = "";
      const label = document.createElement("span");
      label.className = "draft-label";
      label.textContent = "Draft";
      const text = document.createElement("span");
      text.className = "draft-preview";
      text.textContent = preview;
      statusEl.appendChild(label);
      statusEl.appendChild(text);
      return;
    }
    if (!conversation.message_id) {
      if (conversation.type === "saved") {
        statusEl.removeAttribute("dir");
        statusEl.textContent = "Your private space";
      } else if (conversation.type === "channel") {
        statusEl.removeAttribute("dir");
        statusEl.textContent = "No posts yet";
      } else {
        statusEl.removeAttribute("dir");
        statusEl.textContent = "No messages yet";
      }
      return;
    }
    if (
      conversation.message_type &&
      conversation.message_type !== "text" &&
      conversation.message_type !== "album"
    ) {
      statusEl.removeAttribute("dir");
      statusEl.textContent = this.getMessageTypeLabel(
        conversation.message_type,
      );
      return;
    }
    const previewMessage = {
      message_id: conversation.message_id,
      sender_id: conversation.last_sender_id || conversation.sender_id,
      message_type: conversation.message_type,
      encrypted_content: conversation.encrypted_content,
      key_sender: conversation.key_sender,
      key_recipient: conversation.key_recipient,
      key_for_user: conversation.key_for_user,
    };
    if (conversation.type === "group") {
      previewMessage.group_id = conversation.group_id;
    } else if (conversation.type === "channel") {
      previewMessage.channel_id = conversation.channel_id;
    } else {
      previewMessage.receiver_id = conversation.user_id;
    }
    statusEl.removeAttribute("dir");
    statusEl.textContent = "Decrypting...";

    const previewMetaLabel = this.getMediaPreviewLabel(
      conversation.preview_plaintext,
    );
    if (previewMetaLabel) {
      this.renderDirectionalText(statusEl, this.truncate(previewMetaLabel, 48));
      return;
    }
    if (conversation.preview_plaintext) {
      this.renderDirectionalText(
        statusEl,
        this.truncate(conversation.preview_plaintext, 48),
      );
      return;
    }

    const decrypted = await this.decryptMessage(previewMessage);
    if (decrypted && decrypted.plaintext) {
      const metaLabel = this.getMediaPreviewLabel(decrypted.plaintext);
      if (metaLabel) {
        this.renderDirectionalText(statusEl, this.truncate(metaLabel, 48));
        conversation.preview_plaintext = metaLabel;
        return;
      }
      const parsed = this.extractTextPayload(decrypted.plaintext);
      const plain = parsed.text || "";
      const preview = this.getPreviewFromMarkdown(plain || "");
      this.renderDirectionalText(
        statusEl,
        this.truncate(preview || "Message", 48),
      );
      conversation.preview_plaintext = preview || "Message"; // Cache it
    } else {
      statusEl.removeAttribute("dir");
      statusEl.textContent =
        conversation.type === "channel"
          ? "New post"
          : "Unable to decrypt message";
    }
  }

  async loadContacts() {
    if (!this.elements.contactsList) {
      return;
    }
    try {
      const res = await window.ApiClient.fetch("contacts");
      const data = await res.json();
      if (data.success && Array.isArray(data.contacts)) {
        this.contacts = data.contacts;
        this.renderContacts();
      }
    } catch (err) {
      console.error("Failed to load contacts", err);
    }
  }

  renderContacts() {
    this.elements.contactsList.innerHTML = "";
    if (!this.contacts.length) {
      this.elements.contactsList.innerHTML =
        '<p class="text-center">No contacts</p>';
      return;
    }
    this.contacts.forEach((contact) => {
      const item = document.createElement("div");
      item.className = "contact-item";
      item.dataset.name = (
        contact.full_name ||
        contact.username ||
        ""
      ).toLowerCase();

      const avatar = document.createElement("div");
      avatar.className = "contact-avatar";
      const img = document.createElement("img");
      img.src = this.getAvatarUrl(
        contact.profile_pic,
        contact.full_name || contact.username,
        {
          type: "user",
          cacheKey: contact.user_id || contact.username || contact.full_name,
        },
      );
      img.alt = contact.username || "User";
      img.draggable = false;
      img.addEventListener("dragstart", (event) => event.preventDefault());
      avatar.appendChild(img);

      const info = document.createElement("div");
      info.className = "contact-info";

      const name = document.createElement("div");
      name.className = "contact-name";
      name.textContent = contact.full_name || contact.username;
      const status = document.createElement("span");
      status.className =
        "status-indicator status-" + (contact.status || "offline");
      avatar.appendChild(status);

      const statusText = document.createElement("div");
      statusText.className = "contact-status";
      statusText.textContent = "@" + contact.username;

      info.appendChild(name);
      info.appendChild(statusText);

      item.appendChild(avatar);
      item.appendChild(info);

      item.addEventListener("click", () => {
        this.openChat(contact.user_id, "direct", contact);
      });

      this.elements.contactsList.appendChild(item);
    });
  }

  async openChat(chatId, chatType, meta) {
    if (!this.userId) {
      const userMeta = document.querySelector('meta[name="user-id"]');
      if (userMeta && userMeta.content) {
        this.userId = parseInt(userMeta.content, 10);
      }
    }
    const resolvedId = chatType === "saved" ? (this.userId || chatId) : chatId;
    const chatKey = `${chatType}:${resolvedId}`;
    if (this._openingChatKey === chatKey && this.currentChat && String(this.currentChat.id) === String(resolvedId)) {
      return;
    }
    this._openingChatKey = chatKey;
    this._openChatToken = (this._openChatToken || 0) + 1;
    const currentToken = this._openChatToken;

    try {
      const resolvedMeta =
        meta ||
        this.getConversation(resolvedId, chatType) ||
        (chatType === "saved"
          ? {
              type: "saved",
              user_id: this.userId,
              full_name: "Saved Messages",
              username: "saved",
            }
          : null);

      this.currentChat = {
        id: resolvedId,
        type: chatType,
        meta: resolvedMeta,
      };

      // Instant synchronous UI activation
      document.body.classList.add("has-active-chat");
      const chatContainer = document.querySelector(".chat-container");
      if (chatContainer) {
        chatContainer.classList.add("has-active-chat");
      }
      const chatMain = document.querySelector(".chat-main");
      if (chatMain) {
        chatMain.classList.add("has-active-chat");
        chatMain.classList.add("active");
      }
      const sidebar = document.querySelector(".chat-sidebar");
      if (sidebar) {
        sidebar.classList.remove("active");
        sidebar.classList.add("has-active-chat");
      }
      const welcome =
        document.getElementById("welcome-message") ||
        (this.elements && this.elements.welcomeMessage);
      if (welcome) {
        welcome.style.setProperty("display", "none", "important");
      }
      const chatInput =
        document.getElementById("chat-input-container") ||
        (this.elements && this.elements.chatInputContainer);
      if (chatInput) {
        chatInput.style.setProperty("display", "block", "important");
      }
      if (this.elements && this.elements.messageContainer) {
        this.elements.messageContainer.innerHTML = "";
      }
      this.clearAllTyping();
      this.ensureTypingBubble();
      this.updateChatTopbar();
      this.updateChatInputState();
      if (window.telegramZShell) {
        window.telegramZShell.syncActiveChatState();
        window.telegramZShell.syncActiveChatItem();
      }
      this.triggerChatTransition();

      try {
        if (this.ready) {
          await Promise.race([
            this.ready,
            new Promise((resolve) => setTimeout(resolve, 800)),
          ]);
        }
      } catch (err) {
        console.warn("Ready warning ignored", err);
      }
      this.stopMessagePolling();
      this.stopExpiryTimer();
      this.resetChatSearch();
      this.resetNewMessagesJump();
      if (this.seenSendTimer) {
        clearTimeout(this.seenSendTimer);
        this.seenSendTimer = null;
      }
      this.pendingSeen = null;
      this.disappearSeconds = 0;
      this.typingActive = false;
      this.typingLabel = "";
      if (this.typingStopTimer) {
        clearTimeout(this.typingStopTimer);
        this.typingStopTimer = null;
      }
      this.clearAttachment();
      if (chatType === "direct" && chatId !== this.userId) {
        this.getPublicKey(chatId).catch(() => {});
      }
      if (chatType === "group") {
        this.getGroupMembersWithKeys(chatId).catch(() => {});
        this.getGroupContentKey(chatId).catch(() => {});
      }
      if (chatType === "channel") {
        this.getChannelMembersWithKeys(chatId)
          .then((members) => {
            const canDistribute = true;
            this.getChannelContentKey(chatId, {
              distribute: canDistribute,
              members: members,
            }).catch(() => {});
          })
          .catch(() => {
            this.getChannelContentKey(chatId).catch(() => {});
          });
      }
      this.clearReply();
      this.clearEditing();
      this.lastMessageUnix = 0;
      this.lastMessageId = 0;
      this.lastEventId = 0;
      this.messageCache.clear();
      this.messageElements.clear();
      this.messageKeyCache.clear();
      this.mediaDownloadHandlers.clear();
      if (this.globalPlayer && this.globalPlayer.tiles) {
        this.globalPlayer.tiles.clear();
      }
      this.pinnedMessageId = null;
      this.pinnedMessage = null;
      this.deletedMessageIds = new Set();
      this.scheduledMessages.clear();
      this.scheduledLoaded = false;
      await this.restoreDraftForChat(this.currentChat);
      if (this._openChatToken !== currentToken || !this.currentChat) return;
      this.loadDisappearingSetting().catch(() => {});
      await this.loadPinnedMessage();
      if (this._openChatToken !== currentToken || !this.currentChat) return;
      const cached = this.loadConversationCache(this.currentChat);
      if (cached && Array.isArray(cached.messages) && cached.messages.length) {
        try {
          await this.appendMessages(cached.messages, {
            fromCache: true,
            suppressNotify: true,
            skipReactions: true,
          });
          if (this._openChatToken !== currentToken || !this.currentChat) return;
          this.applyCachedReactions(cached.reactions || {});
        } catch (cacheErr) {
          console.warn("Failed to render cached messages", cacheErr);
        }
      }
      if (this._openChatToken !== currentToken || !this.currentChat) return;
      this.deletedMessageIds = new Set();
      await this.loadMessages(true);
      if (this._openChatToken !== currentToken || !this.currentChat) return;
      await this.loadScheduledMessages();
      if (this._openChatToken !== currentToken || !this.currentChat) return;
      await this.initEventCursor();
      if (this._openChatToken !== currentToken || !this.currentChat) return;
      this.startMessagePolling();
      this.startExpiryTimer();
      this.queueMarkSeen();
    } finally {
      this._openingChatKey = null;
    }
  }

  handleTopbarInfoClick() {
    const conversation =
      this.getCurrentConversation() ||
      (this.currentChat ? this.currentChat.meta : null);
    if (!conversation) {
      return;
    }
    if (document.body.classList.contains("theme-telegram-z") || document.documentElement.getAttribute("data-theme") === "telegram-z") {
      if (window.telegramZShell && typeof window.telegramZShell.openInfoSidebar === "function") {
        window.telegramZShell.openInfoSidebar();
        return;
      }
    }
    if (conversation.type === "direct") {
      this.openProfile(conversation);
      return;
    }
    if (conversation.type === "group") {
      this.openGroupInfo(conversation);
      return;
    }
    if (conversation.type === "channel") {
      this.openChannelInfo(conversation);
    }
  }

  updateTopbarInfoButton(conversation) {
    if (!this.elements.chatTopbarInfoBtn) {
      return;
    }
    const button = this.elements.chatTopbarInfoBtn;
    let canOpen = false;
    let label = "Open chat info";
    if (conversation && conversation.type === "direct") {
      canOpen = true;
      label = "Open profile";
    } else if (conversation && conversation.type === "group") {
      canOpen = true;
      label = "Open group info";
    } else if (conversation && conversation.type === "channel") {
      canOpen = true;
      label = "Open channel info";
    }
    button.disabled = !canOpen;
    button.setAttribute("aria-label", label);
    button.classList.toggle("is-clickable", canOpen);
  }

  updateChatTopbar() {
    if (!this.elements.chatTopbarTitle) {
      return;
    }
    if (!this.currentChat) {
      this.elements.chatTopbarTitle.textContent = "Select a chat";
      if (this.elements.chatTopbarSubtitle) {
        this.elements.chatTopbarSubtitle.textContent = "";
      }
      if (this.elements.chatTopbarAvatar) {
        this.elements.chatTopbarAvatar.innerHTML = "";
        this.elements.chatTopbarAvatar.className = "chat-topbar-avatar";
        this.elements.chatTopbarAvatar.dataset.avatarSrc = "";
      }
      if (this.elements.chatTopbar) {
        this.elements.chatTopbar.classList.add("empty");
      }
      this.updateTopbarInfoButton(null);
      return;
    }
    const conversation =
      this.getConversation(this.currentChat.id, this.currentChat.type) ||
      this.currentChat.meta;
    if (!conversation) {
      this.elements.chatTopbarTitle.textContent = "Select a chat";
      if (this.elements.chatTopbarSubtitle) {
        this.elements.chatTopbarSubtitle.textContent = "";
      }
      if (this.elements.chatTopbarAvatar) {
        this.elements.chatTopbarAvatar.innerHTML = "";
        this.elements.chatTopbarAvatar.className = "chat-topbar-avatar";
        this.elements.chatTopbarAvatar.dataset.avatarSrc = "";
      }
      if (this.elements.chatTopbar) {
        this.elements.chatTopbar.classList.add("empty");
      }
      this.updateTopbarInfoButton(null);
      return;
    }
    if (this.elements.chatTopbar) {
      this.elements.chatTopbar.classList.remove("empty");
    }
    if (conversation.type === "group") {
      const avatarUrl = this.getAvatarUrl(
        conversation.group_pic,
        conversation.group_name,
        {
          type: "group",
          cacheKey: conversation.group_id || conversation.group_name,
        },
      );
      const avatar = this.elements.chatTopbarAvatar;
      const hasImg = !!avatar.querySelector("img");
      if (avatar.dataset.avatarSrc !== avatarUrl || !hasImg) {
        avatar.innerHTML = "";
        avatar.dataset.avatarSrc = avatarUrl;
        const img = document.createElement("img");
        img.src = avatarUrl;
        img.alt = conversation.group_name || "Group";
        this.disableImageDrag(img);
        avatar.appendChild(img);
      }
      this.elements.chatTopbarAvatar.className =
        "chat-topbar-avatar group-avatar";
      this.elements.chatTopbarTitle.textContent =
        conversation.group_name || "Group chat";
      const subtitle = conversation.group_username
        ? "@" + conversation.group_username
        : "Group chat";
      this.elements.chatTopbarSubtitle.textContent = subtitle;
    } else if (conversation.type === "channel") {
      const avatarUrl = this.getAvatarUrl(
        conversation.channel_pic,
        conversation.channel_name,
        {
          type: "channel",
          cacheKey: conversation.channel_id || conversation.channel_name,
        },
      );
      const avatar = this.elements.chatTopbarAvatar;
      const hasImg = !!avatar.querySelector("img");
      if (avatar.dataset.avatarSrc !== avatarUrl || !hasImg) {
        avatar.innerHTML = "";
        avatar.dataset.avatarSrc = avatarUrl;
        const img = document.createElement("img");
        img.src = avatarUrl;
        img.alt = conversation.channel_name || "Channel";
        this.disableImageDrag(img);
        avatar.appendChild(img);
      }
      this.elements.chatTopbarAvatar.className =
        "chat-topbar-avatar channel-avatar";
      this.elements.chatTopbarTitle.textContent =
        conversation.channel_name || "Channel";
      const visibility =
        conversation.visibility === "public"
          ? "Public channel"
          : "Private channel";
      const subtitle = conversation.channel_username
        ? "@" + conversation.channel_username + " \u2022 " + visibility
        : visibility;
      this.elements.chatTopbarSubtitle.textContent = subtitle;
    } else if (conversation.type === "saved") {
      this.elements.chatTopbarAvatar.innerHTML = this.iconHtml("saved");
      this.elements.chatTopbarAvatar.className =
        "chat-topbar-avatar saved-avatar";
      this.elements.chatTopbarAvatar.dataset.avatarSrc = "";
      this.elements.chatTopbarTitle.textContent = "Saved Messages";
      this.elements.chatTopbarSubtitle.textContent = "Only you can see these";
    } else {
      const userId = conversation.user_id || conversation.id;
      const cachedProfile = this.getProfileFromCache(userId);
      const profile = cachedProfile || conversation;
      this.renderDirectTopbar(profile, conversation);
      this.refreshTopbarProfile(userId, conversation);
    }
    this.updateTopbarInfoButton(conversation);
    this.updateDisappearIndicator(conversation);
  }

  updateDisappearIndicator(conversation) {
    if (!this.elements.chatTopbarMeta) {
      return;
    }
    const seconds = Number(
      this.disappearSeconds ||
        (conversation ? conversation.disappear_after_seconds : 0) ||
        0,
    );
    if (!seconds) {
      this.elements.chatTopbarMeta.style.display = "none";
      this.elements.chatTopbarMeta.textContent = "";
      return;
    }
    const label = this.formatDisappearLabel(seconds);
    this.elements.chatTopbarMeta.textContent = `Disappearing messages: ${label}`;
    this.elements.chatTopbarMeta.style.display = "inline-flex";
  }

  formatDisappearLabel(seconds) {
    if (!seconds) {
      return "Off";
    }
    if (seconds === 3600) {
      return "1 hour";
    }
    if (seconds === 86400) {
      return "1 day";
    }
    if (seconds === 604800) {
      return "1 week";
    }
    if (seconds < 60) {
      return `${seconds}s`;
    }
    if (seconds < 3600) {
      return `${Math.round(seconds / 60)} minutes`;
    }
    if (seconds < 86400) {
      return `${Math.round(seconds / 3600)} hours`;
    }
    return `${Math.round(seconds / 86400)} days`;
  }

  async loadDisappearingSetting() {
    if (!this.currentChat) {
      return;
    }
    const chatType = this.currentChat.type;
    const chatId = this.currentChat.id;
    if (chatType === "saved") {
      this.disappearSeconds = 0;
      this.updateDisappearIndicator(
        this.getCurrentConversation() || this.currentChat.meta,
      );
      return;
    }
    try {
      const res = await fetch(
        window.ApiClient.url("disappearing", { chat_type: chatType, chat_id: chatId }),
        {
          cache: "no-store",
        },
      );
      const data = await res.json();
      if (!data.success) {
        return;
      }
      const seconds = parseInt(data.disappear_after_seconds || 0, 10) || 0;
      this.disappearSeconds = seconds;
      this.setConversationDisappearSeconds(chatType, chatId, seconds);
      this.updateDisappearIndicator(
        this.getConversation(chatId, chatType) || this.currentChat.meta,
      );
    } catch (err) {}
  }

  setConversationDisappearSeconds(chatType, chatId, seconds) {
    const conversation = this.getConversation(chatId, chatType);
    if (conversation) {
      conversation.disappear_after_seconds = seconds;
    }
    if (
      this.currentChat &&
      this.currentChat.id === chatId &&
      this.currentChat.type === chatType &&
      this.currentChat.meta
    ) {
      this.currentChat.meta.disappear_after_seconds = seconds;
    }
  }

  openChatSettings() {
    if (!this.currentChat) {
      return;
    }
    if (this.elements.messageInput) {
      this.elements.messageInput.blur();
    }
    this.ensureChatSettingsModal();
    const conversation =
      this.getCurrentConversation() || this.currentChat.meta || {};
    const chatType = this.currentChat.type;
    let canEdit = true;
    let note = "";
    if (chatType === "group") {
      const perms = this.getGroupPermissionsFromConversation(conversation);
      canEdit = !!perms.can_change_info;
      if (!canEdit) {
        note = "Only admins can change this setting.";
      }
    } else if (chatType === "channel") {
      const perms = this.getChannelPermissionsFromConversation(conversation);
      canEdit = !!perms.can_manage;
      if (!canEdit) {
        note = "Only admins can change this setting.";
      }
    } else if (chatType === "saved") {
      canEdit = false;
      note = "Saved messages do not support disappearing timers.";
    }
    if (this.elements.chatDisappearSelect) {
      const current = Number(
        this.disappearSeconds || conversation.disappear_after_seconds || 0,
      );
      this.elements.chatDisappearSelect.value = String(current);
      this.elements.chatDisappearSelect.disabled = !canEdit;
    }
    if (this.elements.chatDisappearNote) {
      this.elements.chatDisappearNote.textContent = note;
      this.elements.chatDisappearNote.style.display = note ? "block" : "none";
    }
    if (this.elements.chatSettingsModal) {
      this.elements.chatSettingsModal.style.display = "flex";
      const focusTarget =
        this.elements.chatSettingsPanel || this.elements.chatSettingsModal;
      if (focusTarget && typeof focusTarget.focus === "function") {
        requestAnimationFrame(() => {
          focusTarget.focus({ preventScroll: true });
        });
        setTimeout(() => {
          if (document.activeElement === this.elements.messageInput) {
            focusTarget.focus({ preventScroll: true });
          }
        }, 0);
      }
    }
  }

  ensureChatSettingsModal() {
    if (this.elements.chatSettingsModal) {
      return;
    }
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.id = "chat-settings-modal";
    modal.style.display = "none";
    modal.innerHTML =
      '<div class="modal-content glass-card chat-search-modal" id="chat-settings-panel" tabindex="-1" role="dialog" aria-modal="true" aria-label="Chat settings">' +
      '<div class="modal-header"><h3>Chat settings</h3><button class="btn btn-icon" id="chat-settings-close">' +
      this.iconHtml("close") +
      "</button></div>" +
      '<div class="modal-body">' +
      '<form class="settings-form" autocomplete="off">' +
      '<div class="settings-section">' +
      '<div class="settings-header"><h3>Disappearing Messages</h3><p>Applies to new messages after you change the timer.</p></div>' +
      '<div class="setting-item">' +
      '<div class="setting-label"><h4>Timer</h4><p>Choose how long messages stay visible.</p></div>' +
      '<div class="setting-action">' +
      '<select id="disappear-timer-select" name="disappear_timer" class="form-control" autocomplete="new-password" inputmode="numeric" aria-label="Disappearing timer" data-lpignore="true" data-form-type="other" data-1p-ignore="true" data-bwignore="true">' +
      '<option value="0">Off</option>' +
      '<option value="3600">1 hour</option>' +
      '<option value="86400">1 day</option>' +
      '<option value="604800">1 week</option>' +
      "</select>" +
      "</div>" +
      "</div>" +
      '<div class="setting-item"><div class="setting-label"><p id="chat-disappear-note" class="text-muted" style="display:none;"></p></div></div>' +
      "</div>" +
      "</form>" +
      "</div>" +
      "</div>" +
      "</div>";
    document.body.appendChild(modal);
    this.elements.chatSettingsModal = modal;
    this.elements.chatSettingsPanel = document.getElementById(
      "chat-settings-panel",
    );
    this.elements.chatSettingsClose = document.getElementById(
      "chat-settings-close",
    );
    this.elements.chatDisappearSelect = document.getElementById(
      "disappear-timer-select",
    );
    this.elements.chatDisappearNote = document.getElementById(
      "chat-disappear-note",
    );
    if (this.elements.chatSettingsClose) {
      this.elements.chatSettingsClose.addEventListener("click", () => {
        modal.style.display = "none";
      });
    }
    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        modal.style.display = "none";
      }
    });
    if (this.elements.chatDisappearSelect) {
      this.elements.chatDisappearSelect.addEventListener("change", () => {
        const seconds =
          parseInt(this.elements.chatDisappearSelect.value, 10) || 0;
        this.saveDisappearingSetting(seconds);
      });
    }
  }

  async saveDisappearingSetting(seconds) {
    if (!this.currentChat) {
      return;
    }
    const chatType = this.currentChat.type;
    const chatId = this.currentChat.id;
    try {
      const res = await window.ApiClient.fetch("disappearing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_type: chatType,
          chat_id: chatId,
          disappear_after_seconds: seconds,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        this.showToast(
          data.message || "Unable to update disappearing messages",
        );
        return;
      }
      this.disappearSeconds = seconds;
      this.setConversationDisappearSeconds(chatType, chatId, seconds);
      this.updateDisappearIndicator(
        this.getConversation(chatId, chatType) || this.currentChat.meta,
      );
      this.showToast("Disappearing messages updated");
    } catch (err) {
      this.showToast("Unable to update disappearing messages");
    }
  }

  ensureScheduleModal() {
    if (this.elements.scheduleModal) {
      return;
    }
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.id = "schedule-modal";
    modal.style.display = "none";
    modal.innerHTML =
      '<div class="modal-content glass-card schedule-modal">' +
      '<div class="modal-header"><h3>Send later</h3><button class="btn btn-icon" id="schedule-close">' +
      this.iconHtml("close") +
      "</button></div>" +
      '<div class="modal-body">' +
      '<div class="schedule-quick">' +
      '<button class="btn btn-secondary" type="button" data-schedule-preset="later">Later today</button>' +
      '<button class="btn btn-secondary" type="button" data-schedule-preset="tomorrow">Tomorrow morning</button>' +
      "</div>" +
      '<label class="form-label" for="schedule-input">Choose date and time</label>' +
      '<input type="datetime-local" id="schedule-input" class="form-control" autocomplete="off">' +
      "</div>" +
      '<div class="modal-footer">' +
      '<button class="btn btn-secondary" type="button" id="schedule-cancel">Cancel</button>' +
      '<button class="btn btn-primary" type="button" id="schedule-confirm">Schedule</button>' +
      "</div>" +
      "</div>";
    document.body.appendChild(modal);
    this.elements.scheduleModal = modal;
    this.elements.scheduleInput = document.getElementById("schedule-input");
    this.elements.scheduleConfirm = document.getElementById("schedule-confirm");
    this.elements.scheduleCancel = document.getElementById("schedule-cancel");
    this.elements.scheduleClose = document.getElementById("schedule-close");

    if (this.elements.scheduleClose) {
      this.elements.scheduleClose.addEventListener("click", () =>
        this.closeScheduleModal(),
      );
    }
    if (this.elements.scheduleCancel) {
      this.elements.scheduleCancel.addEventListener("click", () =>
        this.closeScheduleModal(),
      );
    }
    if (this.elements.scheduleConfirm) {
      this.elements.scheduleConfirm.addEventListener("click", () =>
        this.confirmScheduleModal(),
      );
    }
    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        this.closeScheduleModal();
      }
    });
    modal.querySelectorAll("[data-schedule-preset]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const preset = btn.dataset.schedulePreset;
        const now = new Date();
        let next = new Date(now.getTime() + 60 * 60 * 1000);
        if (preset === "tomorrow") {
          next = new Date(now);
          next.setDate(now.getDate() + 1);
          next.setHours(9, 0, 0, 0);
        }
        if (this.elements.scheduleInput) {
          this.elements.scheduleInput.value = this.formatScheduleInput(next);
        }
      });
    });
  }

  formatScheduleInput(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return "";
    }
    const pad = (value) => String(value).padStart(2, "0");
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  openScheduleModal(options) {
    this.ensureScheduleModal();
    const context = options || { mode: "schedule" };
    if (context.mode === "schedule") {
      const text = this.elements.messageInput
        ? this.elements.messageInput.value.trim()
        : "";
      if (!text) {
        this.showToast("Type a message first");
        return;
      }
    }
    this.scheduleContext = context;
    const base = new Date();
    const defaultTime = new Date(base.getTime() + 60 * 60 * 1000);
    let preset = defaultTime;
    if (
      context.mode === "reschedule" &&
      context.message &&
      context.message._scheduled_at
    ) {
      const parsed = new Date(context.message._scheduled_at);
      if (!Number.isNaN(parsed.getTime())) {
        preset = parsed;
      }
    }
    if (this.elements.scheduleInput) {
      this.elements.scheduleInput.value = this.formatScheduleInput(preset);
    }
    if (this.elements.scheduleModal) {
      this.elements.scheduleModal.style.display = "flex";
    }
  }

  closeScheduleModal() {
    if (this.elements.scheduleModal) {
      this.elements.scheduleModal.style.display = "none";
    }
    this.scheduleContext = null;
  }

  async confirmScheduleModal() {
    if (!this.elements.scheduleInput) {
      return;
    }
    const raw = this.elements.scheduleInput.value;
    const when = new Date(raw);
    if (Number.isNaN(when.getTime())) {
      this.showToast("Choose a valid time");
      return;
    }
    if (when.getTime() <= Date.now() + 30000) {
      this.showToast("Pick a future time");
      return;
    }
    const context = this.scheduleContext || { mode: "schedule" };
    if (context.mode === "reschedule" && context.message) {
      await this.rescheduleScheduledMessage(context.message, when);
    } else {
      const text = this.elements.messageInput
        ? this.elements.messageInput.value
        : "";
      await this.scheduleTextMessage(text, when);
    }
    this.closeScheduleModal();
  }

  async scheduleTextMessage(rawText, when) {
    await this.ready;
    if (!this.currentChat) {
      return;
    }
    const chat = this.currentChat;
    const text = (rawText || "").trim();
    if (!text) {
      this.showToast("Type a message first");
      return;
    }
    if (this.pendingAttachment) {
      this.showToast("Finish attachment first");
      return;
    }
    if (this.editingMessage) {
      this.showToast("Finish editing first");
      return;
    }
    const replyToId = this.replyTo ? this.replyTo.message_id : null;
    const payload = {
      action: "schedule",
      chat_type: chat.type,
      chat_id: chat.type === "saved" ? this.userId : chat.id,
      message_type: "text",
      encrypted_content: null,
      send_at: when.toISOString(),
      reply_to_id: replyToId,
    };
    const mentionIds = await this.getMentionsForText(text, chat);
    if (mentionIds && mentionIds.length) {
      payload.mentions = mentionIds;
    }
    const contentHash = await this.computeContentHash(text);
    if (contentHash) {
      payload.content_hash = contentHash;
    }
    try {
      if (chat.type === "group") {
        let groupKey = null;
        try {
          const members = await this.getGroupMembersWithKeys(chat.id);
          groupKey = await this.getGroupContentKey(chat.id, {
            allowCreate: true,
            distribute: true,
            members: members,
          });
        } catch (_) {}
        if (groupKey && this.crypto) {
          const encrypted = await this.crypto.encryptWithKey(groupKey, text);
          const keyId = await this.getKeyIdForKey(groupKey, {
            group_id: chat.id,
          });
          payload.encrypted_content = {
            v: 1,
            alg: "AES-GCM",
            iv: encrypted.iv,
            ciphertext: encrypted.ciphertext,
            tag: encrypted.tag || null,
            kid: keyId || undefined,
          };
        } else {
          payload.encrypted_content = text;
          payload.message_text = text;
          payload.text = text;
        }
      } else if (chat.type === "channel") {
        let channelKey = null;
        try {
          const members = await this.getChannelMembersWithKeys(chat.id);
          channelKey = await this.getChannelContentKey(chat.id, {
            allowCreate: true,
            distribute: true,
            members: members,
          });
        } catch (_) {}
        if (channelKey && this.crypto) {
          const encrypted = await this.crypto.encryptWithKey(channelKey, text);
          const keyId = await this.getKeyIdForKey(channelKey, {
            channel_id: chat.id,
          });
          payload.encrypted_content = {
            v: 1,
            alg: "AES-GCM",
            iv: encrypted.iv,
            ciphertext: encrypted.ciphertext,
            tag: encrypted.tag || null,
            kid: keyId || undefined,
          };
        } else {
          payload.encrypted_content = text;
          payload.message_text = text;
          payload.text = text;
        }
      } else {
        const recipientId = chat.type === "saved" ? this.userId : chat.id;
        let recipientKey = null;
        try {
          recipientKey =
            chat.type === "saved"
              ? this.crypto?.publicKey
              : await this.getPublicKey(recipientId);
          if (!recipientKey && chat.type !== "saved") {
            await this.loadPublicKeys([recipientId]);
            recipientKey = await this.getPublicKey(recipientId);
          }
        } catch (_) {}

        if (recipientKey && this.crypto) {
          try {
            const encrypted = await this.crypto.encryptForDirect(
              text,
              recipientKey,
            );
            const keyId = await this.getKeyIdForKey(encrypted.contentKey, {
              recipient_id: recipientId,
            });
            if (keyId) {
              encrypted.encryptedContent.kid = keyId;
            }
            payload.encrypted_content = encrypted.encryptedContent;
            payload.key_sender = encrypted.keySender;
            payload.key_recipient = encrypted.keyRecipient;
          } catch (encErr) {
            payload.encrypted_content = text;
            payload.message_text = text;
            payload.text = text;
          }
        } else {
          payload.encrypted_content = text;
          payload.message_text = text;
          payload.text = text;
        }
      }
    } catch (err) {
      payload.encrypted_content = text;
      payload.message_text = text;
      payload.text = text;
    }

    try {
      const res = await window.ApiClient.fetch("scheduled_messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) {
        this.showToast(data.message || "Failed to schedule message");
        return;
      }
      const scheduled = {
        id: data.scheduled_id,
        conversation_id: payload.chat_id,
        conversation_type: payload.chat_type,
        encrypted_payload: payload.encrypted_content,
        meta: {
          message_type: "text",
          message_text: payload.message_text || text,
          text: payload.message_text || text,
          key_sender: payload.key_sender || null,
          key_recipient: payload.key_recipient || null,
          mentions: payload.mentions || [],
        },
        send_at: when.toISOString(),
        created_at: new Date().toISOString(),
      };
      this.createScheduledMessageStub(scheduled);
      if (this.elements.messageInput) {
        this.elements.messageInput.value = "";
        this.resizeComposer();
      }
      this.clearReply();
      await this.clearDraftForChat(chat);
    } catch (err) {
      this.showToast("Failed to schedule message");
    }
  }

  async rescheduleScheduledMessage(message, when) {
    if (!message || !message._scheduled_id) {
      return;
    }
    try {
      const res = await window.ApiClient.fetch("scheduled_messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reschedule",
          scheduled_id: message._scheduled_id,
          send_at: when.toISOString(),
        }),
      });
      const data = await res.json();
      if (!data.success) {
        this.showToast(data.message || "Unable to reschedule");
        return;
      }
      message._scheduled_at = when.toISOString();
      await this.refreshMessageElement(message.message_id);
    } catch (err) {
      this.showToast("Unable to reschedule");
    }
  }

  async cancelScheduledMessage(message) {
    if (!message || !message._scheduled_id) {
      return;
    }
    try {
      const res = await window.ApiClient.fetch("scheduled_messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "cancel",
          scheduled_id: message._scheduled_id,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        this.showToast(data.message || "Unable to cancel");
        return;
      }
      this.removeScheduledMessage(message._scheduled_id);
    } catch (err) {
      this.showToast("Unable to cancel");
    }
  }

  async loadScheduledMessages() {
    if (!this.currentChat || this.scheduledLoaded) {
      return;
    }
    const chatType = this.currentChat.type;
    const chatId = chatType === "saved" ? this.userId : this.currentChat.id;
    try {
      const res = await fetch(
        window.ApiClient.url("scheduled_messages", { chat_type: chatType, chat_id: chatId }),
        {
          cache: "no-store",
        },
      );
      const data = await res.json();
      if (data.success && Array.isArray(data.scheduled)) {
        data.scheduled.forEach((entry) =>
          this.createScheduledMessageStub(entry),
        );
      }
    } catch (err) {
    } finally {
      this.scheduledLoaded = true;
    }
  }

  createScheduledMessageStub(entry) {
    if (!entry || !entry.id) {
      return;
    }
    if (this.scheduledMessages.has(entry.id)) {
      return;
    }
    const scheduledId = entry.id;
    const tempMessageId = -1000000000 - scheduledId;
    const chatType =
      entry.conversation_type ||
      (this.currentChat ? this.currentChat.type : "direct");
    const chatId =
      entry.conversation_id || (this.currentChat ? this.currentChat.id : null);
    const meta = entry.meta || {};
    const message = {
      message_id: tempMessageId,
      sender_id: this.userId,
      receiver_id:
        chatType === "group" || chatType === "channel" ? null : chatId,
      group_id: chatType === "group" ? chatId : null,
      channel_id: chatType === "channel" ? chatId : null,
      message_type: meta.message_type || "text",
      message_text: meta.message_text || meta.text || (typeof entry.encrypted_payload === "string" && !entry.encrypted_payload.startsWith("{") ? entry.encrypted_payload : null),
      file_url: meta.file_url || null,
      encrypted_content: entry.encrypted_payload,
      key_sender: meta.key_sender || null,
      key_recipient: meta.key_recipient || null,
      created_at: entry.created_at || new Date().toISOString(),
      updated_at: null,
      reply_to_id: meta.reply_to_id || null,
      delivered_at: null,
      read_at: null,
      username: this.userName,
      profile_pic: null,
      _scheduled: true,
      _scheduled_id: scheduledId,
      _scheduled_at: entry.send_at || null,
    };
    if (message.message_text) {
      message._plaintext = message.message_text;
    }
    if (Array.isArray(meta.message_keys)) {
      const entryKey = meta.message_keys.find(
        (item) => parseInt(item.userId || item.user_id, 10) === this.userId,
      );
      if (entryKey) {
        message.key_for_user =
          entryKey.wrappedKey || entryKey.wrapped_key || null;
      }
    }
    this.scheduledMessages.set(scheduledId, { message_id: tempMessageId });
    this.appendMessages([message], {
      suppressNotify: true,
      skipReactions: true,
    });
  }

  removeScheduledMessage(scheduledId) {
    const entry = this.scheduledMessages.get(scheduledId);
    if (!entry) {
      return;
    }
    const messageId = entry.message_id;
    const element = this.messageElements.get(messageId);
    if (element) {
      element.remove();
    }
    this.messageElements.delete(messageId);
    this.messageCache.delete(messageId);
    this.scheduledMessages.delete(scheduledId);
  }

  ensureCommandPalette() {
    if (this.elements.commandPaletteModal) {
      return;
    }
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.id = "command-palette-modal";
    modal.style.display = "none";
    modal.innerHTML =
      '<div class="modal-content glass-card command-palette" role="dialog" aria-modal="true" aria-label="Command palette">' +
      '<div class="command-palette-header">' +
      '<input type="text" id="command-palette-input" class="form-control" placeholder="Type a command..." autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="text" data-lpignore="true" data-form-type="other" data-1p-ignore="true" data-bwignore="true">' +
      '<button class="btn btn-icon" id="command-palette-close">' +
      this.iconHtml("close") +
      "</button>" +
      "</div>" +
      '<div class="command-palette-list" id="command-palette-list"></div>' +
      "</div>";
    document.body.appendChild(modal);
    this.elements.commandPaletteModal = modal;
    this.elements.commandPaletteInput = document.getElementById(
      "command-palette-input",
    );
    this.elements.commandPaletteList = document.getElementById(
      "command-palette-list",
    );
    this.elements.commandPaletteClose = document.getElementById(
      "command-palette-close",
    );

    if (this.elements.commandPaletteClose) {
      this.elements.commandPaletteClose.addEventListener("click", () =>
        this.closeCommandPalette(),
      );
    }
    if (this.elements.commandPaletteInput) {
      this.elements.commandPaletteInput.addEventListener("input", () =>
        this.filterCommandPalette(),
      );
      this.elements.commandPaletteInput.addEventListener("keydown", (event) =>
        this.handleCommandPaletteKeydown(event),
      );
    }
    if (this.elements.commandPaletteList) {
      this.elements.commandPaletteList.addEventListener("click", (event) => {
        const item = event.target.closest("[data-command-index]");
        if (!item) {
          return;
        }
        const index = parseInt(item.dataset.commandIndex, 10);
        if (!Number.isFinite(index)) {
          return;
        }
        const entry = this.commandPalette.filtered[index];
        if (entry) {
          this.executeCommandPaletteItem(entry);
        }
      });
    }
    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        this.closeCommandPalette();
      }
    });
  }

  buildCommandPaletteItems() {
    const items = [
      {
        id: "new-chat",
        label: "New chat",
        action: () => this.openNewChatModal("new-direct"),
      },
      {
        id: "direct-message",
        label: "Direct message",
        action: () => this.openNewChatModal("new-direct"),
      },
      {
        id: "open-settings",
        label: "Open settings",
        action: () => {
          window.location.href = "settings";
        },
      },
      {
        id: "search-chat",
        label: "Search in chat",
        action: () => this.openChatSearch(),
      },
      {
        id: "storage-usage",
        label: "Storage usage",
        action: () => {
          window.location.href = "settings?open=storage";
        },
      },
      {
        id: "switch-theme",
        label: "Switch theme",
        action: () => this.cycleTheme(),
      },
    ];
    (this.conversations || []).forEach((conversation) => {
      const name = this.getConversationName(conversation);
      const chatId = this.getConversationId(conversation);
      items.push({
        id: `chat-${conversation.type}-${chatId}`,
        label: `Jump to ${name}`,
        action: () => this.openChat(chatId, conversation.type, conversation),
      });
    });
    return items;
  }

  toggleCommandPalette() {
    if (this.commandPalette.open) {
      this.closeCommandPalette();
    } else {
      this.openCommandPalette();
    }
  }

  openCommandPalette() {
    this.ensureCommandPalette();
    this.commandPalette.open = true;
    this.commandPalette.items = this.buildCommandPaletteItems();
    this.commandPalette.filtered = this.commandPalette.items.slice();
    this.commandPalette.index = 0;
    if (this.elements.commandPaletteInput) {
      this.elements.commandPaletteInput.value = "";
    }
    this.renderCommandPalette();
    if (this.elements.commandPaletteModal) {
      this.elements.commandPaletteModal.style.display = "flex";
    }
    if (this.elements.commandPaletteInput) {
      this.elements.commandPaletteInput.focus();
    }
  }

  closeCommandPalette() {
    if (!this.commandPalette.open) {
      return;
    }
    this.commandPalette.open = false;
    if (this.elements.commandPaletteModal) {
      this.elements.commandPaletteModal.style.display = "none";
    }
  }

  getOnboardingKey() {
    return this.userId
      ? `lc_onboarding_completed_${this.userId}`
      : "lc_onboarding_completed";
  }

  maybeShowOnboarding(force = false) {
    if (typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const isUrlForce = params.get("onboarding") === "1";
    const shouldShow = force || isUrlForce;
    if (!shouldShow) {
      if (this.onboardingShown) {
        return;
      }
      try {
        const key = this.getOnboardingKey();
        if (localStorage.getItem(key) === "1") {
          return;
        }
      } catch (err) {}
    }
    if (isUrlForce) {
      params.delete("onboarding");
      const next = params.toString();
      const nextUrl = `${window.location.pathname}${next ? "?" + next : ""}`;
      window.history.replaceState(null, "", nextUrl);
    }
    this.openOnboarding();
  }

  ensureOnboardingModal() {
    if (this.elements.onboardingModal) {
      return;
    }
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.id = "onboarding-modal";
    modal.innerHTML =
      '<div class="modal-content glass-card onboarding-modal" role="dialog" aria-modal="true" aria-label="Onboarding">' +
      '<div class="modal-header">' +
      "<h3>Welcome to Liquid Chat</h3>" +
      '<button class="btn btn-icon" id="onboarding-close" type="button">' +
      this.iconHtml("close") +
      "</button>" +
      "</div>" +
      '<div class="modal-body">' +
      '<div class="onboarding-steps" id="onboarding-steps">' +
      '<div class="onboarding-step" data-step="0">' +
      '<div class="settings-header"><h3>Private by default</h3><p>Your messages stay end-to-end encrypted.</p></div>' +
      '<div class="setting-item"><div class="setting-label"><h4>Secure delivery</h4><p>Only participants can decrypt your chats and media.</p></div></div>' +
      "</div>" +
      '<div class="onboarding-step" data-step="1">' +
      '<div class="settings-header"><h3>Stay organized</h3><p>Folders, drafts, and search keep your chats tidy.</p></div>' +
      '<div class="setting-item"><div class="setting-label"><h4>Drafts follow you</h4><p>Pick up unfinished messages right from the chat list.</p></div></div>' +
      '<div class="settings-header"><h3>Choose a theme</h3><p>Pick a look that matches your mood.</p></div>' +
      '<div class="onboarding-theme-options">' +
      '<button class="onboarding-theme-option" type="button" data-theme="midnight"><span>Midnight</span><div class="onboarding-theme-swatch theme-dark"></div></button>' +
      '<button class="onboarding-theme-option" type="button" data-theme="light-clean"><span>Light Clean</span><div class="onboarding-theme-swatch theme-light"></div></button>' +
      '<button class="onboarding-theme-option" type="button" data-theme="emerald-green"><span>Emerald</span><div class="onboarding-theme-swatch theme-emerald"></div></button>' +
      "</div>" +
      "</div>" +
      '<div class="onboarding-step" data-step="2">' +
      '<div class="settings-header"><h3>Stay in the loop</h3><p>Notifications and smart caching keep you fast.</p></div>' +
      '<div class="setting-item"><div class="setting-label"><h4>Notifications</h4><p>Enable alerts so you never miss a message.</p></div>' +
      '<div class="setting-action"><button class="btn btn-secondary" type="button" id="onboarding-notify">Enable notifications</button></div></div>' +
      '<div class="setting-item"><div class="setting-label"><h4>Media cache</h4><p>Manage what stays downloaded in Settings.</p></div></div>' +
      "</div>" +
      "</div>" +
      '<div class="onboarding-actions">' +
      '<div class="onboarding-dots" id="onboarding-dots"></div>' +
      '<div class="onboarding-buttons">' +
      '<button class="btn btn-secondary" type="button" id="onboarding-back">Back</button>' +
      '<button class="btn btn-secondary" type="button" id="onboarding-skip">Skip</button>' +
      '<button class="btn btn-primary" type="button" id="onboarding-next">Next</button>' +
      "</div>" +
      "</div>" +
      "</div>" +
      "</div>";
    document.body.appendChild(modal);
    this.elements.onboardingModal = modal;
    this.elements.onboardingClose = document.getElementById("onboarding-close");
    this.elements.onboardingSteps = document.getElementById("onboarding-steps");
    this.elements.onboardingDots = document.getElementById("onboarding-dots");
    this.elements.onboardingBack = document.getElementById("onboarding-back");
    this.elements.onboardingSkip = document.getElementById("onboarding-skip");
    this.elements.onboardingNext = document.getElementById("onboarding-next");
    this.elements.onboardingNotify =
      document.getElementById("onboarding-notify");

    if (this.elements.onboardingClose) {
      this.elements.onboardingClose.addEventListener("click", () =>
        this.completeOnboarding(),
      );
    }
    if (this.elements.onboardingSkip) {
      this.elements.onboardingSkip.addEventListener("click", () =>
        this.completeOnboarding(),
      );
    }
    if (this.elements.onboardingBack) {
      this.elements.onboardingBack.addEventListener("click", () =>
        this.updateOnboardingStep(this.onboardingIndex - 1),
      );
    }
    if (this.elements.onboardingNext) {
      this.elements.onboardingNext.addEventListener("click", () => {
        const total = this.elements.onboardingSteps
          ? this.elements.onboardingSteps.querySelectorAll(".onboarding-step")
              .length
          : 0;
        if (this.onboardingIndex >= total - 1) {
          this.completeOnboarding();
        } else {
          this.updateOnboardingStep(this.onboardingIndex + 1);
        }
      });
    }
    if (this.elements.onboardingNotify) {
      this.elements.onboardingNotify.addEventListener("click", () =>
        this.requestOnboardingNotifications(),
      );
    }
    modal.querySelectorAll("[data-theme]").forEach((btn) => {
      btn.addEventListener("click", () =>
        this.applyOnboardingTheme(btn.dataset.theme || ""),
      );
    });
  }

  openOnboarding() {
    this.ensureOnboardingModal();
    this.onboardingShown = true;
    this.onboardingIndex = 0;
    this.updateOnboardingStep(0);
    if (this.elements.onboardingModal) {
      this.elements.onboardingModal.style.display = "flex";
    }
  }

  closeOnboarding(markCompleted = true) {
    if (!this.elements.onboardingModal) {
      return;
    }
    if (markCompleted) {
      const key = this.getOnboardingKey();
      try {
        localStorage.setItem(key, "1");
      } catch (err) {}
    }
    this.elements.onboardingModal.style.display = "none";
  }

  completeOnboarding() {
    this.closeOnboarding(true);
  }

  updateOnboardingStep(index) {
    if (!this.elements.onboardingSteps) {
      return;
    }
    const steps = Array.from(
      this.elements.onboardingSteps.querySelectorAll(".onboarding-step"),
    );
    if (!steps.length) {
      return;
    }
    this.onboardingIndex = Math.max(0, Math.min(index, steps.length - 1));
    steps.forEach((step, idx) => {
      step.classList.toggle("active", idx === this.onboardingIndex);
    });
    if (this.elements.onboardingDots) {
      this.elements.onboardingDots.innerHTML = "";
      steps.forEach((step, idx) => {
        const dot = document.createElement("span");
        dot.className =
          "onboarding-dot" + (idx === this.onboardingIndex ? " active" : "");
        this.elements.onboardingDots.appendChild(dot);
      });
    }
    if (this.elements.onboardingBack) {
      this.elements.onboardingBack.style.visibility =
        this.onboardingIndex === 0 ? "hidden" : "visible";
    }
    if (this.elements.onboardingNext) {
      this.elements.onboardingNext.textContent =
        this.onboardingIndex === steps.length - 1 ? "Start Chatting" : "Next";
    }
  }

  applyOnboardingTheme(theme) {
    if (!theme) {
      return;
    }
    if (window.LiquidTheme && typeof window.LiquidTheme.apply === "function") {
      window.LiquidTheme.apply(theme);
      this.showToast("Theme updated");
    } else {
      document.documentElement.dataset.theme = theme;
      try {
        localStorage.setItem("lc_theme", theme);
      } catch (err) {}
    }
  }

  async requestOnboardingNotifications() {
    if (!("Notification" in window)) {
      this.showToast("Notifications not supported");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        this.notificationReady = true;
        this.ensurePushSubscription();
        this.showToast("Notifications enabled");
      } else {
        this.showToast("Notifications blocked");
      }
    } catch (err) {
      this.showToast("Notifications unavailable");
    }
  }

  filterCommandPalette() {
    const term = (
      this.elements.commandPaletteInput
        ? this.elements.commandPaletteInput.value
        : ""
    )
      .trim()
      .toLowerCase();
    if (!term) {
      this.commandPalette.filtered = this.commandPalette.items.slice();
    } else {
      this.commandPalette.filtered = this.commandPalette.items.filter((item) =>
        item.label.toLowerCase().includes(term),
      );
    }
    this.commandPalette.index = 0;
    this.renderCommandPalette();
  }

  handleCommandPaletteKeydown(event) {
    if (!event) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      this.commandPalette.index = Math.min(
        this.commandPalette.index + 1,
        this.commandPalette.filtered.length - 1,
      );
      this.renderCommandPalette();
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      this.commandPalette.index = Math.max(this.commandPalette.index - 1, 0);
      this.renderCommandPalette();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const entry = this.commandPalette.filtered[this.commandPalette.index];
      if (entry) {
        this.executeCommandPaletteItem(entry);
      }
    }
  }

  renderCommandPalette() {
    if (!this.elements.commandPaletteList) {
      return;
    }
    const list = this.elements.commandPaletteList;
    list.innerHTML = "";
    if (!this.commandPalette.filtered.length) {
      list.innerHTML =
        '<div class="command-palette-empty">No actions found.</div>';
      return;
    }
    this.commandPalette.filtered.forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "command-palette-item";
      if (index === this.commandPalette.index) {
        row.classList.add("active");
      }
      row.dataset.commandIndex = String(index);
      row.textContent = item.label;
      list.appendChild(row);
    });
  }

  executeCommandPaletteItem(item) {
    this.closeCommandPalette();
    if (item && typeof item.action === "function") {
      item.action();
    }
  }

  openNewChatModal(tabId) {
    const modal = document.getElementById("new-chat-modal");
    if (!modal) {
      return;
    }
    modal.style.display = "flex";
    if (tabId) {
      const tab = modal.querySelector(`.tab[data-tab="${tabId}"]`);
      if (tab) {
        tab.click();
      }
    }
    const input = document.getElementById("user-search");
    if (input) {
      input.focus();
    }
  }

  cycleTheme() {
    const themeApi = window.LiquidTheme;
    if (!themeApi || !Array.isArray(themeApi.themes)) {
      return;
    }
    const themes = themeApi.themes;
    const current = themeApi.get ? themeApi.get() : themes[0];
    const index = Math.max(0, themes.indexOf(current));
    const next = themes[(index + 1) % themes.length];
    if (themeApi.apply) {
      themeApi.apply(next);
      this.showToast(`Theme: ${next.replace(/-/g, " ")}`);
    }
  }
  async loadMessages(reset, signal) {
    if (!this.currentChat || !this.elements.messageContainer) {
      return false;
    }
    const currentToken = this._openChatToken;
    const currentChatId = this.currentChat.id;
    const currentChatType = this.currentChat.type;

    let url = "";
    if (this.currentChat.type === "group") {
      url = window.ApiClient.url("messages", { group_id: this.currentChat.id });
    } else if (this.currentChat.type === "channel") {
      url = window.ApiClient.url("messages", { channel_id: this.currentChat.id });
    } else if (this.currentChat.type === "saved") {
      const savedUserId = this.userId || this.currentChat.id;
      url = window.ApiClient.url("messages", { user_id: savedUserId, chat_type: "saved" });
    } else {
      url = window.ApiClient.url("messages", { user_id: this.currentChat.id });
    }
    if (!reset && this.lastMessageId) {
      url += "&since_message_id=" + this.lastMessageId;
    }
    try {
      const options = signal
        ? { signal, cache: "no-store" }
        : { cache: "no-store" };
      const res = await fetch(url, options);
      const data = await res.json();
      if (this._openChatToken !== currentToken || !this.currentChat || this.currentChat.id !== currentChatId || this.currentChat.type !== currentChatType) {
        return false;
      }
      if (data.success) {
        const hasMessages =
          Array.isArray(data.messages) && data.messages.length;
        const hasDeleted = Array.isArray(data.deleted) && data.deleted.length;
        const hasUpdates = Array.isArray(data.updates) && data.updates.length;
        if (reset) {
          this.elements.messageContainer.innerHTML = "";
          this.messageCache.clear();
          this.messageElements.clear();
        }
        if (hasMessages) {
          await this.appendMessages(data.messages, { suppressNotify: false });
          if (this._openChatToken !== currentToken || !this.currentChat) return false;
          this.scrollToBottom("auto");
        }
        if (hasDeleted) {
          this.applyDeletedMessages(data.deleted);
        }
        if (hasUpdates) {
          await this.applyMessageUpdates(data.updates);
        }
        const hasReactionUpdates =
          data.reaction_updates && typeof data.reaction_updates === "object";
        if (hasReactionUpdates) {
          this.applyReactionUpdates(data.reaction_updates);
        }
        if (
          hasUpdates &&
          (!hasReactionUpdates || !Object.keys(data.reaction_updates).length)
        ) {
          const updateIds = data.updates
            .map((update) => parseInt(update.message_id, 10))
            .filter((id) => Number.isFinite(id) && id > 0);
          if (updateIds.length) {
            this.fetchReactions(updateIds);
          }
        }
        if (data.activity) {
          this.renderActivity(data.activity);
        } else if (!data.activity && this.elements.activityIndicator) {
          this.renderActivity([]);
        }
        return true;
      }
    } catch (err) {
      if (err.name === "AbortError") {
        return false;
      }
      console.error("Failed to load messages", err);
    }
    return false;
  }

  async appendMessages(messages, options) {
    if (!messages.length) {
      return;
    }
    const opts = options || {};
    const suppressNotify = !!opts.suppressNotify;
    const skipReactions = !!opts.skipReactions;
    const fromCache = !!opts.fromCache;
    const wasNearBottom = this.isUserNearBottom();
    let hasSelfMessage = false;
    let hasIncomingFromOthers = false;
    let hiddenIncomingCount = 0;
    for (const message of messages) {
      const parsedId = parseInt(message.message_id, 10);
      if (!Number.isNaN(parsedId)) {
        message.message_id = parsedId;
      }
      if (message.sender_id !== null && message.sender_id !== undefined) {
        const parsedSender = parseInt(message.sender_id, 10);
        if (!Number.isNaN(parsedSender)) {
          message.sender_id = parsedSender;
        }
      }
      if (message.receiver_id !== null && message.receiver_id !== undefined) {
        const parsedReceiver = parseInt(message.receiver_id, 10);
        if (!Number.isNaN(parsedReceiver)) {
          message.receiver_id = parsedReceiver;
        }
      }
      if (message.group_id !== null && message.group_id !== undefined) {
        const parsedGroup = parseInt(message.group_id, 10);
        if (!Number.isNaN(parsedGroup)) {
          message.group_id = parsedGroup;
        }
      }
      if (message.channel_id !== null && message.channel_id !== undefined) {
        const parsedChannel = parseInt(message.channel_id, 10);
        if (!Number.isNaN(parsedChannel)) {
          message.channel_id = parsedChannel;
        }
      }
      if (message.reply_to_id !== null && message.reply_to_id !== undefined) {
        const parsedReplyId = parseInt(message.reply_to_id, 10);
        if (!Number.isNaN(parsedReplyId)) {
          message.reply_to_id = parsedReplyId;
        }
      }
      if (message.sender_id && Number(message.sender_id) !== Number(this.userId)) {
        this.clearTypingForUser(message.sender_id);
      }
      if (!fromCache && this.deletedMessageIds.has(message.message_id)) {
        this.deletedMessageIds.delete(message.message_id);
      }
      if (this.deletedMessageIds.has(message.message_id)) {
        continue;
      }
      if (message.expires_at) {
        const exp = Date.parse(message.expires_at);
        if (!Number.isNaN(exp) && exp <= Date.now()) {
          this.deletedMessageIds.add(message.message_id);
          continue;
        }
      }
      if (this.messageCache.has(message.message_id)) {
        continue;
      }
      this.messageCache.set(message.message_id, message);
      try {
        const messageEl = await this.buildMessageElement(message);
        if (messageEl) {
          if (
            this.elements.typingBubble &&
            this.elements.typingBubble.parentNode ===
              this.elements.messageContainer
          ) {
            this.elements.messageContainer.insertBefore(
              messageEl,
              this.elements.typingBubble,
            );
          } else {
            this.elements.messageContainer.appendChild(messageEl);
          }
          this.messageElements.set(message.message_id, messageEl);
        }
      } catch (msgErr) {
        console.error("Failed to render message", message.message_id, msgErr);
      }

      // Auto-download check
      this.checkAutoDownload(message);

      if (!message._pending) {
        const timestamp = Math.floor(
          new Date(message.created_at).getTime() / 1000,
        );
        if (message.message_id && message.message_id > this.lastMessageId) {
          this.lastMessageId = message.message_id;
        }
      }

      if (message.sender_id === this.userId || message._pending) {
        hasSelfMessage = true;
      } else if (!message._pending) {
        hasIncomingFromOthers = true;
        if (!fromCache) {
          hiddenIncomingCount += 1;
        }
      }
      if (
        !suppressNotify &&
        message.sender_id &&
        message.sender_id !== this.userId
      ) {
        const didNotify = this.maybeNotify(message);
        if (!didNotify) {
          this.recordNotificationBaseline(message);
        }
      }
      if (!fromCache && !message._scheduled) {
        this.upsertConversationCacheMessage(message);
      }
    }

    if (!skipReactions) {
      const reactionIds = messages
        .map((msg) => parseInt(msg.message_id, 10))
        .filter((id) => Number.isFinite(id) && id > 0);
      if (reactionIds.length) {
        this.fetchReactions(reactionIds);
      }
    }
    if (!fromCache) {
      this.persistConversationCache();
    }
    const shouldAutoScroll = wasNearBottom || hasSelfMessage;
    if (shouldAutoScroll) {
      this.scrollToBottom();
      this.resetNewMessagesJump();
    } else if (hiddenIncomingCount > 0) {
      this.bumpNewMessagesJump(hiddenIncomingCount);
    } else {
      this.updateNewMessagesJump();
    }
    if (
      hasIncomingFromOthers &&
      (shouldAutoScroll || this.isUserNearBottom())
    ) {
      this.queueMarkSeen();
    }
    this.startExpiryTimer();
  }

  async prependMessages(messages, options) {
    if (!messages.length || !this.elements.messageContainer) {
      return;
    }
    const container = this.elements.messageContainer;
    const beforeHeight = container.scrollHeight;
    const beforeScroll = container.scrollTop;
    const fragment = document.createDocumentFragment();
    for (const message of messages) {
      const parsedId = parseInt(message.message_id, 10);
      if (!Number.isNaN(parsedId)) {
        message.message_id = parsedId;
      }
      if (message.sender_id !== null && message.sender_id !== undefined) {
        const parsedSender = parseInt(message.sender_id, 10);
        if (!Number.isNaN(parsedSender)) {
          message.sender_id = parsedSender;
        }
      }
      if (message.receiver_id !== null && message.receiver_id !== undefined) {
        const parsedReceiver = parseInt(message.receiver_id, 10);
        if (!Number.isNaN(parsedReceiver)) {
          message.receiver_id = parsedReceiver;
        }
      }
      if (message.group_id !== null && message.group_id !== undefined) {
        const parsedGroup = parseInt(message.group_id, 10);
        if (!Number.isNaN(parsedGroup)) {
          message.group_id = parsedGroup;
        }
      }
      if (message.channel_id !== null && message.channel_id !== undefined) {
        const parsedChannel = parseInt(message.channel_id, 10);
        if (!Number.isNaN(parsedChannel)) {
          message.channel_id = parsedChannel;
        }
      }
      if (message.reply_to_id !== null && message.reply_to_id !== undefined) {
        const parsedReplyId = parseInt(message.reply_to_id, 10);
        if (!Number.isNaN(parsedReplyId)) {
          message.reply_to_id = parsedReplyId;
        }
      }
      if (message.sender_id && Number(message.sender_id) !== Number(this.userId)) {
        this.clearTypingForUser(message.sender_id);
      }
      if (this.deletedMessageIds.has(message.message_id)) {
        continue;
      }
      if (this.messageCache.has(message.message_id)) {
        continue;
      }
      if (message.expires_at) {
        const expiry = Date.parse(message.expires_at);
        if (!Number.isNaN(expiry) && expiry <= Date.now()) {
          continue;
        }
      }
      this.messageCache.set(message.message_id, message);
      const messageEl = await this.buildMessageElement(message);
      if (messageEl) {
        fragment.appendChild(messageEl);
        this.messageElements.set(message.message_id, messageEl);
      }
      this.checkAutoDownload(message);
      this.upsertConversationCacheMessage(message);
    }
    const anchor =
      container.querySelector(".message") || this.elements.typingBubble;
    if (anchor) {
      container.insertBefore(fragment, anchor);
    } else {
      container.appendChild(fragment);
    }
    const afterHeight = container.scrollHeight;
    container.scrollTop = beforeScroll + (afterHeight - beforeHeight);
    this.persistConversationCache();
    this.startExpiryTimer();
  }

  async loadTombstonesForChat() {
    if (!this.mediaStore || !this.currentChat) {
      return [];
    }
    const chatKey = this.getChatKeyFromChat(this.currentChat);
    if (!chatKey) {
      return [];
    }
    try {
      return await this.mediaStore.getTombstones(chatKey);
    } catch (err) {
      return [];
    }
  }

  storeTombstones(messageIds) {
    if (!this.mediaStore || !this.currentChat) {
      return;
    }
    const chatKey = this.getChatKeyFromChat(this.currentChat);
    if (!chatKey) {
      return;
    }
    (messageIds || []).forEach((id) => {
      this.mediaStore.addTombstone(id, chatKey).catch(() => {});
      this.purgeMediaForMessage(id);
    });
  }

  async purgeMediaForMessage(messageId) {
    if (!this.mediaStore) {
      return;
    }
    const parsedId = parseInt(messageId, 10);
    if (!parsedId || parsedId <= 0) {
      return;
    }
    try {
      const refs = await this.mediaStore.getMediaRefsForMessage(parsedId);
      for (const ref of refs) {
        if (ref && ref.media_id) {
          await this.mediaStore.deleteMediaBlob(ref.media_id);
          await this.mediaStore.deleteThumb(ref.media_id);
        }
      }
      await this.mediaStore.removeMediaRefsForMessage(parsedId);
    } catch (err) {
      // ignore purge failures
    }
  }

  applyDeletedMessages(deletedIds) {
    deletedIds.forEach((id) => {
      const messageId = parseInt(id, 10);
      if (!messageId) {
        return;
      }
      const element =
        this.messageElements.get(messageId) ||
        document.getElementById(`msg_${messageId}`) ||
        document.getElementById(`msg-${messageId}`) ||
        document.querySelector(`.message[data-message-id="${messageId}"]`) ||
        document.querySelector(`[data-message-id="${messageId}"]`);
      if (element) {
        const snapFn = (window.TelegramZ && typeof window.TelegramZ.animateSnap === "function")
          ? window.TelegramZ.animateSnap.bind(window.TelegramZ)
          : (window.telegramZShell && typeof window.telegramZShell.animateSnap === "function")
          ? window.telegramZShell.animateSnap.bind(window.telegramZShell)
          : null;
        if (snapFn) {
          try {
            snapFn(element);
          } catch (e) {
            console.warn("Snap animation failed:", e);
            element.style.opacity = "0";
            element.style.pointerEvents = "none";
          }
          setTimeout(() => {
            try { element.remove(); } catch (e) {}
          }, 850);
        } else {
          element.remove();
        }
      }
      this.messageElements.delete(messageId);
      this.messageCache.delete(messageId);
      this.deletedMessageIds.add(messageId);
      this.mediaDownloadHandlers.delete(messageId);
      if (this.pinnedMessageId === messageId) {
        this.updatePinnedBanner(null);
      }
    });
    this.removeMessagesFromCache(deletedIds);
    this.storeTombstones(deletedIds);
  }

  async applyMessageUpdates(updates) {
    for (const update of updates) {
      const parsedId = parseInt(update.message_id, 10);
      const messageId = Number.isNaN(parsedId) ? update.message_id : parsedId;
      if (!messageId) {
        continue;
      }
      if (update.reply_to_id !== null && update.reply_to_id !== undefined) {
        const parsedReplyId = parseInt(update.reply_to_id, 10);
        if (!Number.isNaN(parsedReplyId)) {
          update.reply_to_id = parsedReplyId;
        }
      }
      const existing = this.messageCache.get(messageId);
      if (!existing) {
        continue;
      }
      if (update.sender_id !== null && update.sender_id !== undefined) {
        const parsedSender = parseInt(update.sender_id, 10);
        if (!Number.isNaN(parsedSender)) {
          update.sender_id = parsedSender;
        }
      }
      if (update.receiver_id !== null && update.receiver_id !== undefined) {
        const parsedReceiver = parseInt(update.receiver_id, 10);
        if (!Number.isNaN(parsedReceiver)) {
          update.receiver_id = parsedReceiver;
        }
      }
      const merged = Object.assign({}, existing, update);
      this.messageCache.set(messageId, merged);
      this.upsertConversationCacheMessage(merged);

      const element = this.messageElements.get(messageId);
      if (!element) {
        continue;
      }

      const needsRebuild =
        (update.edited_at && update.edited_at !== existing.edited_at) ||
        (update.encrypted_content &&
          update.encrypted_content !== existing.encrypted_content);
      if (needsRebuild) {
        const newElement = await this.buildMessageElement(merged);
        if (newElement) {
          element.replaceWith(newElement);
          this.messageElements.set(messageId, newElement);
        }
        continue;
      }

      const status = element.querySelector(".message-status");
      if (status) {
        status.classList.remove("read", "delivered", "sent");
        if (merged.read_at) {
          status.classList.add("read");
          status.innerHTML = this.iconHtml("check-double");
          status.title = "Read at " + this.formatTime(merged.read_at);
        } else if (merged.delivered_at) {
          status.classList.add("delivered");
          status.innerHTML = this.iconHtml("check-double");
          status.title = "";
        } else {
          status.classList.add("sent");
          status.innerHTML = this.iconHtml("check");
          status.title = "";
        }
      }
    }
    this.persistConversationCache();
    this.startExpiryTimer();
  }

  getEventChatInfo(payload, conversationId) {
    const chatType =
      payload && payload.chat_type
        ? payload.chat_type
        : payload && payload.group_id
          ? "group"
          : payload && payload.channel_id
            ? "channel"
            : "direct";
    let chatId = conversationId || 0;
    if (chatType === "group") {
      chatId =
        payload && payload.group_id ? parseInt(payload.group_id, 10) : chatId;
    } else if (chatType === "channel") {
      chatId =
        payload && payload.channel_id
          ? parseInt(payload.channel_id, 10)
          : chatId;
    } else if (chatType === "direct" || chatType === "saved") {
      const senderId =
        payload && payload.sender_id ? parseInt(payload.sender_id, 10) : 0;
      const receiverId =
        payload && payload.receiver_id ? parseInt(payload.receiver_id, 10) : 0;
      if (senderId && receiverId) {
        chatId = senderId === this.userId ? receiverId : senderId;
      } else if (payload && payload.user_id) {
        chatId = parseInt(payload.user_id, 10) || chatId;
      }
    }
    return { chatType: chatType, chatId: chatId };
  }

  isEventForCurrentChat(info) {
    if (!this.currentChat || !info) {
      return false;
    }
    if (info.chatType === "saved") {
      return this.currentChat.type === "saved";
    }
    if (info.chatType !== this.currentChat.type) {
      return false;
    }
    return parseInt(this.currentChat.id, 10) === parseInt(info.chatId, 10);
  }

  async applyEvents(events) {
    if (!Array.isArray(events)) {
      return;
    }
    for (const event of events) {
      const payload = event && event.payload ? event.payload : null;
      const info = this.getEventChatInfo(payload || {}, event.conversation_id);
      const isCurrent = this.isEventForCurrentChat(info);
      if (!payload && event.type !== "settings_update") {
        continue;
      }
      if (event.type === "message_new") {
        if (payload && payload.scheduled_id) {
          this.removeScheduledMessage(payload.scheduled_id);
        }
        if (payload) {
          if (payload.sender_id && Number(payload.sender_id) !== Number(this.userId)) {
            this.clearTypingForUser(payload.sender_id);
          }
          this.updateConversationFromEvent(payload, info);
          if (isCurrent) {
            await this.appendMessages([payload], { suppressNotify: false });
          } else if (payload.sender_id && payload.sender_id !== this.userId) {
            const didNotify = this.maybeNotify(payload);
            if (!didNotify) {
              this.recordNotificationBaseline(payload);
            }
          }
        }
        continue;
      }
      if (event.type === "message_edit") {
        if (payload) {
          this.updateConversationFromEdit(payload, info);
        }
        if (isCurrent && payload) {
          await this.applyMessageUpdates([payload]);
        }
        continue;
      }
      if (!isCurrent) {
        continue;
      }
      if (event.type === "seen_update") {
        if (payload && payload.message_id) {
          await this.applyMessageUpdates([payload]);
        }
        continue;
      }
      if (event.type === "message_delete") {
        if (payload && payload.message_id) {
          this.applyDeletedMessages([payload.message_id]);
        }
        continue;
      }
      if (event.type === "reaction_add" || event.type === "reaction_remove") {
        if (payload && payload.message_id) {
          this.applyReactionEvent(payload);
        }
        continue;
      }
      if (
        event.type === "typing_start" ||
        event.type === "typing_stop" ||
        event.type === "activity_start" ||
        event.type === "activity_stop"
      ) {
        if (payload) {
          this.applyTypingEvent(payload, event.type);
        }
        continue;
      }
    }
  }

  reorderConversationToTop(conversation) {
    if (!conversation || !this.conversations) return;
    const key = this.getConversationKey(conversation);
    // Remove ALL instances with matching key to strictly prevent duplicates
    this.conversations = this.conversations.filter((c) => this.getConversationKey(c) !== key);
    const firstUnpinned = this.conversations.findIndex((c) => !c.is_pinned);
    if (firstUnpinned !== -1) {
      this.conversations.splice(firstUnpinned, 0, conversation);
    } else {
      this.conversations.unshift(conversation);
    }
    this.renderConversations();
    this.persistConversationsCache();
  }

  updateConversationFromEvent(payload, info) {
    if (!payload || !info) {
      return;
    }
    let conversation = this.getConversation(info.chatId, info.chatType);
    if (!conversation) {
      this.loadConversations();
      return;
    }
    const messageId = parseInt(payload.message_id, 10);
    if (Number.isFinite(messageId)) {
      conversation.message_id = messageId;
    }
    conversation.message_type = payload.message_type || "text";
    conversation.encrypted_content = payload.encrypted_content || null;
    conversation.file_url = payload.file_url || null;
    conversation.key_sender = payload.key_sender || null;
    conversation.key_recipient = payload.key_recipient || null;
    conversation.key_for_user = payload.key_for_user || null;
    const rawTxt = payload.message_text || payload.text || "";
    if (rawTxt) {
      conversation.message_text = rawTxt;
      conversation.last_message = rawTxt;
      conversation.preview_plaintext = rawTxt;
    }
    conversation.message_date =
      payload.created_at || payload.updated_at || new Date().toISOString();
    conversation.last_sender_id =
      payload.sender_id || conversation.last_sender_id || null;
    if (payload.sender_id && payload.sender_id !== this.userId) {
      conversation.is_unread = 1;
    }
    if (payload.mentions && Array.isArray(payload.mentions)) {
      conversation.mention_flag = payload.mentions.includes(this.userId)
        ? 1
        : 0;
    }
    this.reorderConversationToTop(conversation);
  }

  updateConversationFromEdit(payload, info) {
    if (!payload || !info) {
      return;
    }
    const conversation = this.getConversation(info.chatId, info.chatType);
    if (!conversation) {
      return;
    }
    const messageId = parseInt(payload.message_id, 10);
    if (
      !Number.isFinite(messageId) ||
      parseInt(conversation.message_id, 10) !== messageId
    ) {
      return;
    }
    conversation.encrypted_content =
      payload.encrypted_content || conversation.encrypted_content;
    conversation.key_sender = payload.key_sender || conversation.key_sender;
    conversation.key_recipient =
      payload.key_recipient || conversation.key_recipient;
    conversation.key_for_user =
      payload.key_for_user || conversation.key_for_user;
    conversation.preview_plaintext = null;
    const item = this.findConversationItemByKey(
      this.getConversationKey(conversation),
    );
    if (item) {
      this.updateConversationPreview(item, conversation);
      this.updateConversationPresenceIndicator(item, conversation);
    }
    this.persistConversationsCache();
  }

  applyReactionEvent(payload) {
    if (!payload) {
      return;
    }
    const messageId = parseInt(payload.message_id, 10);
    if (!messageId) {
      return;
    }
    const current = this.getReactionState(messageId);
    const counts = payload.counts || current.counts || {};
    let mine = Array.isArray(current.mine) ? current.mine.slice() : [];
    const actorId = parseInt(payload.actor_id || 0, 10);
    if (actorId && actorId === this.userId && payload.reaction) {
      if (payload.action === "add") {
        mine.push(payload.reaction);
      } else if (payload.action === "remove") {
        mine = mine.filter((emoji) => emoji !== payload.reaction);
      }
    }
    mine = Array.from(new Set(mine));
    this.updateReactions(messageId, { counts, mine });
  }

  getActivityText(activityType) {
    const isFa = (document.documentElement.lang === "fa" || (document.body && document.body.dir === "rtl") || /[\u0600-\u06FF]/.test(document.title));
    switch (activityType) {
      case "upload_photo":
        return isFa ? "در حال ارسال عکس..." : "is sending a photo...";
      case "upload_video":
        return isFa ? "در حال ارسال ویدیو..." : "is sending a video...";
      case "upload_file":
      case "uploading":
        return isFa ? "در حال ارسال فایل..." : "is sending a file...";
      case "record_voice":
        return isFa ? "در حال ضبط پیام صوتی..." : "is recording a voice message...";
      case "record_video":
      case "recording":
        return isFa ? "در حال ضبط پیام ویدیویی..." : "is recording a video message...";
      case "typing":
      default:
        return isFa ? "در حال نوشتن..." : "is typing...";
    }
  }

  clearTypingForUser(userId) {
    if (!userId) return;
    const uid = parseInt(userId, 10);
    if (!uid) return;
    if (this.typingUsers && this.typingUsers.has(uid)) {
      const existing = this.typingUsers.get(uid);
      if (existing && existing.timer) {
        clearTimeout(existing.timer);
      }
      this.typingUsers.delete(uid);
      this.updateTypingIndicatorFromEvents();
    }
  }

  clearAllTyping() {
    if (this.typingUsers) {
      for (const [, item] of this.typingUsers.entries()) {
        if (item && item.timer) clearTimeout(item.timer);
      }
      this.typingUsers.clear();
    }
    this.typingActive = false;
    if (this.elements.typingBubble) {
      this.elements.typingBubble.classList.remove("active");
      this.elements.typingBubble.style.setProperty("display", "none", "important");
    }
    if (this.elements.activityIndicator) {
      this.elements.activityIndicator.style.setProperty("display", "none", "important");
      this.elements.activityIndicator.textContent = "";
    }
    if (this.elements.chatTopbarSubtitle) {
      if (this._originalSubtitle !== undefined && this._originalSubtitle !== null) {
        this.elements.chatTopbarSubtitle.textContent = this._originalSubtitle;
        this._originalSubtitle = null;
      }
      this.elements.chatTopbarSubtitle.classList.remove("is-typing");
    }
    if (this.elements.conversationsList) {
      const activePreviews = this.elements.conversationsList.querySelectorAll(".is-typing-preview");
      activePreviews.forEach((el) => {
        if (el.dataset.origPreview !== undefined) {
          el.textContent = el.dataset.origPreview;
          delete el.dataset.origPreview;
        }
        el.classList.remove("is-typing-preview");
      });
    }
  }

  applyTypingEvent(payload, type) {
    if (!payload || !payload.user_id) {
      return;
    }
    const userId = parseInt(payload.user_id, 10);
    if (!userId || userId === this.userId) {
      return;
    }
    if (type === "typing_start" || type === "activity_start") {
      if (this.typingUsers.has(userId)) {
        const existing = this.typingUsers.get(userId);
        if (existing && existing.timer) clearTimeout(existing.timer);
      }
      const activityType = payload.activity_type || "typing";
      const activityValue = payload.activity_value || "";
      const timer = setTimeout(() => {
        this.clearTypingForUser(userId);
      }, 2000);
      this.typingUsers.set(userId, { timer, activityType, activityValue });
      this.updateTypingIndicatorFromEvents();
    } else {
      this.clearTypingForUser(userId);
    }
  }

  updateTypingIndicatorFromEvents() {
    const hasTyping = this.typingUsers.size > 0;
    this.ensureTypingBubble();

    if (hasTyping) {
      this.typingActive = true;
      if (this.elements.activityIndicator) {
        this.elements.activityIndicator.style.setProperty("display", "none", "important");
        this.elements.activityIndicator.textContent = "";
      }

      let activeAction = "typing";
      let activeValue = "";
      let activeUid = null;
      for (const [uid, data] of this.typingUsers.entries()) {
        if (data && data.activityType) {
          activeAction = data.activityType;
          activeValue = data.activityValue || "";
          activeUid = uid;
          break;
        }
      }

      let senderName = "";
      if (this.currentChat) {
        if (this.currentChat.type === "direct") {
          senderName = this.currentChat.meta?.full_name || this.currentChat.meta?.username || this.currentChat.name || "";
        } else if (activeUid) {
          const u = this.contacts?.find(c => Number(c.user_id) === Number(activeUid));
          if (u) senderName = u.full_name || u.username;
        }
      }

      let actionLabel = "is typing...";
      let iconHtml = '<div class="typing-bubble-pill"><div class="typing-dots"><span></span><span></span><span></span></div></div>';
      if (activeAction === "upload_photo") {
        actionLabel = "is sending a photo...";
        iconHtml = '<span class="tg-activity-icon"><svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg></span>';
      } else if (activeAction === "upload_video") {
        actionLabel = "is sending a video...";
        iconHtml = '<span class="tg-activity-icon"><svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg></span>';
      } else if (activeAction === "record_video") {
        actionLabel = "is recording a video message...";
        iconHtml = '<span class="tg-activity-icon tg-recording-pulse"><svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="4" fill="currentColor"></circle></svg></span>';
      } else if (activeAction === "record_voice" || activeAction === "recording") {
        actionLabel = "is recording a voice message...";
        iconHtml = '<span class="tg-activity-waves"><span></span><span></span><span></span><span></span></span>';
      } else if (activeAction === "upload_file" || activeAction === "uploading") {
        actionLabel = "is sending a file...";
        iconHtml = '<span class="tg-activity-icon"><svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg></span>';
      }

      let pctBadge = "";
      const isUpload = activeAction.startsWith("upload");
      if (isUpload && activeValue) {
        const numeric = parseInt(String(activeValue).replace(/[^0-9]/g, ""), 10);
        if (Number.isFinite(numeric) && numeric > 1 && numeric <= 100) {
          pctBadge = ` <span class="tg-activity-pct">${numeric}%</span>`;
        }
      }

      if (this.elements.typingBubble) {
        this.elements.typingBubble.innerHTML = `
          <div class="typing-bubble-pill">
            ${iconHtml}
            <span class="typing-bubble-text">${senderName ? `${senderName} ` : ''}${actionLabel}${pctBadge}</span>
          </div>
        `;
        this.elements.typingBubble.classList.add("active");
        this.elements.typingBubble.style.setProperty("display", "flex", "important");
      }

      // Update topbar subtitle
      if (this.elements.chatTopbarSubtitle) {
        if (!this._originalSubtitle && !this.elements.chatTopbarSubtitle.classList.contains("is-typing")) {
          this._originalSubtitle = this.elements.chatTopbarSubtitle.textContent;
        }
        const topbarText = `${actionLabel}${pctBadge ? ' ' + pctBadge.replace(/<[^>]+>/g, '') : ''}`;
        this.elements.chatTopbarSubtitle.textContent = topbarText;
        this.elements.chatTopbarSubtitle.classList.add("is-typing");
      }

      // Update conversation list item preview
      if (this.elements.conversationsList) {
        this.typingUsers.forEach((data, uid) => {
          const convItem = this.elements.conversationsList.querySelector(`[data-chat-id="${uid}"]`);
          if (convItem) {
            const previewEl = convItem.querySelector(".contact-message, .chat-preview, .last-message");
            if (previewEl && !previewEl.classList.contains("is-typing-preview")) {
              previewEl.dataset.origPreview = previewEl.textContent;
              const action = data && data.activityType ? data.activityType : "typing";
              previewEl.textContent = this.getActivityText(action);
              previewEl.classList.add("is-typing-preview");
            }
          }
        });
      }

      this.scrollToBottom();
      return;
    }

    this.typingActive = false;
    if (this.elements.typingBubble) {
      this.elements.typingBubble.classList.remove("active");
      this.elements.typingBubble.style.setProperty("display", "none", "important");
    }
    if (this.elements.activityIndicator) {
      this.elements.activityIndicator.style.setProperty("display", "none", "important");
      this.elements.activityIndicator.textContent = "";
    }

    // Restore topbar subtitle
    if (this.elements.chatTopbarSubtitle) {
      if (this._originalSubtitle !== undefined && this._originalSubtitle !== null) {
        this.elements.chatTopbarSubtitle.textContent = this._originalSubtitle;
        this._originalSubtitle = null;
      }
      this.elements.chatTopbarSubtitle.classList.remove("is-typing");
    }

    // Restore conversation list item preview
    if (this.elements.conversationsList) {
      const activeTypingPreviews = this.elements.conversationsList.querySelectorAll(".is-typing-preview");
      activeTypingPreviews.forEach((el) => {
        if (el.dataset.origPreview !== undefined) {
          el.textContent = el.dataset.origPreview;
          delete el.dataset.origPreview;
        }
        el.classList.remove("is-typing-preview");
      });
    }
  }
  // ===== Mention Navigation System =====

  initMentionNav() {
    this.mentionNavMessages = [];
    this.mentionNavIndex = -1;

    if (!this.elements.mentionNavBtn) return;

    this.elements.mentionNavBtn.addEventListener("click", () => {
      this.navigateMention();
    });
  }

  registerMentionMessage(msgEl, message) {
    if (!this.isMentionNotification(message)) return;
    this.mentionNavMessages.push(msgEl);
    this.updateMentionNavBtn();
  }

  updateMentionNavBtn() {
    if (!this.elements.mentionNavBtn) return;

    const count = this.mentionNavMessages.length;
    if (count > 0) {
      if (this.elements.mentionNavCount) {
        this.elements.mentionNavCount.textContent = String(count);
      }
      this.elements.mentionNavBtn.classList.add("visible");
    } else {
      this.elements.mentionNavBtn.classList.remove("visible");
    }
  }

  navigateMention() {
    if (!this.mentionNavMessages.length) return;

    this.mentionNavIndex =
      (this.mentionNavIndex + 1) % this.mentionNavMessages.length;
    const targetEl = this.mentionNavMessages[this.mentionNavIndex];
    if (!targetEl) return;

    targetEl.scrollIntoView({ behavior: "smooth", block: "center" });

    targetEl.classList.add("mention-highlight");
    setTimeout(() => targetEl.classList.remove("mention-highlight"), 1500);
  }

  clearMentionNav() {
    this.mentionNavMessages = [];
    this.mentionNavIndex = -1;
    this.updateMentionNavBtn();
  }

  startExpiryTimer() {
    if (!this.currentChat) {
      return;
    }
    this.checkExpiredMessages();
  }

  stopExpiryTimer() {
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = null;
    }
  }

  checkExpiredMessages() {
    if (!this.currentChat) {
      return;
    }
    const now = Date.now();
    const expired = [];
    let nextExpiry = null;
    this.messageCache.forEach((message) => {
      if (!message || !message.expires_at) {
        return;
      }
      const expiry = Date.parse(message.expires_at);
      if (Number.isNaN(expiry)) {
        return;
      }
      if (expiry <= now) {
        expired.push(message.message_id);
        return;
      }
      if (!nextExpiry || expiry < nextExpiry) {
        nextExpiry = expiry;
      }
    });
    if (expired.length) {
      this.applyDeletedMessages(expired);
    }
    this.stopExpiryTimer();
    if (nextExpiry) {
      const delay = Math.max(1000, nextExpiry - Date.now() + 250);
      this.expiryTimer = setTimeout(() => this.checkExpiredMessages(), delay);
    }
  }

  removeLocalMessage(messageId) {
    const element = this.messageElements.get(messageId);
    if (element) {
      element.remove();
    }
    this.messageElements.delete(messageId);
    this.messageCache.delete(messageId);
    if (messageId > 0) {
      this.removeMessagesFromCache([messageId]);
    }
  }

  updateOutgoingStatusElement(element, message) {
    if (!element) {
      return;
    }
    const status = element.querySelector(".message-status");
    if (!status) {
      return;
    }
    status.className = "message-status";
    if (message._pending) {
      status.classList.add("pending");
      status.innerHTML = this.iconHtml("check");
      status.title = "Sending...";
    } else if (message._failed) {
      status.classList.add("failed");
      status.innerHTML = this.iconHtml("close");
      status.title = "Failed to send";
    } else if (message.read_at) {
      status.classList.add("read");
      status.innerHTML = this.iconHtml("check-double");
      status.title = "Read at " + this.formatTime(message.read_at);
    } else if (message.delivered_at) {
      status.classList.add("delivered");
      status.innerHTML = this.iconHtml("check-double");
    } else {
      status.classList.add("sent");
      status.innerHTML = this.iconHtml("check");
    }
  }

  async promotePendingMessage(tempId, messageId) {
    const parsedId = parseInt(messageId, 10);
    const normalizedId = Number.isNaN(parsedId) ? messageId : parsedId;
    if (!normalizedId) {
      return;
    }
    const pending = this.messageCache.get(tempId);
    if (!pending) {
      return;
    }
    const element = this.messageElements.get(tempId);
    this.messageCache.delete(tempId);
    this.messageElements.delete(tempId);
    this.pendingMessages.delete(tempId);
    if (this.mediaDownloadHandlers.has(tempId)) {
      const handler = this.mediaDownloadHandlers.get(tempId);
      this.mediaDownloadHandlers.delete(tempId);
      this.mediaDownloadHandlers.set(normalizedId, handler);
    }

    if (this.messageCache.has(normalizedId)) {
      if (element) {
        element.remove();
      }
      return;
    }

    pending.message_id = normalizedId;
    pending._pending = false;
    pending._failed = false;
    pending._pending_upload = false;
    pending._upload_failed = false;
    this.messageCache.set(normalizedId, pending);
    if (element) {
      element.dataset.messageId = normalizedId;
      element.classList.remove("pending");
      element.classList.remove("failed");
      this.messageElements.set(normalizedId, element);
      this.updateOutgoingStatusElement(element, pending);
    }
    if (pending.message_type && pending.message_type !== "text" && element) {
      const rebuilt = await this.buildMessageElement(pending);
      if (rebuilt) {
        element.replaceWith(rebuilt);
        this.messageElements.set(normalizedId, rebuilt);
      }
    }
    if (normalizedId > this.lastMessageId) {
      this.lastMessageId = normalizedId;
    }
    this.upsertConversationCacheMessage(pending);
    this.persistConversationCache();
  }

  failPendingMessage(tempId) {
    const pending = this.messageCache.get(tempId);
    if (!pending) {
      return;
    }
    pending._pending = false;
    pending._failed = true;
    this.pendingMessages.delete(tempId);
    const element = this.messageElements.get(tempId);
    if (element) {
      element.classList.remove("pending");
      element.classList.add("failed");
      this.updateOutgoingStatusElement(element, pending);
    }
  }

  async refreshMessageElement(messageId) {
    const message = this.messageCache.get(messageId);
    if (!message) {
      return;
    }
    const element = this.messageElements.get(messageId);
    if (!element) {
      return;
    }
    const rebuilt = await this.buildMessageElement(message);
    if (rebuilt) {
      element.replaceWith(rebuilt);
      this.messageElements.set(messageId, rebuilt);
    }
  }

  updateUploadProgress(messageId, percent, stage) {
    const message = this.messageCache.get(messageId);
    if (!message) {
      return;
    }
    message._pending_upload = true;
    message._upload_failed = false;
    message._pending = true;
    message._failed = false;
    message._uploadProgress = Math.max(0, Math.min(100, percent || 0));
    message._uploadStage = stage || message._uploadStage || "Uploading";
    const element = this.messageElements.get(messageId);
    if (!element) {
      return;
    }
    const circle = element.querySelector(".upload-progress-circle");
    const text = element.querySelector(".upload-progress-text");
    const bar = element.querySelector(".upload-progress-bar");
    const label = element.querySelector(".upload-progress-label");
    const pct = message._uploadProgress;
    if (circle) {
      circle.style.setProperty("--progress", pct);
    }
    if (text) {
      text.textContent = `${message._uploadStage} ${pct}%`;
    }
    if (bar) {
      bar.style.width = pct + "%";
    }
    if (label) {
      label.textContent = `${message._uploadStage} ${pct}%`;
    }
    const retryBtn = element.querySelector(".upload-retry-btn");
    if (retryBtn) {
      retryBtn.style.display = "none";
    }
    const albumOverlay = element.querySelector(".album-upload-overlay");
    if (albumOverlay) {
      const bar = albumOverlay.querySelector(".upload-progress-bar");
      const textEl = albumOverlay.querySelector(".upload-progress-text");
      if (bar) {
        bar.style.width = pct + "%";
      }
      if (textEl) {
        textEl.textContent = `${message._uploadStage} ${pct}%`;
      }
    }
  }

  markUploadFailed(messageId) {
    const message = this.messageCache.get(messageId);
    if (!message) {
      return;
    }
    message._pending_upload = false;
    message._upload_failed = true;
    message._uploadStage = "Failed";
    message._pending = false;
    message._failed = true;
    const element = this.messageElements.get(messageId);
    if (!element) {
      return;
    }
    const text = element.querySelector(".upload-progress-text");
    const label = element.querySelector(".upload-progress-label");
    if (text) {
      text.textContent = "Upload failed";
    }
    if (label) {
      label.textContent = "Upload failed";
    }
    const retryBtn = element.querySelector(".upload-retry-btn");
    if (retryBtn) {
      retryBtn.style.display = "inline-flex";
    }
    this.updateOutgoingStatusElement(element, message);
    const albumOverlay = element.querySelector(".album-upload-overlay");
    if (albumOverlay) {
      const textEl = albumOverlay.querySelector(".upload-progress-text");
      if (textEl) {
        textEl.textContent = "Upload failed";
      }
      if (!albumOverlay.querySelector(".upload-retry-btn")) {
        const retry = document.createElement("button");
        retry.type = "button";
        retry.className = "btn btn-secondary upload-retry-btn";
        retry.textContent = "Retry";
        retry.addEventListener("click", () =>
          this.retryUpload(message.message_id),
        );
        albumOverlay.appendChild(retry);
      }
    }
  }

  retryUpload(messageId) {
    const task = this.uploadTasks.get(messageId);
    if (!task || (!task.file && !task.files)) {
      this.showToast("Unable to retry upload");
      return;
    }
    this.updateUploadProgress(messageId, 0, "Encrypting");
    const runner = task.files
      ? this.processAlbumUpload(task)
      : this.processFileUpload(task);
    Promise.resolve(runner).catch(() => {
      this.markUploadFailed(messageId);
    });
  }

  async retryFailedMessage(message) {
    if (!message) {
      return;
    }
    const parsedId = Number.parseInt(message.message_id, 10);
    const messageId = Number.isFinite(parsedId) ? parsedId : message.message_id;
    const failedMessage = this.messageCache.get(messageId);
    if (!failedMessage || !failedMessage._failed) {
      return;
    }
    if (!this.canRetryFailedMessage(failedMessage)) {
      this.showToast("Unable to retry");
      return;
    }
    if (failedMessage.message_type !== "text") {
      this.retryUpload(messageId);
      return;
    }
    if (this.getSlowModeRemaining(this.currentChat) > 0) {
      this.updateChatInputState();
      return;
    }
    const parsedText = this.extractTextPayload(failedMessage._plaintext || "");
    const text = (parsedText.text || "").trim();
    if (!text) {
      this.showToast("Message is empty");
      return;
    }
    const parsedReplyId = Number.parseInt(failedMessage.reply_to_id, 10);
    const replyToId = Number.isFinite(parsedReplyId) ? parsedReplyId : null;
    await this.sendTextMessage(text, null, {
      pendingId: messageId,
      replyToId: replyToId,
    });
  }

  async buildMessageElement(message) {
    const isOutgoing = message.sender_id === this.userId;
    const isChannelMessage =
      !!message.channel_id ||
      (this.currentChat && this.currentChat.type === "channel");
    const wrapper = document.createElement("div");
    wrapper.className = "message " + (isOutgoing ? "outgoing" : "incoming");
    if (isChannelMessage) {
      wrapper.classList.add("channel-post");
    }
    wrapper.dataset.messageId = message.message_id;
    const anchorId = this.getMessageAnchorId(message);
    if (anchorId) {
      wrapper.id = anchorId;
    }
    if (message._scheduled) {
      wrapper.classList.add("scheduled");
    }
    if (message._pending) {
      wrapper.classList.add("pending");
    }
    if (message._failed) {
      wrapper.classList.add("failed");
    }
    const isVideoNoteMsg = message.message_type === "video_note" || (message._meta && message._meta.type === "video_note");
    if (isVideoNoteMsg) {
      wrapper.classList.add("message-video-note");
    }

    if (!isOutgoing && !isChannelMessage) {
      const avatar = document.createElement("div");
      avatar.className = "message-avatar";
      const img = document.createElement("img");
      const senderName =
        message.full_name ||
        message.username ||
        (this.currentChat && (this.currentChat.type === "direct" || this.currentChat.type === "saved")
          ? (this.currentChat.meta?.full_name || this.currentChat.meta?.username || this.currentChat.name)
          : "User");
      const senderPic =
        message.profile_pic ||
        (this.currentChat && (this.currentChat.type === "direct" || this.currentChat.type === "saved")
          ? (this.currentChat.meta?.profile_pic || this.currentChat.avatar)
          : null);

      img.src = this.getAvatarUrl(senderPic, senderName, {
        type: "user",
        cacheKey: message.sender_id || senderName,
      });
      img.alt = senderName || "User";
      this.disableImageDrag(img);
      avatar.appendChild(img);
      wrapper.appendChild(avatar);
    }

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    if (isVideoNoteMsg) {
      bubble.classList.add("video-note-bubble");
    }
    if (message.message_type === "album") {
      bubble.classList.add("album-bubble");
    }

    if (isChannelMessage) {
      const header = document.createElement("div");
      header.className = "message-post-header";
      const channelName = this.getConversationName(
        this.getCurrentConversation() || {
          type: "channel",
          channel_name: "Channel",
        },
      );
      const senderName = isOutgoing ? "You" : message.username || "Admin";
      const channelSpan = document.createElement("span");
      channelSpan.className = "message-post-channel";
      channelSpan.textContent = channelName;
      const senderSpan = document.createElement("span");
      senderSpan.className = "message-post-sender";
      senderSpan.textContent = senderName;
      header.appendChild(channelSpan);
      header.appendChild(senderSpan);
      bubble.appendChild(header);
    }

    if (message.reply_to_id) {
      const replyInfo = document.createElement("div");
      replyInfo.className = "message-reply-info";
      const referenced = this.messageCache.get(message.reply_to_id);
      const replyName =
        referenced && referenced.sender_id === this.userId
          ? "You"
          : referenced
            ? referenced.username || "User"
            : "Message";
      const replySnippet = this.getReplyPreview(referenced);
      const replyTitle = document.createElement("div");
      replyTitle.className = "reply-title";
      replyTitle.innerHTML = this.iconHtml("reply");
      const replyTitleText = document.createElement("span");
      this.renderDirectionalText(replyTitleText, `Replying to ${replyName}`);
      replyTitle.appendChild(replyTitleText);
      const replySnippetEl = document.createElement("div");
      replySnippetEl.className = "reply-snippet";
      this.renderDirectionalText(replySnippetEl, replySnippet);
      replyInfo.appendChild(replyTitle);
      replyInfo.appendChild(replySnippetEl);
      replyInfo.dataset.replyId = message.reply_to_id;
      replyInfo.addEventListener("click", () => {
        this.scrollToMessage(message.reply_to_id);
      });
      bubble.appendChild(replyInfo);
    }

    const detectVideoNotePayload = (value, messageType, fallbackMeta) => {
      let meta = null;
      let detected = false;
      if (value && typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed.startsWith("{")) {
          try {
            meta = JSON.parse(trimmed);
          } catch (err) {
            if (/"type"\s*:\s*"video_note"/.test(trimmed)) {
              meta = { type: "video_note" };
              detected = true;
            }
          }
          if (meta && typeof meta === "object") {
            if (meta.type === "video_note" || messageType === "video_note") {
              meta.type = "video_note";
              detected = true;
            }
          }
        }
      }
      if (!detected && messageType === "video_note") {
        detected = true;
        meta = Object.assign({ type: "video_note" }, fallbackMeta || {});
      }
      if (!detected) {
        return null;
      }
      meta = meta || { type: "video_note" };
      const duration = meta && Number.isFinite(parseInt(meta.duration, 10)) ? parseInt(meta.duration, 10) : 0;
      const mediaId = (meta && meta.media_id) || (fallbackMeta && fallbackMeta.media_id) || `vn_${Date.now()}`;
      const mime = (meta && meta.mime) || (fallbackMeta && fallbackMeta.mime) || "video/webm";
      meta.media_id = mediaId;
      meta.mime = mime;
      meta.duration = duration;
      return { meta, valid: true, detected: true };
    };

    let decrypted = null;
    try {
      decrypted = await this.decryptMessage(message);
    } catch (err) {
      console.error("Failed to decrypt message", err);
    }

    let forceVideoNoteFallback = false;
    let handledVideoNote = false;

    if (decrypted && decrypted.plaintext) {
      if (message.channel_id) {
        this.channelDecryptAttempts.delete(message.message_id);
      }
      let plaintext = decrypted.plaintext;
      if (
        message.message_type === "text" ||
        message.message_type === "video_note"
      ) {
        const videoNote = detectVideoNotePayload(
          plaintext,
          message.message_type,
          message._meta,
        );
        if (videoNote && videoNote.detected) {
          handledVideoNote = true;
          message.message_type = "video_note";
          message._meta = Object.assign(
            {},
            message._meta || {},
            videoNote.meta || {},
          );
          message._plaintext = null;
          this.messageCache.set(message.message_id, message);
        }
      }
      if (!handledVideoNote) {
        if (message.message_type === "text") {
          const parsed = this.extractTextPayload(plaintext);
          plaintext = parsed.text || "";
          if (parsed.forwardFrom) {
            message._forwardFrom = parsed.forwardFrom;
          }
        }
        message._plaintext = plaintext;
        this.messageCache.set(message.message_id, message);
      }
    } else if (
      (message.message_type === "text" ||
        message.message_type === "video_note") &&
      message._plaintext
    ) {
      const videoNote = detectVideoNotePayload(
        message._plaintext,
        message.message_type,
        message._meta,
      );
      if (videoNote && videoNote.detected) {
        handledVideoNote = true;
        message.message_type = "video_note";
        message._meta = Object.assign(
          {},
          message._meta || {},
          videoNote.meta || {},
        );
        message._plaintext = null;
      } else {
        const parsed = this.extractTextPayload(message._plaintext);
        message._plaintext = parsed.text || "";
        if (parsed.forwardFrom) {
          message._forwardFrom = parsed.forwardFrom;
        }
      }
    } else if (message.message_type === "video_note" && !handledVideoNote) {
      handledVideoNote = true;
      const fallbackVideoNote = detectVideoNotePayload(
        null,
        message.message_type,
        message._meta,
      );
      message._meta = Object.assign(
        { type: "video_note", mime: "video/webm", duration: 0, media_id: `vn_${message.message_id}` },
        message._meta || {},
        (fallbackVideoNote && fallbackVideoNote.meta) || {},
      );
      message._plaintext = null;
    }

    if (
      message.message_type &&
      message.message_type !== "text" &&
      !forceVideoNoteFallback
    ) {
      const fileContainer = document.createElement("div");
      fileContainer.className = "file-message-container";
      bubble.appendChild(fileContainer);
      await this.renderFileMessage(fileContainer, message, decrypted);
    } else {
      if (message._forwardFrom) {
        const origin = document.createElement("div");
        origin.className = "message-origin";
        const prefix =
          this.currentChat && this.currentChat.type === "saved"
            ? "Saved from "
            : "Forwarded from ";
        this.renderDirectionalText(origin, prefix + message._forwardFrom);
        bubble.appendChild(origin);
      }
      const text = document.createElement("p");
      text.className = "message-text bidi-text";
      const needsChannelRetry = !!message.channel_id && !decrypted;
      if (needsChannelRetry) {
        this.scheduleChannelDecryptRetry(message.message_id);
      }
      if (message._plaintext) {
        this.renderMessageText(text, message, this.chatSearch.query);
      } else {
        this.renderDirectionalText(
          text,
          needsChannelRetry ? "Decrypting..." : "Unable to decrypt message",
        );
      }
      bubble.appendChild(text);
    }

    const info = document.createElement("div");
    info.className = "message-info";

    const time = document.createElement("span");
    const timeValue = message._scheduled_at || message.created_at;
    time.textContent = this.formatTime(timeValue);
    if (message._scheduled_at) {
      time.title = `Scheduled for ${this.formatFullDateTime(message._scheduled_at)}`;
    }
    info.appendChild(time);

    if (message.edited_at) {
      const edited = document.createElement("span");
      edited.className = "message-edited";
      edited.textContent = "edited";
      info.appendChild(edited);
    }

    if (isOutgoing) {
      const status = document.createElement("span");
      status.className = "message-status";
      if (message._scheduled) {
        status.classList.add("scheduled");
        status.innerHTML = this.iconHtml("clock");
        status.title = message._scheduled_at
          ? `Scheduled for ${this.formatFullDateTime(message._scheduled_at)}`
          : "Scheduled";
      } else if (message._pending) {
        status.classList.add("pending");
        status.innerHTML = this.iconHtml("check");
        status.title = "Sending...";
      } else if (message._failed) {
        status.classList.add("failed");
        status.innerHTML = this.iconHtml("close");
        status.title = "Failed to send";
      } else if (message.read_at) {
        status.classList.add("read");
        status.innerHTML = this.iconHtml("check-double");
        status.title = "Read at " + this.formatTime(message.read_at);
      } else if (message.delivered_at) {
        status.classList.add("delivered");
        status.innerHTML = this.iconHtml("check-double");
      } else {
        status.classList.add("sent");
        status.innerHTML = this.iconHtml("check");
      }
      info.appendChild(status);
    }

    bubble.appendChild(info);

    const reactions = document.createElement("div");
    reactions.className = "message-reactions";
    if (message._scheduled) {
      reactions.style.display = "none";
    }
    bubble.appendChild(reactions);

    wrapper.appendChild(bubble);

    wrapper.addEventListener("contextmenu", (event) => {
      if (message._pending) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.showMessageMenu(event, message);
    });

    let pressTimer = null;
    const clearPressTimer = () => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    };
    wrapper.addEventListener(
      "touchstart",
      (event) => {
        if (message._pending || event.touches.length !== 1) {
          return;
        }
        const touch = event.touches[0];
        pressTimer = setTimeout(() => {
          const fakeEvent = {
            clientX: touch.clientX,
            clientY: touch.clientY,
            preventDefault: () => {},
            stopPropagation: () => {},
          };
          this.showMessageMenu(fakeEvent, message);
        }, 450);
      },
      { passive: true },
    );
    wrapper.addEventListener("touchend", clearPressTimer);
    wrapper.addEventListener("touchmove", clearPressTimer);
    wrapper.addEventListener("touchcancel", clearPressTimer);

    wrapper.addEventListener("dblclick", (event) => {
      if (message._pending || message._failed) {
        return;
      }
      event.preventDefault();
      const fast =
        this.fastReaction ||
        (this.quickReactions.length ? this.quickReactions[0] : "\u{1F44D}");
      this.toggleReaction(message, fast);
    });

    return wrapper;
  }
  async renderFileMessage(container, message, decrypted) {
    if (message.message_type === "album") {
      await this.renderAlbumMessage(container, message, decrypted);
      return;
    }
    if (message._pending_upload || message._upload_failed) {
      this.renderPendingUploadMessage(container, message);
      return;
    }
    const isProtected = this.isContentProtected();
    let meta = null;
    if (decrypted && decrypted.plaintext) {
      const pt = String(decrypted.plaintext);
      if (pt.trim().startsWith("{")) {
        try {
          const parsed = JSON.parse(pt);
          if (parsed && typeof parsed === "object") {
            meta = parsed;
          }
        } catch (err) {
          meta = null;
        }
      }
      if (!meta) {
        // Plaintext is the caption string
        meta = { caption: pt };
      }
    } else if (message._meta && typeof message._meta === "object") {
      meta = Object.assign({}, message._meta);
    } else {
      meta = {};
    }
    const previousMeta =
      message._meta && typeof message._meta === "object" ? message._meta : null;
    if (previousMeta) {
      const prevMediaId = previousMeta.media_id;
      meta = Object.assign({}, previousMeta, meta || {});
      if (!meta.media_id && prevMediaId) {
        meta.media_id = prevMediaId;
      }
    }
    if (!meta) {
      meta = {};
    }
    if (!meta.caption && message.message_text && typeof message.message_text === "string" && !message.message_text.trim().startsWith("{")) {
      meta.caption = message.message_text;
    }
    if (!meta.caption && message.text && typeof message.text === "string" && !message.text.trim().startsWith("{")) {
      meta.caption = message.text;
    }
    if (!meta.name) {
      if (message.file_url) {
        const urlClean = message.file_url.split("?")[0].split("/").pop();
        meta.name = urlClean ? decodeURIComponent(urlClean) : (message.message_type === "image" ? "Photo" : "File");
      } else {
        meta.name = message.message_type === "image" ? "Photo" : (message.message_type === "video" ? "Video" : "File");
      }
    }
    message._meta = meta;
    if (meta.forwardFrom) {
      message._forwardFrom = meta.forwardFrom;
      const origin = document.createElement("div");
      origin.className = "message-origin";
      const prefix =
        this.currentChat && this.currentChat.type === "saved"
          ? "Saved from "
          : "Forwarded from ";
      this.renderDirectionalText(origin, prefix + meta.forwardFrom);
      container.appendChild(origin);
    }
    if (message.message_type === "image" || message.message_type === "video") {
      await this.renderMediaMessage(container, message, meta, decrypted);
      return;
    }
    if (message.message_type === "video_note") {
      await this.renderVideoNoteMessage(container, message, meta, decrypted);
      return;
    }
    if (message.message_type === "audio" || message.message_type === "voice") {
      await this.renderAudioMessage(container, message, meta, decrypted);
      return;
    }

    const isOutgoing = message.sender_id === this.userId;
    const cacheReadable = !!this.mediaStore;
    const cacheWritable = this.mediaStore && (!isProtected || isOutgoing);
    const mediaId = await this.resolveMediaIdForMessage(message, meta);
    let effectiveMediaId = mediaId;
    const chatKey =
      this.getChatKeyForMessage(message) ||
      this.getChatKeyFromChat(this.currentChat);
    if (this.mediaStore && effectiveMediaId) {
      this.mediaStore
        .saveMediaRef(
          message.message_id,
          effectiveMediaId,
          chatKey,
          message.message_type,
        )
        .catch(() => {});
    }

    const appendCaption = () => {
      if (meta.caption) {
        const caption = document.createElement("div");
        caption.className = "file-caption bidi-text";
        this.renderCaptionText(
          caption,
          meta.caption,
          message,
          this.chatSearch.query,
        );
        container.appendChild(caption);
      }
    };

    const renderFileFromBlob = (blob) => {
      const mimeType = meta.mime || "application/octet-stream";
      const url = URL.createObjectURL(blob);
      container.innerHTML = "";
      const fileCard = document.createElement("div");
      fileCard.className = "file-card";
      const name = document.createElement("div");
      name.className = "file-card-name";
      name.textContent = meta.name || "File";
      const size = document.createElement("div");
      size.className = "file-card-size";
      size.textContent = this.formatFileSize(meta.size || blob.size);
      fileCard.appendChild(name);
      fileCard.appendChild(size);
      if (!isProtected) {
        const link = document.createElement("a");
        link.href = url;
        link.download = meta.name || "file";
        link.textContent = "Download";
        link.className = "file-card-download";
        fileCard.appendChild(link);
      } else {
        const protectedNote = document.createElement("div");
        protectedNote.className = "file-card-download";
        protectedNote.textContent = "Protected content";
        fileCard.appendChild(protectedNote);
      }
      container.appendChild(fileCard);
      appendCaption();
    };

    const localBlob = message._localBlob || null;
    let cachedHit = null;
    if (!localBlob && cacheReadable) {
      cachedHit = await this.findCachedMediaBlob(
        message,
        meta,
        effectiveMediaId,
      );
      if (
        cachedHit &&
        cachedHit.mediaId &&
        cachedHit.mediaId !== effectiveMediaId
      ) {
        effectiveMediaId = cachedHit.mediaId;
        if (this.mediaStore) {
          this.mediaStore
            .saveMediaRef(
              message.message_id,
              effectiveMediaId,
              chatKey,
              message.message_type,
            )
            .catch(() => {});
        }
      }
    }
    if (localBlob) {
      renderFileFromBlob(localBlob);
      if (cacheWritable && effectiveMediaId) {
        this.mediaStore
          .saveMediaBlob(effectiveMediaId, {
            blob: localBlob,
            size: localBlob.size,
            mime: meta.mime || "application/octet-stream",
            name: meta.name || "",
            source: "upload",
          })
          .catch(() => {});
      }
      if (effectiveMediaId) {
        this.syncMediaRefForMessage(message, effectiveMediaId);
      }
      return;
    }
    if (cachedHit && cachedHit.blob) {
      renderFileFromBlob(cachedHit.blob);
      if (this.mediaStore && effectiveMediaId) {
        this.mediaStore.touchMediaBlob(effectiveMediaId).catch(() => {});
      }
      if (effectiveMediaId) {
        this.syncMediaRefForMessage(message, effectiveMediaId);
      }
      return;
    }

    const placeholder = document.createElement("div");
    placeholder.className = "file-placeholder";
    placeholder.textContent = "Decrypting file...";
    container.appendChild(placeholder);

    if (message.file_url && (!meta.fileIv && !meta.fileIvs)) {
      try {
        placeholder.textContent = "Loading...";
        const fileUrl = message.file_url;
        const resp = await fetch(fileUrl, { credentials: "include" });
        if (!resp.ok) throw new Error("File fetch failed");
        const blob = await resp.blob();
        renderFileFromBlob(blob);
        if (placeholder.parentNode) {
          placeholder.parentNode.removeChild(placeholder);
        }
        return;
      } catch (err) {
        console.error("Direct file load error", err);
        placeholder.textContent = "Unable to load file";
        return;
      }
    }

    const contentKey = decrypted && decrypted.key ? decrypted.key : null;
    if (!message.file_url) {
      const needsChannelRetry = !!message.channel_id;
      placeholder.textContent = needsChannelRetry
        ? "Decrypting..."
        : "File missing";
      if (needsChannelRetry) {
        this.scheduleChannelDecryptRetry(message.message_id);
      }
      return;
    }
    try {
      placeholder.textContent = "Downloading...";
      const encryptedBuffer = await this.downloadEncryptedFileWithProgress(
        message.file_url,
        meta.size || 0,
        (progressInfo) => {
          if (progressInfo && progressInfo.total) {
            placeholder.textContent = `Downloading ${this.formatFileSize(progressInfo.loaded)} / ${this.formatFileSize(progressInfo.total)}`;
            return;
          }
          if (progressInfo && progressInfo.percent) {
            placeholder.textContent = `Downloading ${progressInfo.percent}%`;
            return;
          }
          placeholder.textContent = "Downloading...";
        },
      );
      placeholder.textContent = "Decrypting file...";
      const fileBuffer = await this.decryptFileBuffer(
        encryptedBuffer,
        meta,
        contentKey,
      );
      const mimeType = meta.mime || "application/octet-stream";
      const blob = new Blob([fileBuffer], { type: mimeType });
      renderFileFromBlob(blob);
      if (cacheWritable && effectiveMediaId) {
        this.mediaStore
          .saveMediaBlob(effectiveMediaId, {
            blob: blob,
            size: blob.size,
            mime: mimeType,
            name: meta.name || "",
            source: "download",
          })
          .catch(() => {});
      }
      if (effectiveMediaId) {
        this.syncMediaRefForMessage(message, effectiveMediaId);
      }
    } catch (err) {
      console.error("Failed to decrypt file", err);
      placeholder.textContent = "Unable to decrypt file";
    }
  }

  renderPendingUploadMessage(container, message) {
    const meta = message._meta || { name: "File", size: 0, mime: "" };
    const stage =
      message._uploadStage || (message._upload_failed ? "Failed" : "Uploading");
    const percent = Number.isFinite(message._uploadProgress)
      ? message._uploadProgress
      : 0;
    const isFailed = !!message._upload_failed || !!message._failed;

    const buildProgressOverlay = () => {
      const overlay = document.createElement("div");
      overlay.className = "media-overlay upload-overlay";

      const progress = document.createElement("div");
      progress.className = "media-progress upload-progress-overlay";
      progress.style.display = "flex";
      progress.innerHTML =
        '<div class="media-progress-circle upload-progress-circle"><div class="media-progress-center"></div></div>' +
        '<span class="media-progress-text upload-progress-text"></span>';
      const progressCircle = progress.querySelector(".upload-progress-circle");
      const progressText = progress.querySelector(".upload-progress-text");

      const retryBtn = document.createElement("button");
      retryBtn.className = "btn btn-secondary upload-retry-btn";
      retryBtn.type = "button";
      retryBtn.textContent = "Retry";
      retryBtn.style.display = isFailed ? "inline-flex" : "none";
      retryBtn.addEventListener("click", () => {
        this.retryUpload(message.message_id);
      });

      overlay.appendChild(progress);
      overlay.appendChild(retryBtn);

      const pct = Math.max(0, Math.min(100, percent));
      if (progressCircle) {
        progressCircle.style.setProperty("--progress", pct);
      }
      if (progressText) {
        progressText.textContent = isFailed
          ? "Upload failed"
          : `${stage} ${pct}%`;
      }

      return { overlay };
    };

    if (message.message_type === "video_note") {
      const card = document.createElement("div");
      card.className = "video-note-card";

      const frame = document.createElement("div");
      frame.className = "video-note-frame";
      card.appendChild(frame);

      if (meta.thumb) {
        const thumb = document.createElement("img");
        const mime = meta.thumb_mime || "image/jpeg";
        const src = meta.thumb.startsWith("data:")
          ? meta.thumb
          : `data:${mime};base64,${meta.thumb}`;
        thumb.src = src;
        thumb.alt = meta.name || "Preview";
        thumb.className = "video-note-thumb";
        frame.appendChild(thumb);
      } else {
        const fallback = document.createElement("div");
        fallback.className = "media-thumb-fallback";
        const label = document.createElement("div");
        label.className = "media-thumb-label";
        label.textContent = "Video message";
        fallback.appendChild(label);
        frame.appendChild(fallback);
      }

      const { overlay } = buildProgressOverlay();
      overlay.classList.add("video-note-overlay");
      frame.appendChild(overlay);

      const timeLabel = document.createElement("div");
      timeLabel.className = "video-note-time";
      const duration = meta.duration
        ? Math.max(1, Math.round(meta.duration))
        : 0;
      timeLabel.textContent = duration ? this.formatDuration(duration) : "0:00";
      card.appendChild(timeLabel);

      container.appendChild(card);
    } else if (
      message.message_type === "image" ||
      message.message_type === "video"
    ) {
      const card = document.createElement("div");
      card.className = "media-card media-upload-card";

      const frame = document.createElement("div");
      frame.className = "media-frame";
      card.appendChild(frame);

      if (meta.thumb) {
        const thumb = document.createElement("img");
        const mime = meta.thumb_mime || "image/jpeg";
        const src = meta.thumb.startsWith("data:")
          ? meta.thumb
          : `data:${mime};base64,${meta.thumb}`;
        thumb.src = src;
        thumb.alt = meta.name || "Preview";
        thumb.className = "media-thumb";
        frame.appendChild(thumb);
      } else if (message.message_type === "video") {
        const fallback = document.createElement("div");
        fallback.className = "media-thumb-fallback";
        const label = document.createElement("div");
        label.className = "media-thumb-label";
        label.textContent = "Video";
        fallback.appendChild(label);
        frame.appendChild(fallback);
      }

      const { overlay } = buildProgressOverlay();
      frame.appendChild(overlay);

      const info = document.createElement("div");
      info.className = "media-info";
      const name = document.createElement("div");
      name.className = "media-name";
      name.textContent =
        meta.name || (message.message_type === "image" ? "Image" : "Video");
      const size = document.createElement("div");
      size.className = "media-size";
      size.textContent = meta.size ? this.formatFileSize(meta.size) : "";
      info.appendChild(name);
      info.appendChild(size);
      card.appendChild(info);

      container.appendChild(card);
    } else if (
      message.message_type === "audio" ||
      message.message_type === "voice"
    ) {
      const card = document.createElement("div");
      card.className =
        message.message_type === "voice"
          ? "audio-card voice-card"
          : "audio-card music-card";

      const frame = document.createElement("div");
      frame.className = "audio-frame";
      card.appendChild(frame);

      const placeholder = document.createElement("div");
      placeholder.className =
        message.message_type === "voice"
          ? "voice-placeholder"
          : "audio-placeholder";
      placeholder.innerHTML =
        message.message_type === "voice"
          ? '<div class="voice-placeholder-icon">' +
            this.iconHtml("mic") +
            '</div><div class="voice-placeholder-text">Voice message</div>'
          : '<div class="audio-placeholder-icon">' +
            this.iconHtml("music") +
            '</div><div class="audio-placeholder-text">' +
            this.escapeHtml(meta.name || "Audio") +
            "</div>";
      frame.appendChild(placeholder);

      const { overlay } = buildProgressOverlay();
      frame.appendChild(overlay);
      container.appendChild(card);
    } else {
      const fileCard = document.createElement("div");
      fileCard.className = "file-card upload-file-card";
      const name = document.createElement("div");
      name.className = "file-card-name";
      name.textContent = meta.name || "File";
      const size = document.createElement("div");
      size.className = "file-card-size";
      size.textContent = meta.size ? this.formatFileSize(meta.size) : "";
      fileCard.appendChild(name);
      fileCard.appendChild(size);

      const progressRow = document.createElement("div");
      progressRow.className = "upload-progress-row";
      const progressBar = document.createElement("div");
      progressBar.className = "upload-progress-bar";
      progressBar.style.width = Math.max(0, Math.min(100, percent)) + "%";
      const progressText = document.createElement("div");
      progressText.className = "upload-progress-label";
      progressText.textContent = isFailed
        ? "Upload failed"
        : `${stage} ${Math.max(0, Math.min(100, percent))}%`;
      progressRow.appendChild(progressBar);
      fileCard.appendChild(progressRow);
      fileCard.appendChild(progressText);

      if (isFailed) {
        const retry = document.createElement("button");
        retry.className = "btn btn-secondary upload-retry-btn";
        retry.type = "button";
        retry.textContent = "Retry";
        retry.addEventListener("click", () => {
          this.retryUpload(message.message_id);
        });
        fileCard.appendChild(retry);
      }

      container.appendChild(fileCard);
    }

    if (meta.caption) {
      const caption = document.createElement("div");
      caption.className = "file-caption bidi-text";
      this.renderCaptionText(
        caption,
        meta.caption,
        message,
        this.chatSearch.query,
      );
      container.appendChild(caption);
    }
  }

  async downloadAndDecryptFile(url, meta, key) {
    const res = await fetch(url);
    const encrypted = await res.arrayBuffer();
    return this.decryptFileBuffer(encrypted, meta, key);
  }

  async decryptFileBuffer(encryptedBuffer, meta, key) {
    if (!key || (!meta.fileIv && !meta.fileIvs)) {
      // Server-side encrypted file: api/file.php already streamed the decrypted content
      return encryptedBuffer;
    }
    if (
      meta &&
      Array.isArray(meta.fileIvs) &&
      meta.fileIvs.length &&
      meta.fileChunkSize
    ) {
      const chunkSize = parseInt(meta.fileChunkSize, 10);
      const totalSize = parseInt(meta.size || 0, 10);
      const ivs = meta.fileIvs;
      const encryptedBytes = new Uint8Array(encryptedBuffer);
      const chunks = [];
      let offset = 0;
      for (let i = 0; i < ivs.length; i += 1) {
        const remainingPlain = totalSize - i * chunkSize;
        const plainSize = i === ivs.length - 1 ? remainingPlain : chunkSize;
        const cipherSize = plainSize + 16;
        const slice = encryptedBytes.slice(offset, offset + cipherSize);
        offset += cipherSize;
        const ivBuffer = CryptoManager.fromBase64(ivs[i]);
        const iv = new Uint8Array(ivBuffer);
        const decryptedChunk = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv },
          key,
          slice,
        );
        chunks.push(new Uint8Array(decryptedChunk));
        await this.waitFrame();
      }
      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const merged = new Uint8Array(totalLength);
      let pos = 0;
      for (const chunk of chunks) {
        merged.set(chunk, pos);
        pos += chunk.length;
      }
      return merged.buffer;
    }
    if (!meta || !meta.fileIv) {
      throw new Error("Missing file IV");
    }
    const ivBuffer = CryptoManager.fromBase64(meta.fileIv);
    const iv = new Uint8Array(ivBuffer);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      encryptedBuffer,
    );
    return decrypted;
  }

  waitFrame() {
    return new Promise((resolve) => {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => resolve());
      } else {
        setTimeout(() => resolve(), 0);
      }
    });
  }

  async encryptFileWithProgress(file, key, onProgress) {
    const chunkSize = 512 * 1024;
    const total = file.size;
    const ivs = [];
    const chunks = [];
    let offset = 0;
    while (offset < total) {
      const slice = file.slice(offset, offset + chunkSize);
      const buffer = await slice.arrayBuffer();
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const cipher = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        buffer,
      );
      chunks.push(new Uint8Array(cipher));
      ivs.push(CryptoManager.toBase64(iv));
      offset += buffer.byteLength;
      if (typeof onProgress === "function") {
        const pct = Math.round((offset / total) * 100);
        onProgress(pct);
      }
      await this.waitFrame();
    }
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const merged = new Uint8Array(totalLength);
    let pos = 0;
    for (const chunk of chunks) {
      merged.set(chunk, pos);
      pos += chunk.length;
    }
    return {
      rawCiphertext: merged.buffer,
      ivs: ivs,
      iv: ivs.length === 1 ? ivs[0] : null,
      chunkSize: chunkSize,
    };
  }

  generateMediaId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    const bytes = new Uint8Array(16);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i += 1) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  getMessageAnchorId(message) {
    if (!message || !message.message_id) {
      return "";
    }
    const id = parseInt(message.message_id, 10);
    if (!Number.isFinite(id) || id <= 0) {
      return "";
    }
    return `msg_${id}`;
  }

  getMediaId(message, meta) {
    const metaMediaId = meta && meta.media_id;
    const fallbackMetaId = message && message._meta && message._meta.media_id;
    if (metaMediaId) {
      return metaMediaId;
    }
    if (fallbackMetaId) {
      return fallbackMetaId;
    }
    if (message && message.message_id) {
      return `msg_${message.message_id}`;
    }
    return message && message.file_url ? message.file_url : null;
  }

  async resolveMediaIdForMessage(message, meta) {
    const direct = this.getMediaId(message, meta);
    if (!this.mediaStore || !message || !message.message_id) {
      return direct;
    }
    try {
      const ref = await this.mediaStore.getMediaRef(message.message_id);
      if (ref && ref.media_id) {
        return ref.media_id;
      }
    } catch (err) {
      // ignore cache lookup failures
    }
    return direct;
  }

  getMediaIdCandidates(message, meta, primaryId) {
    const metaMediaId = meta && meta.media_id;
    const fallbackMetaId = message && message._meta && message._meta.media_id;
    const ids = new Set();
    const add = (value) => {
      if (value === null || value === undefined || value === "") {
        return;
      }
      if (typeof value !== "string" && typeof value !== "number") {
        return;
      }
      ids.add(value);
      if (typeof value === "number" && Number.isFinite(value)) {
        ids.add(String(value));
        return;
      }
      if (typeof value === "string" && /^[0-9]+$/.test(value)) {
        const numeric = Number(value);
        if (Number.isFinite(numeric)) {
          ids.add(numeric);
        }
      }
    };
    add(primaryId);
    if (metaMediaId) {
      add(metaMediaId);
    }
    if (fallbackMetaId) {
      add(fallbackMetaId);
    }
    if (message && message.file_url) {
      add(message.file_url);
    }
    if (message && message.message_id) {
      add(message.message_id);
      add(`msg_${message.message_id}`);
    }
    return Array.from(ids);
  }

  async findCachedMediaBlob(message, meta, primaryId) {
    if (!this.mediaStore) {
      return null;
    }
    const ordered = [];
    const seen = new Set();
    const addCandidate = (value) => {
      if (value === null || value === undefined || value === "") {
        return;
      }
      if (typeof value !== "string" && typeof value !== "number") {
        return;
      }
      if (seen.has(value)) {
        return;
      }
      seen.add(value);
      ordered.push(value);
    };
    if (message && message.message_id) {
      try {
        const ref = await this.mediaStore.getMediaRef(message.message_id);
        if (ref && ref.media_id) {
          addCandidate(ref.media_id);
        }
      } catch (err) {
        // ignore cache failures
      }
    }
    this.getMediaIdCandidates(message, meta, primaryId).forEach(addCandidate);
    for (const mediaId of ordered) {
      try {
        const cached = await this.mediaStore.getMediaBlob(mediaId);
        if (cached && cached.blob) {
          return { mediaId: mediaId, blob: cached.blob };
        }
      } catch (err) {
        // ignore cache failures
      }
    }
    return null;
  }

  syncMediaRefForMessage(message, mediaId) {
    if (!this.mediaStore || !message || !mediaId) {
      return;
    }
    const currentChatKey = this.getChatKeyFromChat(this.currentChat);
    const messageChatKey = this.getChatKeyForMessage(message);
    const chatKey = messageChatKey || currentChatKey;
    this.mediaStore
      .saveMediaRef(message.message_id, mediaId, chatKey, message.message_type)
      .catch(() => {});
    if (!message._meta || message._meta.media_id !== mediaId) {
      message._meta = Object.assign({}, message._meta || {}, {
        media_id: mediaId,
      });
      if (
        !messageChatKey ||
        !currentChatKey ||
        messageChatKey === currentChatKey
      ) {
        this.upsertConversationCacheMessage(message);
      }
    }
  }

  async renderMediaMessage(container, message, meta, decrypted) {
    const contentKey = decrypted && decrypted.key ? decrypted.key : null;
    const hasCipherMeta = !!message.file_url;
    const isProtected = this.isContentProtected();
    const isOutgoing = message.sender_id === this.userId;
    const cacheReadable = !!this.mediaStore;
    const cacheWritable = this.mediaStore && (!isProtected || isOutgoing);
    const mediaId = await this.resolveMediaIdForMessage(message, meta);
    let effectiveMediaId = mediaId;
    const chatKey =
      this.getChatKeyForMessage(message) ||
      this.getChatKeyFromChat(this.currentChat);
    if (this.mediaStore && effectiveMediaId) {
      this.mediaStore
        .saveMediaRef(
          message.message_id,
          effectiveMediaId,
          chatKey,
          message.message_type,
        )
        .catch(() => {});
    }

    const card = document.createElement("div");
    card.className = "media-card";
    card.dataset.state = "checking";

    const frame = document.createElement("div");
    frame.className = "media-frame";
    card.appendChild(frame);

    const overlay = document.createElement("div");
    overlay.className = "media-overlay";

    const downloadBtn = document.createElement("button");
    downloadBtn.className = "btn btn-icon media-download-btn";
    downloadBtn.type = "button";
    downloadBtn.innerHTML = this.iconHtml(isProtected ? "eye" : "download");
    downloadBtn.title = isProtected ? "View" : "Download";

    const retryBtn = document.createElement("button");
    retryBtn.className = "btn btn-secondary media-retry-btn";
    retryBtn.type = "button";
    retryBtn.textContent = "Retry";

    const status = document.createElement("div");
    status.className = "media-status";

    const progress = document.createElement("div");
    progress.className = "media-progress";
    progress.innerHTML =
      '<div class="media-progress-circle"><div class="media-progress-center"></div></div><span class="media-progress-text"></span>';
    const progressCircle = progress.querySelector(".media-progress-circle");
    const progressText = progress.querySelector(".media-progress-text");

    overlay.appendChild(downloadBtn);
    overlay.appendChild(retryBtn);
    overlay.appendChild(status);
    overlay.appendChild(progress);
    frame.appendChild(overlay);

    const info = document.createElement("div");
    info.className = "media-info";
    const name = document.createElement("div");
    name.className = "media-name";
    name.textContent =
      meta.name || (message.message_type === "image" ? "Image" : "Video");
    const size = document.createElement("div");
    size.className = "media-size";
    size.textContent = meta.size ? this.formatFileSize(meta.size) : "";
    info.appendChild(name);
    info.appendChild(size);
    if (message.message_type === "image") {
      info.style.display = "none";
    }
    card.appendChild(info);

    container.appendChild(card);

    const applyState = (state, percent, detailText) => {
      card.dataset.state = state;
      const isChecking = state === "checking";
      downloadBtn.style.setProperty("display", state === "not-downloaded" && !isOutgoing ? "inline-flex" : "none", "important");
      progress.style.setProperty("display", state === "downloading" ? "flex" : "none", "important");
      retryBtn.style.setProperty("display", state === "failed" ? "inline-flex" : "none", "important");
      status.style.setProperty("display", state === "downloaded" ? "flex" : "none", "important");
      overlay.classList.toggle(
        "media-overlay-hidden",
        state === "downloaded" || isChecking,
      );
      if (state === "downloaded") {
        status.textContent = isProtected ? "Viewed" : "Downloaded";
      } else {
        status.textContent = "";
      }
      if (state === "downloading") {
        const pct = Math.max(0, Math.min(100, percent || 0));
        progressCircle.style.setProperty("--progress", pct);
        progressText.textContent =
          detailText || (pct ? pct + "%" : "Downloading...");
      } else {
        progressCircle.style.setProperty("--progress", 0);
        progressText.textContent = "";
      }
    };
    applyState("checking");

    let currentBlob = null;
    let currentUrl = null;
    let fallback = null;
    const clearFallback = () => {
      if (fallback) {
        fallback.remove();
        fallback = null;
      }
    };
    const showFallback = () => {
      if (fallback || message.message_type !== "video") {
        return;
      }
      fallback = document.createElement("div");
      fallback.className = "media-thumb-fallback";
      const label = document.createElement("div");
      label.className = "media-thumb-label";
      label.textContent = "Video";
      const sizeLabel = document.createElement("div");
      sizeLabel.className = "media-thumb-size";
      sizeLabel.textContent = meta.size ? this.formatFileSize(meta.size) : "";
      fallback.appendChild(label);
      if (sizeLabel.textContent) {
        fallback.appendChild(sizeLabel);
      }
      frame.insertBefore(fallback, overlay);
    };
    const showMedia = (blob) => {
      frame
        .querySelectorAll("img, video, .custom-player")
        .forEach((node) => node.remove());
      clearFallback();
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
      currentBlob = blob;
      currentUrl = URL.createObjectURL(blob);
      if (message.message_type === "image") {
        const image = document.createElement("img");
        image.src = currentUrl;
        image.alt = meta.name || "Image";
        image.className = "image-message";
        frame.insertBefore(image, overlay);
      } else {
        const player = this.buildVideoPlayer(currentUrl, meta);
        frame.insertBefore(player, overlay);
      }
    };

    const startDownload = () => {
      if (!message.file_url) {
        return;
      }
      if (!meta.fileIv && !meta.fileIvs) {
        this.queueMediaDownload(message.message_id, async () => {
          applyState("downloading", 0, "Loading...");
          try {
            const resp = await fetch(message.file_url, { credentials: "include" });
            if (!resp.ok) throw new Error("Load failed");
            const blob = await resp.blob();
            showMedia(blob);
            applyState("downloaded");
            if (effectiveMediaId) {
              this.syncMediaRefForMessage(message, effectiveMediaId);
            }
            if (cacheWritable && effectiveMediaId) {
              this.mediaStore
                .saveMediaBlob(effectiveMediaId, {
                  blob: blob,
                  size: blob.size,
                  mime: blob.type || meta.mime,
                  name: meta.name || "",
                  source: "download",
                })
                .catch(() => {});
            }
          } catch (err) {
            applyState("error", 0, "Failed to load");
          }
        });
        return;
      }
      if (!message.file_url) {
        return;
      }
      this.queueMediaDownload(message.message_id, async () => {
        applyState("downloading", 0, "Downloading...");
        try {
          const encryptedBuffer = await this.downloadEncryptedFileWithProgress(
            message.file_url,
            meta.size || 0,
            (progressInfo) => {
              const pct =
                progressInfo && Number.isFinite(progressInfo.percent)
                  ? progressInfo.percent
                  : 0;
              let detail = "";
              if (progressInfo && progressInfo.total) {
                detail = `${this.formatFileSize(progressInfo.loaded)} / ${this.formatFileSize(progressInfo.total)}`;
              } else if (pct) {
                detail = `${pct}%`;
              } else {
                detail = "Downloading...";
              }
              applyState("downloading", pct, detail);
            },
          );
          applyState("downloading", 100, "Processing...");
          const decryptedBuffer = await this.decryptFileBuffer(
            encryptedBuffer,
            meta,
            contentKey,
          );
          const mimeType =
            meta.mime ||
            (message.message_type === "video" ? "video/mp4" : "image/jpeg");
          const blob = new Blob([decryptedBuffer], { type: mimeType });
          if (cacheWritable && effectiveMediaId) {
            await this.mediaStore.saveMediaBlob(effectiveMediaId, {
              blob,
              size: blob.size,
              mime: mimeType,
              name: meta.name || "",
              source: "download",
            });
          }
          showMedia(blob);
          applyState("downloaded");
          if (effectiveMediaId) {
            this.syncMediaRefForMessage(message, effectiveMediaId);
          }
          await this.maybeCachePreview(message, blob, meta, effectiveMediaId);
        } catch (err) {
          applyState("failed");
        }
      });
    };

    const localBlob = message._localBlob || null;
    let cachedHit = null;
    if (!localBlob && cacheReadable) {
      cachedHit = await this.findCachedMediaBlob(
        message,
        meta,
        effectiveMediaId,
      );
      if (
        cachedHit &&
        cachedHit.mediaId &&
        cachedHit.mediaId !== effectiveMediaId
      ) {
        effectiveMediaId = cachedHit.mediaId;
        if (this.mediaStore) {
          this.mediaStore
            .saveMediaRef(
              message.message_id,
              effectiveMediaId,
              chatKey,
              message.message_type,
            )
            .catch(() => {});
        }
      }
    }
    if (localBlob) {
      showMedia(localBlob);
      applyState("downloaded");
      if (cacheWritable && effectiveMediaId) {
        this.mediaStore
          .saveMediaBlob(effectiveMediaId, {
            blob: localBlob,
            size: localBlob.size,
            mime:
              meta.mime ||
              (message.message_type === "video" ? "video/mp4" : "image/jpeg"),
            name: meta.name || "",
            source: "upload",
          })
          .catch(() => {});
      }
      if (effectiveMediaId) {
        this.syncMediaRefForMessage(message, effectiveMediaId);
      }
    } else if (cachedHit && cachedHit.blob) {
      showMedia(cachedHit.blob);
      applyState("downloaded");
      if (this.mediaStore && effectiveMediaId) {
        this.mediaStore.touchMediaBlob(effectiveMediaId).catch(() => {});
      }
      if (effectiveMediaId) {
        this.syncMediaRefForMessage(message, effectiveMediaId);
      }
    } else if (!message.file_url) {
      const needsChannelRetry = !!message.channel_id;
      card.dataset.state = "checking";
      downloadBtn.style.display = "none";
      retryBtn.style.display = "none";
      progress.style.display = "none";
      status.style.display = "flex";
      status.textContent = needsChannelRetry
        ? "Decrypting..."
        : "File missing";
      overlay.classList.remove("media-overlay-hidden");
      if (needsChannelRetry) {
        this.scheduleChannelDecryptRetry(message.message_id);
      }
      return;
    } else if (!localBlob) {
      try {
        const thumbBlob = await this.resolveThumbBlob(effectiveMediaId, meta);
        if (thumbBlob) {
          frame.querySelectorAll("img").forEach((node) => node.remove());
          const thumb = document.createElement("img");
          thumb.src = URL.createObjectURL(thumbBlob);
          thumb.alt = meta.name || "Preview";
          thumb.className = "media-thumb";
          frame.insertBefore(thumb, overlay);
        } else {
          showFallback();
        }
      } catch (err) {
        console.error("Failed to load preview cache", err);
      }
      applyState("not-downloaded");
      if (isOutgoing || message.message_type === "image" || this.shouldAutoDownload(message.message_type, meta)) {
        startDownload();
      }
    }

    downloadBtn.addEventListener("click", startDownload);
    retryBtn.addEventListener("click", startDownload);
    this.mediaDownloadHandlers.set(message.message_id, {
      download: startDownload,
      getBlob: () => currentBlob,
      getMeta: () => meta,
      markAvailable: (blob) => {
        if (blob) {
          showMedia(blob);
          applyState("downloaded");
        }
      },
    });

    if (message.message_type === "image") {
      frame.addEventListener("click", (event) => {
        if (card.dataset.state !== "downloaded" || !currentBlob) {
          return;
        }
        if (
          event.target.closest(".media-download-btn") ||
          event.target.closest(".media-retry-btn")
        ) {
          return;
        }
        this.openImageViewer(currentBlob, meta);
      });
    }

    if (this.shouldAutoDownload(message.message_type, meta) || message.message_type === "image") {
      if ("IntersectionObserver" in window) {
        this.observeMediaMessage(card, () => {
          if (card.dataset.state === "not-downloaded") {
            startDownload();
          }
        });
      } else if (card.dataset.state === "not-downloaded") {
        startDownload();
      }
    }

    if (meta.caption) {
      const caption = document.createElement("div");
      caption.className = "file-caption bidi-text";
      this.renderCaptionText(
        caption,
        meta.caption,
        message,
        this.chatSearch.query,
      );
      container.appendChild(caption);
    }
  }

  async renderAlbumMessage(container, message, decrypted) {
    const isProtected = this.isContentProtected();
    const isOutgoing = message.sender_id === this.userId;
    const contentKey = decrypted && decrypted.key ? decrypted.key : null;
    let meta = null;
    if (decrypted && decrypted.plaintext) {
      try {
        meta = JSON.parse(decrypted.plaintext);
      } catch (err) {
        meta = null;
      }
    } else if (message._meta && typeof message._meta === "object") {
      meta = Object.assign({}, message._meta);
    }
    if (!meta || typeof meta !== "object") {
      meta = { type: "album", items: [] };
    }
    if (!Array.isArray(meta.items)) {
      meta.items = [];
    }
    message._meta = meta;

    const items = meta.items.slice();
    const grid = document.createElement("div");
    grid.className = "album-grid";
    if (items.length) {
      grid.classList.add(`album-count-${Math.min(items.length, 4)}`);
    }
    container.appendChild(grid);

    const chatKey =
      this.getChatKeyForMessage(message) ||
      this.getChatKeyFromChat(this.currentChat);

    const renderItem = async (item, index) => {
      const cell = document.createElement("div");
      cell.className = "album-item";
      const frame = document.createElement("div");
      frame.className = "album-item-frame";
      cell.appendChild(frame);

      const overlay = document.createElement("div");
      overlay.className = "album-item-overlay";
      const downloadBtn = document.createElement("button");
      downloadBtn.className = "btn btn-icon album-download-btn";
      downloadBtn.type = "button";
      downloadBtn.innerHTML = this.iconHtml(isProtected ? "eye" : "download");
      downloadBtn.title = isProtected ? "View" : "Download";
      const progress = document.createElement("div");
      progress.className = "album-item-progress";
      progress.innerHTML =
        '<div class="media-progress-circle"><div class="media-progress-center"></div></div><span class="media-progress-text"></span>';
      const progressCircle = progress.querySelector(".media-progress-circle");
      const progressText = progress.querySelector(".media-progress-text");
      overlay.appendChild(downloadBtn);
      overlay.appendChild(progress);
      frame.appendChild(overlay);

      const applyState = (state, percent, detailText) => {
        cell.dataset.state = state;
        const showDownload = state === "not-downloaded" && !isOutgoing;
        downloadBtn.style.display = showDownload ? "inline-flex" : "none";
        progress.style.display = state === "downloading" ? "flex" : "none";
        overlay.classList.toggle(
          "album-overlay-hidden",
          state === "downloaded",
        );
        if (state === "downloading") {
          const pct = Math.max(0, Math.min(100, percent || 0));
          progressCircle.style.setProperty("--progress", pct);
          progressText.textContent =
            detailText || (pct ? pct + "%" : "Downloading...");
        } else {
          progressCircle.style.setProperty("--progress", 0);
          progressText.textContent = "";
        }
      };

      const mediaId = item.media_id || `album_${message.message_id}_${index}`;
      if (this.mediaStore && mediaId) {
        this.mediaStore
          .saveMediaRef(message.message_id, mediaId, chatKey, "image")
          .catch(() => {});
      }

      let currentBlob = null;
      let currentUrl = null;
      const showImage = (blob) => {
        frame.querySelectorAll("img").forEach((img) => img.remove());
        if (currentUrl) {
          URL.revokeObjectURL(currentUrl);
        }
        currentBlob = blob;
        currentUrl = URL.createObjectURL(blob);
        const img = document.createElement("img");
        img.src = currentUrl;
        img.alt = item.name || "Photo";
        frame.insertBefore(img, overlay);
      };

      const showPlaceholder = () => {
        if (frame.querySelector(".album-item-placeholder")) {
          return;
        }
        const placeholder = document.createElement("div");
        placeholder.className = "album-item-placeholder";
        placeholder.innerHTML = this.iconHtml("image");
        frame.insertBefore(placeholder, overlay);
      };

      const startDownload = () => {
        if (!item.file_url) {
          return;
        }
        if (!item.fileIv && !item.fileIvs) {
          const downloadId = -1 * (message.message_id * 1000 + index + 1);
          this.queueMediaDownload(downloadId, async () => {
            applyState("downloading", 0, "Loading...");
            try {
              const resp = await fetch(item.file_url);
              if (!resp.ok) throw new Error("Load failed");
              const blob = await resp.blob();
              showImage(blob);
              applyState("downloaded");
              if (this.mediaStore && mediaId) {
                this.mediaStore
                  .saveMediaBlob(mediaId, {
                    blob: blob,
                    size: blob.size,
                    mime: blob.type || "image/jpeg",
                    name: item.name || "",
                    source: "download",
                  })
                  .catch(() => {});
              }
            } catch (err) {
              applyState("not-downloaded");
            }
          });
          return;
        }
        if (!item.file_url) {
          return;
        }
        const downloadId = -1 * (message.message_id * 1000 + index + 1);
        this.queueMediaDownload(downloadId, async () => {
          applyState("downloading", 0, "Downloading...");
          try {
            const encryptedBuffer =
              await this.downloadEncryptedFileWithProgress(
                item.file_url,
                item.size || 0,
                (progressInfo) => {
                  const pct =
                    progressInfo && Number.isFinite(progressInfo.percent)
                      ? progressInfo.percent
                      : 0;
                  let detail = "";
                  if (progressInfo && progressInfo.total) {
                    detail = `${this.formatFileSize(progressInfo.loaded)} / ${this.formatFileSize(progressInfo.total)}`;
                  } else if (pct) {
                    detail = `${pct}%`;
                  } else {
                    detail = "Downloading...";
                  }
                  applyState("downloading", pct, detail);
                },
              );
            const decryptedBuffer = await this.decryptFileBuffer(
              encryptedBuffer,
              item,
              contentKey,
            );
            const blob = new Blob([decryptedBuffer], {
              type: item.mime || "image/jpeg",
            });
            if (this.mediaStore && (!isProtected || isOutgoing)) {
              await this.mediaStore.saveMediaBlob(mediaId, {
                blob,
                size: blob.size,
                mime: item.mime || "image/jpeg",
                source: "download",
              });
            }
            showImage(blob);
            applyState("downloaded");
            await this.maybeCachePreview(message, blob, item, mediaId);
          } catch (err) {
            applyState("not-downloaded");
          }
        });
      };

      const localFiles = message._albumFiles || [];
      if (localFiles[index]) {
        showImage(localFiles[index]);
        applyState("downloaded");
      } else if (this.mediaStore && mediaId) {
        try {
          const cached = await this.mediaStore.getMediaBlob(mediaId);
          if (cached && cached.blob) {
            showImage(cached.blob);
            applyState("downloaded");
            await this.mediaStore.touchMediaBlob(mediaId);
          } else if (item.file_url) {
            try {
              const thumbBlob = await this.resolveThumbBlob(mediaId, item);
              if (thumbBlob) {
                showImage(thumbBlob);
              } else {
                showPlaceholder();
              }
            } catch (err) {
              showPlaceholder();
            }
            applyState("not-downloaded");
          } else {
            showPlaceholder();
            applyState("not-downloaded");
          }
        } catch (err) {
          showPlaceholder();
          applyState("not-downloaded");
        }
      } else if (item.thumb) {
        try {
          const thumbBlob = this.base64ToBlob(
            item.thumb,
            item.thumb_mime || "image/jpeg",
          );
          showImage(thumbBlob);
        } catch (err) {
          showPlaceholder();
        }
        applyState("not-downloaded");
      } else {
        showPlaceholder();
        applyState("not-downloaded");
      }

      downloadBtn.addEventListener("click", startDownload);
      frame.addEventListener("click", (event) => {
        if (event.target.closest(".album-download-btn")) {
          return;
        }
        if (!currentBlob) {
          startDownload();
          return;
        }
        this.openImageViewer(currentBlob, item);
      });

      if (
        this.shouldAutoDownload("image", item) &&
        contentKey &&
        item.file_url
      ) {
        if ("IntersectionObserver" in window) {
          this.observeMediaMessage(cell, () => {
            if (cell.dataset.state === "not-downloaded") {
              startDownload();
            }
          });
        } else if (cell.dataset.state === "not-downloaded") {
          startDownload();
        }
      }

      return cell;
    };

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (!item) {
        continue;
      }
      const cell = await renderItem(item, i);
      if (cell) {
        grid.appendChild(cell);
      }
    }

    if (message._pending_upload || message._upload_failed) {
      const overlay = document.createElement("div");
      overlay.className = "album-upload-overlay";
      const progress = document.createElement("div");
      progress.className = "upload-progress";
      progress.innerHTML =
        '<div class="upload-progress-bar"></div><span class="upload-progress-text"></span>';
      const bar = progress.querySelector(".upload-progress-bar");
      const text = progress.querySelector(".upload-progress-text");
      const pct = Number.isFinite(message._uploadProgress)
        ? message._uploadProgress
        : 0;
      bar.style.width = `${pct}%`;
      text.textContent = `${message._uploadStage || "Uploading"} ${pct}%`;
      overlay.appendChild(progress);
      if (message._upload_failed) {
        const retry = document.createElement("button");
        retry.type = "button";
        retry.className = "btn btn-secondary upload-retry-btn";
        retry.textContent = "Retry";
        retry.addEventListener("click", () =>
          this.retryUpload(message.message_id),
        );
        overlay.appendChild(retry);
      }
      container.appendChild(overlay);
    }

    if (meta.caption) {
      const caption = document.createElement("div");
      caption.className = "file-caption bidi-text";
      this.renderCaptionText(
        caption,
        meta.caption,
        message,
        this.chatSearch.query,
      );
      container.appendChild(caption);
    }
  }

  async renderVideoNoteMessage(container, message, meta, decrypted) {
    const contentKey = decrypted && decrypted.key ? decrypted.key : null;
    const hasCipherMeta = !!message.file_url;
    const isProtected = this.isContentProtected();
    const isOutgoing = message.sender_id === this.userId;
    const cacheReadable = !!this.mediaStore;
    const cacheWritable = this.mediaStore && (!isProtected || isOutgoing);
    const mediaId = await this.resolveMediaIdForMessage(message, meta);
    let effectiveMediaId = mediaId;
    const chatKey =
      this.getChatKeyForMessage(message) ||
      this.getChatKeyFromChat(this.currentChat);
    if (this.mediaStore && effectiveMediaId) {
      this.mediaStore
        .saveMediaRef(
          message.message_id,
          effectiveMediaId,
          chatKey,
          message.message_type,
        )
        .catch(() => {});
    }

    const card = document.createElement("div");
    card.className = "video-note-card";
    card.dataset.state = "checking";

    const frame = document.createElement("div");
    frame.className = "video-note-frame";
    card.appendChild(frame);

    const overlay = document.createElement("div");
    overlay.className = "video-note-overlay media-overlay";

    const downloadBtn = document.createElement("button");
    downloadBtn.className = "btn btn-icon media-download-btn";
    downloadBtn.type = "button";
    downloadBtn.innerHTML = this.iconHtml(isProtected ? "eye" : "download");
    downloadBtn.title = isProtected ? "View" : "Download";

    const retryBtn = document.createElement("button");
    retryBtn.className = "btn btn-secondary media-retry-btn";
    retryBtn.type = "button";
    retryBtn.textContent = "Retry";

    const status = document.createElement("div");
    status.className = "video-note-status";

    const progress = document.createElement("div");
    progress.className = "media-progress";
    progress.innerHTML =
      '<div class="media-progress-circle"><div class="media-progress-center"></div></div><span class="media-progress-text"></span>';
    const progressCircle = progress.querySelector(".media-progress-circle");
    const progressText = progress.querySelector(".media-progress-text");

    overlay.appendChild(downloadBtn);
    overlay.appendChild(retryBtn);
    overlay.appendChild(status);
    overlay.appendChild(progress);
    frame.appendChild(overlay);

    const timeLabel = document.createElement("div");
    timeLabel.className = "video-note-time";
    const durationMeta = meta.duration
      ? Math.max(1, Math.round(meta.duration))
      : 0;
    timeLabel.textContent = durationMeta
      ? this.formatDuration(durationMeta)
      : "0:00";

    card.appendChild(timeLabel);
    container.appendChild(card);

    const applyState = (state, percent, detailText) => {
      card.dataset.state = state;
      downloadBtn.style.setProperty("display", state === "not-downloaded" && !isOutgoing ? "inline-flex" : "none", "important");
      progress.style.setProperty("display", state === "downloading" ? "flex" : "none", "important");
      retryBtn.style.setProperty("display", state === "failed" ? "inline-flex" : "none", "important");
      status.style.setProperty("display", state === "downloaded" ? "flex" : "none", "important");
      overlay.classList.toggle(
        "media-overlay-hidden",
        state === "downloaded" || state === "checking",
      );
      if (state === "downloaded") {
        status.textContent = isProtected ? "Viewed" : "Ready";
      } else {
        status.textContent = "";
      }
      if (state === "downloading") {
        const pct = Math.max(0, Math.min(100, percent || 0));
        progressCircle.style.setProperty("--progress", pct);
        progressText.textContent =
          detailText || (pct ? pct + "%" : "Downloading...");
      } else {
        progressCircle.style.setProperty("--progress", 0);
        progressText.textContent = "";
      }
    };
    applyState("checking");

    let currentBlob = null;
    let currentUrl = null;
    const clearThumb = () => {
      frame
        .querySelectorAll(
          "img.media-thumb, img.video-note-thumb, .media-thumb-fallback",
        )
        .forEach((node) => node.remove());
    };
    const showThumb = (blob) => {
      clearThumb();
      const thumb = document.createElement("img");
      thumb.src = URL.createObjectURL(blob);
      thumb.alt = meta.name || "Preview";
      thumb.className = "video-note-thumb";
      frame.insertBefore(thumb, overlay);
    };
    const showFallback = () => {
      if (frame.querySelector(".media-thumb-fallback")) {
        return;
      }
      const fallback = document.createElement("div");
      fallback.className = "media-thumb-fallback";
      const label = document.createElement("div");
      label.className = "media-thumb-label";
      label.textContent = "Video message";
      fallback.appendChild(label);
      frame.insertBefore(fallback, overlay);
    };
    const showMedia = (blob) => {
      frame
        .querySelectorAll(".video-note-player")
        .forEach((node) => node.remove());
      clearThumb();
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
      currentBlob = blob;
      currentUrl = URL.createObjectURL(blob);
      const player = this.buildVideoNotePlayer(currentUrl, meta, timeLabel);
      frame.insertBefore(player, overlay);
    };

    const startDownload = () => {
      if (!message.file_url) {
        return;
      }
      if (!meta.fileIv && !meta.fileIvs) {
        this.queueMediaDownload(message.message_id, async () => {
          applyState("downloading", 0, "Loading...");
          try {
            const resp = await fetch(message.file_url, { credentials: "include" });
            if (!resp.ok) throw new Error("Load failed");
            const blob = await resp.blob();
            showMedia(blob);
            applyState("downloaded");
            if (effectiveMediaId) {
              this.syncMediaRefForMessage(message, effectiveMediaId);
            }
            if (cacheWritable && effectiveMediaId) {
              this.mediaStore
                .saveMediaBlob(effectiveMediaId, {
                  blob: blob,
                  size: blob.size,
                  mime: blob.type || meta.mime,
                  name: meta.name || "",
                  source: "download",
                })
                .catch(() => {});
            }
          } catch (err) {
            applyState("error", 0, "Failed to load");
          }
        });
        return;
      }
      if (!message.file_url) {
        return;
      }
      this.queueMediaDownload(message.message_id, async () => {
        applyState("downloading", 0, "Downloading...");
        try {
          const encryptedBuffer = await this.downloadEncryptedFileWithProgress(
            message.file_url,
            meta.size || 0,
            (progressInfo) => {
              const pct =
                progressInfo && Number.isFinite(progressInfo.percent)
                  ? progressInfo.percent
                  : 0;
              let detail = "";
              if (progressInfo && progressInfo.total) {
                detail = `${this.formatFileSize(progressInfo.loaded)} / ${this.formatFileSize(progressInfo.total)}`;
              } else if (pct) {
                detail = `${pct}%`;
              } else {
                detail = "Downloading...";
              }
              applyState("downloading", pct, detail);
            },
          );
          applyState("downloading", 100, "Processing...");
          const decryptedBuffer = await this.decryptFileBuffer(
            encryptedBuffer,
            meta,
            contentKey,
          );
          const mimeType = meta.mime || "video/webm";
          const blob = new Blob([decryptedBuffer], { type: mimeType });
          if (cacheWritable && effectiveMediaId) {
            await this.mediaStore.saveMediaBlob(effectiveMediaId, {
              blob,
              size: blob.size,
              mime: mimeType,
              name: meta.name || "",
              source: "download",
            });
          }
          showMedia(blob);
          applyState("downloaded");
          if (effectiveMediaId) {
            this.syncMediaRefForMessage(message, effectiveMediaId);
          }
          await this.maybeCachePreview(message, blob, meta, effectiveMediaId);
        } catch (err) {
          applyState("failed");
        }
      });
    };

    const localBlob = message._localBlob || null;
    let cachedHit = null;
    if (!localBlob && cacheReadable) {
      cachedHit = await this.findCachedMediaBlob(
        message,
        meta,
        effectiveMediaId,
      );
      if (
        cachedHit &&
        cachedHit.mediaId &&
        cachedHit.mediaId !== effectiveMediaId
      ) {
        effectiveMediaId = cachedHit.mediaId;
        if (this.mediaStore) {
          this.mediaStore
            .saveMediaRef(
              message.message_id,
              effectiveMediaId,
              chatKey,
              message.message_type,
            )
            .catch(() => {});
        }
      }
    }
    if (localBlob) {
      showMedia(localBlob);
      applyState("downloaded");
      if (cacheWritable && effectiveMediaId) {
        this.mediaStore
          .saveMediaBlob(effectiveMediaId, {
            blob: localBlob,
            size: localBlob.size,
            mime: meta.mime || "video/webm",
            name: meta.name || "",
            source: "upload",
          })
          .catch(() => {});
      }
      if (effectiveMediaId) {
        this.syncMediaRefForMessage(message, effectiveMediaId);
      }
    } else if (cachedHit && cachedHit.blob) {
      showMedia(cachedHit.blob);
      applyState("downloaded");
      if (this.mediaStore && effectiveMediaId) {
        this.mediaStore.touchMediaBlob(effectiveMediaId).catch(() => {});
      }
      if (effectiveMediaId) {
        this.syncMediaRefForMessage(message, effectiveMediaId);
      }
    } else if (!message.file_url) {
      const needsChannelRetry = !!message.channel_id;
      card.dataset.state = "checking";
      downloadBtn.style.display = "none";
      retryBtn.style.display = "none";
      progress.style.display = "none";
      status.style.display = "flex";
      status.textContent = needsChannelRetry
        ? "Decrypting..."
        : "File missing";
      overlay.classList.remove("media-overlay-hidden");
      if (needsChannelRetry) {
        this.scheduleChannelDecryptRetry(message.message_id);
      }
      return;
    } else if (!localBlob) {
      try {
        const thumbBlob = await this.resolveThumbBlob(effectiveMediaId, meta);
        if (thumbBlob) {
          showThumb(thumbBlob);
        } else {
          showFallback();
        }
      } catch (err) {
        showFallback();
      }
      applyState("not-downloaded");
      if (isOutgoing) {
        startDownload();
      }
    }

    downloadBtn.addEventListener("click", startDownload);
    retryBtn.addEventListener("click", startDownload);
    this.mediaDownloadHandlers.set(message.message_id, {
      download: startDownload,
      getBlob: () => currentBlob,
      getMeta: () => meta,
      markAvailable: (blob) => {
        if (blob) {
          showMedia(blob);
          applyState("downloaded");
        }
      },
    });

    if (this.shouldAutoDownload(message.message_type, meta)) {
      if ("IntersectionObserver" in window) {
        this.observeMediaMessage(card, () => {
          if (card.dataset.state === "not-downloaded") {
            startDownload();
          }
        });
      } else if (card.dataset.state === "not-downloaded") {
        startDownload();
      }
    }

    if (meta.caption) {
      const caption = document.createElement("div");
      caption.className = "file-caption bidi-text";
      this.renderCaptionText(
        caption,
        meta.caption,
        message,
        this.chatSearch.query,
      );
      container.appendChild(caption);
    }
  }

  async renderAudioMessage(container, message, meta, decrypted) {
    const contentKey = decrypted && decrypted.key ? decrypted.key : null;
    const hasCipherMeta = !!message.file_url;
    if (message.message_type === "audio") {
      const parsed = this.parseAudioMetaFromName(meta.name || "");
      if (parsed.title && !meta.title) {
        meta.title = parsed.title;
      }
      if (parsed.artist && !meta.artist) {
        meta.artist = parsed.artist;
      }
    }
    const isProtected = this.isContentProtected();
    const isOutgoing = message.sender_id === this.userId;
    const cacheReadable = !!this.mediaStore;
    const cacheWritable = this.mediaStore && (!isProtected || isOutgoing);
    const mediaId = await this.resolveMediaIdForMessage(message, meta);
    let effectiveMediaId = mediaId;
    const chatKey =
      this.getChatKeyForMessage(message) ||
      this.getChatKeyFromChat(this.currentChat);
    if (this.mediaStore && effectiveMediaId) {
      this.mediaStore
        .saveMediaRef(
          message.message_id,
          effectiveMediaId,
          chatKey,
          message.message_type,
        )
        .catch(() => {});
    }

    const card = document.createElement("div");
    card.className =
      message.message_type === "voice"
        ? "audio-card voice-card"
        : "audio-card music-card";
    card.dataset.state = "checking";

    const frame = document.createElement("div");
    frame.className = "audio-frame";
    card.appendChild(frame);

    const placeholder = document.createElement("div");
    placeholder.className =
      message.message_type === "voice"
        ? "voice-placeholder"
        : "audio-placeholder";
    placeholder.innerHTML =
      message.message_type === "voice"
        ? '<div class="voice-placeholder-icon">' +
          this.iconHtml("mic") +
          '</div><div class="voice-placeholder-text">Voice message</div>'
        : '<div class="audio-placeholder-icon">' +
          this.iconHtml("music") +
          '</div><div class="audio-placeholder-text">' +
          this.escapeHtml(meta.name || "Audio") +
          "</div>";
    frame.appendChild(placeholder);

    const overlay = document.createElement("div");
    overlay.className = "media-overlay";

    const downloadBtn = document.createElement("button");
    downloadBtn.className = "btn btn-icon media-download-btn";
    downloadBtn.type = "button";
    downloadBtn.innerHTML = this.iconHtml(isProtected ? "eye" : "download");
    downloadBtn.title = isProtected ? "View" : "Download";

    const retryBtn = document.createElement("button");
    retryBtn.className = "btn btn-secondary media-retry-btn";
    retryBtn.type = "button";
    retryBtn.textContent = "Retry";

    const status = document.createElement("div");
    status.className = "media-status";

    const progress = document.createElement("div");
    progress.className = "media-progress";
    progress.innerHTML =
      '<div class="media-progress-circle"><div class="media-progress-center"></div></div><span class="media-progress-text"></span>';
    const progressCircle = progress.querySelector(".media-progress-circle");
    const progressText = progress.querySelector(".media-progress-text");

    overlay.appendChild(downloadBtn);
    overlay.appendChild(retryBtn);
    overlay.appendChild(status);
    overlay.appendChild(progress);
    frame.appendChild(overlay);
    container.appendChild(card);

    const applyState = (state, percent, detailText) => {
      card.dataset.state = state;
      const isChecking = state === "checking";
      downloadBtn.style.setProperty("display", state === "not-downloaded" && !isOutgoing ? "inline-flex" : "none", "important");
      progress.style.setProperty("display", state === "downloading" ? "flex" : "none", "important");
      retryBtn.style.setProperty("display", state === "failed" ? "inline-flex" : "none", "important");
      status.style.setProperty("display", state === "downloaded" ? "flex" : "none", "important");
      overlay.classList.toggle(
        "media-overlay-hidden",
        state === "downloaded" || isChecking,
      );
      if (state === "downloaded") {
        status.textContent = isProtected ? "Viewed" : "Ready";
      } else {
        status.textContent = "";
      }
      if (state === "downloading") {
        const pct = Math.max(0, Math.min(100, percent || 0));
        progressCircle.style.setProperty("--progress", pct);
        progressText.textContent =
          detailText || (pct ? pct + "%" : "Downloading...");
      } else {
        progressCircle.style.setProperty("--progress", 0);
        progressText.textContent = "";
      }
    };
    applyState("checking");

    let currentBlob = null;
    let currentTile = null;
    const showAudio = (blob) => {
      frame.querySelectorAll(".audio-tile").forEach((node) => node.remove());
      if (placeholder && placeholder.parentNode) {
        placeholder.remove();
      }
      currentBlob = blob;
      const tile = this.buildAudioTile(message, meta, blob);
      currentTile = tile;
      frame.insertBefore(tile, overlay);
      if (this.globalPlayer && this.globalPlayer.tiles) {
        this.globalPlayer.tiles.set(message.message_id, tile);
      }
      if (
        this.globalPlayer &&
        this.globalPlayer.entry &&
        this.globalPlayer.entry.messageId === message.message_id
      ) {
        this.setGlobalTilePlaying(message.message_id);
      }
    };

    const startDownload = () => {
      if (!message.file_url) {
        return;
      }
      if (!meta.fileIv && !meta.fileIvs) {
        this.queueMediaDownload(message.message_id, async () => {
          applyState("downloading", 0, "Loading...");
          try {
            const resp = await fetch(message.file_url, { credentials: "include" });
            if (!resp.ok) throw new Error("Load failed");
            const blob = await resp.blob();
            showAudio(blob);
            applyState("downloaded");
            if (effectiveMediaId) {
              this.syncMediaRefForMessage(message, effectiveMediaId);
            }
            if (cacheWritable && effectiveMediaId) {
              this.mediaStore
                .saveMediaBlob(effectiveMediaId, {
                  blob: blob,
                  size: blob.size,
                  mime: blob.type || meta.mime,
                  name: meta.name || "",
                  source: "download",
                })
                .catch(() => {});
            }
          } catch (err) {
            applyState("error", 0, "Failed to load");
          }
        });
        return;
      }
      if (!message.file_url) {
        return;
      }
      this.queueMediaDownload(message.message_id, async () => {
        applyState("downloading", 0, "Downloading...");
        try {
          const encryptedBuffer = await this.downloadEncryptedFileWithProgress(
            message.file_url,
            meta.size || 0,
            (progressInfo) => {
              const pct =
                progressInfo && Number.isFinite(progressInfo.percent)
                  ? progressInfo.percent
                  : 0;
              let detail = "";
              if (progressInfo && progressInfo.total) {
                detail = `${this.formatFileSize(progressInfo.loaded)} / ${this.formatFileSize(progressInfo.total)}`;
              } else if (pct) {
                detail = `${pct}%`;
              } else {
                detail = "Downloading...";
              }
              applyState("downloading", pct, detail);
            },
          );
          applyState("downloading", 100, "Processing...");
          const decryptedBuffer = await this.decryptFileBuffer(
            encryptedBuffer,
            meta,
            contentKey,
          );
          const mimeType = meta.mime || "audio/mpeg";
          const blob = new Blob([decryptedBuffer], { type: mimeType });
          if (cacheWritable && effectiveMediaId) {
            await this.mediaStore.saveMediaBlob(effectiveMediaId, {
              blob,
              size: blob.size,
              mime: mimeType,
              name: meta.name || "",
              source: "download",
            });
          }
          showAudio(blob);
          applyState("downloaded");
          if (effectiveMediaId) {
            this.syncMediaRefForMessage(message, effectiveMediaId);
          }
        } catch (err) {
          applyState("failed");
        }
      });
    };

    const localBlob = message._localBlob || null;
    let cachedHit = null;
    if (!localBlob && cacheReadable) {
      cachedHit = await this.findCachedMediaBlob(
        message,
        meta,
        effectiveMediaId,
      );
      if (
        cachedHit &&
        cachedHit.mediaId &&
        cachedHit.mediaId !== effectiveMediaId
      ) {
        effectiveMediaId = cachedHit.mediaId;
        if (this.mediaStore) {
          this.mediaStore
            .saveMediaRef(
              message.message_id,
              effectiveMediaId,
              chatKey,
              message.message_type,
            )
            .catch(() => {});
        }
      }
    }
    if (localBlob) {
      showAudio(localBlob);
      applyState("downloaded");
      if (cacheWritable && effectiveMediaId) {
        this.mediaStore
          .saveMediaBlob(effectiveMediaId, {
            blob: localBlob,
            size: localBlob.size,
            mime: meta.mime || "audio/mpeg",
            name: meta.name || "",
            source: "upload",
          })
          .catch(() => {});
      }
      if (effectiveMediaId) {
        this.syncMediaRefForMessage(message, effectiveMediaId);
      }
    } else if (cachedHit && cachedHit.blob) {
      showAudio(cachedHit.blob);
      applyState("downloaded");
      if (this.mediaStore && effectiveMediaId) {
        this.mediaStore.touchMediaBlob(effectiveMediaId).catch(() => {});
      }
      if (effectiveMediaId) {
        this.syncMediaRefForMessage(message, effectiveMediaId);
      }
    } else if (!message.file_url) {
      const needsChannelRetry = !!message.channel_id;
      card.dataset.state = "checking";
      downloadBtn.style.display = "none";
      retryBtn.style.display = "none";
      progress.style.display = "none";
      status.style.display = "flex";
      status.textContent = needsChannelRetry
        ? "Decrypting..."
        : "File missing";
      overlay.classList.remove("media-overlay-hidden");
      if (needsChannelRetry) {
        this.scheduleChannelDecryptRetry(message.message_id);
      }
      return;
    } else if (!localBlob) {
      applyState("not-downloaded");
      if (isOutgoing) {
        startDownload();
      }
    }

    downloadBtn.addEventListener("click", startDownload);
    retryBtn.addEventListener("click", startDownload);
    this.mediaDownloadHandlers.set(message.message_id, {
      download: startDownload,
      getBlob: () => currentBlob,
      getMeta: () => meta,
      markAvailable: (blob) => {
        if (blob) {
          showAudio(blob);
          applyState("downloaded");
        }
      },
    });

    if (this.shouldAutoDownload(message.message_type, meta)) {
      if ("IntersectionObserver" in window) {
        this.observeMediaMessage(card, () => {
          if (card.dataset.state === "not-downloaded") {
            startDownload();
          }
        });
      } else if (card.dataset.state === "not-downloaded") {
        startDownload();
      }
    }

    if (meta.caption) {
      const caption = document.createElement("div");
      caption.className = "file-caption bidi-text";
      this.renderCaptionText(
        caption,
        meta.caption,
        message,
        this.chatSearch.query,
      );
      container.appendChild(caption);
    }
  }

  async downloadEncryptedFileWithProgress(url, totalSize, onProgress) {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error("Download failed");
    }
    const headerSize = parseInt(res.headers.get("Content-Length") || "0", 10);
    const totalBytes =
      Number.isFinite(totalSize) && totalSize > 0
        ? totalSize
        : Number.isFinite(headerSize)
          ? headerSize
          : 0;
    const report = (loaded) => {
      if (typeof onProgress !== "function") {
        return;
      }
      const displayLoaded = totalBytes ? Math.min(loaded, totalBytes) : loaded;
      const pct = totalBytes
        ? Math.round((displayLoaded / totalBytes) * 100)
        : 0;
      onProgress({
        loaded: displayLoaded,
        total: totalBytes,
        percent: Math.min(100, Math.max(0, pct)),
      });
    };
    report(0);
    if (!res.body || !res.body.getReader) {
      const buffer = await res.arrayBuffer();
      report(buffer.byteLength || totalBytes || 0);
      return buffer;
    }
    const reader = res.body.getReader();
    const chunks = [];
    let received = 0;
    while (true) {
      const result = await reader.read();
      if (result.done) {
        break;
      }
      chunks.push(result.value);
      received += result.value.length;
      report(received);
    }
    const merged = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    report(received);
    return merged.buffer;
  }

  async maybeCachePreview(message, blob, meta, mediaId) {
    if (!this.mediaStore || !message || !blob) {
      return;
    }
    if (this.isContentProtected()) {
      return;
    }
    const limit = this.getCacheLimitBytes();
    if (limit === 0) {
      return;
    }
    let previewBlob = null;
    try {
      if (this.mediaSettings.cache_thumbnails_only) {
        if (message.message_type === "image") {
          previewBlob = await this.createImageThumbnail(blob);
        } else if (
          message.message_type === "video" ||
          message.message_type === "video_note"
        ) {
          previewBlob = await this.createVideoThumbnail(blob);
        }
      } else {
        previewBlob = blob;
      }
    } catch (err) {
      console.error("Failed to create preview", err);
    }
    if (!previewBlob) {
      return;
    }
    const resolvedId = mediaId || this.getMediaId(message, meta);
    const kind = this.mediaSettings.cache_thumbnails_only ? "thumb" : "preview";
    await this.storeMediaThumb(resolvedId, previewBlob, meta, kind);
  }

  async createImageThumbnail(blob) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const maxSize = 320;
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = Math.round((height / width) * maxSize);
            width = maxSize;
          } else {
            width = Math.round((width / height) * maxSize);
            height = maxSize;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (thumb) => {
            resolve(thumb || blob);
          },
          "image/jpeg",
          0.7,
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Thumbnail load failed"));
      };
      img.src = url;
    });
  }

  async createVideoThumbnail(blob) {
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      const url = URL.createObjectURL(blob);
      const cleanup = () => {
        URL.revokeObjectURL(url);
      };
      video.addEventListener("loadeddata", () => {
        video.currentTime = 0.1;
      });
      video.addEventListener("seeked", () => {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 180;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (thumb) => {
            cleanup();
            resolve(thumb || null);
          },
          "image/jpeg",
          0.7,
        );
      });
      video.onerror = () => {
        cleanup();
        reject(new Error("Video thumbnail failed"));
      };
      video.src = url;
    });
  }

  decodeTagString(bytes) {
    if (!bytes || !bytes.length) {
      return "";
    }
    if (typeof TextDecoder !== "undefined") {
      try {
        return new TextDecoder("iso-8859-1")
          .decode(bytes)
          .replace(/\0/g, "")
          .trim();
      } catch (err) {
        // fall through
      }
    }
    let text = "";
    for (let i = 0; i < bytes.length; i += 1) {
      const code = bytes[i];
      if (code === 0) {
        continue;
      }
      text += String.fromCharCode(code);
    }
    return text.trim();
  }

  parseAudioMetaFromName(name) {
    if (!name) {
      return { title: "", artist: "" };
    }
    const cleaned = name.replace(/\.[^/.]+$/, "");
    const separators = [" - ", " ? ", " ? "];
    for (const sep of separators) {
      if (cleaned.includes(sep)) {
        const parts = cleaned.split(sep);
        if (parts.length >= 2) {
          return {
            artist: parts[0].trim(),
            title: parts.slice(1).join(sep).trim(),
          };
        }
      }
    }
    return { title: cleaned.trim(), artist: "" };
  }

  async extractAudioMetadata(file) {
    if (!file || file.size < 128) {
      return this.parseAudioMetaFromName(file ? file.name : "");
    }
    try {
      const slice = file.slice(file.size - 128, file.size);
      const buffer = await slice.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      if (bytes[0] === 0x54 && bytes[1] === 0x41 && bytes[2] === 0x47) {
        const title = this.decodeTagString(bytes.slice(3, 33));
        const artist = this.decodeTagString(bytes.slice(33, 63));
        return {
          title: title,
          artist: artist,
        };
      }
    } catch (err) {
      // ignore tag parse errors
    }
    return this.parseAudioMetaFromName(file.name || "");
  }

  formatDuration(seconds) {
    if (!Number.isFinite(seconds)) {
      return "0:00";
    }
    const total = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }
    return `${minutes}:${String(secs).padStart(2, "0")}`;
  }

  buildVideoPlayer(url, meta) {
    const wrapper = document.createElement("div");
    wrapper.className = "custom-player custom-video-player";
    const video = document.createElement("video");
    video.className = "custom-media-element";
    video.src = url;
    video.preload = "metadata";
    video.playsInline = true;
    video.controls = false;
    wrapper.appendChild(video);

    const controls = document.createElement("div");
    controls.className = "player-controls";

    const playBtn = document.createElement("button");
    playBtn.className = "btn btn-icon player-btn";
    playBtn.type = "button";
    playBtn.innerHTML = this.iconHtml("play");

    const timeLabel = document.createElement("span");
    timeLabel.className = "player-time";
    timeLabel.textContent = "0:00 / 0:00";

    const seek = document.createElement("input");
    seek.type = "range";
    seek.min = "0";
    seek.max = "100";
    seek.value = "0";
    seek.step = "0.1";
    seek.className = "player-seek";

    const volume = document.createElement("input");
    volume.type = "range";
    volume.min = "0";
    volume.max = "1";
    volume.step = "0.05";
    volume.value = "1";
    volume.className = "player-volume";

    const fullscreenBtn = document.createElement("button");
    fullscreenBtn.className = "btn btn-icon player-btn";
    fullscreenBtn.type = "button";
    fullscreenBtn.innerHTML = this.iconHtml("fullscreen");

    controls.appendChild(playBtn);
    controls.appendChild(seek);
    controls.appendChild(timeLabel);
    controls.appendChild(volume);
    controls.appendChild(fullscreenBtn);
    wrapper.appendChild(controls);

    const updateTime = () => {
      const current = this.formatDuration(video.currentTime || 0);
      const total = this.formatDuration(video.duration || 0);
      timeLabel.textContent = `${current} / ${total}`;
      if (video.duration) {
        seek.value = ((video.currentTime / video.duration) * 100).toFixed(1);
      }
    };

    playBtn.addEventListener("click", () => {
      if (video.paused) {
        video.play();
      } else {
        video.pause();
      }
    });

    video.addEventListener("play", () => {
      playBtn.innerHTML = this.iconHtml("pause");
    });

    video.addEventListener("pause", () => {
      playBtn.innerHTML = this.iconHtml("play");
    });

    video.addEventListener("ended", () => {
      playBtn.innerHTML = this.iconHtml("play");
    });

    video.addEventListener("timeupdate", updateTime);
    video.addEventListener("loadedmetadata", updateTime);

    seek.addEventListener("input", () => {
      if (video.duration) {
        video.currentTime = (parseFloat(seek.value) / 100) * video.duration;
      }
    });

    volume.addEventListener("input", () => {
      video.volume = parseFloat(volume.value);
    });

    fullscreenBtn.addEventListener("click", () => {
      const target = wrapper;
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
        return;
      }
      if (target.requestFullscreen) {
        target.requestFullscreen().catch(() => {});
      }
    });

    return wrapper;
  }

  buildVideoNotePlayer(url, meta, timeLabel) {
    const wrapper = document.createElement("div");
    wrapper.className = "video-note-player";
    const video = document.createElement("video");
    video.src = url;
    video.preload = "metadata";
    video.playsInline = true;
    video.controls = false;
    wrapper.appendChild(video);

    const progress = document.createElement("div");
    progress.className = "video-note-progress";
    wrapper.appendChild(progress);

    const playBtn = document.createElement("button");
    playBtn.className = "btn btn-icon video-note-play-btn";
    playBtn.type = "button";
    playBtn.innerHTML = this.iconHtml("play");
    wrapper.appendChild(playBtn);

    let hideTimer = null;
    const clearHideTimer = () => {
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
    };
    const showControls = (autoHide) => {
      playBtn.classList.remove("is-hidden");
      clearHideTimer();
      if (autoHide && !video.paused) {
        hideTimer = setTimeout(() => {
          playBtn.classList.add("is-hidden");
        }, 800);
      }
    };
    const handleInteraction = () => {
      if (video.paused) {
        showControls(false);
        return;
      }
      showControls(true);
    };

    const update = () => {
      const total =
        Number.isFinite(video.duration) && video.duration > 0
          ? video.duration
          : meta && meta.duration
            ? Number(meta.duration)
            : 0;
      const current = video.currentTime || 0;
      const pct = total ? Math.min(100, (current / total) * 100) : 0;
      progress.style.setProperty("--progress", `${pct}%`);
      if (timeLabel) {
        if (total) {
          timeLabel.textContent = `${this.formatDuration(Math.floor(current))} / ${this.formatDuration(Math.floor(total))}`;
        } else {
          timeLabel.textContent = this.formatDuration(Math.floor(current));
        }
      }
    };

    const syncIcon = () => {
      playBtn.innerHTML = this.iconHtml(video.paused ? "play" : "pause");
    };

    const toggle = () => {
      if (video.paused) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    };

    playBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggle();
    });

    wrapper.addEventListener("click", (event) => {
      if (event.target === playBtn) {
        return;
      }
      toggle();
    });
    wrapper.addEventListener("mousemove", handleInteraction);
    wrapper.addEventListener("touchstart", handleInteraction, {
      passive: true,
    });

    video.addEventListener("timeupdate", update);
    video.addEventListener("loadedmetadata", update);
    video.addEventListener("play", () => {
      syncIcon();
      showControls(true);
    });
    video.addEventListener("pause", () => {
      syncIcon();
      showControls(false);
    });
    video.addEventListener("ended", () => {
      video.currentTime = 0;
      syncIcon();
      update();
      showControls(false);
    });

    update();
    syncIcon();
    showControls(false);

    return wrapper;
  }

  buildAudioPlayer(url, meta) {
    const wrapper = document.createElement("div");
    wrapper.className = "custom-player custom-audio-player";
    const metaWrap = document.createElement("div");
    metaWrap.className = "audio-meta";
    const title = document.createElement("div");
    title.className = "audio-title";
    const artist = document.createElement("div");
    artist.className = "audio-artist";
    const fallback = this.parseAudioMetaFromName(
      meta && meta.name ? meta.name : "Audio",
    );
    const titleText =
      meta && meta.title ? meta.title : fallback.title || "Audio";
    const artistText = meta && meta.artist ? meta.artist : fallback.artist;
    title.textContent = titleText;
    artist.textContent = artistText || "";
    metaWrap.appendChild(title);
    metaWrap.appendChild(artist);
    wrapper.appendChild(metaWrap);
    const audio = document.createElement("audio");
    audio.className = "custom-media-element";
    audio.src = url;
    audio.preload = "metadata";
    audio.controls = false;
    wrapper.appendChild(audio);

    const controls = document.createElement("div");
    controls.className = "player-controls";

    const playBtn = document.createElement("button");
    playBtn.className = "btn btn-icon player-btn";
    playBtn.type = "button";
    playBtn.innerHTML = this.iconHtml("play");

    const timeLabel = document.createElement("span");
    timeLabel.className = "player-time";
    timeLabel.textContent = "0:00 / 0:00";

    const seek = document.createElement("input");
    seek.type = "range";
    seek.min = "0";
    seek.max = "100";
    seek.value = "0";
    seek.step = "0.1";
    seek.className = "player-seek";

    const speedBtn = document.createElement("button");
    speedBtn.className = "btn btn-icon player-speed";
    speedBtn.type = "button";
    speedBtn.textContent = "1x";

    controls.appendChild(playBtn);
    controls.appendChild(seek);
    controls.appendChild(timeLabel);
    controls.appendChild(speedBtn);
    wrapper.appendChild(controls);

    const updateTime = () => {
      const current = this.formatDuration(audio.currentTime || 0);
      const total = this.formatDuration(audio.duration || 0);
      timeLabel.textContent = `${current} / ${total}`;
      if (audio.duration) {
        seek.value = ((audio.currentTime / audio.duration) * 100).toFixed(1);
      }
    };

    playBtn.addEventListener("click", () => {
      if (audio.paused) {
        audio.play();
      } else {
        audio.pause();
      }
    });

    audio.addEventListener("play", () => {
      playBtn.innerHTML = this.iconHtml("pause");
    });

    audio.addEventListener("pause", () => {
      playBtn.innerHTML = this.iconHtml("play");
    });

    audio.addEventListener("ended", () => {
      playBtn.innerHTML = this.iconHtml("play");
    });

    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("loadedmetadata", updateTime);

    seek.addEventListener("input", () => {
      if (audio.duration) {
        audio.currentTime = (parseFloat(seek.value) / 100) * audio.duration;
      }
    });

    const speeds = [1, 1.5, 2];
    speedBtn.addEventListener("click", () => {
      const current = speeds.indexOf(audio.playbackRate);
      const next = speeds[(current + 1) % speeds.length];
      audio.playbackRate = next;
      speedBtn.textContent = `${next}x`;
    });

    return wrapper;
  }

  buildVoicePlayer(url, meta) {
    const wrapper = document.createElement("div");
    wrapper.className = "custom-player custom-voice-player";
    const audio = document.createElement("audio");
    audio.className = "custom-media-element";
    audio.src = url;
    audio.preload = "metadata";
    audio.controls = false;
    wrapper.appendChild(audio);

    const playBtn = document.createElement("button");
    playBtn.className = "btn btn-icon player-btn";
    playBtn.type = "button";
    playBtn.innerHTML = this.iconHtml("play");

    const wave = document.createElement("div");
    wave.className = "voice-wave";
    for (let i = 0; i < 28; i += 1) {
      const bar = document.createElement("span");
      bar.style.height = `${20 + (i % 6) * 5}%`;
      wave.appendChild(bar);
    }
    const waveProgress = document.createElement("div");
    waveProgress.className = "voice-wave-progress";
    wave.appendChild(waveProgress);

    const timeLabel = document.createElement("span");
    timeLabel.className = "player-time";
    timeLabel.textContent = "0:00 / 0:00";

    const speedBtn = document.createElement("button");
    speedBtn.className = "btn btn-icon player-speed";
    speedBtn.type = "button";
    speedBtn.textContent = "1x";

    const controls = document.createElement("div");
    controls.className = "voice-controls";
    controls.appendChild(playBtn);
    controls.appendChild(wave);
    controls.appendChild(timeLabel);
    controls.appendChild(speedBtn);
    wrapper.appendChild(controls);

    const updateTime = () => {
      const current = this.formatDuration(audio.currentTime || 0);
      const total = this.formatDuration(audio.duration || 0);
      timeLabel.textContent = `${current} / ${total}`;
      if (audio.duration) {
        const pct = Math.min(
          100,
          Math.max(0, (audio.currentTime / audio.duration) * 100),
        );
        waveProgress.style.width = pct + "%";
      }
    };

    playBtn.addEventListener("click", () => {
      if (audio.paused) {
        audio.play();
      } else {
        audio.pause();
      }
    });

    audio.addEventListener("play", () => {
      playBtn.innerHTML = this.iconHtml("pause");
    });

    audio.addEventListener("pause", () => {
      playBtn.innerHTML = this.iconHtml("play");
    });

    audio.addEventListener("ended", () => {
      playBtn.innerHTML = this.iconHtml("play");
    });

    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("loadedmetadata", updateTime);

    wave.addEventListener("click", (event) => {
      if (!audio.duration) {
        return;
      }
      const rect = wave.getBoundingClientRect();
      const pct = (event.clientX - rect.left) / rect.width;
      audio.currentTime = Math.max(
        0,
        Math.min(audio.duration, pct * audio.duration),
      );
    });

    const speeds = [1, 1.5, 2];
    speedBtn.addEventListener("click", () => {
      const current = speeds.indexOf(audio.playbackRate);
      const next = speeds[(current + 1) % speeds.length];
      audio.playbackRate = next;
      speedBtn.textContent = `${next}x`;
    });

    return wrapper;
  }

  toggleGlobalPlayback() {
    const player = this.globalPlayer;
    if (!player || !player.audio) {
      return;
    }
    if (player.audio.paused) {
      player.audio.play().catch(() => {});
    } else {
      player.audio.pause();
    }
  }

  updateGlobalPlayerState() {
    const player = this.globalPlayer;
    if (!player || !player.playBtn || !player.audio) {
      return;
    }
    player.playBtn.innerHTML = player.audio.paused
      ? this.iconHtml("play")
      : this.iconHtml("pause");
    this.updateGlobalPlayerNav();
    this.setGlobalTilePlaying(player.entry ? player.entry.messageId : null);
    this.updateGlobalPlayerTime();
    this.updateGlobalPlayerLoopState();
    this.updateGlobalPlayerVolumeState();
  }

  getStoredPlayerVolume() {
    try {
      const raw = localStorage.getItem("lc_player_volume");
      if (raw === null) {
        return null;
      }
      const value = parseFloat(raw);
      if (!Number.isFinite(value)) {
        return null;
      }
      return Math.max(0, Math.min(1, value));
    } catch (err) {
      return null;
    }
  }

  setStoredPlayerVolume(value) {
    try {
      localStorage.setItem("lc_player_volume", String(value));
    } catch (err) {
      // ignore storage failures
    }
  }

  getStoredPlayerLoop() {
    try {
      return sessionStorage.getItem("lc_player_loop") === "1";
    } catch (err) {
      return false;
    }
  }

  setStoredPlayerLoop(value) {
    try {
      sessionStorage.setItem("lc_player_loop", value ? "1" : "0");
    } catch (err) {
      // ignore storage failures
    }
  }

  applyGlobalPlayerVolume(value, persist = true) {
    const player = this.globalPlayer;
    if (!player) {
      return;
    }
    const normalized = Math.max(0, Math.min(1, Number(value) || 0));
    if (player.audio) {
      player.audio.volume = normalized;
    }
    if (player.volume) {
      player.volume.value = String(normalized);
      player.volume.style.setProperty(
        "--volume-fill",
        Math.round(normalized * 100) + "%",
      );
    }
    if (normalized > 0) {
      player.lastVolume = normalized;
    }
    if (persist) {
      this.setStoredPlayerVolume(normalized);
    }
    this.updateGlobalPlayerVolumeState();
  }

  setGlobalLoopState(enabled, persist = true) {
    const player = this.globalPlayer;
    if (!player) {
      return;
    }
    player.loop = !!enabled;
    if (player.audio) {
      player.audio.loop = player.loop;
    }
    if (persist) {
      this.setStoredPlayerLoop(player.loop);
    }
    this.updateGlobalPlayerLoopState();
  }

  toggleGlobalLoop() {
    this.setGlobalLoopState(!this.globalPlayer.loop, true);
  }

  updateGlobalPlayerLoopState() {
    const player = this.globalPlayer;
    if (!player || !player.loopBtn) {
      return;
    }
    player.loopBtn.classList.toggle("is-active", !!player.loop);
  }

  updateGlobalPlayerVolumeState() {
    const player = this.globalPlayer;
    if (!player || !player.volumeBtn || !player.audio) {
      return;
    }
    player.volumeBtn.classList.toggle("is-muted", player.audio.volume <= 0.01);
  }

  setGlobalPlayerSeekFill(value) {
    const player = this.globalPlayer;
    if (!player || !player.seek) {
      return;
    }
    const raw = parseFloat(value);
    const percent = Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : 0;
    player.seek.style.setProperty("--seek-fill", percent + "%");
  }

  updateGlobalPlayerTime() {
    const player = this.globalPlayer;
    if (!player || !player.audio) {
      return;
    }
    const current = this.formatDuration(player.audio.currentTime || 0);
    const total = this.formatDuration(player.audio.duration || 0);
    if (player.timeLabel) {
      player.timeLabel.textContent = `${current} / ${total}`;
    }
    if (player.seek && !player.seeking && player.audio.duration) {
      player.seek.value = (
        (player.audio.currentTime / player.audio.duration) *
        100
      ).toFixed(1);
      this.setGlobalPlayerSeekFill(player.seek.value);
    }
    if (player.seek && !player.audio.duration && !player.seeking) {
      player.seek.value = "0";
      this.setGlobalPlayerSeekFill(0);
    }
  }

  updateGlobalPlayerNav() {
    const player = this.globalPlayer;
    if (!player) {
      return;
    }
    const hasPrev = player.index > 0;
    const hasNext =
      player.index >= 0 && player.index < player.playlist.length - 1;
    if (player.prevBtn) {
      player.prevBtn.disabled = !hasPrev;
    }
    if (player.nextBtn) {
      player.nextBtn.disabled = !hasNext;
    }
  }

  setGlobalTilePlaying(messageId) {
    const player = this.globalPlayer;
    if (!player || !player.tiles) {
      return;
    }
    player.tiles.forEach((tile, id) => {
      if (!tile) {
        return;
      }
      const isActive = id === messageId && !!messageId;
      tile.classList.toggle("is-playing", isActive);
      const btn = tile.querySelector(".audio-tile-play");
      if (btn) {
        btn.innerHTML = isActive
          ? this.iconHtml("pause")
          : this.iconHtml("play");
      }
    });
  }

  buildGlobalEntry(message, meta, blob) {
    if (!message || !blob) {
      return null;
    }
    const isVoice = message.message_type === "voice";
    const fallback =
      meta && meta.name
        ? this.parseAudioMetaFromName(meta.name)
        : { title: "", artist: "" };
    const title = isVoice
      ? "Voice message"
      : meta && meta.title
        ? meta.title
        : fallback.title || meta.name || "Audio";
    let artist = "";
    if (!isVoice) {
      artist = meta && meta.artist ? meta.artist : fallback.artist || "";
    } else {
      artist =
        message.username || (message.sender_id === this.userId ? "You" : "");
    }
    return {
      messageId: message.message_id,
      blob: blob,
      type: message.message_type,
      title: title,
      artist: artist,
    };
  }

  buildAudioTile(message, meta, blob) {
    const isVoice = message.message_type === "voice";
    const tile = document.createElement("div");
    tile.className = isVoice
      ? "audio-tile voice-tile"
      : "audio-tile music-tile";

    const playBtn = document.createElement("button");
    playBtn.className = "btn btn-icon audio-tile-play";
    playBtn.type = "button";
    playBtn.innerHTML = this.iconHtml("play");

    const info = document.createElement("div");
    info.className = "audio-tile-info";

    const title = document.createElement("div");
    title.className = "audio-tile-title";
    const artist = document.createElement("div");
    artist.className = "audio-tile-artist";

    if (isVoice) {
      title.textContent = "Voice message";
      artist.textContent =
        message.username || (message.sender_id === this.userId ? "You" : "");
    } else {
      const fallback =
        meta && meta.name
          ? this.parseAudioMetaFromName(meta.name)
          : { title: "", artist: "" };
      title.textContent =
        meta && meta.title
          ? meta.title
          : fallback.title || meta.name || "Audio";
      artist.textContent =
        meta && meta.artist ? meta.artist : fallback.artist || "";
    }

    info.appendChild(title);
    info.appendChild(artist);

    tile.appendChild(playBtn);
    tile.appendChild(info);

    const handlePlay = (event) => {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      this.playGlobalFromMessage(message, meta, blob);
    };
    playBtn.addEventListener("click", handlePlay);
    tile.addEventListener("click", handlePlay);

    return tile;
  }

  async buildGlobalPlaylist(currentMessageId) {
    const list = [];
    const messages = Array.from(this.messageCache.values())
      .filter(
        (msg) =>
          msg && (msg.message_type === "audio" || msg.message_type === "voice"),
      )
      .sort((a, b) => {
        const aId = parseInt(a.message_id, 10) || 0;
        const bId = parseInt(b.message_id, 10) || 0;
        return aId - bId;
      });
    for (const msg of messages) {
      let blob = null;
      const handler = this.mediaDownloadHandlers.get(msg.message_id);
      if (handler && handler.getBlob) {
        blob = handler.getBlob();
      }
      if (!blob && this.mediaStore) {
        const mediaId = await this.resolveMediaIdForMessage(
          msg,
          msg._meta || null,
        );
        if (mediaId) {
          const cached = await this.mediaStore.getMediaBlob(mediaId);
          if (cached && cached.blob) {
            blob = cached.blob;
          }
        }
      }
      if (!blob) {
        continue;
      }
      const entry = this.buildGlobalEntry(msg, msg._meta || {}, blob);
      if (entry) {
        list.push(entry);
      }
    }
    return list;
  }

  async playGlobalFromMessage(message, meta, blob) {
    if (!message || !blob) {
      return;
    }
    this.ensureGlobalPlayer();
    if (
      this.globalPlayer &&
      this.globalPlayer.entry &&
      this.globalPlayer.entry.messageId === message.message_id
    ) {
      this.toggleGlobalPlayback();
      return;
    }
    const entry = this.buildGlobalEntry(message, meta || {}, blob);
    if (!entry) {
      return;
    }
    const playlist = await this.buildGlobalPlaylist(message.message_id);
    await this.playGlobalEntry(entry, playlist);
  }

  async playGlobalEntry(entry, playlist) {
    if (!entry || !entry.blob) {
      return;
    }
    const player = this.globalPlayer;
    if (!player || !player.audio) {
      return;
    }
    if (Array.isArray(playlist) && playlist.length) {
      const listCopy = playlist.slice();
      let idx = listCopy.findIndex(
        (item) => item.messageId === entry.messageId,
      );
      if (idx < 0) {
        listCopy.push(entry);
        idx = listCopy.length - 1;
      }
      player.playlist = listCopy;
      player.index = idx;
    } else {
      const idx = player.playlist.findIndex(
        (item) => item.messageId === entry.messageId,
      );
      if (idx >= 0) {
        player.playlist[idx] = entry;
        player.index = idx;
      } else {
        player.playlist.push(entry);
        player.index = player.playlist.length - 1;
      }
    }
    player.entry = entry;
    if (player.url) {
      URL.revokeObjectURL(player.url);
    }
    player.url = URL.createObjectURL(entry.blob);
    player.audio.src = player.url;
    player.seeking = false;
    if (player.title) {
      player.title.textContent = entry.title || "Audio";
    }
    if (player.artist) {
      player.artist.textContent = entry.artist || "";
    }
    if (player.container) {
      player.container.style.display = "flex";
    }
    this.updateGlobalPlayerTime();
    player.audio.play().catch(() => {});
    this.updateGlobalPlayerState();
  }

  playPrevGlobal() {
    const player = this.globalPlayer;
    if (!player || player.index <= 0) {
      return;
    }
    const entry = player.playlist[player.index - 1];
    if (entry) {
      this.playGlobalEntry(entry, player.playlist);
    }
  }

  playNextGlobal() {
    const player = this.globalPlayer;
    if (
      !player ||
      player.index < 0 ||
      player.index >= player.playlist.length - 1
    ) {
      return;
    }
    const entry = player.playlist[player.index + 1];
    if (entry) {
      this.playGlobalEntry(entry, player.playlist);
    }
  }

  stopGlobalPlayer() {
    const player = this.globalPlayer;
    if (!player || !player.audio) {
      return;
    }
    player.audio.pause();
    player.audio.currentTime = 0;
    if (player.url) {
      URL.revokeObjectURL(player.url);
    }
    player.url = null;
    player.entry = null;
    player.index = -1;
    player.playlist = [];
    player.seeking = false;
    if (player.container) {
      player.container.style.display = "none";
    }
    if (player.timeLabel) {
      player.timeLabel.textContent = "0:00 / 0:00";
    }
    if (player.seek) {
      player.seek.value = "0";
    }
    this.setGlobalTilePlaying(null);
  }

  async blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result === "string") {
          const parts = result.split(",");
          resolve(parts[1] || "");
          return;
        }
        resolve("");
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  base64ToBlob(base64, mime) {
    if (!base64) {
      return null;
    }
    let data = base64;
    let type = mime || "image/jpeg";
    if (base64.startsWith("data:")) {
      const parts = base64.split(",");
      if (parts.length > 1) {
        data = parts[1];
      }
      const match = base64.match(/^data:([^;]+);base64,/);
      if (match && match[1]) {
        type = match[1];
      }
    }
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: type });
  }

  async buildInlineThumbnail(file, messageType) {
    if (
      !file ||
      (messageType !== "image" &&
        messageType !== "video" &&
        messageType !== "video_note")
    ) {
      return null;
    }
    try {
      let thumb = null;
      if (messageType === "image") {
        thumb = await this.createImageThumbnail(file);
      } else {
        thumb = await this.createVideoThumbnail(file);
      }
      if (!thumb) {
        return null;
      }
      const base64 = await this.blobToBase64(thumb);
      return {
        blob: thumb,
        base64: base64,
        mime: thumb.type || "image/jpeg",
        size: thumb.size,
      };
    } catch (err) {
      return null;
    }
  }

  async getImageDimensions(file) {
    if (!file) {
      return { width: 0, height: 0 };
    }
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const width = img.naturalWidth || img.width || 0;
        const height = img.naturalHeight || img.height || 0;
        URL.revokeObjectURL(url);
        resolve({ width, height });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({ width: 0, height: 0 });
      };
      img.src = url;
    });
  }

  async storeMediaThumb(mediaId, thumb, meta, kind) {
    if (!this.mediaStore || !mediaId || !thumb) {
      return;
    }
    const limit = this.getCacheLimitBytes();
    if (limit === 0) {
      return;
    }
    try {
      await this.mediaStore.saveThumb(mediaId, {
        blob: thumb,
        size: thumb.size,
        mime: thumb.type || (meta ? meta.thumb_mime : "") || "image/jpeg",
        kind: kind || "thumb",
      });
      await this.mediaStore.enforceCacheLimit(limit);
    } catch (err) {
      console.error("Failed to save thumbnail", err);
    }
  }

  async resolveThumbBlob(mediaId, meta) {
    let thumbBlob = null;
    if (meta && meta.thumb) {
      try {
        thumbBlob = this.base64ToBlob(meta.thumb, meta.thumb_mime);
      } catch (err) {
        thumbBlob = null;
      }
    }
    if (thumbBlob) {
      if (!this.isContentProtected()) {
        await this.storeMediaThumb(mediaId, thumbBlob, meta, "thumb");
      }
      return thumbBlob;
    }
    if (!this.mediaStore || !mediaId) {
      return null;
    }
    try {
      const cached = await this.mediaStore.getThumb(mediaId);
      if (cached && cached.blob) {
        await this.mediaStore.touchThumb(mediaId);
        return cached.blob;
      }
    } catch (err) {
      console.error("Failed to load thumbnail", err);
    }
    return null;
  }

  async handleSend() {
    await this.ready;
    if (!this.currentChat || !this.elements.messageInput) {
      return;
    }
    const conversation = this.getCurrentConversation();
    if (conversation) {
      if (conversation.type === "group") {
        const perms = this.getGroupPermissionsFromConversation(conversation);
        if (!perms.can_send_messages && !this.pendingAttachment) {
          this.showToast("You cannot send messages in this group");
          return;
        }
        if (!perms.can_send_media && this.pendingAttachment) {
          this.showToast("You cannot send media in this group");
          return;
        }
      }
      if (conversation.type === "channel") {
        const perms = this.getChannelPermissionsFromConversation(conversation);
        if (!perms.can_post) {
          this.showToast("Only admins can post in this channel");
          return;
        }
      }
    }
    if (this.getSlowModeRemaining(this.currentChat) > 0) {
      this.updateChatInputState();
      return;
    }
    if (this.draftSaveTimer) {
      clearTimeout(this.draftSaveTimer);
      this.draftSaveTimer = null;
    }
    this.sendActivity("typing", "");
    if (this.typingStopTimer) {
      clearTimeout(this.typingStopTimer);
      this.typingStopTimer = null;
    }
    const rawText = this.elements.messageInput.value;
    const text = rawText.trim();
    if (this.pendingAttachment) {
      await this.sendPendingAttachment(text);
      this.sendActivity("typing", "");
      if (this.typingStopTimer) {
        clearTimeout(this.typingStopTimer);
        this.typingStopTimer = null;
      }
      return;
    }
    if (!text) {
      return;
    }
    if (this.editingMessage) {
      const edited = await this.submitEdit(text);
      if (edited) {
        this.rememberLastSentDraft(this.currentChat, text);
        await this.clearDraftForChat(this.currentChat);
      }
      this.sendActivity("typing", "");
      if (this.typingStopTimer) {
        clearTimeout(this.typingStopTimer);
        this.typingStopTimer = null;
      }
      return;
    }
    this.elements.messageInput.value = "";
    this.resizeComposer();
    const sent = await this.sendTextMessage(text);
    if (sent) {
      this.rememberLastSentDraft(this.currentChat, text);
      await this.clearDraftForChat(this.currentChat);
    } else {
      this.elements.messageInput.value = rawText;
      this.scheduleDraftSave(rawText);
    }
    this.sendActivity("typing", "");
    if (this.typingStopTimer) {
      clearTimeout(this.typingStopTimer);
      this.typingStopTimer = null;
    }
  }

  async sendTextMessage(text, targetChat, options) {
    await this.ready;
    const chat = targetChat || this.currentChat;
    if (!chat) {
      return;
    }
    const remaining = this.getSlowModeRemaining(chat);
    if (remaining > 0) {
      this.updateChatInputState();
      return false;
    }
    const opts = options || {};
    const hasReplyOverride = Object.prototype.hasOwnProperty.call(
      opts,
      "replyToId",
    );
    const parsedReplyOverride = Number.parseInt(opts.replyToId, 10);
    const replyToId = hasReplyOverride
      ? Number.isFinite(parsedReplyOverride)
        ? parsedReplyOverride
        : null
      : targetChat
        ? null
        : this.replyTo
          ? this.replyTo.message_id
          : null;
    const parsedReusePendingId = Number.parseInt(opts.pendingId, 10);
    const reusePendingId = Number.isFinite(parsedReusePendingId)
      ? parsedReusePendingId
      : null;
    let pendingId = null;
    let pendingMessage = null;
    if (reusePendingId !== null) {
      pendingId = reusePendingId;
      pendingMessage = this.messageCache.get(pendingId);
      if (!pendingMessage) {
        return false;
      }
      const parsed = this.extractTextPayload(text);
      pendingMessage._plaintext = parsed.text || "";
      if (parsed.forwardFrom) {
        pendingMessage._forwardFrom = parsed.forwardFrom;
      } else {
        delete pendingMessage._forwardFrom;
      }
      pendingMessage.reply_to_id = replyToId;
      pendingMessage._pending = true;
      pendingMessage._failed = false;
      pendingMessage._pending_upload = false;
      pendingMessage._upload_failed = false;
      this.pendingMessages.set(pendingId, pendingMessage);
      const pendingElement = this.messageElements.get(pendingId);
      if (pendingElement) {
        pendingElement.classList.add("pending");
        pendingElement.classList.remove("failed");
        this.updateOutgoingStatusElement(pendingElement, pendingMessage);
      }
    } else if (!targetChat) {
      pendingId = this.tempMessageId--;
      const createdAt = new Date().toISOString();
      pendingMessage = {
        message_id: pendingId,
        sender_id: this.userId,
        receiver_id:
          chat.type === "group" || chat.type === "channel"
            ? null
            : chat.type === "saved"
              ? this.userId
              : chat.id,
        group_id: chat.type === "group" ? chat.id : null,
        channel_id: chat.type === "channel" ? chat.id : null,
        message_type: "text",
        message_text: null,
        file_url: null,
        encrypted_content: null,
        key_sender: null,
        key_recipient: null,
        created_at: createdAt,
        updated_at: null,
        reply_to_id: replyToId,
        delivered_at: null,
        read_at: null,
        username: this.userName,
        profile_pic: null,
      };
      const parsed = this.extractTextPayload(text);
      pendingMessage._plaintext = parsed.text || "";
      if (parsed.forwardFrom) {
        pendingMessage._forwardFrom = parsed.forwardFrom;
      }
      pendingMessage._pending = true;
      this.pendingMessages.set(pendingId, pendingMessage);
      await this.appendMessages([pendingMessage]);
      await this.waitFrame();
      this.clearReply();
    }

    const payload = {
      messageType: "text",
      encryptedContent: null,
      replyToId: replyToId,
    };
    const mentionIds = await this.getMentionsForText(text, chat);
    if (mentionIds && mentionIds.length) {
      payload.mentions = mentionIds;
    }
    if (pendingMessage && mentionIds && mentionIds.length) {
      pendingMessage.mentions = mentionIds;
      const pendingElement = this.messageElements.get(pendingId);
      if (pendingElement) {
        const textEl = pendingElement.querySelector(".message-text");
        if (textEl) {
          this.renderMessageText(textEl, pendingMessage, this.chatSearch.query);
        }
      }
    }
    const contentHash = await this.computeContentHash(text);
    if (contentHash) {
      payload.contentHash = contentHash;
    }
    if (opts.origin) {
      payload.origin = opts.origin;
    }
    payload.message_text = text;
    payload.messageText = text;
    payload.text = text;
    if (chat.type === "group") {
      payload.groupId = chat.id;
    } else if (chat.type === "channel") {
      payload.channelId = chat.id;
    } else {
      const recipientId = chat.type === "saved" ? this.userId : chat.id;
      payload.receiverId = recipientId;
      payload.recipientId = recipientId;
    }

    if (pendingMessage) {
      pendingMessage.message_text = text;
      pendingMessage._plaintext = text;
    }
    try {
      const res = await window.ApiClient.fetch("send_message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        if (!targetChat && pendingId !== null) {
          await this.promotePendingMessage(pendingId, data.message_id);
        }
        const activeTarget = targetChat || chat;
        if (activeTarget) {
          const conv = this.getConversation(activeTarget.id, activeTarget.type);
          if (conv) {
            conv.message_id = data.message_id;
            conv.message_type = "text";
            conv.message_text = text;
            conv.text = text;
            conv.last_message = text;
            conv.preview_plaintext = text;
            conv.message_date = new Date().toISOString();
            this.reorderConversationToTop(conv);
          } else {
            this.loadConversations();
          }
        }
        return true;
      } else {
        this.logE2EE("send_error", {
          chat_type: chat.type,
          recipient_id: payload.recipientId || null,
          group_id: payload.groupId || null,
          channel_id: payload.channelId || null,
          message: data.message || "send_failed",
        });
        if (!targetChat && pendingId !== null) {
          this.failPendingMessage(pendingId);
        }
        this.applyRateLimitFromResponse(data, chat);
        this.showToast(data.message || "Failed to send message");
        return false;
      }
    } catch (err) {
      if (!targetChat && pendingId !== null) {
        this.failPendingMessage(pendingId);
      }
      console.error("Send message failed", err);
      return false;
    }
  }

  resolveMaxUploadBytes() {
    const fromWindow =
      typeof window !== "undefined"
        ? parseInt(window.LC_MAX_UPLOAD_BYTES, 10)
        : NaN;
    if (Number.isFinite(fromWindow) && fromWindow > 0) {
      return fromWindow;
    }
    return 100 * 1024 * 1024;
  }

  getUploadLimitLabel() {
    const mb = Math.round(this.maxUploadBytes / (1024 * 1024));
    return `Max upload size is ${mb} MB`;
  }

  ensureUploadWithinLimit(file) {
    if (!file || !this.maxUploadBytes) {
      return true;
    }
    if (file.size > this.maxUploadBytes) {
      this.showToast(this.getUploadLimitLabel());
      return false;
    }
    return true;
  }

  async handleFileSelected(event) {
    await this.ready;
    const files = Array.from(event.target.files || []);
    if (!files.length) {
      return;
    }
    if (files.length > 1) {
      const images = files.filter(
        (file) => file && file.type && file.type.startsWith("image/"),
      );
      if (images.length >= 2 && images.length === files.length) {
        this.prepareAlbumAttachment(images);
        this.elements.fileInput.value = "";
        return;
      }
      if (images.length >= 2 && images.length !== files.length) {
        this.showToast("Albums support images only");
      }
    }
    const file = files[0];
    if (!file) {
      this.elements.fileInput.value = "";
      return;
    }
    if (!this.ensureUploadWithinLimit(file)) {
      this.elements.fileInput.value = "";
      return;
    }
    this.prepareAttachment(file);
    this.elements.fileInput.value = "";
  }

  handlePaste(event) {
    if (!event || !event.clipboardData) {
      return;
    }
    const items = Array.from(event.clipboardData.items || []);
    let imageFile = null;
    for (const item of items) {
      if (item && item.type && item.type.startsWith("image/")) {
        imageFile = item.getAsFile();
        break;
      }
    }
    if (
      !imageFile &&
      event.clipboardData.files &&
      event.clipboardData.files.length
    ) {
      const candidate = event.clipboardData.files[0];
      if (candidate && candidate.type && candidate.type.startsWith("image/")) {
        imageFile = candidate;
      }
    }
    if (!imageFile) {
      return;
    }
    const attached = this.prepareAttachment(imageFile);
    if (attached) {
      event.preventDefault();
    } else if (imageFile.size > this.maxUploadBytes) {
      event.preventDefault();
    }
  }

  prepareAttachment(file) {
    if (!file) {
      return false;
    }
    if (!this.currentChat) {
      return false;
    }
    const conversation = this.getCurrentConversation();
    if (conversation && conversation.type === "group") {
      const perms = this.getGroupPermissionsFromConversation(conversation);
      if (!perms.can_send_media) {
        this.showToast("You cannot send media in this group");
        return false;
      }
    }
    if (conversation && conversation.type === "channel") {
      const perms = this.getChannelPermissionsFromConversation(conversation);
      if (!perms.can_post) {
        this.showToast("Only admins can post in this channel");
        return false;
      }
    }
    let preparedFile = file;
    if (!file.name && typeof File !== "undefined") {
      let ext = "png";
      if (file.type && file.type.includes("jpeg")) {
        ext = "jpg";
      } else if (file.type && file.type.includes("webp")) {
        ext = "webp";
      }
      try {
        preparedFile = new File([file], `pasted-image.${ext}`, {
          type: file.type || "image/png",
        });
      } catch (err) {
        preparedFile = file;
      }
    }
    if (!this.ensureUploadWithinLimit(preparedFile)) {
      return false;
    }
    let messageType = "file";
    if (preparedFile.type && preparedFile.type.startsWith("image/")) {
      messageType = "image";
    } else if (preparedFile.type && preparedFile.type.startsWith("audio/")) {
      messageType = "audio";
    } else if (preparedFile.type && preparedFile.type.startsWith("video/")) {
      messageType = "video";
    }
    this.pendingAttachment = { file: preparedFile, messageType: messageType };
    this.renderAttachmentPreview();
    return true;
  }

  prepareAlbumAttachment(files) {
    if (!files || files.length < 2) {
      return false;
    }
    if (!this.currentChat) {
      return false;
    }
    const conversation = this.getCurrentConversation();
    if (conversation && conversation.type === "group") {
      const perms = this.getGroupPermissionsFromConversation(conversation);
      if (!perms.can_send_media) {
        this.showToast("You cannot send media in this group");
        return false;
      }
    }
    if (conversation && conversation.type === "channel") {
      const perms = this.getChannelPermissionsFromConversation(conversation);
      if (!perms.can_post) {
        this.showToast("Only admins can post in this channel");
        return false;
      }
    }
    const prepared = [];
    for (const file of files) {
      if (!file) {
        continue;
      }
      if (!this.ensureUploadWithinLimit(file)) {
        return false;
      }
      prepared.push(file);
    }
    if (prepared.length < 2) {
      return false;
    }
    this.pendingAttachment = {
      files: prepared,
      messageType: "album",
      previewUrls: [],
    };
    this.renderAttachmentPreview();
    return true;
  }

  renderAttachmentPreview() {
    if (!this.pendingAttachment || !this.elements.attachmentPreview) {
      return;
    }
    if (
      this.pendingAttachment.previewUrls &&
      this.pendingAttachment.previewUrls.length
    ) {
      this.pendingAttachment.previewUrls.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch (err) {}
      });
      this.pendingAttachment.previewUrls = [];
    }
    const isAlbum = Array.isArray(this.pendingAttachment.files);
    const file = isAlbum ? null : this.pendingAttachment.file;
    if (isAlbum) {
      const files = this.pendingAttachment.files || [];
      const totalSize = files.reduce(
        (sum, item) => sum + (item ? item.size || 0 : 0),
        0,
      );
      this.elements.attachmentName.textContent = `${files.length} photos`;
      this.elements.attachmentSize.textContent = this.formatFileSize(totalSize);
    } else if (file) {
      this.elements.attachmentName.textContent = file.name;
      this.elements.attachmentSize.textContent = this.formatFileSize(file.size);
    }
    this.elements.attachmentPreview.style.display = "flex";
    this.elements.attachmentThumb.innerHTML = "";

    if (isAlbum) {
      const files = this.pendingAttachment.files || [];
      const grid = document.createElement("div");
      grid.className = "album-preview-grid";
      files.slice(0, 4).forEach((entry) => {
        const cell = document.createElement("div");
        cell.className = "album-preview-cell";
        if (entry && entry.type && entry.type.startsWith("image/")) {
          const url = URL.createObjectURL(entry);
          this.pendingAttachment.previewUrls.push(url);
          const img = document.createElement("img");
          img.src = url;
          img.alt = "attachment";
          cell.appendChild(img);
        } else {
          cell.innerHTML = this.iconHtml("image");
        }
        grid.appendChild(cell);
      });
      if (files.length > 4) {
        const more = document.createElement("div");
        more.className = "album-preview-more";
        more.textContent = `+${files.length - 4}`;
        grid.appendChild(more);
      }
      this.elements.attachmentThumb.appendChild(grid);
      return;
    }

    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => {
        this.elements.attachmentThumb.innerHTML =
          '<img src="' + reader.result + '" alt="attachment">';
      };
      reader.readAsDataURL(file);
    } else {
      this.elements.attachmentThumb.innerHTML = this.iconHtml("paperclip");
    }
  }

  clearAttachment() {
    if (
      this.pendingAttachment &&
      Array.isArray(this.pendingAttachment.previewUrls)
    ) {
      this.pendingAttachment.previewUrls.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch (err) {}
      });
    }
    this.pendingAttachment = null;
    if (this.elements.attachmentPreview) {
      this.elements.attachmentPreview.style.display = "none";
    }
    if (this.elements.attachmentThumb) {
      this.elements.attachmentThumb.innerHTML = "";
    }
  }

  async sendPendingAttachment(caption) {
    if (!this.pendingAttachment) {
      return;
    }
    const pending = this.pendingAttachment;
    const meta = {};
    if (caption) {
      meta.caption = caption;
    }
    if (pending.messageType === "album" && Array.isArray(pending.files)) {
      this.sendAlbumMessage(pending.files, caption || "", null, null).catch(
        () => {
          this.showToast("Album upload failed");
        },
      );
    } else {
      this.sendFileMessage(pending.file, pending.messageType, meta).catch(
        () => {
          this.showToast("Upload failed");
        },
      );
    }
    this.clearAttachment();
    if (this.elements.messageInput) {
      this.elements.messageInput.value = "";
      this.resizeComposer();
    }
  }

  async sendFileMessage(file, messageType, extraMeta, targetChat, options) {
    await this.ready;
    const chat = targetChat || this.currentChat;
    if (!chat || !file) {
      return;
    }
    const remaining = this.getSlowModeRemaining(chat);
    if (remaining > 0) {
      this.updateChatInputState();
      return false;
    }
    if (!this.ensureUploadWithinLimit(file)) {
      return;
    }
    const opts = options || {};
    const replyToId = targetChat
      ? null
      : this.replyTo
        ? this.replyTo.message_id
        : null;
    const metaExtras = Object.assign({}, extraMeta || {});
    const needsMediaId =
      messageType === "image" ||
      messageType === "video" ||
      messageType === "video_note" ||
      messageType === "audio" ||
      messageType === "voice" ||
      messageType === "file";
    const mediaId = needsMediaId
      ? metaExtras.media_id || this.generateMediaId()
      : null;
    if (messageType === "audio" && (!metaExtras.title || !metaExtras.artist)) {
      const audioMeta = await this.extractAudioMetadata(file);
      if (audioMeta.title && !metaExtras.title) {
        metaExtras.title = audioMeta.title;
      }
      if (audioMeta.artist && !metaExtras.artist) {
        metaExtras.artist = audioMeta.artist;
      }
    }
    let inlineThumb = null;
    if (mediaId) {
      inlineThumb = await this.buildInlineThumbnail(file, messageType);
      if (inlineThumb && inlineThumb.base64 && inlineThumb.size <= 180 * 1024) {
        metaExtras.thumb = inlineThumb.base64;
        metaExtras.thumb_mime = inlineThumb.mime;
      }
      metaExtras.media_id = mediaId;
    }
    if (metaExtras.fileIv) {
      delete metaExtras.fileIv;
    }
    const baseMeta = Object.assign(
      {
        name: file.name,
        size: file.size,
        mime: file.type || "application/octet-stream",
        type: messageType,
      },
      metaExtras,
    );

    let pendingId = null;
    let pendingMessage = null;
    if (!targetChat) {
      pendingId = this.tempMessageId--;
      const createdAt = new Date().toISOString();
      pendingMessage = {
        message_id: pendingId,
        sender_id: this.userId,
        receiver_id:
          chat.type === "group" || chat.type === "channel"
            ? null
            : chat.type === "saved"
              ? this.userId
              : chat.id,
        group_id: chat.type === "group" ? chat.id : null,
        channel_id: chat.type === "channel" ? chat.id : null,
        message_type: messageType,
        message_text: null,
        file_url: null,
        encrypted_content: null,
        key_sender: null,
        key_recipient: null,
        created_at: createdAt,
        updated_at: null,
        reply_to_id: replyToId,
        delivered_at: null,
        read_at: null,
        username: this.userName,
        profile_pic: null,
      };
      pendingMessage._meta = baseMeta;
      pendingMessage._localBlob = file;
      pendingMessage._pending = true;
      pendingMessage._pending_upload = true;
      pendingMessage._uploadProgress = 0;
      pendingMessage._uploadStage = "Encrypting";
      this.pendingMessages.set(pendingId, pendingMessage);
      await this.appendMessages([pendingMessage]);
      await this.waitFrame();
      this.clearReply();
      this.updateUploadProgress(pendingId, 0, "Encrypting");
    }

    const task = {
      id:
        pendingId ||
        `upload_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      file: file,
      messageType: messageType,
      chat: chat,
      replyToId: replyToId,
      opts: opts,
      metaExtras: metaExtras,
      baseMeta: baseMeta,
      inlineThumb: inlineThumb,
      mediaId: mediaId,
      pendingId: pendingId,
    };
    if (pendingId) {
      this.uploadTasks.set(pendingId, task);
    }
    this.processFileUpload(task).catch((err) => {
      console.error("File upload failed", err);
      if (pendingId) {
        this.markUploadFailed(pendingId);
      }
    });
    return pendingId;
  }

  async sendAlbumMessage(files, caption, targetChat, options) {
    await this.ready;
    const chat = targetChat || this.currentChat;
    if (!chat || !Array.isArray(files) || files.length < 2) {
      return;
    }
    const remaining = this.getSlowModeRemaining(chat);
    if (remaining > 0) {
      this.updateChatInputState();
      return false;
    }
    const imageFiles = files.filter(
      (file) => file && file.type && file.type.startsWith("image/"),
    );
    if (imageFiles.length < 2) {
      this.showToast("Select at least two photos");
      return;
    }
    if (!targetChat) {
      const conversation = this.getCurrentConversation();
      if (conversation && conversation.type === "group") {
        const perms = this.getGroupPermissionsFromConversation(conversation);
        if (!perms.can_send_media) {
          this.showToast("You cannot send media in this group");
          return;
        }
      }
      if (conversation && conversation.type === "channel") {
        const perms = this.getChannelPermissionsFromConversation(conversation);
        if (!perms.can_post) {
          this.showToast("Only admins can post in this channel");
          return;
        }
      }
    }
    const opts = options || {};
    const replyToId = targetChat
      ? null
      : this.replyTo
        ? this.replyTo.message_id
        : null;

    let pendingId = null;
    let pendingMessage = null;
    if (!targetChat) {
      pendingId = this.tempMessageId--;
      const createdAt = new Date().toISOString();
      pendingMessage = {
        message_id: pendingId,
        sender_id: this.userId,
        receiver_id:
          chat.type === "group" || chat.type === "channel"
            ? null
            : chat.type === "saved"
              ? this.userId
              : chat.id,
        group_id: chat.type === "group" ? chat.id : null,
        channel_id: chat.type === "channel" ? chat.id : null,
        message_type: "album",
        message_text: null,
        file_url: null,
        encrypted_content: null,
        key_sender: null,
        key_recipient: null,
        created_at: createdAt,
        updated_at: null,
        reply_to_id: replyToId,
        delivered_at: null,
        read_at: null,
        username: this.userName,
        profile_pic: null,
      };
      pendingMessage._meta = {
        type: "album",
        caption: caption || "",
        items: [],
      };
      pendingMessage._albumFiles = imageFiles.slice();
      pendingMessage._pending = true;
      pendingMessage._pending_upload = true;
      pendingMessage._uploadProgress = 0;
      pendingMessage._uploadStage = "Encrypting";
      this.pendingMessages.set(pendingId, pendingMessage);
      await this.appendMessages([pendingMessage]);
      await this.waitFrame();
      this.clearReply();
      this.updateUploadProgress(pendingId, 0, "Encrypting");
    }

    const task = {
      id:
        pendingId ||
        `album_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      files: imageFiles,
      caption: caption || "",
      chat: chat,
      replyToId: replyToId,
      opts: opts,
      pendingId: pendingId,
    };
    if (pendingId) {
      this.uploadTasks.set(pendingId, task);
    }
    this.processAlbumUpload(task).catch(() => {
      if (pendingId) {
        this.markUploadFailed(pendingId);
      }
    });
    return pendingId;
  }

  async processFileUpload(task) {
    if (!task || !task.file || !task.chat) {
      return;
    }
    const file = task.file;
    const chat = task.chat;
    const messageType = task.messageType;
    const pendingId = task.pendingId;
    const replyToId = task.replyToId;
    const metaExtras = Object.assign({}, task.metaExtras || {});
    const inlineThumb = task.inlineThumb || null;
    const mediaId = task.mediaId || null;

    const uploadAction = messageType === "image" ? "upload_photo" : (messageType === "video" ? "upload_video" : "upload_file");
    this.sendActivity(uploadAction, "1");
    if (pendingId) {
      this.updateUploadProgress(pendingId, 0, "Encrypting");
    }

    const meta = Object.assign(
      {
        name: file.name,
        size: file.size,
        mime: file.type || "application/octet-stream",
        type: messageType,
      },
      metaExtras,
    );

    if (pendingId) {
      const pending = this.messageCache.get(pendingId);
      if (pending) {
        pending._meta = meta;
      }
    }

    let uploadResponse = null;
    try {
      if (pendingId) {
        this.updateUploadProgress(pendingId, 0, "Uploading");
      }
      uploadResponse = await this.uploadEncryptedFile(
        file,
        file.name,
        (percent) => {
          if (pendingId) {
            this.updateUploadProgress(pendingId, percent, "Uploading");
          }
          if (Date.now() - (this._lastUploadActivitySent || 0) > 800 || percent === 100) {
            this._lastUploadActivitySent = Date.now();
            this.sendActivity(uploadAction, `${percent}%`);
          }
        },
        messageType,
      );
    } catch (err) {
      if (pendingId) {
        this.markUploadFailed(pendingId);
      }
      const message = err && err.message ? err.message : "Upload failed";
      this.showToast(message);
      return;
    }

    this.sendActivity(uploadAction, "");

    const payload = {
      messageType: messageType,
      messageText: meta.caption || "",
      text: meta.caption || "",
      replyToId: replyToId,
      fileUrl: uploadResponse.file_url || uploadResponse.fileUrl || uploadResponse.url,
    };
    if (meta.caption) {
      const captionMentions = await this.getMentionsForText(meta.caption, chat);
      if (captionMentions && captionMentions.length) {
        payload.mentions = captionMentions;
      }
      if (pendingId && captionMentions && captionMentions.length) {
        const pending = this.messageCache.get(pendingId);
        if (pending) {
          pending.mentions = captionMentions;
          const pendingElement = this.messageElements.get(pendingId);
          if (pendingElement) {
            pendingElement
              .querySelectorAll(".file-caption")
              .forEach((caption) => {
                this.renderCaptionText(
                  caption,
                  meta.caption,
                  pending,
                  this.chatSearch.query,
                );
              });
          }
        }
      }
    }
    if (task.opts && task.opts.origin) {
      payload.origin = task.opts.origin;
    }

    if (chat.type === "group") {
      payload.groupId = chat.id;
    } else if (chat.type === "channel") {
      payload.channelId = chat.id;
    } else {
      const recipientId = chat.type === "saved" ? this.userId : chat.id;
      payload.receiverId = recipientId;
      payload.recipientId = recipientId;
    }
    try {
      const res = await window.ApiClient.fetch("send_message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        const createdAt = new Date().toISOString();
        const messageId = data.message_id;
        if (pendingId && messageId) {
          const outgoing = this.messageCache.get(pendingId) || {};
          outgoing.message_id = pendingId;
          outgoing.sender_id = this.userId;
          outgoing.receiver_id =
            chat.type === "group" || chat.type === "channel"
              ? null
              : chat.type === "saved"
                ? this.userId
                : chat.id;
          outgoing.group_id = chat.type === "group" ? chat.id : null;
          outgoing.channel_id = chat.type === "channel" ? chat.id : null;
          outgoing.message_type = messageType;
          outgoing.message_text = null;
          outgoing.file_url = uploadResponse.file_url;
          outgoing.encrypted_content = payload.encryptedContent;
          outgoing.key_sender = payload.keySender || null;
          outgoing.key_recipient = payload.keyRecipient || null;
          outgoing.created_at = createdAt;
          outgoing.updated_at = null;
          outgoing.reply_to_id = replyToId;
          outgoing.delivered_at = null;
          outgoing.read_at = null;
          outgoing.username = this.userName;
          outgoing.profile_pic = null;
          outgoing._meta = meta;
          outgoing._plaintext = JSON.stringify(meta);
          outgoing._localBlob = file;
          if (
            (chat.type === "group" || chat.type === "channel") &&
            Array.isArray(payload.messageKeys)
          ) {
            const entry = payload.messageKeys.find(
              (item) => item.userId === this.userId,
            );
            if (entry) {
              outgoing.key_for_user = entry.wrappedKey;
            }
          }
          this.messageCache.set(pendingId, outgoing);
          await this.promotePendingMessage(pendingId, messageId);
          await this.cacheUploadedMedia(
            Object.assign({}, outgoing, { message_id: messageId }),
            file,
            mediaId,
            inlineThumb,
          );
          this.uploadTasks.delete(pendingId);
        } else if (!task.pendingId && messageId) {
          if (this.mediaStore && mediaId) {
            const chatKey = this.getChatKeyFromChat(chat);
            this.mediaStore
              .saveMediaRef(messageId, mediaId, chatKey, messageType)
              .catch(() => {});
          }
          await this.cacheUploadedMedia(
            {
              message_id: messageId,
              message_type: messageType,
            },
            file,
            mediaId,
            inlineThumb,
          );
        }
        if (meta && typeof meta.caption === "string" && meta.caption.trim()) {
          this.rememberLastSentDraft(chat, meta.caption);
        }
        await this.clearDraftForChat(chat);
      } else {
        this.logE2EE("send_error", {
          chat_type: chat.type,
          recipient_id: payload.recipientId || null,
          group_id: payload.groupId || null,
          channel_id: payload.channelId || null,
          message: data.message || "send_failed",
        });
        if (pendingId) {
          this.markUploadFailed(pendingId);
        }
        this.applyRateLimitFromResponse(data, chat);
        this.showToast(data.message || "Failed to send file");
      }
    } catch (err) {
      if (pendingId) {
        this.markUploadFailed(pendingId);
      }
      console.error("File send failed", err);
    }
  }

  async cacheUploadedMedia(message, file, mediaId, thumbInfo) {
    if (!message || !file || !mediaId) {
      return;
    }
    const isOwner =
      message.sender_id === this.userId ||
      message._pending ||
      message._pending_upload;
    if (!this.mediaStore || (this.isContentProtected() && !isOwner)) {
      return;
    }
    try {
      await this.mediaStore.saveMediaBlob(mediaId, {
        blob: file,
        size: file.size,
        mime: file.type || "application/octet-stream",
        source: "upload",
      });
      const chatKey =
        this.getChatKeyForMessage(message) ||
        this.getChatKeyFromChat(this.currentChat);
      await this.mediaStore.saveMediaRef(
        message.message_id,
        mediaId,
        chatKey,
        message.message_type,
      );
      if (thumbInfo && thumbInfo.blob) {
        await this.storeMediaThumb(mediaId, thumbInfo.blob, message._meta);
      }
      this.syncMediaRefForMessage(message, mediaId);
    } catch (err) {
      console.error("Failed to cache uploaded media", err);
    }
    const handler = this.mediaDownloadHandlers.get(message.message_id);
    if (handler && handler.markAvailable) {
      handler.markAvailable(file, message._meta);
    }
  }

  async uploadEncryptedFile(blob, name, onProgress, fileType) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", window.ApiClient.uploadUrl());
      xhr.responseType = "json";
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable && typeof onProgress === "function") {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      });
      xhr.onload = () => {
        const resp = xhr.response || {};
        if (xhr.status >= 200 && xhr.status < 300) {
          if (resp && resp.success === false) {
            reject(new Error(resp.message || resp.error || "Upload failed"));
            return;
          }
          if (resp && !resp.file_url && !resp.fileUrl) {
            reject(new Error(resp.message || resp.error || "Upload returned invalid file URL"));
            return;
          }
          resolve(resp);
        } else {
          const message = resp.error || resp.message || ("Upload failed (" + xhr.status + ")");
          reject(new Error(message));
        }
      };
      xhr.onerror = () => reject(new Error("Upload failed"));
      const formData = new FormData();
      formData.append("file", blob, name);
      formData.append("file_type", fileType || "file");
      xhr.send(formData);
    });
  }

  showUploadProgress(percent, text) {
    if (!this.elements.uploadProgress) {
      return;
    }
    this.elements.uploadProgress.style.display = "flex";
    this.elements.uploadProgressBar.style.width = percent + "%";
    this.elements.uploadProgressText.textContent = text + " " + percent + "%";
  }

  hideUploadProgress() {
    if (!this.elements.uploadProgress) {
      return;
    }
    this.elements.uploadProgress.style.display = "none";
    this.elements.uploadProgressBar.style.width = "0%";
    this.elements.uploadProgressText.textContent = "";
  }

  async toggleRecording() {
    if (this.recordingState.active) {
      this.stopRecording(true);
      return;
    }
    await this.startRecording();
  }

  async startRecording() {
    if (this.recordingState.active) {
      return;
    }
    this.setRecorderToggle("voice");
    if (this.videoNoteState.active) {
      this.stopVideoNoteRecording(true);
    } else if (this.videoNoteState.previewBlob) {
      this.cleanupVideoNotePreview();
      this.showVideoNoteUI(null);
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      this.recordingState = {
        active: true,
        recorder: recorder,
        chunks: [],
        startedAt: Date.now(),
        elapsedMs: 0,
        paused: false,
        timer: null,
        stream: stream,
        sendOnStop: true,
      };
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.recordingState.chunks.push(event.data);
        }
      };
      recorder.onstop = async () => {
        const shouldSend = !!this.recordingState.sendOnStop;
        const elapsed = this.getRecordingElapsedMs();
        const chunks = this.recordingState.chunks.slice();
        this.finalizeRecordingState();
        if (!shouldSend || !chunks.length) {
          return;
        }
        const blob = new Blob(chunks, { type: "audio/webm" });
        const duration = Math.max(1, Math.round(elapsed / 1000));
        await this.sendFileMessage(blob, "voice", {
          duration: duration,
          mime: "audio/webm",
        });
      };
      recorder.start();
      this.startRecordingWaveform(stream);
      this.showRecordingUI(true);
      this.updateRecordingUI();
      this.startRecordingTimer();
      this.sendActivity("record_voice", "1");
    } catch (err) {
      console.error("Recording failed", err);
      this.showToast("Microphone access failed");
    }
  }

  toggleRecordingPause() {
    if (!this.recordingState.active || !this.recordingState.recorder) {
      return;
    }
    const recorder = this.recordingState.recorder;
    if (this.recordingState.paused) {
      if (recorder.state === "paused") {
        recorder.resume();
      }
      if (
        this.recordingState.audioContext &&
        this.recordingState.audioContext.state === "suspended"
      ) {
        this.recordingState.audioContext.resume().catch(() => {});
      }
      this.recordingState.paused = false;
      this.recordingState.startedAt = Date.now();
    } else {
      if (recorder.state === "recording") {
        recorder.pause();
      }
      if (
        this.recordingState.audioContext &&
        this.recordingState.audioContext.state === "running"
      ) {
        this.recordingState.audioContext.suspend().catch(() => {});
      }
      this.recordingState.elapsedMs = this.getRecordingElapsedMs();
      this.recordingState.paused = true;
    }
    this.updateRecordingUI();
  }

  stopRecording(sendRecording) {
    if (!this.recordingState.active) {
      return;
    }
    this.recordingState.sendOnStop = !!sendRecording;
    this.recordingState.active = false;
    this.showRecordingUI(false);
    this.sendActivity("record_voice", "");
    if (
      this.recordingState.recorder &&
      this.recordingState.recorder.state !== "inactive"
    ) {
      this.recordingState.recorder.stop();
    } else {
      this.finalizeRecordingState();
    }
  }

  getRecordingElapsedMs() {
    if (!this.recordingState) {
      return 0;
    }
    if (this.recordingState.paused) {
      return this.recordingState.elapsedMs || 0;
    }
    const base = this.recordingState.elapsedMs || 0;
    const activeSpan = this.recordingState.startedAt
      ? Date.now() - this.recordingState.startedAt
      : 0;
    return base + activeSpan;
  }

  startRecordingTimer() {
    if (this.recordingState.timer) {
      clearInterval(this.recordingState.timer);
    }
    this.recordingState.timer = setInterval(() => {
      this.updateRecordingUI();
    }, 250);
  }

  finalizeRecordingState() {
    this.stopRecordingWaveform();
    if (this.recordingState.timer) {
      clearInterval(this.recordingState.timer);
    }
    if (this.recordingState.stream) {
      this.recordingState.stream.getTracks().forEach((track) => track.stop());
    }
    this.recordingState.recorder = null;
    this.recordingState.stream = null;
    this.recordingState.timer = null;
    this.recordingState.chunks = [];
    this.recordingState.elapsedMs = 0;
    this.recordingState.paused = false;
    this.recordingState.audioContext = null;
    this.recordingState.analyser = null;
    this.recordingState.analyserData = null;
    this.recordingState.waveRaf = null;
    this.recordingState.waveBars = [];
  }

  startRecordingWaveform(stream) {
    if (!this.elements.voiceRecorderWave || !stream) {
      return;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      return;
    }
    try {
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.85;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      this.recordingState.audioContext = audioContext;
      this.recordingState.analyser = analyser;
      this.recordingState.analyserData = new Uint8Array(
        analyser.frequencyBinCount,
      );
      this.recordingState.waveBars = Array.from(
        this.elements.voiceRecorderWave.querySelectorAll("span"),
      );
      this.updateRecordingWaveform();
    } catch (err) {
      this.recordingState.audioContext = null;
      this.recordingState.analyser = null;
      this.recordingState.analyserData = null;
      this.recordingState.waveBars = [];
    }
  }

  updateRecordingWaveform() {
    if (
      !this.recordingState.active ||
      !this.recordingState.analyser ||
      !this.recordingState.analyserData
    ) {
      return;
    }
    const bars = this.recordingState.waveBars || [];
    if (!bars.length) {
      return;
    }
    if (this.recordingState.paused) {
      this.setWaveformIdle();
    } else {
      const data = this.recordingState.analyserData;
      this.recordingState.analyser.getByteFrequencyData(data);
      const slice = Math.max(1, Math.floor(data.length / bars.length));
      for (let i = 0; i < bars.length; i += 1) {
        let sum = 0;
        const start = i * slice;
        const end = Math.min(data.length, start + slice);
        for (let j = start; j < end; j += 1) {
          sum += data[j];
        }
        const avg = sum / Math.max(1, end - start);
        const level = avg / 255;
        const height = 24 + level * 76;
        bars[i].style.height = `${Math.round(height)}%`;
        bars[i].style.opacity = (0.4 + level * 0.6).toFixed(2);
      }
    }
    this.recordingState.waveRaf = requestAnimationFrame(() =>
      this.updateRecordingWaveform(),
    );
  }

  setWaveformIdle() {
    const bars = this.recordingState.waveBars || [];
    if (!bars.length) {
      return;
    }
    bars.forEach((bar) => {
      bar.style.height = "24%";
      bar.style.opacity = "0.35";
    });
  }

  resetWaveformBars() {
    const bars = this.recordingState.waveBars || [];
    if (!bars.length) {
      return;
    }
    bars.forEach((bar) => {
      bar.style.height = "";
      bar.style.opacity = "";
    });
  }

  stopRecordingWaveform() {
    if (this.recordingState.waveRaf) {
      cancelAnimationFrame(this.recordingState.waveRaf);
      this.recordingState.waveRaf = null;
    }
    if (this.recordingState.analyser) {
      try {
        this.recordingState.analyser.disconnect();
      } catch (err) {}
    }
    if (this.recordingState.audioContext) {
      this.recordingState.audioContext.close().catch(() => {});
    }
    this.resetWaveformBars();
  }

  updateRecordingUI() {
    if (!this.elements.voiceRecorderTime) {
      return;
    }
    const elapsed = Math.floor(this.getRecordingElapsedMs() / 1000);
    this.elements.voiceRecorderTime.textContent = this.formatDuration(elapsed);
    if (this.elements.voiceRecorder) {
      this.elements.voiceRecorder.classList.toggle(
        "is-paused",
        !!this.recordingState.paused,
      );
    }
    if (this.elements.voiceRecorderPause) {
      this.elements.voiceRecorderPause.innerHTML = this.iconHtml(
        this.recordingState.paused ? "play" : "pause",
      );
    }
  }

  showRecordingUI(active) {
    if (this.elements.voiceRecorder) {
      this.elements.voiceRecorder.style.display = active ? "flex" : "none";
      this.elements.voiceRecorder.classList.toggle("is-paused", false);
    }
    if (this.elements.voiceBtn) {
      this.elements.voiceBtn.classList.toggle("recording", active);
    }
  }

  async processAlbumUpload(task) {
    if (!task || !task.files || !task.chat) {
      return;
    }
    const files = task.files;
    const chat = task.chat;
    const pendingId = task.pendingId;
    const replyToId = task.replyToId;
    const caption = task.caption || "";
    const total = files.length;

    const uploadAction = messageType === "image" ? "upload_photo" : (messageType === "video" ? "upload_video" : "upload_file");
    this.sendActivity(uploadAction, "1");
    if (pendingId) {
      this.updateUploadProgress(pendingId, 0, "Encrypting");
    }

    let contentKey = null;
    if (chat.type === "group") {
      const members = await this.getGroupMembersWithKeys(chat.id);
      contentKey = await this.getGroupContentKey(chat.id, {
        allowCreate: true,
        distribute: true,
        members: members,
      });
      if (!contentKey) {
        if (pendingId) {
          this.markUploadFailed(pendingId);
        }
        this.showToast("Group shared key is missing.");
        return;
      }
    } else if (chat.type === "channel") {
      const members = await this.getChannelMembersWithKeys(chat.id);
      contentKey = await this.getChannelContentKey(chat.id, {
        allowCreate: true,
        distribute: true,
        members: members,
      });
      if (!contentKey) {
        if (pendingId) {
          this.markUploadFailed(pendingId);
        }
        this.showToast("Channel shared key is missing.");
        return;
      }
    } else {
      contentKey = await this.crypto.generateContentKey();
    }

    const updateProgress = (index, percent, stage) => {
      if (!pendingId) {
        return;
      }
      const normalized = Math.max(0, Math.min(100, percent || 0));
      const base = index / total;
      const pct = Math.round((base + normalized / 100 / total) * 100);
      this.updateUploadProgress(pendingId, pct, stage);
    };

    const items = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      if (!file) {
        continue;
      }
      const mediaId = this.generateMediaId();
      const dimensions = await this.getImageDimensions(file);
      const inlineThumb = await this.buildInlineThumbnail(file, "image");
      const metaItem = {
        type: "image",
        media_id: mediaId,
        name: file.name || `photo-${index + 1}.jpg`,
        size: file.size,
        mime: file.type || "image/jpeg",
        width: dimensions.width || null,
        height: dimensions.height || null,
      };
      if (inlineThumb && inlineThumb.base64 && inlineThumb.size <= 180 * 1024) {
        metaItem.thumb = inlineThumb.base64;
        metaItem.thumb_mime = inlineThumb.mime;
      }

      let uploadResponse = null;
      try {
        uploadResponse = await this.uploadEncryptedFile(
          file,
          file.name,
          (percent) => {
            updateProgress(index, percent, "Uploading");
            if (Date.now() - (this._lastUploadActivitySent || 0) > 800 || percent === 100) {
              this._lastUploadActivitySent = Date.now();
              this.sendActivity(uploadAction, `${percent}%`);
            }
          },
          "image",
        );
      } catch (err) {
        if (pendingId) {
          this.markUploadFailed(pendingId);
        }
        const message = err && err.message ? err.message : "Upload failed";
        this.showToast(message);
        this.sendActivity(uploadAction, "");
        return;
      }
      metaItem.file_url = uploadResponse.file_url || uploadResponse.fileUrl || uploadResponse.url;
      items.push(metaItem);
    }

    this.sendActivity(uploadAction, "");

    const meta = {
      type: "album",
      items: items,
    };
    if (caption) {
      meta.caption = caption;
    }

    const payload = {
      messageType: "album",
      messageText: JSON.stringify(meta),
      text: caption || "",
      replyToId: replyToId,
    };
    if (caption) {
      const captionMentions = await this.getMentionsForText(caption, chat);
      if (captionMentions && captionMentions.length) {
        payload.mentions = captionMentions;
        if (pendingId) {
          const pending = this.messageCache.get(pendingId);
          if (pending) {
            pending.mentions = captionMentions;
          }
        }
      }
    }
    if (task.opts && task.opts.origin) {
      payload.origin = task.opts.origin;
    }

    if (chat.type === "group") {
      payload.groupId = chat.id;
    } else if (chat.type === "channel") {
      payload.channelId = chat.id;
    } else {
      const recipientId = chat.type === "saved" ? this.userId : chat.id;
      payload.receiverId = recipientId;
      payload.recipientId = recipientId;
    }

    try {
      const res = await window.ApiClient.fetch("send_message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        const createdAt = new Date().toISOString();
        const messageId = data.message_id;
        if (pendingId && messageId) {
          const outgoing = this.messageCache.get(pendingId) || {};
          outgoing.message_id = pendingId;
          outgoing.sender_id = this.userId;
          outgoing.receiver_id =
            chat.type === "group" || chat.type === "channel"
              ? null
              : chat.type === "saved"
                ? this.userId
                : chat.id;
          outgoing.group_id = chat.type === "group" ? chat.id : null;
          outgoing.channel_id = chat.type === "channel" ? chat.id : null;
          outgoing.message_type = "album";
          outgoing.message_text = null;
          outgoing.file_url = null;
          outgoing.encrypted_content = payload.encryptedContent;
          outgoing.key_sender = payload.keySender || null;
          outgoing.key_recipient = payload.keyRecipient || null;
          outgoing.created_at = createdAt;
          outgoing.updated_at = null;
          outgoing.reply_to_id = replyToId;
          outgoing.delivered_at = null;
          outgoing.read_at = null;
          outgoing.username = this.userName;
          outgoing.profile_pic = null;
          outgoing._meta = meta;
          outgoing._plaintext = JSON.stringify(meta);
          outgoing._albumFiles = files.slice();
          this.messageCache.set(pendingId, outgoing);
          await this.promotePendingMessage(pendingId, messageId);
          await this.cacheUploadedAlbumMedia(
            Object.assign({}, outgoing, { message_id: messageId }),
            files,
            items,
          );
          this.uploadTasks.delete(pendingId);
        } else if (!pendingId && messageId) {
          await this.cacheUploadedAlbumMedia(
            {
              message_id: messageId,
              message_type: "album",
            },
            files,
            items,
          );
        }
        if (caption && caption.trim()) {
          this.rememberLastSentDraft(chat, caption);
        }
        await this.clearDraftForChat(chat);
      } else {
        this.logE2EE("send_error", {
          chat_type: chat.type,
          recipient_id: payload.recipientId || null,
          group_id: payload.groupId || null,
          channel_id: payload.channelId || null,
          message: data.message || "send_failed",
        });
        if (pendingId) {
          this.markUploadFailed(pendingId);
        }
        this.applyRateLimitFromResponse(data, chat);
        this.showToast(data.message || "Failed to send album");
      }
    } catch (err) {
      if (pendingId) {
        this.markUploadFailed(pendingId);
      }
      this.showToast("Album send failed");
    }
  }

  async cacheUploadedAlbumMedia(message, files, items) {
    if (!message || !Array.isArray(files) || !Array.isArray(items)) {
      return;
    }
    const isOwner =
      message.sender_id === this.userId ||
      message._pending ||
      message._pending_upload;
    if (!this.mediaStore || (this.isContentProtected() && !isOwner)) {
      return;
    }
    const chatKey =
      this.getChatKeyForMessage(message) ||
      this.getChatKeyFromChat(this.currentChat);
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const file = files[i];
      if (!item || !item.media_id || !file) {
        continue;
      }
      try {
        await this.mediaStore.saveMediaBlob(item.media_id, {
          blob: file,
          size: file.size,
          mime: item.mime || file.type || "image/jpeg",
          source: "upload",
        });
        await this.mediaStore.saveMediaRef(
          message.message_id,
          item.media_id,
          chatKey,
          "image",
        );
        if (item.thumb && item.thumb_mime) {
          try {
            const thumbBlob = this.base64ToBlob(item.thumb, item.thumb_mime);
            await this.storeMediaThumb(item.media_id, thumbBlob, item);
          } catch (err) {}
        }
      } catch (err) {
        // ignore cache failures
      }
    }
  }

  setRecorderToggle(mode) {
    const voiceBtn = this.elements.voiceBtn;
    const videoBtn = this.elements.videoNoteBtn;
    if (!voiceBtn || !videoBtn) {
      return;
    }
    const next = mode === "video" ? "video" : "voice";
    voiceBtn.classList.toggle("active", next === "voice");
    videoBtn.classList.toggle("active", next === "video");
  }

  getSupportedVideoMimeType() {
    if (
      typeof MediaRecorder === "undefined" ||
      typeof MediaRecorder.isTypeSupported !== "function"
    ) {
      return "";
    }
    const candidates = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4",
    ];
    for (const type of candidates) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return "";
  }

  toggleVideoNoteRecording() {
    if (this.videoNoteState.active) {
      this.stopVideoNoteRecording(false);
      return;
    }
    if (this.videoNoteState.previewBlob) {
      this.restartVideoNoteRecording();
      return;
    }
    this.startVideoNoteRecording();
  }

  async startVideoNoteRecording() {
    if (this.videoNoteState.active) {
      return;
    }
    if (!this.currentChat) {
      return;
    }
    this.setRecorderToggle("video");
    const conversation = this.getCurrentConversation();
    if (conversation && conversation.type === "group") {
      const perms = this.getGroupPermissionsFromConversation(conversation);
      if (!perms.can_send_media) {
        this.showToast("You cannot send media in this group");
        return;
      }
    }
    if (conversation && conversation.type === "channel") {
      const perms = this.getChannelPermissionsFromConversation(conversation);
      if (!perms.can_post) {
        this.showToast("Only admins can post in this channel");
        return;
      }
    }
    if (
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      this.showToast("Video recording not supported");
      return;
    }
    if (this.recordingState.active) {
      this.stopRecording(false);
    }
    this.cleanupVideoNotePreview();
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 640 },
          aspectRatio: 1,
        },
        audio: true,
      });
    } catch (err) {
      this.showToast("Camera access failed");
      return;
    }
    const mimeType = this.getSupportedVideoMimeType();
    let recorder = null;
    try {
      recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
    } catch (err) {
      stream.getTracks().forEach((track) => track.stop());
      this.showToast("Unable to start video recorder");
      return;
    }
    this.videoNoteState.active = true;
    this.videoNoteState.recorder = recorder;
    this.videoNoteState.chunks = [];
    this.videoNoteState.startedAt = Date.now();
    this.videoNoteState.elapsedMs = 0;
    this.videoNoteState.paused = false;
    this.videoNoteState.timer = null;
    this.videoNoteState.stream = stream;
    this.videoNoteState.mimeType =
      mimeType || recorder.mimeType || "video/webm";
    this.videoNoteState.discardOnStop = false;
    this.videoNoteState.durationSec = 0;
    if (this.elements.videoNotePause) {
      const canPause =
        typeof recorder.pause === "function" &&
        typeof recorder.resume === "function";
      this.elements.videoNotePause.style.display = canPause
        ? "inline-flex"
        : "none";
    }
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.videoNoteState.chunks.push(event.data);
      }
    };
    recorder.onstop = () => {
      const discard = this.videoNoteState.discardOnStop;
      const elapsed = this.getVideoNoteElapsedMs();
      const chunks = this.videoNoteState.chunks.slice();
      const mime = this.videoNoteState.mimeType || "video/webm";
      this.finalizeVideoNoteRecording();
      if (discard || !chunks.length) {
        this.cleanupVideoNotePreview();
        this.showVideoNoteUI(null);
        return;
      }
      const blob = new Blob(chunks, { type: mime });
      this.prepareVideoNotePreview(blob, elapsed);
    };
    recorder.start();
    if (this.elements.videoNoteVideo) {
      this.elements.videoNoteVideo.srcObject = stream;
      this.elements.videoNoteVideo.muted = true;
      this.elements.videoNoteVideo.play().catch(() => {});
    }
    this.showVideoNoteUI("recording");
    this.updateVideoNoteUI();
    this.startVideoNoteTimer();
    this.sendActivity("record_video", "1");
  }

  toggleVideoNotePause() {
    if (!this.videoNoteState.active || !this.videoNoteState.recorder) {
      return;
    }
    const recorder = this.videoNoteState.recorder;
    if (this.videoNoteState.paused) {
      if (recorder.state === "paused") {
        recorder.resume();
      }
      this.videoNoteState.paused = false;
      this.videoNoteState.startedAt = Date.now();
      if (this.elements.videoNoteVideo && this.videoNoteState.stream) {
        this.elements.videoNoteVideo.play().catch(() => {});
      }
    } else {
      if (recorder.state === "recording") {
        recorder.pause();
      }
      this.videoNoteState.elapsedMs = this.getVideoNoteElapsedMs();
      this.videoNoteState.paused = true;
      if (this.elements.videoNoteVideo) {
        this.elements.videoNoteVideo.pause();
      }
    }
    this.updateVideoNoteUI();
  }

  stopVideoNoteRecording(discard) {
    if (!this.videoNoteState.active) {
      if (discard && this.videoNoteState.previewBlob) {
        this.cleanupVideoNotePreview();
        this.showVideoNoteUI(null);
      }
      return;
    }
    this.videoNoteState.discardOnStop = !!discard;
    this.videoNoteState.active = false;
    this.sendActivity("record_video", "");
    if (
      this.videoNoteState.recorder &&
      this.videoNoteState.recorder.state !== "inactive"
    ) {
      this.videoNoteState.recorder.stop();
    } else {
      this.finalizeVideoNoteRecording();
      if (discard) {
        this.cleanupVideoNotePreview();
        this.showVideoNoteUI(null);
      }
    }
  }

  getVideoNoteElapsedMs() {
    if (this.videoNoteState.paused) {
      return this.videoNoteState.elapsedMs || 0;
    }
    const base = this.videoNoteState.elapsedMs || 0;
    const activeSpan = this.videoNoteState.startedAt
      ? Date.now() - this.videoNoteState.startedAt
      : 0;
    return base + activeSpan;
  }

  startVideoNoteTimer() {
    if (this.videoNoteState.timer) {
      clearInterval(this.videoNoteState.timer);
    }
    this.videoNoteState.timer = setInterval(() => {
      this.updateVideoNoteUI();
    }, 200);
  }

  finalizeVideoNoteRecording() {
    if (this.videoNoteState.timer) {
      clearInterval(this.videoNoteState.timer);
    }
    if (this.videoNoteState.stream) {
      this.videoNoteState.stream.getTracks().forEach((track) => track.stop());
    }
    this.videoNoteState.recorder = null;
    this.videoNoteState.stream = null;
    this.videoNoteState.timer = null;
    this.videoNoteState.chunks = [];
    this.videoNoteState.elapsedMs = 0;
    this.videoNoteState.paused = false;
    this.videoNoteState.startedAt = 0;
    this.videoNoteState.active = false;
    this.videoNoteState.discardOnStop = false;
  }

  showVideoNoteUI(state) {
    if (!this.elements.videoNoteRecorder) {
      return;
    }
    if (!state) {
      this.elements.videoNoteRecorder.style.display = "none";
      this.elements.videoNoteRecorder.dataset.state = "idle";
    } else {
      this.elements.videoNoteRecorder.style.display = "flex";
      this.elements.videoNoteRecorder.dataset.state = state;
    }
    if (this.elements.videoNoteBtn) {
      this.elements.videoNoteBtn.classList.toggle(
        "recording",
        state === "recording",
      );
    }
    if (!state) {
      this.syncVideoNotePlayIcon(true);
    }
  }

  updateVideoNoteUI() {
    if (!this.elements.videoNoteTimer) {
      return;
    }
    if (this.videoNoteState.active) {
      const elapsedMs = this.getVideoNoteElapsedMs();
      const elapsedSec = Math.floor(elapsedMs / 1000);
      this.elements.videoNoteTimer.textContent =
        this.formatDuration(elapsedSec);
      if (this.elements.videoNoteRing) {
        const pct = Math.min(
          100,
          (elapsedMs / this.videoNoteState.maxDurationMs) * 100,
        );
        this.elements.videoNoteRing.style.setProperty("--progress", `${pct}%`);
      }
      if (elapsedMs >= this.videoNoteState.maxDurationMs) {
        this.stopVideoNoteRecording(false);
      }
    }
    if (this.elements.videoNotePause) {
      this.elements.videoNotePause.innerHTML = this.iconHtml(
        this.videoNoteState.paused ? "play" : "pause",
      );
    }
  }

  bindVideoNotePreviewEvents() {
    const video = this.elements.videoNoteVideo;
    if (!video || video.dataset.noteBound) {
      return;
    }
    video.dataset.noteBound = "1";
    video.addEventListener("loadedmetadata", () =>
      this.updateVideoNotePreviewUI(true),
    );
    video.addEventListener("timeupdate", () => this.updateVideoNotePreviewUI());
    video.addEventListener("play", () => this.syncVideoNotePlayIcon());
    video.addEventListener("pause", () => this.syncVideoNotePlayIcon());
    video.addEventListener("ended", () => {
      video.currentTime = 0;
      this.updateVideoNotePreviewUI(true);
      this.syncVideoNotePlayIcon(true);
    });
  }

  prepareVideoNotePreview(blob, elapsedMs) {
    this.cleanupVideoNotePreview();
    this.videoNoteState.previewBlob = blob;
    this.videoNoteState.durationSec = Math.min(
      60,
      Math.max(1, Math.round(elapsedMs / 1000)),
    );
    const url = URL.createObjectURL(blob);
    this.videoNoteState.previewUrl = url;
    if (this.elements.videoNoteVideo) {
      this.elements.videoNoteVideo.srcObject = null;
      this.elements.videoNoteVideo.src = url;
      this.elements.videoNoteVideo.muted = false;
      this.elements.videoNoteVideo.loop = false;
      this.elements.videoNoteVideo.pause();
    }
    this.bindVideoNotePreviewEvents();
    this.showVideoNoteUI("preview");
    this.updateVideoNotePreviewUI(true);
    this.syncVideoNotePlayIcon(true);
  }

  updateVideoNotePreviewUI(forceReset) {
    if (!this.videoNoteState.previewBlob || !this.elements.videoNoteVideo) {
      return;
    }
    const video = this.elements.videoNoteVideo;
    const total =
      Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : this.videoNoteState.durationSec;
    const current = forceReset ? 0 : video.currentTime || 0;
    const pct = total ? Math.min(100, (current / total) * 100) : 0;
    if (this.elements.videoNoteRing) {
      this.elements.videoNoteRing.style.setProperty("--progress", `${pct}%`);
    }
    if (this.elements.videoNoteTimer) {
      if (total) {
        this.elements.videoNoteTimer.textContent = `${this.formatDuration(Math.floor(current))} / ${this.formatDuration(Math.floor(total))}`;
      } else {
        this.elements.videoNoteTimer.textContent = this.formatDuration(
          Math.floor(current),
        );
      }
    }
    if (forceReset && video.currentTime !== 0) {
      video.currentTime = 0;
    }
  }

  syncVideoNotePlayIcon(forcePaused) {
    if (!this.elements.videoNotePlay || !this.elements.videoNoteVideo) {
      return;
    }
    const isPaused =
      typeof forcePaused === "boolean"
        ? forcePaused
        : this.elements.videoNoteVideo.paused;
    this.elements.videoNotePlay.innerHTML = this.iconHtml(
      isPaused ? "play" : "pause",
    );
  }

  toggleVideoNotePreviewPlayback() {
    if (!this.videoNoteState.previewBlob || !this.elements.videoNoteVideo) {
      return;
    }
    if (this.elements.videoNoteVideo.paused) {
      this.elements.videoNoteVideo.play().catch(() => {});
    } else {
      this.elements.videoNoteVideo.pause();
    }
  }

  cleanupVideoNotePreview() {
    if (this.elements.videoNoteVideo) {
      this.elements.videoNoteVideo.pause();
      this.elements.videoNoteVideo.removeAttribute("src");
      this.elements.videoNoteVideo.srcObject = null;
      this.elements.videoNoteVideo.load();
    }
    if (this.videoNoteState.previewUrl) {
      URL.revokeObjectURL(this.videoNoteState.previewUrl);
    }
    this.videoNoteState.previewUrl = null;
    this.videoNoteState.previewBlob = null;
    this.videoNoteState.durationSec = 0;
    if (this.elements.videoNoteRing) {
      this.elements.videoNoteRing.style.setProperty("--progress", "0%");
    }
    if (this.elements.videoNoteTimer) {
      this.elements.videoNoteTimer.textContent = "0:00";
    }
  }

  async sendVideoNote() {
    if (!this.videoNoteState.previewBlob) {
      return;
    }
    const blob = this.videoNoteState.previewBlob;
    const mime = blob.type || this.videoNoteState.mimeType || "video/webm";
    const duration = this.videoNoteState.durationSec || 1;
    let extension = "webm";
    if (mime.includes("mp4")) {
      extension = "mp4";
    } else if (mime.includes("quicktime")) {
      extension = "mov";
    }
    const fileName = `video-note-${Date.now()}.${extension}`;
    let file = blob;
    if (typeof File !== "undefined") {
      file = new File([blob], fileName, { type: mime });
    }
    await this.sendFileMessage(file, "video_note", {
      duration: duration,
      mime: mime,
    });
    this.cleanupVideoNotePreview();
    this.showVideoNoteUI(null);
  }

  async restartVideoNoteRecording() {
    this.cleanupVideoNotePreview();
    this.showVideoNoteUI(null);
    await this.startVideoNoteRecording();
  }

  async submitEdit(text) {
    if (!this.editingMessage) {
      return false;
    }
    const message = this.editingMessage;
    const messageId = message.message_id;
    const trimmed = text.trim();
    if (!trimmed) {
      return false;
    }
    const payload = {
      message_id: messageId,
      message_text: trimmed,
      text: trimmed,
    };
    try {
      const res = await window.ApiClient.fetch("edit_message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        this.clearEditing();
        if (this.elements.messageInput) {
          this.elements.messageInput.value = "";
          this.resizeComposer();
        }

        // 1. Immediately update cached message in memory
        const cached = this.messageCache.get(messageId) || message;
        cached.message_text = trimmed;
        cached.text = trimmed;
        cached._plaintext = trimmed;
        cached.encrypted_content = trimmed;
        cached.edited_at = new Date().toISOString();
        cached.updated_at = new Date().toISOString();
        this.messageCache.set(messageId, cached);
        this.upsertConversationCacheMessage(cached);

        // 2. Directly update DOM element
        const element =
          this.messageElements.get(messageId) ||
          document.getElementById(`msg_${messageId}`) ||
          document.getElementById(`msg-${messageId}`) ||
          document.querySelector(`.message[data-message-id="${messageId}"]`);

        if (element) {
          const textEl = element.querySelector(".message-text");
          if (textEl) {
            textEl.innerHTML = this.formatMessageText(trimmed);
          }
          const metaEl = element.querySelector(".message-meta");
          if (metaEl && !metaEl.querySelector(".message-edited")) {
            const editedSpan = document.createElement("span");
            editedSpan.className = "message-edited";
            editedSpan.textContent = "edited ";
            metaEl.insertBefore(editedSpan, metaEl.firstChild);
          }
          element.classList.add("message-just-edited");
          setTimeout(() => element.classList.remove("message-just-edited"), 1000);
        }

        // 3. Pipeline update
        await this.applyMessageUpdates([
          {
            message_id: messageId,
            message_text: trimmed,
            text: trimmed,
            _plaintext: trimmed,
            encrypted_content: trimmed,
            updated_at: cached.updated_at,
            edited_at: cached.edited_at,
          },
        ]);
        return true;
      } else {
        this.showToast(data.message || "Failed to edit message");
        return false;
      }
    } catch (err) {
      console.error("Edit failed", err);
      this.showToast("Edit failed");
      return false;
    }
  }
  clearReply() {
    this.replyTo = null;
    if (this.elements.replyContainer) {
      this.elements.replyContainer.style.display = "none";
    }
  }

  clearEditing() {
    this.editingMessage = null;
    if (this.elements.editingContainer) {
      this.elements.editingContainer.style.display = "none";
    }
  }

  setReply(message) {
    this.replyTo = message;
    if (this.elements.replyContainer) {
      this.elements.replyContainer.style.display = "flex";
    }
    if (this.elements.replyUser) {
      this.elements.replyUser.textContent =
        message.sender_id === this.userId ? "You" : message.username || "User";
    }
    if (this.elements.replyText) {
      let text = this.getMessageTypeLabel(message.message_type);
      if (message.message_type === "text") {
        const parsed = this.extractTextPayload(message._plaintext || "");
        text = parsed.text || text;
      } else if (message._meta && message._meta.caption) {
        text = message._meta.caption;
      } else if (message._meta && message._meta.name) {
        text = message._meta.name;
      }
      this.elements.replyText.textContent = this.truncate(text, 60);
    }
    if (this.elements.messageInput) {
      this.elements.messageInput.focus();
      const length = this.elements.messageInput.value.length;
      if (this.elements.messageInput.setSelectionRange) {
        this.elements.messageInput.setSelectionRange(length, length);
      }
    }
  }

  setEditing(message) {
    this.editingMessage = message;
    if (this.elements.editingContainer) {
      this.elements.editingContainer.style.display = "flex";
    }
    if (this.elements.messageInput) {
      const parsed = this.extractTextPayload(message._plaintext || "");
      this.elements.messageInput.value = parsed.text || "";
      this.elements.messageInput.focus();
    }
  }

  getLastEditableMessage() {
    if (!this.currentChat) {
      return null;
    }
    const chatKey = this.getChatKeyFromChat(this.currentChat);
    let latest = null;
    let latestScore = -1;
    this.messageCache.forEach((message) => {
      if (!message || message._pending || message._failed) {
        return;
      }
      if (message.sender_id !== this.userId) {
        return;
      }
      if (message.message_type !== "text") {
        return;
      }
      if (this.getChatKeyForMessage(message) !== chatKey) {
        return;
      }
      const parsedId = parseInt(message.message_id, 10);
      const score = Number.isFinite(parsedId)
        ? parsedId
        : Date.parse(message.created_at) || 0;
      if (score > latestScore) {
        latest = message;
        latestScore = score;
      }
    });
    return latest;
  }

  maybeEditLastMessage(event) {
    if (
      !this.elements.messageInput ||
      !this.currentChat ||
      this.editingMessage
    ) {
      return false;
    }
    if (event && (event.ctrlKey || event.altKey || event.metaKey)) {
      return false;
    }
    const value = this.elements.messageInput.value || "";
    if (value.length > 0) {
      return false;
    }
    const last = this.getLastEditableMessage();
    if (!last) {
      return false;
    }
    if (event) {
      event.preventDefault();
    }
    this.setEditing(last);
    return true;
  }

  hideMessageMenu() {
    if (this.elements.messageMenu) {
      this.elements.messageMenu.style.display = "none";
    }
    this.activeMessageActionId = null;
  }

  hideChatMenu() {
    if (this.elements.chatMenu) {
      this.elements.chatMenu.style.display = "none";
    }
  }

  hideReactionPicker() {
    if (this.elements.reactionPicker) {
      this.elements.reactionPicker.style.display = "none";
    }
  }

  closeReactionSheet() {
    if (this.elements.reactionSheet) {
      this.elements.reactionSheet.style.display = "none";
      this.elements.reactionSheet.dataset.messageId = "";
    }
  }

  showMessageMenu(event, message) {
    if (!this.elements.messageMenu) {
      return;
    }
    this.hideMessageMenu();
    const isOutgoing = message.sender_id === this.userId;
    const isFailed = !!message._failed;
    this.elements.messageMenu.dataset.messageId = message.message_id;
    this.activeMessageActionId = message.message_id;

    const setItem = (item, show) => {
      if (!item) return;
      if (show) {
        item.style.setProperty("display", "flex", "important");
      } else {
        item.style.setProperty("display", "none", "important");
      }
    };

    const reactionsHeader = this.elements.messageMenu.querySelector(".menu-reactions");
    const seenMeta = this.elements.messageMenu.querySelector("#menu-seen-meta");
    const replyItem = this.elements.messageMenu.querySelector('[data-action="reply"]');
    const editItem = this.elements.messageMenu.querySelector('[data-action="edit"]');
    const retryItem = this.elements.messageMenu.querySelector('[data-action="retry"]');
    const deleteItem = this.elements.messageMenu.querySelector('[data-action="delete"]');
    const seenItem = this.elements.messageMenu.querySelector('[data-action="seen-time"]');
    const pinItem = this.elements.messageMenu.querySelector('[data-action="pin-message"]');
    const unpinItem = this.elements.messageMenu.querySelector('[data-action="unpin-message"]');
    const saveItem = this.elements.messageMenu.querySelector('[data-action="save"]');
    const forwardItem = this.elements.messageMenu.querySelector('[data-action="forward"]');
    const downloadItem = this.elements.messageMenu.querySelector('[data-action="download-image"]');
    const copyItem = this.elements.messageMenu.querySelector('[data-action="copy"]');
    const copyLinkItem = this.elements.messageMenu.querySelector('[data-action="copy-link"]');
    const selectItem = this.elements.messageMenu.querySelector('[data-action="select-message"]');
    const scheduleEditItem = this.elements.messageMenu.querySelector('[data-action="schedule-edit"]');
    const scheduleCancelItem = this.elements.messageMenu.querySelector('[data-action="schedule-cancel"]');

    // Default all strictly conditional items to hidden
    setItem(retryItem, false);
    setItem(editItem, false);
    setItem(downloadItem, false);
    setItem(scheduleEditItem, false);
    setItem(scheduleCancelItem, false);
    setItem(seenItem, false);
    setItem(pinItem, false);
    setItem(unpinItem, false);
    setItem(selectItem, true);

    if (isFailed) {
      if (reactionsHeader) reactionsHeader.style.setProperty("display", "none", "important");
      if (seenMeta) seenMeta.style.setProperty("display", "none", "important");
      setItem(replyItem, false);
      setItem(editItem, false);
      setItem(retryItem, this.canRetryFailedMessage(message));
      setItem(deleteItem, true);
      setItem(copyItem, true);
      setItem(saveItem, false);
      setItem(forwardItem, false);
      setItem(copyLinkItem, false);
      setItem(selectItem, false);
    } else if (message._scheduled) {
      if (reactionsHeader) reactionsHeader.style.setProperty("display", "none", "important");
      if (seenMeta) seenMeta.style.setProperty("display", "none", "important");
      setItem(replyItem, false);
      setItem(editItem, false);
      setItem(retryItem, false);
      setItem(deleteItem, false);
      setItem(saveItem, false);
      setItem(forwardItem, false);
      setItem(copyItem, true);
      setItem(copyLinkItem, false);
      setItem(scheduleEditItem, true);
      setItem(scheduleCancelItem, true);
      setItem(selectItem, false);
    } else {
      if (reactionsHeader) reactionsHeader.style.setProperty("display", "flex", "important");

      const conversation = this.currentChat
        ? this.getConversation(this.currentChat.id, this.currentChat.type) ||
          this.currentChat.meta
        : null;
      const isChannel = conversation && conversation.type === "channel";
      const isGroup = conversation && conversation.type === "group";
      const channelPerms = isChannel
        ? (this.getChannelPermissionsFromConversation(conversation) || {})
        : {};
      const groupPerms = isGroup
        ? (this.getGroupPermissionsFromConversation(conversation) || {})
        : {};
      const canPost = isChannel ? !!channelPerms.can_post : true;
      const canPin = isChannel
        ? !!channelPerms.can_pin
        : (isGroup ? !!groupPerms.can_pin_messages : true);
      const isPinned =
        !!this.pinnedMessageId && this.pinnedMessageId === message.message_id;

      setItem(replyItem, !isChannel || canPost);
      setItem(saveItem, true);
      setItem(forwardItem, true);
      setItem(copyItem, true);
      setItem(copyLinkItem, true);
      setItem(selectItem, true);
      setItem(downloadItem, message.message_type === "image" || !!message.file_url);
      setItem(
        editItem,
        message.message_type === "text" &&
          (isOutgoing || (isChannel && channelPerms.can_edit)),
      );
      setItem(
        deleteItem,
        isOutgoing || (isChannel && channelPerms.can_delete) || (isGroup && groupPerms.can_delete_messages),
      );

      if (seenMeta) {
        if (isOutgoing && !isChannel) {
          const seenLabel = message.read_at
            ? `Seen ${this.formatTime(message.read_at)}`
            : "Not seen yet";
          seenMeta.textContent = seenLabel;
          seenMeta.style.setProperty("display", "block", "important");
        } else {
          seenMeta.style.setProperty("display", "none", "important");
        }
      }

      setItem(pinItem, canPin && !isPinned);
      setItem(unpinItem, canPin && isPinned);

      if (this.isContentProtected()) {
        setItem(saveItem, false);
        setItem(forwardItem, false);
        setItem(copyItem, false);
        setItem(copyLinkItem, false);
        setItem(downloadItem, false);
      }
    }

    // Now reveal and accurately position the menu according to visible items
    this.elements.messageMenu.style.setProperty("display", "block", "important");
    this.positionFloatingMenu(
      this.elements.messageMenu,
      event.clientX,
      event.clientY,
    );
  }

  canRetryFailedMessage(message) {
    if (!message || !message._failed || message.sender_id !== this.userId) {
      return false;
    }
    if (this.currentChat) {
      const currentChatKey = this.getChatKeyFromChat(this.currentChat);
      const messageChatKey = this.getChatKeyForMessage(message);
      if (
        currentChatKey &&
        messageChatKey &&
        currentChatKey !== messageChatKey
      ) {
        return false;
      }
    }
    if (message.message_type !== "text") {
      const parsedId = Number.parseInt(message.message_id, 10);
      const taskKey = Number.isFinite(parsedId) ? parsedId : message.message_id;
      return this.uploadTasks.has(taskKey);
    }
    const parsedMessageId = Number.parseInt(message.message_id, 10);
    if (!Number.isFinite(parsedMessageId) || parsedMessageId >= 0) {
      return false;
    }
    const parsed = this.extractTextPayload(message._plaintext || "");
    return !!(parsed.text && parsed.text.trim());
  }

  showChatMenu(event, conversation) {
    if (!this.elements.chatMenu) {
      return;
    }
    this.elements.chatMenu.style.display = "block";
    this.positionFloatingMenu(
      this.elements.chatMenu,
      event.clientX,
      event.clientY,
    );
    this.elements.chatMenu.dataset.chatId = String(
      this.getConversationId(conversation),
    );
    this.elements.chatMenu.dataset.chatType = conversation.type;
    const isPinned = !!conversation.is_pinned;
    this.elements.chatMenu.querySelector('[data-action="pin"]').style.display =
      isPinned ? "none" : "flex";
    this.elements.chatMenu.querySelector(
      '[data-action="unpin"]',
    ).style.display = isPinned ? "flex" : "none";
    const viewProfile = this.elements.chatMenu.querySelector(
      '[data-action="view-profile"]',
    );
    const viewGroup = this.elements.chatMenu.querySelector(
      '[data-action="view-group"]',
    );
    const viewChannel = this.elements.chatMenu.querySelector(
      '[data-action="view-channel"]',
    );
    const clearChat = this.elements.chatMenu.querySelector(
      '[data-action="clear-chat"]',
    );
    const deleteMe = this.elements.chatMenu.querySelector(
      '[data-action="delete-chat-me"]',
    );
    const deleteAll = this.elements.chatMenu.querySelector(
      '[data-action="delete-chat-all"]',
    );

    if (conversation.type === "direct") {
      viewProfile.style.display = "flex";
      viewGroup.style.display = "none";
      viewChannel.style.display = "none";
      clearChat.style.display = "flex";
      deleteMe.style.display = "flex";
      deleteAll.style.display = "flex";
    } else if (conversation.type === "group") {
      viewProfile.style.display = "none";
      viewGroup.style.display = "flex";
      viewChannel.style.display = "none";
      clearChat.style.display = "flex";
      deleteMe.style.display = "flex";
      const perms = this.getGroupPermissionsFromConversation(conversation);
      deleteAll.style.display = perms.can_change_info ? "flex" : "none";
    } else if (conversation.type === "channel") {
      viewProfile.style.display = "none";
      viewGroup.style.display = "none";
      viewChannel.style.display = "flex";
      clearChat.style.display = "flex";
      deleteMe.style.display = "flex";
      const perms = this.getChannelPermissionsFromConversation(conversation);
      deleteAll.style.display = perms.can_manage ? "flex" : "none";
    } else {
      viewProfile.style.display = "none";
      viewGroup.style.display = "none";
      viewChannel.style.display = "none";
      clearChat.style.display = "flex";
      deleteMe.style.display = "flex";
      deleteAll.style.display = "none";
    }
  }

  showReactionPicker(event, message) {
    if (!this.elements.reactionPicker) {
      return;
    }
    this.elements.reactionPicker.style.display = "flex";
    this.positionFloatingMenu(
      this.elements.reactionPicker,
      event.clientX,
      event.clientY,
    );
    this.elements.reactionPicker.dataset.messageId = message.message_id;
  }

  showReactionPickerForMessage(message) {
    if (!this.elements.reactionPicker) {
      return;
    }
    const element = this.messageElements.get(message.message_id);
    if (!element) {
      return;
    }
    const rect = element.getBoundingClientRect();
    this.elements.reactionPicker.style.display = "flex";
    this.positionFloatingMenu(
      this.elements.reactionPicker,
      rect.right - 20,
      rect.top + 10,
    );
    this.elements.reactionPicker.dataset.messageId = message.message_id;
  }

  openReactionSheet(message, x, y) {
    if (!this.elements.reactionSheet || !message) {
      return;
    }
    let left = x;
    let top = y;
    if (!Number.isFinite(left) || !Number.isFinite(top)) {
      const element = this.messageElements.get(message.message_id);
      if (element) {
        const rect = element.getBoundingClientRect();
        left = rect.left;
        top = rect.bottom + 8;
      } else {
        left = window.innerWidth / 2;
        top = window.innerHeight / 2;
      }
    }
    this.elements.reactionSheet.style.display = "grid";
    this.positionFloatingMenu(this.elements.reactionSheet, left, top);
    this.elements.reactionSheet.dataset.messageId = message.message_id;
  }

  showQuickReactionBar(message, wrapper) {
    if (!this.elements.quickReactionBar || !message || !wrapper) {
      return;
    }
    if (message._pending || message._failed) {
      return;
    }
    if (this.quickReactionHideTimer) {
      clearTimeout(this.quickReactionHideTimer);
      this.quickReactionHideTimer = null;
    }
    this.elements.quickReactionBar.dataset.messageId = message.message_id;
    this.elements.quickReactionBar.style.display = "flex";
    const bubble = wrapper.querySelector(".message-bubble") || wrapper;
    const bubbleRect = bubble.getBoundingClientRect();
    const barRect = this.elements.quickReactionBar.getBoundingClientRect();
    let left = bubbleRect.left;
    if (wrapper.classList.contains("outgoing")) {
      left = bubbleRect.right - barRect.width;
    }
    let top = bubbleRect.top - barRect.height - 8;
    if (top < 12) {
      top = bubbleRect.bottom + 8;
    }
    this.positionFloatingMenu(this.elements.quickReactionBar, left, top);
  }

  deferHideQuickReactionBar() {
    if (!this.elements.quickReactionBar) {
      return;
    }
    if (this.quickReactionHideTimer) {
      clearTimeout(this.quickReactionHideTimer);
    }
    this.quickReactionHideTimer = setTimeout(() => {
      this.hideQuickReactionBar();
    }, 200);
  }

  hideQuickReactionBar() {
    if (this.elements.quickReactionBar) {
      this.elements.quickReactionBar.style.display = "none";
    }
  }

  positionFloatingMenu(element, x, y) {
    const padding = 12;
    element.style.left = x + "px";
    element.style.top = y + "px";
    const rect = element.getBoundingClientRect();
    let left = x;
    let top = y;
    if (rect.right > window.innerWidth - padding) {
      left = window.innerWidth - padding - rect.width;
    }
    if (rect.bottom > window.innerHeight - padding) {
      top = window.innerHeight - padding - rect.height;
    }
    if (left < padding) {
      left = padding;
    }
    if (top < padding) {
      top = padding;
    }
    element.style.left = left + "px";
    element.style.top = top + "px";
  }

  async handleMessageMenuAction(action, message) {
    switch (action) {
      case "reply":
        this.setReply(message);
        break;
      case "edit":
        this.setEditing(message);
        break;
      case "retry":
        await this.retryFailedMessage(message);
        break;
      case "delete":
        await this.deleteMessage(message);
        break;
      case "pin-message":
        await this.pinMessage(message.message_id, "pin");
        break;
      case "unpin-message":
        await this.pinMessage(message.message_id, "unpin");
        break;
      case "save":
        await this.saveMessage(message);
        break;
      case "forward":
        this.openForwardModal(message);
        break;
      case "copy":
        await this.copyMessage(message);
        break;
      case "copy-link":
        await this.copyMessageLink(message);
        break;
      case "select-message":
        if (window.TelegramZ && typeof window.TelegramZ.enterSelectionMode === "function") {
          window.TelegramZ.enterSelectionMode(message);
        }
        break;
      case "schedule-edit":
        this.openScheduleModal({ mode: "reschedule", message: message });
        break;
      case "schedule-cancel":
        await this.cancelScheduledMessage(message);
        break;
      case "download-image":
        await this.downloadImageFromMessage(message);
        break;
      case "seen-time":
        this.showSeenTime(message);
        break;
      default:
        break;
    }
  }

  showSeenTime(message) {
    if (!this.elements.seenTimeModal || !this.elements.seenTimeText) {
      return;
    }
    let text = "Not seen yet";
    if (message.read_at) {
      const formatted = this.formatFullDateTime(message.read_at);
      text = "Seen at: " + (formatted || message.read_at);
    }
    this.elements.seenTimeText.textContent = text;
    this.elements.seenTimeModal.style.display = "flex";
  }

  closeSeenTimeModal() {
    if (!this.elements.seenTimeModal) {
      return;
    }
    this.elements.seenTimeModal.style.display = "none";
  }

  openImageViewer(blob, meta) {
    if (
      !this.elements.imageViewerModal ||
      !this.elements.imageViewerImg ||
      !blob
    ) {
      return;
    }
    if (this.imageViewerState.url) {
      URL.revokeObjectURL(this.imageViewerState.url);
    }
    const url = URL.createObjectURL(blob);
    const name = meta && meta.name ? meta.name : "image";
    this.imageViewerState = { blob: blob, url: url, scale: 1, name: name };
    this.elements.imageViewerImg.src = url;
    this.elements.imageViewerImg.alt = meta && meta.name ? meta.name : "Image";
    this.setImageZoom(1);
    this.elements.imageViewerModal.style.display = "flex";
  }

  closeImageViewer() {
    if (!this.elements.imageViewerModal) {
      return;
    }
    this.elements.imageViewerModal.style.display = "none";
    if (this.imageViewerState.url) {
      URL.revokeObjectURL(this.imageViewerState.url);
    }
    this.imageViewerState = {
      blob: null,
      url: null,
      scale: 1,
      name: null,
    };
    if (this.elements.imageViewerImg) {
      this.elements.imageViewerImg.src = "";
    }
  }

  setImageZoom(scale) {
    if (!this.elements.imageViewerImg) {
      return;
    }
    const next = Math.min(3, Math.max(0.5, scale));
    this.imageViewerState.scale = next;
    this.elements.imageViewerImg.style.transform = `scale(${next})`;
  }

  adjustImageZoom(delta) {
    const next = (this.imageViewerState.scale || 1) + delta;
    this.setImageZoom(next);
  }

  downloadImageFromViewer() {
    if (!this.imageViewerState.blob) {
      return;
    }
    this.saveBlobToDisk(
      this.imageViewerState.blob,
      this.imageViewerState.name || "image",
    );
  }

  async downloadImageFromMessage(message) {
    if (!message || message.message_type !== "image") {
      return;
    }
    if (this.isContentProtected()) {
      this.showToast("Saving is disabled for this chat");
      return;
    }
    const handler = this.mediaDownloadHandlers.get(message.message_id);
    if (handler && handler.getBlob && handler.getBlob()) {
      const meta = handler.getMeta ? handler.getMeta() : null;
      this.saveBlobToDisk(
        handler.getBlob(),
        meta && meta.name ? meta.name : "image",
      );
      return;
    }
    if (handler && handler.download) {
      handler.download();
      return;
    }
    this.showToast("Please download the image first.");
  }

  saveBlobToDisk(blob, name) {
    if (!blob) {
      return;
    }
    const filename = name && typeof name === "string" ? name : "download";
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 500);
  }

  getCurrentConversation() {
    if (!this.currentChat) {
      return null;
    }
    return (
      this.getConversation(this.currentChat.id, this.currentChat.type) ||
      this.currentChat.meta
    );
  }

  isContentProtected() {
    const conversation = this.getCurrentConversation();
    if (!conversation) {
      return false;
    }
    if (conversation.type !== "group" && conversation.type !== "channel") {
      return false;
    }
    return Number(conversation.content_protection) === 1;
  }

  getGroupPermissionsFromConversation(conversation) {
    const role = conversation.group_role || "member";
    if (role === "member") {
      return {
        role: role,
        can_send_messages: Number(conversation.can_send_messages ?? 1),
        can_send_media: Number(conversation.can_send_media ?? 1),
        can_pin_messages: 0,
        can_add_users: 0,
        can_remove_users: 0,
        can_change_info: 0,
      };
    }
    if (role === "owner") {
      return {
        role: role,
        can_send_messages: 1,
        can_send_media: 1,
        can_pin_messages: 1,
        can_add_users: 1,
        can_remove_users: 1,
        can_change_info: 1,
      };
    }
    return {
      role: role,
      can_send_messages: Number(conversation.can_send_messages ?? 1),
      can_send_media: Number(conversation.can_send_media ?? 1),
      can_pin_messages: Number(conversation.can_pin_messages ?? 1),
      can_add_users: Number(conversation.can_add_users ?? 1),
      can_remove_users: Number(conversation.can_remove_users ?? 1),
      can_change_info: Number(conversation.can_change_info ?? 1),
    };
  }

  getChannelPermissionsFromConversation(conversation) {
    const role = conversation.channel_role || "subscriber";
    if (role === "subscriber") {
      return {
        role: role,
        can_post: 0,
        can_edit: 0,
        can_delete: 0,
        can_pin: 0,
        can_manage: 0,
      };
    }
    if (role === "owner") {
      return {
        role: role,
        can_post: 1,
        can_edit: 1,
        can_delete: 1,
        can_pin: 1,
        can_manage: 1,
      };
    }
    return {
      role: role,
      can_post: Number(conversation.can_post ?? 1),
      can_edit: Number(conversation.can_edit ?? 1),
      can_delete: Number(conversation.can_delete ?? 1),
      can_pin: Number(conversation.can_pin ?? 1),
      can_manage: Number(conversation.can_manage ?? 1),
    };
  }

  getSlowModeRemaining(chat) {
    const remainingMs = this.getSlowModeRemainingMs(chat);
    if (!remainingMs) {
      return 0;
    }
    const remaining = Math.ceil(remainingMs / 1000);
    return remaining > 0 ? remaining : 0;
  }

  getSlowModeRemainingMs(chat) {
    const chatKey = this.getChatKeyFromChat(chat);
    if (!chatKey) {
      return 0;
    }
    if (!this.slowModeState || this.slowModeState.chatKey !== chatKey) {
      return 0;
    }
    if (!this.slowModeState || !this.slowModeState.until) {
      return 0;
    }
    const remainingMs = this.slowModeState.until - Date.now();
    return remainingMs > 0 ? remainingMs : 0;
  }

  applyRateLimitFromResponse(data, chat) {
    if (!data || typeof data !== "object") {
      return;
    }
    const remaining = Number.parseInt(
      data.remaining_seconds ?? data.retry_after,
      10,
    );
    if (!Number.isFinite(remaining) || remaining <= 0) {
      return;
    }
    const reason =
      typeof data.reason === "string" && data.reason.trim()
        ? data.reason.trim()
        : "slow_mode";
    this.setSlowModeCountdown(remaining, chat, reason);
  }

  setSlowModeCountdown(seconds, chat, reason) {
    const targetChat = chat || this.currentChat;
    const targetChatKey = this.getChatKeyFromChat(targetChat);
    if (!targetChatKey) {
      return;
    }
    if (!seconds || seconds <= 0) {
      return;
    }
    const clampedSeconds = Math.max(1, Math.ceil(Number(seconds) || 0));
    this.slowModeState.chatKey = targetChatKey;
    this.slowModeState.until = Date.now() + clampedSeconds * 1000;
    this.slowModeState.reason =
      typeof reason === "string" && reason.trim() ? reason.trim() : "slow_mode";
    if (this.slowModeState.timer) {
      clearInterval(this.slowModeState.timer);
    }
    this.slowModeState.timer = setInterval(() => {
      const remainingMs =
        this.slowModeState && this.slowModeState.until
          ? this.slowModeState.until - Date.now()
          : 0;
      if (remainingMs <= 0) {
        this.resetSlowModeState();
        if (this.currentChat) {
          this.updateChatInputState();
        }
        return;
      }
      if (this.currentChat) {
        this.updateChatInputState();
      }
    }, 250);
    this.updateChatInputState();
  }

  applySlowModeSent(chat) {
    return;
  }

  resetSlowModeState() {
    if (this.slowModeState && this.slowModeState.timer) {
      clearInterval(this.slowModeState.timer);
    }
    this.slowModeState = { chatKey: null, until: 0, reason: "", timer: null };
  }

  updateChatInputState() {
    if (!this.elements.messageInput || !this.currentChat) {
      return;
    }
    const conversation = this.getCurrentConversation();
    if (!conversation) {
      return;
    }
    let canSendText = true;
    let canSendMedia = true;
    let placeholder = "Type a message...";
    if (conversation.type === "group") {
      const perms = this.getGroupPermissionsFromConversation(conversation);
      canSendText = !!perms.can_send_messages;
      canSendMedia = !!perms.can_send_media;
      if (!canSendText && !canSendMedia) {
        placeholder = "You cannot send messages in this group";
      } else if (!canSendText && canSendMedia) {
        placeholder = "Media only in this group";
      }
    }
    if (conversation.type === "channel") {
      const perms = this.getChannelPermissionsFromConversation(conversation);
      canSendText = !!perms.can_post;
      canSendMedia = !!perms.can_post;
      if (!canSendText) {
        placeholder = "Only admins can post in this channel";
      }
    }
    const slowRemainingMs = this.getSlowModeRemainingMs(this.currentChat);
    const slowBlocked = slowRemainingMs > 0;
    this.elements.messageInput.placeholder = placeholder;
    const readOnly = !canSendText && !canSendMedia;
    this.elements.messageInput.disabled = readOnly;
    if (this.elements.slowModeIndicator) {
      if (slowBlocked) {
        const labelText = Math.max(1, Math.ceil(slowRemainingMs / 1000));
        const reason =
          this.slowModeState && typeof this.slowModeState.reason === "string"
            ? this.slowModeState.reason
            : "";
        const prefix =
          reason === "spam_protection" ? "Spam protection" : "Slow mode";
        this.elements.slowModeIndicator.textContent = `${prefix}: ${labelText}s`;
        this.elements.slowModeIndicator.style.display = "block";
      } else {
        this.elements.slowModeIndicator.style.display = "none";
        this.elements.slowModeIndicator.textContent = "";
      }
    }
    if (this.elements.attachBtn) {
      this.elements.attachBtn.disabled = !canSendMedia || slowBlocked;
    }
    if (this.elements.voiceBtn) {
      this.elements.voiceBtn.disabled = !canSendMedia || slowBlocked;
    }
    if (this.elements.videoNoteBtn) {
      this.elements.videoNoteBtn.disabled = !canSendMedia || slowBlocked;
    }
    if (this.elements.sendBtn) {
      this.elements.sendBtn.disabled = readOnly || slowBlocked;
    }
    if (this.elements.fileInput) {
      this.elements.fileInput.disabled = !canSendMedia || slowBlocked;
    }
    if (this.elements.chatInputContainer) {
      this.elements.chatInputContainer.classList.toggle("read-only", readOnly);
    }
    if (this.elements.messageContainer) {
      this.elements.messageContainer.classList.toggle(
        "content-protected",
        this.isContentProtected(),
      );
    }
  }

  async loadPinnedMessage() {
    if (!this.currentChat || !this.elements.pinnedBanner) {
      return;
    }
    if (
      this.currentChat.type !== "group" &&
      this.currentChat.type !== "channel"
    ) {
      this.updatePinnedBanner(null);
      return;
    }
    const chatType = this.currentChat.type;
    const chatId = this.currentChat.id;
    try {
      const res = await fetch(
        window.ApiClient.url("pinned_message", { chatType: chatType, chatId: chatId }),
      );
      const data = await res.json();
      if (!data.success) {
        this.updatePinnedBanner(null);
        return;
      }
      if (!data.pinned) {
        this.updatePinnedBanner(null);
        return;
      }
      const pinned = data.pinned;
      pinned.message_id = parseInt(pinned.message_id, 10);
      if (pinned.reply_to_id !== null && pinned.reply_to_id !== undefined) {
        pinned.reply_to_id = parseInt(pinned.reply_to_id, 10);
      }
      const decrypted = await this.decryptMessage(pinned);
      let preview = this.getMessageTypeLabel(pinned.message_type);
      if (decrypted && decrypted.plaintext) {
        if (pinned.message_type === "text") {
          preview = decrypted.plaintext;
        } else {
          try {
            const meta = JSON.parse(decrypted.plaintext);
            if (meta && meta.caption) {
              preview = meta.caption;
            } else if (meta && meta.name) {
              preview = meta.name;
            }
          } catch (err) {
            // ignore
          }
        }
      }
      this.pinnedMessageId = pinned.message_id;
      this.pinnedMessage = pinned;
      this.updatePinnedBanner(pinned, preview);
    } catch (err) {
      console.error("Failed to load pinned message", err);
      this.updatePinnedBanner(null);
    }
  }

  updatePinnedBanner(message, preview) {
    if (!this.elements.pinnedBanner) {
      return;
    }
    if (!message) {
      this.elements.pinnedBanner.style.display = "none";
      this.pinnedMessageId = null;
      this.pinnedMessage = null;
      return;
    }
    if (this.elements.pinnedBannerText) {
      this.elements.pinnedBannerText.textContent = this.truncate(
        preview || "Pinned message",
        80,
      );
    }
    const conversation = this.getCurrentConversation();
    let canUnpin = false;
    if (conversation && conversation.type === "group") {
      const perms = this.getGroupPermissionsFromConversation(conversation);
      canUnpin = !!perms.can_pin_messages;
    }
    if (conversation && conversation.type === "channel") {
      const perms = this.getChannelPermissionsFromConversation(conversation);
      canUnpin = !!perms.can_pin;
    }
    if (this.elements.pinnedBannerClose) {
      this.elements.pinnedBannerClose.style.display = canUnpin
        ? "inline-flex"
        : "none";
    }
    this.elements.pinnedBanner.style.display = "flex";
  }

  async pinMessage(messageId, action) {
    if (!this.currentChat) {
      return;
    }
    if (
      this.currentChat.type !== "group" &&
      this.currentChat.type !== "channel"
    ) {
      return;
    }
    try {
      const res = await window.ApiClient.fetch("pin_message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatType: this.currentChat.type,
          chatId: this.currentChat.id,
          messageId: messageId,
          action: action,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        this.showToast(data.message || "Unable to pin message");
        return;
      }
      await this.loadPinnedMessage();
    } catch (err) {
      console.error("Pin message failed", err);
    }
  }

  async handleChatMenuAction(action, conversation) {
    if (action === "pin") {
      await this.pinChat(conversation, "pin");
    } else if (action === "unpin") {
      await this.pinChat(conversation, "unpin");
    } else if (action === "view-profile") {
      this.openProfile(conversation);
    } else if (action === "view-group") {
      this.openGroupInfo(conversation);
    } else if (action === "view-channel") {
      this.openChannelInfo(conversation);
    } else if (action === "clear-chat") {
      const confirm = await this.confirmAction("Clear this chat for you?");
      if (confirm) {
        await this.clearChat(conversation);
      }
    } else if (action === "delete-chat-me") {
      const confirm = await this.confirmAction("Delete this chat for you?");
      if (confirm) {
        await this.deleteChat(conversation, "me");
      }
    } else if (action === "delete-chat-all") {
      const confirm = await this.confirmAction(
        "Delete this chat for everyone? This cannot be undone.",
      );
      if (confirm) {
        await this.deleteChat(conversation, "all");
      }
    }
    try {
      await this.loadConversations();
    } catch (err) {}
  }

  async openProfile(conversation) {
    if (!conversation || conversation.type !== "direct") {
      return;
    }
    if (document.body.classList.contains("theme-telegram-z") || document.documentElement.getAttribute("data-theme") === "telegram-z") {
      if (window.telegramZShell && typeof window.telegramZShell.openInfoSidebar === "function") {
        window.telegramZShell.openInfoSidebar();
        return;
      }
    }
    const userId = conversation.user_id || conversation.id;
    let profile = {
      full_name: conversation.full_name || conversation.username || "User",
      username: conversation.username || "",
      status: conversation.status || "offline",
      last_seen: conversation.last_seen || null,
      last_seen_hidden: conversation.last_seen_hidden || 0,
      bio: "",
      profile_pic: conversation.profile_pic || "default.png",
    };
    try {
      const res = await window.ApiClient.fetch("user_profile", undefined, { user_id: userId });
      const data = await res.json();
      if (data.success && data.profile) {
        profile = data.profile;
      }
    } catch (err) {
      console.error("Profile fetch failed", err);
    }

    if (this.elements.profileAvatar) {
      this.elements.profileAvatar.innerHTML = "";
      const img = document.createElement("img");
      img.src = this.getAvatarUrl(
        profile.profile_pic,
        profile.full_name || profile.username,
        {
          type: "user",
          cacheKey: profile.user_id || userId || profile.username,
        },
      );
      img.alt = "profile";
      this.disableImageDrag(img);
      this.elements.profileAvatar.appendChild(img);
    }
    if (this.elements.profileName) {
      this.elements.profileName.textContent =
        profile.full_name || profile.username;
    }
    if (this.elements.profileUsername) {
      this.elements.profileUsername.textContent = profile.username
        ? "@" + profile.username
        : "";
    }
    if (this.elements.profileStatus) {
      const presenceState = this.getPresenceState({
        type: "direct",
        status: profile.status || "offline",
        last_seen: profile.last_seen || null,
        last_seen_hidden: Number(profile.last_seen_hidden || 0),
      });
      if (profile.last_seen_hidden) {
        this.elements.profileStatus.textContent = "Status hidden";
      } else if (presenceState === "online") {
        this.elements.profileStatus.textContent = "Online now";
      } else {
        this.elements.profileStatus.textContent = "";
      }
    }
    if (this.elements.profileLastSeen) {
      if (profile.last_seen_hidden) {
        this.elements.profileLastSeen.textContent = "Last seen hidden";
      } else if (profile.last_seen) {
        this.elements.profileLastSeen.textContent =
          "Last seen " + this.formatRelativeTime(profile.last_seen);
      } else {
        this.elements.profileLastSeen.textContent = "";
      }
    }
    if (this.elements.profileBio) {
      this.elements.profileBio.textContent = profile.bio || "";
    }
    if (this.elements.profileModal) {
      this.elements.profileModal.style.display = "flex";
    }
  }

  openGroupInfo(conversation) {
    if (!conversation || conversation.type !== "group") {
      return;
    }
    const groupId = conversation.group_id || conversation.id;
    if (groupId) {
      window.location.href = "groups?id=" + groupId;
    }
  }

  openChannelInfo(conversation) {
    if (!conversation || conversation.type !== "channel") {
      return;
    }
    const channelId = conversation.channel_id || conversation.id;
    if (channelId) {
      window.location.href = "channel?id=" + channelId;
    }
  }

  closeProfile() {
    if (this.elements.profileModal) {
      this.elements.profileModal.style.display = "none";
    }
  }

  async clearChat(conversation) {
    try {
      await window.ApiClient.fetch("chat_clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatType: conversation.type,
          chatId: this.getConversationId(conversation),
        }),
      });
      if (
        this.currentChat &&
        this.currentChat.type === conversation.type &&
        this.currentChat.id === this.getConversationId(conversation)
      ) {
        this.resetChatView();
      }
    } catch (err) {
      console.error("Clear chat failed", err);
    }
  }

  async deleteChat(conversation, scope) {
    try {
      const res = await window.ApiClient.fetch("delete_chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatType: conversation.type,
          chatId: this.getConversationId(conversation),
          scope: scope,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        this.showToast(data.message || "Failed to delete chat");
        return;
      }
      if (
        this.currentChat &&
        this.currentChat.type === conversation.type &&
        this.currentChat.id === this.getConversationId(conversation)
      ) {
        this.resetChatView();
      }
    } catch (err) {
      console.error("Delete chat failed", err);
    }
  }

  resetChatView() {
    this.currentChat = null;
    this.stopMessagePolling();
    this.stopExpiryTimer();
    this.resetChatSearch();
    if (this.seenSendTimer) {
      clearTimeout(this.seenSendTimer);
      this.seenSendTimer = null;
    }
    this.pendingSeen = null;
    this.resetNewMessagesJump();
    if (this.elements.messageContainer) {
      this.elements.messageContainer.innerHTML = "";
    }
    let welcome =
      document.getElementById("welcome-message") ||
      (this.elements && this.elements.welcomeMessage);
    if (!welcome && this.elements && this.elements.messageContainer) {
      welcome = document.createElement("div");
      welcome.id = "welcome-message";
      welcome.className = "text-center";
      welcome.innerHTML = this._originalWelcomeHtml || `
        <div style="margin-top: 100px;">
            <svg class="icon icon-xl" aria-hidden="true" style="color: var(--primary-color); margin-bottom: 20px;"><use href="#icon-comments"></use></svg>
            <h2>Welcome to Liquid Chat</h2>
            <p class="mt-10">Select a conversation to start chatting</p>
        </div>
      `;
      if (this.elements) {
        this.elements.welcomeMessage = welcome;
      }
    }
    if (welcome) {
      welcome.style.removeProperty("display");
      if (this._originalWelcomeHtml && (!welcome.firstElementChild || !welcome.querySelector('svg'))) {
        welcome.innerHTML = this._originalWelcomeHtml;
      }
      if (this.elements.messageContainer && !this.elements.messageContainer.contains(welcome)) {
        this.elements.messageContainer.appendChild(welcome);
      }
    }
    const chatInput =
      document.getElementById("chat-input-container") ||
      (this.elements && this.elements.chatInputContainer);
    if (chatInput) {
      chatInput.style.setProperty("display", "none", "important");
    }
    const topbar =
      document.getElementById("chat-topbar") ||
      (this.elements && this.elements.chatTopbar);
    if (topbar) {
      topbar.classList.add("empty");
      topbar.style.setProperty("display", "none", "important");
    }
    this.updatePinnedBanner(null);
    this.updateChatTopbar();
    this.triggerChatTransition();
  }

  closeCurrentChat() {
    this._openChatToken = (this._openChatToken || 0) + 1;
    this.currentChat = null;
    this._openingChatKey = null;
    this.stopMessagePolling();
    this.stopExpiryTimer();
    this.resetChatView();

    document.body.classList.remove("has-active-chat");
    const chatContainer = document.querySelector(".chat-container");
    if (chatContainer) {
      chatContainer.classList.remove("has-active-chat");
    }
    const chatMain = document.querySelector(".chat-main");
    if (chatMain) {
      chatMain.classList.remove("has-active-chat");
      chatMain.classList.remove("active");
    }
    const sidebar = document.querySelector(".chat-sidebar");
    if (sidebar) {
      sidebar.classList.add("active");
      sidebar.classList.remove("has-active-chat");
    }
    const topbar = document.getElementById("chat-topbar") || (this.elements && this.elements.chatTopbar);
    if (topbar) {
      topbar.classList.add("empty");
      topbar.style.setProperty("display", "none", "important");
    }
    const chatInput = document.getElementById("chat-input-container") || (this.elements && this.elements.chatInputContainer);
    if (chatInput) {
      chatInput.style.setProperty("display", "none", "important");
    }
    const welcome = document.getElementById("welcome-message") || (this.elements && this.elements.welcomeMessage);
    if (welcome) {
      welcome.style.removeProperty("display");
    }
    const list = document.getElementById("conversations-list");
    if (list) {
      list.querySelectorAll(".contact-item, .chat-item").forEach((it) => {
        it.classList.remove("active", "is-selected");
      });
    }
    if (window.telegramZShell) {
      window.telegramZShell.syncActiveChatItem();
      window.telegramZShell.syncActiveChatState();
    }
  }

  async deleteMessage(message) {
    if (message._failed || message.message_id < 0) {
      this.removeLocalMessage(message.message_id);
      return;
    }
    try {
      const scope = await this.confirmDeleteScope(message);
      if (!scope) {
        return;
      }
      const res = await window.ApiClient.fetch("delete_message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message_id: message.message_id, scope: scope }),
      });
      const data = await res.json();
      if (data.success) {
        this.applyDeletedMessages([message.message_id]);
      } else {
        this.showToast(data.message || "Failed to delete message");
      }
    } catch (err) {
      console.error("Delete failed", err);
    }
  }

  getMediaCopyLabel(messageType, meta) {
    const type = messageType || (meta && meta.type) || "";
    const name = meta && meta.name ? String(meta.name).trim() : "";
    if (type === "voice") {
      return "Voice message";
    }
    if (type === "video_note") {
      return "Video Message";
    }
    if (type === "image") {
      return "Photo";
    }
    if (type === "album") {
      if (meta.caption) {
        return meta.caption;
      }
      return "Photo album";
    }
    if (type === "audio") {
      return name ? `Audio file: ${name}` : "Audio file";
    }
    if (type === "video") {
      return name ? `Video file: ${name}` : "Video file";
    }
    if (type === "file") {
      return name ? `File: ${name}` : "File";
    }
    return name || "";
  }

  getCopyText(message) {
    if (!message) {
      return "";
    }
    const type =
      message.message_type || (message._meta && message._meta.type) || "text";
    if (type === "text") {
      const parsed = this.extractTextPayload(message._plaintext || "");
      return parsed.text || "";
    }
    const meta = message._meta || {};
    const caption = meta.caption ? String(meta.caption) : "";
    const label = this.getMediaCopyLabel(type, meta);
    if (caption) {
      if (label && label !== caption) {
        return `${caption}\n${label}`;
      }
      return caption;
    }
    return label;
  }

  async copyMessage(message) {
    if (this.isContentProtected()) {
      this.showToast("Copying is disabled for this chat");
      return;
    }
    const copyText = this.getCopyText(message);
    if (!copyText) {
      this.showToast("Nothing to copy");
      return;
    }
    try {
      await navigator.clipboard.writeText(copyText);
      this.showToast("Copied to clipboard");
    } catch (err) {
      console.error("Copy failed", err);
    }
  }

  async copyMessageLink(message) {
    if (!message || !message.message_id) {
      this.showToast("Link unavailable");
      return;
    }
    const messageId = parseInt(message.message_id, 10);
    if (!Number.isFinite(messageId) || messageId <= 0) {
      this.showToast("Link unavailable");
      return;
    }
    const info = this.getNotificationChatInfo(message);
    if (!info) {
      this.showToast("Link unavailable");
      return;
    }
    const baseUrl = new URL(window.location.href);
    baseUrl.searchParams.set("chat_type", info.chatType);
    baseUrl.searchParams.set("chat_id", info.chatId);
    baseUrl.searchParams.set("msg", String(messageId));
    baseUrl.hash = "";
    try {
      await navigator.clipboard.writeText(baseUrl.toString());
      this.showToast("Message link copied");
    } catch (err) {
      this.showToast("Unable to copy link");
    }
  }

  async toggleReaction(message, emoji) {
    if (!message || !emoji) {
      return;
    }
    try {
      const res = await window.ApiClient.fetch("add_reaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message_id: message.message_id,
          reaction: emoji,
        }),
      });
      const data = await res.json();
      if (data.success) {
        this.updateReactions(message.message_id, data.reactions || {});
      }
    } catch (err) {
      console.error("Reaction failed", err);
    }
  }
  async fetchReactions(messageIds) {
    if (!messageIds.length) {
      return;
    }
    try {
      const res = await fetch(
        window.ApiClient.url("get_reactions", { message_ids: messageIds.join(",") }),
      );
      const data = await res.json();
      if (data.success && data.reactions) {
        Object.keys(data.reactions).forEach((messageId) => {
          this.updateReactions(
            parseInt(messageId, 10),
            data.reactions[messageId],
          );
        });
      }
    } catch (err) {
      console.error("Failed to load reactions", err);
    }
  }

  normalizeReactionsPayload(payload, previous) {
    const fallback =
      previous && typeof previous === "object"
        ? previous
        : { counts: {}, mine: [] };
    let counts = fallback.counts || {};
    let mine = Array.isArray(fallback.mine) ? fallback.mine : [];

    if (payload) {
      if (payload.counts && typeof payload.counts === "object") {
        counts = payload.counts || {};
      } else if (!Array.isArray(payload) && typeof payload === "object") {
        counts = payload;
      }
      if (Array.isArray(payload.mine)) {
        mine = payload.mine;
      }
    }

    const normalizedCounts = {};
    Object.keys(counts || {}).forEach((emoji) => {
      const value = parseInt(counts[emoji], 10);
      if (Number.isFinite(value) && value > 0) {
        normalizedCounts[emoji] = value;
      }
    });

    const uniqueMine = Array.from(
      new Set((mine || []).filter((emoji) => emoji)),
    );
    return { counts: normalizedCounts, mine: uniqueMine };
  }

  getReactionState(messageId) {
    if (!this.currentChat) {
      return { counts: {}, mine: [] };
    }
    const cache = this.loadConversationCache(this.currentChat);
    const existing =
      cache && cache.reactions ? cache.reactions[messageId] : null;
    return this.normalizeReactionsPayload(existing);
  }

  updateReactions(messageId, reactions) {
    const previous = this.getReactionState(messageId);
    const normalized = this.normalizeReactionsPayload(reactions, previous);
    const element = this.messageElements.get(messageId);
    this.updateReactionCache(messageId, normalized);
    if (!element) {
      return;
    }
    const container = element.querySelector(".message-reactions");
    if (!container) {
      return;
    }

    const mineSet = new Set(normalized.mine || []);
    const counts = normalized.counts || {};
    const existing = new Map();
    container.querySelectorAll(".reaction").forEach((chip) => {
      const emoji =
        chip.dataset.emoji ||
        (chip.querySelector(".reaction-emoji")
          ? chip.querySelector(".reaction-emoji").textContent.trim()
          : "");
      if (emoji) {
        chip.dataset.emoji = emoji;
        existing.set(emoji, chip);
      }
    });

    Object.keys(counts).forEach((emoji) => {
      const count = counts[emoji];
      if (!count) {
        return;
      }
      let chip = existing.get(emoji);
      if (!chip) {
        chip = document.createElement("div");
        chip.className = "reaction";
        chip.dataset.emoji = emoji;
        chip.innerHTML =
          '<span class="reaction-emoji">' +
          emoji +
          '</span><span class="reaction-count">' +
          count +
          "</span>";
        chip.addEventListener("click", () => {
          const message = this.messageCache.get(messageId);
          if (message) {
            this.toggleReaction(message, emoji);
          }
        });
        container.appendChild(chip);
        existing.set(emoji, chip);
      } else {
        const countEl = chip.querySelector(".reaction-count");
        if (countEl && countEl.textContent !== String(count)) {
          countEl.textContent = String(count);
        }
      }
      chip.classList.toggle("mine", mineSet.has(emoji));
    });

    existing.forEach((chip, emoji) => {
      if (!counts[emoji]) {
        chip.remove();
        existing.delete(emoji);
      }
    });
    this.parseTwemoji(container);
  }

  async saveMessage(message) {
    if (this.isContentProtected()) {
      this.showToast("Saving is disabled for this chat");
      return;
    }
    const success = await this.forwardMessageToChat(message, {
      id: this.userId,
      type: "saved",
    });
    if (success) {
      this.showToast("Message saved");
    }
  }

  openForwardModal(message) {
    if (this.isContentProtected()) {
      this.showToast("Forwarding is disabled for this chat");
      return;
    }
    this.forwardMessage = message;
    if (this.elements.forwardModal) {
      this.elements.forwardModal.style.display = "flex";
      const content =
        this.elements.forwardModal.querySelector(".modal-content");
      if (content) {
        content.scrollTop = 0;
      }
      this.renderForwardList();
    }
  }

  closeForwardModal() {
    if (this.elements.forwardModal) {
      this.elements.forwardModal.style.display = "none";
    }
    this.forwardMessage = null;
  }

  renderForwardList() {
    if (!this.elements.forwardList) {
      return;
    }
    const term = this.elements.forwardSearch
      ? this.elements.forwardSearch.value.trim().toLowerCase()
      : "";
    this.elements.forwardList.innerHTML = "";
    this.conversations.forEach((conversation) => {
      const name = this.getConversationName(conversation);
      if (term && !name.toLowerCase().includes(term)) {
        return;
      }
      const item = document.createElement("div");
      item.className = "forward-item";
      const avatar = document.createElement("div");
      avatar.className = "forward-avatar";
      if (conversation.type === "group") {
        avatar.classList.add("group-avatar");
        const img = document.createElement("img");
        img.src = this.getAvatarUrl(
          conversation.group_pic,
          conversation.group_name,
          {
            type: "group",
            cacheKey: conversation.group_id || conversation.group_name,
          },
        );
        img.alt = conversation.group_name || "Group";
        this.disableImageDrag(img);
        avatar.appendChild(img);
      } else if (conversation.type === "channel") {
        avatar.classList.add("channel-avatar");
        const img = document.createElement("img");
        img.src = this.getAvatarUrl(
          conversation.channel_pic,
          conversation.channel_name,
          {
            type: "channel",
            cacheKey: conversation.channel_id || conversation.channel_name,
          },
        );
        img.alt = conversation.channel_name || "Channel";
        this.disableImageDrag(img);
        avatar.appendChild(img);
      } else if (conversation.type === "saved") {
        avatar.classList.add("saved-avatar");
        avatar.innerHTML = this.iconHtml("saved");
      } else {
        const img = document.createElement("img");
        img.src = this.getAvatarUrl(
          conversation.profile_pic,
          conversation.full_name || conversation.username,
          {
            type: "user",
            cacheKey:
              conversation.user_id ||
              conversation.username ||
              conversation.full_name,
          },
        );
        img.alt = conversation.username || conversation.full_name || "User";
        this.disableImageDrag(img);
        avatar.appendChild(img);
      }

      const info = document.createElement("div");
      info.className = "forward-info";
      const title = document.createElement("div");
      title.className = "forward-name";
      title.textContent = name;
      info.appendChild(title);

      item.appendChild(avatar);
      item.appendChild(info);
      item.addEventListener("click", async () => {
        if (this.forwardMessage) {
          const success = await this.forwardMessageToChat(this.forwardMessage, {
            id: this.getConversationId(conversation),
            type: conversation.type,
          });
          if (success) {
            const label =
              conversation.type === "direct" && conversation.username
                ? "@" + conversation.username
                : this.getConversationName(conversation);
            this.showToast("Message forwarded to " + label);
          }
        }
        this.closeForwardModal();
      });
      this.elements.forwardList.appendChild(item);
    });
  }

  async resolveForwardContentKey(message, contentKey) {
    if (!message || !contentKey) {
      return contentKey;
    }
    if (contentKey.extractable) {
      return contentKey;
    }
    const wrapped = this.getWrappedKeyForMessage(message);
    if (wrapped) {
      try {
        const extracted = await this.crypto.unwrapKey(wrapped, true);
        if (extracted) {
          return extracted;
        }
      } catch (err) {
        this.logE2EE("forward_key_unwrap_failed", {
          message_id: message.message_id,
          error: err && err.message ? err.message : "unwrap_error",
        });
      }
    }
    if (message.group_id) {
      try {
        return await this.getGroupContentKey(message.group_id, {
          forceRefresh: true,
          distribute: true,
        });
      } catch (err) {
        return contentKey;
      }
    }
    if (message.channel_id) {
      try {
        return await this.getChannelContentKey(message.channel_id, {
          forceRefresh: true,
          distribute: true,
        });
      } catch (err) {
        return contentKey;
      }
    }
    return contentKey;
  }

  async forwardMessageToChat(message, targetChat) {
    if (!message || !targetChat) {
      return false;
    }
    if (this.isContentProtected()) {
      this.showToast("Forwarding is disabled for this chat");
      return false;
    }
    const decrypted = await this.decryptMessage(message);
    if (!decrypted || !decrypted.plaintext) {
      this.showToast("Unable to decrypt message");
      return false;
    }
    const originLabel = this.getOriginLabel();
    const origin =
      this.currentChat &&
      (this.currentChat.type === "group" || this.currentChat.type === "channel")
        ? { type: this.currentChat.type, id: this.currentChat.id }
        : null;
    if (message.message_type === "text") {
      let textPayload = decrypted.plaintext;
      if (textPayload && textPayload.trim().startsWith("{")) {
        try {
          const parsed = JSON.parse(textPayload);
          if (
            parsed &&
            parsed.type === "text" &&
            typeof parsed.text === "string"
          ) {
            textPayload = parsed.text;
          }
        } catch (err) {
          // ignore malformed payloads
        }
      }
      if (originLabel) {
        textPayload = JSON.stringify({
          type: "text",
          text: textPayload,
          forwardFrom: originLabel,
        });
      }
      await this.sendTextMessage(textPayload, targetChat, { origin });
      return true;
    }
    let meta = null;
    try {
      meta = JSON.parse(decrypted.plaintext);
    } catch (err) {
      meta = { name: "File", mime: "", size: 0, fileIv: null };
    }
    if (originLabel && !meta.forwardFrom) {
      meta.forwardFrom = originLabel;
    }
    if (!meta.media_id && message.file_url) {
      meta.media_id = message.file_url;
    }
    if (message.file_url && (!meta.fileIv && !meta.fileIvs)) {
      const payload = {
        messageType: message.message_type,
        messageText: meta.caption || "",
        fileUrl: message.file_url,
      };
      if (origin) {
        payload.origin = origin;
      }
      if (targetChat.type === "group") {
        payload.groupId = targetChat.id;
      } else if (targetChat.type === "channel") {
        payload.channelId = targetChat.id;
      } else {
        const recipientId = targetChat.type === "saved" ? this.userId : targetChat.id;
        payload.receiverId = recipientId;
      }
      try {
        const res = await window.ApiClient.fetch("send_message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        return !!(data && data.success);
      } catch (err) {
        this.showToast("Failed to forward media");
        return false;
      }
    }
    if (!meta.fileIv && !meta.fileIvs) {
      this.showToast("File metadata missing");
      return false;
    }
    let contentKey = decrypted ? decrypted.key : null;
    if (!contentKey) {
      this.showToast("File missing");
      return false;
    }
    if (!contentKey.extractable) {
      contentKey = await this.resolveForwardContentKey(message, contentKey);
    }
    if (!contentKey || !contentKey.extractable) {
      this.showToast("Unable to forward this file");
      return false;
    }
    await this.forwardMediaReference(
      message,
      meta,
      contentKey,
      targetChat,
      origin,
    );
    return true;
  }

  async forwardMediaReference(message, meta, contentKey, targetChat, origin) {
    if (!message || !meta || !contentKey || !targetChat) {
      return;
    }
    const encryptedMeta = await this.crypto.encryptWithKey(
      contentKey,
      JSON.stringify(meta),
    );
    const payload = {
      messageType: message.message_type,
      encryptedContent: {
        v: 1,
        alg: "AES-GCM",
        iv: encryptedMeta.iv,
        ciphertext: encryptedMeta.ciphertext,
        tag: encryptedMeta.tag || null,
      },
      fileUrl: message.file_url,
    };
    if (origin) {
      payload.origin = origin;
    }

    if (targetChat.type === "group") {
      payload.groupId = targetChat.id;
      const members = await this.getGroupMembersWithKeys(targetChat.id);
      const rawKey = await crypto.subtle.exportKey("raw", contentKey);
      const wrapped = await Promise.all(
        members.map((member) => {
          if (!member.publicKey) {
            return null;
          }
          return this.crypto
            .wrapKey(contentKey, member.publicKey, rawKey)
            .then((wrappedKey) => ({
              userId: member.userId,
              wrappedKey: wrappedKey,
            }));
        }),
      );
      payload.messageKeys = wrapped.filter(Boolean);
      const keyId = await this.getKeyIdForKey(contentKey, {
        group_id: targetChat.id,
      });
      if (keyId) {
        payload.encryptedContent.kid = keyId;
      }
    } else if (targetChat.type === "channel") {
      payload.channelId = targetChat.id;
      const members = await this.getChannelMembersWithKeys(targetChat.id);
      const rawKey = await crypto.subtle.exportKey("raw", contentKey);
      const wrapped = await Promise.all(
        members.map((member) => {
          if (!member.publicKey) {
            return null;
          }
          return this.crypto
            .wrapKey(contentKey, member.publicKey, rawKey)
            .then((wrappedKey) => ({
              userId: member.userId,
              wrappedKey: wrappedKey,
            }));
        }),
      );
      payload.messageKeys = wrapped.filter(Boolean);
      const keyId = await this.getKeyIdForKey(contentKey, {
        channel_id: targetChat.id,
      });
      if (keyId) {
        payload.encryptedContent.kid = keyId;
      }
    } else {
      const recipientId =
        targetChat.type === "saved" ? this.userId : targetChat.id;
      let recipientKey =
        targetChat.type === "saved"
          ? this.crypto.publicKey
          : await this.getPublicKey(recipientId);
      if (!recipientKey && targetChat.type !== "saved") {
        await this.loadPublicKeys([recipientId]);
        recipientKey = await this.getPublicKey(recipientId);
      }
      if (!recipientKey) {
        this.logE2EE("direct_public_key_missing", {
          recipient_id: recipientId,
        });
        this.showToast("Recipient has not enabled encryption yet.");
        return;
      }
      const rawKey = await crypto.subtle.exportKey("raw", contentKey);
      payload.keySender = await this.crypto.wrapKey(
        contentKey,
        this.crypto.publicKey,
        rawKey,
      );
      payload.keyRecipient = await this.crypto.wrapKey(
        contentKey,
        recipientKey,
        rawKey,
      );
      payload.recipientId = recipientId;
      const keyId = await this.getKeyIdForKey(contentKey, {
        recipient_id: recipientId,
      });
      if (keyId) {
        payload.encryptedContent.kid = keyId;
      }
    }
    try {
      const res = await window.ApiClient.fetch("send_message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) {
        this.showToast(data.message || "Failed to forward media");
        return;
      }
      const messageId = data.message_id;
      if (this.mediaStore && meta.media_id && messageId) {
        const chatKey = this.getChatKeyFromChat(targetChat);
        this.mediaStore
          .saveMediaRef(messageId, meta.media_id, chatKey, message.message_type)
          .catch(() => {});
      }
      if (
        this.currentChat &&
        this.currentChat.type === targetChat.type &&
        this.currentChat.id === targetChat.id
      ) {
        const createdAt = new Date().toISOString();
        const outgoing = {
          message_id: messageId,
          sender_id: this.userId,
          receiver_id:
            targetChat.type === "group" || targetChat.type === "channel"
              ? null
              : targetChat.type === "saved"
                ? this.userId
                : targetChat.id,
          group_id: targetChat.type === "group" ? targetChat.id : null,
          channel_id: targetChat.type === "channel" ? targetChat.id : null,
          message_type: message.message_type,
          message_text: null,
          file_url: message.file_url,
          encrypted_content: payload.encryptedContent,
          key_sender: payload.keySender || null,
          key_recipient: payload.keyRecipient || null,
          created_at: createdAt,
          updated_at: null,
          reply_to_id: null,
          delivered_at: null,
          read_at: null,
          username: this.userName,
          profile_pic: null,
        };
        outgoing._plaintext = JSON.stringify(meta);
        outgoing._meta = meta;
        await this.appendMessages([outgoing]);
      }
    } catch (err) {
      console.error("Forward media failed", err);
    }
  }

  async pinChat(conversation, action) {
    try {
      await window.ApiClient.fetch("pin_chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatType: conversation.type,
          chatId: this.getConversationId(conversation),
          action: action,
        }),
      });
    } catch (err) {
      console.error("Pin chat failed", err);
    }
  }

  async togglePinCurrentChat() {
    if (!this.currentChat) {
      return;
    }
    const conversation = this.getConversation(
      this.currentChat.id,
      this.currentChat.type,
    );
    if (!conversation) {
      return;
    }
    const action = conversation.is_pinned ? "unpin" : "pin";
    await this.pinChat(conversation, action);
    try {
      await this.loadConversations();
    } catch (err) {}
    this.updateChatTopbar();
  }
  handleTyping() {
    const conversation = this.getCurrentConversation();
    if (conversation && conversation.type === "channel") {
      const perms = this.getChannelPermissionsFromConversation(conversation);
      if (!perms.can_post) {
        return;
      }
    }
    if (conversation && conversation.type === "group") {
      const perms = this.getGroupPermissionsFromConversation(conversation);
      if (!perms.can_send_messages) {
        return;
      }
    }
    this.lastInputAt = Date.now();
    if (
      this.elements.messageInput &&
      !this.elements.messageInput.value.trim()
    ) {
      this.sendActivity("typing", "");
      if (this.typingStopTimer) {
        clearTimeout(this.typingStopTimer);
        this.typingStopTimer = null;
      }
      return;
    }
    const now = Date.now();
    if (now - this.lastTypingSent < 1500) {
      if (this.typingStopTimer) {
        clearTimeout(this.typingStopTimer);
      }
      this.typingStopTimer = setTimeout(() => {
        this.sendActivity("typing", "");
      }, 1400);
      return;
    }
    this.lastTypingSent = now;
    this.sendActivity("typing", "1");
    if (this.typingStopTimer) {
      clearTimeout(this.typingStopTimer);
    }
    this.typingStopTimer = setTimeout(() => {
      this.sendActivity("typing", "");
    }, 1400);
  }

  async sendActivity(type, value) {
    if (!this.currentChat) {
      return;
    }
    if (this.currentChat.type === "saved") {
      return;
    }
    const isSaved = this.currentChat.type === "saved";
    const chatType = isSaved ? "direct" : this.currentChat.type;
    const chatId = isSaved ? this.userId : this.currentChat.id;
    if (chatType === "channel") {
      return;
    }
    const payload = {
      chatType: chatType,
      chatId: chatId,
      activityType: type,
      activityValue: value || "",
    };
    try {
      await window.ApiClient.fetch("activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.error("Activity update failed", err);
    }
  }

  async pollActivity() {
    if (!this.currentChat) {
      return;
    }
    const isSaved = this.currentChat.type === "saved";
    const chatType = isSaved ? "direct" : this.currentChat.type;
    if (chatType === "channel") {
      this.renderActivity([]);
      return;
    }
    let chatId = isSaved ? this.userId : this.currentChat.id;
    if (chatType === "direct" && !isSaved) {
      chatId = this.userId;
    }
    try {
      const res = await fetch(
        window.ApiClient.url("activity", { chatType: chatType, chatId: chatId }),
        { cache: "no-store" },
      );
      const data = await res.json();
      if (data.success && Array.isArray(data.activities)) {
        this.renderActivity(data.activities);
      }
    } catch (err) {
      console.error("Failed to poll activity", err);
    }
  }

  renderActivity(activities) {
    if (!this.elements.activityIndicator && !this.elements.typingBubble) {
      return;
    }
    let filtered = Array.isArray(activities) ? activities : [];
    if (this.currentChat && this.currentChat.type === "direct") {
      filtered = filtered.filter(
        (activity) => Number(activity.user_id) === Number(this.currentChat.id),
      );
    }
    if (this.currentChat && this.currentChat.type === "saved") {
      filtered = [];
    }
    if (!filtered.length) {
      this.clearAllTyping();
      return;
    }
    filtered.forEach((act) => {
      this.applyTypingEvent(
        {
          user_id: act.user_id,
          activity_type: act.activity_type || "typing",
          activity_value: act.activity_value || "",
        },
        "typing_start",
      );
    });
  }

  resolveUserName(userId) {
    const conversation = this.conversations.find(
      (conv) => conv.user_id === userId,
    );
    if (conversation) {
      return conversation.full_name || conversation.username;
    }
    const contact = this.contacts.find((c) => c.user_id === userId);
    return contact ? contact.full_name || contact.username : null;
  }

  startPolling() {
    this.conversationTimer = setInterval(() => {
      this.loadConversations();
    }, 12000);
    this.startPresencePing();
  }

  startPresencePing() {
    if (this.presenceTimer) {
      return;
    }
    this.updatePresence();
    this.presenceTimer = setInterval(() => {
      this.updatePresence();
    }, 30000);
  }

  async updatePresence() {
    try {
      await window.ApiClient.fetch("update_status");
    } catch (err) {
      console.error("Presence update failed", err);
    }
  }

  startMessagePolling() {
    this.stopMessagePolling();
    this.pollingActive = true;
    this.pollMessagesLoop();
  }

  stopMessagePolling() {
    this.pollingActive = false;
    if (this.pollAbort && this.pollAbort.abort) {
      this.pollAbort.abort();
    }
    this.pollAbort = null;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async pollMessagesLoop() {
    if (!this.pollingActive) {
      return;
    }
    if (this.pollInFlight) {
      this.pollTimer = setTimeout(
        () => this.pollMessagesLoop(),
        this.getAdaptivePollDelay(),
      );
      return;
    }
    this.pollInFlight = true;
    let hadError = false;
    try {
      const controller =
        typeof AbortController !== "undefined" ? new AbortController() : null;
      this.pollAbort = controller;
      const success = await this.syncEvents(
        controller ? controller.signal : undefined,
      );
      if (success) {
        this.pollFailureCount = 0;
      } else {
        hadError = true;
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        hadError = true;
      }
    } finally {
      this.pollAbort = null;
      this.pollInFlight = false;
    }
    if (hadError) {
      this.pollFailureCount = Math.min(this.pollFailureCount + 1, 6);
    }
    if (this.pollingActive) {
      this.pollTimer = setTimeout(
        () => this.pollMessagesLoop(),
        this.getAdaptivePollDelay(),
      );
    }
  }

  async syncEvents(signal) {
    const since = this.lastEventId || 0;
    try {
      const url = window.ApiClient.syncUrl("sync_events", { since: since });
      const options = signal
        ? { signal, cache: "no-store" }
        : { cache: "no-store" };
      const res = await fetch(url, options);
      const data = await res.json();
      if (!data || !data.success) {
        return false;
      }
      if (Array.isArray(data.events) && data.events.length) {
        await this.applyEvents(data.events);
      }
      if (typeof data.last_event_id !== "undefined") {
        const nextId = parseInt(data.last_event_id, 10) || since;
        if (nextId > this.lastEventId) {
          this.lastEventId = nextId;
          this.persistConversationMeta();
        }
      }
      return true;
    } catch (err) {
      if (err && err.name === "AbortError") {
        return false;
      }
      return false;
    }
  }

  async initEventCursor() {
    if (this.lastEventId) {
      return;
    }
    try {
      const res = await fetch(window.ApiClient.syncUrl("sync_events", { since: 0, cursor_only: 1 }), {
        cache: "no-store",
      });
      const data = await res.json();
      if (data && data.success) {
        const nextId = parseInt(data.last_event_id, 10) || 0;
        this.lastEventId = nextId;
        this.persistConversationMeta();
      }
    } catch (err) {}
  }

  getAdaptivePollDelay() {
    const hidden = typeof document !== "undefined" && document.hidden;
    let min = 800;
    let max = 1200;
    if (hidden) {
      min = 2500;
      max = 4000;
    } else if (this.isUserEngaged()) {
      min = 350;
      max = 600;
    }
    let delay = min + Math.random() * (max - min);
    if (this.pollFailureCount > 0) {
      delay *= Math.pow(2, this.pollFailureCount);
    }
    delay = Math.min(12000, Math.max(300, delay));
    return Math.round(delay);
  }

  isUserEngaged() {
    const recentInput =
      this.lastInputAt && Date.now() - this.lastInputAt < 2000;
    return !!(
      recentInput ||
      this.recordingState.active ||
      this.videoNoteState.active ||
      this.uploading ||
      this.pendingAttachment ||
      this.uploadTasks.size
    );
  }
  async decryptMessage(message) {
    if (!message) {
      return null;
    }
    const directPlain = message.message_text ?? (message.text ?? (message._plaintext ?? null));
    if (directPlain !== null && typeof directPlain === "string") {
      return { plaintext: directPlain, key: null };
    }
    if (message.encrypted_content && typeof message.encrypted_content === "string") {
      const trimmed = message.encrypted_content.trim();
      if (!trimmed.startsWith("v1:") && !trimmed.startsWith("v2:") && !trimmed.startsWith('{"v":1')) {
        return { plaintext: message.encrypted_content, key: null };
      }
    }
    if (!message.encrypted_content) {
      return null;
    }
    const context = {
      message_id: message.message_id,
      sender_id: message.sender_id,
      receiver_id: message.receiver_id,
      group_id: message.group_id,
      channel_id: message.channel_id,
    };
    const parsedPayload = this.parseEncryptedPayload(message.encrypted_content);
    if (parsedPayload && parsedPayload.kid) {
      context.key_id = parsedPayload.kid;
    }
    const wrappedKey = this.getWrappedKeyForMessage(message);
    if (wrappedKey) {
      const decrypted = await this.decryptWithWrappedKey(
        parsedPayload || message.encrypted_content,
        wrappedKey,
        context,
      );
      if (decrypted) {
        return decrypted;
      }
    }

    if (message.group_id) {
      const retryKey = `group:${message.message_id}`;
      let groupKey = await this.getGroupContentKey(message.group_id);
      let decrypted = await this.decryptWithContentKey(
        parsedPayload || message.encrypted_content,
        groupKey,
        context,
      );
      if (!decrypted && !this.decryptRetry.has(retryKey)) {
        this.decryptRetry.add(retryKey);
        groupKey = await this.getGroupContentKey(message.group_id, {
          forceRefresh: true,
        });
        decrypted = await this.decryptWithContentKey(
          parsedPayload || message.encrypted_content,
          groupKey,
          context,
        );
      }
      return decrypted;
    }

    if (message.channel_id) {
      const retryKey = `channel:${message.message_id}`;
      let channelKey = await this.getChannelContentKey(message.channel_id);
      let decrypted = await this.decryptWithContentKey(
        parsedPayload || message.encrypted_content,
        channelKey,
        context,
      );
      if (!decrypted && !this.decryptRetry.has(retryKey)) {
        this.decryptRetry.add(retryKey);
        channelKey = await this.getChannelContentKey(message.channel_id, {
          forceRefresh: true,
        });
        decrypted = await this.decryptWithContentKey(
          parsedPayload || message.encrypted_content,
          channelKey,
          context,
        );
      }
      return decrypted;
    }

    if (!this.decryptRetry.has(message.message_id)) {
      this.decryptRetry.add(message.message_id);
      const refreshed = await this.refreshDirectMessage(message);
      if (refreshed) {
        const refreshedKey = this.getWrappedKeyForMessage(refreshed);
        if (refreshedKey) {
          const retry = await this.decryptWithWrappedKey(
            refreshed.encrypted_content,
            refreshedKey,
            context,
          );
          if (retry) {
            return retry;
          }
        }
      }
    }
    this.logE2EE("direct_key_missing", context);
    return null;
  }

  getWrappedKeyForMessage(message) {
    if (message.key_for_user) {
      return message.key_for_user;
    }
    const senderId = parseInt(message.sender_id, 10);
    if (!Number.isNaN(senderId) && senderId === this.userId) {
      return message.key_sender;
    }
    return message.key_recipient;
  }

  async getPublicKey(userId) {
    if (this.publicKeyCache.has(userId)) {
      return this.publicKeyCache.get(userId);
    }
    const res = await window.ApiClient.fetch("public_keys", undefined, { user_ids: userId });
    const data = await res.json();
    if (!data.success || !data.keys || !data.keys[userId]) {
      return null;
    }
    const raw = data.keys[userId];
    const jwk = typeof raw === "string" ? JSON.parse(raw) : raw;
    const key = await this.crypto.importPublicKey(jwk);
    this.publicKeyCache.set(userId, key);
    return key;
  }

  async getGroupMembersWithKeys(groupId) {
    if (this.groupMemberCache.has(groupId)) {
      return this.groupMemberCache.get(groupId);
    }
    const res = await window.ApiClient.fetch("group_members", undefined, { group_id: groupId });
    const data = await res.json();
    if (!data.success || !Array.isArray(data.members)) {
      return [];
    }
    this.groupMemberInfoCache.set(groupId, data.members);
    const ids = data.members.map((member) => member.user_id);
    const keys = await this.loadPublicKeys(ids);
    const missing = data.members.filter(
      (member) => !keys.get(member.user_id) && member.user_id !== this.userId,
    );
    if (missing.length) {
      this.logE2EE("group_member_key_missing", {
        group_id: groupId,
        user_ids: missing.map((member) => member.user_id),
      });
    }
    const members = data.members
      .map((member) => {
        const publicKey =
          keys.get(member.user_id) ||
          (member.user_id === this.userId ? this.crypto.publicKey : null);
        return { userId: member.user_id, publicKey: publicKey };
      })
      .filter((member) => member.publicKey);
    this.groupMemberCache.set(groupId, members);
    return members;
  }

  async getGroupMemberInfo(groupId) {
    if (this.groupMemberInfoCache.has(groupId)) {
      return this.groupMemberInfoCache.get(groupId);
    }
    const res = await window.ApiClient.fetch("group_members", undefined, { group_id: groupId });
    const data = await res.json();
    if (!data.success || !Array.isArray(data.members)) {
      return [];
    }
    this.groupMemberInfoCache.set(groupId, data.members);
    return data.members;
  }

  async getChannelMembersWithKeys(channelId) {
    if (this.channelMemberCache.has(channelId)) {
      return this.channelMemberCache.get(channelId);
    }
    const res = await window.ApiClient.fetch("channel_members", undefined, { channel_id: channelId });
    const data = await res.json();
    if (!data.success || !Array.isArray(data.members)) {
      return [];
    }
    this.channelMemberInfoCache.set(channelId, data.members);
    const ids = data.members.map((member) => member.user_id);
    const keys = await this.loadPublicKeys(ids);
    const missing = data.members.filter(
      (member) => !keys.get(member.user_id) && member.user_id !== this.userId,
    );
    if (missing.length) {
      this.logE2EE("channel_member_key_missing", {
        channel_id: channelId,
        user_ids: missing.map((member) => member.user_id),
      });
    }
    const members = data.members
      .map((member) => {
        const publicKey =
          keys.get(member.user_id) ||
          (member.user_id === this.userId ? this.crypto.publicKey : null);
        return { userId: member.user_id, publicKey: publicKey };
      })
      .filter((member) => member.publicKey);
    this.channelMemberCache.set(channelId, members);
    return members;
  }

  async getChannelMemberInfo(channelId) {
    if (this.channelMemberInfoCache.has(channelId)) {
      return this.channelMemberInfoCache.get(channelId);
    }
    const res = await window.ApiClient.fetch("channel_members", undefined, { channel_id: channelId });
    const data = await res.json();
    if (!data.success || !Array.isArray(data.members)) {
      return [];
    }
    this.channelMemberInfoCache.set(channelId, data.members);
    return data.members;
  }

  async loadPublicKeys(userIds) {
    const missing = userIds.filter((id) => !this.publicKeyCache.has(id));
    if (missing.length) {
      const res = await window.ApiClient.fetch("public_keys", undefined, { user_ids: missing.join(",") });
      const data = await res.json();
      if (data.success && data.keys) {
        for (const id of Object.keys(data.keys)) {
          const raw = data.keys[id];
          if (!raw) {
            continue;
          }
          const jwk = typeof raw === "string" ? JSON.parse(raw) : raw;
          const key = await this.crypto.importPublicKey(jwk);
          this.publicKeyCache.set(parseInt(id, 10), key);
        }
      }
    }
    return this.publicKeyCache;
  }

  async fetchGroupKey(groupId) {
    const res = await fetch(window.ApiClient.url("group_key", { group_id: groupId }), {
      cache: "no-store",
    });
    const data = await res.json();
    if (data.success) {
      return data.wrapped_key || null;
    }
    return null;
  }

  async storeGroupKeys(groupId, keys) {
    const res = await window.ApiClient.fetch("group_key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group_id: groupId, keys: keys }),
    });
    const data = await res.json();
    return !!data.success;
  }

  async getGroupContentKey(groupId, options = {}) {
    let forceRefresh = !!options.forceRefresh;
    const allowCreate = !!options.allowCreate;
    const distribute = !!options.distribute;
    const members = options.members || null;

    if (!forceRefresh && distribute && this.groupKeyCache.has(groupId)) {
      const cached = this.groupKeyCache.get(groupId);
      if (cached && cached.extractable === false) {
        forceRefresh = true;
      }
    }

    if (!forceRefresh && this.groupKeyCache.has(groupId)) {
      const cached = this.groupKeyCache.get(groupId);
      if (cached && distribute && members && members.length) {
        try {
          const rawKey = await crypto.subtle.exportKey("raw", cached);
          const wrappedKeys = await Promise.all(
            members.map((member) =>
              this.crypto
                .wrapKey(cached, member.publicKey, rawKey)
                .then((wrappedKey) => ({
                  user_id: member.userId,
                  wrapped_key: wrappedKey,
                })),
            ),
          );
          await this.storeGroupKeys(groupId, wrappedKeys);
        } catch (err) {
          this.logE2EE("group_key_export_failed", { group_id: groupId });
        }
      }
      this.logE2EE("group_key_cache", {
        group_id: groupId,
        key_id: this.groupKeyIdCache.get(groupId) || null,
      });
      return cached;
    }

    if (this.groupKeyPending.has(groupId)) {
      return this.groupKeyPending.get(groupId);
    }

    const pending = (async () => {
      let wrappedKey = null;
      try {
        wrappedKey = await this.fetchGroupKey(groupId);
      } catch (err) {
        this.logE2EE("group_key_fetch_failed", {
          group_id: groupId,
          error: err && err.message ? err.message : "fetch_error",
        });
      }
      if (wrappedKey) {
        const key = await this.crypto.unwrapKey(wrappedKey, distribute);
        if (key) {
          this.groupKeyCache.set(groupId, key);
          const keyId = key.extractable
            ? await this.getKeyIdForKey(key, { group_id: groupId })
            : null;
          if (keyId) {
            this.groupKeyIdCache.set(groupId, keyId);
          }
          this.logE2EE("group_key_fetched", {
            group_id: groupId,
            key_id: keyId || null,
          });
          if (distribute && members && members.length) {
            try {
              const rawKey = await crypto.subtle.exportKey("raw", key);
              const wrappedKeys = await Promise.all(
                members.map((member) =>
                  this.crypto
                    .wrapKey(key, member.publicKey, rawKey)
                    .then((wrappedKey) => ({
                      user_id: member.userId,
                      wrapped_key: wrappedKey,
                    })),
                ),
              );
              await this.storeGroupKeys(groupId, wrappedKeys);
            } catch (err) {
              this.logE2EE("group_key_export_failed", { group_id: groupId });
            }
          }
          return key;
        }
        this.logE2EE("group_key_unwrap_failed", { group_id: groupId });
      }

      if (allowCreate) {
        const memberList =
          members && members.length
            ? members
            : await this.getGroupMembersWithKeys(groupId);
        if (!memberList.length) {
          this.logE2EE("group_key_members_missing", { group_id: groupId });
          return null;
        }
        const key = await this.crypto.generateContentKey();
        const rawKey = await crypto.subtle.exportKey("raw", key);
        const wrappedKeys = await Promise.all(
          memberList.map((member) =>
            this.crypto
              .wrapKey(key, member.publicKey, rawKey)
              .then((wrappedKey) => ({
                user_id: member.userId,
                wrapped_key: wrappedKey,
              })),
          ),
        );
        const stored = await this.storeGroupKeys(groupId, wrappedKeys);
        if (!stored) {
          this.logE2EE("group_key_store_failed", { group_id: groupId });
          return null;
        }
        this.groupKeyCache.set(groupId, key);
        const keyId = key.extractable
          ? await this.getKeyIdForKey(key, { group_id: groupId })
          : null;
        if (keyId) {
          this.groupKeyIdCache.set(groupId, keyId);
        }
        this.logE2EE("group_key_created", {
          group_id: groupId,
          key_id: keyId || null,
        });
        return key;
      }
      this.logE2EE("group_key_missing", { group_id: groupId });
      return null;
    })();

    this.groupKeyPending.set(groupId, pending);
    const key = await pending;
    this.groupKeyPending.delete(groupId);
    return key;
  }

  async fetchChannelKey(channelId) {
    const res = await fetch(window.ApiClient.url("channel_key", { channel_id: channelId }), {
      cache: "no-store",
    });
    const data = await res.json();
    if (data.success) {
      return data.wrapped_key || null;
    }
    return null;
  }

  async storeChannelKeys(channelId, keys) {
    const res = await window.ApiClient.fetch("channel_key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel_id: channelId, keys: keys }),
    });
    const data = await res.json();
    return !!data.success;
  }

  async getChannelContentKey(channelId, options = {}) {
    let forceRefresh = !!options.forceRefresh;
    const allowCreate = !!options.allowCreate;
    const distribute = !!options.distribute;
    const members = options.members || null;

    if (!forceRefresh && distribute && this.channelKeyCache.has(channelId)) {
      const cached = this.channelKeyCache.get(channelId);
      if (cached && cached.extractable === false) {
        forceRefresh = true;
      }
    }

    if (!forceRefresh && this.channelKeyCache.has(channelId)) {
      const cached = this.channelKeyCache.get(channelId);
      if (cached && distribute && members && members.length) {
        try {
          const rawKey = await crypto.subtle.exportKey("raw", cached);
          const wrappedKeys = await Promise.all(
            members.map((member) =>
              this.crypto
                .wrapKey(cached, member.publicKey, rawKey)
                .then((wrappedKey) => ({
                  user_id: member.userId,
                  wrapped_key: wrappedKey,
                })),
            ),
          );
          await this.storeChannelKeys(channelId, wrappedKeys);
        } catch (err) {
          this.logE2EE("channel_key_export_failed", { channel_id: channelId });
        }
      }
      this.logE2EE("channel_key_cache", {
        channel_id: channelId,
        key_id: this.channelKeyIdCache.get(channelId) || null,
      });
      return cached;
    }

    if (this.channelKeyPending.has(channelId)) {
      return this.channelKeyPending.get(channelId);
    }

    const pending = (async () => {
      let wrappedKey = null;
      try {
        wrappedKey = await this.fetchChannelKey(channelId);
      } catch (err) {
        this.logE2EE("channel_key_fetch_failed", {
          channel_id: channelId,
          error: err && err.message ? err.message : "fetch_error",
        });
      }
      if (wrappedKey) {
        const key = await this.crypto.unwrapKey(wrappedKey, distribute);
        if (key) {
          this.channelKeyCache.set(channelId, key);
          const keyId = key.extractable
            ? await this.getKeyIdForKey(key, { channel_id: channelId })
            : null;
          if (keyId) {
            this.channelKeyIdCache.set(channelId, keyId);
          }
          this.logE2EE("channel_key_fetched", {
            channel_id: channelId,
            key_id: keyId || null,
          });
          if (distribute && members && members.length) {
            try {
              const rawKey = await crypto.subtle.exportKey("raw", key);
              const wrappedKeys = await Promise.all(
                members.map((member) =>
                  this.crypto
                    .wrapKey(key, member.publicKey, rawKey)
                    .then((wrappedKey) => ({
                      user_id: member.userId,
                      wrapped_key: wrappedKey,
                    })),
                ),
              );
              await this.storeChannelKeys(channelId, wrappedKeys);
            } catch (err) {
              this.logE2EE("channel_key_export_failed", {
                channel_id: channelId,
              });
            }
          }
          return key;
        }
        this.logE2EE("channel_key_unwrap_failed", { channel_id: channelId });
      }

      if (allowCreate) {
        const memberList =
          members && members.length
            ? members
            : await this.getChannelMembersWithKeys(channelId);
        if (!memberList.length) {
          this.logE2EE("channel_key_members_missing", {
            channel_id: channelId,
          });
          return null;
        }
        const key = await this.crypto.generateContentKey();
        const rawKey = await crypto.subtle.exportKey("raw", key);
        const wrappedKeys = await Promise.all(
          memberList.map((member) =>
            this.crypto
              .wrapKey(key, member.publicKey, rawKey)
              .then((wrappedKey) => ({
                user_id: member.userId,
                wrapped_key: wrappedKey,
              })),
          ),
        );
        const stored = await this.storeChannelKeys(channelId, wrappedKeys);
        if (!stored) {
          this.logE2EE("channel_key_store_failed", { channel_id: channelId });
          return null;
        }
        this.channelKeyCache.set(channelId, key);
        const keyId = key.extractable
          ? await this.getKeyIdForKey(key, { channel_id: channelId })
          : null;
        if (keyId) {
          this.channelKeyIdCache.set(channelId, keyId);
        }
        this.logE2EE("channel_key_created", {
          channel_id: channelId,
          key_id: keyId || null,
        });
        return key;
      }
      this.logE2EE("channel_key_missing", { channel_id: channelId });
      return null;
    })();

    this.channelKeyPending.set(channelId, pending);
    const key = await pending;
    this.channelKeyPending.delete(channelId);
    return key;
  }

  getNotificationChatInfo(message) {
    if (!message) {
      return null;
    }
    let chatType = message.chat_type || null;
    let chatId = message.chat_id || null;
    if (!chatType || !chatId) {
      if (message.group_id) {
        chatType = "group";
        chatId = message.group_id;
      } else if (message.channel_id) {
        chatType = "channel";
        chatId = message.channel_id;
      } else {
        const otherId =
          message.sender_id === this.userId
            ? message.receiver_id
            : message.sender_id;
        if (!otherId) {
          return null;
        }
        chatType = "direct";
        chatId = otherId;
      }
    }
    const chatKey = `${chatType}:${chatId}`;
    const conversation =
      this.getConversation(chatId, chatType) ||
      (this.currentChat &&
      this.currentChat.type === chatType &&
      this.currentChat.id === chatId
        ? this.currentChat.meta
        : null);
    return { chatType, chatId, chatKey, conversation };
  }

  isConversationMuted(conversation) {
    if (!conversation || typeof conversation !== "object") {
      return false;
    }
    const chatKey = this.getConversationKey(conversation);
    if (chatKey && this.mutedChats.has(chatKey)) {
      return true;
    }
    if (
      conversation.notify_enabled === 0 ||
      conversation.notifications_enabled === 0
    ) {
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

  getNotificationTag(chatKey, messageId) {
    const safeKey = String(chatKey || "chat").replace(/[^a-zA-Z0-9_-]/g, "_");
    if (this.notificationSettings.notify_mode === "latest") {
      return `lc-chat-${safeKey}`;
    }
    return `lc-msg-${messageId || safeKey}`;
  }

  buildNotificationText(message, info) {
    const conversation = info ? info.conversation : null;
    const type = conversation ? conversation.type : info ? info.chatType : null;
    const showSender = !!this.notificationSettings.notify_show_sender;
    const showPreview = !!this.notificationSettings.notify_show_preview;
    let title = "New message";
    if (showSender) {
      if (type === "group") {
        const groupName =
          conversation && conversation.group_name
            ? conversation.group_name
            : "Group";
        const sender =
          message.username ||
          (conversation ? conversation.last_sender_name : "") ||
          "Someone";
        title = `${groupName} - ${sender}`;
      } else if (type === "channel") {
        const channelName =
          conversation && conversation.channel_name
            ? conversation.channel_name
            : "Channel";
        const sender =
          message.username ||
          (conversation ? conversation.last_sender_name : "") ||
          "";
        title = sender ? `${channelName} - ${sender}` : channelName;
      } else if (type === "saved") {
        title = "Saved Messages";
      } else {
        title =
          message.username ||
          (conversation
            ? conversation.full_name || conversation.username
            : "") ||
          "New message";
      }
    }

    let body = "You have a new message";
    if (showPreview) {
      if (message.message_type === "text") {
        const parsed = this.extractTextPayload(message._plaintext || "");
        body = parsed.text || "New message";
      } else {
        body = this.getMessageTypeLabel(message.message_type || "text");
      }
    }
    const isMention = this.isMentionNotification(message);
    if (conversation && Number(conversation.content_protection) === 1) {
      body = isMention ? "Mentioned you" : "New message";
      return { title, body };
    }
    if (isMention) {
      body = showPreview ? `Mentioned you: ${body}` : "Mentioned you";
    }
    return { title, body };
  }

  isMentionNotification(message) {
    if (!message) {
      return false;
    }
    if (Number(message.mention_flag || 0) === 1) {
      return true;
    }
    const mentions = Array.isArray(message.mentions) ? message.mentions : [];
    return mentions.includes(this.userId);
  }

  async openChatFromNotification(chatType, chatId) {
    if (!chatType || !chatId) {
      return;
    }
    const normalizedId = parseInt(chatId, 10) || chatId;
    await this.ready;
    if (
      this.currentChat &&
      this.currentChat.type === chatType &&
      this.currentChat.id === normalizedId
    ) {
      return;
    }
    let conversation = this.getConversation(normalizedId, chatType);
    if (!conversation) {
      try {
        await this.loadConversations();
        conversation = this.getConversation(normalizedId, chatType);
      } catch (err) {}
    }
    const fallback = conversation || { type: chatType };
    if (chatType === "direct") {
      fallback.user_id = normalizedId;
    } else if (chatType === "group") {
      fallback.group_id = normalizedId;
    } else if (chatType === "channel") {
      fallback.channel_id = normalizedId;
    }
    await this.openChat(normalizedId, chatType, fallback);
  }

  async openChatFromLink(chatType, chatId, messageId) {
    await this.openChatFromNotification(chatType, chatId);
    const targetId = parseInt(messageId, 10);
    if (!Number.isFinite(targetId) || targetId <= 0) {
      return;
    }
    await this.ensureMessageLoaded(targetId);
    this.scrollToMessage(targetId);
  }

  deferInitialChatOpen() {
    if (this.initialChatHandled || typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const chatType = params.get("chat_type");
    const chatId = parseInt(params.get("chat_id") || "0", 10);
    const messageId = parseInt(params.get("msg") || "0", 10);
    if (!chatType || !chatId) {
      return;
    }
    this.initialChatHandled = true;
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.delete("chat_type");
    nextUrl.searchParams.delete("chat_id");
    nextUrl.searchParams.delete("msg");
    window.history.replaceState(null, "", nextUrl.toString());
    setTimeout(() => {
      if (messageId) {
        this.openChatFromLink(chatType, chatId, messageId);
      } else {
        this.openChatFromNotification(chatType, chatId);
      }
    }, 0);
  }

  bindServiceWorkerMessages() {
    if (
      this.swMessageBound ||
      typeof navigator === "undefined" ||
      !navigator.serviceWorker
    ) {
      return;
    }
    this.swMessageBound = true;
    navigator.serviceWorker.addEventListener("message", (event) => {
      const data = event && event.data ? event.data : null;
      if (!data || data.type !== "open-chat") {
        return;
      }
      this.openChatFromNotification(data.chatType, data.chatId);
    });
  }

  async registerNotificationWorker() {
    if (typeof navigator === "undefined" || !navigator.serviceWorker) {
      return;
    }
    if (!this.userId) {
      return;
    }
    try {
      const registration = await navigator.serviceWorker.register("/service-worker.js");
      this.serviceWorkerRegistration = registration;
      this.bindServiceWorkerMessages();
      const permission =
        typeof Notification !== "undefined"
          ? Notification.permission
          : "default";
      if (registration.periodicSync && permission === "granted") {
        try {
          await registration.periodicSync.register("lc-notify-sync", {
            minInterval: 5 * 60 * 1000,
          });
        } catch (err) {}
      }
      this.syncNotificationStateToServiceWorker();
      if (permission === "granted") {
        this.ensurePushSubscription();
      }
    } catch (err) {
      console.error("Service worker registration failed", err);
    }
  }

  syncNotificationStateToServiceWorker() {
    if (typeof navigator === "undefined" || !navigator.serviceWorker) {
      return;
    }
    if (!this.userId) {
      return;
    }
    const controller =
      navigator.serviceWorker.controller ||
      (this.serviceWorkerRegistration
        ? this.serviceWorkerRegistration.active
        : null);
    if (!controller) {
      return;
    }
    const lastNotified = {};
    this.notificationState.lastNotified.forEach((value, key) => {
      lastNotified[key] = value;
    });
    controller.postMessage({
      type: "notify-sync",
      userId: this.userId,
      settings: this.notificationSettings,
      lastNotified: lastNotified,
    });
  }

  urlBase64ToUint8Array(input) {
    const padding = "=".repeat((4 - (input.length % 4)) % 4);
    const base64 = (input + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base64);
    const output = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) {
      output[i] = raw.charCodeAt(i);
    }
    return output;
  }

  async getVapidPublicKey() {
    if (this.vapidPublicKey) {
      return this.vapidPublicKey;
    }
    try {
      const res = await window.ApiClient.fetch("push_key");
      const data = await res.json();
      if (data.success && data.publicKey) {
        this.vapidPublicKey = data.publicKey;
        return this.vapidPublicKey;
      }
    } catch (err) {}
    return null;
  }

  async sendPushSubscription(subscription) {
    if (!subscription) {
      return;
    }
    let payload = null;
    try {
      payload = subscription.toJSON
        ? subscription.toJSON()
        : {
            endpoint: subscription.endpoint,
            keys: subscription.keys,
          };
    } catch (err) {
      payload = null;
    }
    if (!payload || !payload.endpoint) {
      return;
    }
    try {
      await window.ApiClient.fetch("push_subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (err) {}
  }

  async ensurePushSubscription() {
    if (this.pushSubscriptionPending) {
      return;
    }
    if (typeof window === "undefined" || !("PushManager" in window)) {
      return;
    }
    if (
      !this.notificationSettings.notify_enabled ||
      typeof Notification === "undefined" ||
      Notification.permission !== "granted"
    ) {
      return;
    }
    if (!this.serviceWorkerRegistration) {
      return;
    }
    this.pushSubscriptionPending = true;
    try {
      let subscription =
        await this.serviceWorkerRegistration.pushManager.getSubscription();
      if (!subscription) {
        const key = await this.getVapidPublicKey();
        if (!key) {
          return;
        }
        subscription =
          await this.serviceWorkerRegistration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: this.urlBase64ToUint8Array(key),
          });
      }
      if (subscription) {
        await this.sendPushSubscription(subscription);
      }
    } catch (err) {
      console.error("Push subscribe failed", err);
    } finally {
      this.pushSubscriptionPending = false;
    }
  }

  async clearPushSubscription() {
    if (!this.serviceWorkerRegistration || typeof window === "undefined") {
      return;
    }
    try {
      const subscription =
        await this.serviceWorkerRegistration.pushManager.getSubscription();
      if (!subscription) {
        return;
      }
      try {
        await window.ApiClient.fetch("push_unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
      } catch (err) {}
      await subscription.unsubscribe();
    } catch (err) {}
  }

  maybeNotify(message) {
    if (!this.notificationSettings.notify_enabled) {
      return false;
    }
    if (!this.notificationReady) {
      return false;
    }
    const info = this.getNotificationChatInfo(message);
    if (!info) {
      return false;
    }
    if (this.isConversationMuted(info.conversation)) {
      return false;
    }
    if (
      typeof document !== "undefined" &&
      document.visibilityState === "visible" &&
      document.hasFocus()
    ) {
      return false;
    }
    if (message && message.message_id) {
      const messageId = parseInt(message.message_id, 10);
      if (Number.isFinite(messageId)) {
        if (this.notifiedMessageIds.has(messageId)) {
          return false;
        }
        this.notifiedMessageIds.add(messageId);
        if (this.notifiedMessageIds.size > 1000) {
          this.notifiedMessageIds.clear();
        }
      }
    }
    const lastNotified =
      this.notificationState.lastNotified.get(info.chatKey) || 0;
    const messageId = parseInt(message.message_id, 10) || 0;
    if (messageId && messageId <= lastNotified) {
      return false;
    }
    const copy = this.buildNotificationText(message, info);
    const tag = this.getNotificationTag(info.chatKey, message.message_id);
    const didNotify = this.showNotification(copy.title, copy.body, {
      tag: tag,
      renotify: this.notificationSettings.notify_mode === "latest",
      data: {
        chatType: info.chatType,
        chatId: info.chatId,
        messageId: message.message_id || null,
      },
    });
    if (didNotify) {
      this.updateNotificationState(info.chatKey, message.message_id);
    }
    return didNotify;
  }

  async notifyConversationUpdates(previous, current) {
    if (!this.notificationSettings.notify_enabled) {
      return;
    }
    const prevMap = new Map();
    (previous || []).forEach((conversation) => {
      const key = this.getConversationKey(conversation);
      if (key) {
        prevMap.set(key, conversation);
      }
    });
    for (const conversation of current || []) {
      const key = this.getConversationKey(conversation);
      if (!key) {
        continue;
      }
      const messageId = parseInt(conversation.message_id, 10);
      if (!Number.isFinite(messageId) || messageId <= 0) {
        continue;
      }
      const prevConversation = prevMap.get(key);
      const prevId =
        prevConversation && prevConversation.message_id
          ? parseInt(prevConversation.message_id, 10)
          : 0;
      if (prevId && messageId <= prevId) {
        continue;
      }
      const senderId = parseInt(
        conversation.last_sender_id || conversation.sender_id,
        10,
      );
      if (senderId && senderId === this.userId) {
        continue;
      }
      const notifyMessage =
        await this.buildNotificationMessageFromConversation(conversation);
      if (notifyMessage) {
        const didNotify = this.maybeNotify(notifyMessage);
        if (!didNotify) {
          this.recordNotificationBaseline(notifyMessage);
        }
      }
    }
  }

  async buildNotificationMessageFromConversation(conversation) {
    if (!conversation) {
      return null;
    }
    const messageId = parseInt(conversation.message_id, 10);
    if (!Number.isFinite(messageId) || messageId <= 0) {
      return null;
    }
    const messageType = conversation.message_type || "text";
    const senderId =
      parseInt(conversation.last_sender_id || conversation.sender_id, 10) ||
      null;
    let senderName = "New message";
    let chatType = conversation.type || "direct";
    let chatId = this.getConversationId(conversation);
    if (conversation.type === "group") {
      senderName = conversation.last_sender_name || "Someone";
    } else if (conversation.type === "channel") {
      senderName = conversation.last_sender_name || "Channel";
    } else if (conversation.type === "saved") {
      senderName = "Saved Messages";
    } else {
      senderName = conversation.full_name || conversation.username || "Chat";
    }

    let plaintext = conversation.preview_plaintext || "";
    if (
      !plaintext &&
      messageType === "text" &&
      conversation.encrypted_content
    ) {
      const previewMessage = {
        message_id: messageId,
        sender_id: senderId,
        receiver_id: null,
        group_id: conversation.group_id || null,
        channel_id: conversation.channel_id || null,
        message_type: messageType,
        encrypted_content: conversation.encrypted_content,
        key_sender: conversation.key_sender || null,
        key_recipient: conversation.key_recipient || null,
        key_for_user: conversation.key_for_user || null,
      };
      if (conversation.type === "direct") {
        const receiverId =
          senderId === this.userId ? conversation.user_id : this.userId;
        previewMessage.receiver_id = receiverId;
      }
      const decrypted = await this.decryptMessage(previewMessage);
      if (decrypted && decrypted.plaintext) {
        const parsed = this.extractTextPayload(decrypted.plaintext);
        plaintext = parsed.text || "";
      }
    }

    return {
      message_id: messageId,
      sender_id: senderId,
      receiver_id: conversation.type === "direct" ? this.userId : null,
      group_id: conversation.type === "group" ? conversation.group_id : null,
      channel_id:
        conversation.type === "channel" ? conversation.channel_id : null,
      message_type: messageType,
      _plaintext: plaintext,
      username: senderName,
      chat_type: chatType,
      chat_id: chatId,
      mention_flag: conversation.mention_flag || 0,
    };
  }

  showToast(text, type) {
    if (!this.elements.toast) {
      return;
    }
    const toast = this.elements.toast;
    toast.textContent = text;
    toast.classList.remove("toast-success", "toast-error", "toast-info");
    const normalized = (type || "").trim().toLowerCase();
    let variant = normalized;
    if (!variant) {
      const lower = String(text || "").toLowerCase();
      if (
        /(failed|unable|cannot|can not|missing|disabled|error|not|denied)/.test(
          lower,
        )
      ) {
        variant = "error";
      } else if (
        /(saved|forwarded|copied|enabled|ready|restored|synced)/.test(lower)
      ) {
        variant = "success";
      } else {
        variant = "info";
      }
    }
    toast.classList.add("toast-" + variant);
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
    if (this.elements.chatInputContainer) {
      const rect = this.elements.chatInputContainer.getBoundingClientRect();
      const offset = Math.max(24, Math.round(rect.height + 20));
      toast.style.bottom = offset + "px";
    } else {
      toast.style.bottom = "24px";
    }
    toast.classList.add("show");
    this.toastTimer = setTimeout(() => {
      toast.classList.remove("show");
    }, 2800);
  }

  logE2EE(event, details) {
    return;
  }

  async getKeyIdForKey(key, context) {
    if (!key) {
      return null;
    }
    try {
      const raw = await crypto.subtle.exportKey("raw", key);
      const digest = await crypto.subtle.digest("SHA-256", raw);
      const short = new Uint8Array(digest).slice(0, 8);
      return CryptoManager.toBase64(short);
    } catch (err) {
      this.logE2EE(
        "key_id_failed",
        Object.assign(
          { error: err && err.message ? err.message : "key_id_error" },
          context || {},
        ),
      );
      return null;
    }
  }

  parseEncryptedPayload(payload) {
    if (!payload) {
      return null;
    }
    if (typeof payload === "string") {
      try {
        return JSON.parse(payload);
      } catch (err) {
        return null;
      }
    }
    return payload;
  }

  async decryptWithWrappedKey(payload, wrappedKey, context) {
    if (!wrappedKey) {
      this.logE2EE("missing_wrapped_key", context);
      return null;
    }
    const parsed = this.parseEncryptedPayload(payload);
    const logContext =
      parsed && parsed.kid
        ? Object.assign({ key_id: parsed.kid }, context)
        : context;
    if (!parsed || !parsed.iv || !parsed.ciphertext) {
      this.logE2EE("malformed_payload", logContext);
      return null;
    }
    this.logE2EE(
      "key_payload",
      Object.assign({ key_id: parsed.kid || null, source: "payload" }, context),
    );
    let contentKey = null;
    try {
      contentKey = await this.crypto.unwrapKey(wrappedKey);
    } catch (err) {
      this.logE2EE(
        "unwrap_failed",
        Object.assign(
          { error: err && err.message ? err.message : "unwrap_error" },
          logContext,
        ),
      );
      return null;
    }
    if (!contentKey) {
      this.logE2EE("missing_content_key", logContext);
      return null;
    }
    try {
      const plaintextBuffer = await this.crypto.decryptWithKey(
        contentKey,
        parsed.iv,
        parsed.ciphertext,
      );
      return {
        plaintext: new TextDecoder().decode(plaintextBuffer),
        key: contentKey,
      };
    } catch (err) {
      const reason =
        err && err.name === "OperationError"
          ? "auth_tag_mismatch"
          : "decrypt_failed";
      this.logE2EE(
        reason,
        Object.assign(
          { error: err && err.message ? err.message : "decrypt_error" },
          logContext,
        ),
      );
      return null;
    }
  }

  async decryptWithContentKey(payload, contentKey, context) {
    if (!contentKey) {
      this.logE2EE("missing_shared_key", context);
      return null;
    }
    const parsed = this.parseEncryptedPayload(payload);
    const logContext =
      parsed && parsed.kid
        ? Object.assign({ key_id: parsed.kid }, context)
        : context;
    if (!parsed || !parsed.iv || !parsed.ciphertext) {
      this.logE2EE("malformed_payload", logContext);
      return null;
    }
    try {
      const plaintextBuffer = await this.crypto.decryptWithKey(
        contentKey,
        parsed.iv,
        parsed.ciphertext,
      );
      return {
        plaintext: new TextDecoder().decode(plaintextBuffer),
        key: contentKey,
      };
    } catch (err) {
      const reason =
        err && err.name === "OperationError"
          ? "auth_tag_mismatch"
          : "decrypt_failed";
      this.logE2EE(
        reason,
        Object.assign(
          { error: err && err.message ? err.message : "decrypt_error" },
          logContext,
        ),
      );
      return null;
    }
  }

  async refreshDirectMessage(message) {
    if (!message) {
      return null;
    }
    const senderId = parseInt(message.sender_id, 10);
    const receiverId = parseInt(message.receiver_id, 10);
    if (Number.isNaN(senderId) || Number.isNaN(receiverId)) {
      return null;
    }
    const otherId = senderId === this.userId ? receiverId : senderId;
    if (!otherId) {
      return null;
    }
    const sinceId = Math.max(0, parseInt(message.message_id, 10) - 1);
    try {
      const res = await fetch(
        window.ApiClient.url("messages", { user_id: otherId, since_id: sinceId }),
        { cache: "no-store" },
      );
      const data = await res.json();
      if (!data.success || !Array.isArray(data.messages)) {
        return null;
      }
      const refreshed = data.messages.find(
        (msg) =>
          parseInt(msg.message_id, 10) === parseInt(message.message_id, 10),
      );
      if (refreshed) {
        const parsedId = parseInt(refreshed.message_id, 10);
        if (!Number.isNaN(parsedId)) {
          refreshed.message_id = parsedId;
        }
        if (refreshed.sender_id !== null && refreshed.sender_id !== undefined) {
          const parsedSender = parseInt(refreshed.sender_id, 10);
          if (!Number.isNaN(parsedSender)) {
            refreshed.sender_id = parsedSender;
          }
        }
        if (
          refreshed.receiver_id !== null &&
          refreshed.receiver_id !== undefined
        ) {
          const parsedReceiver = parseInt(refreshed.receiver_id, 10);
          if (!Number.isNaN(parsedReceiver)) {
            refreshed.receiver_id = parsedReceiver;
          }
        }
        this.messageCache.set(refreshed.message_id, refreshed);
        return refreshed;
      }
    } catch (err) {
      this.logE2EE("direct_refresh_failed", {
        message_id: message.message_id,
        error: err && err.message ? err.message : "refresh_error",
      });
    }
    return null;
  }

  confirmAction(message) {
    return new Promise((resolve) => {
      if (!this.elements.confirmModal || !this.elements.confirmMessage) {
        resolve(true);
        return;
      }
      this.confirmResolver = resolve;
      this.elements.confirmMessage.textContent = message;
      this.elements.confirmModal.style.display = "flex";
    });
  }

  resolveConfirm(result) {
    if (this.elements.confirmModal) {
      this.elements.confirmModal.style.display = "none";
    }
    if (this.confirmResolver) {
      this.confirmResolver(result);
      this.confirmResolver = null;
    }
  }

  iconHtml(name, extraClass) {
    const cls = extraClass ? "icon " + extraClass : "icon";
    return (
      '<svg class="' +
      cls +
      '" aria-hidden="true"><use href="#icon-' +
      name +
      '"></use></svg>'
    );
  }

  createIconElement(name, extraClass) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", extraClass ? "icon " + extraClass : "icon");
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "#icon-" + name);
    svg.appendChild(use);
    return svg;
  }

  confirmDeleteScope(message) {
    return new Promise((resolve) => {
      if (
        !this.elements.deleteScopeModal ||
        !this.elements.deleteScopeMessage
      ) {
        resolve("me");
        return;
      }
      this.deleteResolver = resolve;
      const isOutgoing = message.sender_id === this.userId;
      let allowAll = isOutgoing;
      const conversation = this.getCurrentConversation();
      if (!allowAll && conversation && conversation.type === "channel") {
        const perms = this.getChannelPermissionsFromConversation(conversation);
        allowAll = !!perms.can_delete;
      }
      if (this.elements.deleteScopeAll) {
        this.elements.deleteScopeAll.style.display = allowAll
          ? "inline-flex"
          : "none";
      }
      this.elements.deleteScopeMessage.textContent = allowAll
        ? "Delete this message for yourself or everyone?"
        : "Delete this message for yourself?";
      this.elements.deleteScopeModal.style.display = "flex";
    });
  }

  resolveDeleteScope(choice) {
    if (this.elements.deleteScopeModal) {
      this.elements.deleteScopeModal.style.display = "none";
    }
    if (this.deleteResolver) {
      this.deleteResolver(choice);
      this.deleteResolver = null;
    }
  }

  getPresenceState(conversation) {
    if (!conversation || conversation.type !== "direct") {
      return "offline";
    }
    if (conversation.last_seen_hidden) {
      return "offline";
    }
    if (conversation.last_seen) {
      const lastSeen = new Date(conversation.last_seen);
      if (isNaN(lastSeen.getTime())) {
        return "offline";
      }
      const diff = Date.now() - lastSeen.getTime();
      return diff <= 60000 ? "online" : "offline";
    }
    return conversation.status === "online" ? "online" : "offline";
  }

  getPresenceLabel(conversation) {
    if (!conversation || conversation.type !== "direct") {
      return "";
    }
    if (conversation.last_seen_hidden) {
      return "Last seen hidden";
    }
    const state = this.getPresenceState(conversation);
    if (state === "online") {
      return "Online";
    }
    if (conversation.last_seen) {
      return "Last seen " + this.formatRelativeTime(conversation.last_seen);
    }
    return "Offline";
  }

  formatRelativeTime(dateValue) {
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) {
      return "recently";
    }
    const diff = Math.max(0, Date.now() - date.getTime());
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) {
      return seconds + "s ago";
    }
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return minutes + "m ago";
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return hours + "h ago";
    }
    const days = Math.floor(hours / 24);
    return days + "d ago";
  }
  getConversation(id, type) {
    if (type === "saved") {
      return (
        this.conversations.find((conv) => conv.type === "saved") || {
          type: "saved",
          user_id: this.userId,
          full_name: "Saved Messages",
          username: "saved",
        }
      );
    }
    const targetId = String(id);
    return this.conversations.find(
      (conv) =>
        String(this.getConversationId(conv)) === targetId &&
        conv.type === type,
    );
  }

  getConversationId(conversation) {
    if (!conversation) return null;
    if (conversation.type === "group") {
      return conversation.group_id;
    }
    if (conversation.type === "channel") {
      return conversation.channel_id;
    }
    if (conversation.type === "saved") {
      return conversation.user_id || this.userId;
    }
    return conversation.user_id;
  }

  getConversationKey(conversation) {
    if (!conversation || !conversation.type) {
      return null;
    }
    if (conversation.type === "saved" || (conversation.type === "direct" && Number(conversation.user_id) === Number(this.userId))) {
      return `saved:${this.userId}`;
    }
    return `${conversation.type}:${this.getConversationId(conversation)}`;
  }

  getConversationName(conversation) {
    if (conversation.type === "group") {
      return conversation.group_name || "Group";
    }
    if (conversation.type === "channel") {
      return conversation.channel_name || "Channel";
    }
    if (conversation.type === "saved") {
      return "Saved Messages";
    }
    return conversation.full_name || conversation.username || "Chat";
  }

  getChatKeyFromChat(chat) {
    if (!chat) {
      return null;
    }
    if (chat.type === "group") {
      return `group:${chat.id}`;
    }
    if (chat.type === "channel") {
      return `channel:${chat.id}`;
    }
    if (chat.type === "saved") {
      return `saved:${this.userId}`;
    }
    return `direct:${chat.id}`;
  }

  getChatKeyForMessage(message) {
    if (!message) {
      return null;
    }
    if (message.group_id) {
      return `group:${message.group_id}`;
    }
    if (message.channel_id) {
      return `channel:${message.channel_id}`;
    }
    if (
      message.sender_id === this.userId &&
      message.receiver_id === this.userId
    ) {
      return `saved:${this.userId}`;
    }
    const otherId =
      message.sender_id === this.userId
        ? message.receiver_id
        : message.sender_id;
    if (!otherId) {
      return `saved:${this.userId}`;
    }
    return `direct:${otherId}`;
  }

  getOriginLabel() {
    const conversation = this.currentChat
      ? this.getConversation(this.currentChat.id, this.currentChat.type) ||
        this.currentChat.meta
      : null;
    if (!conversation) {
      return "Chat";
    }
    if (conversation.type === "group") {
      return conversation.group_name || "Group";
    }
    if (conversation.type === "channel") {
      return conversation.channel_name || "Channel";
    }
    if (conversation.type === "direct") {
      return conversation.full_name || conversation.username || "Chat";
    }
    return "Saved Messages";
  }

  getConversationInitials(conversation) {
    const name = this.getConversationName(conversation);
    const parts = name.trim().split(" ");
    if (parts.length === 1) {
      return parts[0].charAt(0).toUpperCase();
    }
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  }

  getAvatarInitial(name) {
    const clean = (name || "").trim();
    if (!clean) {
      return "?";
    }
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const first = Array.from(parts[0])[0] || "";
      const second = Array.from(parts[1])[0] || "";
      const combined = `${first}${second}`.trim();
      return combined ? combined.toUpperCase() : "?";
    }
    const first = Array.from(parts[0])[0] || "?";
    return first.toUpperCase();
  }

  getAvatarColor(seed) {
    if (
      typeof window !== "undefined" &&
      typeof getComputedStyle === "function"
    ) {
      const root = document.documentElement;
      if (root) {
        const accent = getComputedStyle(root)
          .getPropertyValue("--primary-color")
          .trim();
        if (accent) {
          return accent;
        }
      }
    }
    const palette = [
      "#5B8DEF",
      "#F38BA8",
      "#F2B46F",
      "#78C2A4",
      "#8E7CF5",
      "#4CC9F0",
      "#F77F7F",
      "#6C9EFD",
    ];
    const value = String(seed || "chat");
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
      hash = (hash * 31 + value.charCodeAt(i)) % 2147483647;
    }
    return palette[hash % palette.length];
  }

  getAvatarFallbackUrl(name, type, cacheKey) {
    const initial = this.getAvatarInitial(name);
    const seed = name || type || "chat";
    const color = this.getAvatarColor(seed);
    const key = `avatar:fallback:${type || "user"}:${cacheKey || seed || initial}:${color}`;
    const now = Date.now();
    const cached = this.avatarTokenCache.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.url;
    }
    const fontSize = initial.length > 1 ? 34 : 42;
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">' +
      '<circle cx="50" cy="50" r="50" fill="' +
      color +
      '"/>' +
      '<text x="50" y="52" text-anchor="middle" dominant-baseline="middle" font-family="Segoe UI, Tahoma, sans-serif" font-size="' +
      fontSize +
      '" font-weight="600" fill="#ffffff">' +
      this.escapeHtml(initial) +
      "</text>" +
      "</svg>";
    const url = "data:image/svg+xml;utf8," + encodeURIComponent(svg);
    this.avatarTokenCache.set(key, {
      url: url,
      expiresAt: now + this.profileTtlMs,
    });
    return url;
  }

  getAvatarUrl(path, name, options = {}) {
    const safePath = (path || "").trim();
    const type = options.type || "user";
    const cacheKey = options.cacheKey || name || safePath || type;
    const normalized = safePath.toLowerCase();
    if (
      !safePath ||
      normalized === "default.png" ||
      normalized === "default_group.png" ||
      normalized === "default_channel.png"
    ) {
      return this.getAvatarFallbackUrl(name, type, cacheKey);
    }
    const key = `avatar:${cacheKey}:${safePath}`;
    const now = Date.now();
    const cached = this.avatarTokenCache.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.url;
    }
    const token = Math.floor(now / this.profileTtlMs);
    const url = "uploads/images/" + safePath + "?v=" + token;
    this.avatarTokenCache.set(key, {
      url: url,
      expiresAt: now + this.profileTtlMs,
    });
    return url;
  }

  disableImageDrag(img) {
    if (!img) {
      return;
    }
    img.draggable = false;
    img.addEventListener("dragstart", (event) => {
      event.preventDefault();
    });
  }

  getMessageTypeLabel(type) {
    switch (type) {
      case "image":
        return "Photo";
      case "voice":
        return "Voice message";
      case "audio":
        return "Audio";
      case "video":
        return "Video";
      case "video_note":
        return "Video Message";
      case "album":
        return "Photo album";
      case "file":
        return "File";
      default:
        return "Message";
    }
  }

  getMediaPreviewLabel(raw) {
    if (!raw || typeof raw !== "string") {
      return null;
    }
    const trimmed = raw.trim();
    if (!trimmed.startsWith("{")) {
      return null;
    }
    let meta = null;
    try {
      meta = JSON.parse(trimmed);
    } catch (err) {
      if (/"type"\s*:\s*"video_note"/.test(trimmed)) {
        return "Video Message";
      }
      return null;
    }
    if (!meta || typeof meta !== "object") {
      return null;
    }
    const type = meta.type;
    if (!type || type === "text") {
      return null;
    }
    if (type === "video_note") {
      return "Video Message";
    }
    if (type === "album") {
      return "Photo album";
    }
    if (
      !meta.fileIv &&
      !meta.fileIvs &&
      !meta.mime &&
      !meta.size &&
      !meta.duration
    ) {
      return null;
    }
    if (meta.caption) {
      return meta.caption;
    }
    if (meta.name) {
      return meta.name;
    }
    return this.getMessageTypeLabel(type);
  }

  extractTextPayload(raw) {
    if (raw && typeof raw === "object") {
      if (raw.type === "video_note") {
        return { text: "Video Message", forwardFrom: null };
      }
      return { text: String(raw), forwardFrom: null };
    }
    if (typeof raw !== "string") {
      return { text: raw ? String(raw) : "", forwardFrom: null };
    }
    const trimmed = raw.trim();
    if (!trimmed) {
      return { text: "", forwardFrom: null };
    }
    if (trimmed.startsWith("{")) {
      try {
        const payload = JSON.parse(trimmed);
        if (
          payload &&
          payload.type === "text" &&
          typeof payload.text === "string"
        ) {
          return {
            text: payload.text,
            forwardFrom: payload.forwardFrom || null,
          };
        }
        if (payload && payload.type === "video_note") {
          return { text: "Video Message", forwardFrom: null };
        }
      } catch (err) {
        // ignore malformed payloads
        if (/"type"\s*:\s*"video_note"/.test(trimmed)) {
          return { text: "Video Message", forwardFrom: null };
        }
      }
    }
    return { text: raw, forwardFrom: null };
  }

  scheduleChannelDecryptRetry(messageId) {
    const parsedId = parseInt(messageId, 10);
    if (!parsedId || this.channelDecryptTimers.has(parsedId)) {
      return;
    }
    const attempts = this.channelDecryptAttempts.get(parsedId) || 0;
    if (attempts >= 3) {
      return;
    }
    this.channelDecryptAttempts.set(parsedId, attempts + 1);
    const delay = 1200 + attempts * 1200;
    const timer = setTimeout(() => {
      this.channelDecryptTimers.delete(parsedId);
      this.refreshMessageElement(parsedId);
    }, delay);
    this.channelDecryptTimers.set(parsedId, timer);
  }

  getReplyPreview(message) {
    if (!message) {
      return "Message";
    }
    if (message.message_type === "text") {
      const parsed = this.extractTextPayload(message._plaintext || "");
      const preview = this.getPreviewFromMarkdown(parsed.text || "");
      return preview || "Message";
    }
    if (message._meta) {
      if (message._meta.caption) {
        return message._meta.caption;
      }
      if (message._meta.name) {
        return message._meta.name;
      }
    }
    return this.getMessageTypeLabel(message.message_type);
  }

  scrollToMessage(messageId) {
    const element = this.messageElements.get(messageId);
    if (!element) {
      return;
    }
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    element.classList.add("highlight");
    element.classList.add("tg-message-highlight");
    setTimeout(() => {
      element.classList.remove("highlight");
      element.classList.remove("tg-message-highlight");
    }, 1600);
  }

  formatTime(dateString) {
    if (!dateString) {
      return "";
    }
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  formatFullDateTime(dateString) {
    if (!dateString) {
      return "";
    }
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return "";
    }
    const pad = (value) => String(value).padStart(2, "0");
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  formatFileSize(bytes) {
    if (bytes === 0 || bytes === null || bytes === undefined) {
      return "0 bytes";
    }
    const sizes = ["bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(1) + " " + sizes[i];
  }

  getProfileCacheKey(userId) {
    if (!userId) {
      return null;
    }
    return `lc_profile_${userId}`;
  }

  getProfileFromCache(userId) {
    if (!userId) {
      return null;
    }
    const now = Date.now();
    const cached = this.profileCache.get(userId);
    if (cached && cached.expiresAt > now) {
      return cached.profile;
    }
    if (cached) {
      this.profileCache.delete(userId);
    }
    return null;
  }

  async getProfileFromStorage(userId) {
    if (!userId) {
      return null;
    }
    const key = this.getProfileCacheKey(userId);
    if (!key) {
      return null;
    }
    let parsed = null;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        return null;
      }
      parsed = JSON.parse(raw);
    } catch (err) {
      return null;
    }
    if (!parsed || !parsed.ts) {
      return null;
    }
    const now = Date.now();
    if (now - parsed.ts > this.profileTtlMs) {
      return null;
    }
    if (parsed.profile) {
      await this.storeProfileCache(userId, parsed.profile, parsed.ts);
      return parsed.profile;
    }
    if (!parsed.enc || !parsed.key) {
      return null;
    }
    try {
      await this.ready;
      const decrypted = await this.crypto.decryptPayload(
        parsed.enc,
        parsed.key,
      );
      if (!decrypted || !decrypted.plaintext) {
        return null;
      }
      const profile = JSON.parse(decrypted.plaintext);
      if (!profile || typeof profile !== "object") {
        return null;
      }
      this.profileCache.set(userId, {
        profile: profile,
        expiresAt: parsed.ts + this.profileTtlMs,
      });
      return profile;
    } catch (err) {
      return null;
    }
  }

  async storeProfileCache(userId, profile, timestamp) {
    if (!userId || !profile) {
      return;
    }
    const now = timestamp || Date.now();
    this.profileCache.set(userId, {
      profile: profile,
      expiresAt: now + this.profileTtlMs,
    });
    const key = this.getProfileCacheKey(userId);
    if (!key) {
      return;
    }
    try {
      await this.ready;
      if (!this.crypto || !this.crypto.publicKey) {
        return;
      }
      const payload = await this.crypto.encryptForDirect(
        JSON.stringify(profile),
        this.crypto.publicKey,
      );
      localStorage.setItem(
        key,
        JSON.stringify({
          v: 1,
          ts: now,
          enc: payload.encryptedContent,
          key: payload.keySender,
        }),
      );
    } catch (err) {
      // ignore storage failures
    }
  }

  async fetchProfileCached(userId, fallbackProfile, forceRefresh) {
    if (!userId) {
      return fallbackProfile || null;
    }
    if (!forceRefresh) {
      const cached = this.getProfileFromCache(userId);
      if (cached) {
        return cached;
      }
      const stored = await this.getProfileFromStorage(userId);
      if (stored) {
        return stored;
      }
    }
    if (this.profileFetches.has(userId)) {
      return this.profileFetches.get(userId);
    }
    const fetchPromise = (async () => {
      try {
        const res = await fetch(window.ApiClient.url("user_profile", { user_id: userId }), {
          cache: "no-store",
        });
        const data = await res.json();
        if (data.success && data.profile) {
          await this.storeProfileCache(userId, data.profile);
          return data.profile;
        }
      } catch (err) {
        console.error("Profile fetch failed", err);
      } finally {
        this.profileFetches.delete(userId);
      }
      if (fallbackProfile) {
        await this.storeProfileCache(userId, fallbackProfile);
      }
      return fallbackProfile || null;
    })();
    this.profileFetches.set(userId, fetchPromise);
    return fetchPromise;
  }

  getTopbarAvatarUrl(profile, userId) {
    const name = profile ? profile.full_name || profile.username : "";
    return this.getAvatarUrl(profile ? profile.profile_pic : null, name, {
      type: "user",
      cacheKey: userId || name || "user",
    });
  }

  renderDirectTopbar(profile, fallback) {
    if (!this.elements.chatTopbarAvatar || !this.elements.chatTopbarTitle) {
      return;
    }
    const merged = Object.assign({}, fallback || {}, profile || {});
    const userId = merged.user_id || (fallback ? fallback.user_id : null);
    const title = merged.full_name || merged.username || "Direct chat";
    const subtitle = this.getPresenceLabel(merged);
    const avatarUrl = this.getTopbarAvatarUrl(merged, userId);
    if (this.elements.chatTopbarTitle.textContent !== title) {
      this.elements.chatTopbarTitle.textContent = title;
    }
    if (
      this.elements.chatTopbarSubtitle &&
      this.elements.chatTopbarSubtitle.textContent !== subtitle
    ) {
      this.elements.chatTopbarSubtitle.textContent = subtitle;
    }
    const avatar = this.elements.chatTopbarAvatar;
    const hasImg = !!avatar.querySelector("img");
    if (avatar.dataset.avatarSrc !== avatarUrl || !hasImg) {
      avatar.innerHTML = "";
      avatar.dataset.avatarSrc = avatarUrl;
      const img = document.createElement("img");
      img.src = avatarUrl;
      img.alt = merged.username || title || "User";
      this.disableImageDrag(img);
      avatar.appendChild(img);
    }
    avatar.className = "chat-topbar-avatar";
  }

  refreshTopbarProfile(userId, fallback) {
    if (!userId || !this.currentChat || this.currentChat.type !== "direct") {
      return;
    }
    this.fetchProfileCached(userId, fallback, false).then((profile) => {
      if (!profile) {
        return;
      }
      if (
        !this.currentChat ||
        this.currentChat.type !== "direct" ||
        String(this.currentChat.id) !== String(userId)
      ) {
        return;
      }
      const conversation = this.getConversation(userId, "direct");
      if (conversation) {
        conversation.status = profile.status || "offline";
        conversation.last_seen = profile.last_seen || null;
        conversation.last_seen_hidden = Number(profile.last_seen_hidden || 0);
        const item = this.findConversationItemByKey(
          this.getConversationKey(conversation),
        );
        if (item) {
          this.updateConversationPresenceIndicator(item, conversation);
        }
        this.persistConversationsCache();
      }
      this.renderDirectTopbar(profile, fallback);
    });
  }

  getConversationsCacheKey() {
    if (!this.userId) {
      return null;
    }
    return `lc_conversations_${this.userId}`;
  }

  loadConversationsCache() {
    const key = this.getConversationsCacheKey();
    if (!key) {
      return [];
    }
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.conversations)) {
        return [];
      }
      return this.sanitizeConversations(parsed.conversations);
    } catch (err) {
      return [];
    }
  }

  persistConversationsCache() {
    const key = this.getConversationsCacheKey();
    if (!key) {
      return;
    }
    try {
      localStorage.setItem(
        key,
        JSON.stringify({
          conversations: this.conversations,
          cached_at: Date.now(),
        }),
      );
    } catch (err) {
      // ignore storage failures
    }
  }

  sanitizeConversations(conversations) {
    if (!Array.isArray(conversations)) {
      return [];
    }
    const myId = Number(this.userId);
    let seenSaved = false;
    const seenKeys = new Set();
    const result = [];

    for (const conversation of conversations) {
      if (!conversation || typeof conversation !== "object") {
        continue;
      }
      let type = conversation.type;
      if (!type || typeof type !== "string") {
        continue;
      }
      const isSelfDirect = (type === "direct" && myId && Number(conversation.user_id) === myId);
      if (type === "saved" || isSelfDirect) {
        if (seenSaved) {
          continue;
        }
        seenSaved = true;
        conversation.type = "saved";
        conversation.full_name = "Saved Messages";
        conversation.username = "saved";
        conversation.profile_pic = "saved.png";
      }

      if (conversation.type === "group" && !conversation.group_id) continue;
      if (conversation.type === "channel" && !conversation.channel_id) continue;
      if (conversation.type === "direct" && !conversation.user_id) continue;

      const key = this.getConversationKey(conversation);
      if (key) {
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
      }
      result.push(conversation);
    }
    return result;
  }

  getConversationCacheKey(chat) {
    if (!chat || !this.userId) {
      return null;
    }
    return `lc_cache_${this.userId}_${chat.type}_${chat.id}`;
  }

  loadConversationCache(chat) {
    const key = this.getConversationCacheKey(chat);
    if (!key) {
      return {
        messages: [],
        reactions: {},
        deleted: [],
        lastMessageId: 0,
        lastEventId: 0,
      };
    }
    if (this.localCache.has(key)) {
      return this.localCache.get(key);
    }
    let cache = {
      messages: [],
      reactions: {},
      deleted: [],
      lastMessageId: 0,
      lastEventId: 0,
    };
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        cache = {
          messages: Array.isArray(parsed.messages) ? parsed.messages : [],
          reactions:
            parsed.reactions && typeof parsed.reactions === "object"
              ? parsed.reactions
              : {},
          deleted: Array.isArray(parsed.deleted) ? parsed.deleted : [],
          lastMessageId: parseInt(parsed.lastMessageId, 10) || 0,
          lastEventId: parseInt(parsed.lastEventId, 10) || 0,
        };
      }
    } catch (err) {
      cache = {
        messages: [],
        reactions: {},
        deleted: [],
        lastMessageId: 0,
        lastEventId: 0,
      };
    }
    if (cache.messages.length > this.cacheLimit) {
      cache.messages = cache.messages.slice(
        cache.messages.length - this.cacheLimit,
      );
    }
    if (cache.messages.length) {
      const now = Date.now();
      cache.messages = cache.messages.filter((msg) => {
        if (!msg || !msg.expires_at) {
          return true;
        }
        const ts = Date.parse(msg.expires_at);
        if (Number.isNaN(ts)) {
          return true;
        }
        return ts > now;
      });
    }
    this.localCache.set(key, cache);
    return cache;
  }

  persistConversationCache() {
    if (!this.currentChat) {
      return;
    }
    const key = this.getConversationCacheKey(this.currentChat);
    if (!key) {
      return;
    }
    const cache = this.localCache.get(key);
    if (!cache) {
      return;
    }
    try {
      localStorage.setItem(key, JSON.stringify(cache));
    } catch (err) {
      // ignore storage failures
    }
  }

  persistConversationMeta() {
    if (!this.currentChat) {
      return;
    }
    const cache = this.loadConversationCache(this.currentChat);
    cache.lastMessageId = this.lastMessageId || 0;
    cache.lastEventId = this.lastEventId || 0;
    this.persistConversationCache();
  }

  sanitizeMessageForCache(message) {
    let safeMeta = null;
    if (message._meta && typeof message._meta === "object") {
      safeMeta = Object.assign({}, message._meta);
      if (safeMeta.thumb) {
        delete safeMeta.thumb;
      }
      if (safeMeta.thumb_mime) {
        delete safeMeta.thumb_mime;
      }
    }
    const safePlaintext =
      message.message_type === "text" ? (message._plaintext ?? null) : null;
    return {
      message_id: message.message_id,
      sender_id: message.sender_id,
      receiver_id: message.receiver_id ?? null,
      group_id: message.group_id ?? null,
      channel_id: message.channel_id ?? null,
      message_type: message.message_type,
      message_text: message.message_text ?? null,
      file_url: message.file_url ?? null,
      reply_to_id: message.reply_to_id ?? null,
      encrypted_content: message.encrypted_content ?? null,
      key_sender: message.key_sender ?? null,
      key_recipient: message.key_recipient ?? null,
      key_for_user: message.key_for_user ?? null,
      created_at: message.created_at ?? null,
      updated_at: message.updated_at ?? null,
      expires_at: message.expires_at ?? null,
      delivered_at: message.delivered_at ?? null,
      read_at: message.read_at ?? null,
      username: message.username ?? null,
      profile_pic: message.profile_pic ?? null,
      _meta: safeMeta,
      _plaintext: safePlaintext,
    };
  }

  upsertConversationCacheMessage(message) {
    if (!this.currentChat || !message || message._pending || message._failed) {
      return;
    }
    const messageId = parseInt(message.message_id, 10);
    if (!Number.isFinite(messageId) || messageId <= 0) {
      return;
    }
    if (this.deletedMessageIds.has(messageId)) {
      return;
    }
    const cache = this.loadConversationCache(this.currentChat);
    const map = new Map(
      cache.messages.map((msg) => [parseInt(msg.message_id, 10), msg]),
    );
    map.set(messageId, this.sanitizeMessageForCache(message));
    const sorted = Array.from(map.values()).sort((a, b) => {
      const aId = parseInt(a.message_id, 10) || 0;
      const bId = parseInt(b.message_id, 10) || 0;
      if (aId && bId) {
        return aId - bId;
      }
      const aTime = a.created_at ? Date.parse(a.created_at) : 0;
      const bTime = b.created_at ? Date.parse(b.created_at) : 0;
      return aTime - bTime;
    });
    if (sorted.length > this.cacheLimit) {
      cache.messages = sorted.slice(sorted.length - this.cacheLimit);
    } else {
      cache.messages = sorted;
    }
    cache.lastMessageId = Math.max(cache.lastMessageId || 0, messageId);
    this.persistConversationCache();
  }

  removeMessagesFromCache(messageIds) {
    if (!this.currentChat) {
      return;
    }
    const cache = this.loadConversationCache(this.currentChat);
    const ids = (messageIds || [])
      .map((id) => parseInt(id, 10))
      .filter((id) => Number.isFinite(id) && id > 0);
    if (!ids.length) {
      return;
    }
    const deleteSet = new Set(ids);
    cache.messages = cache.messages.filter(
      (msg) => !deleteSet.has(parseInt(msg.message_id, 10)),
    );
    cache.deleted = Array.from(
      new Set([...(cache.deleted || []), ...ids]),
    ).slice(-500);
    this.persistConversationCache();
  }

  updateReactionCache(messageId, reactions) {
    if (!this.currentChat) {
      return;
    }
    const cache = this.loadConversationCache(this.currentChat);
    cache.reactions = cache.reactions || {};
    const normalized = this.normalizeReactionsPayload(reactions);
    cache.reactions[messageId] = normalized;
    this.persistConversationCache();
  }

  applyCachedReactions(reactions) {
    if (!reactions || typeof reactions !== "object") {
      return;
    }
    Object.keys(reactions).forEach((messageId) => {
      const parsedId = parseInt(messageId, 10);
      if (!parsedId) {
        return;
      }
      this.updateReactions(parsedId, reactions[messageId]);
    });
  }

  applyReactionUpdates(reactionUpdates) {
    if (!reactionUpdates || typeof reactionUpdates !== "object") {
      return;
    }
    Object.keys(reactionUpdates).forEach((messageId) => {
      const parsedId = parseInt(messageId, 10);
      if (!parsedId) {
        return;
      }
      this.updateReactions(parsedId, reactionUpdates[messageId]);
    });
  }

  getCacheLimitBytes() {
    const limit = parseInt(this.mediaSettings.cache_limit_mb, 10);
    if (Number.isNaN(limit) || limit < 0) {
      return -1;
    }
    if (limit === 0) {
      return 0;
    }
    return limit * 1024 * 1024;
  }

  getConnectionProfile() {
    const connection =
      navigator.connection ||
      navigator.mozConnection ||
      navigator.webkitConnection;
    if (!connection) {
      return "wifi";
    }
    if (connection.type) {
      if (connection.type === "cellular") {
        return "mobile";
      }
      if (connection.type === "wifi" || connection.type === "ethernet") {
        return "wifi";
      }
    }
    const effective = connection.effectiveType || "";
    if (effective.includes("2g") || effective.includes("3g")) {
      return "mobile";
    }
    return "wifi";
  }

  shouldAutoDownload(type, meta) {
    let profile = this.getConnectionProfile();
    if (profile === "unknown") {
      profile = "wifi";
    }
    if (type === "image") {
      if (profile === "wifi") {
        return !!this.mediaSettings.auto_download_images_wifi;
      }
      if (profile === "mobile") {
        return !!this.mediaSettings.auto_download_images_mobile;
      }
      return false;
    }
    if (type === "video" || type === "video_note") {
      const limitMb = parseInt(
        this.mediaSettings.auto_download_video_limit,
        10,
      );
      if (!limitMb || limitMb <= 0) {
        return false;
      }
      const size = meta && meta.size ? parseInt(meta.size, 10) : null;
      if (!size || size > limitMb * 1024 * 1024) {
        return false;
      }
      if (profile === "wifi") {
        return !!this.mediaSettings.auto_download_videos_wifi;
      }
      if (profile === "mobile") {
        return !!this.mediaSettings.auto_download_videos_mobile;
      }
      return false;
    }
    if (type === "audio" || type === "voice") {
      const limitMb = parseInt(this.mediaSettings.auto_download_doc_limit, 10);
      if (!limitMb || limitMb <= 0) {
        return false;
      }
      const size = meta && meta.size ? parseInt(meta.size, 10) : null;
      if (!size || size > limitMb * 1024 * 1024) {
        return false;
      }
      if (profile === "wifi") {
        return !!this.mediaSettings.auto_download_audio_wifi;
      }
      if (profile === "mobile") {
        return !!this.mediaSettings.auto_download_audio_mobile;
      }
      return false;
    }
    if (type === "file") {
      const limitMb = parseInt(this.mediaSettings.auto_download_doc_limit, 10);
      if (!limitMb || limitMb <= 0) {
        return false;
      }
      const size = meta && meta.size ? parseInt(meta.size, 10) : null;
      if (!size || size > limitMb * 1024 * 1024) {
        return false;
      }
      if (profile === "wifi") {
        return !!this.mediaSettings.auto_download_docs_wifi;
      }
      if (profile === "mobile") {
        return !!this.mediaSettings.auto_download_docs_mobile;
      }
      return false;
    }
    return false;
  }

  checkAutoDownload(message) {
    if (!message || !message.message_id) {
      return;
    }
    if (message.sender_id === this.userId) {
      return;
    }
    if (
      !["image", "video", "video_note", "audio", "voice", "file"].includes(
        message.message_type,
      )
    ) {
      return;
    }
    const handler = this.mediaDownloadHandlers.get(message.message_id);
    if (!handler || typeof handler.download !== "function") {
      return;
    }
    if (typeof handler.getBlob === "function" && handler.getBlob()) {
      return;
    }
    const element = this.messageElements.get(message.message_id);
    if (element) {
      const card = element.querySelector(".media-card");
      if (
        card &&
        card.dataset.state &&
        card.dataset.state !== "not-downloaded"
      ) {
        return;
      }
    }
    if (!this.shouldAutoDownload(message.message_type, message._meta || {})) {
      return;
    }
    if (!("IntersectionObserver" in window)) {
      handler.download();
    }
  }

  truncate(text, limit) {
    if (!text) {
      return "";
    }
    return text.length > limit ? text.slice(0, limit) + "..." : text;
  }

  getTextDirection(text) {
    if (!text) {
      return "ltr";
    }
    const rtlPattern = /[\u0590-\u08FF]/;
    const ltrPattern = /[A-Za-z]/;
    let rtl = 0;
    let ltr = 0;
    for (const ch of String(text)) {
      if (rtlPattern.test(ch)) {
        rtl += 1;
      } else if (ltrPattern.test(ch)) {
        ltr += 1;
      }
    }
    if (rtl === ltr) {
      return "ltr";
    }
    return rtl > ltr ? "rtl" : "ltr";
  }

  splitDirectionalText(text) {
    const rtlPattern = /[\u0590-\u08FF]/;
    const ltrPattern = /[A-Za-z]/;
    const parts = [];
    let current = { dir: null, text: "" };
    const pushCurrent = () => {
      if (current.text) {
        parts.push(current);
      }
    };
    for (const ch of String(text)) {
      const dir = rtlPattern.test(ch)
        ? "rtl"
        : ltrPattern.test(ch)
          ? "ltr"
          : null;
      if (!dir) {
        current.text += ch;
        continue;
      }
      if (!current.dir) {
        current.dir = dir;
        current.text += ch;
        continue;
      }
      if (current.dir === dir) {
        current.text += ch;
        continue;
      }
      pushCurrent();
      current = { dir: dir, text: ch };
    }
    pushCurrent();
    return parts;
  }

  renderDirectionalText(element, text) {
    if (!element) {
      return;
    }
    element.textContent = "";
    element.classList.add("bidi-text");
    const content = text == null ? "" : String(text);
    const baseDir = this.getTextDirection(content);
    element.setAttribute("dir", baseDir);
    const parts = this.splitDirectionalText(content);
    const fragment = document.createDocumentFragment();
    parts.forEach((part) => {
      if (!part.dir || part.dir === baseDir) {
        fragment.appendChild(document.createTextNode(part.text));
        return;
      }
      const bdi = document.createElement("bdi");
      bdi.setAttribute("dir", part.dir);
      bdi.textContent = part.text;
      fragment.appendChild(bdi);
    });
    element.appendChild(fragment);
  }

  escapeHtml(text) {
    if (!text) {
      return "";
    }
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  getLatestIncomingMessageIdForCurrentChat() {
    if (!this.currentChat) {
      return 0;
    }
    const currentKey = this.getChatKeyFromChat(this.currentChat);
    if (!currentKey) {
      return 0;
    }
    let latestId = 0;
    this.messageCache.forEach((message) => {
      if (!message || message._pending || message._failed) {
        return;
      }
      const messageId = parseInt(message.message_id, 10);
      if (!Number.isFinite(messageId) || messageId <= 0) {
        return;
      }
      if (this.getChatKeyForMessage(message) !== currentKey) {
        return;
      }
      const senderId = parseInt(message.sender_id, 10);
      if (Number.isFinite(senderId) && senderId === this.userId) {
        return;
      }
      if (messageId > latestId) {
        latestId = messageId;
      }
    });
    return latestId;
  }

  markConversationAsReadLocal(chatKey, seenMessageId) {
    if (!chatKey) {
      return;
    }
    const conversation = this.getConversationByKey(chatKey);
    if (!conversation) {
      return;
    }
    conversation.is_unread = 0;
    if (
      conversation.message_id &&
      parseInt(conversation.message_id, 10) <= seenMessageId
    ) {
      conversation.mention_flag = 0;
    }
    const item = this.findConversationItemByKey(chatKey);
    if (item) {
      item.classList.remove("unread");
      this.updateConversationPreview(item, conversation);
      this.updateConversationPresenceIndicator(item, conversation);
    }
    this.persistConversationsCache();
  }

  queueMarkSeen() {
    if (!this.currentChat) {
      return;
    }
    const chatKey = this.getChatKeyFromChat(this.currentChat);
    if (!chatKey) {
      return;
    }
    const messageId = this.getLatestIncomingMessageIdForCurrentChat();
    if (!messageId) {
      return;
    }
    const alreadySeen = this.lastSeenByChat.get(chatKey) || 0;
    if (messageId <= alreadySeen) {
      return;
    }
    this.pendingSeen = {
      chatKey: chatKey,
      chatType: this.currentChat.type,
      chatId: this.currentChat.id,
      messageId: messageId,
    };
    if (this.seenRequestInFlight) {
      return;
    }
    const elapsed = Date.now() - this.lastSeenSentAt;
    const wait = this.seenRateLimitMs - elapsed;
    if (wait <= 0) {
      this.flushMarkSeen();
      return;
    }
    if (this.seenSendTimer) {
      clearTimeout(this.seenSendTimer);
    }
    this.seenSendTimer = setTimeout(() => this.flushMarkSeen(), wait);
  }

  async flushMarkSeen() {
    if (this.seenRequestInFlight || !this.pendingSeen) {
      return;
    }
    if (this.seenSendTimer) {
      clearTimeout(this.seenSendTimer);
      this.seenSendTimer = null;
    }
    const pending = this.pendingSeen;
    const currentKey = this.currentChat
      ? this.getChatKeyFromChat(this.currentChat)
      : null;
    if (!currentKey || currentKey !== pending.chatKey) {
      this.pendingSeen = null;
      return;
    }
    const alreadySeen = this.lastSeenByChat.get(pending.chatKey) || 0;
    if (pending.messageId <= alreadySeen) {
      this.pendingSeen = null;
      return;
    }
    this.pendingSeen = null;
    this.seenRequestInFlight = true;
    this.lastSeenSentAt = Date.now();
    try {
      const res = await window.ApiClient.fetch("mark_seen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatType: pending.chatType,
          chatId: pending.chatId,
          messageId: pending.messageId,
        }),
      });
      const data = await res.json();
      if (data && data.success) {
        const seenId = parseInt(data.seen_message_id, 10);
        const nextSeen =
          Number.isFinite(seenId) && seenId > 0 ? seenId : pending.messageId;
        const previous = this.lastSeenByChat.get(pending.chatKey) || 0;
        if (nextSeen > previous) {
          this.lastSeenByChat.set(pending.chatKey, nextSeen);
          this.markConversationAsReadLocal(pending.chatKey, nextSeen);
        }
      }
    } catch (err) {
    } finally {
      this.seenRequestInFlight = false;
      if (this.pendingSeen) {
        this.queueMarkSeen();
      }
    }
  }

  scrollToBottom(behavior) {
    if (!this.elements.messageContainer) {
      return;
    }
    const mode = behavior === "smooth" ? "smooth" : "auto";
    if (typeof this.elements.messageContainer.scrollTo === "function") {
      this.elements.messageContainer.scrollTo({
        top: this.elements.messageContainer.scrollHeight,
        behavior: mode,
      });
      return;
    }
    this.elements.messageContainer.scrollTop =
      this.elements.messageContainer.scrollHeight;
  }

  isUserNearBottom() {
    if (!this.elements.messageContainer) {
      return true;
    }
    const el = this.elements.messageContainer;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    return distance < 120;
  }

  handleMessageScroll() {
    if (this.isUserNearBottom()) {
      this.resetNewMessagesJump();
      this.queueMarkSeen();
      return;
    }
    this.updateNewMessagesJump();
  }

  updateNewMessagesJump() {
    if (!this.elements.newMessagesJump) {
      return;
    }
    if (this.newMessagesCount > 0 && !this.isUserNearBottom()) {
      if (this.elements.newMessagesJumpCount) {
        this.elements.newMessagesJumpCount.textContent = String(
          this.newMessagesCount,
        );
      }
      this.elements.newMessagesJump.style.display = "inline-flex";
      return;
    }
    this.elements.newMessagesJump.style.display = "none";
  }

  bumpNewMessagesJump(count) {
    const increment = Number.isFinite(count)
      ? Math.max(0, Math.floor(count))
      : 0;
    if (!increment) {
      return;
    }
    this.newMessagesCount += increment;
    this.updateNewMessagesJump();
  }

  resetNewMessagesJump() {
    this.newMessagesCount = 0;
    if (this.elements.newMessagesJumpCount) {
      this.elements.newMessagesJumpCount.textContent = "0";
    }
    if (this.elements.newMessagesJump) {
      this.elements.newMessagesJump.style.display = "none";
    }
  }

  ensureMediaObserver() {
    if (this.mediaObserver || !("IntersectionObserver" in window)) {
      return;
    }
    this.mediaObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }
          const target = entry.target;
          const handler = target._autoDownloadHandler;
          if (typeof handler === "function") {
            handler();
          }
        });
      },
      {
        root: this.elements.messageContainer || null,
        rootMargin: "800px 0px",
        threshold: 0.1,
      },
    );
  }

  observeMediaMessage(element, handler) {
    if (!element || typeof handler !== "function") {
      return;
    }
    this.ensureMediaObserver();
    if (!this.mediaObserver) {
      return;
    }
    element._autoDownloadHandler = () => {
      if (element._autoDownloadFired) {
        return;
      }
      element._autoDownloadFired = true;
      handler();
    };
    this.mediaObserver.observe(element);
  }

  queueMediaDownload(messageId, runner) {
    const id = parseInt(messageId, 10);
    if (!id || typeof runner !== "function") {
      return;
    }
    if (this.activeMediaDownloads.has(id)) {
      return;
    }
    if (this.mediaDownloadQueue.some((entry) => entry.messageId === id)) {
      return;
    }
    const entry = { messageId: id, runner: runner };
    if (this.activeMediaDownloads.size >= this.maxMediaDownloads) {
      this.mediaDownloadQueue.push(entry);
      return;
    }
    this.startQueuedMediaDownload(entry);
  }

  startQueuedMediaDownload(entry) {
    this.activeMediaDownloads.set(entry.messageId, true);
    Promise.resolve()
      .then(entry.runner)
      .catch(() => {})
      .finally(() => {
        this.activeMediaDownloads.delete(entry.messageId);
        this.processMediaDownloadQueue();
      });
  }

  processMediaDownloadQueue() {
    while (
      this.mediaDownloadQueue.length &&
      this.activeMediaDownloads.size < this.maxMediaDownloads
    ) {
      const entry = this.mediaDownloadQueue.shift();
      if (!entry) {
        return;
      }
      if (this.activeMediaDownloads.has(entry.messageId)) {
        continue;
      }
      this.startQueuedMediaDownload(entry);
    }
  }
}
