import Head from "next/head";
import {
  API_BASE_URL,
  tradeNameFromSlug,
  cityNameFromSlug,
  tradeSlug,
  citySlug,
  contractorCoversCity,
  contractorIsSuspended,
  normalizeContractor,
  describeServiceArea,
} from "../../shared";

/**
 * Programmatic SEO landing page at /<trade-slug>/<city-slug>, e.g.
 * /fencing/dallas or /pressure-washing/plano. This targets the actual
 * long-tail searches homeowners type ("fence repair dallas tx") that the
 * homepage and individual contractor profiles don't rank for on their own.
 *
 * Each page is genuinely unique content -- a real, current, filtered list of
 * contractors who both do this trade AND cover this city -- not a templated
 * shell. Pages with zero matching contractors are marked noindex (see below)
 * rather than published as thin/empty content, since an indexed empty page
 * does more harm than good.
 */
export default function TradeCityPage({ trade, city, contractors, notFoundCombo }) {
  if (notFoundCombo) {
    return (
      <>
        <Head><title>Page not found — Harry's List</title></Head>
        <div style={{ padding: 40, textAlign: "center", fontFamily: "sans-serif" }}>
          <h1>Page not found</h1>
          <a href="/">← Back to Harry's List</a>
        </div>
      </>
    );
  }

  const count = contractors.length;
  const pageUrl = `https://harryslistdfw.com/${tradeSlug(trade)}/${citySlug(city)}`;
  const title = `${trade} Contractors in ${city}, TX — Harry's List`;
  const description =
    count > 0
      ? `${count} ${trade.toLowerCase()} contractor${count === 1 ? "" : "s"} serving ${city}, TX on Harry's List. No pay-per-lead -- browse verified reviews and request a free quote.`
      : `Find ${trade.toLowerCase()} contractors serving ${city}, TX on Harry's List, the DFW trade directory with no pay-per-lead.`;

  const allRatings = contractors.flatMap((c) => (c.reviews || []).map((r) => r.rating));
  const avgRating =
    allRatings.length > 0 ? allRatings.reduce((s, r) => s + r, 0) / allRatings.length : null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": `${trade} contractors in ${city}, TX`,
    "itemListElement": contractors.map((c, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "url": `https://harryslistdfw.com/c/${c.slug || c.id}`,
      "name": c.business_name,
    })),
  };

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={pageUrl} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Harry's List" />
        <meta property="og:image" content="https://harryslistdfw.com/og-image.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <link rel="canonical" href={pageUrl} />
        {count === 0 && <meta name="robots" content="noindex, follow" />}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd)
              .replace(/</g, "\\u003c")
              .replace(/>/g, "\\u003e")
              .replace(/&/g, "\\u0026"),
          }}
        />
      </Head>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 24px 80px", fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif", color: "#1C2B22" }}>
        <a href="/" style={{ fontSize: 14, color: "#6B5840", textDecoration: "none" }}>← Harry's List</a>

        <h1 style={{ fontFamily: "'Iowan Old Style', Georgia, serif", fontSize: 30, margin: "16px 0 8px" }}>
          {trade} Contractors in {city}, TX
        </h1>
        <p style={{ color: "#3D4F42", fontSize: 15, lineHeight: 1.6, marginBottom: 28 }}>
          {count > 0
            ? `${count} ${trade.toLowerCase()} contractor${count === 1 ? "" : "s"} on Harry's List currently ${count === 1 ? "serves" : "serve"} ${city}. No pay-per-lead, ever -- contractors only pay a small fee after a homeowner confirms a completed job.`
            : `Harry's List doesn't have a ${trade.toLowerCase()} contractor listed for ${city} yet -- we're adding contractors across DFW regularly. Browse the full directory below or check nearby cities.`}
        </p>

        {count > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 32 }}>
            {contractors.map((c) => {
              const avg =
                (c.reviews || []).length > 0
                  ? c.reviews.reduce((s, r) => s + r.rating, 0) / c.reviews.length
                  : null;
              return (
                <a
                  key={c.id}
                  href={`/c/${c.slug || c.id}`}
                  style={{
                    display: "block", border: "1px solid #EDE3D2", borderRadius: 12,
                    padding: "16px 18px", textDecoration: "none", color: "inherit",
                  }}
                >
                  <div style={{ fontFamily: "'Iowan Old Style', Georgia, serif", fontWeight: 700, fontSize: 17 }}>
                    {c.business_name}
                  </div>
                  <div style={{ fontSize: 12, color: "#C1622A", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", margin: "4px 0" }}>
                    {c.trade}
                  </div>
                  <p style={{ fontSize: 13.5, color: "#3D4F42", margin: "6px 0" }}>{c.bio}</p>
                  <div style={{ fontSize: 12.5, color: "#8A7A65" }}>
                    {avg ? `★ ${avg.toFixed(1)} (${c.reviews.length} review${c.reviews.length === 1 ? "" : "s"})` : "No verified reviews yet"}
                    {" · "}
                    {describeServiceArea(c.serviceArea)}
                  </div>
                </a>
              );
            })}
          </div>
        )}

        <a
          href="/#directory"
          style={{
            display: "inline-block", background: "#C1622A", color: "#FFF8EE",
            padding: "12px 22px", borderRadius: 8, fontWeight: 600, fontSize: 14,
            textDecoration: "none",
          }}
        >
          Browse the full DFW directory →
        </a>
      </div>
    </>
  );
}

export async function getServerSideProps({ params }) {
  const trade = tradeNameFromSlug(params.trade);
  const city = cityNameFromSlug(params.city);

  if (!trade || !city) {
    return { props: { notFoundCombo: true, trade: null, city: null, contractors: [] } };
  }

  try {
    const res = await fetch(`${API_BASE_URL}/contractors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list" }),
    });
    const data = await res.json();
    const all = (data.contractors || []).map(normalizeContractor);

    const matching = all
      .filter((c) => c.trade === trade)
      .filter((c) => c.status === "approved" || c.status === "pending_review")
      .filter((c) => !contractorIsSuspended(c))
      .filter((c) => contractorCoversCity(c, city))
      .map((c) => ({
        id: c.id,
        slug: c.slug || null,
        business_name: c.businessName,
        trade: c.trade,
        bio: c.bio || "",
        serviceArea: c.serviceArea,
        reviews: c.reviews || [],
      }));

    return { props: { trade, city, contractors: matching, notFoundCombo: false } };
  } catch {
    return { props: { trade, city, contractors: [], notFoundCombo: false } };
  }
}
