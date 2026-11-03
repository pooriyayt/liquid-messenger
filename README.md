# 💧 Liquid Chat (لیکوئید چت)

<p align="center">
  <img src="assets/logo.svg" alt="Liquid Chat Logo" width="128" height="128" />
</p>

<p align="center">
  <strong>پیام‌رسان مدرن، فوق‌سریع و امن تحت وب بر پایه معماری تلگرام وب نسخه Z، ۱۱ پوسته بصری اختصاصی، رمزنگاری کامل سمت سرور (Server-Side Encryption) و وب‌اپلیکیشن مستقل (PWA)</strong><br>
  <em>A high-performance, private, self-hosted web messenger engineered with Telegram Web Z design fidelity, 11 handcrafted theme palettes, robust server-side at-rest encryption, and full PWA offline readiness.</em>
</p>

<p align="center">
  <a href="https://php.net"><img src="https://img.shields.io/badge/PHP-8.1%20%7C%208.2%20%7C%208.3%20%7C%208.4-777bb4?style=for-the-badge&logo=php&logoColor=white" alt="PHP 8.x" /></a>
  <a href="https://mariadb.org"><img src="https://img.shields.io/badge/MySQL-8.0%2B%20%7C%20MariaDB%2010.5%2B-4479a1?style=for-the-badge&logo=mysql&logoColor=white" alt="Database" /></a>
  <a href="https://web.dev/progressive-web-apps/"><img src="https://img.shields.io/badge/PWA-Installable%20%26%20Offline-39d6a4?style=for-the-badge&logo=pwa&logoColor=black" alt="PWA Ready" /></a>
  <a href="#-امنیت-و-معماری-رمزنگاری--security--cryptography"><img src="https://img.shields.io/badge/Encryption-Server--Side%20AES--256-0088cc?style=for-the-badge&logo=security&logoColor=white" alt="Server-Side Encryption" /></a>
  <a href="#-سیستم-توکن-و-۱۱-پوسته-اختصاصی--theming-engine"><img src="https://img.shields.io/badge/Themes-11%20Dynamic%20Palettes-9333ea?style=for-the-badge" alt="11 Themes" /></a>
  <a href="#-شرایط-مجوز-و-لایسنس-اختصاصی--license"><img src="https://img.shields.io/badge/License-LCSL--1.0-orange?style=for-the-badge" alt="License LCSL 1.0" /></a>
  <a href="https://github.com/pooriyayt/liquid-messenger"><img src="https://img.shields.io/badge/GitHub-pooriyayt%2Fliquid--messenger-181717?style=for-the-badge&logo=github&logoColor=white" alt="GitHub Repo" /></a>
  <a href="https://github.com/pooriyayt/liquid-messenger/pulls"><img src="https://img.shields.io/badge/PRs-Welcome-brightgreen?style=for-the-badge" alt="PRs Welcome" /></a>
</p>

---

> [!NOTE]
> ### 🤖 شفاف‌سازی توسعه | Development Transparency
> 
> **🇮🇷 فارسی**  
> این پروژه با رویکردی آزمایشی و غیرتجاری، برای پاسخ به یک نیاز عملی و به‌منظور ارزیابی کاربرد هوش مصنوعی در توسعه‌ی نرم‌افزار ایجاد شده است. فرایند طراحی و پیاده‌سازی آن با بهره‌گیری از ابزارهای هوش مصنوعی انجام شده و به‌عنوان محصولی رسمی یا آماده‌ی بهره‌برداری تجاری ارائه نمی‌شود.
> 
> **🇬🇧 English**  
> This project was created as a non-commercial, experimental effort to address a practical need and to evaluate the role of AI in software development. Its design and implementation were carried out with the assistance of AI tools, and it is not presented as a formal or production-ready product.

---

## 📖 فهرست مطالب / Table of Contents
- [🌟 معرفی و فلسفه طراحی / Overview & Philosophy](#-معرفی-و-فلسفه-طراحی--overview--philosophy)
- [✨ قابلیت‌ها و معماری سیستم / Architectural Highlights](#-قابلیتها-و-معماری-سیستم--architectural-highlights)
- [🎨 سیستم توکن و ۱۱ پوسته اختصاصی / Theming Engine](#-سیستم-توکن-و-۱۱-پوسته-اختصاصی--theming-engine)
- [🔒 امنیت و معماری رمزنگاری / Security & Cryptography](#-امنیت-و-معماری-رمزنگاری--security--cryptography)
- [📱 تجربه کاربری موبایل و وب‌اپلیکیشن (PWA)](#-تجربه-کاربری-موبایل-و-وباپلیکیشن-pwa)
- [🚀 راه‌اندازی و روش‌های استقرار / Deployment & Installation](#-راهاندازی-و-روشهای-استقرار--deployment--installation)
  - [روش ۱: نصب خودکار با یک دستور (Linux VPS Installer)](#روش-۱-نصب-خودکار-با-یک-دستور-linux-vps-installer)
  - [روش ۲: ویزارد گرافیکی تحت وب (Web Browser Wizard)](#روش-۲-ویزارد-گرافیکی-تحت-وب-web-browser-wizard)
  - [روش ۳: استقرار کانتینری با داکر (Docker & Docker Compose)](#روش-۳-استقرار-کانتینری-با-داکر-docker--docker-compose)
- [⚙️ متغیرهای محیطی و پیکربندی / Environment Configuration](#️-متغیرهای-محیطی-و-پیکربندی--environment-configuration)
- [📡 مستندات ارتباطی و REST API](#-مستندات-ارتباطی-و-rest-api)
- [📂 ساختار فایل‌ها و معماری پروژه / Directory Structure](#-ساختار-فایلها-و-معماری-پروژه--directory-structure)
- [🤝 مشارکت و سیاست گزارش امنیتی / Contributing & Security](#-مشارکت-و-سیاست-گزارش-امنیتی--contributing--security)
- [📜 شرایط مجوز و لایسنس اختصاصی / License](#-شرایط-مجوز-و-لایسنس-اختصاصی--license)

---

## 🌟 معرفی و فلسفه طراحی / Overview & Philosophy

**لیکوئید چت (Liquid Chat)** یک پلتفرم پیام‌رسان متن‌باز، مستقل و سلف‌هاستد (Self-Hosted) است که با هدف ارائه‌ی نهایت سرعت، زیبایی بصری و حریم خصوصی بدون وابستگی به سرورهای کلود شخص ثالث توسعه داده شده است.

این پروژه معماری تحسین‌شده‌ی **Telegram Web Z** را با فریم‌ورک‌های سبک کلاینت، انیمیشن‌های سخت‌افزاری ۶۰ فریم بر ثانیه، ماژول‌های رمزنگاری انتها‌به‌انتها و قابلیت اجرای کامپکت روی هاست‌های اشتراکی، سرورهای مجازی و کانتینرهای داکر در هم آمیخته است.

### چرا Liquid Chat؟
* **استقلال کامل:** مالکیت ۱۰۰٪ دیتابیس، فایل‌ها و پیام‌ها در اختیار خود شماست.
* **سبک و بدون نیاز به بیلد استپ سنگین:** اجرا بدون وابستگی به فریم‌ورک‌های پیچیده جاوااسکریپتی؛ سورس‌کد به صورت Native Vanilla JS و کامپوننت‌های بهینه‌سازی‌شده پیاده‌سازی شده است.
* **رابط کاربری بدون تاخیر (Zero Tap Delay):** پیمایش فوق‌العاده نرم با پشتیبانی از سیستم ژست‌های حرکتی و سازگاری با نمایشگرهای لمسی موبایل و دسکتاپ.

---

## ✨ قابلیت‌ها و معماری سیستم / Architectural Highlights

### 🇮🇷 بخش فارسی

1. **انطباق ۱:۱ با استاندارد تلگرام وب نسخه Z:**
   - تفکیک پنل‌های گفت‌وگو در دسکتاپ و ناوبری کشویی نرم (Sliding Views) در نمایشگرهای موبایل.
   - وضعیت تایپ زنده (Typing Indicator)، ضبط صدا، ضبط ویدیو نوت و ارسال فایل همراه با پیش‌نمایش درصد پیشرفت آپلود.
   - تفکیک کامل تیک‌های پیام: تیک خاکستری (ارسال‌شده)، تیک اول (ثبت سرور)، دو تیک آبی (خوانده‌شده توسط مخاطب).

2. **افکت ذرات پودری تلگرام هنگام حذف پیام (Telegram Dust Vaporization):**
   - پیاده‌سازی فیزیک ذرات معلق روی بوم Canvas با شبیه‌سازی جهت باد (پیام‌های ارسالی به سمت راست و پیام‌های دریافتی به سمت چپ پودر می‌شوند) با اجرای روان ۶۰ فریم بر ثانیه بدون لگ.

3. **ارسال پیام‌های زمان‌بندی‌شده هوشمند (Scheduled Messages):**
   - زمان‌بندی پیام‌ها برای تحویل در ساعت، روز و تاریخ آینده با تقویم و ساعت استاندارد.
   - صف مستقل از موقعیت زمانی و تحویل خودکار با ذخیره‌سازی رمزنگاری‌شده در دیتابیس سمت سرور.

4. **سیستم صوتی و ویدیویی پیشرفته:**
   - ضبط پیام صوتی همراه با رقص امواج فرکانسی زنده (Dynamic Waveform Visualizer).
   - ضبط و ارسال پیام‌های ویدیویی دایره‌ای (Circular Video Notes) مطابق با سبک رسمی تلگرام.

5. **دسته‌بندی و پوشه‌های چت (Chat Folders):**
   - دسته‌بندی تب‌های گفت‌وگو در بخش‌های: همه (All)، شخصی (Personal)، گروه‌ها (Groups)، کانال‌ها (Channels) و خوانده‌نشده‌ها (Unread) به همراه شمارنده‌های زنده‌ی پیام جدید.

6. **مدیریت مخاطبین با مودال‌های مدرن درون‌برنامه‌ای:**
   - جستجو و افزودن مخاطب با شناسه کاربری (`@username`) یا شماره تلفن.
   - تغییر نام مستعار دلخواه برای مخاطب بدون استفاده از پنجره‌های سنتی و زننده‌ی مرورگر (`prompt`/`alert`).

7. **موتور بازپخش و کش مالتی‌مدیا (Media Cache Engine):**
   - کش خودکار تصاویر، ویدیوها و فایل‌های دانلودشده با IndexedDB / Browser Cache جهت لود آنی بدون دانلود مجدد.
   - دکمه‌های استاندارد تلگرامی برای دانلود، وضعیت و تلاش مجدد (Retry) در صورت ناپایداری شبکه.

---

### 🇬🇧 English Section

1. **Telegram Web Z 1:1 Parity:**
   - Desktop split-screen layout paired with seamless gesture-sliding panel transitions on mobile devices.
   - Live activity badges: Typing..., Recording voice..., Recording video..., and real-time upload progress indicators.
   - Tri-state delivery confirmation: gray tick (sent), single blue tick (delivered), double blue ticks (read).

2. **Canvas-Powered Dust Dissolve (Telegram Dust Effect):**
   - High-performance micro-particle physics simulation with directional drift velocity (outgoing dissolves rightward, incoming dissolves leftward) locking 60 FPS performance.

3. **Smart Scheduled Messages Dispatcher:**
   - Schedule messages with date/time selectors; queued securely in the background and delivered across any timezone with encrypted server-side storage.

4. **Live Audio Waveforms & Video Circles:**
   - Real-time frequency waveform audio recording and interactive voice playback.
   - Native circular video notes capturing camera stream with circular masking.

5. **Dynamic Chat Folders:**
   - Multi-tab folder classification: All, Personal, Groups, Channels, and Unread with real-time badge updates.

6. **Dedicated Native In-App Modals:**
   - Sleek in-app modal windows for adding contacts and customizing contact nicknames without intrusive browser dialogs.

7. **Resilient Offline-First Media Cache:**
   - High-speed local caching prevents redundant re-downloads of opened images and attachments.
   - Telegram-style download pills, progress spinners, and resilient retry mechanisms.

---

## 🎨 سیستم توکن و ۱۱ پوسته اختصاصی / Theming Engine

سیستم طراحی Liquid Chat بر پایه معماری توکن‌های سه‌لایه (Primitive → Semantic → Component) استوار است. تمامی ۱۱ تم زیر به صورت زنده و بدون بارگذاری مجدد صفحه از بخش تنظیمات قابل انتخاب هستند:

| شناسه تم (ID) | نام پوسته | رنگ اصلی (Primary) | پس‌زمینه (Background) | مناسب برای / توضیحات |
| :--- | :--- | :--- | :--- | :--- |
| `telegram-z` | **Telegram Web Z Dark** *(پیش‌فرض)* | `#3390ec` (آبی تلگرام) | `#17212b` / پترن ابری | شبیه‌سازی ۱:۱ رابط کاربری رسمی تلگرام با کانتینر تمام‌صفحه |
| `dark` | **Liquid Glass Dark** | `#3b82f6` (آبی نئون) | `#0b0e14` / شیشه‌ای | استایل نئومورفیک مدرن با لایه‌های مات و شفاف `backdrop-filter` |
| `midnight` | **Midnight OLED** | `#0084ff` (آبی برقی) | `#000000` (مشکی مطلق) | بهینه‌سازی‌شده برای پنل‌های OLED جهت کاهش مصرف باتری و کنتراست بی‌نهایت |
| `graphite` | **Graphite Slate** | `#4dd4b1` (نعنایی سربی) | `#14171d` (خاکستری مات) | تم خنثی، مهندسی و مدرن برای استفاده‌های طولانی‌مدت کدنویسان |
| `forest-night` | **Forest Night** | `#10b981` (زمردی نئون) | `#0d1410` (سبز سوزنی تیره) | تم تیره الهام‌گرفته از شاخ و برگ کاج جنگل‌های شبانه |
| `cinder` | **Cinder Charcoal** | `#f59e0b` (کهربایی گرم) | `#151311` (زغالی گدازه‌ای) | پالت زغالی دودی با هایلایت‌های گرم آتشفشانی |
| `light-clean` | **Light Clean** | `#2563eb` (آبی کریستالی) | `#f8fafc` (سفید روشن) | تم روز ساده، خنک و مینیمال برای محیط‌های پرنور |
| `ivory` | **Ivory Paper** | `#78350f` (شکلاتی مات) | `#fbf8f2` (عاجی و نسکافه‌ای) | آرامش‌بخش برای مطالعه با گرما و حس کتاب‌های کاغذی سنتی |
| `ocean-blue` | **Ocean Blue** | `#06b6d4` (فیروزه‌ای دریایی) | `#071a2e` (آبی اقیانوسی) | گرادیانت‌های عمیق دریایی با درخشش بازتاب آب |
| `emerald-green` | **Emerald Mint** | `#10b981` (سبز درخشان) | `#061a14` (زمرد تیره) | ترکیب باطراوت نعنا و شکوه رنگ‌های گیاهی |
| `warm-sunset` | **Warm Sunset** | `#f43f5e` (مرجانی صورتی) | `#1c1017` (گرگ‌ومیش عصر) | گرادیانت شاعرانه غروب خورشید با رنگ‌های گرم و آرام |

---

## 🔒 امنیت و معماری رمزنگاری / Security & Cryptography

1. **رمزنگاری جامع داده‌ها و پیام‌ها در سمت سرور (Server-Side at-Rest Encryption):**
   - تمامی پیام‌های متنی، پیام‌های زمان‌بندی‌شده، مکالمات و متادیتای چت با استفاده از کلید قدرتمند سرور (`APP_ENC_KEY`) و الگوریتم پیشرفته `AES-256` به صورت رمزگذاری‌شده در دیتابیس MySQL ذخیره می‌شوند (هیچ پیام متنی به صورت خام در دیتابیس نگهداری نمی‌شود).
   - کلیه عملیات رمزنگاری و رمزگشایی به صورت متمرکز و ایزوله در لایه امن بک‌اند (PHP) پردازش شده و پس از اعتبارسنجی نشست‌های کاربری ارسال می‌گردد.

2. **رمزنگاری در حالت سکون فایل‌ها و رسانه‌ها (Encrypted Media Storage):**
   - تمامی تصاویر، ویس‌ها، ویدیوها و فایل‌های پیوست پیش از ذخیره‌سازی روی دیسک هاست با کلید سرور (`APP_ENC_KEY`) رمزگذاری می‌شوند.
   - دسترسی، رمزگشایی در لحظه و دانلود فایل‌ها صرفاً از طریق اسکریپت امنیتی `api/file.php` با اعتبارسنجی توکن‌های امضاشده HMAC امکان‌پذیر است.

3. **قفل امنیتی درون‌برنامه‌ای (In-App Passcode Lock):**
   - قفل صفحه با پین‌کد اختصاصی و کیپد لمسی.
   - قفل خودکار بر اساس زمان عدم فعالیت (۱ دقیقه، ۵ دقیقه، ۱۵ دقیقه یا همگام با خروج موقت از تب مرورگر با قابلیت `Lock on Blur`).

4. **مدیریت نشست‌های فعال (Active Sessions & Devices):**
   - نظارت بر دستگاه‌های متصل، نوع مرورگر، سیستم‌عامل، تاریخ و ساعت آخرین ورود و آدرس IP.
   - ابطال فوری و خروج از راه دور نشست‌های ناشناس تنها با یک کلیک.

5. **پاک‌سازی داده‌های محرمانه (EXIF / GPS Stripping):**
   - حذف کامل کلیه تگ‌های متادیتا، موقعیت جغرافیایی GPS و مشخصات فنی دوربین از تصاویر ارسالی قبل از قرارگیری روی سرور.

6. **هدرهای سخت‌گیرانه وب (Strict Security Headers):**
   - تجهیز پیش‌فرض به لایه‌های حفاظتی `Content Security Policy (CSP)`, `HSTS`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN` و محافظت کامل در برابر حملات CSRF و XSS.

---

## 📱 تجربه کاربری موبایل و وب‌اپلیکیشن (PWA)

* **نصب مستقیم بدون مارکت:** قابلیت نصب به عنوان وب‌اپلیکیشن پیش‌رونده (PWA) روی iOS (از طریق Safari > Add to Home Screen)، اندروید (Chrome > Install App)، ویندوز، مک و لینوکس.
* **پشتیبانی کامل از Safe Area و Dynamic Island:** سازگار با انحناها، ناچ و بریدگی‌های بالای نمایشگرهای مدرن آیفون و پرچمداران اندرویدی با دستورات `env(safe-area-inset-*)`.
* **سرعت بالا در شبکه ضعیف:** سرویس‌ورکر هوشمند با کش فایل‌های اسکلت کاربری (Shell UI) امکان اجرای سریع حتی در افت موقت ارتباط شبکه را فراهم می‌سازد.
* **حذف خطاهای لمسی:** برطرف‌سازی باگ زوم خودکار اینپوت‌ها در آیفون و حذف تاخیر ۳۰۰ میلی‌ثانیه‌ای دابل‌کلیک مرورگر با متاتگ‌های مدرن موبایل.

---

## 🚀 راه‌اندازی و روش‌های استقرار / Deployment & Installation

### پیش‌نیازهای حداقلی سیستم
* **PHP:** نسخه 8.1، 8.2، 8.3 یا 8.4 (همراه با اکستنشن‌های `pdo_mysql`, `mbstring`, `openssl`, `curl`, `gd`)
* **Database:** پایگاه داده MySQL 8.0+ یا MariaDB 10.5+
* **Web Server:** وب‌سرور Nginx، Apache یا LiteSpeed
* **SSL Certificate:** دامنه یا ساب‌دامنه دارای گواهی HTTPS فعال (برای فعال‌سازی قابلیت‌های PWA، میکروفون، وب‌کم و رمزنگاری مرورگر الزامی است).

---

### روش ۱: نصب خودکار با یک دستور (Linux VPS Installer)
ایده‌آل برای راه‌اندازی فوری بر روی سرورهای ابری و سرورهای مجازی خام (Ubuntu 20.04/22.04/24.04, Debian 11/12, AlmaLinux, RockyLinux):

```bash
# دریافت مستقیم سورس مخزن از گیت‌هاب:
git clone https://github.com/pooriyayt/liquid-messenger.git
cd liquid-messenger
sudo bash install.sh

# یا اجرای تک‌خطی بدون نیاز به کلون:
curl -sSL https://raw.githubusercontent.com/pooriyayt/liquid-messenger/main/install.sh | sudo bash
```

**عملیات اسکریپت خودکار:**
1. شناسایی نوع سیستم‌عامل و نصب اتوماتیک بسته‌های وب‌سرور Nginx، PHP 8.x و MariaDB.
2. دریافت نام دامنه و صدور خودکار گواهی SSL رایگان Let's Encrypt.
3. ساخت خودکار دیتابیس، ایمپورت جداول، پیکربندی کلیدهای رمزنگاری و ثبت دسترسی‌های مجاز دیسک.
4. نمایش لینک آماده ورود و اطلاعات حساب کاربری مدیر در خروجی ترمینال.

---

### روش ۲: ویزارد گرافیکی تحت وب (Web Browser Wizard)
ایده‌آل برای سرویس‌های میزبانی اشتراکی مثل **cPanel, DirectAdmin, Plesk** یا وب‌سرورهای سنتی Apache:

1. کلیه فایل‌های پروژه را دانلود کرده و در دایرکتوری ریشه هاست خود (`public_html` یا ریشه ساب‌دامین) آپلود و استخراج نمایید.
2. در کنترل‌پنل هاست خود یک پایگاه داده MySQL و یک کاربر با دسترسی کامل بسازید.
3. مرورگر را باز کرده و به آدرس دامنه خود بروید؛ ویزارد نصب به صورت خودکار اجرا می‌شود:
   ```text
   https://yourdomain.com/install.php
   ```
4. اطلاعات پایگاه داده (نام هاست، نام دیتابیس، کاربر و رمز عبور) و اطلاعات اکانت مدیر را وارد کنید.
5. سیستم جداول را مستقر ساخته، فایل پیکربندی را می‌سازد و فایل محافظ `installed.lock` را جهت جلوگیری از دسترسی مجدد ایجاد می‌کند.

---

### روش ۳: استقرار کانتینری با داکر (Docker & Docker Compose)
اگر از داکر روی سرور یا رایانه شخصی خود استفاده می‌کنید:

```bash
# ۱. کلون مخزن
git clone https://github.com/pooriyayt/liquid-messenger.git
cd liquid-messenger

# ۲. کپی فایل نمونه متغیرهای محیطی
cp .env.example .env

# ۳. راه‌اندازی کانتینرهای اپلیکیشن و پایگاه داده
docker compose up -d
```

سرویس بلافاصله روی پورت `8080` بالا خواهد آمد (می‌توانید با یک Reverse Proxy ساده مانند Nginx یا Traefik ترافیک HTTPS دامنه خود را به پورت `8080` فوروارد نمایید).

---

## ⚙️ متغیرهای محیطی و پیکربندی / Environment Configuration

فایل `.env` در ریشه پروژه پارامترهای زیر را مدیریت می‌کند:

| نام متغیر | مقدار پیش‌فرض | توضیحات |
| :--- | :--- | :--- |
| `APP_ENV` | `production` | محیط اجرای برنامه (`production` یا `development`) |
| `APP_DEBUG` | `false` | نمایش خطاهای دیباگ (در محیط عملیاتی حتماً روی `false` باشد) |
| `SITE_URL` | `https://chat.example.com` | نشانی دامنه یا ساب‌دامنه رسمی پیام‌رسان با پروتکل HTTPS |
| `DB_HOST` | `localhost` | آدرس هاست پایگاه داده MySQL / MariaDB |
| `DB_PORT` | `3306` | پورت اتصال به پایگاه داده |
| `DB_NAME` | `liquid_chat` | نام پایگاه داده |
| `DB_USERNAME` | `liquid_user` | نام کاربری دیتابیس |
| `DB_PASSWORD` | - | رمز عبور دیتابیس |
| `APP_ENC_KEY` | - | کلید ۳۲ بایتی Base64 برای رمزنگاری سروری فایل‌ها (با دستور `openssl rand -base64 32`) |

---

## 📡 مستندات ارتباطی و REST API

تمامی تبادلات پیام‌رسان بر بستر اندپوینت‌های بهینه‌سازی‌شده RESTful انجام می‌پذیرد:

* **احراز هویت و مدیریت پیام‌ها (`/api/main.php`):**
  - متد `GET ?action=sync`: دریافت پیام‌های جدید، مخاطبین، پوشه‌ها و شمارنده‌های خوانده‌نشده.
  - متد `POST ?action=send`: ارسال پیام متنی، ویس، ویدیو نوت، پیام زماندار و استیکر با اعتبارسنجی CSRF.
  - متد `POST ?action=delete`: حذف یک‌طرفه یا دوطرفه پیام همراه با تریگر افکت پودری در کلاینت مخاطب.
  - متد `POST ?action=activity`: اعلام زنده وضعیت تایپینگ، ضبط صدا، ویدیو یا درصد پیشرفت آپلود فایل.

* **آپلود رسانه‌ها (`/api/upload.php`):**
  - متد `POST (multipart/form-data)`: آپلود فایل‌ها با پشتیبانی از قطعه‌بندی (Chunking)، متوقف‌سازی و اعتبارسنجی فرمت فایل و امضای دیجیتال.

* **استریم امن فایل‌ها (`/api/file.php`):**
  - متد `GET ?id=...&token=...`: رمزگشایی در لحظه و ارسال فایل با هدرهای استاندارد کش و محافظت در برابر دانلود غیرمجاز.

* **هماهنگ‌ساز بلادرنگ (`/api/sync.php`):**
  - متد `GET ?since=...`: پولینگ هوشمند تطبیقی (Adaptive Long-Polling) با کمترین مصرف منابع CPU سرور و ترافیک شبکه کلاینت.

---

## 📂 ساختار فایل‌ها و معماری پروژه / Directory Structure

```text
liquid-messenger/
├── api/                      # اندپوینت‌های RESTful سرور (main, upload, file, sync)
├── assets/                   # دارایی‌های وکتور، آیکون‌ها و برندینگ
│   ├── pwa/                  # آیکون‌های استاندارد PWA در رزولوشن‌های متنوع
│   ├── telegram/             # پترن پس‌زمینه ابری و وکتورهای اصیل تلگرام
│   └── twemoji/              # ایموجی‌های استاندارد توییتر
├── css/                      # شیت‌های استایل بهینه‌سازی‌شده
│   ├── telegram-z.css        # معماری و پوسته تلگرام نسخه Z با هدر کشویی
│   ├── liquid-glass.css      # پوسته شیشه‌ای نئومورفیک و سیستم توکن ۱۱ تم
│   └── style.css             # استایل‌های پایه، کامپوننت‌ها و انیمیشن‌ها
├── docker/                   # فایل‌های پیکربندی Nginx برای محیط کانتینری
├── includes/                 # کدهای هسته بک‌اند PHP
│   ├── config.sample.php     # فایل نمونه اتصال به دیتابیس
│   ├── auth.php              # سیستم ثبت‌نام، ورود، مدیریت نشست‌ها و یوزرنیم
│   ├── functions.php         # توابع هسته چت، ارسال زمان‌بندی‌شده، هندلر فایل
│   └── encryption.php        # ماژول رمزنگاری متقارن AES-256 داده‌ها و اتچمنت‌ها
├── js/                       # کنترلرهای منطقی جاوااسکریپت سمت کلاینت
│   ├── chat.js               # قلب تپنده چت: مدیریت پیام‌ها، مالتی‌مدیا و کش
│   ├── telegram-z.js         # موتور تعاملی Z: انیمیشن ذرات، سایدبار، کنترلر صدا
│   ├── theme.js              # مدیریت و جابجایی بلادرنگ ۱۱ تم پویا
│   ├── app_lock.js           # منطق قفل برنامه با پین‌کد و تایمر عدم فعالیت
│   └── pwa.js                # رجیستری سرویس‌ورکر، لایسنس نصب و کش آفلاین
├── database_complete.sql     # اسکریپت ساخت کامل جداول پایگاه داده
├── install.php               # ویزارد گرافیکی نصب تحت وب
├── install.sh                # اسکریپت نصب یک‌خطی خودکار لینوکس VPS
├── manifest.json             # مانیفست وب‌اپلیکیشن استاندارد W3C
├── service-worker.js         # ورکر کش آفلاین و پایداری شبکه
├── LICENSE                   # شرایط مجوز حقوقی اختصاصی LCSL-1.0
└── README.md                 # راهنمای جامع فارسی و انگلیسی پروژه
```

---

## 🤝 مشارکت و سیاست گزارش امنیتی / Contributing & Security

ما از مشارکت‌های سازنده، گزارش باگ‌ها و ارسال ایده‌ها برای بهبود لیکوئید چت استقبال می‌کنیم:

1. مخزن را [Fork](https://github.com/pooriyayt/liquid-messenger/fork) کنید.
2. یک شاخه مجزا برای تغییرات خود ایجاد کنید (`git checkout -b feature/amazing-feature`).
3. تغییرات خود را با کامیت‌های منظم ذخیره کنید (`git commit -m 'Add amazing feature'`).
4. شاخه را پوش کرده (`git push origin feature/amazing-feature`) و یک [Pull Request](https://github.com/pooriyayt/liquid-messenger/pulls) ارسال نمایید.

> **گزارش آسیب‌پذیری‌های امنیتی:**  
> در صورتی که هرگونه باگ امنیتی در سیستم کشف کردید، لطفاً موضوع را مستقیماً از بخش [Security Advisories](https://github.com/pooriyayt/liquid-messenger/security/advisories) گیت‌هاب گزارش دهید تا پیش از انتشار عمومی وصله امنیتی آن اعمال شود.

---

## 📜 شرایط مجوز و لایسنس اختصاصی / License

پروژه **Liquid Chat** تحت مجوز اختصاصی **Liquid Chat Community Source License v1.0 (LCSL-1.0)** منتشر شده است:

### 🇮🇷 شرایط شفاف به زبان ساده:
1. **استفاده شخصی، دانشگاهی و تیمی آزاد است:** نصب و بهره‌برداری از این پیام‌رسان بر روی سرورهای اختصاصی شخصی یا درون‌سازمانی بلامانع است.
2. **برندینگ مجدد و تغییر نام ممنوع است:** حذف نام Liquid Chat، حذف لوگو و کپی‌رایت‌ها یا بازتوزیع پروژه تحت نام و عنوان تجاری دیگر مجاز نمی‌باشد.
3. **فروش تجاری ممنوع است:** فروش مستقیم سورس‌کد، فروش اشتراک‌های پولی (SaaS) یا بسته‌بندی تجاری این محصول بدون هماهنگی و مجوز رسمی کتبی ممنوع است.
4. **توسعه جمعی:** هرگونه بهبود یا رفع باگ که مایل به انتشار آن هستید، باید از طریق Pull Request به همین مخزن رسمی افزوده شود تا همه کاربران جامعه از آن بهره‌مند شوند.

برای مطالعه متن کامل حقوقی و بین‌المللی مجوز، فایل [LICENSE](LICENSE) را مشاهده نمایید.

---

<p align="center">
  طراحی و توسعه‌یافته با ❤️ برای ارتباطاتی مدرن، آزاد، سریع و مستقل.<br>
  <em>Engineered with passion for private, ultra-fast, and beautiful human conversations.</em>
</p>
