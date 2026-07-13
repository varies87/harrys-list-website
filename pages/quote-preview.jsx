import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

export default function QuotePreviewPage() {
  const router = useRouter();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!router.isReady) return;
    const { contractor, logoUrl, trade, customer, address, description, items, total, message, type } = router.query;
    try {
      setData({
        contractor: contractor || "Contractor",
        logoUrl: logoUrl || "",
        trade: trade || "",
        customer: customer || "",
        address: address || "",
        description: description || "",
        items: items ? JSON.parse(items) : [],
        total: parseFloat(total) || 0,
        message: message || "",
        type: type === "invoice" ? "invoice" : "quote",
        date: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
      });
    } catch {
      setData(null);
    }
  }, [router.isReady, router.query]);

  if (!data) return <div style={{ padding: 40, fontFamily: "sans-serif" }}>Loading…</div>;

  const isInvoice = data.type === "invoice";
  const docLabel = isInvoice ? "INVOICE" : "QUOTE";
  // Kept deliberately neutral -- black ink on white paper, not a branded
  // color banner. A thin black rule separates the header from the body.
  const ink = "#1A1A1A";

  return (
    <>
      <Head>
        <title>{docLabel} from {data.contractor}</title>
        <meta name="robots" content="noindex" />
        <style>{`
          @media print {
            .no-print { display: none !important; }
            body { background: white !important; }
            .doc-wrap { box-shadow: none !important; border: none !important; }
          }
        `}</style>
      </Head>
      <div style={{ background: "#F5F5F4", minHeight: "100vh", padding: "40px 24px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
        <div className="doc-wrap" style={{ maxWidth: 680, margin: "0 auto", background: "#fff", borderRadius: 12, border: "1px solid #E0E0E0", overflow: "hidden" }}>

          {/* Header -- contractor logo + name is the headline; doc type sits
              opposite. A single thin black rule replaces any colored banner. */}
          <div style={{ padding: "28px 36px 24px", borderBottom: `3px solid ${ink}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                {data.logoUrl && (
                  <img
                    src={data.logoUrl}
                    alt=""
                    style={{ width: 56, height: 56, borderRadius: 10, objectFit: "cover", border: "1px solid #E0E0E0", flexShrink: 0 }}
                  />
                )}
                <div>
                  <div style={{ fontSize: 26, fontWeight: 700, color: ink, letterSpacing: "-0.01em", lineHeight: 1.1 }}>{data.contractor}</div>
                  <div style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>
                    {data.trade ? `${data.trade} · ` : ""}Dallas–Fort Worth
                  </div>
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: ink, letterSpacing: "0.1em" }}>{docLabel}</div>
                <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>{data.date}</div>
              </div>
            </div>
            {isInvoice && (
              <div style={{ marginTop: 12, display: "inline-block", background: "#fff", color: ink, border: `1px solid ${ink}`, fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999 }}>
                Awaiting your confirmation
              </div>
            )}
          </div>

          {/* Body */}
          <div style={{ padding: "26px 36px 32px" }}>

            {/* Bill to -- invoices only. By invoice time the contractor has
                the customer's details (job is done); quotes stay private. */}
            {isInvoice && (data.customer || data.address) && (
              <div style={{ marginBottom: 22 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#9AA29A", marginBottom: 4 }}>Bill to</div>
                {data.customer && <div style={{ fontSize: 14.5, fontWeight: 600, color: ink }}>{data.customer}</div>}
                {data.address && <div style={{ fontSize: 13.5, color: "#3D4F42", marginTop: 2 }}>{data.address}</div>}
              </div>
            )}

            <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
              <button
                onClick={() => window.print()}
                style={{ background: ink, color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                Download / Print PDF
              </button>
            </div>

            {/* Job description */}
            <div style={{ background: "#F7F8F7", borderRadius: 8, padding: "13px 16px", marginBottom: 22 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#9AA29A", marginBottom: 4 }}>Job description</div>
              <div style={{ fontSize: 14, color: ink }}>{data.description}</div>
            </div>

            {/* Line items table -- numbers use the same sans-serif as
                everything else, not a monospace/coding font. Most monospace
                fonts render "0" with a slash or dot through it to
                distinguish it from the letter O, which looks out of place
                on a professional invoice. */}
            {data.items.length > 0 && (
              <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 8 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #E5E7EB" }}>
                    <th style={{ textAlign: "left", padding: "8px 12px 10px 0", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#9AA29A" }}>Description</th>
                    <th style={{ textAlign: "center", padding: "8px 12px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#9AA29A", width: 55 }}>Qty</th>
                    <th style={{ textAlign: "right", padding: "8px 0 10px 12px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#9AA29A", width: 95 }}>Unit price</th>
                    <th style={{ textAlign: "right", padding: "8px 0 10px 12px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#9AA29A", width: 95 }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item, i) => {
                    const qty = parseFloat(item.qty) || 1;
                    const unit = parseFloat(item.unitPrice) || 0;
                    const lineTotal = qty * unit;
                    return (
                      <tr key={i} style={{ borderBottom: "1px solid #F1F1EF" }}>
                        <td style={{ padding: "12px 12px 12px 0", fontSize: 14, color: ink }}>{item.description}</td>
                        <td style={{ padding: "12px", fontSize: 14, color: ink, textAlign: "center" }}>{qty}</td>
                        <td style={{ padding: "12px 0 12px 12px", fontSize: 13.5, color: ink, textAlign: "right" }}>${unit.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: "12px 0 12px 12px", fontSize: 13.5, color: ink, textAlign: "right" }}>${lineTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} style={{ padding: "16px 12px 0 0", textAlign: "right", fontWeight: 700, fontSize: 15, color: ink }}>{isInvoice ? "Amount due" : "Total"}</td>
                    <td style={{ padding: "16px 0 0 12px", textAlign: "right", fontWeight: 700, fontSize: 22, color: ink }}>${data.total.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                  </tr>
                </tfoot>
              </table>
            )}

            {/* Message / note */}
            {data.message && (
              <div style={{ background: "#F7F8F7", borderRadius: 8, padding: "13px 16px", marginTop: 24 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#9AA29A", marginBottom: 4 }}>
                  {isInvoice ? "Note" : "Message"}
                </div>
                <div style={{ fontSize: 14, color: "#3D4F42", lineHeight: 1.6 }}>{data.message}</div>
              </div>
            )}

            {/* Invoice confirmation note */}
            {isInvoice && (
              <div style={{ background: "#F7F8F7", border: `1px solid ${ink}`, borderRadius: 8, padding: "13px 16px", marginTop: 24, fontSize: 13, color: ink, lineHeight: 1.55 }}>
                <strong>To confirm this invoice:</strong> log in to your Harry's List account and click “Confirm — that's correct” on your jobs page. This isn't a charge to you.
              </div>
            )}

            {/* Footer -- small, quiet platform credit */}
            <div style={{ borderTop: "1px solid #EDE3D2", marginTop: 26, paddingTop: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "Georgia,serif", fontSize: 12, fontWeight: 600, color: "#8A7A65" }}>Harry's List</span>
              <span style={{ color: "#D8CDBB" }}>·</span>
              <a href="https://harryslistdfw.com" style={{ fontSize: 11.5, color: "#A79A85", textDecoration: "none" }}>DFW trade directory · harryslistdfw.com</a>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
