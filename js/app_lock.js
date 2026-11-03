(function () {
    const AppLock = {
        userId: null,
        settings: {
            enabled: false,
            pin_hash: '',
            auto_lock_min: 0,
            lock_on_blur: false
        },
        locked: false,
        lastActivity: Date.now(),
        idleTimer: null,
        overlay: null,
        elements: {},

        init() {
            const meta = document.querySelector('meta[name="user-id"]');
            this.userId = meta ? parseInt(meta.content, 10) : null;
            this.loadSettings();
            this.buildOverlay();
            this.bindGlobalEvents();
            this.bindSettingsUI();
            this.applyAutoLock();
            if (this.settings.enabled && this.settings.pin_hash && this.settings.lock_on_blur) {
                this.lockNow(true);
            }
        },

        settingsKey() {
            return this.userId ? `lc_app_lock_${this.userId}` : 'lc_app_lock';
        },

        loadSettings() {
            try {
                const raw = localStorage.getItem(this.settingsKey());
                if (!raw) {
                    return;
                }
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') {
                    this.settings.enabled = !!parsed.enabled;
                    this.settings.pin_hash = parsed.pin_hash || '';
                    this.settings.auto_lock_min = parseInt(parsed.auto_lock_min || 0, 10) || 0;
                    this.settings.lock_on_blur = !!parsed.lock_on_blur;
                }
            } catch (err) {
            }
        },

        saveSettings() {
            try {
                localStorage.setItem(this.settingsKey(), JSON.stringify({
                    enabled: this.settings.enabled ? 1 : 0,
                    pin_hash: this.settings.pin_hash || '',
                    auto_lock_min: parseInt(this.settings.auto_lock_min || 0, 10) || 0,
                    lock_on_blur: this.settings.lock_on_blur ? 1 : 0,
                    updated_at: Date.now()
                }));
            } catch (err) {
            }
            try {
                window.dispatchEvent(new CustomEvent('applock:changed', { detail: { settings: this.settings } }));
            } catch (e) {}
        },

        bindGlobalEvents() {
            const updateActivity = () => {
                if (!this.locked) {
                    this.lastActivity = Date.now();
                }
            };
            ['mousemove', 'keydown', 'touchstart', 'scroll'].forEach((evt) => {
                document.addEventListener(evt, updateActivity, { passive: true });
            });
            window.addEventListener('focus', updateActivity);
            window.addEventListener('blur', () => {
                if (this.settings.enabled && this.settings.lock_on_blur) {
                    this.lockNow(true);
                }
            });
        },

        bindSettingsUI() {
            const enabledToggle = document.getElementById('app-lock-enabled');
            const timeoutSelect = document.getElementById('app-lock-timeout');
            const blurToggle = document.getElementById('app-lock-on-blur');
            const setPinBtn = document.getElementById('app-lock-set-pin');
            const form = document.getElementById('app-lock-form');
            const currentInput = document.getElementById('app-lock-current-pin');
            const newInput = document.getElementById('app-lock-new-pin');
            const confirmInput = document.getElementById('app-lock-confirm-pin');
            const savePinBtn = document.getElementById('app-lock-save-pin');
            const status = document.getElementById('app-lock-status');
            const lockNowBtn = document.getElementById('app-lock-now');
            this.elements.appLockStatus = status;

            if (enabledToggle) {
                enabledToggle.checked = !!this.settings.enabled;
                enabledToggle.addEventListener('change', () => {
                    this.settings.enabled = !!enabledToggle.checked;
                    if (!this.settings.enabled) {
                        this.locked = false;
                        this.hideOverlay();
                    }
                    this.saveSettings();
                    this.applyAutoLock();
                    this.showStatus(this.settings.enabled ? 'App Lock enabled.' : 'App Lock disabled.', 'info');
                });
            }
            if (timeoutSelect) {
                timeoutSelect.value = String(this.settings.auto_lock_min || 0);
                timeoutSelect.addEventListener('change', () => {
                    this.settings.auto_lock_min = parseInt(timeoutSelect.value || '0', 10) || 0;
                    this.saveSettings();
                    this.applyAutoLock();
                });
            }
            if (blurToggle) {
                blurToggle.checked = !!this.settings.lock_on_blur;
                blurToggle.addEventListener('change', () => {
                    this.settings.lock_on_blur = !!blurToggle.checked;
                    this.saveSettings();
                });
            }
            if (setPinBtn && form) {
                setPinBtn.addEventListener('click', () => {
                    form.style.display = form.style.display === 'grid' ? 'none' : 'grid';
                });
            }
            if (savePinBtn) {
                savePinBtn.addEventListener('click', async () => {
                    const currentPin = currentInput ? currentInput.value.trim() : '';
                    const newPin = newInput ? newInput.value.trim() : '';
                    const confirmPin = confirmInput ? confirmInput.value.trim() : '';
                    if (!this.validatePin(newPin)) {
                        this.showStatus('PIN must be 4-8 digits.', 'error');
                        return;
                    }
                    if (newPin !== confirmPin) {
                        this.showStatus('PIN confirmation does not match.', 'error');
                        return;
                    }
                    if (this.settings.pin_hash) {
                        if (!currentPin) {
                            this.showStatus('Enter your current PIN to change it.', 'error');
                            return;
                        }
                        const ok = await this.verifyPin(currentPin);
                        if (!ok) {
                            this.showStatus('Current PIN is incorrect.', 'error');
                            return;
                        }
                    }
                    const hash = await this.hashPin(newPin);
                    if (!hash) {
                        this.showStatus('App Lock is not supported on this browser.', 'error');
                        return;
                    }
                    this.settings.pin_hash = hash;
                    this.settings.enabled = true;
                    if (enabledToggle) {
                        enabledToggle.checked = true;
                    }
                    this.saveSettings();
                    if (form) {
                        form.style.display = 'none';
                    }
                    if (currentInput) {
                        currentInput.value = '';
                    }
                    if (newInput) {
                        newInput.value = '';
                    }
                    if (confirmInput) {
                        confirmInput.value = '';
                    }
                    this.applyAutoLock();
                    this.showStatus('PIN updated successfully.', 'success');
                });
            }
            if (lockNowBtn) {
                lockNowBtn.addEventListener('click', () => {
                    this.lockNow(false);
                });
            }

            const menuLockBtn = document.getElementById('lock-app-btn');
            if (menuLockBtn) {
                menuLockBtn.addEventListener('click', () => {
                    this.lockNow(false);
                });
            }
        },

        validatePin(pin) {
            return /^\d{4,8}$/.test(pin);
        },

        async hashPin(pin) {
            if (!window.crypto || !crypto.subtle) {
                return null;
            }
            const encoder = new TextEncoder();
            const data = encoder.encode(pin);
            const digest = await crypto.subtle.digest('SHA-256', data);
            const bytes = new Uint8Array(digest);
            let binary = '';
            bytes.forEach((b) => {
                binary += String.fromCharCode(b);
            });
            return btoa(binary);
        },

        async verifyPin(pin) {
            const hash = await this.hashPin(pin);
            return !!hash && hash === this.settings.pin_hash;
        },

        buildOverlay() {
            let overlay = document.getElementById('app-lock-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'app-lock-overlay';
                overlay.className = 'app-lock-overlay';
                overlay.style.display = 'none';
                overlay.innerHTML = `
                    <div class="glass-card app-lock-card">
                        <div class="app-lock-icon-badge">
                            <svg viewBox="0 0 24 24" width="36" height="36" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                            </svg>
                        </div>
                        <div class="app-lock-title">Liquid Chat</div>
                        <div class="app-lock-subtitle">Enter your passcode to continue</div>
                        <div class="app-lock-input-wrap">
                            <input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" class="form-control app-lock-input" id="app-lock-pin" placeholder="••••" autocomplete="off">
                        </div>
                        <div class="app-lock-actions">
                            <button class="btn btn-primary" id="app-lock-unlock">Unlock</button>
                        </div>
                        <div class="app-lock-error" id="app-lock-error"></div>
                    </div>
                `;
                document.body.appendChild(overlay);
            }
            this.overlay = overlay;
            this.elements.pinInput = document.getElementById('app-lock-pin');
            this.elements.unlockBtn = document.getElementById('app-lock-unlock');
            this.elements.lockError = document.getElementById('app-lock-error');

            const attemptUnlock = async () => {
                const pin = this.elements.pinInput ? this.elements.pinInput.value.trim() : '';
                if (!this.validatePin(pin)) {
                    this.triggerShake();
                    this.showLockError('Enter a valid PIN (4-8 digits).');
                    return;
                }
                const ok = await this.verifyPin(pin);
                if (!ok) {
                    this.triggerShake();
                    this.showLockError('Incorrect PIN.');
                    if (this.elements.pinInput) {
                        this.elements.pinInput.value = '';
                    }
                    return;
                }
                this.unlock();
            };

            if (this.elements.unlockBtn) {
                this.elements.unlockBtn.addEventListener('click', attemptUnlock);
            }
            if (this.elements.pinInput) {
                this.elements.pinInput.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        attemptUnlock();
                    }
                });
            }
        },

        triggerShake() {
            if (!this.overlay) return;
            const card = this.overlay.querySelector('.app-lock-card');
            if (card) {
                card.classList.remove('shake');
                void card.offsetWidth;
                card.classList.add('shake');
                setTimeout(() => card.classList.remove('shake'), 500);
            }
        },

        applyAutoLock() {
            if (this.idleTimer) {
                clearInterval(this.idleTimer);
                this.idleTimer = null;
            }
            if (!this.settings.enabled || !this.settings.pin_hash) {
                return;
            }
            const interval = 5000;
            this.idleTimer = setInterval(() => {
                if (this.locked) {
                    return;
                }
                const minutes = parseInt(this.settings.auto_lock_min || 0, 10) || 0;
                if (!minutes) {
                    return;
                }
                const elapsed = Date.now() - this.lastActivity;
                if (elapsed >= minutes * 60 * 1000) {
                    this.lockNow(true);
                }
            }, interval);
        },

        lockNow(silent) {
            if (!this.settings.enabled || !this.settings.pin_hash) {
                if (!silent) {
                    if (window.showInAppToast) {
                        window.showInAppToast('Set a PIN in Settings to enable App Lock.', 'warning');
                    } else if (window.chatApp && typeof window.chatApp.showToast === 'function') {
                        window.chatApp.showToast('Set a PIN in Settings to enable App Lock.', 'warning');
                    }
                }
                return;
            }
            if (this.locked) {
                return;
            }
            this.locked = true;
            this.showOverlay();
        },

        unlock() {
            const card = this.overlay ? this.overlay.querySelector('.app-lock-card') : null;
            if (card) {
                card.classList.add('unlocking');
            }
            setTimeout(() => {
                this.locked = false;
                this.lastActivity = Date.now();
                this.hideOverlay();
                if (card) card.classList.remove('unlocking');
            }, 250);
        },

        showOverlay() {
            if (!this.overlay) {
                return;
            }
            if (this.elements.pinInput) {
                this.elements.pinInput.value = '';
            }
            this.showLockError('');
            this.overlay.style.display = 'flex';
            document.body.classList.add('app-locked');
            if (this.elements.pinInput) {
                this.elements.pinInput.focus();
            }
        },

        hideOverlay() {
            if (!this.overlay) {
                return;
            }
            this.overlay.style.display = 'none';
            document.body.classList.remove('app-locked');
        },

        showLockError(message) {
            if (!this.elements.lockError) {
                return;
            }
            this.elements.lockError.textContent = message || '';
        },

        showStatus(message, variant) {
            if (!this.elements.appLockStatus) {
                return;
            }
            const el = this.elements.appLockStatus;
            el.textContent = message;
            el.classList.remove('success', 'error');
            if (variant === 'success') {
                el.classList.add('success');
            } else if (variant === 'error') {
                el.classList.add('error');
            }
        },

        async setPin(newPin) {
            if (!this.validatePin(newPin)) {
                return { success: false, message: 'PIN must be 4-8 digits.' };
            }
            const hash = await this.hashPin(newPin);
            if (!hash) {
                return { success: false, message: 'App Lock is not supported on this browser.' };
            }
            this.settings.pin_hash = hash;
            this.settings.enabled = true;
            this.saveSettings();
            this.applyAutoLock();
            return { success: true };
        },

        async changePin(currentPin, newPin) {
            if (!this.settings.pin_hash) {
                return this.setPin(newPin);
            }
            const ok = await this.verifyPin(currentPin);
            if (!ok) {
                return { success: false, message: 'Current PIN is incorrect.' };
            }
            if (!this.validatePin(newPin)) {
                return { success: false, message: 'New PIN must be 4-8 digits.' };
            }
            const hash = await this.hashPin(newPin);
            if (!hash) {
                return { success: false, message: 'App Lock is not supported on this browser.' };
            }
            this.settings.pin_hash = hash;
            this.settings.enabled = true;
            this.saveSettings();
            this.applyAutoLock();
            return { success: true };
        },

        async turnOffPin(currentPin) {
            if (this.settings.pin_hash && currentPin !== undefined && currentPin !== null) {
                const ok = await this.verifyPin(currentPin);
                if (!ok) {
                    return { success: false, message: 'Current PIN is incorrect.' };
                }
            }
            this.settings.enabled = false;
            this.settings.pin_hash = '';
            this.locked = false;
            this.hideOverlay();
            this.saveSettings();
            this.applyAutoLock();
            return { success: true };
        }
    };

    window.AppLock = AppLock;
    window.appLock = AppLock;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => AppLock.init());
    } else {
        AppLock.init();
    }
})();
