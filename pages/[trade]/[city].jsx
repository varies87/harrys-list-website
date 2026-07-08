import { normalizeContractor, contractorIsSuspended, contractorCoversCity, tradeSlug, citySlug, INDEX } from "../../shared";

const API_BASE_URL = "https://harrys-list-backend.vercel.app/api";

export default async function handler(req, res) {
  try {
    const response = await fetch(`${API_BASE_URL}/contractors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list" }),
    });
    const data = await response.json();
    const contractors = data.contractors || [];
    const normalized = contractors.map(normalizeContractor);
    const listable = normalized.filter(
      (c) => (c.status === "approved" || c.status === "pending_review") && !contractorIsSuspended(c)
    );

    // Trade x city SEO pages -- only include combos that actually have at
    // least one matching contractor, so we never publish an empty/thin page
    // into the sitemap (see pages/[trade]/[city].jsx for the noindex
    // fallback that covers combos reached by direct link instead).
    const cities = [...INDEX.cityToZips.keys()];
    const tradeCityUrls = [];
    for (const c of listable) {
      for (const city of cities) {
        if (contractorCoversCity(c, city)) {
          tradeCityUrls.push(`https://harryslistdfw.com/${tradeSlug(c.trade)}/${citySlug(city)}`);
        }
      }
    }
    const uniqueTradeCityUrls = [...new Set(tradeCityUrls)];

    const urls = [
      `<url><loc>https://harryslistdfw.com</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
      ...contractors.map((c) => {
        const slug = c.slug || c.id;
        return `<url><loc>https://harryslistdfw.com/c/${slug}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`;
      }),
      ...uniqueTradeCityUrls.map(
        (u) => `<url><loc>${u}</loc><changefreq>weekly</changefreq><priority>0.6</priority></url>`
      ),
    ];

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

    res.setHeader("Content-Type", "application/xml");
    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate");
    res.status(200).send(sitemap);
  } catch {
    res.status(500).send("Error generating sitemap");
  }
}
