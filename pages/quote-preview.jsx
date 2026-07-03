import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

export default function QuotePreviewPage() {
  const router = useRouter();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!router.isReady) return;
    const { contractor, description, items, total, message, type } = router.query;
    try {
      setData({
        contractor: contractor || "Contractor",
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
  const accentColor = isInvoice ? "#2C6B3F" : "#C1622A";

  return (
    <>
      <Head>
        <title>{docLabel} from {data.contractor} — Harry's List</title>
        <meta name="robots" content="noindex" />
        <style>{`
          @media print {
            .no-print { display: none !important; }
            body { background: white !important; }
            .doc-wrap { box-shadow: none !important; border: none !important; }
          }
        `}</style>
      </Head>
      <div style={{ background: "#FBF7F0", minHeight: "100vh", padding: "40px 24px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
        <div className="doc-wrap" style={{ maxWidth: 680, margin: "0 auto", background: "#fff", borderRadius: 12, border: "1px solid #EDE3D2", overflow: "hidden" }}>

          {/* Header */}
          <div style={{ background: "#1C2B22", padding: "28px 36px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontFamily: "Georgia,serif", fontSize: 22, fontWeight: 600, color: "#FDFBF6" }}>Harry's List</div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#C1622A", marginTop: 4 }}>DFW Trade Directory</div>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#fff", letterSpacing: "0.12em", opacity: 0.9 }}>{docLabel}</div>
          </div>

          {/* Body */}
          <div style={{ padding: "32px 36px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
              <div>
                <div style={{ fontSize: 13, color: "#6B5840", marginBottom: 2 }}>From: <strong>{data.contractor}</strong></div>
                <div style={{ fontSize: 13, color: "#6B5840" }}>Date: {data.date}</div>
                {isInvoice && (
                  <div style={{ marginTop: 8, display: "inline-block", background: "#E3EEDF", color: "#2C6B3F", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999 }}>
                    Awaiting your confirmation
                  </div>
                )}
              </div>
              <button
                className="no-print"
                onClick={() => window.print()}
                style={{ background: accentColor, color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                Download / Print PDF
              </button>
            </div>

            {/* Job description */}
            <div style={{ background: "#FBF7F0", borderRadius: 8, padding: "14px 18px", marginBottom: 24 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#8A7A65", marginBottom: 4 }}>Job description</div>
              <div style={{ fontSize: 14, color: "#1C2B22" }}>{data.description}</div>
            </div>

            {/* Line items table */}
            {data.items.length > 0 && (
              <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #EDE3D2" }}>
                    <th style={{ textAlign: "left", padding: "8px 12px 10px 0", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#8A7A65" }}>Description</th>
                    <th style={{ textAlign: "center", padding: "8px 12px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#8A7A65", width: 60 }}>Qty</th>
                    <th style={{ textAlign: "right", padding: "8px 0 10px 12px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#8A7A65", width: 100 }}>Unit price</th>
                    <th style={{ textAlign: "right", padding: "8px 0 10px 12px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#8A7A65", width: 100 }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item, i) => {
                    const qty = parseFloat(item.qty) || 1;
                    const unit = parseFloat(item.unitPrice) || 0;
                    const total = qty * unit;
                    return (
                      <tr key={i} style={{ borderBottom: "1px solid #F2EDE6" }}>
                        <td style={{ padding: "12px 12px 12px 0", fontSize: 14, color: "#1C2B22" }}>{item.description}</td>
                        <td style={{ padding: "12px", fontSize: 14, color: "#1C2B22", textAlign: "center" }}>{qty}</td>
                        <td style={{ padding: "12px 0 12px 12px", fontSize: 14, color: "#1C2B22", textAlign: "right", fontFamily: "monospace" }}>${unit.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: "12px 0 12px 12px", fontSize: 14, color: "#1C2B22", textAlign: "right", fontFamily: "monospace" }}>${total.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} style={{ padding: "14px 12px 14px 0", textAlign: "right", fontWeight: 700, fontSize: 15, color: "#1C2B22" }}>{isInvoice ? "Amount due" : "Total"}</td>
                    <td style={{ padding: "14px 0 14px 12px", textAlign: "right", fontWeight: 700, fontSize: 20, color: accentColor, fontFamily: "monospace" }}>${data.total.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                  </tr>
                </tfoot>
              </table>
            )}

            {/* Message / note */}
            {data.message && (
              <div style={{ background: "#FBF7F0", borderRadius: 8, padding: "14px 18px", marginBottom: 24 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#8A7A65", marginBottom: 4 }}>
                  {isInvoice ? "Note from contractor" : "Message from contractor"}
                </div>
                <div style={{ fontSize: 14, color: "#3D4F42", lineHeight: 1.6 }}>{data.message}</div>
              </div>
            )}

            {/* Invoice confirmation note */}
            {isInvoice && (
              <div style={{ background: "#E3EEDF", borderRadius: 8, padding: "14px 18px", marginBottom: 24, fontSize: 13, color: "#2C6B3F", lineHeight: 1.6 }}>
                <strong>To confirm this invoice:</strong> Log in to Harry's List and click "Confirm — that's correct" on your jobs page. This starts the contractor's platform fee clock — it is not a charge to you.
              </div>
            )}

            {/* Footer */}
            <div style={{ fontSize: 12, color: "#8A7A65", lineHeight: 1.6, borderTop: "1px solid #EDE3D2", paddingTop: 16 }}>
              This {data.type} was prepared through Harry's List DFW — the contractor directory where nobody pays for placement. All reviews are from verified completed jobs only. · <a href="https://harryslistdfw.com" style={{ color: "#C1622A", textDecoration: "none" }}>harryslistdfw.com</a>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
