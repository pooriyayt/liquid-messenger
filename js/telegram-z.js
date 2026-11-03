/**
 * ============================================================================
 * Telegram Web Z - Complete Interactive Engine & Shell Architecture
 * Reference: https://github.com/TelegramOrg/Telegram-web-z
 * Strictly active under data-theme="telegram-z" and body.theme-telegram-z
 * ============================================================================
 */

(function () {
    'use strict';

    function getChatApp() {
        return window.chatApp || window.chatManager || null;
    }

    class TelegramZShell {
        constructor() {
            this.active = false;
            this.drawerOverlay = null;
            this.infoSidebar = null;
            this.fabButton = null;
            this.folderTabsBar = null;
            this.backButton = null;
            this.currentFolder = 'all';
            this.listObserver = null;
            this.chatStateObserver = null;
            this.viewStack = [];
            this.views = {};
            this.scheme = localStorage.getItem('tg_scheme') || 'dark';

            this.init();
        }

        init() {
            this.checkTheme();

            window.addEventListener('liquid-theme-changed', (e) => {
                const newTheme = e.detail && e.detail.theme;
                if (newTheme === 'telegram-z') {
                    this.enable();
                } else {
                    this.disable();
                }
            });

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.checkTheme());
            } else {
                this.checkTheme();
            }
        }

        checkTheme() {
            const currentTheme = document.documentElement.dataset.theme ||
                (window.LiquidTheme ? window.LiquidTheme.get() : 'dark');

            if (currentTheme === 'telegram-z') {
                this.enable();
            } else {
                this.disable();
            }
        }

        applyScheme(scheme) {
            this.scheme = scheme;
            try { localStorage.setItem('tg_scheme', scheme); } catch (e) {}

            document.documentElement.dataset.telegramScheme = scheme;
            if (document.body) {
                document.body.classList.toggle('tg-scheme-light', scheme === 'light');
            }

            // Sync all drawer switches and scheme cards
            document.querySelectorAll('.tg-night-switch, .tg-drawer-switch-row .tg-switch, .tg-switch').forEach((sw) => {
                sw.classList.toggle('active', scheme === 'dark');
            });

            // Sync chat settings cards if present
            document.querySelectorAll('.tg-theme-card[data-scheme]').forEach((card) => {
                card.classList.toggle('active', card.dataset.scheme === scheme);
            });
        }

        enable() {
            if (this.active) return;
            this.active = true;

            document.documentElement.classList.add('theme-telegram-z');
            if (document.body) {
                document.body.classList.add('theme-telegram-z');
            }

            this.applyScheme(this.scheme);

            if (window.chatApp && !window.chatManager) {
                window.chatManager = window.chatApp;
            }

            if (document.querySelector('.chat-container')) {
                this.setupHamburgerButton();
                this.setupDrawer();
                this.setupFolderTabs();
                this.setupFAB();
                this.setupBackButton();
                this.setupInfoSidebar();
                this.setupSlidingViews();
                this.setupListObserver();
                this.setupActiveChatObserver();
                this.syncActiveChatState();
                this.setupMiddleSearch();
                this.initMessageSelection();
                this.initTopAudioPlayer();
                this.ensureSnapContainer();
            }
        }

        disable() {
            if (!this.active) return;
            this.active = false;

            document.documentElement.classList.remove('theme-telegram-z');
            if (document.body) {
                document.body.classList.remove('theme-telegram-z');
                document.body.classList.remove('tg-scheme-light');
            }

            this.closeMiddleSearch();
            this.exitSelectionMode();

            if (this.drawerOverlay) {
                this.drawerOverlay.classList.remove('open');
                this.drawerOverlay.style.display = 'none';
            }
            if (this.folderTabsBar) {
                this.folderTabsBar.style.display = 'none';
            }
            if (this.fabButton) {
                this.fabButton.style.display = 'none';
            }
            if (this.infoSidebar) {
                this.infoSidebar.classList.remove('open');
            }
            if (this.backButton) {
                this.backButton.style.display = 'none';
            }

            this.closeAllViews();

            if (this.listObserver) {
                this.listObserver.disconnect();
                this.listObserver = null;
            }
            if (this.chatStateObserver) {
                this.chatStateObserver.disconnect();
                this.chatStateObserver = null;
            }

            const welcomeMsg = document.getElementById('welcome-message');
            if (welcomeMsg) {
                welcomeMsg.style.removeProperty('display');
                const app = getChatApp();
                if (app && app._originalWelcomeHtml) {
                    welcomeMsg.innerHTML = app._originalWelcomeHtml;
                }
                delete welcomeMsg.dataset.tgStyled;
            }

            this.filterChats('all');
        }

        /* --------------------------------------------------------------------
           Telegram-Style In-App Modal Dialog System (Replaces native browser prompts)
           -------------------------------------------------------------------- */
        showDialog(options = {}) {
            const existing = document.querySelector('.tg-dialog-overlay');
            if (existing) existing.remove();

            const {
                title = '',
                subtitle = '',
                fields = [],
                confirmText = 'OK',
                cancelText = 'Cancel',
                onSubmit = null,
                onCancel = null
            } = options;

            const overlay = document.createElement('div');
            overlay.className = 'tg-dialog-overlay';

            let fieldsHtml = '';
            fields.forEach((f, idx) => {
                const fId = f.id || `tg-field-${idx}`;
                const fType = f.type || 'text';
                const fVal = (f.value !== undefined && f.value !== null) ? String(f.value).replace(/"/g, '&quot;') : '';
                const fPlace = (f.placeholder || '').replace(/"/g, '&quot;');
                const fLabel = f.label ? `<label class="tg-dialog-label" for="${fId}">${f.label}</label>` : '';
                fieldsHtml += `
                    <div class="tg-dialog-field">
                        ${fLabel}
                        <input class="tg-dialog-input" id="${fId}" type="${fType}" value="${fVal}" placeholder="${fPlace}" autocomplete="off" spellcheck="false" />
                    </div>
                `;
            });

            overlay.innerHTML = `
                <div class="tg-dialog-box" role="dialog" aria-modal="true">
                    ${title ? `<div class="tg-dialog-title">${title}</div>` : ''}
                    ${subtitle ? `<div class="tg-dialog-subtitle">${subtitle}</div>` : ''}
                    <div class="tg-dialog-error" id="tg-dialog-error"></div>
                    <form class="tg-dialog-form" onsubmit="return false;">
                        ${fieldsHtml}
                        <div class="tg-dialog-actions">
                            <button type="button" class="tg-dialog-btn tg-btn-cancel">${cancelText}</button>
                            <button type="submit" class="tg-dialog-btn tg-btn-primary">${confirmText}</button>
                        </div>
                    </form>
                </div>
            `;

            document.body.appendChild(overlay);

            requestAnimationFrame(() => {
                overlay.classList.add('tg-dialog-visible');
            });

            const firstInput = overlay.querySelector('.tg-dialog-input');
            if (firstInput) {
                setTimeout(() => {
                    firstInput.focus();
                    if (firstInput.value) {
                        try {
                            firstInput.setSelectionRange(firstInput.value.length, firstInput.value.length);
                        } catch (e) {}
                    }
                }, 50);
            }

            const errorEl = overlay.querySelector('#tg-dialog-error');
            const submitBtn = overlay.querySelector('.tg-btn-primary');
            const cancelBtn = overlay.querySelector('.tg-btn-cancel');

            const setStatus = (errText) => {
                if (!errorEl) return;
                if (errText) {
                    errorEl.textContent = errText;
                    errorEl.style.display = 'block';
                    const box = overlay.querySelector('.tg-dialog-box');
                    if (box) {
                        box.classList.remove('tg-shake');
                        void box.offsetWidth;
                        box.classList.add('tg-shake');
                    }
                } else {
                    errorEl.textContent = '';
                    errorEl.style.display = 'none';
                }
            };

            const closeDialog = () => {
                overlay.classList.remove('tg-dialog-visible');
                document.removeEventListener('keydown', onKey);
                setTimeout(() => {
                    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                }, 200);
            };

            const handleCancel = () => {
                closeDialog();
                if (typeof onCancel === 'function') onCancel();
            };

            const handleSubmit = async () => {
                setStatus('');
                const values = {};
                fields.forEach((f, idx) => {
                    const fId = f.id || `tg-field-${idx}`;
                    const input = overlay.querySelector(`#${fId}`);
                    values[f.id || fId] = input ? input.value : '';
                });

                if (typeof onSubmit === 'function') {
                    submitBtn.disabled = true;
                    const origText = submitBtn.textContent;
                    submitBtn.textContent = '...';
                    try {
                        const success = await onSubmit(values, setStatus);
                        if (success !== false) {
                            closeDialog();
                        }
                    } catch (err) {
                        setStatus(err.message || 'An error occurred');
                    } finally {
                        submitBtn.disabled = false;
                        submitBtn.textContent = origText;
                    }
                } else {
                    closeDialog();
                }
            };

            cancelBtn.addEventListener('click', handleCancel);
            overlay.querySelector('.tg-dialog-form').addEventListener('submit', (e) => {
                e.preventDefault();
                handleSubmit();
            });

            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    handleCancel();
                }
            });

            const onKey = (e) => {
                if (e.key === 'Escape') {
                    handleCancel();
                }
            };
            document.addEventListener('keydown', onKey);

            return { close: closeDialog, setStatus };
        }

        /* --------------------------------------------------------------------
           1. Active Chat & Empty State State-Machine
           Fixes: Topbar and Composer showing when no chat is open
           -------------------------------------------------------------------- */
        setupActiveChatObserver() {
            const chatMain = document.querySelector('.chat-main');
            if (!chatMain || this.chatStateObserver) return;

            this.chatStateObserver = new MutationObserver(() => {
                if (this._isSyncing) return;
                this.syncActiveChatState();
            });

            this.chatStateObserver.observe(chatMain, {
                attributes: true,
                attributeFilter: ['class']
            });

            this.syncActiveChatState();
        }

        syncActiveChatState() {
            if (!this.active || this._isSyncing) return;
            this._isSyncing = true;
            try {
                const app = getChatApp();
                const chatMain = document.querySelector('.chat-main');
                if (!chatMain) return;

                const hasChat = Boolean(app && app.currentChat);
                const active = hasChat;

                if (chatMain.classList.contains('has-active-chat') !== active) {
                    chatMain.classList.toggle('has-active-chat', active);
                }
                if (chatMain.classList.contains('active') !== active) {
                    chatMain.classList.toggle('active', active);
                }
                document.body.classList.toggle('has-active-chat', active);
                const chatContainer = document.querySelector('.chat-container');
                if (chatContainer) {
                    chatContainer.classList.toggle('has-active-chat', active);
                }
                const sidebar = document.querySelector('.chat-sidebar');
                if (sidebar) {
                    sidebar.classList.toggle('has-active-chat', active);
                }

                const welcomeMsg = document.getElementById('welcome-message');
                if (welcomeMsg) {
                    if (active) {
                        if (welcomeMsg.style.display !== 'none') {
                            welcomeMsg.style.setProperty('display', 'none', 'important');
                        }
                    } else {
                        welcomeMsg.style.removeProperty('display');
                    }
                }

                const topbar = document.getElementById('chat-topbar');
                if (topbar) {
                    topbar.classList.toggle('empty', !active);
                    if (active) {
                        topbar.style.removeProperty('display');
                    } else {
                        if (topbar.style.display !== 'none') {
                            topbar.style.setProperty('display', 'none', 'important');
                        }
                    }
                }

                const inputContainer = document.getElementById('chat-input-container');
                if (inputContainer) {
                    if (!active) {
                        if (inputContainer.style.display !== 'none') {
                            inputContainer.style.setProperty('display', 'none', 'important');
                        }
                    } else {
                        inputContainer.style.removeProperty('display');
                    }
                }

                // Sync Telegram center empty badge text
                if (welcomeMsg && !welcomeMsg.dataset.tgStyled) {
                    welcomeMsg.dataset.tgStyled = '1';
                    const p = welcomeMsg.querySelector('p');
                    if (p) {
                        p.textContent = 'Select a chat to start messaging';
                    }
                }
            } finally {
                this._isSyncing = false;
            }
        }

        /* --------------------------------------------------------------------
           2. Sidebar Hamburger Button
           -------------------------------------------------------------------- */
        setupHamburgerButton() {
            const searchBar = document.querySelector('.chat-sidebar .search-bar');
            if (!searchBar) return;

            let hamburger = searchBar.querySelector('.tg-hamburger-btn');
            if (!hamburger) {
                hamburger = document.createElement('button');
                hamburger.className = 'tg-hamburger-btn';
                hamburger.type = 'button';
                hamburger.title = 'Open Menu';
                hamburger.innerHTML = `
                    <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="3" y1="6" x2="21" y2="6"></line>
                        <line x1="3" y1="12" x2="21" y2="12"></line>
                        <line x1="3" y1="18" x2="21" y2="18"></line>
                    </svg>
                `;
                searchBar.insertBefore(hamburger, searchBar.firstChild);
            }

            hamburger.style.display = 'flex';
            hamburger.onclick = (e) => {
                e.stopPropagation();
                this.openDrawer();
            };

            // Ensure search input and icon are neatly inside .tg-search-wrapper
            let searchWrap = searchBar.querySelector('.tg-search-wrapper');
            const searchInput = searchBar.querySelector('#search-contacts');
            const searchIcon = searchBar.querySelector('.icon');
            if (!searchWrap && searchInput) {
                searchWrap = document.createElement('div');
                searchWrap.className = 'tg-search-wrapper';
                searchBar.insertBefore(searchWrap, searchInput);
                if (searchIcon) searchWrap.appendChild(searchIcon);
                searchWrap.appendChild(searchInput);
            }

            // Telegram Web Lock button in search header
            let lockBtn = searchBar.querySelector('.tg-header-lock-btn');
            if (!lockBtn) {
                lockBtn = document.createElement('button');
                lockBtn.className = 'tg-header-lock-btn';
                lockBtn.type = 'button';
                lockBtn.title = 'Lock Liquid Chat';
                lockBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                `;
                searchBar.appendChild(lockBtn);
            }

            const updateLockVisibility = () => {
                const isEnabled = Boolean(
                    window.AppLock &&
                    window.AppLock.settings &&
                    window.AppLock.settings.enabled &&
                    window.AppLock.settings.pin_hash
                );
                lockBtn.style.display = isEnabled ? 'flex' : 'none';
            };

            updateLockVisibility();
            this.updateHeaderLockBtn = updateLockVisibility;

            if (this._onAppLockChange) {
                window.removeEventListener('applock:changed', this._onAppLockChange);
            }
            this._onAppLockChange = () => {
                if (typeof this.updateHeaderLockBtn === 'function') {
                    this.updateHeaderLockBtn();
                }
            };
            window.addEventListener('applock:changed', this._onAppLockChange);

            lockBtn.onclick = (e) => {
                e.stopPropagation();
                if (window.AppLock && window.AppLock.settings && window.AppLock.settings.enabled && window.AppLock.settings.pin_hash) {
                    window.AppLock.lockNow();
                } else {
                    this.openView('passcode');
                }
            };
        }

        /* --------------------------------------------------------------------
           3. Left Sliding Navigation Drawer
           -------------------------------------------------------------------- */
        setupDrawer() {
            if (this.drawerOverlay) {
                this.drawerOverlay.style.display = 'block';
                return;
            }

            const userName = document.querySelector('meta[name="user-name"]')?.content || 'User';
            const userAvatarImg = document.getElementById('current-user-avatar');
            const avatarSrc = userAvatarImg ? userAvatarImg.src : 'uploads/images/default.png';
            const isDark = this.scheme === 'dark';

            const overlay = document.createElement('div');
            overlay.className = 'tg-drawer-overlay';
            overlay.innerHTML = `
                <div class="tg-drawer-panel">
                    <div class="tg-drawer-header">
                        <img class="tg-drawer-avatar" id="tg-drawer-avatar" src="${avatarSrc}" alt="Avatar">
                        <div>
                            <div class="tg-drawer-name" id="tg-drawer-name">${userName}</div>
                            <div class="tg-drawer-handle" id="tg-drawer-username">Account Menu</div>
                        </div>
                    </div>
                    <div class="tg-drawer-menu">
                        <button class="tg-drawer-item" type="button" data-action="saved-messages">
                            <svg class="icon" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
                            <span>Saved Messages</span>
                        </button>
                        <button class="tg-drawer-item" type="button" data-action="contacts">
                            <svg class="icon" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                            <span>Contacts</span>
                        </button>
                        <button class="tg-drawer-item" type="button" data-action="new-group">
                            <svg class="icon" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                            <span>New Group</span>
                        </button>
                        <button class="tg-drawer-item" type="button" data-action="new-channel">
                            <svg class="icon" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><path d="M3 11l12-4v10L3 13v-2z"></path><path d="M15 7l6-2v14l-6-2"></path><path d="M7 14l2 6"></path></svg>
                            <span>New Channel</span>
                        </button>
                        <div class="tg-drawer-divider"></div>
                        <button class="tg-drawer-item" type="button" data-action="open-settings">
                            <svg class="icon" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                            <span>Settings</span>
                        </button>
                        <div class="tg-drawer-item tg-drawer-switch-row" data-action="toggle-night-mode">
                            <svg class="icon" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
                            <span>Night Mode</span>
                            <div class="tg-switch tg-night-switch ${isDark ? 'active' : ''}"></div>
                        </div>
                        <button class="tg-drawer-item" type="button" data-action="lock-app">
                            <svg class="icon" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                            <span>Lock App</span>
                        </button>
                        <div class="tg-drawer-divider"></div>
                        <a href="logout" class="tg-drawer-item">
                            <svg class="icon" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><path d="M16 17l5-5-5-5"></path><path d="M21 12H9"></path></svg>
                            <span>Log Out</span>
                        </a>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);
            this.drawerOverlay = overlay;

            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    this.closeDrawer();
                }
            });

            overlay.querySelectorAll('[data-action]').forEach((btn) => {
                btn.addEventListener('click', (e) => {
                    const action = btn.dataset.action;
                    const app = getChatApp();

                    if (action === 'toggle-night-mode') {
                        e.preventDefault();
                        e.stopPropagation();
                        const next = this.scheme === 'dark' ? 'light' : 'dark';
                        this.applyScheme(next);
                        return;
                    }

                    this.closeDrawer();

                    if (action === 'saved-messages') {
                        const targetId = (app && app.userId) ? app.userId : (parseInt(document.querySelector('meta[name="user-id"]')?.content || '0', 10) || null);
                        if (app && targetId) {
                            const existingSaved = (typeof app.getConversation === 'function') ? app.getConversation(targetId, 'saved') : null;
                            app.openChat(targetId, 'saved', existingSaved || {
                                type: 'saved',
                                user_id: targetId,
                                full_name: 'Saved Messages',
                                username: 'saved_messages'
                            });
                        }
                    } else if (action === 'contacts') {
                        this.openView('new-chat');
                    } else if (action === 'new-group') {
                        this.openView('new-group');
                    } else if (action === 'new-channel') {
                        this.openView('new-channel');
                    } else if (action === 'open-settings') {
                        this.openView('settings');
                    } else if (action === 'lock-app') {
                        if (window.AppLock && window.AppLock.settings && window.AppLock.settings.enabled && window.AppLock.settings.pin_hash) {
                            window.AppLock.lockNow();
                        } else {
                            this.openView('passcode');
                            if (window.showInAppToast) {
                                window.showInAppToast('Please configure your Passcode to lock the app.', 'info');
                            }
                        }
                    }
                });
            });

            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && overlay.classList.contains('open')) {
                    this.closeDrawer();
                }
            });
        }

        openDrawer() {
            if (this.drawerOverlay) {
                const userName = document.querySelector('meta[name="user-name"]')?.content || 'User';
                const userUsername = document.querySelector('meta[name="user-username"]')?.content || '';
                const userAvatarImg = document.getElementById('current-user-avatar');
                const avatarSrc = userAvatarImg ? userAvatarImg.src : 'uploads/images/default.png';

                const nameEl = document.getElementById('tg-drawer-name');
                const avEl = document.getElementById('tg-drawer-avatar');
                const unEl = document.getElementById('tg-drawer-username');
                if (nameEl) nameEl.textContent = userName;
                if (avEl) avEl.src = avatarSrc;
                if (unEl) unEl.textContent = userUsername ? `@${userUsername.replace(/^@+/, '')}` : 'Account Menu';

                this.drawerOverlay.style.display = 'block';
                requestAnimationFrame(() => {
                    this.drawerOverlay.classList.add('open');
                });
            }
        }

        closeDrawer() {
            if (this.drawerOverlay) {
                this.drawerOverlay.classList.remove('open');
                setTimeout(() => {
                    if (this.drawerOverlay && !this.drawerOverlay.classList.contains('open')) {
                        this.drawerOverlay.style.display = 'none';
                    }
                }, 250);
            }
        }

        /* --------------------------------------------------------------------
           4. In-Sidebar Sliding Panels (Settings, Edit Profile, Chat Settings, New Chat)
           -------------------------------------------------------------------- */
        setupSlidingViews() {
            const sidebar = document.querySelector('.chat-sidebar');
            if (!sidebar) return;

            // 1. Main Settings View
            if (!this.views['settings']) {
                const settingsView = document.createElement('div');
                settingsView.className = 'tg-sliding-view tg-view-settings';
                settingsView.innerHTML = `
                    <div class="tg-view-header">
                        <button class="btn btn-icon tg-view-back" type="button" title="Back">
                            <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" fill="none" stroke-width="2.2"><polyline points="15 18 9 12 15 6"></polyline></svg>
                        </button>
                        <div class="tg-view-header-title">Settings</div>
                    </div>
                    <div class="tg-view-body">
                        <div class="tg-profile-hero">
                            <div class="tg-profile-avatar-wrap" id="tg-settings-hero-avatar-wrap" style="cursor: pointer;">
                                <img id="tg-settings-hero-avatar" src="uploads/images/default.png" alt="Profile">
                                <div class="tg-profile-avatar-edit-overlay">
                                    <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" fill="none" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                                </div>
                            </div>
                            <div class="tg-profile-hero-name" id="tg-settings-hero-name">User</div>
                            <div class="tg-profile-hero-sub" id="tg-settings-hero-sub">online</div>
                        </div>

                        <div class="tg-list-group">
                            <button class="tg-list-row" type="button" data-view-target="edit-profile">
                                <svg class="icon" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                                <span class="tg-list-row-text">Edit Profile</span>
                                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                            </button>
                            <button class="tg-list-row" type="button" data-view-target="chat-settings">
                                <svg class="icon" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><circle cx="12" cy="12" r="9"></circle><path d="M12 3a9 9 0 0 0 0 18"></path></svg>
                                <span class="tg-list-row-text">Chat Settings & Themes</span>
                                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                            </button>
                        </div>

                        <div class="tg-list-group">
                            <button class="tg-list-row" type="button" data-view-target="notifications">
                                <svg class="icon" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
                                <span class="tg-list-row-text">Notifications and Sounds</span>
                                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                            </button>
                            <button class="tg-list-row" type="button" data-view-target="privacy-security">
                                <svg class="icon" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                                <span class="tg-list-row-text">Privacy and Security</span>
                                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                            </button>
                            <button class="tg-list-row" type="button" data-view-target="sessions">
                                <svg class="icon" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
                                <span class="tg-list-row-text">Devices & Sessions</span>
                                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                            </button>
                            <button class="tg-list-row" type="button" data-view-target="storage">
                                <svg class="icon" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                                <span class="tg-list-row-text">Data and Storage</span>
                                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                            </button>
                        </div>

                        <div class="tg-list-group">
                            <button class="tg-list-row" type="button" id="tg-launch-onboarding" style="cursor: pointer;">
                                <svg class="icon" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8"></polygon></svg>
                                <span class="tg-list-row-text">Launch Onboarding Tour</span>
                            </button>
                        </div>

                        <div class="tg-list-group">
                            <button class="tg-list-row" type="button" id="tg-logout-btn" style="color: #ff595a !important; cursor: pointer;">
                                <svg class="icon" viewBox="0 0 24 24" stroke="#ff595a" fill="none" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><path d="M16 17l5-5-5-5"></path><path d="M21 12H9"></path></svg>
                                <span class="tg-list-row-text">Log Out</span>
                            </button>
                        </div>
                    </div>
                `;
                sidebar.appendChild(settingsView);
                this.views['settings'] = settingsView;

                settingsView.querySelector('.tg-view-back')?.addEventListener('click', () => {
                    this.closeView('settings');
                });

                settingsView.querySelectorAll('[data-view-target]').forEach((btn) => {
                    btn.addEventListener('click', () => {
                        this.openView(btn.dataset.viewTarget);
                    });
                });

                settingsView.querySelector('#tg-settings-hero-avatar-wrap')?.addEventListener('click', () => {
                    this.openView('edit-profile');
                });

                settingsView.querySelector('#tg-launch-onboarding')?.addEventListener('click', () => {
                    this.closeAllViews();
                    this.closeDrawer();
                    const app = getChatApp();
                    if (app) {
                        if (typeof app.openOnboarding === 'function') {
                            app.openOnboarding();
                        } else if (typeof app.maybeShowOnboarding === 'function') {
                            app.maybeShowOnboarding(true);
                        }
                    }
                });

                settingsView.querySelector('#tg-logout-btn')?.addEventListener('click', async () => {
                    const confirmed = window.showInAppConfirm
                        ? await window.showInAppConfirm('Are you sure you want to log out of Liquid Chat?', 'Log Out', 'Log Out', 'Cancel')
                        : true;
                    if (confirmed) {
                        window.location.href = 'logout';
                    }
                });
            }

            // 2. Edit Profile View
            if (!this.views['edit-profile']) {
                const editProfileView = document.createElement('div');
                editProfileView.className = 'tg-sliding-view tg-view-edit-profile';
                editProfileView.innerHTML = `
                    <div class="tg-view-header">
                        <button class="btn btn-icon tg-view-back" type="button" title="Back">
                            <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" fill="none" stroke-width="2.2"><polyline points="15 18 9 12 15 6"></polyline></svg>
                        </button>
                        <div class="tg-view-header-title">Edit Profile</div>
                        <button class="btn btn-icon tg-profile-save-btn" type="button" title="Save" style="color: var(--tg-primary);">
                            <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" fill="none" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </button>
                    </div>
                    <div class="tg-view-body">
                        <div class="tg-profile-hero">
                            <div class="tg-profile-avatar-wrap" id="tg-edit-avatar-trigger" style="cursor: pointer;">
                                <img id="tg-edit-avatar-img" src="uploads/images/default.png" alt="Avatar">
                                <div class="tg-profile-avatar-edit-overlay" style="opacity: 0.85;">
                                    <svg viewBox="0 0 24 24" width="26" height="26" stroke="currentColor" fill="none" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                                </div>
                            </div>
                            <span style="font-size: 13px; color: var(--tg-primary); cursor: pointer; margin-top: 6px;" id="tg-edit-avatar-label">Set New Photo</span>
                            <input type="file" id="tg-avatar-file-input" accept="image/*" style="display: none;">
                        </div>

                        <div class="tg-field-group">
                            <label class="tg-field-label" for="tg-input-fullname">Full Name</label>
                            <input class="tg-field-input" type="text" id="tg-input-fullname" placeholder="First and last name">
                        </div>

                        <div class="tg-field-group">
                            <label class="tg-field-label" for="tg-input-username">Username</label>
                            <div style="position: relative; display: flex; align-items: center;">
                                <span style="position: absolute; left: 14px; color: var(--tg-text-secondary, #707579); font-weight: 600;">@</span>
                                <input class="tg-field-input" type="text" id="tg-input-username" placeholder="username" style="padding-left: 30px;">
                            </div>
                            <span style="font-size: 11px; color: var(--tg-text-secondary, #707579); margin-top: 4px; display: block;">You can choose a unique username on Liquid Chat (3-32 characters, letters, numbers, underscore).</span>
                        </div>

                        <div class="tg-field-group">
                            <label class="tg-field-label" for="tg-input-bio">Bio</label>
                            <textarea class="tg-field-input" id="tg-input-bio" rows="3" placeholder="A few words about yourself"></textarea>
                        </div>
                    </div>
                `;
                sidebar.appendChild(editProfileView);
                this.views['edit-profile'] = editProfileView;

                editProfileView.querySelector('.tg-view-back')?.addEventListener('click', () => {
                    this.closeView('edit-profile');
                });

                const triggerAvatar = () => {
                    editProfileView.querySelector('#tg-avatar-file-input')?.click();
                };
                editProfileView.querySelector('#tg-edit-avatar-trigger')?.addEventListener('click', triggerAvatar);
                editProfileView.querySelector('#tg-edit-avatar-label')?.addEventListener('click', triggerAvatar);

                editProfileView.querySelector('#tg-avatar-file-input')?.addEventListener('change', async (e) => {
                    const file = e.target.files && e.target.files[0];
                    if (!file) return;

                    const previewUrl = URL.createObjectURL(file);
                    const avImg = editProfileView.querySelector('#tg-edit-avatar-img');
                    if (avImg) avImg.src = previewUrl;

                    const formData = new FormData();
                    formData.append('profile_pic', file);

                    try {
                        const res = await fetch('api/main.php?action=update_profile_pic', {
                            method: 'POST',
                            body: formData
                        });
                        const data = await res.json();
                        if (!data || !data.success) {
                            throw new Error((data && data.message) || 'Failed to upload photo');
                        }
                        if (window.showInAppToast) window.showInAppToast('Profile picture updated!', 'success');
                        const newPicUrl = data.image_url || (data.profile_pic ? `uploads/images/${data.profile_pic}` : previewUrl);
                        document.querySelectorAll('#tg-settings-hero-avatar, #tg-drawer-avatar, #current-user-avatar').forEach(img => {
                            img.src = newPicUrl;
                        });
                        const curAv = document.getElementById('current-user-avatar');
                        if (curAv && data.profile_pic) {
                            curAv.dataset.profilePic = data.profile_pic;
                        }
                    } catch (err) {
                        console.error('Upload profile picture failed', err);
                        if (window.showInAppToast) window.showInAppToast(err.message || 'Failed to update photo', 'error');
                    }
                });

                editProfileView.querySelector('.tg-profile-save-btn')?.addEventListener('click', async () => {
                    const fullName = (editProfileView.querySelector('#tg-input-fullname')?.value || '').trim();
                    const rawUsername = (editProfileView.querySelector('#tg-input-username')?.value || '').trim();
                    const username = rawUsername.replace(/^@+/, '');
                    const bio = (editProfileView.querySelector('#tg-input-bio')?.value || '').trim();

                    if (!fullName) {
                        if (window.showInAppToast) window.showInAppToast('Full name cannot be empty', 'error');
                        return;
                    }
                    if (username && !/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
                        if (window.showInAppToast) window.showInAppToast('Username must be 3-32 characters (letters, numbers, underscores)', 'error');
                        return;
                    }

                    try {
                        const res = await fetch('api/main.php?action=update_profile', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                full_name: fullName,
                                username: username,
                                bio: bio
                            })
                        });
                        const data = await res.json();
                        if (!data || !data.success) {
                            throw new Error((data && data.message) || 'Failed to update profile');
                        }

                        document.querySelectorAll('#tg-settings-hero-name, #tg-drawer-name').forEach(el => {
                            el.textContent = fullName;
                        });
                        if (username) {
                            document.querySelectorAll('#tg-settings-hero-sub, #tg-drawer-username').forEach(el => {
                                el.textContent = `@${username}`;
                            });
                            const metaUsername = document.querySelector('meta[name="user-username"]');
                            if (metaUsername) metaUsername.content = username;
                            if (window.ChatApp?.currentUser) window.ChatApp.currentUser.username = username;
                        }
                        const metaName = document.querySelector('meta[name="user-name"]');
                        if (metaName) metaName.content = fullName;
                        const metaBio = document.querySelector('meta[name="user-bio"]');
                        if (metaBio) metaBio.content = bio;

                        if (window.showInAppToast) window.showInAppToast('Profile saved successfully!', 'success');
                        this.closeView('edit-profile');
                    } catch (err) {
                        console.error('Save profile error', err);
                        if (window.showInAppToast) window.showInAppToast(err.message || 'Failed to save profile', 'error');
                    }
                });
            }

            // 3. Chat Settings & Themes View
            if (!this.views['chat-settings']) {
                const chatSettingsView = document.createElement('div');
                chatSettingsView.className = 'tg-sliding-view tg-view-chat-settings';
                chatSettingsView.innerHTML = `
                    <div class="tg-view-header">
                        <button class="btn btn-icon tg-view-back" type="button" title="Back">
                            <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" fill="none" stroke-width="2.2"><polyline points="15 18 9 12 15 6"></polyline></svg>
                        </button>
                        <div class="tg-view-header-title">Chat Settings & Themes</div>
                    </div>
                    <div class="tg-view-body">
                        <span style="font-size: 14px; font-weight: 600; color: var(--tg-primary);">Telegram Scheme</span>
                        <div class="tg-theme-cards" style="margin-top: 8px;">
                            <div class="tg-theme-card ${this.scheme === 'dark' ? 'active' : ''}" data-scheme="dark">
                                <div class="tg-theme-card-preview night">
                                    <div style="background: #2b5278; width: 60%; height: 16px; border-radius: 8px;"></div>
                                </div>
                                <div class="tg-theme-card-label">Night (Dark)</div>
                            </div>
                            <div class="tg-theme-card ${this.scheme === 'light' ? 'active' : ''}" data-scheme="light">
                                <div class="tg-theme-card-preview day">
                                    <div style="background: #eeffde; width: 60%; height: 16px; border-radius: 8px;"></div>
                                </div>
                                <div class="tg-theme-card-label">Day (Light)</div>
                            </div>
                        </div>

                        <div class="tg-field-group" style="margin-top: 16px;">
                            <label class="tg-field-label">Message Text Size</label>
                            <input type="range" id="tg-font-size-slider" min="13" max="18" value="15" style="width: 100%; accent-color: var(--tg-primary); cursor: pointer;">
                            <div style="display: flex; justify-content: space-between; font-size: 12px; color: var(--tg-text-secondary); margin-top: 4px;">
                                <span>13px</span>
                                <span>15px (Default)</span>
                                <span>18px</span>
                            </div>
                        </div>

                        <span style="font-size: 14px; font-weight: 600; color: var(--tg-primary); margin-top: 20px; display: block;">All Liquid Chat Themes</span>
                        <div class="tg-theme-cards tg-all-themes-grid" style="margin-top: 8px;">
                            <div class="tg-theme-card" data-theme-key="telegram-z">
                                <div class="tg-theme-card-preview theme-telegram-z">
                                    <div style="background: #2b5278; width: 60%; height: 16px; border-radius: 8px;"></div>
                                </div>
                                <div class="tg-theme-card-label">Telegram Z</div>
                            </div>
                            <div class="tg-theme-card" data-theme-key="dark">
                                <div class="tg-theme-card-preview theme-dark">
                                    <div style="background: #3182ce; width: 60%; height: 16px; border-radius: 8px;"></div>
                                </div>
                                <div class="tg-theme-card-label">Dark</div>
                            </div>
                            <div class="tg-theme-card" data-theme-key="midnight">
                                <div class="tg-theme-card-preview theme-midnight">
                                    <div style="background: #3a86ff; width: 60%; height: 16px; border-radius: 8px;"></div>
                                </div>
                                <div class="tg-theme-card-label">Midnight</div>
                            </div>
                            <div class="tg-theme-card" data-theme-key="graphite">
                                <div class="tg-theme-card-preview theme-graphite">
                                    <div style="background: #6b7280; width: 60%; height: 16px; border-radius: 8px;"></div>
                                </div>
                                <div class="tg-theme-card-label">Graphite</div>
                            </div>
                            <div class="tg-theme-card" data-theme-key="forest-night">
                                <div class="tg-theme-card-preview theme-forest-night">
                                    <div style="background: #059669; width: 60%; height: 16px; border-radius: 8px;"></div>
                                </div>
                                <div class="tg-theme-card-label">Forest Night</div>
                            </div>
                            <div class="tg-theme-card" data-theme-key="cinder">
                                <div class="tg-theme-card-preview theme-cinder">
                                    <div style="background: #78716c; width: 60%; height: 16px; border-radius: 8px;"></div>
                                </div>
                                <div class="tg-theme-card-label">Cinder</div>
                            </div>
                            <div class="tg-theme-card" data-theme-key="light-clean">
                                <div class="tg-theme-card-preview theme-light-clean">
                                    <div style="background: #3b82f6; width: 60%; height: 16px; border-radius: 8px;"></div>
                                </div>
                                <div class="tg-theme-card-label">Light Clean</div>
                            </div>
                            <div class="tg-theme-card" data-theme-key="ivory">
                                <div class="tg-theme-card-preview theme-ivory">
                                    <div style="background: #d97706; width: 60%; height: 16px; border-radius: 8px;"></div>
                                </div>
                                <div class="tg-theme-card-label">Ivory</div>
                            </div>
                            <div class="tg-theme-card" data-theme-key="ocean-blue">
                                <div class="tg-theme-card-preview theme-ocean-blue">
                                    <div style="background: #0284c7; width: 60%; height: 16px; border-radius: 8px;"></div>
                                </div>
                                <div class="tg-theme-card-label">Ocean Blue</div>
                            </div>
                            <div class="tg-theme-card" data-theme-key="emerald-green">
                                <div class="tg-theme-card-preview theme-emerald-green">
                                    <div style="background: #10b981; width: 60%; height: 16px; border-radius: 8px;"></div>
                                </div>
                                <div class="tg-theme-card-label">Emerald Green</div>
                            </div>
                            <div class="tg-theme-card" data-theme-key="warm-sunset">
                                <div class="tg-theme-card-preview theme-warm-sunset">
                                    <div style="background: #f97316; width: 60%; height: 16px; border-radius: 8px;"></div>
                                </div>
                                <div class="tg-theme-card-label">Warm Sunset</div>
                            </div>
                        </div>
                    </div>
                `;
                sidebar.appendChild(chatSettingsView);
                this.views['chat-settings'] = chatSettingsView;

                chatSettingsView.querySelector('.tg-view-back')?.addEventListener('click', () => {
                    this.closeView('chat-settings');
                });

                // Scheme toggles
                chatSettingsView.querySelectorAll('[data-scheme]').forEach((card) => {
                    card.addEventListener('click', () => {
                        this.applyScheme(card.dataset.scheme);
                    });
                });

                // All liquid themes toggles
                const syncThemeCards = () => {
                    const cur = (window.LiquidTheme && typeof window.LiquidTheme.get === 'function')
                        ? window.LiquidTheme.get()
                        : (localStorage.getItem('lc_theme') || 'telegram-z');
                    chatSettingsView.querySelectorAll('[data-theme-key]').forEach((card) => {
                        card.classList.toggle('active', card.dataset.themeKey === cur);
                    });
                };
                syncThemeCards();

                chatSettingsView.querySelectorAll('[data-theme-key]').forEach((card) => {
                    card.addEventListener('click', () => {
                        const nextTheme = card.dataset.themeKey;
                        if (window.LiquidTheme) {
                            window.LiquidTheme.apply(nextTheme);
                        } else {
                            document.documentElement.dataset.theme = nextTheme;
                            localStorage.setItem('lc_theme', nextTheme);
                        }
                        syncThemeCards();
                        if (window.showInAppToast) {
                            window.showInAppToast(`Theme applied: ${card.querySelector('.tg-theme-card-label')?.textContent || nextTheme}`, 'success');
                        }
                        // Persist setting to server
                        if (window.ApiClient) {
                            window.ApiClient.fetch('settings', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ theme: nextTheme })
                            }).catch(() => {});
                        }

                        // Automatically refresh and navigate to main chat view
                        setTimeout(() => {
                            window.location.href = 'chat';
                        }, 350);
                    });
                });

                const fontSlider = chatSettingsView.querySelector('#tg-font-size-slider');
                fontSlider?.addEventListener('input', (e) => {
                    const size = e.target.value;
                    document.documentElement.style.setProperty('--message-text-size', size + 'px');
                });
            }

            // 4. Privacy and Security View
            if (!this.views['privacy-security']) {
                const privacyView = document.createElement('div');
                privacyView.className = 'tg-sliding-view tg-view-privacy';
                privacyView.innerHTML = `
                    <div class="tg-view-header">
                        <button class="btn btn-icon tg-view-back" type="button" title="Back">
                            <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" fill="none" stroke-width="2.2"><polyline points="15 18 9 12 15 6"></polyline></svg>
                        </button>
                        <div class="tg-view-header-title">Privacy and Security</div>
                    </div>
                    <div class="tg-view-body" style="padding: 12px 14px;">
                        <span style="font-size: 13px; font-weight: 600; color: var(--tg-primary);">Cloud Encryption</span>
                        <div class="tg-list-group" style="margin-top: 8px;">
                            <div class="tg-list-row" style="display:flex; justify-content:space-between; align-items:center;">
                                <div style="display:flex; flex-direction:column;">
                                    <span style="font-size:14px; font-weight:500;">Encryption Status</span>
                                    <span style="font-size:12px; color:var(--tg-text-secondary);">Server-Side Hybrid AES-256-GCM / CTR</span>
                                </div>
                                <span style="font-size:12px; color:#4fae4e; font-weight:600; background:rgba(79,174,78,0.12); padding:4px 8px; border-radius:6px;">Active</span>
                            </div>
                            <button class="tg-list-row" type="button" id="tg-btn-test-crypto" style="cursor: pointer;">
                                <span class="tg-list-row-text">Verify Encryption Transport</span>
                                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                            </button>
                            <button class="tg-list-row" type="button" id="tg-btn-regen-keys" style="cursor: pointer; color: #f59e0b;">
                                <span class="tg-list-row-text">Regenerate Device Keys</span>
                                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                            </button>
                        </div>

                        <span style="font-size: 13px; font-weight: 600; color: var(--tg-primary); margin-top: 14px; display: block;">Privacy</span>
                        <div class="tg-list-group" style="margin-top: 8px;">
                            <div class="tg-list-row" style="display:flex; justify-content:space-between; align-items:center;">
                                <span class="tg-list-row-text">Last Seen & Online</span>
                                <select id="tg-select-last-seen" style="background: var(--tg-surface); color: var(--tg-text); border: 1px solid var(--tg-border); border-radius: 8px; padding: 4px 8px; font-size: 13px; cursor: pointer;">
                                    <option value="everyone">Everybody</option>
                                    <option value="contacts">My Contacts</option>
                                    <option value="nobody">Nobody</option>
                                </select>
                            </div>
                            <div class="tg-list-row tg-drawer-switch-row" id="tg-row-mention-alerts" style="cursor: pointer;">
                                <div style="display:flex; flex-direction:column;">
                                    <span class="tg-list-row-text">Mention Alerts</span>
                                    <span style="font-size:12px; color:var(--tg-text-secondary);">Notify when mentioned with @</span>
                                </div>
                                <div class="tg-switch active" id="tg-switch-mentions"></div>
                            </div>
                        </div>

                        <span style="font-size: 13px; font-weight: 600; color: var(--tg-primary); margin-top: 14px; display: block;">Security</span>
                        <div class="tg-list-group" style="margin-top: 8px;">
                            <button class="tg-list-row" type="button" id="tg-row-passcode-view" style="cursor: pointer; width: 100%; border: none; background: transparent; text-align: left; display: flex; align-items: center; justify-content: space-between;">
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                                    <span class="tg-list-row-text">Passcode Lock</span>
                                </div>
                                <div style="display: flex; align-items: center; gap: 6px;">
                                    <span id="tg-passcode-status-badge" style="font-size: 13px; color: var(--tg-text-secondary); font-weight: 500;">Off</span>
                                    <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                                </div>
                            </button>
                        </div>
                    </div>
                `;
                sidebar.appendChild(privacyView);
                this.views['privacy-security'] = privacyView;

                privacyView.querySelector('.tg-view-back')?.addEventListener('click', () => {
                    this.closeView('privacy-security');
                });

                privacyView.querySelector('#tg-row-passcode-view')?.addEventListener('click', () => {
                    this.openView('passcode');
                });

                // Test encryption
                privacyView.querySelector('#tg-btn-test-crypto')?.addEventListener('click', async () => {
                    try {
                        const res = await window.ApiClient.fetch('test_encryption');
                        const data = await res.json();
                        if (data && data.success) {
                            if (window.showInAppToast) window.showInAppToast('Encryption verified: AES-256 cloud encryption is operational!', 'success');
                        } else {
                            if (window.showInAppToast) window.showInAppToast('Encryption check failed', 'error');
                        }
                    } catch (err) {
                        if (window.showInAppToast) window.showInAppToast('Encryption test request error', 'error');
                    }
                });

                // Regenerate keys
                privacyView.querySelector('#tg-btn-regen-keys')?.addEventListener('click', async () => {
                    const confirmed = window.showInAppConfirm
                        ? await window.showInAppConfirm('Regenerate keys? You will lose access to older messages on this device.', 'Regenerate Keys', 'Regenerate', 'Cancel')
                        : true;
                    if (!confirmed) return;
                    const app = getChatApp();
                    if (app && app.crypto && typeof app.crypto.generateAndStoreKeys === 'function') {
                        await app.crypto.generateAndStoreKeys(app.userId, false);
                        if (window.showInAppToast) window.showInAppToast('New keys generated on this device', 'success');
                    }
                });

                // Last seen
                privacyView.querySelector('#tg-select-last-seen')?.addEventListener('change', async (e) => {
                    const val = e.target.value;
                    try {
                        await window.ApiClient.fetch('settings', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ last_seen_privacy: val })
                        });
                        if (window.showInAppToast) window.showInAppToast(`Last seen privacy set to ${val}`, 'success');
                    } catch (err) {}
                });

                // Mention alerts
                const mentionSwitch = privacyView.querySelector('#tg-switch-mentions');
                privacyView.querySelector('#tg-row-mention-alerts')?.addEventListener('click', () => {
                    mentionSwitch.classList.toggle('active');
                    if (window.showInAppToast) window.showInAppToast('Mention alerts updated', 'info');
                });
            }

            // 5. Notifications and Sounds View
            if (!this.views['notifications']) {
                const notifView = document.createElement('div');
                notifView.className = 'tg-sliding-view tg-view-notifications';
                notifView.innerHTML = `
                    <div class="tg-view-header">
                        <button class="btn btn-icon tg-view-back" type="button" title="Back">
                            <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" fill="none" stroke-width="2.2"><polyline points="15 18 9 12 15 6"></polyline></svg>
                        </button>
                        <div class="tg-view-header-title">Notifications and Sounds</div>
                    </div>
                    <div class="tg-view-body" style="padding: 12px 14px;">
                        <span style="font-size: 13px; font-weight: 600; color: var(--tg-primary);">Message Notifications</span>
                        <div class="tg-list-group" style="margin-top: 8px;">
                            <div class="tg-list-row tg-drawer-switch-row" id="tg-notif-enabled-row" style="cursor: pointer;">
                                <span class="tg-list-row-text">Private Chats</span>
                                <div class="tg-switch active" id="tg-switch-notify-enabled"></div>
                            </div>
                            <div class="tg-list-row tg-drawer-switch-row" id="tg-notif-sender-row" style="cursor: pointer;">
                                <span class="tg-list-row-text">Show Sender Name</span>
                                <div class="tg-switch active" id="tg-switch-notify-sender"></div>
                            </div>
                            <div class="tg-list-row tg-drawer-switch-row" id="tg-notif-preview-row" style="cursor: pointer;">
                                <span class="tg-list-row-text">Message Preview</span>
                                <div class="tg-switch active" id="tg-switch-notify-preview"></div>
                            </div>
                        </div>

                        <span style="font-size: 13px; font-weight: 600; color: var(--tg-primary); margin-top: 14px; display: block;">Notification Mode</span>
                        <div class="tg-list-group" style="margin-top: 8px;">
                            <label class="tg-list-row" style="cursor: pointer; display: flex; align-items: center;">
                                <input type="radio" name="tg-notify-mode" value="all" checked style="accent-color: var(--tg-primary); margin-inline-end: 10px;">
                                <div style="display: flex; flex-direction: column;">
                                    <span class="tg-list-row-text">All Messages</span>
                                    <span style="font-size: 12px; color: var(--tg-text-secondary);">Alert for all unread incoming messages</span>
                                </div>
                            </label>
                            <label class="tg-list-row" style="cursor: pointer; display: flex; align-items: center;">
                                <input type="radio" name="tg-notify-mode" value="latest" style="accent-color: var(--tg-primary); margin-inline-end: 10px;">
                                <div style="display: flex; flex-direction: column;">
                                    <span class="tg-list-row-text">Latest Message Only</span>
                                    <span style="font-size: 12px; color: var(--tg-text-secondary);">Alert only for newest arrival</span>
                                </div>
                            </label>
                        </div>

                        <span style="font-size: 13px; font-weight: 600; color: var(--tg-primary); margin-top: 14px; display: block;">Quick Reaction</span>
                        <div class="tg-list-group" style="margin-top: 8px;">
                            <div class="tg-list-row" style="display: flex; justify-content: space-between; align-items: center;">
                                <span class="tg-list-row-text">Quick Reaction Emoji</span>
                                <select id="tg-fast-reaction-select" style="background: var(--tg-surface); color: var(--tg-text); border: 1px solid var(--tg-border); border-radius: 8px; padding: 4px 8px; font-size: 14px; cursor: pointer;">
                                    <option value="👍">👍 Thumbs Up</option>
                                    <option value="❤️">❤️ Red Heart</option>
                                    <option value="🔥">🔥 Fire</option>
                                    <option value="👏">👏 Clapping</option>
                                    <option value="🎉">🎉 Party</option>
                                    <option value="🤩">🤩 Star-Struck</option>
                                    <option value="😂">😂 Tears of Joy</option>
                                    <option value="💩">💩 Poop</option>
                                </select>
                            </div>
                        </div>
                    </div>
                `;
                sidebar.appendChild(notifView);
                this.views['notifications'] = notifView;

                notifView.querySelector('.tg-view-back')?.addEventListener('click', () => {
                    this.closeView('notifications');
                });

                const saveNotifSettings = async () => {
                    const enabled = notifView.querySelector('#tg-switch-notify-enabled')?.classList.contains('active') ? 1 : 0;
                    const sender = notifView.querySelector('#tg-switch-notify-sender')?.classList.contains('active') ? 1 : 0;
                    const preview = notifView.querySelector('#tg-switch-notify-preview')?.classList.contains('active') ? 1 : 0;
                    const mode = notifView.querySelector('input[name="tg-notify-mode"]:checked')?.value || 'all';
                    const reaction = notifView.querySelector('#tg-fast-reaction-select')?.value || '👍';

                    try {
                        await window.ApiClient.fetch('settings', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                notify_enabled: enabled,
                                notify_show_sender: sender,
                                notify_show_preview: preview,
                                notify_mode: mode,
                                fast_reaction: reaction
                            })
                        });
                        const app = getChatApp();
                        if (app && typeof app.updateNotificationSettingsFromStorage === 'function') {
                            app.updateNotificationSettingsFromStorage();
                        }
                    } catch (err) {}
                };

                const bindToggle = (rowId, switchId) => {
                    const row = notifView.querySelector(rowId);
                    const sw = notifView.querySelector(switchId);
                    row?.addEventListener('click', () => {
                        sw?.classList.toggle('active');
                        saveNotifSettings();
                        if (window.showInAppToast) window.showInAppToast('Notification setting updated', 'info');
                    });
                };
                bindToggle('#tg-notif-enabled-row', '#tg-switch-notify-enabled');
                bindToggle('#tg-notif-sender-row', '#tg-switch-notify-sender');
                bindToggle('#tg-notif-preview-row', '#tg-switch-notify-preview');

                notifView.querySelectorAll('input[name="tg-notify-mode"]').forEach(radio => {
                    radio.addEventListener('change', () => {
                        saveNotifSettings();
                        if (window.showInAppToast) window.showInAppToast('Notification mode updated', 'info');
                    });
                });

                notifView.querySelector('#tg-fast-reaction-select')?.addEventListener('change', () => {
                    saveNotifSettings();
                    if (window.showInAppToast) window.showInAppToast('Quick reaction updated', 'success');
                });
            }

            // 6. Data and Storage View
            if (!this.views['storage']) {
                const storageView = document.createElement('div');
                storageView.className = 'tg-sliding-view tg-view-storage';
                storageView.innerHTML = `
                    <div class="tg-view-header">
                        <button class="btn btn-icon tg-view-back" type="button" title="Back">
                            <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" fill="none" stroke-width="2.2"><polyline points="15 18 9 12 15 6"></polyline></svg>
                        </button>
                        <div class="tg-view-header-title">Data and Storage</div>
                    </div>
                    <div class="tg-view-body" style="padding: 12px 14px;">
                        <span style="font-size: 13px; font-weight: 600; color: var(--tg-primary);">Storage Usage</span>
                        <div class="tg-list-group" style="margin-top: 8px;">
                            <div class="tg-list-row" style="display:flex; justify-content:space-between; align-items:center;">
                                <span>Twemoji Emojis</span>
                                <span style="font-size:13px; color:var(--tg-text-secondary);">3,719 SVGs (100% Local)</span>
                            </div>
                            <div class="tg-list-row" style="display:flex; justify-content:space-between; align-items:center;">
                                <span>Media Cache</span>
                                <span style="font-size:13px; color:var(--tg-text-secondary);" id="tg-cache-size-text">Checking cache...</span>
                            </div>
                        </div>

                        <span style="font-size: 13px; font-weight: 600; color: var(--tg-primary); margin-top: 14px; display: block;">Automatic Media Download</span>
                        <div class="tg-list-group" style="margin-top: 8px;">
                            <div class="tg-list-row tg-drawer-switch-row" id="tg-storage-wifi-row" style="cursor: pointer;">
                                <span class="tg-list-row-text">Auto-Download on Wi-Fi</span>
                                <div class="tg-switch active" id="tg-switch-wifi-download"></div>
                            </div>
                            <div class="tg-list-row tg-drawer-switch-row" id="tg-storage-mobile-row" style="cursor: pointer;">
                                <span class="tg-list-row-text">Auto-Download on Cellular</span>
                                <div class="tg-switch" id="tg-switch-mobile-download"></div>
                            </div>
                            <div class="tg-list-row" style="display:flex; justify-content:space-between; align-items:center;">
                                <span class="tg-list-row-text">Cache Size Limit</span>
                                <select id="tg-select-cache-limit" style="background: var(--tg-surface); color: var(--tg-text); border: 1px solid var(--tg-border); border-radius: 8px; padding: 4px 8px; font-size: 13px; cursor: pointer;">
                                    <option value="50">50 MB</option>
                                    <option value="100">100 MB</option>
                                    <option value="250" selected>250 MB</option>
                                    <option value="500">500 MB</option>
                                    <option value="1024">1 GB</option>
                                </select>
                            </div>
                        </div>

                        <button class="btn btn-secondary" type="button" id="tg-clear-cache-btn" style="width: 100%; margin-top: 16px; padding: 10px; border-radius: 10px; cursor: pointer; color: #ff595a; border: 1px solid rgba(255,89,90,0.3); background: rgba(255,89,90,0.08);">
                            Clear Local Media Cache
                        </button>
                    </div>
                `;
                sidebar.appendChild(storageView);
                this.views['storage'] = storageView;

                storageView.querySelector('.tg-view-back')?.addEventListener('click', () => {
                    this.closeView('storage');
                });

                storageView.querySelector('#tg-clear-cache-btn')?.addEventListener('click', async () => {
                    const confirmed = window.showInAppConfirm
                        ? await window.showInAppConfirm('Clear all downloaded and cached media files from this device?', 'Clear Cache', 'Clear Cache', 'Cancel')
                        : true;
                    if (!confirmed) return;
                    try {
                        if (window.mediaStore && typeof window.mediaStore.clear === 'function') {
                            await window.mediaStore.clear();
                        }
                        if ('caches' in window) {
                            const keys = await caches.keys();
                            for (const k of keys) {
                                await caches.delete(k);
                            }
                        }
                        if (window.showInAppToast) {
                            window.showInAppToast('Local media cache successfully cleared!', 'success');
                        }
                        const cacheText = storageView.querySelector('#tg-cache-size-text');
                        if (cacheText) cacheText.textContent = '0 B';
                    } catch (err) {
                        if (window.showInAppToast) {
                            window.showInAppToast('Error clearing cache', 'error');
                        }
                    }
                });
            }

            // 7. Devices and Sessions View
            if (!this.views['sessions']) {
                const sessionsView = document.createElement('div');
                sessionsView.className = 'tg-sliding-view tg-view-sessions';
                sessionsView.innerHTML = `
                    <div class="tg-view-header">
                        <button class="btn btn-icon tg-view-back" type="button" title="Back">
                            <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" fill="none" stroke-width="2.2"><polyline points="15 18 9 12 15 6"></polyline></svg>
                        </button>
                        <div class="tg-view-header-title">Devices & Sessions</div>
                    </div>
                    <div class="tg-view-body" style="padding: 12px 14px;">
                        <button class="btn btn-secondary" type="button" id="tg-terminate-other-sessions" style="width: 100%; color: #ff595a; margin-bottom: 14px; font-weight: 600; padding: 10px; border-radius: 10px; border: 1px solid rgba(255,89,90,0.3); background: rgba(255,89,90,0.08); cursor: pointer;">
                            Terminate All Other Sessions
                        </button>
                        <span style="font-size: 13px; font-weight: 600; color: var(--tg-primary); margin-bottom: 8px; display: block;">Active Devices</span>
                        <div id="tg-sessions-list" style="display: flex; flex-direction: column; gap: 6px;">
                            <!-- Filled dynamically -->
                        </div>
                    </div>
                `;
                sidebar.appendChild(sessionsView);
                this.views['sessions'] = sessionsView;

                sessionsView.querySelector('.tg-view-back')?.addEventListener('click', () => {
                    this.closeView('sessions');
                });

                sessionsView.querySelector('#tg-terminate-other-sessions')?.addEventListener('click', async () => {
                    const confirmed = window.showInAppConfirm
                        ? await window.showInAppConfirm('Are you sure you want to log out all other active sessions?', 'Log Out Sessions', 'Log Out Others', 'Cancel')
                        : true;
                    if (!confirmed) return;
                    try {
                        await window.ApiClient.fetch('sessions', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'revoke_others' })
                        });
                        this.loadActiveSessions(sessionsView);
                        if (window.showInAppToast) window.showInAppToast('All other sessions terminated', 'success');
                    } catch (err) {}
                });
            }

            // 8. New Chat / Contacts View
            if (!this.views['new-chat']) {
                const newChatView = document.createElement('div');
                newChatView.className = 'tg-sliding-view tg-view-new-chat';
                newChatView.innerHTML = `
                    <div class="tg-view-header">
                        <button class="btn btn-icon tg-view-back" type="button" title="Back">
                            <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" fill="none" stroke-width="2.2"><polyline points="15 18 9 12 15 6"></polyline></svg>
                        </button>
                        <div class="tg-view-header-title">New Message</div>
                    </div>
                    <div class="tg-view-body" style="padding: 10px 14px;">
                        <input class="tg-field-input" type="text" id="tg-contacts-search" placeholder="Search contacts..." style="margin-bottom: 8px;">
                        
                        <div class="tg-list-group" style="margin-bottom: 12px;">
                            <button class="tg-list-row" type="button" id="tg-action-new-group">
                                <svg class="icon" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                                <span class="tg-list-row-text">New Group</span>
                            </button>
                            <button class="tg-list-row" type="button" id="tg-action-new-channel">
                                <svg class="icon" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><path d="M3 11l12-4v10L3 13v-2z"></path><path d="M15 7l6-2v14l-6-2"></path><path d="M7 14l2 6"></path></svg>
                                <span class="tg-list-row-text">New Channel</span>
                            </button>
                            <button class="tg-list-row" type="button" id="tg-action-new-contact">
                                <svg class="icon" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>
                                <span class="tg-list-row-text">New Contact</span>
                            </button>
                        </div>

                        <span style="font-size: 13px; font-weight: 600; color: var(--tg-primary); margin-bottom: 4px;">Contacts</span>
                        <div id="tg-contacts-list" style="display: flex; flex-direction: column; gap: 4px;">
                            <!-- Filled dynamically -->
                        </div>
                    </div>
                `;
                sidebar.appendChild(newChatView);
                this.views['new-chat'] = newChatView;

                newChatView.querySelector('.tg-view-back')?.addEventListener('click', () => {
                    this.closeView('new-chat');
                });

                newChatView.querySelector('#tg-action-new-group')?.addEventListener('click', () => {
                    this.closeView('new-chat');
                    this.openView('new-group');
                });

                newChatView.querySelector('#tg-action-new-channel')?.addEventListener('click', () => {
                    this.closeView('new-chat');
                    this.openView('new-channel');
                });

                newChatView.querySelector('#tg-action-new-contact')?.addEventListener('click', () => {
                    this.showDialog({
                        title: 'New Contact',
                        subtitle: 'Enter username (@username) or phone number to add to your contacts.',
                        fields: [
                            { id: 'username', label: 'Username or phone', placeholder: '@username or phone number', required: true },
                            { id: 'nickname', label: 'Name / Nickname (optional)', placeholder: 'e.g. Alex' }
                        ],
                        confirmText: 'Add Contact',
                        cancelText: 'Cancel',
                        onSubmit: async (values, setStatus) => {
                            const rawUser = (values.username || '').trim();
                            if (!rawUser) {
                                setStatus('Please enter a username or phone number');
                                return false;
                            }
                            const cleanUser = rawUser.replace(/^@+/, '');
                            const nickname = (values.nickname || '').trim();
                            const app = getChatApp();

                            try {
                                const res = await window.ApiClient.fetch('add_contact', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ username: cleanUser, nickname: nickname, name: nickname })
                                });
                                const data = await res.json();
                                if (data && data.success) {
                                    if (app) {
                                        if (typeof app.showToast === 'function') app.showToast('Contact added successfully!');
                                        if (typeof app.loadContacts === 'function') app.loadContacts();
                                        if (data.contact_id && typeof app.openChat === 'function') {
                                            this.closeView('new-chat');
                                            app.openChat(data.contact_id, 'direct', { user_id: data.contact_id, username: cleanUser, full_name: nickname || cleanUser });
                                        }
                                    }
                                    return true;
                                } else {
                                    setStatus((data && data.message) ? data.message : 'User not found or failed to add contact');
                                    return false;
                                }
                            } catch (err) {
                                setStatus('Network error adding contact');
                                return false;
                            }
                        }
                    });
                });
            }

            // 9. Telegram-Style New Group View
            if (!this.views['new-group']) {
                const newGroupView = document.createElement('div');
                newGroupView.className = 'tg-sliding-view tg-view-new-group';
                newGroupView.innerHTML = `
                    <div class="tg-view-header">
                        <button class="btn btn-icon tg-view-back" type="button" title="Back">
                            <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" fill="none" stroke-width="2.2"><polyline points="15 18 9 12 15 6"></polyline></svg>
                        </button>
                        <div class="tg-view-header-title">New Group</div>
                        <button class="btn btn-icon tg-view-action" id="tg-btn-create-group" type="button" title="Create Group" style="color: var(--tg-primary);">
                            <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" fill="none" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </button>
                    </div>
                    <div class="tg-view-body" style="padding: 16px;">
                        <div class="tg-creation-hero">
                            <div class="tg-hero-avatar-picker" id="tg-group-avatar-wrap" title="Upload group photo">
                                <svg viewBox="0 0 24 24" width="28" height="28" stroke="#ffffff" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                                    <circle cx="12" cy="13" r="4"></circle>
                                </svg>
                                <img id="tg-group-avatar-preview" src="" style="display: none;">
                                <input type="file" id="tg-group-avatar-file" accept="image/*" style="display: none;">
                            </div>
                            <div class="tg-creation-input-wrap">
                                <div class="tg-creation-field-label">Group Name *</div>
                                <input class="tg-field-input" type="text" id="tg-group-name-input" placeholder="Enter group name..." required autocomplete="off">
                            </div>
                        </div>

                        <div style="margin-bottom: 16px;">
                            <div class="tg-creation-field-label">Description (optional)</div>
                            <textarea class="tg-creation-desc-textarea" id="tg-group-desc-input" placeholder="What is this group about?" rows="2"></textarea>
                        </div>

                        <div class="tg-selected-chips-bar" id="tg-group-selected-chips"></div>

                        <div style="margin-bottom: 10px;">
                            <div class="tg-creation-field-label">
                                <span>Add Members</span>
                                <span id="tg-group-member-count" style="font-size: 12px; font-weight: normal; color: var(--tg-text-secondary);">0 selected</span>
                            </div>
                            <div class="tg-search-wrapper" style="margin-bottom: 10px;">
                                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2" class="icon"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                                <input class="tg-field-input" type="text" id="tg-group-members-search" placeholder="Search contacts..." style="border: none; background: transparent; padding-left: 36px;">
                            </div>
                        </div>

                        <div id="tg-group-members-list" style="display: flex; flex-direction: column; gap: 4px; max-height: calc(100vh - 430px); overflow-y: auto;">
                        </div>
                    </div>
                `;
                sidebar.appendChild(newGroupView);
                this.views['new-group'] = newGroupView;

                newGroupView.querySelector('.tg-view-back')?.addEventListener('click', () => {
                    this.closeView('new-group');
                });
            }

            // 10. Telegram-Style New Channel View
            if (!this.views['new-channel']) {
                const newChannelView = document.createElement('div');
                newChannelView.className = 'tg-sliding-view tg-view-new-channel';
                newChannelView.innerHTML = `
                    <div class="tg-view-header">
                        <button class="btn btn-icon tg-view-back" type="button" title="Back">
                            <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" fill="none" stroke-width="2.2"><polyline points="15 18 9 12 15 6"></polyline></svg>
                        </button>
                        <div class="tg-view-header-title">New Channel</div>
                        <button class="btn btn-icon tg-view-action" id="tg-btn-create-channel" type="button" title="Create Channel" style="color: var(--tg-primary);">
                            <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" fill="none" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </button>
                    </div>
                    <div class="tg-view-body" style="padding: 16px;">
                        <div class="tg-creation-hero">
                            <div class="tg-hero-avatar-picker" id="tg-channel-avatar-wrap" title="Upload channel photo" style="background: linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%);">
                                <svg viewBox="0 0 24 24" width="28" height="28" stroke="#ffffff" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                                    <circle cx="12" cy="13" r="4"></circle>
                                </svg>
                                <img id="tg-channel-avatar-preview" src="" style="display: none;">
                                <input type="file" id="tg-channel-avatar-file" accept="image/*" style="display: none;">
                            </div>
                            <div class="tg-creation-input-wrap">
                                <div class="tg-creation-field-label">Channel Name *</div>
                                <input class="tg-field-input" type="text" id="tg-channel-name-input" placeholder="Enter channel name..." required autocomplete="off">
                            </div>
                        </div>

                        <div style="margin-bottom: 18px;">
                            <div class="tg-creation-field-label">Description (optional)</div>
                            <textarea class="tg-creation-desc-textarea" id="tg-channel-desc-input" placeholder="What is this channel about?" rows="2"></textarea>
                        </div>

                        <div class="tg-creation-field-label" style="margin-bottom: 8px;">Channel Type</div>
                        <div class="tg-type-card-group">
                            <div class="tg-type-card active" data-type="public" id="tg-channel-type-public">
                                <div class="tg-type-card-badge">
                                    <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                                </div>
                                <div style="flex: 1;">
                                    <div class="tg-type-card-title">Public Channel</div>
                                    <div class="tg-type-card-sub">Public channels can be found in search, and anyone can join.</div>
                                </div>
                                <div class="tg-round-checkbox checked" style="margin-top: 4px;">
                                    <svg viewBox="0 0 24 24" width="13" height="13" stroke="#ffffff" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                                        <polyline points="20 6 9 17 4 12"></polyline>
                                    </svg>
                                </div>
                            </div>

                            <div class="tg-type-card" data-type="private" id="tg-channel-type-private">
                                <div class="tg-type-card-badge" style="background: rgba(168, 85, 247, 0.15); color: #a855f7;">
                                    <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                                </div>
                                <div style="flex: 1;">
                                    <div class="tg-type-card-title">Private Channel</div>
                                    <div class="tg-type-card-sub">Private channels can only be joined via an invite link.</div>
                                </div>
                                <div class="tg-round-checkbox" style="margin-top: 4px;">
                                    <svg viewBox="0 0 24 24" width="13" height="13" stroke="#ffffff" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                                        <polyline points="20 6 9 17 4 12"></polyline>
                                    </svg>
                                </div>
                            </div>
                        </div>

                        <div id="tg-channel-username-section" style="margin-bottom: 20px;">
                            <div class="tg-creation-field-label">Permanent Link</div>
                            <div class="tg-username-link-box">
                                <span class="tg-username-prefix">t.me/</span>
                                <input class="tg-username-input" type="text" id="tg-channel-username-input" placeholder="channel_link" autocomplete="off">
                            </div>
                            <div class="tg-creation-helper-text">If you set a public link, anyone will be able to find and join your channel.</div>
                        </div>

                        <button class="tg-btn-primary-pill" id="tg-btn-create-channel-pill" type="button">
                            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            <span>Create Channel</span>
                        </button>
                    </div>
                `;
                sidebar.appendChild(newChannelView);
                this.views['new-channel'] = newChannelView;

                newChannelView.querySelector('.tg-view-back')?.addEventListener('click', () => {
                    this.closeView('new-channel');
                });
            }

            // 11. Telegram-Style Passcode Lock View
            if (!this.views['passcode']) {
                const passcodeView = document.createElement('div');
                passcodeView.className = 'tg-sliding-view tg-view-passcode';
                passcodeView.innerHTML = `
                    <div class="tg-view-header">
                        <button class="btn btn-icon tg-view-back" type="button" title="Back">
                            <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" fill="none" stroke-width="2.2"><polyline points="15 18 9 12 15 6"></polyline></svg>
                        </button>
                        <div class="tg-view-header-title">Passcode Lock</div>
                    </div>
                    <div class="tg-view-body" style="padding: 20px 16px;">
                        <div class="tg-passcode-icon-badge">
                            <svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                            </svg>
                        </div>
                        <div style="text-align: center; font-size: 13.5px; color: var(--tg-text-secondary); line-height: 1.45; margin-bottom: 20px;">
                            When a passcode is set, a lock icon will appear above your chat list. Tap it to quickly lock Liquid Chat.
                        </div>

                        <!-- Passcode OFF State Container -->
                        <div id="tg-passcode-off-container" style="display: none;">
                            <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px;">
                                <div>
                                    <div class="tg-creation-field-label">New Passcode (4-8 digits)</div>
                                    <input class="tg-passcode-input" id="tg-new-passcode-input" type="password" inputmode="numeric" maxlength="8" placeholder="••••">
                                </div>
                                <div>
                                    <div class="tg-creation-field-label">Confirm Passcode</div>
                                    <input class="tg-passcode-input" id="tg-confirm-passcode-input" type="password" inputmode="numeric" maxlength="8" placeholder="••••">
                                </div>
                            </div>
                            <button class="tg-btn-primary-pill" id="tg-btn-enable-passcode" type="button">
                                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                <span>Enable Passcode</span>
                            </button>
                        </div>

                        <!-- Passcode ON State Container -->
                        <div id="tg-passcode-on-container" style="display: none;">
                            <div class="tg-list-group" style="margin-bottom: 16px;">
                                <button class="tg-list-row" type="button" id="tg-btn-open-change-passcode" style="cursor: pointer; width: 100%; border: none; background: transparent; text-align: left; display: flex; align-items: center; justify-content: space-between;">
                                    <span class="tg-list-row-text">Change Passcode</span>
                                    <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                                </button>
                                <div class="tg-list-row" style="display: flex; justify-content: space-between; align-items: center;">
                                    <span class="tg-list-row-text">Auto-Lock</span>
                                    <select id="tg-select-auto-lock-passcode" style="background: var(--tg-surface); color: var(--tg-text); border: 1px solid var(--tg-border); border-radius: 8px; padding: 4px 8px; font-size: 13px; cursor: pointer;">
                                        <option value="0">Disabled</option>
                                        <option value="1">in 1 minute</option>
                                        <option value="5">in 5 minutes</option>
                                        <option value="60">in 1 hour</option>
                                    </select>
                                </div>
                                <div class="tg-list-row tg-drawer-switch-row" id="tg-row-lock-blur-passcode" style="cursor: pointer; display: flex; align-items: center; justify-content: space-between;">
                                    <span class="tg-list-row-text">Lock on Window Blur</span>
                                    <div class="tg-switch" id="tg-switch-lock-blur-passcode"></div>
                                </div>
                                <button class="tg-list-row" type="button" id="tg-btn-lock-now-passcode" style="cursor: pointer; color: var(--tg-primary); width: 100%; border: none; background: transparent; text-align: left; display: flex; align-items: center; justify-content: space-between;">
                                    <span class="tg-list-row-text">Lock Liquid Chat Now</span>
                                    <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                                </button>
                            </div>

                            <!-- Collapsible Change Passcode Form -->
                            <div id="tg-change-passcode-form" style="display: none; background: var(--tg-surface-input); border: 1px solid var(--tg-border); border-radius: 14px; padding: 14px; margin-bottom: 16px;">
                                <div style="font-size: 13.5px; font-weight: 600; color: var(--tg-primary); margin-bottom: 12px;">Change Passcode</div>
                                <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px;">
                                    <input class="tg-passcode-input" id="tg-change-current-pin" type="password" inputmode="numeric" maxlength="8" placeholder="Current Passcode" style="font-size: 16px; letter-spacing: 4px;">
                                    <input class="tg-passcode-input" id="tg-change-new-pin" type="password" inputmode="numeric" maxlength="8" placeholder="New Passcode (4-8 digits)" style="font-size: 16px; letter-spacing: 4px;">
                                    <input class="tg-passcode-input" id="tg-change-confirm-pin" type="password" inputmode="numeric" maxlength="8" placeholder="Confirm New Passcode" style="font-size: 16px; letter-spacing: 4px;">
                                </div>
                                <div style="display: flex; gap: 8px;">
                                    <button class="tg-btn-primary-pill" id="tg-btn-save-change-passcode" type="button" style="flex: 1;">Save</button>
                                    <button class="tg-btn-danger-pill" id="tg-btn-cancel-change-passcode" type="button" style="flex: 1; margin-top: 0;">Cancel</button>
                                </div>
                            </div>

                            <button class="tg-btn-danger-pill" id="tg-btn-turn-off-passcode" type="button">
                                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path><line x1="12" y1="2" x2="12" y2="12"></line></svg>
                                <span>Turn Passcode Off</span>
                            </button>
                        </div>
                    </div>
                `;
                sidebar.appendChild(passcodeView);
                this.views['passcode'] = passcodeView;

                passcodeView.querySelector('.tg-view-back')?.addEventListener('click', () => {
                    this.closeView('passcode');
                });
            }
        }

        async loadNotificationSettings(panel) {
            try {
                const res = await window.ApiClient.fetch('settings');
                const data = await res.json();
                if (!data.success || !data.settings) return;

                const enabledSw = panel.querySelector('#tg-switch-notify-enabled');
                const senderSw = panel.querySelector('#tg-switch-notify-sender');
                const previewSw = panel.querySelector('#tg-switch-notify-preview');
                const fastReaction = panel.querySelector('#tg-fast-reaction-select');

                if (enabledSw) enabledSw.classList.toggle('active', parseInt(data.settings.notify_enabled, 10) === 1);
                if (senderSw) senderSw.classList.toggle('active', parseInt(data.settings.notify_show_sender, 10) === 1);
                if (previewSw) previewSw.classList.toggle('active', parseInt(data.settings.notify_show_preview, 10) === 1);
                if (fastReaction && data.settings.fast_reaction) fastReaction.value = data.settings.fast_reaction;

                const mode = data.settings.notify_mode || 'all';
                const radio = panel.querySelector(`input[name="tg-notify-mode"][value="${mode}"]`);
                if (radio) radio.checked = true;
            } catch (err) {}
        }

        async loadPrivacySettings(panel) {
            try {
                const res = await window.ApiClient.fetch('settings');
                const data = await res.json();
                if (data && data.success && data.settings) {
                    const privacy = data.settings.last_seen_privacy || 'everyone';
                    const select = panel.querySelector('#tg-select-last-seen');
                    if (select) {
                        select.value = privacy;
                    }
                }
            } catch (err) {}

            const isPasscodeActive = Boolean(
                window.AppLock &&
                window.AppLock.settings &&
                window.AppLock.settings.enabled &&
                window.AppLock.settings.pin_hash
            );
            const badge = panel.querySelector('#tg-passcode-status-badge');
            if (badge) {
                badge.textContent = isPasscodeActive ? 'On' : 'Off';
                badge.style.color = isPasscodeActive ? 'var(--tg-primary)' : 'var(--tg-text-secondary)';
            }
        }

        async loadStorageSettings(panel) {
            try {
                let bytes = 0;
                if (window.mediaStore && typeof window.mediaStore.getStorageEstimate === 'function') {
                    const est = await window.mediaStore.getStorageEstimate();
                    bytes = est.usage || 0;
                } else if ('storage' in navigator && 'estimate' in navigator.storage) {
                    const est = await navigator.storage.estimate();
                    bytes = est.usage || 0;
                }
                const cacheText = panel.querySelector('#tg-cache-size-text');
                if (cacheText) {
                    if (bytes > 1024 * 1024) {
                        cacheText.textContent = (bytes / (1024 * 1024)).toFixed(1) + ' MB';
                    } else if (bytes > 1024) {
                        cacheText.textContent = (bytes / 1024).toFixed(1) + ' KB';
                    } else {
                        cacheText.textContent = bytes + ' B';
                    }
                }
            } catch (err) {}
        }

                openView(viewName) {
            const panel = this.views[viewName];
            if (!panel) return;

            if (viewName === 'settings') {
                const userName = document.querySelector('meta[name="user-name"]')?.content || 'User';
                const userUsername = document.querySelector('meta[name="user-username"]')?.content || '';
                const userAvatarImg = document.getElementById('current-user-avatar');
                const avatarSrc = userAvatarImg ? userAvatarImg.src : 'uploads/images/default.png';

                const nameEl = panel.querySelector('#tg-settings-hero-name');
                const subEl = panel.querySelector('#tg-settings-hero-sub');
                const avEl = panel.querySelector('#tg-settings-hero-avatar');
                if (nameEl) nameEl.textContent = userName;
                if (subEl && userUsername) subEl.textContent = `@${userUsername.replace(/^@+/, '')}`;
                if (avEl) avEl.src = avatarSrc;
            } else if (viewName === 'edit-profile') {
                const userName = document.querySelector('meta[name="user-name"]')?.content || '';
                const userUsername = document.querySelector('meta[name="user-username"]')?.content || (window.chatApp?.currentUser?.username || '');
                const userBio = document.querySelector('meta[name="user-bio"]')?.content || '';
                const userAvatarImg = document.getElementById('current-user-avatar');
                const avatarSrc = userAvatarImg ? userAvatarImg.src : 'uploads/images/default.png';

                const fnInput = panel.querySelector('#tg-input-fullname');
                const unInput = panel.querySelector('#tg-input-username');
                const bioInput = panel.querySelector('#tg-input-bio');
                const avEl = panel.querySelector('#tg-edit-avatar-img');

                if (fnInput) fnInput.value = userName;
                if (unInput) unInput.value = userUsername.replace(/^@+/, '');
                if (bioInput) bioInput.value = userBio;
                if (avEl) avEl.src = avatarSrc;

                // Also fetch fresh profile from API to ensure sync
                if (window.ApiClient && typeof window.ApiClient.fetch === 'function') {
                    window.ApiClient.fetch('user_profile').then(res => {
                        const prof = res?.profile || res?.user;
                        if (prof) {
                            if (fnInput && prof.full_name) fnInput.value = prof.full_name;
                            if (unInput && prof.username) unInput.value = prof.username.replace(/^@+/, '');
                            if (bioInput && prof.bio !== undefined) bioInput.value = prof.bio || '';
                            if (avEl && prof.profile_pic) avEl.src = `uploads/images/${prof.profile_pic}`;
                        }
                    }).catch(() => {});
                }
            } else if (viewName === 'chat-settings') {
                const cur = (window.LiquidTheme && typeof window.LiquidTheme.get === 'function')
                    ? window.LiquidTheme.get()
                    : (localStorage.getItem('lc_theme') || 'telegram-z');
                panel.querySelectorAll('[data-theme-key]').forEach((card) => {
                    card.classList.toggle('active', card.dataset.themeKey === cur);
                });
                panel.querySelectorAll('[data-scheme]').forEach((card) => {
                    card.classList.toggle('active', card.dataset.scheme === this.scheme);
                });
            } else if (viewName === 'new-chat') {
                this.populateContactsList();
            } else if (viewName === 'new-group') {
                this.initNewGroupView(panel);
            } else if (viewName === 'new-channel') {
                this.initNewChannelView(panel);
            } else if (viewName === 'sessions') {
                this.loadActiveSessions(panel);
            } else if (viewName === 'notifications') {
                this.loadNotificationSettings(panel);
            } else if (viewName === 'privacy-security') {
                this.loadPrivacySettings(panel);
            } else if (viewName === 'storage') {
                this.loadStorageSettings(panel);
            } else if (viewName === 'passcode') {
                this.initPasscodeView(panel);
            }

            requestAnimationFrame(() => {
                panel.classList.add('open');
            });
            this.viewStack.push(viewName);
        }

        closeView(viewName) {
            const panel = this.views[viewName];
            if (panel) {
                panel.classList.remove('open');
            }
            this.viewStack = this.viewStack.filter(v => v !== viewName);
        }

        closeAllViews() {
            Object.values(this.views).forEach(panel => {
                panel.classList.remove('open');
            });
            this.viewStack = [];
        }

        async populateContactsList() {
            const listEl = document.getElementById('tg-contacts-list');
            if (!listEl) return;
            const app = getChatApp();
            if (app && (!app.contacts || !app.contacts.length) && typeof app.loadContacts === 'function') {
                listEl.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--tg-text-secondary); font-size: 14px;">Loading contacts...</div>';
                try {
                    await app.loadContacts();
                } catch (e) {}
            }

            const renderItems = (items, isGlobal = false) => {
                if (!items.length) return;
                if (isGlobal) {
                    const gHeader = document.createElement('div');
                    gHeader.style.cssText = 'padding: 8px 12px 4px; font-size: 12px; font-weight: 700; color: var(--tg-primary); text-transform: uppercase;';
                    gHeader.textContent = 'Global Search';
                    listEl.appendChild(gHeader);
                }
                items.forEach((contact) => {
                    const row = document.createElement('div');
                    row.className = 'contact-item conversation-item';
                    row.style.cursor = 'pointer';

                    const avatarSrc = (app && typeof app.getAvatarUrl === 'function')
                        ? app.getAvatarUrl(contact.profile_pic, contact.full_name || contact.username, { type: 'user' })
                        : (contact.profile_pic ? `uploads/images/${contact.profile_pic}` : 'uploads/images/default.png');
                    const displayName = contact.full_name || contact.username || 'User';
                    const subText = contact.username ? `@${contact.username}` : (contact.is_online ? 'online' : 'offline');

                    row.innerHTML = `
                        <div class="contact-avatar">
                            <img src="${avatarSrc}" alt="${displayName}">
                        </div>
                        <div class="contact-info">
                            <div class="contact-name">${displayName}</div>
                            <div class="contact-status" style="font-size: 12px; color: ${contact.username ? 'var(--tg-primary)' : 'var(--tg-text-secondary)'};">${subText}</div>
                        </div>
                    `;

                    row.addEventListener('click', () => {
                        this.closeView('new-chat');
                        if (app) {
                            app.openChat(contact.user_id, 'direct', contact);
                        }
                    });

                    listEl.appendChild(row);
                });
            };

            const searchInput = document.getElementById('tg-contacts-search');
            let searchTimer = null;

            const updateList = async () => {
                const rawTerm = (searchInput ? searchInput.value.trim() : '').toLowerCase();
                const cleanTerm = rawTerm.startsWith('@') ? rawTerm.slice(1) : rawTerm;
                listEl.innerHTML = '';
                const contacts = (app && app.contacts) ? app.contacts : [];
                const filtered = contacts.filter(c => {
                    const name = (c.full_name || '').toLowerCase();
                    const uname = (c.username || '').toLowerCase();
                    return !cleanTerm || name.includes(cleanTerm) || uname.includes(cleanTerm);
                });

                if (filtered.length) {
                    renderItems(filtered);
                } else if (!rawTerm) {
                    listEl.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--tg-text-secondary); font-size: 14px;">No contacts yet. Type a username above to search globally!</div>';
                }

                if (cleanTerm.length >= 2) {
                    try {
                        const res = await window.ApiClient.fetch('search_users', undefined, { term: cleanTerm });
                        const data = await res.json();
                        if (data && data.success && Array.isArray(data.users)) {
                            const globalUsers = data.users.filter(u => {
                                const uid = Number(u.user_id);
                                const isSelf = app && uid === Number(app.userId);
                                const inContacts = filtered.some(c => Number(c.user_id) === uid);
                                return !isSelf && !inContacts;
                            });
                            if (globalUsers.length) {
                                renderItems(globalUsers, true);
                            } else if (!filtered.length) {
                                listEl.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--tg-text-secondary); font-size: 14px;">No users found</div>';
                            }
                        }
                    } catch (e) {}
                }
            };

            if (searchInput && !searchInput.dataset.wired) {
                searchInput.dataset.wired = '1';
                searchInput.addEventListener('input', () => {
                    if (searchTimer) clearTimeout(searchTimer);
                    searchTimer = setTimeout(updateList, 220);
                });
            }

            await updateList();
        }

        async initNewGroupView(panel) {
            const nameInput = panel.querySelector('#tg-group-name-input');
            const descInput = panel.querySelector('#tg-group-desc-input');
            const searchInput = panel.querySelector('#tg-group-members-search');
            const membersList = panel.querySelector('#tg-group-members-list');
            const chipsWrap = panel.querySelector('#tg-group-selected-chips');
            const countLabel = panel.querySelector('#tg-group-member-count');
            const createBtn = panel.querySelector('#tg-btn-create-group');
            const avatarFile = panel.querySelector('#tg-group-avatar-file');
            const avatarWrap = panel.querySelector('#tg-group-avatar-wrap');
            const avatarPreview = panel.querySelector('#tg-group-avatar-preview');

            if (nameInput) nameInput.value = '';
            if (descInput) descInput.value = '';
            if (searchInput) searchInput.value = '';
            if (chipsWrap) chipsWrap.innerHTML = '';
            if (countLabel) countLabel.textContent = '0 selected';
            if (avatarPreview) { avatarPreview.style.display = 'none'; avatarPreview.src = ''; }

            const selectedMemberIds = new Set();
            const app = getChatApp();

            if (avatarWrap && avatarFile && !avatarWrap.dataset.wired) {
                avatarWrap.dataset.wired = '1';
                avatarWrap.onclick = () => avatarFile.click();
                avatarFile.onchange = () => {
                    const file = avatarFile.files[0];
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            avatarPreview.src = e.target.result;
                            avatarPreview.style.display = 'block';
                        };
                        reader.readAsDataURL(file);
                    }
                };
            }

            const updateChips = () => {
                if (countLabel) {
                    countLabel.textContent = `${selectedMemberIds.size} selected`;
                }
                if (!chipsWrap) return;
                chipsWrap.innerHTML = '';
                const contacts = (app && app.contacts) ? app.contacts : [];
                selectedMemberIds.forEach((id) => {
                    const c = contacts.find(item => Number(item.user_id) === Number(id));
                    const name = c ? (c.full_name || c.username) : `User ${id}`;
                    const avatarSrc = (c && app && typeof app.getAvatarUrl === 'function')
                        ? app.getAvatarUrl(c.profile_pic, name, { type: 'user' })
                        : 'uploads/images/default.png';

                    const chip = document.createElement('div');
                    chip.className = 'tg-member-chip';
                    chip.innerHTML = `
                        <img class="tg-member-chip-avatar" src="${avatarSrc}" alt="${name}">
                        <span>${name}</span>
                        <button type="button" class="tg-member-chip-remove" title="Remove">&times;</button>
                    `;
                    chip.querySelector('.tg-member-chip-remove').onclick = () => {
                        selectedMemberIds.delete(id);
                        updateChips();
                        updateMembersList();
                    };
                    chipsWrap.appendChild(chip);
                });
            };

            const updateMembersList = async () => {
                if (!membersList) return;
                membersList.innerHTML = '';
                if (app && (!app.contacts || !app.contacts.length) && typeof app.loadContacts === 'function') {
                    await app.loadContacts();
                }
                const rawTerm = (searchInput ? searchInput.value.trim() : '').toLowerCase();
                const cleanTerm = rawTerm.startsWith('@') ? rawTerm.slice(1) : rawTerm;
                const contacts = (app && app.contacts) ? app.contacts : [];
                let filtered = contacts.filter(c => {
                    const name = (c.full_name || '').toLowerCase();
                    const uname = (c.username || '').toLowerCase();
                    return !cleanTerm || name.includes(cleanTerm) || uname.includes(cleanTerm);
                });

                if (!filtered.length && cleanTerm.length >= 2) {
                    try {
                        const res = await window.ApiClient.fetch('search_users', undefined, { term: cleanTerm });
                        const data = await res.json();
                        if (data && data.success && Array.isArray(data.users)) {
                            filtered = data.users.filter(u => Number(u.user_id) !== Number(app ? app.userId : 0));
                        }
                    } catch (e) {}
                }

                if (!filtered.length) {
                    membersList.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--tg-text-secondary); font-size: 13px;">No contacts or users found</div>';
                    return;
                }

                filtered.forEach((contact) => {
                    const row = document.createElement('div');
                    row.className = 'contact-item conversation-item';
                    row.style.cssText = 'cursor: pointer; display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-radius: 12px; margin-bottom: 2px; transition: background 0.15s ease;';
                    const isSelected = selectedMemberIds.has(contact.user_id);

                    const avatarSrc = (app && typeof app.getAvatarUrl === 'function')
                        ? app.getAvatarUrl(contact.profile_pic, contact.full_name || contact.username, { type: 'user' })
                        : 'uploads/images/default.png';
                    const displayName = contact.full_name || contact.username || 'User';
                    const subText = contact.username ? `@${contact.username}` : (contact.is_online ? 'online' : 'offline');

                    row.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div class="contact-avatar" style="width: 42px; height: 42px;">
                                <img src="${avatarSrc}" alt="${displayName}">
                            </div>
                            <div class="contact-info">
                                <div class="contact-name" style="font-size: 14.5px; font-weight: 500;">${displayName}</div>
                                <div class="contact-status" style="font-size: 12px; color: ${contact.username ? 'var(--tg-primary)' : 'var(--tg-text-secondary)'};">${subText}</div>
                            </div>
                        </div>
                        <div class="tg-round-checkbox ${isSelected ? 'checked' : ''}">
                            <svg viewBox="0 0 24 24" width="13" height="13" stroke="#ffffff" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                        </div>
                    `;

                    row.onclick = () => {
                        if (selectedMemberIds.has(contact.user_id)) {
                            selectedMemberIds.delete(contact.user_id);
                        } else {
                            selectedMemberIds.add(contact.user_id);
                        }
                        updateChips();
                        const chk = row.querySelector('.tg-round-checkbox');
                        if (chk) chk.classList.toggle('checked', selectedMemberIds.has(contact.user_id));
                    };

                    membersList.appendChild(row);
                });
            };

            if (searchInput && !searchInput.dataset.wired) {
                searchInput.dataset.wired = '1';
                let termTimer = null;
                searchInput.addEventListener('input', () => {
                    if (termTimer) clearTimeout(termTimer);
                    termTimer = setTimeout(updateMembersList, 200);
                });
            }

            await updateMembersList();

            if (createBtn) {
                createBtn.onclick = async () => {
                    const groupName = nameInput.value.trim();
                    if (!groupName) {
                        if (window.showInAppToast) window.showInAppToast('Please enter a group name', 'error');
                        nameInput.focus();
                        return;
                    }

                    createBtn.disabled = true;
                    try {
                        const payload = {
                            groupName: groupName,
                            groupDescription: descInput.value.trim(),
                            joinPolicy: 'invite',
                            memberIds: Array.from(selectedMemberIds)
                        };
                        const res = await window.ApiClient.fetch('create_group', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                        });
                        const data = await res.json();
                        if (data && data.success) {
                            if (window.showInAppToast) window.showInAppToast('Group created successfully!', 'success');
                            this.closeView('new-group');
                            if (app) {
                                await app.loadConversations();
                                app.openChat(data.group_id, 'group', {
                                    group_id: data.group_id,
                                    group_name: groupName,
                                    type: 'group'
                                });
                            }
                        } else {
                            const msg = data && data.message ? data.message : 'Failed to create group';
                            if (window.showInAppToast) window.showInAppToast(msg, 'error');
                        }
                    } catch (err) {
                        if (window.showInAppToast) window.showInAppToast('Error creating group', 'error');
                    } finally {
                        createBtn.disabled = false;
                    }
                };
            }
        }

        initNewChannelView(panel) {
            const nameInput = panel.querySelector('#tg-channel-name-input');
            const descInput = panel.querySelector('#tg-channel-desc-input');
            const usernameInput = panel.querySelector('#tg-channel-username-input');
            const usernameSection = panel.querySelector('#tg-channel-username-section');
            const createBtn = panel.querySelector('#tg-btn-create-channel');
            const pillCreateBtn = panel.querySelector('#tg-btn-create-channel-pill');
            const avatarWrap = panel.querySelector('#tg-channel-avatar-wrap');
            const avatarFile = panel.querySelector('#tg-channel-avatar-file');
            const avatarPreview = panel.querySelector('#tg-channel-avatar-preview');
            const publicCard = panel.querySelector('#tg-channel-type-public');
            const privateCard = panel.querySelector('#tg-channel-type-private');

            if (nameInput) nameInput.value = '';
            if (descInput) descInput.value = '';
            if (usernameInput) usernameInput.value = '';
            if (avatarPreview) { avatarPreview.style.display = 'none'; avatarPreview.src = ''; }

            let selectedType = 'public';
            const setChannelType = (type) => {
                selectedType = type;
                const isPublic = type === 'public';
                publicCard?.classList.toggle('active', isPublic);
                publicCard?.querySelector('.tg-round-checkbox')?.classList.toggle('checked', isPublic);
                privateCard?.classList.toggle('active', !isPublic);
                privateCard?.querySelector('.tg-round-checkbox')?.classList.toggle('checked', !isPublic);
                if (usernameSection) {
                    usernameSection.style.display = isPublic ? 'block' : 'none';
                }
            };

            if (publicCard) publicCard.onclick = () => setChannelType('public');
            if (privateCard) privateCard.onclick = () => setChannelType('private');
            setChannelType('public');

            if (avatarWrap && avatarFile && !avatarWrap.dataset.wired) {
                avatarWrap.dataset.wired = '1';
                avatarWrap.onclick = () => avatarFile.click();
                avatarFile.onchange = () => {
                    const file = avatarFile.files[0];
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            avatarPreview.src = e.target.result;
                            avatarPreview.style.display = 'block';
                        };
                        reader.readAsDataURL(file);
                    }
                };
            }

            const executeCreate = async () => {
                const channelName = (nameInput ? nameInput.value : '').trim();
                if (!channelName) {
                    if (window.showInAppToast) window.showInAppToast('Please enter a channel name', 'error');
                    nameInput?.focus();
                    return;
                }

                const channelUsername = (usernameInput ? usernameInput.value : '').trim().replace(/^@/, '');

                if (createBtn) createBtn.disabled = true;
                if (pillCreateBtn) pillCreateBtn.disabled = true;
                try {
                    const payload = {
                        channelName: channelName,
                        channelDescription: descInput ? descInput.value.trim() : '',
                        channelUsername: selectedType === 'public' ? channelUsername : '',
                        visibility: selectedType
                    };
                    const res = await window.ApiClient.fetch('create_channel', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    const data = await res.json();
                    if (data && data.success) {
                        if (window.showInAppToast) window.showInAppToast('Channel created successfully!', 'success');
                        this.closeView('new-channel');
                        const app = getChatApp();
                        if (app) {
                            await app.loadConversations();
                            app.openChat(data.channel_id, 'channel', {
                                channel_id: data.channel_id,
                                channel_name: channelName,
                                type: 'channel'
                            });
                        }
                    } else {
                        const msg = data && data.message ? data.message : 'Failed to create channel';
                        if (window.showInAppToast) window.showInAppToast(msg, 'error');
                    }
                } catch (err) {
                    if (window.showInAppToast) window.showInAppToast('Error creating channel', 'error');
                } finally {
                    if (createBtn) createBtn.disabled = false;
                    if (pillCreateBtn) pillCreateBtn.disabled = false;
                }
            };

            if (createBtn) createBtn.onclick = executeCreate;
            if (pillCreateBtn) pillCreateBtn.onclick = executeCreate;
        }

        initPasscodeView(panel) {
            const offContainer = panel.querySelector('#tg-passcode-off-container');
            const onContainer = panel.querySelector('#tg-passcode-on-container');
            const changeForm = panel.querySelector('#tg-change-passcode-form');

            const newPinInput = panel.querySelector('#tg-new-passcode-input');
            const confirmPinInput = panel.querySelector('#tg-confirm-passcode-input');
            const enableBtn = panel.querySelector('#tg-btn-enable-passcode');

            const openChangeBtn = panel.querySelector('#tg-btn-open-change-passcode');
            const curChangePin = panel.querySelector('#tg-change-current-pin');
            const newChangePin = panel.querySelector('#tg-change-new-pin');
            const confirmChangePin = panel.querySelector('#tg-change-confirm-pin');
            const saveChangeBtn = panel.querySelector('#tg-btn-save-change-passcode');
            const cancelChangeBtn = panel.querySelector('#tg-btn-cancel-change-passcode');

            const autoLockSelect = panel.querySelector('#tg-select-auto-lock-passcode');
            const lockBlurRow = panel.querySelector('#tg-row-lock-blur-passcode');
            const lockBlurSwitch = panel.querySelector('#tg-switch-lock-blur-passcode');
            const lockNowBtn = panel.querySelector('#tg-btn-lock-now-passcode');
            const turnOffBtn = panel.querySelector('#tg-btn-turn-off-passcode');

            if (newPinInput) newPinInput.value = '';
            if (confirmPinInput) confirmPinInput.value = '';
            if (curChangePin) curChangePin.value = '';
            if (newChangePin) newChangePin.value = '';
            if (confirmChangePin) confirmChangePin.value = '';
            if (changeForm) changeForm.style.display = 'none';

            const renderState = () => {
                const isEnabled = Boolean(
                    window.AppLock &&
                    window.AppLock.settings &&
                    window.AppLock.settings.enabled &&
                    window.AppLock.settings.pin_hash
                );

                if (offContainer) offContainer.style.display = isEnabled ? 'none' : 'block';
                if (onContainer) onContainer.style.display = isEnabled ? 'block' : 'none';

                if (isEnabled && window.AppLock && window.AppLock.settings) {
                    if (autoLockSelect) autoLockSelect.value = String(window.AppLock.settings.auto_lock_min || 0);
                    if (lockBlurSwitch) lockBlurSwitch.classList.toggle('active', !!window.AppLock.settings.lock_on_blur);
                }

                if (typeof this.updateHeaderLockBtn === 'function') {
                    this.updateHeaderLockBtn();
                }

                const badge = document.getElementById('tg-passcode-status-badge');
                if (badge) {
                    badge.textContent = isEnabled ? 'On' : 'Off';
                    badge.style.color = isEnabled ? 'var(--tg-primary)' : 'var(--tg-text-secondary)';
                }
            };

            renderState();

            if (enableBtn && !enableBtn.dataset.wired) {
                enableBtn.dataset.wired = '1';
                enableBtn.onclick = async () => {
                    const pin = (newPinInput ? newPinInput.value : '').trim();
                    const confirm = (confirmPinInput ? confirmPinInput.value : '').trim();

                    if (!/^\d{4,8}$/.test(pin)) {
                        if (window.showInAppToast) window.showInAppToast('Passcode must be 4 to 8 digits.', 'error');
                        newPinInput?.focus();
                        return;
                    }
                    if (pin !== confirm) {
                        if (window.showInAppToast) window.showInAppToast('Passcodes do not match.', 'error');
                        confirmPinInput?.focus();
                        return;
                    }

                    if (window.AppLock && typeof window.AppLock.setPin === 'function') {
                        const res = await window.AppLock.setPin(pin);
                        if (res && res.success) {
                            if (window.showInAppToast) window.showInAppToast('Passcode enabled successfully!', 'success');
                            renderState();
                        } else {
                            if (window.showInAppToast) window.showInAppToast((res && res.message) || 'Failed to set passcode', 'error');
                        }
                    }
                };
            }

            if (openChangeBtn && !openChangeBtn.dataset.wired) {
                openChangeBtn.dataset.wired = '1';
                openChangeBtn.onclick = () => {
                    if (changeForm) {
                        const isOpen = changeForm.style.display !== 'none';
                        changeForm.style.display = isOpen ? 'none' : 'block';
                        if (!isOpen && curChangePin) curChangePin.focus();
                    }
                };
            }

            if (cancelChangeBtn && !cancelChangeBtn.dataset.wired) {
                cancelChangeBtn.dataset.wired = '1';
                cancelChangeBtn.onclick = () => {
                    if (changeForm) changeForm.style.display = 'none';
                    if (curChangePin) curChangePin.value = '';
                    if (newChangePin) newChangePin.value = '';
                    if (confirmChangePin) confirmChangePin.value = '';
                };
            }

            if (saveChangeBtn && !saveChangeBtn.dataset.wired) {
                saveChangeBtn.dataset.wired = '1';
                saveChangeBtn.onclick = async () => {
                    const curPin = (curChangePin ? curChangePin.value : '').trim();
                    const newPin = (newChangePin ? newChangePin.value : '').trim();
                    const confirm = (confirmChangePin ? confirmChangePin.value : '').trim();

                    if (!/^\d{4,8}$/.test(newPin)) {
                        if (window.showInAppToast) window.showInAppToast('New passcode must be 4 to 8 digits.', 'error');
                        newChangePin?.focus();
                        return;
                    }
                    if (newPin !== confirm) {
                        if (window.showInAppToast) window.showInAppToast('Passcode confirmation does not match.', 'error');
                        confirmChangePin?.focus();
                        return;
                    }

                    if (window.AppLock && typeof window.AppLock.changePin === 'function') {
                        const res = await window.AppLock.changePin(curPin, newPin);
                        if (res && res.success) {
                            if (window.showInAppToast) window.showInAppToast('Passcode changed successfully!', 'success');
                            if (changeForm) changeForm.style.display = 'none';
                            renderState();
                        } else {
                            if (window.showInAppToast) window.showInAppToast((res && res.message) || 'Failed to change passcode', 'error');
                        }
                    }
                };
            }

            if (autoLockSelect && !autoLockSelect.dataset.wired) {
                autoLockSelect.dataset.wired = '1';
                autoLockSelect.onchange = (e) => {
                    if (window.AppLock && window.AppLock.settings) {
                        window.AppLock.settings.auto_lock_min = parseInt(e.target.value, 10) || 0;
                        window.AppLock.saveSettings();
                        if (typeof window.AppLock.applyAutoLock === 'function') {
                            window.AppLock.applyAutoLock();
                        }
                        if (window.showInAppToast) window.showInAppToast('Auto-lock setting updated', 'info');
                    }
                };
            }

            if (lockBlurRow && !lockBlurRow.dataset.wired) {
                lockBlurRow.dataset.wired = '1';
                lockBlurRow.onclick = () => {
                    if (window.AppLock && window.AppLock.settings) {
                        window.AppLock.settings.lock_on_blur = !window.AppLock.settings.lock_on_blur;
                        window.AppLock.saveSettings();
                        if (lockBlurSwitch) lockBlurSwitch.classList.toggle('active', !!window.AppLock.settings.lock_on_blur);
                        if (window.showInAppToast) window.showInAppToast(window.AppLock.settings.lock_on_blur ? 'Lock on blur enabled' : 'Lock on blur disabled', 'info');
                    }
                };
            }

            if (lockNowBtn && !lockNowBtn.dataset.wired) {
                lockNowBtn.dataset.wired = '1';
                lockNowBtn.onclick = () => {
                    if (window.AppLock && typeof window.AppLock.lockNow === 'function') {
                        window.AppLock.lockNow();
                    }
                };
            }

            if (turnOffBtn && !turnOffBtn.dataset.wired) {
                turnOffBtn.dataset.wired = '1';
                turnOffBtn.onclick = async () => {
                    const confirmed = window.showInAppConfirm
                        ? await window.showInAppConfirm('Are you sure you want to turn off Passcode Lock?', 'Turn Off Passcode', 'Turn Off', 'Cancel')
                        : true;
                    if (!confirmed) return;

                    if (window.AppLock && typeof window.AppLock.turnOffPin === 'function') {
                        await window.AppLock.turnOffPin();
                        if (window.showInAppToast) window.showInAppToast('Passcode Lock turned off', 'info');
                        renderState();
                    }
                };
            }
        }

        /* --------------------------------------------------------------------
           5. Telegram Folder Tabs Bar (All, Personal, Groups, Channels, Unread)
           -------------------------------------------------------------------- */
        setupFolderTabs() {
            const sidebar = document.querySelector('.chat-sidebar');
            if (!sidebar) return;

            this.currentFolder = localStorage.getItem('tg_active_folder') || 'all';

            let tabStrip = sidebar.querySelector('.tg-folder-tabs');
            if (!tabStrip) {
                tabStrip = document.createElement('div');
                tabStrip.className = 'tg-folder-tabs';
                const searchBar = sidebar.querySelector('.search-bar');
                if (searchBar && searchBar.nextSibling) {
                    sidebar.insertBefore(tabStrip, searchBar.nextSibling);
                } else {
                    sidebar.appendChild(tabStrip);
                }
            }

            const app = getChatApp();
            const customFolders = (app && Array.isArray(app.folders)) ? app.folders : [];

            let html = `
                <button class="tg-folder-tab ${this.currentFolder === 'all' ? 'active' : ''}" type="button" data-folder="all">
                    <span>All</span>
                </button>
                <button class="tg-folder-tab ${this.currentFolder === 'direct' ? 'active' : ''}" type="button" data-folder="direct">
                    <span>Personal</span>
                </button>
                <button class="tg-folder-tab ${this.currentFolder === 'group' ? 'active' : ''}" type="button" data-folder="group">
                    <span>Groups</span>
                </button>
                <button class="tg-folder-tab ${this.currentFolder === 'channel' ? 'active' : ''}" type="button" data-folder="channel">
                    <span>Channels</span>
                </button>
                <button class="tg-folder-tab ${this.currentFolder === 'unread' ? 'active' : ''}" type="button" data-folder="unread">
                    <span>Unread</span>
                </button>
            `;

            customFolders.forEach((cf) => {
                const fKey = `custom-${cf.id}`;
                const isActive = this.currentFolder === fKey;
                const safeName = (cf.name || 'Folder').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                html += `
                    <button class="tg-folder-tab ${isActive ? 'active' : ''}" type="button" data-folder="${fKey}">
                        <span>${safeName}</span>
                    </button>
                `;
            });

            tabStrip.innerHTML = html;
            tabStrip.style.display = 'flex';
            this.folderTabsBar = tabStrip;

            tabStrip.querySelectorAll('.tg-folder-tab').forEach((tab) => {
                tab.onclick = () => {
                    tabStrip.querySelectorAll('.tg-folder-tab').forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    this.currentFolder = tab.dataset.folder;
                    localStorage.setItem('tg_active_folder', this.currentFolder);
                    const app = getChatApp();
                    if (app && typeof app.renderConversations === 'function') {
                        app.renderConversations();
                    }
                    this.filterChats(this.currentFolder);
                };
            });

            this.filterChats(this.currentFolder);
        }

        filterChats(type, searchTerm = '') {
            this.currentFolder = type || 'all';
            const list = document.getElementById('conversations-list');
            if (!list) return;

            const app = getChatApp();
            const items = list.querySelectorAll('.contact-item, .chat-item');
            let visibleCount = 0;
            const term = (searchTerm || '').trim().toLowerCase();

            items.forEach((item) => {
                if (item.classList.contains('global-search-item')) return;
                let show = false;

                if (type === 'all') {
                    show = true;
                } else if (type === 'unread') {
                    const hasUnreadBadge = Boolean(item.querySelector('.unread-badge, .unread-count, .badge-unread'));
                    const isUnreadClass = item.classList.contains('unread');
                    const hasUnreadData = item.dataset.unread && item.dataset.unread !== '0';
                    show = hasUnreadBadge || isUnreadClass || Boolean(hasUnreadData);
                } else if (type === 'direct') {
                    const cType = item.dataset.chatType || '';
                    show = (cType === 'direct' || cType === 'saved' || cType === 'user' || cType === '');
                } else if (type === 'group') {
                    show = (item.dataset.chatType === 'group');
                } else if (type === 'channel') {
                    show = (item.dataset.chatType === 'channel');
                } else if (type && type.startsWith('custom-')) {
                    const folderId = parseInt(type.replace('custom-', ''), 10);
                    if (app && app.folderAssignments && app.folderAssignments.has(folderId)) {
                        const assigned = app.folderAssignments.get(folderId);
                        const cType = item.dataset.chatType || 'direct';
                        const cId = item.dataset.chatId || '';
                        show = assigned.has(`${cType}:${cId}`);
                    }
                }

                if (show && term) {
                    const name = (item.dataset.name || '').toLowerCase();
                    if (!name.includes(term)) {
                        show = false;
                    }
                }

                item.classList.toggle('tg-folder-hidden', !show);
                item.style.setProperty('display', show ? 'flex' : 'none', 'important');
                if (show) visibleCount++;
            });

            let emptyEl = list.querySelector('.tg-folder-empty-state');
            if (visibleCount === 0 && items.length > 0 && !term) {
                if (!emptyEl) {
                    emptyEl = document.createElement('div');
                    emptyEl.className = 'tg-folder-empty-state';
                    list.appendChild(emptyEl);
                }
                const folderNames = {
                    'all': 'No chats found',
                    'direct': 'No personal chats yet',
                    'group': 'No groups yet',
                    'channel': 'No channels yet',
                    'unread': 'No unread messages'
                };
                const msg = folderNames[type] || 'No chats in this folder';
                emptyEl.innerHTML = `
                    <div class="tg-folder-empty-icon">📁</div>
                    <div class="tg-folder-empty-text">${msg}</div>
                `;
                emptyEl.style.setProperty('display', 'flex', 'important');
            } else if (emptyEl) {
                emptyEl.style.setProperty('display', 'none', 'important');
            }
        }

        setupListObserver() {
            const list = document.getElementById('conversations-list');
            if (!list || this.listObserver) return;

            this.listObserver = new MutationObserver((mutations) => {
                const isOnlyEmptyState = mutations.every(m => {
                    return Array.from(m.addedNodes).concat(Array.from(m.removedNodes)).every(n => {
                        return n.classList && n.classList.contains('tg-folder-empty-state');
                    });
                });
                if (isOnlyEmptyState) return;

                if (this.active) {
                    this.filterChats(this.currentFolder);
                }
                this.syncActiveChatItem();
            });

            this.listObserver.observe(list, { childList: true });

            list.addEventListener('click', (e) => {
                const item = e.target.closest('.contact-item, .chat-item');
                if (item) {
                    this.syncActiveChatItem();
                    this.syncActiveChatState();
                }
            });
        }

        syncActiveChatItem() {
            const app = getChatApp();
            const list = document.getElementById('conversations-list');
            if (!list) return;
            if (!app || !app.currentChat) {
                list.querySelectorAll('.contact-item, .chat-item').forEach((it) => {
                    it.classList.remove('active', 'is-selected');
                });
                return;
            }
            const activeId = String(app.currentChat.id);
            const activeType = app.currentChat.type;
            list.querySelectorAll('.contact-item, .chat-item').forEach((it) => {
                const itId = String(it.dataset.chatId);
                const itType = it.dataset.chatType || 'direct';
                let isMatch = false;
                if (activeType === 'saved' && itType === 'saved') {
                    isMatch = true;
                } else if (itType === activeType && itId === activeId) {
                    isMatch = true;
                }
                it.classList.toggle('active', isMatch);
            });
        }

        /* --------------------------------------------------------------------
           6. Floating Action Button (New Chat Speed-Dial FAB)
           -------------------------------------------------------------------- */
        setupFAB() {
            const sidebar = document.querySelector('.chat-sidebar');
            if (!sidebar) return;

            let fab = sidebar.querySelector('.tg-fab-new-chat');
            if (!fab) {
                fab = document.createElement('button');
                fab.className = 'tg-fab-new-chat';
                fab.type = 'button';
                fab.title = 'New Message / Group';
                fab.innerHTML = `
                    <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                `;
                sidebar.appendChild(fab);
            }

            let speedDial = sidebar.querySelector('.tg-fab-speed-dial');
            if (!speedDial) {
                speedDial = document.createElement('div');
                speedDial.className = 'tg-fab-speed-dial';
                speedDial.innerHTML = `
                    <button class="tg-speed-dial-item" type="button" data-action="new-channel">
                        <span class="tg-speed-dial-label">New Channel</span>
                        <span class="tg-speed-dial-icon">
                            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                        </span>
                    </button>
                    <button class="tg-speed-dial-item" type="button" data-action="new-group">
                        <span class="tg-speed-dial-label">New Group</span>
                        <span class="tg-speed-dial-icon">
                            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                        </span>
                    </button>
                    <button class="tg-speed-dial-item" type="button" data-action="new-message">
                        <span class="tg-speed-dial-label">New Message</span>
                        <span class="tg-speed-dial-icon">
                            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                        </span>
                    </button>
                `;
                sidebar.appendChild(speedDial);

                speedDial.querySelectorAll('.tg-speed-dial-item').forEach((item) => {
                    item.addEventListener('click', (e) => {
                        e.stopPropagation();
                        fab.classList.remove('active');
                        speedDial.classList.remove('open');
                        const act = item.dataset.action;
                        if (act === 'new-channel') {
                            this.openView('new-channel');
                        } else if (act === 'new-group') {
                            this.openView('new-group');
                        } else if (act === 'new-message') {
                            this.openView('new-chat');
                        }
                    });
                });

                document.addEventListener('click', (e) => {
                    if (!e.target.closest('.tg-fab-speed-dial') && !e.target.closest('.tg-fab-new-chat')) {
                        fab.classList.remove('active');
                        speedDial.classList.remove('open');
                    }
                });
            }

            fab.style.display = 'flex';
            this.fabButton = fab;

            fab.onclick = (e) => {
                e.stopPropagation();
                const isOpen = speedDial.classList.toggle('open');
                fab.classList.toggle('active', isOpen);
            };
        }

        async loadActiveSessions(panel) {
            const listEl = panel.querySelector('#tg-sessions-list');
            if (!listEl) return;
            listEl.innerHTML = '<div style="color: var(--tg-text-secondary); text-align: center; padding: 20px;">Loading sessions...</div>';
            try {
                const res = await window.ApiClient.fetch('sessions');
                const data = await res.json();
                if (!data.success || !data.sessions || !data.sessions.length) {
                    listEl.innerHTML = '<div style="color: var(--tg-text-secondary); text-align: center; padding: 20px;">No other active sessions.</div>';
                    return;
                }
                listEl.innerHTML = '';
                data.sessions.forEach((s) => {
                    const row = document.createElement('div');
                    row.className = 'tg-list-row';
                    row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:10px 14px;';
                    row.innerHTML = `
                        <div style="display:flex; flex-direction:column; gap:2px; min-width:0;">
                            <span style="font-size:14px; font-weight:600; color:var(--tg-text);">${s.device || s.user_agent || 'Device'}</span>
                            <span style="font-size:12px; color:var(--tg-text-secondary);">${s.ip_address || ''} • ${s.last_activity ? new Date(s.last_activity).toLocaleString() : 'Active'}</span>
                        </div>
                        ${s.is_current ? '<span style="font-size:12px; color:var(--tg-primary); font-weight:600;">Current</span>' : `
                        <button class="btn btn-sm btn-danger tg-revoke-session-btn" type="button" style="color:#ff595a; background:rgba(255,89,90,0.1); border:none; padding:4px 8px; border-radius:6px; cursor:pointer;">
                            Terminate
                        </button>
                        `}
                    `;
                    const revokeBtn = row.querySelector('.tg-revoke-session-btn');
                    if (revokeBtn) {
                        revokeBtn.onclick = async () => {
                            const confirmed = window.showInAppConfirm
                                ? await window.showInAppConfirm('Are you sure you want to terminate this session?', 'Terminate Session', 'Terminate', 'Cancel')
                                : true;
                            if (!confirmed) return;
                            try {
                                await window.ApiClient.fetch('sessions', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ action: 'revoke', session_id: s.id })
                                });
                                this.loadActiveSessions(panel);
                                if (window.showInAppToast) window.showInAppToast('Session terminated', 'success');
                            } catch (err) {}
                        };
                    }
                    listEl.appendChild(row);
                });
            } catch (err) {
                listEl.innerHTML = '<div style="color: var(--tg-text-secondary); text-align: center; padding: 20px;">Unable to load sessions.</div>';
            }
        }

        initMessageSelection() {
            this.selectedMessageIds = new Set();

            document.addEventListener('click', (e) => {
                if (!document.body.classList.contains('tg-message-selection-mode')) return;
                const msgEl = e.target.closest('.message');
                if (!msgEl) return;
                const rawId = msgEl.dataset.messageId || msgEl.id.replace(/^msg[-_]/, '');
                const msgId = parseInt(rawId, 10);
                if (msgId) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.toggleMessageSelection(msgId, msgEl);
                }
            }, true);
        }

        enterSelectionMode(initialMessage) {
            document.body.classList.add('tg-message-selection-mode');
            const chatMain = document.querySelector('.chat-main');
            if (!chatMain) return;

            let toolbar = chatMain.querySelector('.tg-selection-toolbar');
            if (!toolbar) {
                toolbar = document.createElement('div');
                toolbar.className = 'tg-selection-toolbar';
                toolbar.innerHTML = `
                    <div style="display:flex;align-items:center;gap:12px;">
                        <button class="btn btn-icon tg-selection-cancel" type="button" title="Cancel">
                            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                        <span class="tg-selection-count">0 messages selected</span>
                    </div>
                    <div class="tg-selection-actions" style="display:flex;align-items:center;gap:8px;">
                        <button class="btn btn-secondary tg-selection-forward" type="button" style="display:flex;align-items:center;gap:6px;">
                            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>
                            <span>Forward</span>
                        </button>
                        <button class="btn btn-danger tg-selection-delete" type="button" style="display:flex;align-items:center;gap:6px;color:#ff595a;background:rgba(255,89,90,0.12);border:none;border-radius:8px;padding:6px 12px;cursor:pointer;">
                            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            <span>Delete</span>
                        </button>
                    </div>
                `;
                chatMain.appendChild(toolbar);

                toolbar.querySelector('.tg-selection-cancel')?.addEventListener('click', () => {
                    this.exitSelectionMode();
                });

                toolbar.querySelector('.tg-selection-delete')?.addEventListener('click', () => {
                    this.deleteSelectedMessages();
                });

                toolbar.querySelector('.tg-selection-forward')?.addEventListener('click', () => {
                    this.forwardSelectedMessages();
                });
            }
            toolbar.classList.add('open');
            toolbar.style.display = 'flex';

            this.selectedMessageIds.clear();
            if (initialMessage && initialMessage.message_id) {
                const el = document.getElementById('msg_' + initialMessage.message_id) ||
                    document.getElementById('msg-' + initialMessage.message_id) ||
                    document.querySelector(`[data-message-id="${initialMessage.message_id}"]`);
                this.toggleMessageSelection(initialMessage.message_id, el);
            }
        }

        toggleMessageSelection(messageId, msgEl) {
            if (this.selectedMessageIds.has(messageId)) {
                this.selectedMessageIds.delete(messageId);
                if (msgEl) msgEl.classList.remove('is-selected');
            } else {
                this.selectedMessageIds.add(messageId);
                if (msgEl) msgEl.classList.add('is-selected');
            }

            const count = this.selectedMessageIds.size;
            const countEl = document.querySelector('.tg-selection-count');
            if (countEl) {
                countEl.textContent = count === 1 ? '1 message selected' : `${count} messages selected`;
            }

            if (count === 0) {
                this.exitSelectionMode();
            }
        }

        exitSelectionMode() {
            document.body.classList.remove('tg-message-selection-mode');
            document.querySelectorAll('.message.is-selected').forEach((m) => m.classList.remove('is-selected'));
            this.selectedMessageIds.clear();
            const toolbar = document.querySelector('.tg-selection-toolbar');
            if (toolbar) {
                toolbar.classList.remove('open');
                toolbar.style.display = 'none';
            }
        }

        async deleteSelectedMessages() {
            const count = this.selectedMessageIds.size;
            if (!count) return;
            const confirmed = window.showInAppConfirm
                ? await window.showInAppConfirm(`Are you sure you want to delete ${count} selected message(s)?`, 'Delete Messages', 'Delete', 'Cancel')
                : true;
            if (!confirmed) return;

            const ids = Array.from(this.selectedMessageIds);
            ids.forEach((id) => {
                const el = document.getElementById('msg_' + id) ||
                    document.getElementById('msg-' + id) ||
                    document.querySelector(`[data-message-id="${id}"]`);
                if (el) {
                    this.animateSnap(el);
                }
            });

            for (const id of ids) {
                try {
                    await window.ApiClient.fetch('delete_message', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ message_id: id, scope: 'all' })
                    });
                } catch (err) {}
            }
            if (window.chatApp && typeof window.chatApp.applyDeletedMessages === 'function') {
                window.chatApp.applyDeletedMessages(ids);
            } else {
                ids.forEach((id) => {
                    const el = document.getElementById('msg_' + id) ||
                        document.getElementById('msg-' + id) ||
                        document.querySelector(`[data-message-id="${id}"]`);
                    el?.remove();
                });
            }
            this.exitSelectionMode();
        }

        forwardSelectedMessages() {
            const ids = Array.from(this.selectedMessageIds);
            if (!ids.length) return;
            const firstId = ids[0];
            const msg = window.chatApp?.messageCache?.get(firstId);
            if (msg && window.chatApp?.openForwardModal) {
                window.chatApp.openForwardModal(msg);
            }
            this.exitSelectionMode();
        }

        /* --------------------------------------------------------------------
           MiddleSearch (In-Chat Search Island Header)
           Reference: Telegram Web Z MiddleSearch.tsx / MiddleSearch.module.scss
           -------------------------------------------------------------------- */
        setupMiddleSearch() {
            const chatMain = document.querySelector('.chat-main');
            if (!chatMain) return;

            let middleSearch = chatMain.querySelector('#tg-middle-search');
            if (!middleSearch) {
                middleSearch = document.createElement('div');
                middleSearch.id = 'tg-middle-search';
                middleSearch.className = 'tg-middle-search';
                middleSearch.innerHTML = `
                    <button class="tg-middle-search-nav-btn tg-middle-search-close" type="button" title="Close search">
                        <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2.2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                    <div class="tg-middle-search-input-wrap">
                        <input type="text" id="tg-middle-search-input" placeholder="Search this chat..." autocomplete="off">
                    </div>
                    <span class="tg-middle-search-count" id="tg-middle-search-count"></span>
                    <button class="tg-middle-search-nav-btn" id="tg-middle-search-prev" type="button" title="Previous result" disabled>
                        <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2.2"><polyline points="18 15 12 9 6 15"></polyline></svg>
                    </button>
                    <button class="tg-middle-search-nav-btn" id="tg-middle-search-next" type="button" title="Next match" disabled>
                        <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2.2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </button>
                `;
                chatMain.appendChild(middleSearch);

                const input = middleSearch.querySelector('#tg-middle-search-input');
                const closeBtn = middleSearch.querySelector('.tg-middle-search-close');
                const prevBtn = middleSearch.querySelector('#tg-middle-search-prev');
                const nextBtn = middleSearch.querySelector('#tg-middle-search-next');

                closeBtn.onclick = () => this.closeMiddleSearch();

                let searchDebounce = null;
                input.oninput = () => {
                    const q = input.value.trim();
                    if (searchDebounce) clearTimeout(searchDebounce);
                    searchDebounce = setTimeout(() => {
                        const app = getChatApp();
                        if (app && typeof app.runChatSearch === 'function') {
                            app.chatSearch.query = q;
                            app.runChatSearch(q);
                        }
                    }, 250);
                };

                input.onkeydown = (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const app = getChatApp();
                        if (app && typeof app.navigateSearch === 'function') {
                            app.navigateSearch(e.shiftKey ? -1 : 1);
                        }
                    } else if (e.key === 'Escape') {
                        e.preventDefault();
                        this.closeMiddleSearch();
                    }
                };

                prevBtn.onclick = () => {
                    const app = getChatApp();
                    if (app && typeof app.navigateSearch === 'function') {
                        app.navigateSearch(-1);
                    }
                };

                nextBtn.onclick = () => {
                    const app = getChatApp();
                    if (app && typeof app.navigateSearch === 'function') {
                        app.navigateSearch(1);
                    }
                };
            }
        }

        openMiddleSearch() {
            this.setupMiddleSearch();
            const middleSearch = document.getElementById('tg-middle-search');
            if (!middleSearch) return;

            const legacyModal = document.getElementById('chat-search-modal');
            if (legacyModal) legacyModal.style.display = 'none';

            middleSearch.classList.add('active');
            const input = middleSearch.querySelector('#tg-middle-search-input');
            const app = getChatApp();
            if (input) {
                input.value = (app && app.chatSearch && app.chatSearch.query) ? app.chatSearch.query : '';
                input.focus();
            }
            this.syncMiddleSearchResults();
        }

        closeMiddleSearch() {
            const middleSearch = document.getElementById('tg-middle-search');
            if (middleSearch) {
                middleSearch.classList.remove('active');
            }
            const app = getChatApp();
            if (app && app.chatSearch) {
                app.chatSearch.query = '';
                app.updateSearchHighlights('');
            }
        }

        syncMiddleSearchResults() {
            const middleSearch = document.getElementById('tg-middle-search');
            if (!middleSearch || !middleSearch.classList.contains('active')) return;

            const app = getChatApp();
            const countEl = middleSearch.querySelector('#tg-middle-search-count');
            const prevBtn = middleSearch.querySelector('#tg-middle-search-prev');
            const nextBtn = middleSearch.querySelector('#tg-middle-search-next');

            if (!app || !app.chatSearch) return;

            const results = app.chatSearch.results || [];
            const total = results.length;
            const query = app.chatSearch.query || '';
            const idx = app.chatSearch.index || 0;

            if (!query) {
                if (countEl) countEl.textContent = '';
                if (prevBtn) prevBtn.disabled = true;
                if (nextBtn) nextBtn.disabled = true;
                return;
            }

            if (total === 0) {
                if (countEl) countEl.textContent = 'No results';
                if (prevBtn) prevBtn.disabled = true;
                if (nextBtn) nextBtn.disabled = true;
            } else {
                if (countEl) countEl.textContent = `${idx + 1} of ${total}`;
                if (prevBtn) prevBtn.disabled = false;
                if (nextBtn) nextBtn.disabled = false;
            }
        }

        /* --------------------------------------------------------------------
           Thanos Snap Dust Particle Disintegration Effect (60 FPS Canvas Engine)
           High-detail, silky-smooth GPU-accelerated particle simulation
           -------------------------------------------------------------------- */
        ensureSnapContainer() {
            let container = document.getElementById('snap-effect-container');
            if (!container) {
                container = document.createElement('div');
                container.id = 'snap-effect-container';
                container.className = 'tg-snap-effect-container';
                document.body.appendChild(container);
            }
            return container;
        }

        animateSnap(element) {
            if (!element) return false;
            // Target the actual message bubble element rather than the full-width row!
            const bubbleEl = element.querySelector('.message-bubble') ||
                             element.querySelector('.bubble') ||
                             element.querySelector('.message-content') ||
                             element;
            const bubbleRect = bubbleEl.getBoundingClientRect();
            if (bubbleRect.width <= 0 || bubbleRect.height <= 0) return false;

            const isOutgoing = element.classList.contains('outgoing') ||
                               Boolean(element.closest('.outgoing')) ||
                               element.classList.contains('sent') ||
                               bubbleEl.classList.contains('outgoing');
            // Wind direction: outgoing messages on the right blow towards the right screen edge (+1).
            // Incoming messages on the left blow towards the left screen edge (-1).
            const windDir = isOutgoing ? 1 : -1;

            // Dissolve the bubble itself smoothly with blur and fade
            bubbleEl.style.transition = 'filter 360ms cubic-bezier(0.4, 0, 0.2, 1), opacity 360ms ease-out, transform 400ms ease-out';
            bubbleEl.style.filter = 'blur(10px)';
            bubbleEl.style.opacity = '0';
            bubbleEl.style.transform = isOutgoing ? 'translateX(10px) scale(0.96)' : 'translateX(-10px) scale(0.96)';
            bubbleEl.style.pointerEvents = 'none';

            // Collapse the message row container height smoothly
            const initialHeight = element.offsetHeight || bubbleRect.height;
            element.style.pointerEvents = 'none';
            element.style.overflow = 'hidden';
            element.style.maxHeight = `${initialHeight}px`;
            element.style.transition = 'max-height 480ms cubic-bezier(0.4, 0, 0.2, 1) 120ms, opacity 480ms ease 120ms, margin 480ms ease 120ms, padding 480ms ease 120ms';
            requestAnimationFrame(() => {
                element.style.maxHeight = '0px';
                element.style.opacity = '0';
                element.style.marginTop = '0px';
                element.style.marginBottom = '0px';
                element.style.paddingTop = '0px';
                element.style.paddingBottom = '0px';
            });

            // Create high-DPI canvas tightly bound around the bubble and extended in wind direction
            const canvas = document.createElement('canvas');
            canvas.className = 'tg-snap-canvas';
            
            const padY = 50;
            const padOpposite = 20;
            const padWind = 220; // ample space for the dust to billow off in wind direction

            const canvasLeft = windDir === 1 ? (bubbleRect.left - padOpposite) : (bubbleRect.left - padWind);
            const canvasTop = bubbleRect.top - padY;
            const canvasW = bubbleRect.width + padOpposite + padWind;
            const canvasH = bubbleRect.height + padY * 2;

            canvas.style.position = 'fixed';
            canvas.style.left = `${canvasLeft}px`;
            canvas.style.top = `${canvasTop}px`;
            canvas.style.width = `${canvasW}px`;
            canvas.style.height = `${canvasH}px`;
            canvas.style.pointerEvents = 'none';
            canvas.style.zIndex = '99999';

            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = Math.round(canvasW * dpr);
            canvas.height = Math.round(canvasH * dpr);

            const ctx = canvas.getContext('2d');
            if (!ctx) return false;
            ctx.scale(dpr, dpr);
            document.body.appendChild(canvas);

            // Compute bubble color & theme palette
            let computedBg = '';
            try {
                computedBg = window.getComputedStyle(bubbleEl).backgroundColor || '';
            } catch (e) {}

            const outgoingPalette = ['#3390ec', '#50a7ea', '#2b5278', '#64b5f6', '#90caf9', '#b3e5fc', '#e1f5fe', '#ffffff', '#70c5ff'];
            const incomingPalette = ['#182533', '#243447', '#2e3d4d', '#3f5367', '#707579', '#8ca0b3', '#a1b2c4', '#cbd5e1', '#ffffff', '#90caf9'];
            const palette = isOutgoing ? outgoingPalette : incomingPalette;
            if (computedBg && computedBg !== 'rgba(0, 0, 0, 0)' && computedBg !== 'transparent') {
                palette.unshift(computedBg);
            }

            // Generate fine micro-particles strictly confined to the bubble rect
            const originX = windDir === 1 ? padOpposite : padWind;
            const originY = padY;
            const particleCount = Math.min(1800, Math.max(900, Math.floor((bubbleRect.width * bubbleRect.height) / 7)));
            const particles = [];

            for (let i = 0; i < particleCount; i++) {
                const px = originX + Math.random() * bubbleRect.width;
                const py = originY + Math.random() * bubbleRect.height;

                // Micro powder: size 0.6px to 2.2px (fine grains)
                const isSparkle = Math.random() < 0.12;
                const size = isSparkle ? (1.6 + Math.random() * 1.0) : (0.7 + Math.random() * 1.2);

                // Wind and lift physics
                const windSpeed = (1.5 + Math.random() * 3.6) * windDir;
                const lift = -(0.4 + Math.random() * 2.2);

                particles.push({
                    x: px,
                    y: py,
                    vx: windSpeed + (Math.random() - 0.5) * 0.8,
                    vy: lift,
                    windAcc: windDir * (0.04 + Math.random() * 0.08),
                    size: size,
                    color: isSparkle ? '#ffffff' : palette[Math.floor(Math.random() * palette.length)],
                    alpha: 0.9 + Math.random() * 0.1,
                    decay: 0.008 + Math.random() * 0.016,
                    turbulencePhase: Math.random() * Math.PI * 2,
                    turbulenceSpeed: 0.06 + Math.random() * 0.10,
                    turbulenceAmp: 0.15 + Math.random() * 0.35,
                    isSparkle: isSparkle
                });
            }

            const startTime = performance.now();
            const MAX_DURATION = 1600;

            function renderFrame(now) {
                const elapsed = now - startTime;
                if (elapsed > MAX_DURATION || particles.length === 0) {
                    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
                    return;
                }

                ctx.clearRect(0, 0, canvasW, canvasH);

                let aliveCount = 0;
                for (let i = 0; i < particles.length; i++) {
                    const p = particles[i];
                    if (p.alpha <= 0.01) continue;

                    aliveCount++;
                    // Wind acceleration & gentle air draft
                    p.vx += p.windAcc;
                    p.vy -= 0.02; // slight rising thermal
                    p.turbulencePhase += p.turbulenceSpeed;
                    p.y += Math.sin(p.turbulencePhase) * p.turbulenceAmp;

                    // Air friction
                    p.vx *= 0.972;
                    p.vy *= 0.972;

                    p.x += p.vx;
                    p.y += p.vy;

                    p.alpha -= p.decay;

                    if (p.alpha > 0) {
                        ctx.fillStyle = p.color;
                        ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha));
                        ctx.beginPath();
                        ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }

                if (aliveCount === 0) {
                    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
                    return;
                }

                requestAnimationFrame(renderFrame);
            }

            requestAnimationFrame(renderFrame);
            return true;
        }

        initTopAudioPlayer() {
            const chatMain = document.querySelector('.chat-main');
            if (!chatMain) return;

            document.addEventListener('play', (e) => {
                if (!e.target || e.target.tagName !== 'AUDIO') return;
                const audio = e.target;
                const msgEl = audio.closest('.message');
                const title = msgEl?.querySelector('.audio-title, .voice-title')?.textContent || 'Audio track';
                const sub = msgEl?.querySelector('.audio-duration, .voice-duration')?.textContent || 'Playing';

                let topPlayer = chatMain.querySelector('.tg-top-audio-player');
                if (!topPlayer) {
                    topPlayer = document.createElement('div');
                    topPlayer.className = 'tg-top-audio-player';
                    topPlayer.innerHTML = `
                        <button class="tg-top-player-play-btn" type="button">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                        </button>
                        <div class="tg-top-player-info">
                            <span class="tg-top-player-title"></span>
                            <span class="tg-top-player-sub"></span>
                        </div>
                        <button class="tg-top-player-close" type="button" title="Close">
                            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    `;
                    chatMain.appendChild(topPlayer);

                    topPlayer.querySelector('.tg-top-player-play-btn')?.addEventListener('click', () => {
                        if (this.currentPlayingAudio && !this.currentPlayingAudio.paused) {
                            this.currentPlayingAudio.pause();
                        } else if (this.currentPlayingAudio) {
                            this.currentPlayingAudio.play();
                        }
                    });

                    topPlayer.querySelector('.tg-top-player-close')?.addEventListener('click', () => {
                        if (this.currentPlayingAudio) {
                            this.currentPlayingAudio.pause();
                        }
                        topPlayer.remove();
                    });
                }

                topPlayer.querySelector('.tg-top-player-title').textContent = title;
                topPlayer.querySelector('.tg-top-player-sub').textContent = sub;
                topPlayer.style.display = 'flex';
                this.currentPlayingAudio = audio;

                const updateIcon = () => {
                    const btn = topPlayer.querySelector('.tg-top-player-play-btn');
                    if (!btn) return;
                    if (audio.paused) {
                        btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
                    } else {
                        btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
                    }
                };
                audio.addEventListener('play', updateIcon);
                audio.addEventListener('pause', updateIcon);
                audio.addEventListener('ended', () => {
                    topPlayer.remove();
                });
            }, true);
        }

        /* --------------------------------------------------------------------
           7. Mobile Back Button
           -------------------------------------------------------------------- */
        setupBackButton() {
            const tryAttach = () => {
                const topbar = document.getElementById('chat-topbar');
                if (!topbar) return false;

                let backBtn = topbar.querySelector('.tg-back-btn');
                if (!backBtn) {
                    backBtn = document.createElement('button');
                    backBtn.className = 'tg-back-btn';
                    backBtn.type = 'button';
                    backBtn.title = 'Back to chat list';
                    backBtn.innerHTML = `
                        <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="15 18 9 12 15 6"></polyline>
                        </svg>
                    `;
                    topbar.insertBefore(backBtn, topbar.firstChild);
                }

                backBtn.style.display = '';
                this.backButton = backBtn;

                backBtn.onclick = () => {
                    const app = getChatApp();
                    if (app && typeof app.closeCurrentChat === 'function') {
                        app.closeCurrentChat();
                    }
                    const chatMain = document.querySelector('.chat-main');
                    const sidebar = document.querySelector('.chat-sidebar');
                    if (chatMain) {
                        chatMain.classList.remove('active');
                        chatMain.classList.remove('has-active-chat');
                    }
                    if (sidebar) sidebar.classList.add('active');
                    this.syncActiveChatState();
                };
                return true;
            };

            if (!tryAttach()) {
                const observer = new MutationObserver(() => {
                    if (tryAttach()) {
                        observer.disconnect();
                    }
                });
                const chatMain = document.querySelector('.chat-main');
                if (chatMain) {
                    observer.observe(chatMain, { childList: true, subtree: true });
                }
            }
        }

        /* --------------------------------------------------------------------
           8. Chat Info Sidebar (Right Panel)
           -------------------------------------------------------------------- */
        setupInfoSidebar() {
            const chatMain = document.querySelector('.chat-main');
            if (!chatMain) return;

            let infoSidebar = document.querySelector('.tg-info-sidebar');
            if (!infoSidebar) {
                infoSidebar = document.createElement('div');
                infoSidebar.className = 'tg-info-sidebar';
                infoSidebar.innerHTML = `
                    <div class="tg-info-header">
                        <button class="btn btn-icon tg-info-close" type="button" title="Close" style="width: 36px; height: 36px; border-radius: 50%;">
                            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                        <span class="tg-info-header-title">User Info</span>
                        <div style="width: 36px;"></div>
                    </div>
                    <div class="tg-info-body">
                        <div class="tg-info-hero">
                            <div class="tg-info-avatar-wrap">
                                <img id="tg-info-avatar" src="uploads/images/default.png" alt="Avatar">
                            </div>
                            <div class="tg-info-title-wrap">
                                <div class="tg-info-title" id="tg-info-name">Chat</div>
                                <button class="tg-info-edit-btn" id="tg-info-edit-nick-inline" type="button" title="Edit nickname">
                                    <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                                </button>
                            </div>
                            <div class="tg-info-subtitle" id="tg-info-status">online</div>
                            <div class="tg-info-actions">
                                <button class="tg-info-action-btn" id="tg-info-action-msg" type="button" title="Send Message">
                                    <div class="tg-info-action-icon">
                                        <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                                    </div>
                                    <span>Message</span>
                                </button>
                                <button class="tg-info-action-btn" id="tg-info-action-edit" type="button" title="Edit Custom Nickname">
                                    <div class="tg-info-action-icon">
                                        <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                                    </div>
                                    <span>Edit Name</span>
                                </button>
                            </div>
                        </div>
                        <div class="tg-info-details-card">
                            <div class="tg-info-item" id="tg-info-username-row" title="Click to copy username">
                                <div class="tg-info-item-icon">
                                    <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2"><circle cx="12" cy="12" r="4"></circle><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"></path></svg>
                                </div>
                                <div class="tg-info-item-content">
                                    <div class="tg-info-val" id="tg-info-username">@user</div>
                                    <div class="tg-info-label">Username</div>
                                </div>
                                <div class="tg-info-item-action">Copy</div>
                            </div>
                            <div class="tg-info-item" id="tg-info-realname-row">
                                <div class="tg-info-item-icon">
                                    <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                                </div>
                                <div class="tg-info-item-content">
                                    <div class="tg-info-val" id="tg-info-realname">Account Name</div>
                                    <div class="tg-info-label">Account Name</div>
                                </div>
                            </div>
                            <div class="tg-info-item" id="tg-info-bio-row">
                                <div class="tg-info-item-icon">
                                    <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                                </div>
                                <div class="tg-info-item-content">
                                    <div class="tg-info-val" id="tg-info-bio">No bio available.</div>
                                    <div class="tg-info-label">Bio</div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                chatMain.appendChild(infoSidebar);
            }

            this.infoSidebar = infoSidebar;

            infoSidebar.querySelector('.tg-info-close')?.addEventListener('click', () => {
                infoSidebar.classList.remove('open');
            });

            infoSidebar.querySelector('#tg-info-username-row')?.addEventListener('click', () => {
                const u = document.getElementById('tg-info-username')?.textContent;
                if (u && u !== 'None') {
                    navigator.clipboard?.writeText(u);
                    const app = getChatApp();
                    if (app && typeof app.showToast === 'function') {
                        app.showToast('Username copied to clipboard');
                    }
                }
            });

            const promptEditNickname = () => {
                const app = getChatApp();
                if (!app || !app.currentChat) return;
                const conv = (typeof app.getCurrentConversation === 'function' ? app.getCurrentConversation() : null) || app.currentChat.meta;
                const targetUserId = app.currentChat.type === 'direct' ? app.currentChat.id : (conv ? conv.user_id : null);
                if (!targetUserId) {
                    if (app.showToast) app.showToast('Cannot set nickname for this chat');
                    return;
                }
                const currentNick = conv ? (conv.contact_nickname || conv.full_name || '') : '';

                this.showDialog({
                    title: 'Edit Contact Name',
                    subtitle: 'Enter a custom name for this contact (only visible to you).',
                    fields: [
                        { id: 'nickname', label: 'Contact Name', placeholder: 'Enter name or nickname', value: currentNick, required: true }
                    ],
                    confirmText: 'Save',
                    cancelText: 'Cancel',
                    onSubmit: async (values, setStatus) => {
                        const newNick = (values.nickname || '').trim();
                        try {
                            const res = await window.ApiClient.fetch('save_contact', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ contact_id: targetUserId, nickname: newNick })
                            });
                            const data = await res.json();
                            if (data && data.success) {
                                const nameEl = document.getElementById('tg-info-name');
                                if (nameEl) nameEl.textContent = newNick || conv.username || 'Contact';
                                const titleEl = document.getElementById('chat-topbar-title');
                                if (titleEl) titleEl.textContent = newNick || conv.username || 'Contact';
                                if (conv) {
                                    conv.contact_nickname = newNick;
                                    conv.full_name = newNick;
                                }
                                const convItem = document.querySelector(`.contact-item[data-chat-id="${targetUserId}"], .chat-item[data-chat-id="${targetUserId}"]`);
                                if (convItem) {
                                    const nameSpan = convItem.querySelector('.contact-name, .chat-title');
                                    if (nameSpan) nameSpan.textContent = newNick || conv.username || 'Contact';
                                }
                                if (app.showToast) app.showToast('Nickname updated');
                                return true;
                            } else {
                                setStatus((data && data.message) ? data.message : 'Failed to update nickname');
                                return false;
                            }
                        } catch (err) {
                            setStatus('Network error saving nickname');
                            return false;
                        }
                    }
                });
            };

            infoSidebar.querySelector('#tg-info-edit-nick-inline')?.addEventListener('click', promptEditNickname);
            infoSidebar.querySelector('#tg-info-action-edit')?.addEventListener('click', promptEditNickname);

            infoSidebar.querySelector('#tg-info-action-msg')?.addEventListener('click', () => {
                infoSidebar.classList.remove('open');
                document.getElementById('message-input')?.focus();
            });

            document.addEventListener('click', (e) => {
                if (!this.active) return;
                const infoTrigger = e.target.closest('#chat-topbar-info-btn, .chat-topbar-info, #chat-topbar-avatar, #chat-topbar-title, #chat-topbar-subtitle, .chat-topbar-title, .chat-topbar-avatar, .chat-topbar-info-btn');
                if (infoTrigger && document.getElementById('chat-topbar')?.contains(infoTrigger)) {
                    e.preventDefault();
                    this.toggleInfoSidebar();
                }
            });
        }

        openInfoSidebar() {
            if (!this.infoSidebar) {
                this.setupInfoSidebar();
            }
            if (this.infoSidebar) {
                this.updateInfoPanel();
                this.infoSidebar.classList.add('open');
            }
        }

        closeInfoSidebar() {
            if (this.infoSidebar) {
                this.infoSidebar.classList.remove('open');
            }
        }

        toggleInfoSidebar() {
            if (!this.infoSidebar) {
                this.setupInfoSidebar();
            }
            if (this.infoSidebar) {
                this.updateInfoPanel();
                this.infoSidebar.classList.toggle('open');
            }
        }

        updateInfoPanel() {
            if (!this.infoSidebar) return;

            const app = getChatApp();
            const title = document.getElementById('chat-topbar-title')?.textContent || 'Chat';
            const subtitle = document.getElementById('chat-topbar-subtitle')?.textContent || '';
            const topbarAvatar = document.querySelector('#chat-topbar-avatar img')?.src || 'uploads/images/default.png';

            const nameEl = document.getElementById('tg-info-name');
            const statusEl = document.getElementById('tg-info-status');
            const avatarEl = document.getElementById('tg-info-avatar');
            const usernameEl = document.getElementById('tg-info-username');
            const realnameEl = document.getElementById('tg-info-realname');
            const bioEl = document.getElementById('tg-info-bio');

            if (nameEl) nameEl.textContent = title;
            if (statusEl) statusEl.textContent = subtitle;
            if (avatarEl) avatarEl.src = topbarAvatar;

            if (app && app.currentChat) {
                const conv = (typeof app.getCurrentConversation === 'function' ? app.getCurrentConversation() : null) || app.currentChat.meta;
                if (conv) {
                    const handle = conv.username || conv.group_username || conv.channel_username || '';
                    if (usernameEl) {
                        usernameEl.textContent = handle ? (handle.startsWith('@') ? handle : '@' + handle) : 'None';
                    }
                    if (realnameEl) {
                        realnameEl.textContent = conv.username ? `@${conv.username}` : (conv.full_name || title);
                    }
                    const desc = conv.bio || conv.group_description || conv.channel_description || '';
                    if (bioEl) {
                        bioEl.textContent = desc || 'No bio available.';
                    }
                }
            }
        }
    }

    if (typeof window !== 'undefined') {
        window.telegramZShell = new TelegramZShell();
        window.TelegramZ = window.telegramZShell;
        window.telegramZThemeInstance = window.telegramZShell;

        document.addEventListener('click', (e) => {
            const closeBtn = e.target.closest('#chat-topbar-close, .chat-topbar-close');
            if (closeBtn) {
                e.preventDefault();
                e.stopPropagation();
                const app = getChatApp();
                if (app) {
                    app._openChatToken = (app._openChatToken || 0) + 1;
                    app.currentChat = null;
                    app._openingChatKey = null;
                }
                if (typeof window.closeActiveChat === 'function') {
                    window.closeActiveChat();
                } else if (app && typeof app.closeCurrentChat === 'function') {
                    app.closeCurrentChat();
                }
                const chatMain = document.querySelector('.chat-main');
                if (chatMain) {
                    chatMain.classList.remove('has-active-chat', 'active');
                }
                const topbar = document.getElementById('chat-topbar');
                if (topbar) {
                    topbar.classList.add('empty');
                    topbar.style.setProperty('display', 'none', 'important');
                }
                const chatInput = document.getElementById('chat-input-container');
                if (chatInput) {
                    chatInput.style.setProperty('display', 'none', 'important');
                }
                const welcome = document.getElementById('welcome-message');
                if (welcome) {
                    welcome.style.removeProperty('display');
                }
                if (window.telegramZShell) {
                    window.telegramZShell.syncActiveChatItem();
                    window.telegramZShell.syncActiveChatState();
                }
            }
        }, true);
    }
})();
