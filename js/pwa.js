/**
 * Liquid Chat - Progressive Web App (PWA) Manager
 * Enhanced installation prompt, iOS guides, and Service Worker registration.
 */

(function () {
  if (typeof window === 'undefined') {
    return;
  }

  const STORAGE_DISMISS_KEY = 'lc_pwa_prompt_dismissed';
  const DISMISS_DAYS = 5;

  const isLocalhost = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])$/.test(window.location.hostname);
  const isSecure = window.location.protocol === 'https:' || isLocalhost;
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true ||
    document.referrer.includes('android-app://');

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  let deferredPrompt = null;
  let bannerElement = null;
  let iosModalElement = null;

  function isDismissedRecently() {
    try {
      const ts = localStorage.getItem(STORAGE_DISMISS_KEY);
      if (!ts) return false;
      const diff = Date.now() - parseInt(ts, 10);
      return diff < DISMISS_DAYS * 24 * 60 * 60 * 1000;
    } catch (e) {
      return false;
    }
  }

  function markDismissed() {
    try {
      localStorage.setItem(STORAGE_DISMISS_KEY, Date.now().toString());
    } catch (e) {}
  }

  function injectStyles() {
    if (document.getElementById('lc-pwa-styles')) return;
    const style = document.createElement('style');
    style.id = 'lc-pwa-styles';
    style.textContent = `
      .lc-pwa-banner {
        position: fixed;
        bottom: max(16px, env(safe-area-inset-bottom, 16px));
        left: 50%;
        transform: translate(-50%, 120%);
        width: min(calc(100vw - 32px), 440px);
        background: rgba(15, 23, 42, 0.94);
        border: 1px solid rgba(120, 190, 255, 0.22);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.05);
        border-radius: 20px;
        padding: 14px 16px;
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: 14px;
        direction: rtl;
        text-align: right;
        color: #f1f5f9;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Tahoma, sans-serif;
        transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
        opacity: 0;
      }
      .lc-pwa-banner.active {
        transform: translate(-50%, 0);
        opacity: 1;
      }
      .lc-pwa-icon {
        width: 48px;
        height: 48px;
        border-radius: 13px;
        background: linear-gradient(135deg, #101c33, #0b1224);
        border: 1px solid rgba(120, 190, 255, 0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        box-shadow: 0 8px 18px rgba(0, 0, 0, 0.3);
      }
      .lc-pwa-icon img {
        width: 32px;
        height: 32px;
      }
      .lc-pwa-text {
        flex: 1;
        min-width: 0;
      }
      .lc-pwa-title {
        font-weight: 700;
        font-size: 0.95rem;
        margin: 0 0 2px;
        color: #f8fafc;
      }
      .lc-pwa-desc {
        font-size: 0.78rem;
        color: #94a3b8;
        line-height: 1.35;
        margin: 0;
      }
      .lc-pwa-actions {
        display: flex;
        flex-direction: column;
        gap: 6px;
        flex-shrink: 0;
      }
      .lc-pwa-btn-install {
        appearance: none;
        border: none;
        background: linear-gradient(135deg, #39d6a4, #4cc9f0);
        color: #061524;
        font-weight: 700;
        font-size: 0.84rem;
        padding: 8px 16px;
        border-radius: 999px;
        cursor: pointer;
        transition: transform 0.15s ease, box-shadow 0.15s ease;
        touch-action: manipulation;
        box-shadow: 0 4px 14px rgba(57, 214, 164, 0.3);
      }
      .lc-pwa-btn-install:active {
        transform: scale(0.96);
      }
      .lc-pwa-btn-dismiss {
        appearance: none;
        border: none;
        background: transparent;
        color: #94a3b8;
        font-size: 0.75rem;
        padding: 4px;
        cursor: pointer;
        text-align: center;
        touch-action: manipulation;
      }
      .lc-pwa-btn-dismiss:hover {
        color: #cbd5e1;
      }

      /* iOS Guide Modal */
      .lc-pwa-modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.65);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        z-index: 10001;
        display: flex;
        align-items: flex-end;
        justify-content: center;
        padding: 16px;
        direction: rtl;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Tahoma, sans-serif;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.3s ease, visibility 0.3s ease;
      }
      .lc-pwa-modal-backdrop.active {
        opacity: 1;
        visibility: visible;
      }
      .lc-pwa-modal {
        background: rgba(15, 23, 42, 0.96);
        border: 1px solid rgba(120, 190, 255, 0.22);
        border-radius: 24px;
        width: min(100%, 420px);
        padding: 24px;
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.7);
        color: #f8fafc;
        transform: translateY(20px);
        transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .lc-pwa-modal-backdrop.active .lc-pwa-modal {
        transform: translateY(0);
      }
      .lc-pwa-step {
        display: flex;
        align-items: center;
        gap: 12px;
        margin: 14px 0;
        padding: 12px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 14px;
        border: 1px solid rgba(255, 255, 255, 0.08);
      }
      .lc-pwa-step-num {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: #39d6a4;
        color: #061524;
        font-weight: 700;
        font-size: 0.9rem;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .lc-pwa-step-text {
        font-size: 0.88rem;
        line-height: 1.4;
        color: #e2e8f0;
      }
    `;
    document.head.appendChild(style);
  }

  function createInstallBanner() {
    if (bannerElement) return bannerElement;
    injectStyles();

    bannerElement = document.createElement('div');
    bannerElement.className = 'lc-pwa-banner';
    bannerElement.setAttribute('role', 'dialog');
    bannerElement.setAttribute('aria-label', 'Install Liquid Chat');

    bannerElement.innerHTML = `
      <div class="lc-pwa-icon">
        <img src="assets/logo.svg" alt="Liquid Chat">
      </div>
      <div class="lc-pwa-text">
        <div class="lc-pwa-title">نصب وب‌اپلیکیشن لیکوئید</div>
        <div class="lc-pwa-desc">دسترسی سریع‌تر، پیام‌های آفلاین و اعلان‌های آنی بدون نیاز به مرورگر</div>
      </div>
      <div class="lc-pwa-actions">
        <button type="button" class="lc-pwa-btn-install" id="lc-pwa-install-btn">نصب / Install</button>
        <button type="button" class="lc-pwa-btn-dismiss" id="lc-pwa-dismiss-btn">بعداً</button>
      </div>
    `;

    document.body.appendChild(bannerElement);

    const installBtn = bannerElement.querySelector('#lc-pwa-install-btn');
    const dismissBtn = bannerElement.querySelector('#lc-pwa-dismiss-btn');

    installBtn.addEventListener('click', async function () {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice.catch(() => null);
        if (choice && choice.outcome === 'accepted') {
          hideBanner();
        }
        deferredPrompt = null;
      } else if (isIOS) {
        hideBanner();
        showIosGuide();
      }
    });

    dismissBtn.addEventListener('click', function () {
      markDismissed();
      hideBanner();
    });

    return bannerElement;
  }

  function showBanner() {
    if (isStandalone) return;
    const banner = createInstallBanner();
    setTimeout(() => {
      banner.classList.add('active');
    }, 800);
  }

  function hideBanner() {
    if (!bannerElement) return;
    bannerElement.classList.remove('active');
  }

  function showIosGuide() {
    injectStyles();
    if (!iosModalElement) {
      iosModalElement = document.createElement('div');
      iosModalElement.className = 'lc-pwa-modal-backdrop';
      iosModalElement.innerHTML = `
        <div class="lc-pwa-modal">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
            <div style="font-weight: 700; font-size: 1.1rem; color: #f8fafc;">راهنمای نصب در iOS / iPhone</div>
            <button type="button" style="background: none; border: none; color: #94a3b8; font-size: 1.4rem; cursor: pointer;" id="lc-pwa-modal-close">&times;</button>
          </div>
          <p style="font-size: 0.88rem; color: #94a3b8; margin-bottom: 16px; line-height: 1.5;">
            برای نصب این برنامه بر روی آیفون یا آیپد خود در سافاری، مراحل زیر را انجام دهید:
          </p>
          <div class="lc-pwa-step">
            <div class="lc-pwa-step-num">۱</div>
            <div class="lc-pwa-step-text">در پایین مرورگر Safari روی دکمه <strong>Share (اشتراک‌گذاری)</strong> بزنید.</div>
          </div>
          <div class="lc-pwa-step">
            <div class="lc-pwa-step-num">۲</div>
            <div class="lc-pwa-step-text">منو را به پایین اسکرول کرده و گزینه <strong>Add to Home Screen (افزودن به صفحه اصلی)</strong> را انتخاب کنید.</div>
          </div>
          <button type="button" class="lc-pwa-btn-install" style="width: 100%; padding: 12px; margin-top: 14px;" id="lc-pwa-modal-ok">متوجه شدم</button>
        </div>
      `;
      document.body.appendChild(iosModalElement);

      const close = () => iosModalElement.classList.remove('active');
      iosModalElement.querySelector('#lc-pwa-modal-close').addEventListener('click', close);
      iosModalElement.querySelector('#lc-pwa-modal-ok').addEventListener('click', close);
      iosModalElement.addEventListener('click', (e) => {
        if (e.target === iosModalElement) close();
      });
    }

    requestAnimationFrame(() => {
      iosModalElement.classList.add('active');
    });
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || !isSecure) {
      return;
    }

    window.addEventListener('load', function () {
      navigator.serviceWorker
        .register('service-worker.js', { scope: './' })
        .then(function (reg) {
          reg.addEventListener('updatefound', function () {
            const installing = reg.installing;
            if (installing) {
              installing.addEventListener('statechange', function () {
                if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                  console.log('Liquid Chat: New version available.');
                }
              });
            }
          });
        })
        .catch(function (err) {
          console.warn('Liquid Chat: SW registration failed', err);
        });
    });
  }

  // Handle Chrome / Edge / Android install prompt
  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    deferredPrompt = event;
    if (!isDismissedRecently() && !isStandalone) {
      showBanner();
    }
  });

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    hideBanner();
    console.log('Liquid Chat: App installed successfully.');
  });

  // Expose global controller
  window.liquidPwa = {
    isStandalone: isStandalone,
    isInstallable: function () {
      return !isStandalone && (!!deferredPrompt || isIOS);
    },
    promptInstall: function () {
      if (isStandalone) {
        alert('برنامه در حال حاضر نصب شده و در حال اجرا است / App already installed');
        return;
      }
      if (deferredPrompt) {
        deferredPrompt.prompt();
      } else if (isIOS) {
        showIosGuide();
      } else {
        showBanner();
      }
    }
  };

  // Wire any elements with class .pwa-install-trigger
  document.addEventListener('DOMContentLoaded', function () {
    const triggers = document.querySelectorAll('.pwa-install-trigger');
    triggers.forEach((btn) => {
      if (isStandalone) {
        btn.style.display = 'none';
      } else {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          window.liquidPwa.promptInstall();
        });
      }
    });

    // If on iOS and not dismissed and not standalone, show banner on first visits
    if (isIOS && !isStandalone && !isDismissedRecently()) {
      showBanner();
    }
  });

  registerServiceWorker();
})();
