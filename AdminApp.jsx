import React, { useState, useEffect } from "react";
import { apiCall, normalizeContractor, describeServiceArea } from "./shared.js";

// ---------------------------------------------------------------------------
// Client-side image processing for admin uploads. Mirrors the contractor app:
// logo -> 200x200 white-background PNG; photo -> compressed JPEG + thumbnail.
// accept excludes HEIC on the inputs so iOS converts to JPEG before we see it.
// Both reject on a bad decode instead of failing silently.
// ---------------------------------------------------------------------------
function processAdminLogo(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't read that image. Use a JPEG or PNG.")); };
    img.onload = () => {
      URL.revokeObjectURL(url);
      const size = 200;
      const canvas = document.createElement("canvas");
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size, size);
      const pad = 12;
      const scale = Math.min((size - pad * 2) / img.width, (size - pad * 2) / img.height);
      const w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      const dataUrl = canvas.toDataURL("image/png");
      resolve({ base64: dataUrl.split(",")[1], fileName: (file.name || "logo").replace(/\.[^.]+$/, "") + ".png", contentType: "image/png" });
    };
    img.src = url;
  });
}

function processAdminPhoto(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't read that photo. Use a JPEG or PNG.")); };
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX_BYTES = 2.5 * 1024 * 1024;
      const THUMB_WIDTH = 400;
      const fullCanvas = document.createElement("canvas");
      let { width, height } = img;
      if (file.size > MAX_BYTES) {
        const s = Math.sqrt(MAX_BYTES / file.size) * 0.9;
        width = Math.round(width * s); height = Math.round(height * s);
      }
      fullCanvas.width = width; fullCanvas.height = height;
      fullCanvas.getContext("2d").drawImage(img, 0, 0, width, height);
      const thumbCanvas = document.createElement("canvas");
      const ts = Math.min(1, THUMB_WIDTH / img.naturalWidth);
      thumbCanvas.width = Math.round(img.naturalWidth * ts);
      thumbCanvas.height = Math.round(img.naturalHeight * ts);
      thumbCanvas.getContext("2d").drawImage(img, 0, 0, thumbCanvas.width, thumbCanvas.height);
      const tryQ = (q) => {
        const dataUrl = fullCanvas.toDataURL("image/jpeg", q);
        const base64 = dataUrl.split(",")[1];
        const bytes = Math.round((base64.length * 3) / 4);
        if (bytes <= MAX_BYTES || q <= 0.4) {
          resolve({ base64, thumbnailBase64: thumbCanvas.toDataURL("image/jpeg", 0.75).split(",")[1], contentType: "image/jpeg" });
        } else { tryQ(Math.max(q - 0.1, 0.4)); }
      };
      tryQ(0.85);
    };
    img.src = url;
  });
}

// ---------------------------------------------------------------------------
// AdminApp.jsx
// ---------------------------------------------------------------------------
// A genuinely separate experience from the customer-facing site: different
// route (/admin), different visual language (dark operational console
// instead of the warm customer storefront), different job (fast triage of
// pending contractor signups, not browsing). Nothing here is reachable from
// CustomerApp.jsx -- there's no link, no shared layout, no shared styling.
// ---------------------------------------------------------------------------

function timeAgo(isoString) {
  if (!isoString) return "";
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDollars(n) {
  if (n == null) return "—";
  return "$" + Number(n).toLocaleString();
}

// ---------------------------------------------------------------------------
// Password gate
// ---------------------------------------------------------------------------
function AdminSignIn({ onAuthed, error, loading }) {
  const [password, setPassword] = useState("");

  return (
    <div className="ad-gate">
      <div className="ad-gate-card">
        <div className="ad-gate-mark">HL</div>
        <h1>Admin console</h1>
        <p className="ad-gate-sub">Harry's List — operations access</p>
        <label className="ad-field">
          <span>Password</span>
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && password && onAuthed(password)}
            placeholder="••••••••"
          />
        </label>
        {error && <div className="ad-gate-error">{error}</div>}
        <button
          type="button"
          className="ad-btn ad-btn-primary ad-btn-block"
          disabled={!password || loading}
          onClick={() => onAuthed(password)}
        >
          {loading ? "Checking…" : "Enter console"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One row in the approval queue
// ---------------------------------------------------------------------------
function QueueRow({ contractor, onApprove, onReject, onArchive, onEdit, busy }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`ad-row ${expanded ? "is-expanded" : ""}`}>
      <button type="button" className="ad-row-head" onClick={() => setExpanded((e) => !e)}>
        <div className="ad-row-avatar">
          {contractor.logoUrl ? (
            <img src={contractor.logoUrl} alt="" />
          ) : (
            <span>{contractor.businessName.slice(0, 2).toUpperCase()}</span>
          )}
        </div>
        <div className="ad-row-main">
          <div className="ad-row-name">{contractor.businessName}</div>
          <div className="ad-row-meta">
            <span>{contractor.trade || "No trade selected"}</span>
            <span className="ad-dot">·</span>
            <span>{describeServiceArea(contractor.serviceArea)}</span>
          </div>
        </div>
        <div className="ad-row-time">{timeAgo(contractor.createdAt)}</div>
        <div className="ad-row-chevron">{expanded ? "−" : "+"}</div>
      </button>

      {expanded && (
        <div className="ad-row-body">
          <p className="ad-row-bio">{contractor.bio}</p>
          <div className="ad-detail-grid">
            <div>
              <span className="ad-detail-label">Years in business</span>
              <span className="ad-detail-value">{contractor.yearsInBusiness || "—"}</span>
            </div>
            <div>
              <span className="ad-detail-label">License / insurance</span>
              <span className="ad-detail-value">{contractor.licenseInfo || "Not provided"}</span>
            </div>
            <div>
              <span className="ad-detail-label">Service area</span>
              <span className="ad-detail-value">{describeServiceArea(contractor.serviceArea)}</span>
            </div>
            <div>
              <span className="ad-detail-label">Submitted</span>
              <span className="ad-detail-value">{timeAgo(contractor.createdAt)}</span>
            </div>
            <div>
              <span className="ad-detail-label">Email</span>
              <span className="ad-detail-value">{contractor.email || "—"}</span>
            </div>
            <div>
              <span className="ad-detail-label">Status</span>
              <span className="ad-detail-value">
                {contractor.status === "pending_review" ? "Edit pending re-review" : contractor.status}
              </span>
            </div>
          </div>
          <div className="ad-row-actions">
            {onEdit && (
              <button
                type="button"
                className="ad-btn ad-btn-ghost"
                onClick={() => onEdit(contractor)}
              >
                Edit
              </button>
            )}
            <button
              type="button"
              className="ad-btn ad-btn-reject"
              disabled={busy}
              onClick={() => onReject(contractor.id)}
            >
              Reject
            </button>
            {onArchive && (
              <button
                type="button"
                className="ad-btn ad-btn-archive"
                disabled={busy}
                onClick={() => onArchive(contractor.id)}
              >
                Archive
              </button>
            )}
            <button
              type="button"
              className="ad-btn ad-btn-approve"
              disabled={busy}
              onClick={() => onApprove(contractor.id)}
            >
              Approve
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Flagged contractor row — shows low-report history and warn/suspend controls
// ---------------------------------------------------------------------------
function FlaggedRow({ entry, onSetStatus, busy }) {
  const [expanded, setExpanded] = useState(false);
  const { contractor, lowReportCount, jobs } = entry;

  const statusLabel = contractor.adminReviewStatus;
  const statusChipClass =
    statusLabel === "suspended" ? "ad-chip ad-chip-red" :
    statusLabel === "warned"    ? "ad-chip ad-chip-yellow" :
                                  "ad-chip ad-chip-gray";

  return (
    <div className={`ad-row ${expanded ? "is-expanded" : ""}`}>
      <button type="button" className="ad-row-head" onClick={() => setExpanded((e) => !e)}>
        <div className="ad-row-avatar">
          <span>{(contractor.name || "??").slice(0, 2).toUpperCase()}</span>
        </div>
        <div className="ad-row-main">
          <div className="ad-row-name">
            {contractor.name}
            {statusLabel && <span className={statusChipClass}>{statusLabel}</span>}
          </div>
          <div className="ad-row-meta">
            <span>{contractor.trade || "—"}</span>
            <span className="ad-dot">·</span>
            <span className="ad-flag-count">{lowReportCount} low reports</span>
          </div>
        </div>
        <div className="ad-row-chevron">{expanded ? "−" : "+"}</div>
      </button>

      {expanded && (
        <div className="ad-row-body">
          <p className="ad-flagged-intro">
            This contractor has reported job amounts more than 10% below their original quote{" "}
            <strong>{lowReportCount} time{lowReportCount !== 1 ? "s" : ""}</strong>. Review the
            reasons below and decide whether to warn or suspend them. Both actions are reversible.
          </p>

          {/* Low-report job list */}
          <div className="ad-low-report-list">
            {jobs.map((job) => {
              const delta = job.quotedAmount != null
                ? Math.round(((job.reportedAmount - job.quotedAmount) / job.quotedAmount) * 100)
                : null;
              return (
                <div className="ad-low-report-job" key={job.id}>
                  <div className="ad-low-report-job-head">
                    <span className="ad-low-report-desc">{job.description}</span>
                    <span className="ad-low-report-time">{timeAgo(job.reportedAt)}</span>
                  </div>
                  <div className="ad-low-report-amounts">
                    <span>
                      Quoted <strong>{formatDollars(job.quotedAmount)}</strong>
                    </span>
                    <span className="ad-arrow">→</span>
                    <span>
                      Reported <strong>{formatDollars(job.reportedAmount)}</strong>
                    </span>
                    {delta != null && (
                      <span className="ad-delta">{delta}%</span>
                    )}
                  </div>
                  {job.lowReportReason ? (
                    <div className="ad-low-report-reason">
                      <span className="ad-detail-label">Contractor's reason</span>
                      <span>{job.lowReportReason}</span>
                    </div>
                  ) : (
                    <div className="ad-low-report-reason ad-low-report-reason-missing">
                      <span className="ad-detail-label">No reason provided</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Admin action controls */}
          <div className="ad-flagged-actions">
            <span className="ad-detail-label">Admin action</span>
            <div className="ad-flagged-btn-row">
              <button
                type="button"
                className={`ad-btn ${contractor.adminReviewStatus === null ? "ad-btn-approve" : "ad-btn-ghost"}`}
                disabled={busy || contractor.adminReviewStatus === null}
                onClick={() => onSetStatus(contractor.id, null)}
              >
                Clear flag
              </button>
              <button
                type="button"
                className={`ad-btn ${contractor.adminReviewStatus === "warned" ? "ad-btn-warn-active" : "ad-btn-warn"}`}
                disabled={busy || contractor.adminReviewStatus === "warned"}
                onClick={() => onSetStatus(contractor.id, "warned")}
              >
                Warn
              </button>
              <button
                type="button"
                className={`ad-btn ${contractor.adminReviewStatus === "suspended" ? "ad-btn-reject-active" : "ad-btn-reject"}`}
                disabled={busy || contractor.adminReviewStatus === "suspended"}
                onClick={() => onSetStatus(contractor.id, "suspended")}
              >
                Suspend
              </button>
            </div>
            <p className="ad-flagged-note">
              <strong>Warn</strong> adds a visible badge to their admin record.{" "}
              <strong>Suspend</strong> hides them from the directory immediately (same as a missed payment suspension).{" "}
              <strong>Clear</strong> removes any status you've set — it does not erase their low-report history.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Disputed job row -- read-only visibility for the admin into a homeowner's
// dispute, so nothing sits silently unresolved. No action buttons yet: the
// resolution path is the contractor editing the amount (which clears the
// dispute automatically) or the two parties working it out directly -- this
// tab exists so an admin running things solo can see it's happening at all.
// ---------------------------------------------------------------------------
function DisputeRow({ dispute }) {
  const [expanded, setExpanded] = useState(false);
  const delta = dispute.quotedAmount != null ? dispute.reportedAmount - dispute.quotedAmount : null;

  return (
    <div className={`ad-row ${expanded ? "is-expanded" : ""}`}>
      <button type="button" className="ad-row-head" onClick={() => setExpanded((e) => !e)}>
        <div className="ad-row-avatar">
          <span>{(dispute.contractor.businessName || "??").slice(0, 2).toUpperCase()}</span>
        </div>
        <div className="ad-row-main">
          <div className="ad-row-name">{dispute.contractor.businessName}</div>
          <div className="ad-row-meta">
            <span>vs. {dispute.homeowner.name || "Unknown homeowner"}</span>
            <span className="ad-dot">·</span>
            <span>{formatDollars(dispute.reportedAmount)}</span>
          </div>
        </div>
        <div className="ad-row-time">{timeAgo(dispute.reportedAt)}</div>
        <div className="ad-row-chevron">{expanded ? "−" : "+"}</div>
      </button>

      {expanded && (
        <div className="ad-row-body">
          <p className="ad-row-bio">{dispute.description}</p>

          <div className="ad-low-report-job">
            <div className="ad-low-report-amounts">
              <span>
                Quoted <strong>{formatDollars(dispute.quotedAmount)}</strong>
              </span>
              <span className="ad-arrow">→</span>
              <span>
                Reported <strong>{formatDollars(dispute.reportedAmount)}</strong>
              </span>
              {delta != null && delta !== 0 && (
                <span className="ad-delta">{delta > 0 ? "+" : ""}{Math.round((delta / dispute.quotedAmount) * 100)}%</span>
              )}
            </div>
            <div className="ad-low-report-reason">
              <span className="ad-detail-label">Homeowner's dispute note</span>
              <span>{dispute.disputeNote || "No note provided"}</span>
            </div>
          </div>

          <div className="ad-detail-grid" style={{ marginTop: 14 }}>
            <div>
              <span className="ad-detail-label">Contractor</span>
              <span className="ad-detail-value">{dispute.contractor.businessName} ({dispute.contractor.trade || "—"})</span>
            </div>
            <div>
              <span className="ad-detail-label">Homeowner</span>
              <span className="ad-detail-value">{dispute.homeowner.name} {dispute.homeowner.email ? `(${dispute.homeowner.email})` : ""}</span>
            </div>
          </div>

          <p className="ad-flagged-note" style={{ marginTop: 14 }}>
            This resolves automatically once the contractor edits the reported amount -- that sends it back to the
            homeowner for fresh confirmation and clears this dispute. No action needed here unless you want to step
            in directly with either party.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main console
// ---------------------------------------------------------------------------
// Admin-side editor: edit a contractor's profile, logo, and portfolio photos
// on their behalf. Gated by the admin password already held by the console.
function AdminEditContractor({ contractor, password, onClose, onSaved }) {
  const [businessName, setBusinessName] = useState(contractor.businessName || "");
  const [trade, setTrade] = useState(contractor.trade || "");
  const [bio, setBio] = useState(contractor.bio || "");
  const [years, setYears] = useState(contractor.yearsInBusiness || "");
  const [license, setLicense] = useState(contractor.licenseInfo || "");
  const [logoUrl, setLogoUrl] = useState(contractor.logoUrl || null);
  const [photos, setPhotos] = useState([]);
  const [loadingPhotos, setLoadingPhotos] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [busyPhotoId, setBusyPhotoId] = useState(null);
  const [err, setErr] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    let cancelled = false;
    apiCall("contractors", { action: "listPortfolioPhotos", contractorId: contractor.id })
      .then((d) => { if (!cancelled) setPhotos(d.photos || []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingPhotos(false); });
    return () => { cancelled = true; };
  }, [contractor.id]);

  const flash = (m) => { setErr(null); setNotice(m); setTimeout(() => setNotice(null), 2500); };

  const saveProfile = async () => {
    setSavingProfile(true); setErr(null); setNotice(null);
    try {
      const d = await apiCall("contractors", {
        action: "adminUpdateContractor",
        adminPassword: password,
        contractorId: contractor.id,
        updates: { businessName, trade, bio, yearsInBusiness: Number(years) || 0, licenseInfo: license },
      });
      onSaved && onSaved(d.contractor);
      flash("Profile saved.");
    } catch (e) { setErr(e.message); } finally { setSavingProfile(false); }
  };

  const onLogoPick = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setUploadingLogo(true); setErr(null);
    try {
      const { base64, fileName, contentType } = await processAdminLogo(file);
      const d = await apiCall("contractors", {
        action: "adminUploadLogo", adminPassword: password, contractorId: contractor.id,
        fileBase64: base64, fileName, contentType,
      });
      setLogoUrl(d.contractor.logoUrl);
      onSaved && onSaved(d.contractor);
      flash("Logo updated.");
    } catch (e2) { setErr(e2.message); } finally { setUploadingLogo(false); }
  };

  const onPhotosPick = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;
    setUploadingPhotos(true); setErr(null);
    try {
      for (const file of files) {
        const { base64, thumbnailBase64, contentType } = await processAdminPhoto(file);
        const d = await apiCall("contractors", {
          action: "adminUploadPortfolioPhoto", adminPassword: password, contractorId: contractor.id,
          fileBase64: base64, thumbnailBase64, contentType,
          fileName: (file.name || "photo").replace(/\.[^.]+$/, "") + ".jpg",
        });
        setPhotos((prev) => [d.photo, ...prev]);
      }
      flash("Photos added.");
    } catch (e2) { setErr(e2.message); } finally { setUploadingPhotos(false); }
  };

  const deletePhoto = async (photoId) => {
    setBusyPhotoId(photoId); setErr(null);
    try {
      await apiCall("contractors", { action: "adminDeletePortfolioPhoto", adminPassword: password, photoId });
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
    } catch (e) { setErr(e.message); } finally { setBusyPhotoId(null); }
  };

  return (
    <div className="ad-edit-overlay" onClick={onClose}>
      <div className="ad-edit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ad-edit-head">
          <div className="ad-edit-title">Edit contractor</div>
          <button type="button" className="ad-edit-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {err && <div className="ad-edit-error">{err}</div>}
        {notice && <div className="ad-edit-notice">{notice}</div>}

        <div className="ad-edit-section">
          <div className="ad-edit-section-title">Logo</div>
          <div className="ad-edit-logo-row">
            <div className="ad-edit-logo-preview">
              {logoUrl ? <img src={logoUrl} alt="Logo" /> : <span>{(businessName || "??").slice(0, 2).toUpperCase()}</span>}
            </div>
            <label className={`ad-btn ad-btn-ghost ${uploadingLogo ? "is-busy" : ""}`}>
              <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }} onChange={onLogoPick} disabled={uploadingLogo} />
              {uploadingLogo ? "Uploading…" : logoUrl ? "Replace logo" : "Upload logo"}
            </label>
          </div>
        </div>

        <div className="ad-edit-section">
          <div className="ad-edit-section-title">Profile</div>
          <label className="ad-field"><span>Business name</span>
            <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
          </label>
          <label className="ad-field"><span>Trade / category</span>
            <select className="ad-edit-select" value={trade} onChange={(e) => setTrade(e.target.value)}>
              {[
                { label: "Exterior", trades: ["Roofing", "Fencing", "Gutters & Drainage", "Siding & Exterior", "Windows & Doors", "Painting — Exterior"] },
                { label: "Landscaping & Outdoor", trades: ["Landscaping & Lawn Care", "Mulch & Hardscape", "Tree Service", "Irrigation & Sprinklers", "Pool & Spa", "Outdoor Lighting", "Concrete & Driveways"] },
                { label: "Interior", trades: ["Painting — Interior", "Flooring", "Tile & Stonework", "Carpentry & Trim", "Kitchen Remodel", "Bathroom Remodel", "Basement & Additions"] },
                { label: "Mechanical & Systems", trades: ["HVAC", "Plumbing", "Electrical", "Insulation", "Solar", "Home Automation"] },
                { label: "Maintenance & Cleaning", trades: ["Pressure Washing", "House Cleaning", "Junk Removal", "Pest Control", "Chimney & Fireplace"] },
                { label: "Youth & Student Businesses", trades: ["Car Detailing", "Window Cleaning", "Gutter Cleaning", "Holiday Lighting", "Moving Help", "Furniture Assembly", "TV & Electronics Setup", "Garage Organization"] },
                { label: "General", trades: ["General Contractor", "Handyman"] },
              ].map(({ label, trades }) => (
                <optgroup key={label} label={label}>
                  {trades.map((t) => <option key={t} value={t}>{t}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="ad-field"><span>Bio</span>
            <textarea className="ad-edit-textarea" rows={4} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="What they do and what makes their work stand out." />
          </label>
          <div className="ad-edit-field-row">
            <label className="ad-field"><span>Years in business</span>
              <input value={years} onChange={(e) => setYears(e.target.value)} />
            </label>
            <label className="ad-field"><span>License / insurance</span>
              <input value={license} onChange={(e) => setLicense(e.target.value)} />
            </label>
          </div>
          <button type="button" className="ad-btn ad-btn-primary" disabled={savingProfile} onClick={saveProfile}>
            {savingProfile ? "Saving…" : "Save profile"}
          </button>
        </div>

        <div className="ad-edit-section">
          <div className="ad-edit-section-title">
            <span>Portfolio photos</span>
            <label className={`ad-btn ad-btn-ghost ad-edit-add ${uploadingPhotos ? "is-busy" : ""}`}>
              <input type="file" accept="image/png,image/jpeg,image/webp" multiple style={{ display: "none" }} onChange={onPhotosPick} disabled={uploadingPhotos} />
              {uploadingPhotos ? "Uploading…" : "+ Add photos"}
            </label>
          </div>
          {loadingPhotos ? (
            <div className="ad-edit-muted">Loading photos…</div>
          ) : photos.length === 0 ? (
            <div className="ad-edit-muted">No portfolio photos yet.</div>
          ) : (
            <div className="ad-edit-photo-grid">
              {photos.map((p) => (
                <div className="ad-edit-photo" key={p.id}>
                  <img src={p.thumbnailUrl || p.publicUrl} alt={p.caption || "Portfolio photo"} />
                  <button type="button" className="ad-edit-photo-del" disabled={busyPhotoId === p.id} onClick={() => deletePhoto(p.id)} aria-label="Delete photo">×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AdminConsole({ password, onLogout }) {
  const [activeTab, setActiveTab] = useState("metrics");
  const [pending, setPending] = useState([]);
  const [flagged, setFlagged] = useState([]);
  const [disputes, setDisputes] = useState([]);
  const [unreported, setUnreported] = useState([]);
  const [archived, setArchived] = useState([]);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [active, setActive] = useState([]);
  const [activeLoading, setActiveLoading] = useState(false);
  const [metrics, setMetrics] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [flaggedLoading, setFlaggedLoading] = useState(false);
  const [disputesLoading, setDisputesLoading] = useState(false);
  const [unreportedLoading, setUnreportedLoading] = useState(false);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [justCleared, setJustCleared] = useState(0);

  const loadMetrics = async () => {
    setMetricsLoading(true);
    try {
      const data = await apiCall("jobs", { action: "getMetrics", adminPassword: password });
      setMetrics(data.metrics);
    } catch (err) {
      setError(err.message);
    } finally {
      setMetricsLoading(false);
    }
  };

  const loadActive = async () => {
    setActiveLoading(true);
    try {
      const data = await apiCall("contractors", { action: "listApproved", adminPassword: password });
      setActive(data.contractors || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setActiveLoading(false);
    }
  };

  const loadArchived = async () => {
    setArchivedLoading(true);
    try {
      const data = await apiCall("contractors", { action: "listArchived", adminPassword: password });
      setArchived(data.contractors || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setArchivedLoading(false);
    }
  };

  const loadQueue = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiCall("contractors", { action: "listPending", adminPassword: password });
      setPending(data.contractors.map(normalizeContractor));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadFlagged = async () => {
    setFlaggedLoading(true);
    setError(null);
    try {
      const data = await apiCall("jobs", { action: "listLowReportContractors", adminPassword: password });
      setFlagged(data.flagged);
    } catch (err) {
      setError(err.message);
    } finally {
      setFlaggedLoading(false);
    }
  };

  const loadDisputes = async () => {
    setDisputesLoading(true);
    setError(null);
    try {
      const data = await apiCall("jobs", { action: "listDisputedJobs", adminPassword: password });
      setDisputes(data.disputed);
    } catch (err) {
      setError(err.message);
    } finally {
      setDisputesLoading(false);
    }
  };

  const loadUnreported = async () => {
    setUnreportedLoading(true);
    setError(null);
    try {
      const data = await apiCall("jobs", { action: "listUnreportedCompletions", adminPassword: password });
      setUnreported(data.unreported);
    } catch (err) {
      setError(err.message);
    } finally {
      setUnreportedLoading(false);
    }
  };

  useEffect(() => {
    loadMetrics();
    loadQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load flagged/disputes/unreported tabs on first visit to each
  useEffect(() => {
    if (activeTab === "flagged" && flagged.length === 0 && !flaggedLoading) {
      loadFlagged();
    }
    if (activeTab === "disputes" && disputes.length === 0 && !disputesLoading) {
      loadDisputes();
    }
    if (activeTab === "unreported" && unreported.length === 0 && !unreportedLoading) {
      loadUnreported();
    }
    if (activeTab === "active" && active.length === 0 && !activeLoading) {
      loadActive();
    }
    if (activeTab === "archived" && archived.length === 0 && !archivedLoading) {
      loadArchived();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const [editingContractor, setEditingContractor] = useState(null);

  // Reflect an admin edit back into whichever list holds this contractor,
  // patching only the fields the editor can change (keeps derived fields intact).
  const applyContractorUpdate = (updated) => {
    if (!updated) return;
    const fields = ["businessName", "bio", "yearsInBusiness", "licenseInfo", "logoUrl"];
    const patch = (list) => list.map((c) => {
      if (c.id !== updated.id) return c;
      const merged = { ...c };
      for (const f of fields) if (updated[f] !== undefined) merged[f] = updated[f];
      return merged;
    });
    setPending(patch);
    setActive(patch);
    setArchived(patch);
  };

  const handleDecision = async (contractorId, status) => {
    setBusyId(contractorId);
    try {
      await apiCall("contractors", { action: "setStatus", adminPassword: password, contractorId, status });
      setPending((prev) => prev.filter((c) => c.id !== contractorId));
      setJustCleared((n) => n + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleSetFlagStatus = async (contractorId, status) => {
    setBusyId(contractorId);
    try {
      await apiCall("jobs", { action: "setAdminReviewStatus", contractorId, status });
      // Update local state so the UI reflects the change immediately
      setFlagged((prev) =>
        prev.map((entry) =>
          entry.contractor.id === contractorId
            ? { ...entry, contractor: { ...entry.contractor, adminReviewStatus: status } }
            : entry
        )
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleRefresh = () => {
    if (activeTab === "queue") loadQueue();
    else if (activeTab === "flagged") loadFlagged();
    else loadDisputes();
  };

  return (
    <div className="ad-console">
      <header className="ad-topbar">
        <div className="ad-topbar-brand">
          <span className="ad-mark">HL</span>
          <span className="ad-topbar-title">Admin console</span>
        </div>
        <div className="ad-topbar-actions">
          <button type="button" className="ad-btn ad-btn-ghost" onClick={handleRefresh} disabled={loading || flaggedLoading}>
            Refresh
          </button>
          <button type="button" className="ad-btn ad-btn-ghost" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </header>

      {/* Tab bar */}
      <div className="ad-tabbar">
        <button
          type="button"
          className={`ad-tab ${activeTab === "metrics" ? "is-active" : ""}`}
          onClick={() => setActiveTab("metrics")}
        >
          Dashboard
        </button>
        <button
          type="button"
          className={`ad-tab ${activeTab === "queue" ? "is-active" : ""}`}
          onClick={() => setActiveTab("queue")}
        >
          Approval queue
          {pending.length > 0 && <span className="ad-tab-badge">{pending.length}</span>}
        </button>
        <button
          type="button"
          className={`ad-tab ${activeTab === "flagged" ? "is-active" : ""}`}
          onClick={() => setActiveTab("flagged")}
        >
          Flagged contractors
          {flagged.length > 0 && <span className="ad-tab-badge ad-tab-badge-warn">{flagged.length}</span>}
        </button>
        <button
          type="button"
          className={`ad-tab ${activeTab === "disputes" ? "is-active" : ""}`}
          onClick={() => setActiveTab("disputes")}
        >
          Disputes
          {disputes.length > 0 && <span className="ad-tab-badge ad-tab-badge-red">{disputes.length}</span>}
        </button>
        <button
          type="button"
          className={`ad-tab ${activeTab === "unreported" ? "is-active" : ""}`}
          onClick={() => setActiveTab("unreported")}
        >
          Unreported jobs
          {unreported.length > 0 && <span className="ad-tab-badge ad-tab-badge-red">{unreported.length}</span>}
        </button>
        <button
          type="button"
          className={`ad-tab ${activeTab === "active" ? "is-active" : ""}`}
          onClick={() => setActiveTab("active")}
        >
          Active contractors
          {active.length > 0 && <span className="ad-tab-badge">{active.length}</span>}
        </button>
        <button
          type="button"
          className={`ad-tab ${activeTab === "archived" ? "is-active" : ""}`}
          onClick={() => setActiveTab("archived")}
        >
          Archived
          {archived.length > 0 && <span className="ad-tab-badge">{archived.length}</span>}
        </button>
      </div>

      <main className="ad-main">
        {error && (
          <div className="ad-error-banner">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label="Dismiss">×</button>
          </div>
        )}

        {/* ── Metrics dashboard ── */}
        {activeTab === "metrics" && (
          <div className="ad-metrics">
            {metricsLoading ? (
              <div className="ad-metrics-loading">
                <span className="ad-metrics-pulse">▋</span> LOADING TELEMETRY…
              </div>
            ) : metrics ? (
              <>
                <div className="ad-metrics-header">
                  <div className="ad-metrics-header-left">
                    <span className="ad-metrics-sys">SYS:HARRY'S LIST</span>
                    {(() => {
                      const issues = [];
                      if (metrics.transactions.overdueJobs > 0) issues.push("overdue fees");
                      if (metrics.contractors.suspended > 0) issues.push("suspended contractors");
                      if (metrics.contractors.pending > 0) issues.push("pending approval");
                      const status = issues.length >= 2 ? "INCIDENT" : issues.length === 1 ? "DEGRADED" : "OPERATIONAL";
                      const color = status === "INCIDENT" ? "#ff8a80" : status === "DEGRADED" ? "#f0c060" : "#3fb950";
                      return (
                        <>
                          <span className="ad-metrics-status-dot" style={{ background: color }} />
                          <span className="ad-metrics-status-text" style={{ color }}>
                            {status}{issues.length > 0 ? ` · ${issues.join(", ")}` : ""}
                          </span>
                        </>
                      );
                    })()}
                  </div>
                  <button className="ad-metrics-refresh" onClick={loadMetrics}>↻ SYNC</button>
                </div>

                {/* Revenue */}
                <div className="ad-metrics-block">
                  <div className="ad-metrics-block-label">// revenue</div>
                  <div className="ad-metrics-row">
                    <div className="ad-mc ad-mc-primary">
                      <div className="ad-mc-key">total collected</div>
                      <div className="ad-mc-val">${metrics.revenue.feesCollected.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      <div className="ad-mc-bar"><div className="ad-mc-bar-fill" style={{ width: "100%", background: "#58a6ff" }} /></div>
                    </div>
                    <div className="ad-mc">
                      <div className="ad-mc-key">this month</div>
                      <div className="ad-mc-val">${metrics.revenue.feesThisMonth.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      <div className="ad-mc-bar"><div className="ad-mc-bar-fill" style={{ width: metrics.revenue.feesCollected > 0 ? Math.round((metrics.revenue.feesThisMonth / metrics.revenue.feesCollected) * 100) + "%" : "0%", background: "#58a6ff" }} /></div>
                    </div>
                    <div className={`ad-mc ${metrics.revenue.feesPending > 0 ? "ad-mc-warn" : ""}`}>
                      <div className="ad-mc-key">pending</div>
                      <div className="ad-mc-val">${metrics.revenue.feesPending.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      <div className="ad-mc-bar"><div className="ad-mc-bar-fill" style={{ width: metrics.revenue.feesPending > 0 ? "60%" : "0%", background: "#f0c060" }} /></div>
                    </div>
                  </div>
                </div>

                {/* Transactions */}
                <div className="ad-metrics-block">
                  <div className="ad-metrics-block-label">// transactions</div>
                  <div className="ad-metrics-row ad-metrics-row-4">
                    <div className="ad-mc">
                      <div className="ad-mc-key">requests sent</div>
                      <div className="ad-mc-val ad-mc-val-lg">{metrics.transactions.totalQuoteRequests}</div>
                    </div>
                    <div className="ad-mc">
                      <div className="ad-mc-key">jobs confirmed</div>
                      <div className="ad-mc-val ad-mc-val-lg">{metrics.transactions.completedJobs}</div>
                    </div>
                    <div className="ad-mc">
                      <div className="ad-mc-key">fees paid</div>
                      <div className="ad-mc-val ad-mc-val-lg" style={{ color: "#3fb950" }}>{metrics.transactions.paidJobs}</div>
                    </div>
                    <div className={`ad-mc ${metrics.transactions.overdueJobs > 0 ? "ad-mc-danger" : ""}`}>
                      <div className="ad-mc-key">overdue</div>
                      <div className="ad-mc-val ad-mc-val-lg">{metrics.transactions.overdueJobs}</div>
                    </div>
                  </div>
                </div>

                {/* Supply + Demand side by side */}
                <div className="ad-metrics-dual">
                  <div className="ad-metrics-block ad-metrics-block-half">
                    <div className="ad-metrics-block-label">// supply · contractors</div>
                    <div className="ad-mc-stat-list">
                      <div className="ad-mc-stat">
                        <span className="ad-mc-stat-label">active</span>
                        <span className="ad-mc-stat-val">{metrics.contractors.total}</span>
                      </div>
                      <div className="ad-mc-stat">
                        <span className="ad-mc-stat-label">new / 30d</span>
                        <span className="ad-mc-stat-val" style={{ color: "#3fb950" }}>+{metrics.contractors.newThisMonth}</span>
                      </div>
                      <div className="ad-mc-stat">
                        <span className="ad-mc-stat-label">pending</span>
                        <span className="ad-mc-stat-val" style={{ color: metrics.contractors.pending > 0 ? "#f0c060" : "#484f58" }}>{metrics.contractors.pending}</span>
                      </div>
                      <div className="ad-mc-stat">
                        <span className="ad-mc-stat-label">suspended</span>
                        <span className="ad-mc-stat-val" style={{ color: metrics.contractors.suspended > 0 ? "#ff8a80" : "#484f58" }}>{metrics.contractors.suspended}</span>
                      </div>
                    </div>
                  </div>

                  <div className="ad-metrics-block ad-metrics-block-half">
                    <div className="ad-metrics-block-label">// demand · homeowners</div>
                    <div className="ad-mc-stat-list">
                      <div className="ad-mc-stat">
                        <span className="ad-mc-stat-label">total</span>
                        <span className="ad-mc-stat-val">{metrics.homeowners.total}</span>
                      </div>
                      <div className="ad-mc-stat">
                        <span className="ad-mc-stat-label">new / 30d</span>
                        <span className="ad-mc-stat-val" style={{ color: "#3fb950" }}>+{metrics.homeowners.newThisMonth}</span>
                      </div>
                      <div className="ad-mc-stat">
                        <span className="ad-mc-stat-label">req / homeowner</span>
                        <span className="ad-mc-stat-val">
                          {metrics.homeowners.total > 0
                            ? (metrics.transactions.totalQuoteRequests / metrics.homeowners.total).toFixed(1)
                            : "0.0"}
                        </span>
                      </div>
                      <div className="ad-mc-stat">
                        <span className="ad-mc-stat-label">completion rate</span>
                        <span className="ad-mc-stat-val">
                          {metrics.transactions.totalQuoteRequests > 0
                            ? Math.round((metrics.transactions.completedJobs / metrics.transactions.totalQuoteRequests) * 100) + "%"
                            : "0%"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="ad-empty">Could not load metrics.</div>
            )}
          </div>
        )}

        {/* ── Approval queue tab ── */}
        {activeTab === "queue" && (
          <div className="ad-tab-content">
            <div className="ad-queue-header">
              <div>
                <div className="ad-queue-count">{loading ? "—" : pending.length}</div>
                <div className="ad-queue-label">{pending.length === 1 ? "contractor" : "contractors"} waiting on review</div>
              </div>
              {justCleared > 0 && (
                <div className="ad-throughput">{justCleared} cleared this session</div>
              )}
            </div>

            {loading && <div className="ad-empty">Loading the queue…</div>}

            {!loading && pending.length === 0 && (
              <div className="ad-empty">
                <div className="ad-empty-mark">✓</div>
                <div className="ad-empty-title">Queue is clear</div>
                <p>No contractors waiting on review right now.</p>
              </div>
            )}

            {!loading && pending.length > 0 && (
              <div className="ad-queue">
                {pending.map((c) => (
                  <QueueRow
                    key={c.id}
                    contractor={c}
                    onApprove={(id) => handleDecision(id, "approved")}
                    onReject={(id) => handleDecision(id, "rejected")}
                    onArchive={(id) => handleDecision(id, "archived")}
                    onEdit={setEditingContractor}
                    busy={busyId === c.id}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Flagged contractors tab ── */}
        {activeTab === "flagged" && (
          <div className="ad-tab-content">
            <div className="ad-queue-header">
              <div>
                <div className="ad-queue-count">{flaggedLoading ? "—" : flagged.length}</div>
                <div className="ad-queue-label">
                  contractor{flagged.length === 1 ? "" : "s"} with 3+ low reports
                </div>
              </div>
            </div>

            {flaggedLoading && <div className="ad-empty">Loading flagged contractors…</div>}

            {!flaggedLoading && flagged.length === 0 && (
              <div className="ad-empty">
                <div className="ad-empty-mark">✓</div>
                <div className="ad-empty-title">No repeat offenders</div>
                <p>No contractors have 3 or more low-report jobs yet.</p>
              </div>
            )}

            {!flaggedLoading && flagged.length > 0 && (
              <div className="ad-queue">
                {flagged.map((entry) => (
                  <FlaggedRow
                    key={entry.contractor.id}
                    entry={entry}
                    onSetStatus={handleSetFlagStatus}
                    busy={busyId === entry.contractor.id}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Disputes tab ── */}
        {activeTab === "disputes" && (
          <div className="ad-tab-content">
            <div className="ad-queue-header">
              <div>
                <div className="ad-queue-count">{disputesLoading ? "—" : disputes.length}</div>
                <div className="ad-queue-label">
                  dispute{disputes.length === 1 ? "" : "s"} open right now
                </div>
              </div>
            </div>

            {disputesLoading && <div className="ad-empty">Loading disputes…</div>}

            {!disputesLoading && disputes.length === 0 && (
              <div className="ad-empty">
                <div className="ad-empty-mark">✓</div>
                <div className="ad-empty-title">No open disputes</div>
                <p>No homeowner has disputed a job amount right now.</p>
              </div>
            )}

            {!disputesLoading && disputes.length > 0 && (
              <div className="ad-queue">
                {disputes.map((d) => (
                  <DisputeRow key={d.id} dispute={d} />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "unreported" && (
          <div className="ad-tab-content">
            <div className="ad-queue-header">
              <div>
                <div className="ad-queue-count">{unreportedLoading ? "—" : unreported.length}</div>
                <div className="ad-queue-label">
                  job{unreported.length === 1 ? "" : "s"} marked complete by homeowner but not reported
                </div>
              </div>
            </div>

            {unreportedLoading && <div className="ad-empty">Loading…</div>}

            {!unreportedLoading && unreported.length === 0 && (
              <div className="ad-empty">
                <div className="ad-empty-mark">✓</div>
                <div className="ad-empty-title">No unreported completions</div>
                <p>All contractors are reporting their jobs properly.</p>
              </div>
            )}

            {!unreportedLoading && unreported.length > 0 && (
              <div className="ad-queue">
                {unreported.map((u, i) => (
                  <div className="ad-card" key={i}>
                    <div className="ad-card-header">
                      <div>
                        <div className="ad-business-name">{u.contractor.businessName}</div>
                        <div className="ad-meta">{u.contractor.trade} · {u.contractor.email}</div>
                      </div>
                      <span className="ad-badge ad-badge-red">Not reported</span>
                    </div>
                    <div className="ad-detail-grid">
                      <div>
                        <div className="ad-detail-label">Job description</div>
                        <div className="ad-detail-value">{u.description}</div>
                      </div>
                      <div>
                        <div className="ad-detail-label">Homeowner</div>
                        <div className="ad-detail-value">{u.homeowner.name} · {u.homeowner.email}</div>
                      </div>
                      <div>
                        <div className="ad-detail-label">Marked complete</div>
                        <div className="ad-detail-value">{new Date(u.markedCompleteAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
                      </div>
                    </div>
                    <p className="ad-meta" style={{ marginTop: 10 }}>
                      Reach out to <strong>{u.contractor.email}</strong> to ask them to report this job on Harry's List.
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {/* ── Active contractors tab ── */}
        {activeTab === "active" && (
          <div className="ad-tab-content">
            <div className="ad-queue-header">
              <div>
                <div className="ad-queue-count">{activeLoading ? "—" : active.length}</div>
                <div className="ad-queue-label">active contractor{active.length === 1 ? "" : "s"} in directory</div>
              </div>
            </div>
            {activeLoading && <div className="ad-empty">Loading…</div>}
            {!activeLoading && active.length === 0 && (
              <div className="ad-empty">
                <div className="ad-empty-title">No active contractors yet</div>
                <p>Approve contractors from the queue to list them in the directory.</p>
              </div>
            )}
            {!activeLoading && active.length > 0 && (
              <div className="ad-queue">
                {active.map((c) => (
                  <QueueRow
                    key={c.id}
                    contractor={c}
                    onApprove={(id) => handleDecision(id, "approved")}
                    onReject={(id) => handleDecision(id, "rejected")}
                    onArchive={(id) => {
                      handleDecision(id, "archived");
                      setActive((prev) => prev.filter((x) => x.id !== id));
                    }}
                    onEdit={setEditingContractor}
                    busy={busyId === c.id}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Archived contractors tab ── */}
        {activeTab === "archived" && (
          <div className="ad-tab-content">
            <div className="ad-queue-header">
              <div>
                <div className="ad-queue-count">{archivedLoading ? "—" : archived.length}</div>
                <div className="ad-queue-label">archived contractor{archived.length === 1 ? "" : "s"}</div>
              </div>
            </div>
            {archivedLoading && <div className="ad-empty">Loading…</div>}
            {!archivedLoading && archived.length === 0 && (
              <div className="ad-empty">
                <div className="ad-empty-mark">✓</div>
                <div className="ad-empty-title">No archived contractors</div>
                <p>Archive a contractor from the Approval queue to remove them from the directory without deleting their data.</p>
              </div>
            )}
            {!archivedLoading && archived.length > 0 && (
              <div className="ad-queue">
                {archived.map((c) => (
                  <QueueRow
                    key={c.id}
                    contractor={c}
                    onApprove={(id) => handleDecision(id, "approved")}
                    onReject={(id) => handleDecision(id, "rejected")}
                    onEdit={setEditingContractor}
                    busy={busyId === c.id}
                  />
                ))}
              </div>
            )}
          </div>
        )}

      </main>

      {editingContractor && (
        <AdminEditContractor
          contractor={editingContractor}
          password={password}
          onClose={() => setEditingContractor(null)}
          onSaved={applyContractorUpdate}
        />
      )}

      <style>{ADMIN_STYLES}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root admin app
// ---------------------------------------------------------------------------
export default function AdminApp() {
  const [authedPassword, setAuthedPassword] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);

  const handleAuth = async (password) => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      await apiCall("contractors", { action: "listPending", adminPassword: password });
      setAuthedPassword(password);
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  if (!authedPassword) {
    return (
      <>
        <AdminSignIn onAuthed={handleAuth} error={authError} loading={authLoading} />
        <style>{ADMIN_STYLES}</style>
      </>
    );
  }

  return <AdminConsole password={authedPassword} onLogout={() => setAuthedPassword(null)} />;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const ADMIN_STYLES = `
.ad-gate, .ad-console {
  font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Helvetica, Arial, sans-serif;
  color: #e4e7eb;
  background: #0d1117;
  min-height: 100vh;
  width: 100%;
  box-sizing: border-box;
}

.ad-gate { display: flex; align-items: center; justify-content: center; padding: 24px; }
.ad-gate-card {
  background: #1d2024; border: 1px solid #2b2f35; border-radius: 14px; padding: 36px 32px; width: 100%; max-width: 360px;
  text-align: center;
}
.ad-gate-mark {
  width: 44px; height: 44px; border-radius: 10px; background: #5b8def; color: #0d1117; font-weight: 800; font-size: 14px;
  display: flex; align-items: center; justify-content: center; margin: 0 auto 18px; font-family: ui-monospace, "SF Mono", Menlo, monospace;
  letter-spacing: 0.02em;
}
.ad-gate h1 { font-size: 19px; font-weight: 700; margin: 0 0 4px; }
.ad-gate-sub { font-size: 13px; color: #8b929d; margin: 0 0 24px; }
.ad-gate-error {
  background: rgba(239,83,80,0.12); color: #ff8a80; border: 1px solid rgba(239,83,80,0.3); border-radius: 8px;
  padding: 9px 12px; font-size: 13px; margin-bottom: 14px; text-align: left;
}

.ad-field { display: flex; flex-direction: column; gap: 6px; text-align: left; margin-bottom: 18px; }
.ad-field span { font-size: 12px; font-weight: 600; color: #9aa1ab; text-transform: uppercase; letter-spacing: 0.04em; }
.ad-field input {
  font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 16px; padding: 11px 13px; border-radius: 8px;
  border: 1px solid #33383f; background: #15171a; color: #e4e7eb; letter-spacing: 0.06em; width: 100%; box-sizing: border-box;
}
.ad-field input:focus { outline: 2px solid #5b8def; outline-offset: 1px; border-color: #5b8def; }
.ad-edit-select {
  font-family: inherit; font-size: 16px; padding: 11px 13px; border-radius: 8px;
  border: 1px solid #33383f; background: #15171a; color: #e4e7eb; width: 100%; box-sizing: border-box; cursor: pointer;
}
.ad-edit-select:focus { outline: 2px solid #5b8def; outline-offset: 1px; border-color: #5b8def; }

.ad-btn {
  font-size: 13px; font-weight: 600; border-radius: 8px; padding: 10px 16px; cursor: pointer; border: none;
  font-family: inherit; transition: opacity 0.15s ease, transform 0.05s ease;
}
.ad-btn:active { transform: translateY(1px); }
.ad-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.ad-btn-block { width: 100%; }
.ad-btn-primary { background: #5b8def; color: #0d1117; }
.ad-btn-primary:hover:not(:disabled) { background: #6f99f0; }
.ad-btn-ghost { background: transparent; color: #9aa1ab; border: 1px solid #2b2f35; }
.ad-btn-ghost:hover:not(:disabled) { color: #e4e7eb; border-color: #444b54; }
.ad-btn-approve { background: #2ea043; color: #fff; }
.ad-btn-approve:hover:not(:disabled) { background: #36b84f; }
.ad-btn-reject { background: transparent; color: #ff8a80; border: 1px solid rgba(239,83,80,0.4); }
.ad-btn-reject:hover:not(:disabled) { background: rgba(239,83,80,0.1); }
.ad-btn-reject-active { background: rgba(239,83,80,0.18); color: #ff8a80; border: 1px solid rgba(239,83,80,0.5); }
.ad-btn-warn { background: transparent; color: #f0c060; border: 1px solid rgba(240,192,96,0.4); }
.ad-btn-warn:hover:not(:disabled) { background: rgba(240,192,96,0.1); }
.ad-btn-warn-active { background: rgba(240,192,96,0.18); color: #f0c060; border: 1px solid rgba(240,192,96,0.5); }
.ad-btn.is-busy { opacity: 0.6; pointer-events: none; }

/* Admin edit modal */
.ad-edit-overlay { position: fixed; inset: 0; z-index: 3000; background: rgba(0,0,0,0.62); display: flex; align-items: flex-start; justify-content: center; overflow-y: auto; padding: 40px 16px; }
.ad-edit-modal { background: #1d2024; border: 1px solid #2b2f35; border-radius: 14px; width: 100%; max-width: 560px; padding: 22px 22px 26px; box-sizing: border-box; }
.ad-edit-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.ad-edit-title { font-size: 17px; font-weight: 700; color: #e4e7eb; }
.ad-edit-close { background: none; border: none; color: #8b929d; font-size: 24px; line-height: 1; cursor: pointer; padding: 0 4px; }
.ad-edit-close:hover { color: #e4e7eb; }
.ad-edit-error { background: rgba(239,83,80,0.12); color: #ff8a80; border: 1px solid rgba(239,83,80,0.3); border-radius: 8px; padding: 9px 12px; font-size: 13px; margin-bottom: 14px; }
.ad-edit-notice { background: rgba(46,160,67,0.12); color: #6ee787; border: 1px solid rgba(46,160,67,0.3); border-radius: 8px; padding: 9px 12px; font-size: 13px; margin-bottom: 14px; }
.ad-edit-section { border-top: 1px solid #23262b; padding-top: 16px; margin-top: 16px; }
.ad-edit-section:first-of-type { border-top: none; padding-top: 0; margin-top: 0; }
.ad-edit-section-title { font-size: 12px; font-weight: 700; color: #9aa1ab; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.ad-edit-add { text-transform: none; letter-spacing: 0; padding: 6px 12px; }
.ad-edit-logo-row { display: flex; align-items: center; gap: 16px; }
.ad-edit-logo-preview { width: 64px; height: 64px; border-radius: 12px; background: #15171a; border: 1px solid #33383f; display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0; font-weight: 700; color: #8b929d; }
.ad-edit-logo-preview img { width: 100%; height: 100%; object-fit: cover; }
.ad-edit-textarea { font-family: inherit; font-size: 16px; padding: 11px 13px; border-radius: 8px; border: 1px solid #33383f; background: #15171a; color: #e4e7eb; resize: vertical; line-height: 1.5; box-sizing: border-box; width: 100%; }
.ad-edit-textarea:focus { outline: 2px solid #5b8def; outline-offset: 1px; border-color: #5b8def; }
.ad-edit-field-row { display: flex; gap: 12px; }
.ad-edit-field-row .ad-field { flex: 1; }
.ad-edit-muted { font-size: 13px; color: #8b929d; padding: 4px 0; }
.ad-edit-photo-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.ad-edit-photo { position: relative; aspect-ratio: 1; border-radius: 8px; overflow: hidden; border: 1px solid #33383f; }
.ad-edit-photo img { width: 100%; height: 100%; object-fit: cover; }
.ad-edit-photo-del { position: absolute; top: 4px; right: 4px; width: 22px; height: 22px; border-radius: 50%; border: none; background: rgba(0,0,0,0.65); color: #fff; font-size: 15px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.ad-edit-photo-del:hover { background: rgba(239,83,80,0.9); }
.ad-edit-photo-del:disabled { opacity: 0.5; cursor: not-allowed; }
@media (max-width: 640px) {
  .ad-edit-photo-grid { grid-template-columns: repeat(3, 1fr); }
  .ad-edit-field-row { flex-direction: column; gap: 0; }
  .ad-edit-overlay { padding: 0; align-items: stretch; }
  .ad-edit-modal { max-width: 100%; min-height: 100vh; border-radius: 0; padding: 18px 16px 24px; }
  .ad-detail-grid { grid-template-columns: 1fr; gap: 12px; }
  .ad-row-head { padding: 12px 14px; gap: 10px; }
  .ad-row-name { flex-wrap: wrap; }
  .ad-row-meta { flex-wrap: wrap; row-gap: 2px; }
  .ad-row-time { font-size: 10px; }
  .ad-row-chevron { width: 26px; height: 26px; }
  .ad-tab { padding: 13px 13px; font-size: 12.5px; }
  .ad-row-actions { flex-wrap: wrap; }
}

/* Tab bar */
.ad-tabbar {
  display: flex; gap: 0; border-bottom: 1px solid #23262b; background: #1a1d21; padding: 0 20px;
  overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none;
}
.ad-tabbar::-webkit-scrollbar { display: none; }
.ad-tab { flex-shrink: 0; }
.ad-tab {
  background: none; border: none; color: #8b929d; font-size: 13px; font-weight: 600; padding: 13px 16px;
  cursor: pointer; font-family: inherit; border-bottom: 2px solid transparent; margin-bottom: -1px;
  display: flex; align-items: center; gap: 7px; transition: color 0.15s ease;
}
.ad-tab:hover { color: #c4c9d0; }
.ad-tab.is-active { color: #5b8def; border-bottom-color: #5b8def; }
.ad-tab-badge {
  background: #5b8def; color: #0d1117; font-size: 10px; font-weight: 800; border-radius: 10px;
  padding: 1px 6px; font-family: ui-monospace, "SF Mono", Menlo, monospace;
}
.ad-tab-badge-warn { background: #f0c060; color: #0d1117; }
.ad-tab-badge-red { background: #ff8a80; color: #0d1117; }

.ad-console { display: flex; flex-direction: column; }

.ad-topbar {
  display: flex; align-items: center; justify-content: space-between; padding: 14px 24px; border-bottom: 1px solid #23262b;
  background: #1a1d21;
}
.ad-topbar-brand { display: flex; align-items: center; gap: 10px; }
.ad-mark {
  width: 28px; height: 28px; border-radius: 6px; background: #5b8def; color: #0d1117; font-weight: 800; font-size: 11px;
  display: flex; align-items: center; justify-content: center; font-family: ui-monospace, "SF Mono", Menlo, monospace;
}
.ad-topbar-title { font-size: 14px; font-weight: 600; color: #c4c9d0; }
.ad-topbar-actions { display: flex; gap: 8px; }

.ad-main { padding: 0; width: 100%; }
.ad-tab-content { padding: 24px 28px 80px; max-width: 900px; }

.ad-queue-header {
  display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 28px; padding-bottom: 20px;
  border-bottom: 1px solid #23262b;
}
.ad-queue-count {
  font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 44px; font-weight: 700; color: #5b8def; line-height: 1;
}
.ad-queue-label { font-size: 13px; color: #8b929d; margin-top: 4px; }
.ad-throughput {
  font-size: 12px; color: #6fcf7f; background: rgba(46,160,67,0.12); border: 1px solid rgba(46,160,67,0.3);
  padding: 5px 10px; border-radius: 20px; font-weight: 600;
}

.ad-error-banner {
  display: flex; justify-content: space-between; align-items: center; gap: 10px; background: rgba(239,83,80,0.1);
  border: 1px solid rgba(239,83,80,0.3); color: #ff8a80; border-radius: 8px; padding: 10px 14px; font-size: 13px; margin-bottom: 18px;
}
.ad-error-banner button { background: none; border: none; color: inherit; font-size: 18px; cursor: pointer; line-height: 1; }

.ad-empty { text-align: center; padding: 64px 20px; color: #6b7280; }
.ad-empty-mark {
  width: 48px; height: 48px; border-radius: 50%; background: rgba(46,160,67,0.12); color: #6fcf7f; font-size: 22px;
  display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;
}
.ad-empty-title { font-size: 15px; font-weight: 700; color: #c4c9d0; margin-bottom: 4px; }
.ad-empty p { font-size: 13px; margin: 0; }

.ad-queue { display: flex; flex-direction: column; gap: 8px; }

.ad-row {
  background: #1a1d21; border: 1px solid #23262b; border-radius: 10px; overflow: hidden; transition: border-color 0.15s ease;
}
.ad-row.is-expanded { border-color: #33383f; }

.ad-row-head {
  display: flex; align-items: center; gap: 12px; width: 100%; padding: 14px 16px; background: none; border: none; cursor: pointer;
  text-align: left; font-family: inherit;
}
.ad-row-avatar {
  width: 36px; height: 36px; border-radius: 8px; background: #23262b; color: #c4c9d0; font-weight: 700; font-size: 12px;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0; overflow: hidden;
}
.ad-row-avatar img { width: 100%; height: 100%; object-fit: cover; }
.ad-row-main { flex: 1; min-width: 0; }
.ad-row-name { font-size: 14px; font-weight: 600; color: #e4e7eb; display: flex; align-items: center; gap: 8px; }
.ad-row-meta { font-size: 12px; color: #8b929d; margin-top: 2px; display: flex; gap: 6px; align-items: center; }
.ad-dot { opacity: 0.5; }
.ad-row-time {
  font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 11px; color: #6b7280; flex-shrink: 0; white-space: nowrap;
}
.ad-row-chevron {
  width: 22px; height: 22px; border-radius: 50%; background: #23262b; color: #9aa1ab; font-size: 14px; font-weight: 700;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.ad-row-body { padding: 16px 16px 18px; border-top: 1px solid #23262b; }
.ad-row-bio { font-size: 13px; color: #c4c9d0; line-height: 1.6; margin: 0 0 16px; }

.ad-detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 18px; }
.ad-detail-label { display: block; font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; margin-bottom: 3px; }
.ad-detail-value { font-size: 13px; color: #c4c9d0; }

.ad-row-actions { display: flex; gap: 8px; justify-content: flex-end; padding-top: 14px; border-top: 1px solid #23262b; }

/* Status chips */
.ad-chip {
  font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
  padding: 2px 8px; border-radius: 999px;
}
.ad-chip-red { background: rgba(239,83,80,0.15); color: #ff8a80; border: 1px solid rgba(239,83,80,0.3); }
.ad-chip-yellow { background: rgba(240,192,96,0.15); color: #f0c060; border: 1px solid rgba(240,192,96,0.3); }
.ad-chip-gray { background: #23262b; color: #8b929d; border: 1px solid #33383f; }

/* Flagged contractor specific */
.ad-flag-count { color: #f0c060; font-weight: 700; }

.ad-flagged-intro { font-size: 13px; color: #c4c9d0; line-height: 1.6; margin: 0 0 16px; }

.ad-low-report-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px; }

.ad-low-report-job {
  background: #15171a; border: 1px solid #2b2f35; border-radius: 8px; padding: 12px 14px;
  display: flex; flex-direction: column; gap: 6px;
}
.ad-low-report-job-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
.ad-low-report-desc { font-size: 13px; font-weight: 600; color: #e4e7eb; }
.ad-low-report-time { font-size: 11px; color: #6b7280; white-space: nowrap; font-family: ui-monospace, "SF Mono", Menlo, monospace; }

.ad-low-report-amounts {
  display: flex; align-items: center; gap: 10px; font-size: 13px; color: #9aa1ab;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
}
.ad-low-report-amounts strong { color: #e4e7eb; }
.ad-arrow { color: #444b54; }
.ad-delta { color: #ff8a80; font-weight: 700; font-size: 12px; }

.ad-low-report-reason {
  display: flex; flex-direction: column; gap: 2px; padding-top: 6px; border-top: 1px solid #23262b;
  font-size: 13px; color: #c4c9d0;
}
.ad-low-report-reason-missing { color: #6b7280; font-style: italic; }

.ad-btn-archive {
  background: #3d2f0e; color: #f0c060; border: 1px solid #5a4510;
}
.ad-btn-archive:hover:not(:disabled) { background: #4a3a10; }
  border-top: 1px solid #23262b; padding-top: 16px; display: flex; flex-direction: column; gap: 10px;
}
.ad-flagged-btn-row { display: flex; gap: 8px; }
.ad-flagged-note { font-size: 12px; color: #6b7280; line-height: 1.6; margin: 0; }

/* Metrics dashboard — mission control */
.ad-metrics { padding: 0; }
.ad-metrics-loading {
  color: #58a6ff; font-size: 12px; font-family: ui-monospace,"SF Mono",Menlo,monospace;
  padding: 48px 24px; text-align: center; letter-spacing: 0.12em;
}
@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
.ad-metrics-pulse { animation: blink 1s infinite; }

.ad-metrics-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 20px; border-bottom: 1px solid #1c2333;
  background: #0d1117;
}
.ad-metrics-header-left { display: flex; align-items: center; gap: 10px; }
.ad-metrics-sys {
  font-family: ui-monospace,"SF Mono",Menlo,monospace; font-size: 10px;
  font-weight: 700; letter-spacing: 0.15em; color: #58a6ff;
}
.ad-metrics-status-dot {
  width: 6px; height: 6px; border-radius: 50%; background: #3fb950;
  animation: blink 2.5s infinite;
}
.ad-metrics-status-text {
  font-family: ui-monospace,"SF Mono",Menlo,monospace; font-size: 9px;
  letter-spacing: 0.2em; color: #3fb950;
}
.ad-metrics-refresh {
  background: none; border: 1px solid #21262d; border-radius: 4px;
  color: #6b7280; font-size: 9px; font-weight: 700; padding: 4px 10px;
  cursor: pointer; font-family: ui-monospace,"SF Mono",Menlo,monospace;
  letter-spacing: 0.12em; transition: all 0.15s ease;
}
.ad-metrics-refresh:hover { border-color: #58a6ff; color: #58a6ff; }

.ad-metrics-block {
  padding: 18px 20px 14px; border-bottom: 1px solid #1c2333;
}
.ad-metrics-block-label {
  font-family: ui-monospace,"SF Mono",Menlo,monospace; font-size: 11px;
  color: #58a6ff; letter-spacing: 0.1em; margin-bottom: 14px; font-weight: 600;
}
.ad-metrics-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.ad-metrics-row-4 { grid-template-columns: repeat(4, 1fr); }
.ad-mc {
  background: #161b22; border: 1px solid #21262d; border-radius: 8px;
  padding: 14px 16px; display: flex; flex-direction: column; gap: 8px;
}
.ad-mc-primary { border-color: #1f3a5f; }
.ad-mc-warn { border-color: #3d2f0e; }
.ad-mc-danger { border-color: #3d1515; }
.ad-mc-key {
  font-family: ui-monospace,"SF Mono",Menlo,monospace; font-size: 12px;
  color: #8b949e; letter-spacing: 0.04em;
}
.ad-mc-val {
  font-family: ui-monospace,"SF Mono",Menlo,monospace; font-size: 22px;
  font-weight: 700; color: #e6edf3; line-height: 1;
}
.ad-mc-val-lg { font-size: 52px; }
.ad-mc-warn .ad-mc-val { color: #f0c060; }
.ad-mc-danger .ad-mc-val { color: #ff8a80; }
.ad-mc-bar { height: 2px; background: #21262d; border-radius: 1px; overflow: hidden; }
.ad-mc-bar-fill { height: 100%; border-radius: 1px; transition: width 0.6s ease; }

.ad-metrics-dual { display: grid; grid-template-columns: 1fr 1fr; }
.ad-metrics-block-half { border-right: 1px solid #1c2333; border-bottom: none; }
.ad-metrics-block-half:last-child { border-right: none; }

.ad-mc-stat-list { display: flex; flex-direction: column; gap: 0; }
.ad-mc-stat {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 0; border-bottom: 1px solid #1c2333;
}
.ad-mc-stat:last-child { border-bottom: none; }
.ad-mc-stat-label {
  font-family: ui-monospace,"SF Mono",Menlo,monospace; font-size: 13px;
  color: #8b949e; letter-spacing: 0.02em;
}
.ad-mc-stat-val {
  font-family: ui-monospace,"SF Mono",Menlo,monospace; font-size: 22px;
  font-weight: 700; color: #e6edf3;
}
`;
