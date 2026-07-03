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
        <h1>Harry's List — DFW Trade Directory</h1>
        <p>Find trusted home service contractors in Dallas-Fort Worth. No contractor paid to be listed here.</p>
        {contractors.map((c) => (
          <div key={c.id}>
            <h2>{c.business_name}</h2>
            <p>{c.trade} · {c.bio}</p>
            <a href={`/c/${c.slug || c.id}`}>{c.business_name} profile</a>
          </div>
        ))}
      </div>

      {/* Full React app mounts here */}
      <CustomerApp />
    </>
  );
}

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
