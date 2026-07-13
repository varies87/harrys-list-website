import dynamic from "next/dynamic";
import Head from "next/head";
import { useEffect, useRef, useState } from "react";
import { supabaseAuth } from "../shared";

const API_BASE_URL = "https://harrys-list-backend.vercel.app/api";

// CustomerApp runs entirely client-side (auth, Stripe, etc.)
const CustomerApp = dynamic(() => import("../CustomerApp"), { ssr: false });

export default function HomePage({ contractors }) {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let cancelled = false;
    supabaseAuth.auth.getSession().then(({ data }) => {
      if (!cancelled) setSignedIn(!!data?.session);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || window.location.hash !== "#directory") return;
    const scrollToDir = () =>
      document.getElementById("directory")?.scrollIntoView({ behavior: "auto" });
    const t1 = setTimeout(scrollToDir, 150);
    const t2 = setTimeout(scrollToDir, 600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <>
      <Head>
        <title>Harry's List — DFW Trade Directory</title>
        <meta name="description" content="Harry's List is the DFW trade directory where no contractor paid to be listed. Find trusted roofers, landscapers, HVAC, plumbers, electricians, and more in Dallas-Fort Worth." />
        <meta property="og:title" content="Harry's List — DFW Trade Directory" />
        <meta property="og:description" content="No pay-per-lead. Ever. Find trusted home service contractors in Dallas-Fort Worth." />
        <meta property="og:url" content="https://harryslistdfw.com" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Harry's List" />
        <meta property="og:image" content="https://harryslistdfw.com/og-image.png" />
        <meta property="og:image:width" content="1254" />
        <meta property="og:image:height" content="1254" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Harry's List — DFW Trade Directory" />
        <meta name="twitter:description" content="No pay-per-lead. Ever. Find trusted home service contractors in Dallas-Fort Worth." />
        <meta name="twitter:image" content="https://harryslistdfw.com/og-image.png" />
        <link rel="canonical" href="https://harryslistdfw.com" />
      </Head>

      {/* SSR content for Google -- hidden visually, real HTML for crawlers */}
      <div style={{ display: "none" }} aria-hidden="true">
        <p>Find trusted home service contractors in Dallas-Fort Worth. No contractor paid to be listed here.</p>
        {contractors.map((c) => (
          <div key={c.id}>
            <h2>{c.business_name}</h2>
            <p>{c.trade} · {c.bio}</p>
            <a href={`/c/${c.slug || c.id}`}>{c.business_name} profile</a>
          </div>
        ))}
      </div>

      {!signedIn && <LandingHero contractorCount={contractors.length} />}

      <div id="directory">
        <CustomerApp />
      </div>
    </>
  );
}

/**
 * Reveal -- fades + rises a section in once it scrolls into view. A single
 * small IntersectionObserver hook rather than a heavier animation library;
 * respects prefers-reduced-motion by just rendering visible immediately.
 */
function Reveal({ children, delay = 0, className = "" }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`hl-reveal ${visible ? "is-visible" : ""} ${className}`}
      style={{ transitionDelay: visible ? `${delay}ms` : "0ms" }}
    >
      {children}
    </div>
  );
}

function LandingHero({ contractorCount }) {
  const scrollToDirectory = (e) => {
    e.preventDefault();
    // CustomerApp mounts client-side only (dynamic import, ssr: false) and
    // does its own async session check before the form even renders -- so
    // #signup-form may not exist in the DOM yet at the instant this is
    // clicked. Retry a few times over ~1.2s (matching the pattern already
    // used for the #directory hash-scroll below) rather than landing on
    // just the top of the section, where the actual form fields could be
    // scrolled out of view below the trust panel and heading.
    let attempts = 0;
    const tryScroll = () => {
      attempts += 1;
      const form = document.getElementById("signup-form");
      if (form) {
        form.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (attempts < 6) {
        setTimeout(tryScroll, 200);
      } else {
        // Give up waiting for the form specifically -- still get them close.
        document.getElementById("directory")?.scrollIntoView({ behavior: "smooth" });
      }
    };
    tryScroll();
  };

  return (
    <div className="hl-landing">
      <style>{LANDING_STYLES}</style>

      <section className="hl-hero">
        {/* Signature background moment -- a large, faint line-drawn roofline
            silhouette (this is a trade directory; a house is the one image
            everyone in the audience recognizes instantly) plus two slow,
            softly drifting glow orbs in colors already in the palette. Low
            opacity throughout so it reads as atmosphere, not decoration
            competing with the text. */}
        <svg className="hl-roofline" viewBox="0 0 1200 300" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0,300 L0,180 L180,60 L340,180 L420,110 L560,180 L560,300 M620,300 L620,150 L780,40 L980,150 L980,300 M1040,300 L1040,190 L1120,130 L1200,190 L1200,300" />
        </svg>
        <div className="hl-glow hl-glow-gold" aria-hidden="true" />
        <div className="hl-glow hl-glow-clay" aria-hidden="true" />

        <a href="/contractors" className="hl-corner-link">I&rsquo;m a contractor →</a>
        <div className="hl-hero-inner">
          <div className="hl-wordmark hl-anim" style={{ animationDelay: "0ms" }}>
            <span className="hl-wordmark-name">Harry&rsquo;s List</span>
            <span className="hl-wordmark-tag">DFW Trade Directory</span>
          </div>
          <h1 className="hl-h1 hl-anim" style={{ animationDelay: "90ms" }}>
            No pay-per-lead.<br />Ever.
          </h1>
          <p className="hl-sub hl-anim" style={{ animationDelay: "190ms" }}>
            Real contractors, real reviews. Request quotes free — always.
          </p>
          <div className="hl-cta-row hl-anim" style={{ animationDelay: "290ms" }}>
            <a href="#directory" className="hl-btn hl-btn-primary hl-btn-lg" onClick={scrollToDirectory}>
              Create a free account →
            </a>
          </div>
          {contractorCount >= 10 && (
            <p className="hl-hero-note hl-anim" style={{ animationDelay: "370ms" }}>{contractorCount} local contractor{contractorCount === 1 ? "" : "s"} listed right now.</p>
          )}
        </div>
      </section>

      <section className="hl-section">
        <Reveal><h2 className="hl-h2">For homeowners</h2></Reveal>
        <div className="hl-steps">
          <Reveal delay={0}>
            <div className="hl-step">
              <div className="hl-step-num">1</div>
              <div>
                <div className="hl-step-title">Browse and request quotes</div>
                <p className="hl-step-body">Free, always. No account needed to browse.</p>
              </div>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <div className="hl-step">
              <div className="hl-step-num">2</div>
              <div>
                <div className="hl-step-title">Compare responses, pick who you like</div>
                <p className="hl-step-body">Your contact info stays private until you accept.</p>
              </div>
            </div>
          </Reveal>
          <Reveal delay={200}>
            <div className="hl-step">
              <div className="hl-step-num">3</div>
              <div>
                <div className="hl-step-title">Confirm when the work is done</div>
                <p className="hl-step-body">You confirm, not them. You pay your contractor directly, like normal.</p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}

const LANDING_STYLES = `
.hl-landing {
  --hl-bg: #FBF7F0;
  --hl-surface: #FFFFFF;
  --hl-ink: #1C2B22;
  --hl-ink-soft: #3D4F42;
  --hl-clay: #C1622A;
  --hl-clay-dark: #A8511F;
  --hl-clay-tint: #FBE9DD;
  --hl-gold: #E8A33D;
  --hl-sand-line: #EDE3D2;
  --hl-serif: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, "Times New Roman", serif;
  --hl-sans: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Helvetica, Arial, sans-serif;
  font-family: var(--hl-sans);
  color: var(--hl-ink);
  background: var(--hl-bg);
}

@keyframes hl-fade-up {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes hl-drift-a {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50%      { transform: translate(24px, -18px) scale(1.06); }
}
@keyframes hl-drift-b {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50%      { transform: translate(-20px, 16px) scale(1.08); }
}

.hl-anim { opacity: 0; animation: hl-fade-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) both; }

.hl-reveal { opacity: 0; transform: translateY(18px); transition: opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1), transform 0.6s cubic-bezier(0.16, 1, 0.3, 1); }
.hl-reveal.is-visible { opacity: 1; transform: translateY(0); }

@media (prefers-reduced-motion: reduce) {
  .hl-anim { animation: none; opacity: 1; }
  .hl-reveal { opacity: 1; transform: none; transition: none; }
  .hl-glow { animation: none !important; }
}

.hl-hero {
  background: var(--hl-ink);
  background-image: linear-gradient(165deg, #20342a 0%, var(--hl-ink) 60%);
  color: var(--hl-bg);
  padding: 80px 24px 68px;
  position: relative;
  overflow: hidden;
}

/* Signature background: a faint line-drawn roofline, anchored to the bottom
   of the hero like a skyline, plus two soft ambient glows that drift slowly.
   Everything here uses colors already in the palette -- gold and clay --
   just at very low opacity, so it reads as depth and warmth rather than
   new decoration. */
.hl-roofline {
  position: absolute; left: 0; right: 0; bottom: -6px; width: 100%; height: 220px;
  fill: none; stroke: var(--hl-gold); stroke-width: 1.5; opacity: 0.16;
  pointer-events: none;
}
.hl-glow {
  position: absolute; border-radius: 50%; filter: blur(60px); pointer-events: none;
}
.hl-glow-gold { width: 320px; height: 320px; top: -80px; right: -60px; background: var(--hl-gold); opacity: 0.16; animation: hl-drift-a 14s ease-in-out infinite; }
.hl-glow-clay { width: 280px; height: 280px; bottom: -100px; left: -60px; background: var(--hl-clay); opacity: 0.14; animation: hl-drift-b 16s ease-in-out infinite; }

.hl-corner-link {
  position: absolute; top: 20px; right: 24px; z-index: 2;
  font-size: 12.5px; font-weight: 600; color: rgba(255,255,255,0.55); text-decoration: none;
  padding: 6px 10px; border-radius: 6px; transition: color 0.15s ease, background 0.15s ease;
}
.hl-corner-link:hover { color: #FDFBF6; background: rgba(255,255,255,0.08); }
.hl-hero-inner { max-width: 720px; margin: 0 auto; text-align: center; position: relative; z-index: 1; }
.hl-eyebrow {
  display: inline-block;
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--hl-gold);
  margin-bottom: 14px;
}
.hl-wordmark {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 26px;
}
.hl-wordmark-name {
  font-family: var(--hl-serif, "Iowan Old Style", "Palatino Linotype", Georgia, serif);
  font-size: 30px;
  font-weight: 600;
  color: #FDFBF6;
  line-height: 1;
}
.hl-wordmark-tag {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--hl-gold);
  margin-top: 7px;
}
.hl-h1 {
  font-family: var(--hl-serif);
  font-size: clamp(40px, 8vw, 76px);
  line-height: 1.02;
  letter-spacing: -0.01em;
  font-weight: 600;
  margin: 0 0 20px;
  color: #FDFBF6;
}
.hl-sub {
  font-size: 17px;
  line-height: 1.6;
  color: #D9E2DB;
  max-width: 560px;
  margin: 0 auto 30px;
}
.hl-cta-row { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
.hl-btn {
  display: inline-block;
  padding: 12px 22px;
  border-radius: 8px;
  font-weight: 700;
  font-size: 15px;
  text-decoration: none;
  transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}
.hl-btn-lg { padding: 16px 32px; font-size: 17px; border-radius: 10px; }
.hl-btn-primary { background: var(--hl-clay); color: #fff; box-shadow: 0 4px 18px rgba(193,98,42,0.0); }
.hl-btn-primary:hover { background: var(--hl-clay-dark); transform: translateY(-2px); box-shadow: 0 8px 22px rgba(193,98,42,0.35); }
.hl-btn-secondary { background: rgba(255,255,255,0.08); color: #FDFBF6; border: 1.5px solid rgba(255,255,255,0.35); }
.hl-btn-secondary:hover { background: rgba(255,255,255,0.14); transform: translateY(-1px); }
.hl-hero-note { margin-top: 22px; font-size: 13px; color: #B8C4BB; }
.hl-section { max-width: 900px; margin: 0 auto; padding: 64px 24px; }
.hl-h2 {
  font-family: var(--hl-serif);
  font-size: 26px;
  font-weight: 600;
  margin: 0 0 32px;
  color: var(--hl-ink);
}
.hl-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 28px; }
.hl-step { display: flex; gap: 14px; align-items: flex-start; }
.hl-step-num {
  width: 30px; height: 30px; border-radius: 8px;
  background: var(--hl-clay); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 14px; flex-shrink: 0;
}
.hl-step-title { font-weight: 700; color: var(--hl-ink); margin-bottom: 4px; font-size: 15px; }
.hl-step-body { font-size: 13.5px; color: var(--hl-ink-soft); line-height: 1.55; margin: 0; }
.hl-step-body + .hl-step-body { margin-top: 6px; }
.hl-step-note { font-style: italic; }
@media (max-width: 760px) {
  .hl-steps { grid-template-columns: 1fr; gap: 24px; }
  .hl-hero { padding: 56px 20px 48px; }
  .hl-corner-link { top: 14px; right: 16px; font-size: 11.5px; padding: 5px 8px; }
  .hl-h1 { font-size: clamp(34px, 11vw, 48px); }
}
`;

export async function getServerSideProps() {
  try {
    const res = await fetch(`${API_BASE_URL}/contractors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list" }),
    });
    const data = await res.json();
    const contractors = (data.contractors || []).map((c) => ({
      id: c.id,
      business_name: c.businessName,
      trade: c.trade,
      bio: c.bio || "",
      slug: c.slug || null,
    }));
    return { props: { contractors } };
  } catch {
    return { props: { contractors: [] } };
  }
}
