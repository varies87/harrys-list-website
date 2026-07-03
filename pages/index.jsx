import dynamic from "next/dynamic";
import Head from "next/head";

const API_BASE_URL = "https://harrys-list-backend.vercel.app/api";

// CustomerApp runs entirely client-side (auth, Stripe, etc.)
const CustomerApp = dynamic(() => import("../CustomerApp"), { ssr: false });

export default function HomePage({ contractors }) {
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
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
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

      <LandingHero contractorCount={contractors.length} />

      {/* Full React app mounts here */}
      <div id="directory">
        <CustomerApp />
      </div>
    </>
  );
}

/**
 * Visible marketing section shown to every first-time visitor before the app
 * UI. Previously the homepage dropped straight into the app shell -- for a
 * brand-new site with few or no contractors listed yet, that meant visitors
 * (including ad clicks) landed on what looked like an empty page or a bare
 * sign-up form with no explanation of what Harry's List is or why either
 * side (homeowner or contractor) should care.
 */
function LandingHero({ contractorCount }) {
  const scrollToDirectory = (e) => {
    e.preventDefault();
    document.getElementById("directory")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="hl-landing">
      <style>{LANDING_STYLES}</style>

      <section className="hl-hero">
        <div className="hl-hero-inner">
          <span className="hl-eyebrow">Dallas &ndash; Fort Worth</span>
          <h1 className="hl-h1">The DFW trade directory built around a simple idea: no pay-per-lead, ever.</h1>
          <p className="hl-sub">
            Homeowners request quotes for free, always. Contractors get listed for free and only pay a
            small fee after a job is actually done &mdash; confirmed by the homeowner, not claimed by the contractor.
          </p>
          <div className="hl-cta-row">
            <a href="#directory" className="hl-btn hl-btn-primary" onClick={scrollToDirectory}>
              Find a contractor →
            </a>
            <a href="/contractors" className="hl-btn hl-btn-secondary">
              I&rsquo;m a contractor →
            </a>
          </div>
          {contractorCount > 0 && (
            <p className="hl-hero-note">{contractorCount} local contractor{contractorCount === 1 ? "" : "s"} listed right now.</p>
          )}
        </div>
      </section>

      <section className="hl-section">
        <h2 className="hl-h2">For homeowners</h2>
        <div className="hl-steps">
          <div className="hl-step">
            <div className="hl-step-num">1</div>
            <div>
              <div className="hl-step-title">Browse and request quotes</div>
              <p className="hl-step-body">Search by trade and zip code, then send a free quote request to any contractor &mdash; no account needed to browse.</p>
            </div>
          </div>
          <div className="hl-step">
            <div className="hl-step-num">2</div>
            <div>
              <div className="hl-step-title">Compare responses, pick who you like</div>
              <p className="hl-step-body">Contractors respond with an estimate or ask to visit in person. Your contact info stays private until you accept.</p>
            </div>
          </div>
          <div className="hl-step">
            <div className="hl-step-num">3</div>
            <div>
              <div className="hl-step-title">Confirm when the work is done</div>
              <p className="hl-step-body">You &mdash; not the contractor &mdash; confirm the job is complete. That's what triggers their fee, so there's no incentive to rush or cut corners.</p>
            </div>
          </div>
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
  --hl-sand-line: #EDE3D2;
  --hl-serif: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, "Times New Roman", serif;
  --hl-sans: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Helvetica, Arial, sans-serif;
  font-family: var(--hl-sans);
  color: var(--hl-ink);
  background: var(--hl-bg);
}
.hl-hero {
  background: var(--hl-ink);
  background-image: linear-gradient(165deg, #20342a 0%, var(--hl-ink) 60%);
  color: var(--hl-bg);
  padding: 64px 24px 56px;
}
.hl-hero-inner { max-width: 720px; margin: 0 auto; text-align: center; }
.hl-eyebrow {
  display: inline-block;
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #E8A33D;
  margin-bottom: 14px;
}
.hl-h1 {
  font-family: var(--hl-serif);
  font-size: clamp(28px, 4.5vw, 42px);
  line-height: 1.2;
  font-weight: 600;
  margin: 0 0 16px;
  color: #FDFBF6;
}
.hl-sub {
  font-size: 16.5px;
  line-height: 1.6;
  color: #D9E2DB;
  max-width: 560px;
  margin: 0 auto 28px;
}
.hl-cta-row { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
.hl-btn {
  display: inline-block;
  padding: 12px 22px;
  border-radius: 8px;
  font-weight: 700;
  font-size: 15px;
  text-decoration: none;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.hl-btn-primary { background: var(--hl-clay); color: #fff; }
.hl-btn-primary:hover { background: var(--hl-clay-dark); transform: translateY(-1px); }
.hl-btn-secondary { background: rgba(255,255,255,0.08); color: #FDFBF6; border: 1.5px solid rgba(255,255,255,0.35); }
.hl-btn-secondary:hover { background: rgba(255,255,255,0.14); transform: translateY(-1px); }
.hl-hero-note { margin-top: 20px; font-size: 13px; color: #B8C4BB; }
.hl-section { max-width: 900px; margin: 0 auto; padding: 56px 24px; }
.hl-h2 {
  font-family: var(--hl-serif);
  font-size: 24px;
  font-weight: 600;
  margin: 0 0 28px;
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
@media (max-width: 760px) {
  .hl-steps { grid-template-columns: 1fr; gap: 24px; }
  .hl-hero { padding: 48px 20px 40px; }
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
