(function () {
  const THEMES = [
    'telegram-z',
    'dark',
    'midnight',
    'graphite',
    'forest-night',
    'cinder',
    'light-clean',
    'ivory',
    'ocean-blue',
    'emerald-green',
    'warm-sunset'
  ];
  const ALIASES = { light: 'light-clean', soft: 'warm-sunset', telegram: 'telegram-z', 'telegram-web-z': 'telegram-z', webz: 'telegram-z' };
  const storageKey = 'lc_theme';
  const root = document.documentElement;
  let transitionTimer = null;

  const normalizeTheme = (value) => {
    const alias = ALIASES[value];
    if (alias) {
      return alias;
    }
    return THEMES.includes(value) ? value : 'dark';
  };

  const getTheme = () => {
    const stored = (() => {
      try {
        return localStorage.getItem(storageKey);
      } catch (err) {
        return null;
      }
    })();
    const current = stored || root.dataset.theme || 'dark';
    return normalizeTheme(current);
  };

  const applyTheme = (theme) => {
    const next = normalizeTheme(theme);
    root.classList.add('theme-transition');
    if (transitionTimer) {
      clearTimeout(transitionTimer);
    }
    root.dataset.theme = next;
    const isTelegramZ = (next === 'telegram-z');
    root.classList.toggle('theme-telegram-z', isTelegramZ);
    if (document.body) {
      document.body.classList.toggle('theme-telegram-z', isTelegramZ);
    }
    try {
      localStorage.setItem(storageKey, next);
    } catch (err) {
      // ignore storage failures
    }
    window.dispatchEvent(new CustomEvent('liquid-theme-changed', { detail: { theme: next } }));
    transitionTimer = setTimeout(() => {
      root.classList.remove('theme-transition');
    }, 300);
    return next;
  };

  applyTheme(getTheme());

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      const active = getTheme();
      if (document.body) {
        document.body.classList.toggle('theme-telegram-z', active === 'telegram-z');
      }
    });
  } else if (document.body) {
    document.body.classList.toggle('theme-telegram-z', getTheme() === 'telegram-z');
  }

  const liquidThemeApi = {
    apply: applyTheme,
    set: applyTheme,
    get: getTheme,
    themes: THEMES.slice()
  };

  if (typeof window !== 'undefined') {
    window.LiquidTheme = liquidThemeApi;
  }
  if (typeof global !== 'undefined') {
    global.LiquidTheme = liquidThemeApi;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = liquidThemeApi;
  }

  /* --------------------------------------------------------------------------
     Universal In-App Toast & Confirmation System (Zero Native Browser Alerts)
     -------------------------------------------------------------------------- */
  function showInAppToast(message, type = 'info', duration = 3200) {
    if (!message) return;
    if (window.chatApp && typeof window.chatApp.showToast === 'function') {
      window.chatApp.showToast(message, type);
      return;
    }
    let container = document.getElementById('in-app-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'in-app-toast-container';
      container.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:999999;display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;';
      if (document.body) {
        document.body.appendChild(container);
      } else if (document.documentElement) {
        document.documentElement.appendChild(container);
      }
    }
    if (!container) return;
    const toast = document.createElement('div');
    toast.style.cssText = 'background:rgba(22,27,34,0.92);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);color:#ffffff;border:1px solid rgba(255,255,255,0.12);padding:10px 18px;border-radius:20px;font-size:14px;font-weight:500;box-shadow:0 8px 24px rgba(0,0,0,0.35);opacity:0;transform:translateY(12px) scale(0.96);transition:all 0.22s cubic-bezier(0.2,0,0,1);pointer-events:auto;max-width:90vw;text-align:center;word-break:break-word;';
    if (type === 'error') {
      toast.style.borderLeft = '4px solid #ff595a';
    } else if (type === 'success') {
      toast.style.borderLeft = '4px solid #4fae4e';
    } else if (type === 'warning') {
      toast.style.borderLeft = '4px solid #f59e0b';
    }
    toast.textContent = message;
    container.appendChild(toast);
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0) scale(1)';
    });
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-8px) scale(0.96)';
      setTimeout(() => toast.remove(), 250);
    }, duration);
  }

  function showInAppConfirm(message, title = 'Confirm Action', confirmText = 'Confirm', cancelText = 'Cancel') {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:9999999;display:flex;align-items:center;justify-content:center;padding:16px;opacity:0;transition:opacity 0.2s ease;';
      
      const modal = document.createElement('div');
      modal.style.cssText = 'background:var(--tg-surface-elevated, #18222d);color:var(--tg-text, #ffffff);border:1px solid rgba(255,255,255,0.12);border-radius:16px;box-shadow:0 12px 32px rgba(0,0,0,0.45);max-width:380px;width:100%;padding:22px;transform:scale(0.92);transition:transform 0.2s cubic-bezier(0.2,0,0,1);font-family:inherit;';
      
      modal.innerHTML = `
        <div style="font-size:17px;font-weight:600;margin-bottom:8px;color:var(--tg-text, #ffffff);">${title}</div>
        <div style="font-size:14px;color:var(--tg-text-secondary, rgba(255,255,255,0.7));line-height:1.5;margin-bottom:20px;">${message}</div>
        <div style="display:flex;justify-content:flex-end;gap:10px;">
          <button type="button" class="in-app-cancel-btn" style="background:transparent;border:1px solid rgba(255,255,255,0.18);color:var(--tg-text, #ffffff);padding:8px 16px;border-radius:10px;font-size:14px;font-weight:500;cursor:pointer;">${cancelText}</button>
          <button type="button" class="in-app-confirm-btn" style="background:var(--tg-primary, #3390ec);border:none;color:#ffffff;padding:8px 18px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;">${confirmText}</button>
        </div>
      `;
      overlay.appendChild(modal);
      if (document.body) {
        document.body.appendChild(overlay);
      } else if (document.documentElement) {
        document.documentElement.appendChild(overlay);
      }

      requestAnimationFrame(() => {
        overlay.style.opacity = '1';
        modal.style.transform = 'scale(1)';
      });

      const cleanup = (result) => {
        overlay.style.opacity = '0';
        modal.style.transform = 'scale(0.92)';
        setTimeout(() => overlay.remove(), 200);
        resolve(result);
      };

      modal.querySelector('.in-app-cancel-btn').onclick = () => cleanup(false);
      modal.querySelector('.in-app-confirm-btn').onclick = () => cleanup(true);
      overlay.onclick = (e) => {
        if (e.target === overlay) cleanup(false);
      };
      const onKeyDown = (e) => {
        if (e.key === 'Escape') {
          window.removeEventListener('keydown', onKeyDown);
          cleanup(false);
        }
      };
      window.addEventListener('keydown', onKeyDown);
    });
  }

  if (typeof window !== 'undefined') {
    window.showInAppToast = showInAppToast;
    window.showInAppConfirm = showInAppConfirm;

    // Zero native browser alerts or confirms
    window.alert = function (msg) {
      showInAppToast(String(msg), 'info');
    };
    window.confirm = function (msg) {
      showInAppToast(String(msg), 'info');
      return true;
    };
  }

  const bindAppContextMenu = () => {
    const body = document.body;
    if (!body || !body.dataset || body.dataset.appShell !== '1') {
      return;
    }
    if (body.dataset.contextMenuBound === '1') {
      return;
    }
    body.dataset.contextMenuBound = '1';
    body.addEventListener('contextmenu', (event) => {
      const isTouch = event.pointerType === 'touch'
        || (event.sourceCapabilities && event.sourceCapabilities.firesTouchEvents);
      if (isTouch) {
        return;
      }
      event.preventDefault();
    }, { capture: true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindAppContextMenu, { once: true });
  } else {
    bindAppContextMenu();
  }

  // Modular load of Telegram Web Z shell adapter
  if (typeof document !== 'undefined' && !document.querySelector('script[src*="telegram-z.js"]')) {
    const tzScript = document.createElement('script');
    tzScript.src = 'js/telegram-z.js';
    tzScript.defer = true;
    const targetParent = document.head || document.body || (document.documentElement ? document.documentElement : null);
    if (targetParent && typeof targetParent.appendChild === 'function') {
      targetParent.appendChild(tzScript);
    }
  }
})();
