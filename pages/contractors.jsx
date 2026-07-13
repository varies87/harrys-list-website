import dynamic from "next/dynamic";
import Head from "next/head";
import { useEffect, useState } from "react";
import { supabaseAuth, apiCall, feeOwedForAmount } from "../shared";

const ContractorApp = dynamic(() => import("../CustomerApp").then((mod) => mod.ContractorApp), { ssr: false });

export default function ContractorsPage() {
  // A signed-in contractor should land on their dashboard, not scroll past the
  // acquisition pitch they've already converted on. We render the hero by
  // default (starting false keeps it in the SSR HTML for SEO and shows it
  // instantly for logged-out ad traffic), then unmount it once an existing
  // session is detected -- the app below then fills the screen with the
  // dashboard. No scroll hack, no pitch flashing above a logged-in user.
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let cancelled = false;
    supabaseAuth.auth.getSession().then(({ data }) => {
      if (!cancelled) setSignedIn(!!data?.session);
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <Head>
        <title>List Your Business Free — Harry's List DFW</title>
        <meta
          name="description"
          content="Join Harry's List, the DFW trade directory with no pay-per-lead. List your business for free and only pay a small fee after a homeowner confirms a job is done."
        />
        {/* Open Graph / Twitter so the link preview (texts, social) shows the
            Harry's List card instead of the Vercel default. Mirrors the
            homepage tags but with contractor-facing copy. */}
        <meta property="og:title" content="List your business free — Harry's List DFW" />
        <meta property="og:description" content="No pay-per-lead. Join the DFW trade directory built on verified reviews — only pay a small fee after a homeowner confirms a job is done." />
        <meta property="og:url" content="https://harryslistdfw.com/contractors" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Harry's List" />
        <meta property="og:image" content="https://harryslistdfw.com/og-image.png" />
        <meta property="og:image:width" content="1254" />
        <meta property="og:image:height" content="1254" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="List your business free — Harry's List DFW" />
        <meta name="twitter:description" content="No pay-per-lead. Join the DFW trade directory built on verified reviews." />
        <meta name="twitter:image" content="https://harryslistdfw.com/og-image.png" />
        {/* This page is landed on directly from contractor-targeted ads, unlike
            most app-shell pages, so it's worth letting it be indexed/shared
            rather than blocking it -- it now has real content, not just a
            bare login form. */}
      </Head>

      {!signedIn && <ContractorHero />}

      <div id="portal">
        <ContractorApp />
      </div>
    </>
  );
}


/**
 * Visible contractor landing pitch shown above the sign-up/login app.
 * Contractor-targeted ads send people straight here (skipping the homepage),
 * so this leads with the fee model — the single most persuasive, concrete
 * thing about the product — then walks through the run-the-job tooling.
 * Framed for a pre-liquidity marketplace: it describes HOW requests work
 * ("when a homeowner wants a quote, it comes to you"), not a promise of lead
 * volume that can't yet be guaranteed.
 */
/**
 * Interactive fee slider -- lets a contractor drag to any job amount and see
 * the exact fee calculated live, using feeOwedForAmount imported directly
 * from shared.js -- the identical bracket math the real backend charges, not
 * a separately hand-copied version that could silently drift out of sync if
 * the brackets ever change. Proves the "you never choose a rate, it's
 * automatic and it blends" point instead of just asserting it in a sentence
 * -- this is the same confusion (a contractor thinking he had to pick one
 * flat rate) that the plain-language copy fix addressed elsewhere; this
 * makes it concrete.
 */
function FeeSlider() {
  const [amount, setAmount] = useState(1500);
  const fee = feeOwedForAmount(amount);
  const keep = amount - fee;
  const rate = amount > 0 ? (fee / amount) * 100 : 0;

  return (
    <div className="cl-fee-slider">
      <div className="cl-fee-slider-label">Try it with your own job size</div>
      <input
        type="range"
        min={100}
        max={15000}
        step={100}
        value={amount}
        onChange={(e) => setAmount(Number(e.target.value))}
        className="cl-fee-slider-input"
        aria-label="Job amount"
      />
      <div className="cl-fee-slider-amount">${amount.toLocaleString()} job</div>
      <div className="cl-fee-slider-result">
        <div className="cl-fee-slider-stat">
          <span className="cl-fee-slider-stat-label">You keep</span>
          <span className="cl-fee-slider-stat-value cl-fee-slider-keep">${keep.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
        </div>
        <div className="cl-fee-slider-stat">
          <span className="cl-fee-slider-stat-label">Platform fee</span>
          <span className="cl-fee-slider-stat-value">${fee.toLocaleString("en-US", { maximumFractionDigits: 2 })} <span className="cl-fee-slider-pct">({rate.toFixed(1)}%)</span></span>
        </div>
      </div>
    </div>
  );
}

function ContractorHero() {
  // Founding-offer gate. We read the live remaining-spots count only to decide
  // whether the founding offer is still open -- we never display the number,
  // because "47 left" reveals how few contractors are on yet and reads as
  // plenty, killing the urgency. When spots run out (or the count can't load)
  // this stays false and the hero renders exactly as the standard fee-led
  // landing page -- so at 50 contractors it reverts automatically, no redeploy.
  const [foundingActive, setFoundingActive] = useState(false);
  useEffect(() => {
    let cancelled = false;
    apiCall("contractors", { action: "foundingStatus" })
      .then((res) => {
        if (!cancelled) setFoundingActive(typeof res?.spotsLeft === "number" && res.spotsLeft > 0);
      })
      .catch(() => {
        if (!cancelled) setFoundingActive(false);
      });
    return () => { cancelled = true; };
  }, []);

  const scrollToPortal = (e) => {
    e.preventDefault();
    document.getElementById("portal")?.scrollIntoView({ behavior: "smooth" });
  };

  const features = [
    {
      icon: "ti-inbox",
      title: "Requests come straight to you",
      body: "When a homeowner in your service area wants a quote, it lands in your inbox — not auctioned off to five contractors bidding against each other for the same lead.",
    },
    {
      icon: "ti-map-pin",
      title: "You pick your service area",
      body: "Choose the exact DFW zip codes you cover, so you only hear from homeowners you can actually serve.",
    },
    {
      icon: "ti-file-invoice",
      title: "Quote and invoice in-app",
      body: "Build itemized quotes and invoices with line items, then send a clean, printable version. The invoice even pre-fills from your original quote.",
    },
    {
      icon: "ti-star",
      title: "Reviews that can't be faked",
      body: "Ratings come only from real, completed jobs — so a strong reputation actually means something, and nobody can buy their way above you in search.",
    },
    {
      icon: "ti-qrcode",
      title: "Bring your own customers too",
      body: "Get a free profile page and a QR code to put on business cards, your truck, or your Instagram — a way to collect reviews from the jobs you already have.",
    },
  ];

  return (
    <div className="cl-landing">
      <style>{CONTRACTOR_LANDING_STYLES}</style>

      <section className="cl-hero">
        <header className="cl-topbar">
          <a href="/" className="cl-wordmark">
            <span className="cl-wordmark-name">Harry's List</span>
            <span className="cl-wordmark-sub">DFW Trade Directory</span>
          </a>
          <a href="/#directory" className="cl-topbar-link">Browse the directory →</a>
        </header>
        <div className="cl-hero-inner">
          {foundingActive && (
            <div className="cl-founding-strip">
              <span className="cl-founding-strip-badge">★ First Fifty</span>
              <span className="cl-founding-strip-text">
                Founding offer: your first completed job's platform fee is on us. First 50 DFW contractors only.
              </span>
            </div>
          )}
          <span className="cl-eyebrow">For DFW contractors</span>
          <h1 className="cl-h1">Keep 96 to 99% of every job.</h1>
          <p className="cl-sub">
            No pay-per-lead. No monthly fee. No cost to list. You pay one small percentage
            only after a homeowner confirms the job is done.
          </p>
          <a href="#portal" className="cl-btn cl-btn-primary cl-btn-lg" onClick={scrollToPortal}>
            List your business free →
          </a>
        </div>
      </section>

      <section className="cl-section">
        <div className="cl-fee-grid">
          <div className="cl-fee-tile">
            <div className="cl-fee-pct">4%</div>
            <div className="cl-fee-label">under $500</div>
          </div>
          <div className="cl-fee-tile">
            <div className="cl-fee-pct">3%</div>
            <div className="cl-fee-label">to $2,500</div>
          </div>
          <div className="cl-fee-tile">
            <div className="cl-fee-pct">2%</div>
            <div className="cl-fee-label">to $10,000</div>
          </div>
          <div className="cl-fee-tile cl-fee-tile-dark">
            <div className="cl-fee-pct">1%</div>
            <div className="cl-fee-label">$10,000+</div>
          </div>
        </div>
        <p className="cl-fee-note">
          The bigger the job, the smaller the cut. A $4,000 job costs you $80 — and only
          after you've been paid for it.
        </p>
        <FeeSlider />
      </section>

      <section className="cl-section">
        <h2 className="cl-h2">Why contractors join</h2>
        <div className="cl-features">
          {features.map((f) => (
            <div className="cl-feature" key={f.title}>
              <div className="cl-feature-icon" aria-hidden="true">
                <i className={`ti ${f.icon}`} />
              </div>
              <div>
                <div className="cl-feature-title">{f.title}</div>
                <p className="cl-feature-body">{f.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="cl-section cl-closer-wrap">
        <div className="cl-closer">
          <div className="cl-closer-title">Free to join. Free to list. Free to quote.</div>
          <p className="cl-closer-sub">You only ever pay after you've been paid for a completed job.</p>
          <a href="#portal" className="cl-btn cl-btn-primary cl-btn-lg" onClick={scrollToPortal}>
            List your business today →
          </a>
        </div>
      </section>
    </div>
  );
}

const CONTRACTOR_LANDING_STYLES = `
.cl-landing {
  --cl-bg: #FBF7F0;
  --cl-surface: #FFFFFF;
  --cl-ink: #1C2B22;
  --cl-ink-soft: #3D4F42;
  --cl-clay: #C1622A;
  --cl-clay-dark: #A8511F;
  --cl-clay-tint: #FBE9DD;
  --cl-clay-text: #993C1D;
  --cl-sand: #F7F1E7;
  --cl-sand-text: #6B5840;
  --cl-sand-line: #EDE3D2;
  --cl-gold: #E8A33D;
  --cl-serif: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, "Times New Roman", serif;
  --cl-sans: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Helvetica, Arial, sans-serif;
  font-family: var(--cl-sans);
  color: var(--cl-ink);
  background: var(--cl-bg);
}
.cl-hero {
  background: var(--cl-ink);
  background-image: linear-gradient(165deg, #20342a 0%, var(--cl-ink) 60%);
  color: var(--cl-bg);
  padding: 20px 24px 64px;
  text-align: center;
}
.cl-topbar {
  display: flex; align-items: center; justify-content: space-between;
  max-width: 1000px; margin: 0 auto 44px; gap: 16px;
}
.cl-wordmark {
  display: inline-flex; flex-direction: column; line-height: 1.1;
  text-decoration: none; gap: 3px;
}
.cl-wordmark-name {
  font-family: var(--cl-serif); font-size: 26px; font-weight: 600;
  letter-spacing: 0.01em; color: #FDFBF6;
}
.cl-wordmark-sub {
  font-size: 10.5px; font-weight: 600; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--cl-gold);
}
.cl-topbar-link {
  font-size: 13px; font-weight: 600; color: rgba(253,251,246,0.62);
  text-decoration: none; padding: 8px 14px; border: 1px solid rgba(255,255,255,0.18);
  border-radius: 8px; white-space: nowrap; transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}
.cl-topbar-link:hover { color: #fff; border-color: rgba(255,255,255,0.45); background: rgba(255,255,255,0.06); }
.cl-hero-inner { max-width: 620px; margin: 0 auto; }
.cl-eyebrow {
  display: inline-block; font-size: 12px; font-weight: 700; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--cl-gold); margin-bottom: 16px;
}
.cl-founding-strip {
  display: flex; gap: 11px; align-items: center; justify-content: center; flex-wrap: wrap;
  background: linear-gradient(135deg, #E8A33D 0%, #C8872A 100%);
  border-radius: 12px; padding: 12px 18px; margin: 0 auto 24px; max-width: 560px;
  box-shadow: 0 3px 14px rgba(232,163,61,0.25);
}
.cl-founding-strip-badge {
  background: rgba(28,43,34,0.85); color: #FBE9C6; font-weight: 700; font-size: 11px;
  letter-spacing: 0.04em; white-space: nowrap; padding: 5px 11px; border-radius: 999px;
}
.cl-founding-strip-text {
  font-size: 14px; font-weight: 600; line-height: 1.4; color: #241704; text-align: left;
}
.cl-h1 {
  font-family: var(--cl-serif); font-size: clamp(30px, 5vw, 42px); line-height: 1.12;
  font-weight: 600; margin: 0 0 16px; color: #FDFBF6;
}
.cl-sub {
  font-size: 16.5px; line-height: 1.6; color: #D9E2DB; max-width: 500px; margin: 0 auto 26px;
}
.cl-btn {
  display: inline-block; padding: 13px 26px; border-radius: 8px; font-weight: 700;
  font-size: 15px; text-decoration: none; transition: transform 0.15s ease, background 0.15s ease;
}
.cl-btn-lg { padding: 16px 34px; font-size: 17px; border-radius: 10px; }
.cl-btn-primary { background: var(--cl-clay); color: #fff; }
.cl-btn-primary:hover { background: var(--cl-clay-dark); transform: translateY(-1px); }
.cl-section { max-width: 720px; margin: 0 auto; padding: 40px 24px 0; }
.cl-fee-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.cl-fee-tile {
  background: var(--cl-sand); border-radius: 12px; padding: 18px 8px; text-align: center;
}
.cl-fee-tile-dark { background: var(--cl-ink); }
.cl-fee-pct { font-size: 28px; font-weight: 700; color: var(--cl-ink); font-family: var(--cl-serif); }
.cl-fee-tile-dark .cl-fee-pct { color: var(--cl-gold); }
.cl-fee-label { font-size: 12px; color: var(--cl-sand-text); margin-top: 4px; }
.cl-fee-tile-dark .cl-fee-label { color: #B8C4BB; }
.cl-fee-note { text-align: center; font-size: 13.5px; color: var(--cl-ink-soft); margin: 14px 0 0; }

.cl-fee-slider {
  margin: 24px auto 0; max-width: 420px; background: var(--cl-sand);
  border: 1px solid var(--cl-sand-line); border-radius: 14px; padding: 20px 22px 18px;
}
.cl-fee-slider-label {
  font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
  color: var(--cl-sand-text); text-align: center; margin-bottom: 12px;
}
.cl-fee-slider-input {
  width: 100%; -webkit-appearance: none; appearance: none; height: 6px; border-radius: 999px;
  background: var(--cl-sand-line); outline: none; margin: 0 0 6px; cursor: pointer;
}
.cl-fee-slider-input::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none; width: 22px; height: 22px; border-radius: 50%;
  background: var(--cl-clay); border: 3px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.25); cursor: pointer;
}
.cl-fee-slider-input::-moz-range-thumb {
  width: 22px; height: 22px; border-radius: 50%; background: var(--cl-clay);
  border: 3px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.25); cursor: pointer;
}
.cl-fee-slider-amount {
  text-align: center; font-family: var(--cl-serif); font-size: 22px; font-weight: 700;
  color: var(--cl-ink); margin-bottom: 14px;
}
.cl-fee-slider-result {
  display: flex; justify-content: center; gap: 28px; padding-top: 14px;
  border-top: 1px solid var(--cl-sand-line);
}
.cl-fee-slider-stat { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.cl-fee-slider-stat-label {
  font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
  color: var(--cl-sand-text);
}
.cl-fee-slider-stat-value { font-size: 19px; font-weight: 700; color: var(--cl-ink); font-family: var(--cl-serif); }
.cl-fee-slider-keep { color: #2C6B3F; }
.cl-fee-slider-pct { font-size: 12px; font-weight: 600; color: var(--cl-sand-text); }
@media (max-width: 480px) {
  .cl-fee-slider-result { gap: 20px; }
}
.cl-h2 {
  font-family: var(--cl-serif); font-size: 24px; font-weight: 600; margin: 0 0 20px; color: var(--cl-ink);
}
.cl-features { display: flex; flex-direction: column; gap: 12px; }
.cl-feature {
  background: var(--cl-surface); border: 1px solid var(--cl-sand-line); border-radius: 14px;
  padding: 18px 20px; display: flex; gap: 16px; align-items: flex-start;
}
.cl-feature-icon {
  width: 40px; height: 40px; border-radius: 10px; background: var(--cl-clay-tint);
  color: var(--cl-clay-text); display: flex; align-items: center; justify-content: center;
  font-size: 21px; flex-shrink: 0;
}
.cl-feature-title { font-weight: 700; font-size: 15.5px; color: var(--cl-ink); margin-bottom: 4px; }
.cl-feature-body { margin: 0; font-size: 14px; color: var(--cl-ink-soft); line-height: 1.55; }
.cl-closer-wrap { padding-bottom: 12px; }
.cl-closer {
  background: var(--cl-ink); border-radius: 16px; padding: 32px 24px; text-align: center;
}
.cl-closer-title { font-family: var(--cl-serif); font-size: 21px; font-weight: 600; color: #FDFBF6; margin-bottom: 6px; }
.cl-closer-sub { font-size: 14px; color: #B8C4BB; margin: 0 0 20px; }
@media (max-width: 620px) {
  .cl-fee-grid { grid-template-columns: repeat(2, 1fr); }
  .cl-hero { padding: 16px 20px 48px; }
  .cl-topbar { margin-bottom: 36px; }
  .cl-topbar-link { padding: 7px 12px; font-size: 12.5px; }
  .cl-feature { padding: 16px; }
}
`;
