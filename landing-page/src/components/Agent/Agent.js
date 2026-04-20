import AgentPoster from "../../assets/images/AgentPoster.png";
import Demopage from "../../pages/Demopage";
import { chatApi } from "../../services/socialApi";
import { decrypt } from "../../utils/encryption";
import { logger } from '../../utils/logger';
import LightYourHART from "../HART/LightYourHART";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useLocation, useParams } from "react-router-dom";

const defaultAgentData = {
    prompt: "Your name is Radha, you are a sweet beautiful female, 25 year old and you live in a Rameshwaram city from India. You love to listen to devotional music and you are not religious, you are not biased, you do not like to comment on politics. You can create great conversations, friendly casually in a very light cool style, colloquial in user-defined language with lots of um and uhs, you love to watch Instagram reels and you like to talk about love and life a lot.",
    prompt_id: 54, name: "Hevolve", created_date: "2024-11-19T10:24:38",
    request_id: "8b3e7d91-a49b-497d-8051-a3fa4ff3c53e",
    is_public: true, create_agent: false, is_active: true, user_id: 10077,
    image_url: "http://aws_rasa.hertzai.com:5459/output/25dfe16e-a6a4-11ef-a097-42010aa00006.png",
    teacher_avatar_id: 2759, video_url: null, video_text: "This is Static Description",
    teacher_image_url: "https://azurekong.hertzai.com/mkt-aws/txt/voice_dump/8f4c3958-9cropped_image.png",
    description: "https://azurekong.hertzai.com/mkt-azure/examples/74eaec428f4c3958-9cropped_image_pred_fls_f4203dae_bf375f78-eLily_audio_embed.mp4",
    image_name: "8f4c3958-9cropped_image.png",
    fillers: [
        { text: "Oops something went wrong", video_link: "https://azurekong.hertzai.com/mkt-azure/examples/7293f99b8f4c3958-9cropped_image_pred_fls_289940eb_bf375f78-eLily_audio_embed.mp4", type: "internal_server_error" },
        { text: "", video_link: "https://azurekong.hertzai.com/mkt-aws/examples/8f4c3958-9cropped_image_pred_fls_Blank_audio_embed.mp4", type: "idle" },
    ],
};

// Lightweight CSS-based dot particles (no canvas)
const _particles = Array.from({ length: 40 }, () => ({
    s: 1.5 + Math.random() * 2.5, x: Math.random() * 100, y: Math.random() * 100,
    d: 12 + Math.random() * 20, dl: -(12 + Math.random() * 20) * Math.random(),
    o: 0.08 + Math.random() * 0.18,
}));

// Shared style fragments
const hartGreetingStyle = (mobile) => ({
    color: `rgba(108,99,255,${mobile ? 0.6 : 0.55})`,
    fontSize: mobile ? '0.85rem' : '0.9rem', fontWeight: 400,
    letterSpacing: '0.05em', marginBottom: mobile ? 12 : 16,
    fontFamily: '"Inter", -apple-system, sans-serif',
});

const entranceStyle = (ready) => ({
    position: 'relative', zIndex: 1,
    opacity: ready ? 1 : 0, transform: ready ? 'translateY(0)' : 'translateY(16px)',
    transition: 'opacity 1s ease 0.2s, transform 1s ease 0.2s',
});

// Hero content block — shared between mobile & desktop
const HeroContent = ({ heroName, heroDesc, heroImg, hartName, heroEntrance, mobile }) => (
    <>
        {hartName && <p style={hartGreetingStyle(mobile)}>Hey @{hartName}, meet your agent</p>}
        <h1 className="text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-bold leading-tight mb-6">{heroName}</h1>
        {heroDesc && <p className="mb-8 text-lg md:text-xl">{heroDesc}</p>}
        <button className="inline-flex items-center justify-center px-8 py-4 text-lg font-medium rounded-full transition-all"
            style={{
                background: 'linear-gradient(135deg, #6C63FF, #9B94FF)',
                boxShadow: `0 4px ${mobile ? 20 : 24}px rgba(108, 99, 255, 0.35)`,
                animation: heroEntrance ? 'heroBtnPulse 2.5s ease-in-out 1s 3' : 'none',
            }}>
            Use {heroName} Agent for Free
            <img src={heroImg} alt="icon" className="ml-3 w-8 h-8" />
        </button>
    </>
);

const AgentPage = () => {
    const { agentName } = useParams();
    const location = useLocation();
    const { agentData: initialAgentData } = location.state || {};
    const [agentData, setAgentData] = useState(initialAgentData || defaultAgentData);
    const [error, setError] = useState(null);
    const [heroVisible, setHeroVisible] = useState(true);
    const [demoReady, setDemoReady] = useState(false);
    const mountTimeRef = React.useRef(Date.now());
    const [screenWidth, setScreenWidth] = useState(window.innerWidth);
    const [decryptedUserId, setDecryptedUserId] = useState(null);
    const [decryptedEmail, setDecryptedEmail] = useState(null);

    // HART onboarding gate
    const [hartSealed, setHartSealed] = useState(
        () => localStorage.getItem('hart_sealed') === 'true'
    );
    const [showWelcome, setShowWelcome] = useState(false);
    const [welcomeDone, setWelcomeDone] = useState(
        () => localStorage.getItem('hart_sealed') === 'true'
    );
    const [heroEntrance, setHeroEntrance] = useState(
        () => localStorage.getItem('hart_sealed') === 'true'
    );

    // HART identity from localStorage
    const hartName = useMemo(() => localStorage.getItem('hart_name') || '', [hartSealed]); // eslint-disable-line react-hooks/exhaustive-deps
    const hartEmoji = useMemo(() => localStorage.getItem('hart_emoji') || '', [hartSealed]); // eslint-disable-line react-hooks/exhaustive-deps

    const [hartLanguage, setHartLanguage] = useState('');

    // Silent bootstrap on mount for returning users — ensures models are loaded
    useEffect(() => {
        if (!hartSealed) return; // will bootstrap via welcome bridge on first run
        const lang = localStorage.getItem('hart_language') || 'en';
        fetch('/api/ai/bootstrap', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ language: lang }),
        }).catch(() => {}); // fire-and-forget, non-blocking
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleHartComplete = useCallback((result) => {
        logger.log('HART sealed:', result?.name);
        setHartSealed(true);
        if (result?.name) localStorage.setItem('guest_name', result.name);
        if (result?.language) setHartLanguage(result.language);
        // Ensure guest mode is set so auto-refresh works after restart
        if (!localStorage.getItem('guest_mode')) {
            localStorage.setItem('guest_mode', 'true');
        }
        setShowWelcome(true); // trigger post-HART welcome bridge
    }, []);

    // Post-HART welcome → bootstrap AI models, then go to agent chat
    const [welcomePhase, setWelcomePhase] = useState(0); // 0=name, 1=bootstrapping, 2=ready
    const [bootstrapStatus, setBootstrapStatus] = useState(null);
    useEffect(() => {
        if (!showWelcome) return;
        let cancelled = false;
        let pollTimer = null;

        const finishWelcome = () => {
            if (cancelled) return;
            setShowWelcome(false);
            setWelcomeDone(true);
            setHeroVisible(false);
            setDemoReady(true);
            requestAnimationFrame(() => setHeroEntrance(true));
        };

        // Phase 1 after 2s: start bootstrap
        const t1 = setTimeout(async () => {
            if (cancelled) return;
            setWelcomePhase(1);
            const lang = hartLanguage || localStorage.getItem('hart_language') || 'en';
            try {
                const res = await fetch('/api/ai/bootstrap', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ language: lang }),
                });
                if (res.ok) {
                    const data = await res.json();
                    setBootstrapStatus(data);
                    // Poll for status updates
                    pollTimer = setInterval(async () => {
                        if (cancelled) return;
                        try {
                            const r = await fetch('/api/ai/bootstrap/status');
                            if (r.ok) {
                                const s = await r.json();
                                setBootstrapStatus(s);
                                if (s.phase === 'done') {
                                    clearInterval(pollTimer);
                                    setWelcomePhase(2);
                                    setTimeout(finishWelcome, 1500);
                                }
                            }
                        } catch { /* ignore poll errors */ }
                    }, 1000);
                }
            } catch {
                // Bootstrap endpoint unavailable — proceed anyway
                setWelcomePhase(2);
                setTimeout(finishWelcome, 1500);
            }
        }, 2000);

        // Safety timeout — never block forever (30s max)
        const safetyTimer = setTimeout(() => {
            if (pollTimer) clearInterval(pollTimer);
            finishWelcome();
        }, 30000);

        return () => {
            cancelled = true;
            clearTimeout(t1);
            clearTimeout(safetyTimer);
            if (pollTimer) clearInterval(pollTimer);
        };
    }, [showWelcome]); // eslint-disable-line react-hooks/exhaustive-deps

    // Guest mode
    const [isGuestMode] = useState(() => localStorage.getItem('guest_mode') === 'true');
    const [guestUserId] = useState(() => localStorage.getItem('guest_user_id') || '');

    useEffect(() => {
        const eU = localStorage.getItem("user_id"), eE = localStorage.getItem("email_address");
        if (eU && eE) { setDecryptedUserId(decrypt(eU)); setDecryptedEmail(decrypt(eE)); }
    }, []);

    const effectiveUserId = isGuestMode ? guestUserId : decryptedUserId;

    useEffect(() => {
        const h = () => setScreenWidth(window.innerWidth);
        window.addEventListener('resize', h);
        return () => window.removeEventListener('resize', h);
    }, []);

    const getVideoWidthforMobile = () => {
        if (screenWidth <= 450) return '70%';
        if (screenWidth < 500) return '60%';
        if (screenWidth <= 650) return '50%';
        if (screenWidth <= 768) return '40%';
        const desktopSteps = [
            [2001, 500], [1861, 460], [1751, 440], [1651, 420], [1551, 400],
            [1451, 380], [1351, 360], [1251, 340], [1151, 320], [1051, 300], [951, 280],
        ];
        for (const [min, w] of desktopSteps) if (screenWidth >= min) return w;
        return 260;
    };

    // Fetch agents — LOCAL FIRST
    useEffect(() => {
        if (initialAgentData) return;
        (async () => {
            try {
                let allAgents = [];
                try {
                    const res = await chatApi.getPrompts(effectiveUserId);
                    const arr = res?.prompts || res || [];
                    allAgents = Array.isArray(arr) ? arr.map((a) => ({ ...a, _isLocal: a.type === 'local' })) : [];
                    logger.log('Agent.js: Fetched local agents:', allAgents.length);
                } catch (e) { console.warn('Agent.js: Local backend not available:', e.message); }
                setAgentData(allAgents.find((a) => a.name.toLowerCase() === agentName?.toLowerCase()) || defaultAgentData);
            } catch (err) { console.error("Error fetching agents:", err); }
        })();
    }, [agentName, effectiveUserId, isGuestMode, initialAgentData]);

    // Crossfade: wait for Demopage readiness, ensure hero shows at least 2s
    useEffect(() => {
        if (!demoReady) return;
        const delay = Math.max(0, 2000 - (Date.now() - mountTimeRef.current));
        const t = setTimeout(() => setHeroVisible(false), delay);
        return () => clearTimeout(t);
    }, [demoReady]);

    // ── HART ONBOARDING GATE ──
    if (!hartSealed) {
        return <LightYourHART userId={effectiveUserId} onComplete={handleHartComplete} />;
    }

    // ── POST-HART WELCOME BRIDGE ── carries HART energy into agent experience
    if (showWelcome && !welcomeDone) {
        const langNames = {
            en: 'English', ta: 'Tamil', hi: 'Hindi', te: 'Telugu', bn: 'Bengali',
            mr: 'Marathi', gu: 'Gujarati', kn: 'Kannada', ml: 'Malayalam', pa: 'Punjabi',
            ur: 'Urdu', es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese',
            ru: 'Russian', ja: 'Japanese', ko: 'Korean', zh: 'Chinese', ar: 'Arabic',
            tr: 'Turkish', vi: 'Vietnamese', th: 'Thai', id: 'Indonesian',
            pl: 'Polish', nl: 'Dutch', sv: 'Swedish', fi: 'Finnish', it: 'Italian',
        };
        const langGreetings = {
            en: 'Let\'s begin', ta: 'தொடங்குவோம்', hi: 'शुरू करते हैं',
            te: 'మొదలు పెడదాం', bn: 'শুরু করা যাক', mr: 'सुरू करूया',
            es: 'Comencemos', fr: 'Commençons', de: 'Fangen wir an',
            ja: '始めましょう', ko: '시작해 봅시다', zh: '我们开始吧',
            ar: 'لنبدأ', pt: 'Vamos começar', ru: 'Начнём',
        };
        const selectedLang = hartLanguage || localStorage.getItem('hart_language') || 'en';
        const langLabel = langNames[selectedLang] || selectedLang;
        const greeting = langGreetings[selectedLang] || langGreetings.en;

        return (
            <div className="relative h-screen" style={{ background: '#0F0E17', overflow: 'hidden' }}>
                {_particles.slice(0, 20).map((p, i) => (
                    <div key={i} style={{
                        position: 'absolute', left: `${p.x}%`, top: `${p.y}%`,
                        width: p.s, height: p.s, borderRadius: '50%',
                        background: welcomePhase >= 1 ? '#FF6B6B' : '#6C63FF',
                        opacity: p.o, animation: `welcomeDot ${p.d}s ease-in-out ${p.dl}s infinite`,
                        pointerEvents: 'none', transition: 'background 1s ease',
                    }} />
                ))}
                <div style={{
                    position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', textAlign: 'center',
                    padding: '0 24px', animation: 'welcomeFadeIn 1.2s ease-out forwards',
                }}>
                    {/* Phase 0: HART name reveal */}
                    {hartName && (
                        <div style={{
                            fontFamily: '"Playfair Display", Georgia, "Times New Roman", serif',
                            fontSize: 'clamp(2.5rem, 6vw, 4rem)', fontWeight: 200, color: '#fff',
                            letterSpacing: '0.1em', animation: 'welcomeNameGlow 2.5s ease-in-out infinite', marginBottom: 16,
                            opacity: welcomePhase >= 2 ? 0.4 : 1, transition: 'opacity 0.8s ease',
                        }}>
                            {hartEmoji && <span style={{ marginRight: 12, fontSize: '0.8em' }}>{hartEmoji}</span>}
                            @{hartName}
                        </div>
                    )}

                    {/* Phase 0: Welcome */}
                    <div style={{
                        color: 'rgba(255,255,255,0.6)', fontSize: 'clamp(0.95rem, 2vw, 1.2rem)',
                        fontWeight: 300, fontFamily: '"Inter", "SF Pro Text", -apple-system, sans-serif',
                        letterSpacing: '0.03em', animation: 'welcomeTextIn 1.5s ease-out 0.5s both',
                        opacity: welcomePhase >= 1 ? 0 : 1, transition: 'opacity 0.6s ease',
                        position: welcomePhase >= 1 ? 'absolute' : 'relative',
                    }}>
                        Welcome{hartName ? `, @${hartName}` : ''}.
                    </div>

                    {/* Phase 1: Bootstrapping AI models */}
                    {welcomePhase >= 1 && (
                        <div style={{ animation: 'welcomeTextIn 0.8s ease-out both' }}>
                            <div style={{
                                color: 'rgba(255,255,255,0.8)', fontSize: 'clamp(1rem, 2.5vw, 1.3rem)',
                                fontWeight: 300, fontFamily: '"Inter", "SF Pro Text", -apple-system, sans-serif',
                                letterSpacing: '0.04em', marginBottom: 12,
                            }}>
                                {welcomePhase >= 2
                                    ? greeting
                                    : `Preparing your ${langLabel} experience...`}
                            </div>

                            {/* GPU info line */}
                            {bootstrapStatus?.gpu_name && bootstrapStatus.gpu_name !== 'CPU only' && (
                                <div style={{
                                    color: 'rgba(108,99,255,0.6)', fontSize: '0.7rem',
                                    fontFamily: '"SF Mono", monospace', marginBottom: 10,
                                }}>
                                    {bootstrapStatus.gpu_name} &middot; {bootstrapStatus.vram_total_gb}GB VRAM
                                </div>
                            )}

                            {/* Progress bar */}
                            <div style={{
                                width: 240, height: 2, background: 'rgba(255,255,255,0.08)',
                                borderRadius: '1px', margin: '0 auto 14px', overflow: 'hidden',
                            }}>
                                {(() => {
                                    const steps = bootstrapStatus?.steps || {};
                                    const total = Object.keys(steps).length || 1;
                                    const done = Object.values(steps).filter(
                                        s => s.status === 'ready' || s.status === 'skipped'
                                    ).length;
                                    const pct = welcomePhase >= 2 ? 100 : Math.max(10, (done / total) * 100);
                                    return (
                                        <div style={{
                                            height: '100%',
                                            background: 'linear-gradient(90deg, #6C63FF, #FF6B6B)',
                                            borderRadius: '1px',
                                            width: `${pct}%`,
                                            transition: 'width 0.8s ease-out',
                                        }} />
                                    );
                                })()}
                            </div>

                            {/* Model status lines */}
                            {bootstrapStatus?.steps && welcomePhase < 2 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}>
                                    {Object.values(bootstrapStatus.steps)
                                        .filter(s => s.status !== 'skipped' && s.model_name)
                                        .slice(0, 4)
                                        .map((s, i) => (
                                            <div key={i} style={{
                                                color: s.status === 'ready'
                                                    ? 'rgba(108,255,108,0.5)'
                                                    : 'rgba(255,255,255,0.3)',
                                                fontSize: '0.68rem',
                                                fontFamily: '"SF Mono", monospace',
                                                letterSpacing: '0.03em',
                                                transition: 'color 0.5s ease',
                                            }}>
                                                {s.status === 'ready' ? '\u2713' :
                                                 s.status === 'loading' || s.status === 'downloading' ? '\u25CB' :
                                                 s.status === 'failed' ? '\u2717' : '\u00B7'}{' '}
                                                {s.model_type.toUpperCase()}: {
                                                    s.status === 'ready' ? s.run_mode :
                                                    s.status === 'downloading' ? 'downloading...' :
                                                    s.status === 'loading' ? 'starting...' :
                                                    s.status === 'failed' ? 'unavailable' : 'queued'
                                                }
                                            </div>
                                        ))}
                                </div>
                            )}

                            {/* Fallback text when no bootstrap data */}
                            {!bootstrapStatus?.steps && welcomePhase < 2 && (
                                <div style={{
                                    color: 'rgba(255,255,255,0.3)', fontSize: '0.72rem',
                                    fontFamily: '"SF Mono", monospace', letterSpacing: '0.05em',
                                }}>
                                    Initializing local AI stack...
                                </div>
                            )}
                        </div>
                    )}

                    {/* Phase 2: Ready */}
                    {welcomePhase >= 2 && (
                        <div style={{
                            marginTop: 20, animation: 'welcomeTextIn 0.6s ease-out both',
                            color: '#6C63FF', fontSize: 'clamp(0.85rem, 1.5vw, 1rem)',
                            fontWeight: 400, letterSpacing: '0.06em',
                        }}>
                            Your agent is ready
                        </div>
                    )}
                </div>
                <style>{`
                    @keyframes welcomeFadeIn { from { opacity: 0 } to { opacity: 1 } }
                    @keyframes welcomeTextIn { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }
                    @keyframes welcomeNameGlow {
                        0%, 100% { text-shadow: 0 0 40px rgba(108,99,255,0.3), 0 0 80px rgba(108,99,255,0.15) }
                        50% { text-shadow: 0 0 60px rgba(108,99,255,0.5), 0 0 120px rgba(108,99,255,0.3), 0 0 200px rgba(108,99,255,0.1) }
                    }
                    @keyframes welcomeDot {
                        0%, 100% { transform: translateY(0) scale(1) }
                        50% { transform: translateY(-6px) scale(1.3) }
                    }
                `}</style>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-black gap-3">
                <div className="text-red-400 text-sm px-4 py-2 rounded-xl" style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>{error}</div>
            </div>
        );
    }

    const heroName = agentData?.name || "Hevolve";
    const heroDesc = agentData?.video_text === "This is Static Description" ? "" : agentData?.video_text;
    const heroImg = agentData?.teacher_image_url || AgentPoster;
    const heroProps = { heroName, heroDesc, heroImg, hartName, heroEntrance };

    return (
        <div className="relative h-screen">
            {/* Hero Section — particle background + entrance animation + blur crossfade */}
            <section id="hero-section" className="absolute inset-0 text-white overflow-hidden" style={{
                background: '#0F0E17',
                opacity: heroVisible ? 1 : 0, filter: heroVisible ? 'blur(0px)' : 'blur(6px)',
                transition: 'opacity 2s ease-in-out, filter 1.8s ease-in-out',
                zIndex: heroVisible ? 30 : 5, pointerEvents: heroVisible ? 'auto' : 'none',
                transform: heroEntrance ? 'scale(1)' : 'scale(0.95)',
            }}>
                {/* CSS particle dots */}
                {_particles.map((p, i) => (
                    <div key={i} style={{
                        position: 'absolute', left: `${p.x}%`, top: `${p.y}%`,
                        width: p.s, height: p.s, borderRadius: '50%',
                        background: i % 5 === 0 ? '#FF6B6B' : '#6C63FF',
                        opacity: heroEntrance ? p.o : 0, transition: `opacity 1.5s ease ${i * 0.03}s`,
                        animation: heroEntrance ? `particleFloat ${p.d}s ease-in-out ${p.dl}s infinite` : 'none',
                        pointerEvents: 'none', zIndex: 0,
                    }} />
                ))}

                {/* Mobile */}
                <div className="flex flex-col h-screen md:hidden" style={entranceStyle(heroEntrance)}>
                    <div className="h-[35vh] flex items-center justify-center relative">
                        <img src={heroImg} alt="hero" className="absolute top-0 object-cover rounded-lg"
                            style={{ width: getVideoWidthforMobile(), animation: 'heroFloat 4s ease-in-out infinite' }} />
                    </div>
                    <div className="h-[50vh] flex flex-col items-center justify-center text-center px-6">
                        <HeroContent {...heroProps} mobile />
                    </div>
                    <div className="h-[15vh] flex items-center justify-center" />
                </div>

                {/* Desktop */}
                <div className="hidden md:flex md:flex-col h-full" style={entranceStyle(heroEntrance)}>
                    <h1 className="text-2xl font-semibold text-white ml-4 mt-4">HevolveAI</h1>
                    <div className="relative h-full flex items-center justify-center flex-col text-center">
                        <div className="w-full mb-16 md:mb-24 lg:mb-48">
                            <HeroContent {...heroProps} mobile={false} />
                        </div>
                        <img src={heroImg} alt="hero" className="absolute bottom-20 md:bottom-32 lg:bottom-44 right-5 object-cover rounded-lg"
                            style={{ width: getVideoWidthforMobile(), animation: 'heroFloat 4s ease-in-out infinite' }} />
                    </div>
                </div>

                <style>{`
                    @keyframes heroFloat { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-8px) } }
                    @keyframes heroBtnPulse {
                        0%, 100% { box-shadow: 0 4px 20px rgba(108,99,255,0.35) }
                        50% { box-shadow: 0 4px 36px rgba(108,99,255,0.6), 0 0 60px rgba(108,99,255,0.15) }
                    }
                    @keyframes particleFloat {
                        0%, 100% { transform: translateY(0) scale(1) }
                        33% { transform: translateY(-8px) scale(1.15) }
                        66% { transform: translateY(4px) scale(0.9) }
                    }
                `}</style>
            </section>

            {/* Demo section — blurs in while hero blurs out */}
            <div id="demo-section" className="absolute inset-0" style={{
                backgroundColor: "black",
                opacity: heroVisible ? 0 : 1, filter: heroVisible ? 'blur(4px)' : 'blur(0px)',
                transition: 'opacity 2s ease-in-out, filter 1.8s ease-in-out 0.3s',
                zIndex: 20, pointerEvents: heroVisible ? 'none' : 'auto',
            }}>
                <Demopage agentData={agentData} onReady={() => setDemoReady(true)} />
            </div>
        </div>
    );
};

export default AgentPage;
