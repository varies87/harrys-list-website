import dynamic from "next/dynamic";
import Head from "next/head";
import { useEffect } from "react";
import { supabaseAuth } from "../shared";

const ContractorApp = dynamic(() => import("../CustomerApp").then((mod) => mod.ContractorApp), { ssr: false });

export default function ContractorsPage() {
  // Same fix as the homepage: don't make an already signed-in contractor
  // scroll past the pitch again on every visit.
  useEffect(() => {
    let cancelled = false;
    supabaseAuth.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data?.session) {
        document.getElementById("portal")?.scrollIntoView({ behavior: "auto" });
      }
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
        {/* This page is landed on directly from contractor-targeted ads, unlike
            most app-shell pages, so it's worth letting it be indexed/shared
            rather than blocking it -- it now has real content, not just a
            bare login form. */}
      </Head>

      <ContractorHero />

      <div id="portal">
        <ContractorApp />
      </div>
    </>
  );
}

/**
 * Visible marketing pitch shown above the contractor sign-up/login app.
 * The contractor-targeted ad sends people directly to this page (skipping
 * the homepage entirely), so previously they landed straight on a bare
 * login form with zero explanation of what Harry's List is or why they'd
 * want to join -- the same gap that existed on the homeowner homepage.
 */
function ContractorHero() {
  const scrollToPortal = (e) => {
    e.preventDefault();
    document.getElementById("portal")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="cl-landing">
      <style>{CONTRACTOR_LANDING_STYLES}</style>

      <section className="cl-hero">
        <div className="cl-hero-inner">
          <span className="cl-eyebrow">Dallas &ndash; Fort Worth</span>
          <h1 className="cl-h1">Get found by DFW homeowners. List free. Pay only when a job is done.</h1>
          <p className="cl-sub">
            No monthly fee, no per-lead charge, no bidding against other contractors just to show up.
            A small percentage fee applies only after a homeowner confirms your work is complete.
          </p>
          <div className="cl-cta-row">
            <a href="#portal" className="cl-btn cl-btn-primary" onClick={scrollToPortal}>
              Create your free listing →
            </a>
            <a href="/" className="cl-btn cl-btn-secondary">
              Looking to hire someone instead? →
            </a>
          </div>
        </div>
      </section>

      <section className="cl-section">
        <h2 className="cl-h2">How it works</h2>
        <div className="cl-steps">
          <div className="cl-step">
            <div className="cl-step-num">1</div>
            <div>
              <div className="cl-step-title">List your business for free</div>
              <p className="cl-step-body">Add your trade, service area, and portfolio photos. No cost to get listed or stay listed.</p>
            </div>
          </div>
          <div className="cl-step">
            <div className="cl-step-num">2</div>
            <div>
              <div className="cl-step-title">Respond to real quote requests</div>
              <p className="cl-step-body">DFW homeowners searching your trade send requests directly to you &mdash; no bidding against a dozen other contractors for the same lead.</p>
            </div>
          </div>
          <div className="cl-step">
            <div className="cl-step-num">3</div>
            <div>
              <div className="cl-step-title">Only pay after you're paid</div>
              <p className="cl-step-body">A small percentage fee applies only once the homeowner confirms the job is complete &mdash; never upfront, never for a lead that goes nowhere.</p>
              <p className="cl-step-body cl-step-note">You collect payment from the homeowner directly, however you normally invoice. Harry's List only charges its fee, automatically, after they confirm.</p>
            </div>
          </div>
        </div>
        <a href="#portal" className="cl-btn cl-btn-primary cl-cta-bottom" onClick={scrollToPortal}>
          Create your free listing →
        </a>
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
  --cl-sand-line: #EDE3D2;
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
  padding: 64px 24px 56px;
}
.cl-hero-inner { max-width: 720px; margin: 0 auto; text-align: center; }
.cl-eyebrow {
  display: inline-block;
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #E8A33D;
  margin-bottom: 14px;
}
.cl-h1 {
  font-family: var(--cl-serif);
  font-size: clamp(26px, 4.2vw, 38px);
  line-height: 1.22;
  font-weight: 600;
  margin: 0 0 16px;
  color: #FDFBF6;
}
.cl-sub {
  font-size: 16px;
  line-height: 1.6;
  color: #D9E2DB;
  max-width: 560px;
  margin: 0 auto 28px;
}
.cl-cta-row { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
.cl-btn {
  display: inline-block;
  padding: 12px 22px;
  border-radius: 8px;
  font-weight: 700;
  font-size: 15px;
  text-decoration: none;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.cl-btn-primary { background: var(--cl-clay); color: #fff; }
.cl-btn-primary:hover { background: var(--cl-clay-dark); transform: translateY(-1px); }
.cl-btn-secondary { background: rgba(255,255,255,0.08); color: #FDFBF6; border: 1.5px solid rgba(255,255,255,0.35); }
.cl-btn-secondary:hover { background: rgba(255,255,255,0.14); transform: translateY(-1px); }
.cl-section { max-width: 900px; margin: 0 auto; padding: 56px 24px; }
.cl-h2 {
  font-family: var(--cl-serif);
  font-size: 24px;
  font-weight: 600;
  margin: 0 0 28px;
  color: var(--cl-ink);
}
.cl-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 28px; }
.cl-step { display: flex; gap: 14px; align-items: flex-start; }
.cl-step-num {
  width: 30px; height: 30px; border-radius: 8px;
  background: var(--cl-clay); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 14px; flex-shrink: 0;
}
.cl-step-title { font-weight: 700; color: var(--cl-ink); margin-bottom: 4px; font-size: 15px; }
.cl-step-body { font-size: 13.5px; color: var(--cl-ink-soft); line-height: 1.55; margin: 0; }
.cl-step-body + .cl-step-body { margin-top: 6px; }
.cl-step-note { font-style: italic; }
.cl-cta-bottom { display: block; width: fit-content; margin: 36px auto 0; }
@media (max-width: 760px) {
  .cl-steps { grid-template-columns: 1fr; gap: 24px; }
  .cl-hero { padding: 48px 20px 40px; }
}
`;
