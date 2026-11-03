<?php
if (!file_exists(__DIR__ . '/installed.lock') && !file_exists(__DIR__ . '/storage/installed.lock') && file_exists(__DIR__ . '/install.php')) {
    header('Location: install.php');
    exit;
}
require_once 'includes/config.php';
require_once 'includes/auth.php';

$isLoggedIn = Auth::isLoggedIn();
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>Liquid Chat - Secure Messaging</title>
    <meta name="description" content="Liquid Chat is a privacy-focused messenger with end-to-end encryption, fast media delivery, and a modern interface.">
    <script src="js/theme.js"></script>
    <link rel="stylesheet" href="css/style.css">
    <link rel="stylesheet" href="css/telegram-z.css">
    <link rel="icon" href="assets/favicon.svg" type="image/svg+xml"><link rel="alternate icon" href="favicon.ico">
    <?php include 'includes/pwa_head.php'; ?>
    <style nonce="<?php echo htmlspecialchars($cspNonce, ENT_QUOTES); ?>">
        body.landing-page {
            padding: 0;
        }

        body.landing-page .app-header {
            margin: 0 18px;
        }

        .landing-shell {
            position: relative;
            overflow: hidden;
        }

        .landing-shell::before {
            content: "";
            position: absolute;
            inset: 0;
            background:
                radial-gradient(780px circle at 12% 18%, var(--accent-soft), transparent 62%),
                radial-gradient(880px circle at 92% 8%, var(--hover-bg), transparent 64%),
                radial-gradient(520px circle at 65% 70%, rgba(255, 255, 255, 0.08), transparent 60%);
            opacity: 0.9;
            pointer-events: none;
        }

        .landing-shell::after {
            content: "";
            position: absolute;
            inset: 0;
            background: linear-gradient(180deg, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.12));
            pointer-events: none;
        }

        .landing-hero {
            position: relative;
            padding: 120px 0 90px;
        }

        .landing-hero .container {
            position: relative;
            z-index: 1;
        }

        .hero-grid {
            display: grid;
            grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
            gap: 64px;
            align-items: center;
        }

        .hero-kicker {
            display: inline-flex;
            align-items: center;
            gap: 10px;
            padding: 6px 14px;
            border-radius: 999px;
            background: var(--surface-soft);
            border: 1px solid var(--border-subtle);
            font-size: 0.85rem;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.08em;
        }

        .hero-kicker-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--primary-color);
            box-shadow: 0 0 0 6px var(--accent-soft);
        }

        .hero-title {
            font-family: var(--font-display);
            font-size: clamp(2.8rem, 4.4vw, 4rem);
            line-height: 1.05;
            margin: 16px 0 18px;
        }

        .hero-subtitle {
            font-size: 1.08rem;
            color: var(--text-muted);
            max-width: 540px;
        }

        .hero-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            margin-top: 26px;
        }

        .hero-stats {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 12px;
            margin-top: 28px;
        }

        .hero-stat {
            padding: 12px 14px;
            border-radius: 16px;
            background: var(--surface-soft);
            border: 1px solid var(--border-subtle);
            box-shadow: var(--shadow-soft);
        }

        .hero-stat strong {
            display: block;
            font-family: var(--font-display);
            font-size: 1.1rem;
            color: var(--text-color);
        }

        .hero-stat span {
            font-size: 0.82rem;
            color: var(--text-muted);
        }

        .hero-visual {
            position: relative;
        }

        .hero-panel {
            background: var(--card-bg);
            border: var(--glass-border);
            border-radius: 26px;
            padding: 22px;
            box-shadow: var(--shadow-strong);
            backdrop-filter: blur(var(--glass-blur));
            -webkit-backdrop-filter: blur(var(--glass-blur));
        }

        .panel-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
        }

        .panel-title {
            font-weight: 600;
        }

        .panel-status {
            font-size: 0.75rem;
            padding: 4px 10px;
            border-radius: 999px;
            background: var(--surface-chip);
            border: 1px solid var(--border-subtle);
            color: var(--text-muted);
        }

        .panel-stream {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .panel-message {
            display: flex;
            gap: 10px;
            align-items: flex-start;
        }

        .panel-message.outgoing {
            justify-content: flex-end;
        }

        .panel-avatar {
            width: 30px;
            height: 30px;
            border-radius: 12px;
            background: var(--surface-inset);
            color: var(--primary-color);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 0.7rem;
            font-weight: 600;
            flex-shrink: 0;
        }

        .panel-bubble {
            padding: 10px 12px;
            border-radius: 14px;
            background: var(--surface-muted);
            color: var(--text-color);
            box-shadow: var(--shadow-soft);
            font-size: 0.9rem;
            max-width: 260px;
        }

        .panel-bubble.outgoing {
            background: var(--bubble-outgoing);
            color: var(--bubble-outgoing-text);
        }

        .panel-metrics {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 16px;
        }

        .panel-chip {
            padding: 6px 10px;
            border-radius: 999px;
            background: var(--surface-soft);
            border: 1px solid var(--border-subtle);
            font-size: 0.75rem;
            color: var(--text-muted);
        }

        .hero-rail {
            display: grid;
            gap: 12px;
            margin-top: 18px;
        }

        .rail-card {
            padding: 14px 16px;
            border-radius: 18px;
            background: var(--surface-strong);
            border: var(--glass-border);
            box-shadow: var(--shadow-medium);
        }

        .rail-title {
            font-weight: 600;
            margin-bottom: 6px;
        }

        .rail-text {
            font-size: 0.86rem;
            color: var(--text-muted);
        }

        .landing-band {
            position: relative;
            padding: 0 0 40px;
        }

        .band-grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 16px;
        }

        .band-card {
            padding: 16px;
            border-radius: 18px;
            background: var(--surface-strong);
            border: var(--glass-border);
            box-shadow: var(--shadow-soft);
        }

        .band-title {
            font-weight: 600;
            margin-bottom: 6px;
        }

        .band-text {
            font-size: 0.85rem;
            color: var(--text-muted);
        }

        .landing-section {
            position: relative;
            padding: 60px 0;
        }

        .section-header {
            margin-bottom: 24px;
        }

        .section-eyebrow {
            text-transform: uppercase;
            letter-spacing: 0.18em;
            font-size: 0.75rem;
            color: var(--text-muted);
        }

        .section-title {
            font-family: var(--font-display);
            font-size: clamp(1.9rem, 2.6vw, 2.6rem);
            margin: 8px 0 10px;
        }

        .section-subtitle {
            color: var(--text-muted);
            max-width: 560px;
        }

        .feature-grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 18px;
        }

        .feature-card {
            background: var(--card-bg);
            border: var(--glass-border);
            border-radius: 20px;
            padding: 18px;
            box-shadow: var(--shadow-soft);
            min-height: 190px;
        }

        .feature-icon {
            width: 40px;
            height: 40px;
            border-radius: 12px;
            background: var(--accent-soft);
            color: var(--accent-color);
            display: inline-flex;
            align-items: center;
            justify-content: center;
        }

        .feature-title {
            margin: 12px 0 6px;
            font-weight: 600;
        }

        .feature-text {
            color: var(--text-muted);
            font-size: 0.9rem;
        }

        .capability-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 20px;
        }

        .capability-card {
            background: var(--surface-strong);
            border: var(--glass-border);
            border-radius: 24px;
            padding: 22px;
            box-shadow: var(--shadow-medium);
        }

        .capability-title {
            font-weight: 600;
            margin-bottom: 8px;
        }

        .capability-text {
            color: var(--text-muted);
            margin-bottom: 14px;
        }

        .capability-list {
            display: grid;
            gap: 8px;
            font-size: 0.88rem;
            color: var(--text-muted);
        }

        .capability-list span {
            display: inline-flex;
            gap: 8px;
            align-items: center;
        }

        .landing-cta {
            margin: 60px 0 90px;
        }

        .landing-cta-inner {
            padding: 28px 30px;
            border-radius: 24px;
            background: var(--surface-strong);
            border: var(--glass-border);
            box-shadow: var(--shadow-medium);
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 20px;
            flex-wrap: wrap;
        }

        .landing-cta-title {
            font-family: var(--font-display);
            font-size: 1.7rem;
            margin-bottom: 6px;
        }

        .landing-cta-text {
            color: var(--text-muted);
        }

        .hero-grid,
        .feature-card,
        .hero-panel,
        .band-card,
        .capability-card {
            animation: landingFade 0.6s ease both;
        }

        .feature-card:nth-child(2),
        .band-card:nth-child(2) {
            animation-delay: 0.05s;
        }

        .feature-card:nth-child(3),
        .band-card:nth-child(3) {
            animation-delay: 0.1s;
        }

        .feature-card:nth-child(4),
        .band-card:nth-child(4) {
            animation-delay: 0.15s;
        }

        @keyframes landingFade {
            from {
                opacity: 0;
                transform: translateY(8px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        @media (prefers-reduced-motion: reduce) {
            .hero-grid,
            .feature-card,
            .hero-panel,
            .band-card,
            .capability-card {
                animation: none;
            }
        }

        @media (max-width: 1024px) {
            .hero-grid {
                grid-template-columns: 1fr;
            }

            .feature-grid,
            .band-grid {
                grid-template-columns: repeat(2, minmax(0, 1fr));
            }

            .capability-grid {
                grid-template-columns: 1fr;
            }
        }

        @media (max-width: 640px) {
            .landing-hero {
                padding: 100px 0 70px;
            }

            body.landing-page .app-header {
                margin: 0 12px;
            }

            .hero-stats {
                grid-template-columns: 1fr;
            }

            .feature-grid,
            .band-grid {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body class="landing-page">
    <?php include 'includes/icons.php'; ?>
    <div class="app-header glass-nav">
        <div class="container">
            <div class="app-nav">
                <div class="app-logo">
                    <a href="index">
                        <img src="assets/logo.svg" alt="Liquid Chat">
                        <span>Liquid Chat</span>
                    </a>
                </div>
                <div class="d-flex align-center gap-10">
                    <?php if ($isLoggedIn): ?>
                        <a href="chat" class="btn btn-primary">Open Chat</a>
                    <?php else: ?>
                        <a href="login" class="btn btn-secondary">Login</a>
                        <a href="register" class="btn btn-primary">Register</a>
                    <?php endif; ?>
                </div>
            </div>
        </div>
    </div>

    <main class="landing-shell">
        <section class="landing-hero">
            <div class="container">
                <div class="hero-grid">
                    <div class="hero-copy">
                        <div class="hero-kicker">
                            <span class="hero-kicker-dot"></span>
                            <span>Liquid Chat Platform</span>
                        </div>
                        <h1 class="hero-title">Command-grade messaging for teams that move fast.</h1>
                        <p class="hero-subtitle">Liquid Chat combines end-to-end encryption, ultra-low latency delivery, and intelligent media caching so every conversation feels instant and dependable.</p>
                        <div class="hero-actions">
                            <?php if ($isLoggedIn): ?>
                                <a href="chat" class="btn btn-primary">Open Chat</a>
                                <a href="settings" class="btn btn-secondary">Personalize</a>
                            <?php else: ?>
                                <a href="register" class="btn btn-primary">Create free account</a>
                                <a href="login" class="btn btn-secondary">Log in</a>
                            <?php endif; ?>
                        </div>
                        <div class="hero-stats">
                            <div class="hero-stat">
                                <strong>120ms</strong>
                                <span>Median delivery across regions</span>
                            </div>
                            <div class="hero-stat">
                                <strong>99.99%</strong>
                                <span>Uptime with auto failover</span>
                            </div>
                            <div class="hero-stat">
                                <strong>4 devices</strong>
                                <span>Active sync without lag</span>
                            </div>
                        </div>
                    </div>
                    <div class="hero-visual">
                        <div class="hero-panel">
                            <div class="panel-header">
                                <div class="panel-title">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--tg-primary, #3390ec); margin-right:4px;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                                    Operations Desk
                                </div>
                                <div class="panel-status">
                                    <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#00c73e;margin-right:4px;"></span>
                                    Encrypted live · 4 online
                                </div>
                            </div>
                            <div class="panel-stream">
                                <div class="panel-message">
                                    <div class="panel-avatar">KR</div>
                                    <div class="panel-bubble">
                                        <div style="font-size:0.78rem;font-weight:600;color:var(--tg-primary, #3390ec);margin-bottom:2px;">Kaveh R.</div>
                                        <div>Media delivery pipeline cleared. All assets cached at edge.</div>
                                        <div style="display:flex;justify-content:flex-end;font-size:0.7rem;color:var(--tg-text-secondary, #708499);margin-top:2px;">10:42</div>
                                    </div>
                                </div>
                                <div class="panel-message outgoing">
                                    <div class="panel-bubble outgoing">
                                        <div>Great. Pin the launch summary and notify the field team.</div>
                                        <div style="display:flex;align-items:center;justify-content:flex-end;gap:3px;font-size:0.7rem;color:var(--tg-text-outgoing, #9bb5cc);margin-top:2px;">
                                            <span>10:43</span>
                                            <svg width="14" height="10" viewBox="0 0 16 11" fill="currentColor" style="color:currentColor;"><path d="M11.07 0.880005L4.47 7.48001L1.41 4.42C1.02 4.03 0.39 4.03 0 4.42C-0.39 4.81 -0.39 5.44 0 5.83L3.76 9.59C4.15 9.98 4.78 9.98 5.17 9.59L12.48 2.28C12.87 1.89 12.87 1.26 12.48 0.870005C12.1 -0.509995 11.46 -0.509995 11.07 0.880005ZM15.54 0.880005L8.94 7.48001L7.54 6.08L6.13 7.49L8.23 9.59C8.62 9.98 9.25 9.98 9.64 9.59L16.95 2.28C17.34 1.89 17.34 1.26 16.95 0.870005C16.56 0.490005 15.93 0.490005 15.54 0.880005Z"/></svg>
                                        </div>
                                    </div>
                                </div>
                                <div class="panel-message">
                                    <div class="panel-avatar">SM</div>
                                    <div class="panel-bubble">
                                        <div style="font-size:0.78rem;font-weight:600;color:var(--tg-primary, #3390ec);margin-bottom:2px;">Saman M.</div>
                                        <div>Device sync complete. Mobile and desktop fully aligned.</div>
                                        <div style="display:flex;justify-content:flex-end;font-size:0.7rem;color:var(--tg-text-secondary, #708499);margin-top:2px;">10:44</div>
                                    </div>
                                </div>
                            </div>
                            <div class="panel-metrics">
                                <span class="panel-chip">⚡ Instant sync</span>
                                <span class="panel-chip">🔒 End-to-end</span>
                                <span class="panel-chip">👍 12 reactions</span>
                            </div>
                        </div>
                        <div class="hero-rail">
                            <div class="rail-card">
                                <div class="rail-title">Media delivery</div>
                                <div class="rail-text">Adaptive compression and regional routing keep rich media smooth.</div>
                            </div>
                            <div class="rail-card">
                                <div class="rail-title">Media cache</div>
                                <div class="rail-text">Encrypted previews and auto-resume downloads make handoffs effortless.</div>
                            </div>
                            <div class="rail-card">
                                <div class="rail-title">Operational clarity</div>
                                <div class="rail-text">Pinned summaries, activity signals, and search-ready history.</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <section class="landing-band">
            <div class="container">
                <div class="band-grid">
                    <div class="band-card">
                        <div class="band-title">Global routing mesh</div>
                        <div class="band-text">Traffic steers intelligently to the fastest encrypted path.</div>
                    </div>
                    <div class="band-card">
                        <div class="band-title">Adaptive media engine</div>
                        <div class="band-text">High fidelity uploads tuned per device and connection.</div>
                    </div>
                    <div class="band-card">
                        <div class="band-title">Zero-trust keychain</div>
                        <div class="band-text">Keys remain local, never exposed to server storage.</div>
                    </div>
                    <div class="band-card">
                        <div class="band-title">Enterprise-ready sync</div>
                        <div class="band-text">Instant continuation across web, desktop, and mobile.</div>
                    </div>
                </div>
            </div>
        </section>

        <section class="landing-section">
            <div class="container">
                <div class="section-header">
                    <div class="section-eyebrow">Why Liquid Chat</div>
                    <h2 class="section-title">Clarity, speed, and security in every exchange.</h2>
                    <p class="section-subtitle">Designed for teams that need dependable delivery, protected media, and clean interfaces with zero friction.</p>
                </div>
                <div class="feature-grid">
                    <div class="feature-card">
                        <div class="feature-icon">
                            <svg class="icon" aria-hidden="true"><use href="#icon-lock"></use></svg>
                        </div>
                        <div class="feature-title">Security first</div>
                        <div class="feature-text">End-to-end encryption, local keys, and zero server trust built in.</div>
                    </div>
                    <div class="feature-card">
                        <div class="feature-icon">
                            <svg class="icon" aria-hidden="true"><use href="#icon-download"></use></svg>
                        </div>
                        <div class="feature-title">Speed you can feel</div>
                        <div class="feature-text">Low-latency delivery with intelligent routing and cache-aware sync.</div>
                    </div>
                    <div class="feature-card">
                        <div class="feature-icon">
                            <svg class="icon" aria-hidden="true"><use href="#icon-camera"></use></svg>
                        </div>
                        <div class="feature-title">Media without delays</div>
                        <div class="feature-text">Preview, stream, and share media instantly with encrypted fidelity.</div>
                    </div>
                    <div class="feature-card">
                        <div class="feature-icon">
                            <svg class="icon" aria-hidden="true"><use href="#icon-devices"></use></svg>
                        </div>
                        <div class="feature-title">Always in sync</div>
                        <div class="feature-text">Continue conversations seamlessly across every device you own.</div>
                    </div>
                </div>
            </div>
        </section>

        <section class="landing-section">
            <div class="container">
                <div class="section-header">
                    <div class="section-eyebrow">Core Capabilities</div>
                    <h2 class="section-title">Media delivery and cache, elevated to enterprise-grade.</h2>
                    <p class="section-subtitle">Liquid Chat treats media as a first-class experience with resilient delivery, encrypted previews, and adaptive streaming built for demanding teams.</p>
                </div>
                <div class="capability-grid">
                    <div class="capability-card">
                        <div class="capability-title">Media delivery pipeline</div>
                        <div class="capability-text">Accelerated ingest with lossless protection, auto-resume, and multi-region routing keeps rich media consistently fast.</div>
                        <div class="capability-list">
                            <span><svg class="icon" aria-hidden="true"><use href="#icon-check"></use></svg> Edge-aware compression and priority lanes</span>
                            <span><svg class="icon" aria-hidden="true"><use href="#icon-check"></use></svg> Progressive previews for instant context</span>
                            <span><svg class="icon" aria-hidden="true"><use href="#icon-check"></use></svg> Resumable uploads with integrity checks</span>
                        </div>
                    </div>
                    <div class="capability-card">
                        <div class="capability-title">Media cache intelligence</div>
                        <div class="capability-text">Encrypted caching keeps the last mile fast while preserving privacy across devices and networks.</div>
                        <div class="capability-list">
                            <span><svg class="icon" aria-hidden="true"><use href="#icon-check"></use></svg> Predictive caching for active threads</span>
                            <span><svg class="icon" aria-hidden="true"><use href="#icon-check"></use></svg> Smart eviction tuned for mobile storage</span>
                            <span><svg class="icon" aria-hidden="true"><use href="#icon-check"></use></svg> Instant handoff between desktop and phone</span>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <section class="landing-section">
            <div class="container">
                <div class="section-header">
                    <div class="section-eyebrow">Operational Control</div>
                    <h2 class="section-title">Built for modern teams, channels, and leadership.</h2>
                    <p class="section-subtitle">Keep teams aligned with smart notifications, persistent history, and tooling that scales from small squads to global operations.</p>
                </div>
                <div class="feature-grid">
                    <div class="feature-card">
                        <div class="feature-icon">
                            <svg class="icon" aria-hidden="true"><use href="#icon-bell"></use></svg>
                        </div>
                        <div class="feature-title">Signal control</div>
                        <div class="feature-text">Granular alerts keep focus without missing critical updates.</div>
                    </div>
                    <div class="feature-card">
                        <div class="feature-icon">
                            <svg class="icon" aria-hidden="true"><use href="#icon-users"></use></svg>
                        </div>
                        <div class="feature-title">Team governance</div>
                        <div class="feature-text">Groups, channels, and role-based visibility that scale with you.</div>
                    </div>
                    <div class="feature-card">
                        <div class="feature-icon">
                            <svg class="icon" aria-hidden="true"><use href="#icon-settings"></use></svg>
                        </div>
                        <div class="feature-title">Operational tooling</div>
                        <div class="feature-text">Settings, device management, and session controls built in.</div>
                    </div>
                    <div class="feature-card">
                        <div class="feature-icon">
                            <svg class="icon" aria-hidden="true"><use href="#icon-smile"></use></svg>
                        </div>
                        <div class="feature-title">Human moments</div>
                        <div class="feature-text">Reactions, voice, and rich media keep teams connected.</div>
                    </div>
                </div>
            </div>
        </section>

        <section class="landing-cta">
            <div class="container landing-cta-inner">
                <div>
                    <h2 class="landing-cta-title">Ready to move faster?</h2>
                    <p class="landing-cta-text">Launch Liquid Chat and deliver secure, professional messaging in minutes.</p>
                </div>
                <div class="hero-actions">
                    <?php if ($isLoggedIn): ?>
                        <a href="chat" class="btn btn-primary">Open Chat</a>
                        <a href="settings" class="btn btn-secondary">Adjust Theme</a>
                    <?php else: ?>
                        <a href="register" class="btn btn-primary">Get started</a>
                        <a href="login" class="btn btn-secondary">I already have an account</a>
                    <?php endif; ?>
                </div>
            </div>
        </section>
    </main>
</body>
</html>
