import dynamic from "next/dynamic";
import Head from "next/head";
import { tradeSlug, citySlug, normalizeContractor, primaryCityForServiceArea } from "../../shared";

const API_BASE_URL = "https://harrys-list-backend.vercel.app/api";

// Escapes JSON for safe embedding inside a <script> tag. Without this, a
// contractor's business_name/bio/trade could break out of the JSON-LD block
// and inject markup or script into every visitor's page (stored XSS, H-3).
function safeJsonLdStringify(obj) {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

const ContractorPublicProfile = dynamic(
  () => import("../../CustomerApp").then((mod) => mod.ContractorPublicProfile),
  { ssr: false }
);

export default function ContractorProfilePage({ contractor }) {
  if (!contractor) {
    return (
      <>
        <Head><title>Contractor not found — Harry's List</title></Head>
        <div style={{ padding: 40, textAlign: "center", fontFamily: "sans-serif" }}>
          <h1>Contractor not found</h1>
          <a href="/">← Back to directory</a>
        </div>
      </>
    );
  }

  const profileUrl = `https://harryslistdfw.com/c/${contractor.slug || contractor.id}`;

  // JSON-LD structured data -- tells Google this is a local business
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "name": contractor.business_name,
    "description": contractor.bio,
    "url": profileUrl,
    "areaServed": {
      "@type": "City",
      "name": "Dallas-Fort Worth"
    },
    "knowsAbout": contractor.trade,
  };

  return (
    <>
      <Head>
        <title>{contractor.business_name} — Harry's List DFW</title>
        <meta name="description" content={`${contractor.business_name} is a ${contractor.trade} contractor serving DFW. ${contractor.bio}`} />
        <meta property="og:title" content={`${contractor.business_name} — Harry's List DFW`} />
        <meta property="og:description" content={`${contractor.trade} contractor in Dallas-Fort Worth. ${contractor.bio}`} />
        <meta property="og:url" content={profileUrl} />
        <meta property="og:type" content="profile" />
        <meta property="og:site_name" content="Harry's List" />
        <meta property="og:image" content="https://harryslistdfw.com/og-image.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={`${contractor.business_name} — Harry's List DFW`} />
        <meta name="twitter:description" content={`${contractor.trade} contractor in Dallas-Fort Worth.`} />
        <meta name="twitter:image" content="https://harryslistdfw.com/og-image.png" />
        <link rel="canonical" href={profileUrl} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(jsonLd) }}
        />
      </Head>

      {/* SSR content for Google */}
      <div style={{ display: "none" }} aria-hidden="true">
        <h1>{contractor.business_name}</h1>
        <p>{contractor.trade} · Dallas-Fort Worth</p>
        <p>{contractor.bio}</p>
        {contractor.license_info && <p>License/Insurance: {contractor.license_info}</p>}
        {contractor.years_in_business && <p>{contractor.years_in_business} years in business</p>}
        {contractor.primary_city && (
          <p>
            <a href={`/${tradeSlug(contractor.trade)}/${citySlug(contractor.primary_city)}`}>
              See other {contractor.trade} contractors in {contractor.primary_city}
            </a>
          </p>
        )}
      </div>

      {/* Visible internal link -- helps homeowners browse sideways to other
          contractors in the same trade/city, and gives Google a real,
          visible (not hidden) crawl path into the SEO landing pages. */}
      {contractor.primary_city && (
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 24px" }}>
          <a
            href={`/${tradeSlug(contractor.trade)}/${citySlug(contractor.primary_city)}`}
            style={{ fontSize: 13, color: "#6B5840" }}
          >
            See other {contractor.trade} contractors in {contractor.primary_city} →
          </a>
        </div>
      )}

      <ContractorPublicProfile />
    </>
  );
}

export async function getServerSideProps({ params }) {
  const { slug } = params;
  const isNumeric = /^\d+$/.test(slug);
  const lookupParam = isNumeric ? { contractorId: slug } : { slug };

  try {
    const res = await fetch(`${API_BASE_URL}/contractors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "getWithReviews", ...lookupParam }),
    });
    if (!res.ok) return { props: { contractor: null } };
    const data = await res.json();
    const c = data.contractor;
    if (!c) return { props: { contractor: null } };
    const normalized = normalizeContractor(c);
    return {
      props: {
        contractor: {
          id: c.id,
          business_name: c.businessName,
          trade: c.trade,
          bio: c.bio || "",
          slug: c.slug || null,
          license_info: c.licenseInfo || null,
          years_in_business: c.yearsInBusiness || null,
          primary_city: primaryCityForServiceArea(normalized.serviceArea),
        },
      },
    };
  } catch {
    return { props: { contractor: null } };
  }
}
