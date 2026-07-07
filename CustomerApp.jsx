import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  supabaseAuth,
  STRIPE_PUBLISHABLE_KEY,
  CREATE_PAYMENT_INTENT_URL,
  apiCall,
  loadStripeJs,
  ZIP_DATA,
  INDEX,
  resolveSelection,
  cityCheckState,
  regionCheckState,
  FEE_BRACKETS,
  feeOwedForAmount,
  effectiveFeeRate,
  PAYMENT_DUE_DAYS,
  AUTO_CONFIRM_DAYS,
  isPaymentOverdue,
  contractorIsSuspended,
  TRADES,
  uid,
  idsMatch,
  normalizeContractor,
  describeServiceArea,
} from "./shared.js";

// Lets non-button elements (image thumbnails that open a lightbox, etc.) be
// activated with the keyboard for accessibility (M-9). Pair with role="button"
// and tabIndex={0} so Enter/Space fire the same handler as a click.
function activateOnKey(handler) {
  return (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handler(e);
    }
  };
}

// Error line that scrolls itself into view when it mounts, so a form error
// (which renders near the submit button) isn't missed on a longer form where
// the button may be below the fold. Used by the auth forms.
function AuthError({ children }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);
  return <p ref={ref} className="ph-stripe-inline-error">{children}</p>;
}

function ServiceAreaPicker({ selection, onChange }) {
  const [expandedRegions, setExpandedRegions] = useState(() => new Set(ZIP_DATA.regions.map((r) => r.region)));

  const isAllDFW = selection.mode === "ALL_DFW";

  const toggleAllDFW = () => {
    if (isAllDFW) {
      onChange({ mode: "CUSTOM", zipCodes: new Set() });
    } else {
      onChange({ mode: "ALL_DFW", zipCodes: new Set() });
    }
  };

  const toggleRegion = (regionName) => {
    const state = regionCheckState(selection, regionName);
    const regionZips = INDEX.regionToZips.get(regionName);
    let nextZips;
    if (isAllDFW) {
      nextZips = new Set(INDEX.allZipCodes);
      if (state === "checked") {
        regionZips.forEach((z) => nextZips.delete(z));
      }
      onChange({ mode: "CUSTOM", zipCodes: nextZips });
      return;
    }
    nextZips = new Set(selection.zipCodes);
    if (state === "checked") {
      regionZips.forEach((z) => nextZips.delete(z));
    } else {
      regionZips.forEach((z) => nextZips.add(z));
    }
    onChange({ mode: "CUSTOM", zipCodes: nextZips });
  };

  const toggleCity = (cityName) => {
    const state = cityCheckState(selection, cityName);
    const cityZips = INDEX.cityToZips.get(cityName);
    let nextZips;
    if (isAllDFW) {
      nextZips = new Set(INDEX.allZipCodes);
      if (state === "checked") {
        cityZips.forEach((z) => nextZips.delete(z));
      }
      onChange({ mode: "CUSTOM", zipCodes: nextZips });
      return;
    }
    nextZips = new Set(selection.zipCodes);
    if (state === "checked") {
      cityZips.forEach((z) => nextZips.delete(z));
    } else {
      cityZips.forEach((z) => nextZips.add(z));
    }
    onChange({ mode: "CUSTOM", zipCodes: nextZips });
  };

  const toggleZip = (zip) => {
    let nextZips;
    if (isAllDFW) {
      nextZips = new Set(INDEX.allZipCodes);
      nextZips.delete(zip);
      onChange({ mode: "CUSTOM", zipCodes: nextZips });
      return;
    }
    nextZips = new Set(selection.zipCodes);
    if (nextZips.has(zip)) nextZips.delete(zip);
    else nextZips.add(zip);
    onChange({ mode: "CUSTOM", zipCodes: nextZips });
  };

  const toggleExpand = (regionName) => {
    setExpandedRegions((prev) => {
      const next = new Set(prev);
      if (next.has(regionName)) next.delete(regionName);
      else next.add(regionName);
      return next;
    });
  };

  const selectedCount = resolveSelection(selection).size;

  return (
    <div className="ph-picker">
      <button
        type="button"
        className={`ph-picker-allbtn ${isAllDFW ? "is-active" : ""}`}
        onClick={toggleAllDFW}
      >
        <span className={`ph-checkbox ${isAllDFW ? "checked" : ""}`} />
        <span className="ph-picker-alltext">
          <strong>All of DFW</strong>
          <span>Match every zip code in the service map</span>
        </span>
      </button>

      <div className="ph-picker-count">
        {selectedCount} zip code{selectedCount === 1 ? "" : "s"} selected
      </div>

      <div className="ph-picker-tree">
        {ZIP_DATA.regions.map((region) => {
          const rState = regionCheckState(selection, region.region);
          const expanded = expandedRegions.has(region.region);
          return (
            <div className="ph-region" key={region.region}>
              <div className="ph-region-row">
                <button
                  type="button"
                  className="ph-expand-btn"
                  onClick={() => toggleExpand(region.region)}
                  aria-label={expanded ? "Collapse region" : "Expand region"}
                >
                  {expanded ? "▾" : "▸"}
                </button>
                <button
                  type="button"
                  className="ph-row-checkbox-btn"
                  onClick={() => toggleRegion(region.region)}
                >
                  <span className={`ph-checkbox ${rState === "checked" ? "checked" : rState === "indeterminate" ? "indeterminate" : ""}`} />
                  <span className="ph-region-label">{region.region}</span>
                </button>
              </div>

              {expanded && (
                <div className="ph-city-list">
                  {region.cities.map((city) => {
                    const cState = cityCheckState(selection, city.city);
                    return (
                      <div className="ph-city-block" key={city.city}>
                        <button
                          type="button"
                          className="ph-row-checkbox-btn ph-city-row"
                          onClick={() => toggleCity(city.city)}
                        >
                          <span className={`ph-checkbox ${cState === "checked" ? "checked" : cState === "indeterminate" ? "indeterminate" : ""}`} />
                          <span className="ph-city-label">{city.city}</span>
                          <span className="ph-zip-count">{city.zip_codes.length} zips</span>
                        </button>
                        <div className="ph-zip-grid">
                          {city.zip_codes.map((zip) => {
                            const checked = isAllDFW || selection.zipCodes.has(zip);
                            return (
                              <button
                                type="button"
                                key={zip}
                                className={`ph-zip-chip ${checked ? "is-checked" : ""}`}
                                onClick={() => toggleZip(zip)}
                              >
                                {zip}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FadeIn -- wraps any view that mounts fresh so it fades + scales in rather
// than snapping into place. Key prop forces a remount (and thus a new
// animation) when the view logically changes even if the component type
// stays the same (e.g. switching contractor tabs).
// ---------------------------------------------------------------------------
function FadeIn({ children, keyValue }) {
  return (
    <div key={keyValue} className="ph-fadein">
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal -- wrapper that scrolls to the top when opened on mobile so the
// user always sees the header of the modal, not the middle or bottom.
// ---------------------------------------------------------------------------
function Modal({ onClose, children }) {
  const overlayRef = React.useRef(null);
  React.useEffect(() => {
    if (overlayRef.current) overlayRef.current.scrollTop = 0;
  }, []);
  return (
    <div className="ph-modal-overlay" ref={overlayRef} onClick={onClose}>
      {children}
    </div>
  );
}
/** Returns proper initials from a name -- "Harrison Hart" → "HH", "Preston Hollow Mulchachos" → "PM" */
function initials(name) {
  if (!name) return "?";
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

// ---------------------------------------------------------------------------
// Star rating display
// ---------------------------------------------------------------------------
function Stars({ value }) {
  return (
    <span className="ph-stars" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= value ? "ph-star filled" : "ph-star"}>★</span>
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Contractor card (directory view)
// ---------------------------------------------------------------------------
function ContractorCard({ contractor, selected, onToggleSelect, onViewProfile, isFavorite, onToggleFavorite }) {
  const avgRating =
    contractor.reviews.length > 0
      ? contractor.reviews.reduce((s, r) => s + r.rating, 0) / contractor.reviews.length
      : null;

  return (
    <div className={`ph-card ${selected ? "is-selected" : ""}`}>
      <div className="ph-card-top">
        <div className="ph-card-id">
          {contractor.logoUrl ? (
            <div className="ph-avatar ph-avatar-logo">
              <img src={contractor.logoUrl} alt={`${contractor.businessName} logo`} />
            </div>
          ) : (
            <div className="ph-avatar">{initials(contractor.businessName)}</div>
          )}
          <div>
            <button type="button" className="ph-card-name" onClick={() => onViewProfile(contractor)}>
              {contractor.businessName}
            </button>
            <div className="ph-card-trade">{contractor.trade}</div>
          </div>
        </div>
        <div className="ph-card-top-actions">
          {onToggleFavorite && (
            <button
              type="button"
              className={`ph-favorite-btn ${isFavorite ? "is-favorite" : ""}`}
              onClick={() => onToggleFavorite(contractor.id)}
              aria-label={isFavorite ? "Remove from favorites" : "Save as favorite"}
              title={isFavorite ? "Remove from favorites" : "Save as favorite"}
            >
              {isFavorite ? "★" : "☆"}
            </button>
          )}
        </div>
      </div>

      <p className="ph-card-bio">
        {contractor.bio.length > 95 ? contractor.bio.slice(0, 95).replace(/\s\S*$/, "") + "…" : contractor.bio}
      </p>

      <div className="ph-card-meta">
        <span><i className="ph-meta-icon">⌖</i>{describeServiceArea(contractor.serviceArea)}</span>
        <span><i className="ph-meta-icon">◷</i>{contractor.yearsInBusiness} yrs in business</span>
      </div>
      <div className="ph-no-fee-badge">Didn't pay to be listed here</div>

      <div className="ph-card-bottom">
        <div className="ph-rating">
          {avgRating ? (
            <>
              <Stars value={Math.round(avgRating)} />
              <span className="ph-rating-text">{avgRating.toFixed(1)} ({contractor.reviews.length})</span>
            </>
          ) : (
            <span className="ph-rating-text muted">No verified reviews yet</span>
          )}
        </div>
        <div className="ph-thumbs">
          <span className="ph-thumb up">▲ {contractor.thumbsUp}</span>
        </div>
      </div>

      {(() => {
        // Surface the most recent written review right on the card. The words
        // are the persuasive part -- a "5.0" number alone doesn't convince a
        // homeowner the way a real quote from a verified customer does.
        const latestWithText = (contractor.reviews || []).find((r) => r.text && r.text.trim());
        if (!latestWithText) return null;
        const snippet =
          latestWithText.text.length > 110
            ? latestWithText.text.slice(0, 110).replace(/\s\S*$/, "") + "…"
            : latestWithText.text;
        return (
          <p
            className="ph-card-review is-clickable"
            role="button"
            tabIndex={0}
            onClick={() => onViewProfile(contractor)}
            onKeyDown={activateOnKey(() => onViewProfile(contractor))}
          >
            “{snippet}” <span className="ph-card-review-tag">— verified customer</span>
          </p>
        );
      })()}

      <div className="ph-card-actions">
        <button type="button" className="ph-card-view-btn" onClick={() => onViewProfile(contractor)}>
          View profile
        </button>
        <button
          type="button"
          className={`ph-card-select-btn ${selected ? "is-selected" : ""}`}
          onClick={() => onToggleSelect(contractor.id)}
        >
          {selected ? "✓ Selected for quote" : "Select for quote"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contractor profile modal
// ---------------------------------------------------------------------------
function ContractorProfileModal({ contractor, onClose, currentHomeowner, onToggleThumbsUp, onRequestQuote, onRequireAuth }) {
  const [alreadyThumbsUpped, setAlreadyThumbsUpped] = useState(false);
  const [thumbsUpBusy, setThumbsUpBusy] = useState(false);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [photosLoaded, setPhotosLoaded] = useState(false);
  const [lightbox, setLightbox] = useState(null);

  useEffect(() => {
    if (!contractor) return;
    setStatusLoaded(false);
    setAlreadyThumbsUpped(false);
    setPhotos([]);
    setPhotosLoaded(false);

    let cancelled = false;

    // Fetch thumbs-up status and portfolio photos in parallel
    Promise.allSettled([
      currentHomeowner
        ? apiCall("reviews", { action: "getThumbsUpStatus", contractorId: contractor.id })
        : Promise.resolve({ alreadyThumbsUpped: false }),
      apiCall("contractors", { action: "listPortfolioPhotos", contractorId: contractor.id }),
    ]).then(([thumbsResult, photosResult]) => {
      if (cancelled) return;
      if (thumbsResult.status === "fulfilled") setAlreadyThumbsUpped(!!thumbsResult.value.alreadyThumbsUpped);
      setStatusLoaded(true);
      if (photosResult.status === "fulfilled") setPhotos(photosResult.value.photos || []);
      setPhotosLoaded(true);
    });

    return () => { cancelled = true; };
  }, [contractor, currentHomeowner]);

  if (!contractor) return null;

  const handleThumbsUpClick = async () => {
    if (!currentHomeowner || thumbsUpBusy) return;
    setThumbsUpBusy(true);
    try {
      await onToggleThumbsUp(contractor.id, !alreadyThumbsUpped);
      setAlreadyThumbsUpped((v) => !v);
    } finally {
      setThumbsUpBusy(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <div className="ph-modal ph-profile-card-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="ph-modal-close" onClick={onClose} aria-label="Close">×</button>

        {/* Header */}
        <div className="ph-modal-head">
          {contractor.logoUrl ? (
            <img className="ph-avatar lg ph-avatar-img" src={contractor.logoUrl} alt={`${contractor.businessName} logo`} style={{ background: "#fff" }} />
          ) : (
            <div className="ph-avatar lg">{initials(contractor.businessName)}</div>
          )}
          <div>
            <h2>{contractor.businessName}</h2>
            <div className="ph-card-trade">{contractor.trade}</div>
            {contractor.isFoundingMember && (
              <div className="ph-founder-badge">★ First Fifty · Founder</div>
            )}
          </div>
        </div>

        {/* Bio */}
        <p className="ph-profile-bio">{contractor.bio}</p>

        {/* Key stats row */}
        <div className="ph-profile-stats">
          <div className="ph-profile-stat">
            <span className="ph-profile-stat-label">Years in business</span>
            <span className="ph-profile-stat-value">{contractor.yearsInBusiness || "—"}</span>
          </div>
          <div className="ph-profile-stat">
            <span className="ph-profile-stat-label">License / insurance</span>
            <span className="ph-profile-stat-value">{contractor.licenseInfo || "Not provided"}</span>
          </div>
          <div className="ph-profile-stat">
            <span className="ph-profile-stat-label">Service area</span>
            <span className="ph-profile-stat-value">{describeServiceArea(contractor.serviceArea)}</span>
          </div>
          <div className="ph-profile-stat">
            <span className="ph-profile-stat-label">Thumbs up</span>
            <span className="ph-profile-stat-value">▲ {contractor.thumbsUp}</span>
          </div>
        </div>

        {/* Reviews summary */}
        {contractor.reviews.length > 0 && (
          <div className="ph-profile-reviews-summary">
            {(() => {
              const avg = contractor.reviews.reduce((s, r) => s + r.rating, 0) / contractor.reviews.length;
              return (
                <>
                  <Stars value={Math.round(avg)} />
                  <span className="ph-rating-text">{avg.toFixed(1)} ({contractor.reviews.length} review{contractor.reviews.length === 1 ? "" : "s"})</span>
                </>
              );
            })()}
          </div>
        )}

        {/* Reviews — show the actual words, not just the count. This is the
            view people land on from a card, and the quotes are what convince. */}
        {contractor.reviews.some((r) => r.text && r.text.trim()) && (
          <div className="ph-profile-reviews">
            {contractor.reviews
              .filter((r) => r.text && r.text.trim())
              .map((r) => (
                <div className="ph-profile-review" key={r.id}>
                  <Stars value={r.rating} />
                  <p className="ph-profile-review-text">“{r.text}”</p>
                  <div className="ph-profile-review-date">
                    Verified homeowner · {new Date(r.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                  </div>
                </div>
              ))}
          </div>
        )}

        {/* Actions — kept above the photo grid so "Request a quote" stays
            visible on open instead of getting pushed below a tall gallery. */}
        <div className="ph-profile-card-actions">
          {currentHomeowner ? (
            <>
              <button
                type="button"
                className="ph-btn-primary"
                onClick={() => onRequestQuote(contractor)}
              >
                Request a quote
              </button>
              <button
                type="button"
                className={`ph-btn-thumbsup ${alreadyThumbsUpped ? "is-active" : ""}`}
                disabled={!statusLoaded || thumbsUpBusy}
                onClick={handleThumbsUpClick}
              >
                {alreadyThumbsUpped ? "▲ Thumbs-upped" : "▲ Thumbs up"}
              </button>
            </>
          ) : (
            <button type="button" className="ph-btn-secondary" onClick={() => onRequireAuth?.()}>
              Sign in to request a quote or thumbs up this contractor
            </button>
          )}
        </div>

        {/* Portfolio photos — open in an on-page lightbox, never off to Supabase */}
        {photosLoaded && photos.length > 0 && (
          <div style={{ marginTop: 22 }}>
            <div className="ph-profile-label" style={{ marginBottom: 10 }}>Past work</div>
            <div className="ph-portfolio-grid">
              {photos.map((photo) => (
                <img
                  key={photo.id}
                  src={photo.thumbnailUrl}
                  alt={photo.caption || "Portfolio photo"}
                  className="ph-portfolio-thumb"
                  title={photo.caption || ""}
                  loading="lazy"
                  role="button"
                  tabIndex={0}
                  aria-label={`View portfolio photo${photo.caption ? `: ${photo.caption}` : ""} full size`}
                  onClick={() => setLightbox(photo.publicUrl)}
                  onKeyDown={activateOnKey(() => setLightbox(photo.publicUrl))}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {lightbox && (
        <div className="cd-lightbox" onClick={(e) => { e.stopPropagation(); setLightbox(null); }}>
          <button className="ph-modal-close" onClick={(e) => { e.stopPropagation(); setLightbox(null); }} aria-label="Close">×</button>
          <img src={lightbox} alt="Full size" className="cd-lightbox-img" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Quote request modal (homeowner side)
// ---------------------------------------------------------------------------
function QuoteRequestModal({ contractors, onClose, onSubmit, defaultZip }) {
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [timeline, setTimeline] = useState("Within 2 weeks");
  const [zip, setZip] = useState(defaultZip || "");
  const [address, setAddress] = useState("");
  const [photos, setPhotos] = useState([]); // { base64, thumbnailBase64, fileName, contentType, previewUrl }
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [photoError, setPhotoError] = useState(null);

  const canSubmit = description.trim().length > 0 && contractors.length > 0 && !uploadingPhotos;

  const processImage = (file) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't read one of the photos. If it's an iPhone HEIC, upload a JPEG or add it from your phone.")); };
      img.onload = () => {
        URL.revokeObjectURL(url);
        const MAX_BYTES = 2.5 * 1024 * 1024;
        const THUMB_WIDTH = 400;
        const fullCanvas = document.createElement("canvas");
        let { width, height } = img;
        if (file.size > MAX_BYTES) {
          const scale = Math.sqrt(MAX_BYTES / file.size) * 0.9;
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        fullCanvas.width = width;
        fullCanvas.height = height;
        fullCanvas.getContext("2d").drawImage(img, 0, 0, width, height);
        const thumbCanvas = document.createElement("canvas");
        const thumbScale = Math.min(1, THUMB_WIDTH / img.naturalWidth);
        thumbCanvas.width = Math.round(img.naturalWidth * thumbScale);
        thumbCanvas.height = Math.round(img.naturalHeight * thumbScale);
        thumbCanvas.getContext("2d").drawImage(img, 0, 0, thumbCanvas.width, thumbCanvas.height);
        const tryQuality = (q) => {
          const dataUrl = fullCanvas.toDataURL("image/jpeg", q);
          const base64 = dataUrl.split(",")[1];
          const bytes = Math.round((base64.length * 3) / 4);
          if (bytes <= MAX_BYTES || q <= 0.4) {
            resolve({ base64, thumbnailBase64: thumbCanvas.toDataURL("image/jpeg", 0.75).split(",")[1], contentType: "image/jpeg", previewUrl: dataUrl });
          } else {
            tryQuality(Math.max(q - 0.1, 0.4));
          }
        };
        tryQuality(0.85);
      };
      img.src = url;
    });
  };

  const handlePhotoChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    if (photos.length + files.length > 5) {
      setPhotoError("Maximum 5 photos per quote request.");
      e.target.value = "";
      return;
    }
    setUploadingPhotos(true);
    setPhotoError(null);
    try {
      const processed = await Promise.all(files.map(processImage));
      setPhotos((prev) => [
        ...prev,
        ...processed.map((p, i) => ({ ...p, fileName: files[i].name.replace(/\.[^.]+$/, ".jpg") })),
      ]);
    } catch (err) {
      setPhotoError(err.message || "Could not process one or more photos.");
    } finally {
      setUploadingPhotos(false);
      e.target.value = "";
    }
  };

  const removePhoto = (idx) => setPhotos((prev) => prev.filter((_, i) => i !== idx));

  return (
    <Modal onClose={onClose}>
      <div className="ph-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="ph-modal-close" onClick={onClose} aria-label="Close">×</button>
        <h2>Send a quote request</h2>
        <p className="ph-muted">
          This will go out to {contractors.length} contractor{contractors.length === 1 ? "" : "s"}:{" "}
          {contractors.map((c) => c.businessName).join(", ")}
        </p>

        <label className="ph-field">
          <span>Describe the job</span>
          <textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Need 6 yards of mulch delivered and spread in front beds, plus trim two crepe myrtles."
          />
        </label>

        <div className="ph-field-row">
          <label className="ph-field">
            <span>Your zip code</span>
            <input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="75024" maxLength={5} />
          </label>
          <label className="ph-field">
            <span>Budget range</span>
            <input value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="$300–500" />
          </label>
        </div>

        <label className="ph-field">
          <span>Job address <span className="ph-muted small">(only shared with contractors after you confirm a job)</span></span>
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="1234 Mockingbird Ln, Dallas TX 75205" />
        </label>

        <label className="ph-field">
          <span>Timeline</span>
          <select value={timeline} onChange={(e) => setTimeline(e.target.value)}>
            <option>As soon as possible</option>
            <option>Within 2 weeks</option>
            <option>Within a month</option>
            <option>Flexible / just getting quotes</option>
          </select>
        </label>

        {/* Photo upload */}
        <div className="ph-field">
          <span>Photos (optional, up to 5)</span>
          <p className="ph-muted small">Show the contractor what the job looks like. Auto-compressed if needed.</p>
          {photos.length < 5 && (
            <label style={{ cursor: uploadingPhotos ? "not-allowed" : "pointer" }}>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                style={{ display: "none" }}
                onChange={handlePhotoChange}
                disabled={uploadingPhotos}
              />
              <span className="ph-photo-upload-btn">
                {uploadingPhotos ? "Processing…" : `+ Add photos (${photos.length}/5)`}
              </span>
            </label>
          )}
          {photoError && <p className="ph-stripe-inline-error">{photoError}</p>}
          {photos.length > 0 && (
            <div className="ph-quote-photo-grid">
              {photos.map((photo, idx) => (
                <div className="ph-quote-photo-item" key={idx}>
                  <img src={photo.previewUrl} alt="Preview" className="ph-quote-photo-img" />
                  <button type="button" className="ph-quote-photo-remove" onClick={() => removePhoto(idx)} aria-label="Remove photo">×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          className="ph-btn-primary"
          disabled={!canSubmit}
          onClick={() => onSubmit({ description, budget, timeline, zip, address: address.trim() || null, photos })}
        >
          Send to {contractors.length} contractor{contractors.length === 1 ? "" : "s"}
        </button>
        {!canSubmit && (
          <p className="ph-muted small" style={{ marginTop: 8, textAlign: "center" }}>
            {uploadingPhotos
              ? "Finishing photo upload…"
              : contractors.length === 0
              ? "Select at least one contractor first."
              : "Add a short description of the job to continue."}
          </p>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// ForgotPassword -- small inline component shown below the sign-in button.
// Sends a Supabase password reset email to the address in the email field,
// or prompts for one if the field is empty.
// ---------------------------------------------------------------------------
function ForgotPassword({ email }) {
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const handleReset = async () => {
    const addr = (email || "").trim();
    if (!addr.includes("@")) {
      setError("Enter your email address above first.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const { error: resetError } = await supabaseAuth.auth.resetPasswordForEmail(addr, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (resetError) throw resetError;
      setSent(true);
    } catch (err) {
      setError(err.message || "Could not send reset email.");
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return <p className="ph-muted small" style={{ marginTop: 12, textAlign: "center" }}>Reset link sent — check your email.</p>;
  }

  return (
    <div style={{ marginTop: 12, textAlign: "center" }}>
      <button type="button" className="ph-forgot-btn" onClick={handleReset} disabled={sending}>
        {sending ? "Sending…" : "Forgot password?"}
      </button>
      {error && <p className="ph-stripe-inline-error" style={{ marginTop: 6 }}>{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ResetPassword -- shown at /reset-password after the user clicks the email
// link. Supabase appends an access_token to the URL hash; we pick it up,
// establish a session, then let the user set a new password.
// ---------------------------------------------------------------------------
export function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    // Supabase puts the tokens in the URL hash as #access_token=...&type=recovery
    // We need to let the Supabase client pick them up and establish a session.
    const { data: { subscription } } = supabaseAuth.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setSessionReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async () => {
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setSubmitting(true);
    setError(null);
    try {
      const { error: updateError } = await supabaseAuth.auth.updateUser({ password });
      if (updateError) throw updateError;
      setDone(true);
    } catch (err) {
      setError(err.message || "Could not update password.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ph-app">
      <style>{CUSTOMER_STYLES}</style>
      <header className="ph-header">
        <div className="ph-header-brand">
          <div className="ph-header-titles">
            <p className="ph-header-title">Harry's List</p>
            <span className="ph-header-subtitle">DFW Trade Directory</span>
          </div>
        </div>
      </header>
      <main className="ph-main">
        <div className="ph-auth-card">
          {done ? (
            <>
              <h2>Password updated</h2>
              <p className="ph-muted">Your password has been changed. You can now sign in with your new password.</p>
              <a href="/" className="ph-btn-primary" style={{ display: "block", textAlign: "center", marginTop: 16, textDecoration: "none" }}>Go to Harry's List</a>
            </>
          ) : !sessionReady ? (
            <>
              <h2>Reset your password</h2>
              <p className="ph-muted">Checking your reset link… if nothing happens, the link may have expired. <a href="/">Return to sign in</a> and request a new one.</p>
            </>
          ) : (
            <>
              <h2>Choose a new password</h2>
              <p className="ph-muted">Must be at least 8 characters.</p>
              <label className="ph-field">
                <span>New password</span>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
              </label>
              <label className="ph-field">
                <span>Confirm password</span>
                <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" />
              </label>
              {error && <p className="ph-stripe-inline-error">{error}</p>}
              <button type="button" className="ph-btn-primary" disabled={submitting || password.length < 8} onClick={handleSubmit}>
                {submitting ? "Updating…" : "Update password"}
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WelcomeModal -- shown once on first homeowner login. Explains how the
// platform works in plain terms. Dismissed to localStorage so it never
// appears again on this browser.
// ---------------------------------------------------------------------------
function WelcomeModal({ onClose }) {
  return (
    <Modal onClose={onClose}>
      <div className="ph-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <h2 style={{ fontFamily: "var(--ph-serif)", marginBottom: 6 }}>Welcome to Harry's List</h2>
        <p className="ph-muted" style={{ marginBottom: 20 }}>The DFW trade directory where no contractor paid to be here.</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 24 }}>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--ph-clay)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 15, flexShrink: 0 }}>1</div>
            <div>
              <div style={{ fontWeight: 700, color: "var(--ph-ink)", marginBottom: 2 }}>Browse and select contractors</div>
              <div className="ph-muted small">Tap "Select for quote" on any contractor you want to reach out to. You can select several, then request quotes from all of them at once.</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--ph-clay)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 15, flexShrink: 0 }}>2</div>
            <div>
              <div style={{ fontWeight: 700, color: "var(--ph-ink)", marginBottom: 2 }}>Send a quote request</div>
              <div className="ph-muted small">Describe the job, your budget, and timeline. It goes straight to the contractors you selected — for free.</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--ph-clay)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 15, flexShrink: 0 }}>3</div>
            <div>
              <div style={{ fontWeight: 700, color: "var(--ph-ink)", marginBottom: 2 }}>Confirm when the job is done</div>
              <div className="ph-muted small">Once the contractor reports the job complete, you'll confirm the amount. That's what triggers their platform fee — not you.</div>
            </div>
          </div>
        </div>

        <div style={{ background: "var(--ph-bg)", border: "1px solid var(--ph-sand-line)", borderRadius: 8, padding: "12px 14px", marginBottom: 20 }}>
          <p className="ph-muted small" style={{ margin: 0 }}>
            <strong style={{ color: "var(--ph-ink)" }}>No spam, no obligation.</strong> Contractors only see your request — not your phone number or email — until you accept an estimate request from them.
          </p>
        </div>

        <button type="button" className="ph-btn-primary" style={{ width: "100%" }} onClick={onClose}>
          Browse contractors
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// HomeownerCompleteProfile -- shown when a user confirmed their email but
// the homeowner profile row doesn't exist yet (e.g. email confirmation was
// required and the session wasn't available during sign-up).
// ---------------------------------------------------------------------------
function HomeownerCompleteProfile({ onComplete }) {
  const [name, setName] = useState("");
  const [zip, setZip] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const canSubmit = name.trim() && zip.trim().length === 5 && phone.trim().length >= 10;

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onComplete({ name: name.trim(), zip: zip.trim(), phone: phone.trim() });
    } catch (err) {
      setError(err.message || "Could not complete profile.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <label className="ph-field">
        <span>Your name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Smith" />
      </label>
      <label className="ph-field">
        <span>Zip code</span>
        <input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="75205" maxLength={5} />
      </label>
      <label className="ph-field">
        <span>Phone number (required for estimate requests)</span>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="214-555-0100" type="tel" />
      </label>
      {error && <p className="ph-stripe-inline-error">{error}</p>}
      <button type="button" className="ph-btn-primary" disabled={!canSubmit || submitting} onClick={handleSubmit}>
        {submitting ? "Saving…" : "Complete profile"}
      </button>
    </>
  );
}

// ---------------------------------------------------------------------------
// Homeowner sign in / sign up
// ---------------------------------------------------------------------------
/**
 * Real sign-up / sign-in, backed directly by Supabase Auth (called from
 * the browser using the public anon key -- see shared.js). On sign-up
 * success, calls onSignedUp so the parent can create the matching
 * homeowners row (via the "afterSignUp" backend action) since Supabase
 * Auth itself only knows about the login credentials, not the homeowner
 * profile fields like name/zip.
 */
function HomeownerAuth({ onSignedUp, onSignedIn }) {
  const [mode, setMode] = useState("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [zip, setZip] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const canSubmitSignUp =
    name.trim() && email.trim().includes("@") && zip.trim().length === 5 && phone.trim().length >= 10 && password.length >= 8;
  const canSubmitSignIn = email.trim().includes("@") && password.length > 0;

  // Specific, friendly hint for what's still needed, so the disabled button
  // isn't a silent dead end.
  const signUpMissing = [];
  if (!name.trim()) signUpMissing.push("your name");
  if (!email.trim().includes("@")) signUpMissing.push("a valid email");
  if (zip.trim().length !== 5) signUpMissing.push("a 5-digit zip");
  if (phone.trim().length < 10) signUpMissing.push("a phone number");
  if (password.length < 8) signUpMissing.push("an 8+ character password");

  const handleSignUp = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const { data, error: signUpError } = await supabaseAuth.auth.signUp({
        email: email.trim(),
        password,
      });
      if (signUpError) throw signUpError;
      if (!data.session) {
        setError("Check your email to confirm your account, then sign in.");
        setMode("signin");
        return;
      }
      await onSignedUp({ name: name.trim(), zip: zip.trim(), phone: phone.trim() || null });
    } catch (err) {
      setError(err.message || "Could not create your account.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignIn = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const { error: signInError } = await supabaseAuth.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) throw signInError;
      await onSignedIn();
    } catch (err) {
      setError(err.message || "Could not sign in.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ph-auth-card">
      <div className="ph-auth-mode-switch">
        <button type="button" className={mode === "signin" ? "is-active" : ""} onClick={() => { setMode("signin"); setError(null); }}>
          Sign in
        </button>
        <button type="button" className={mode === "signup" ? "is-active" : ""} onClick={() => { setMode("signup"); setError(null); }}>
          Create account
        </button>
      </div>

      {mode === "signup" ? (
        <>
          <h2>Create your account</h2>
          <p className="ph-muted">
            Save your address, favorite contractors you've worked with, and keep a history of your quote requests
            and jobs.
          </p>
          <label className="ph-field">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Alvarez" />
          </label>
          <label className="ph-field">
            <span>Email</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" type="email" />
          </label>
          <label className="ph-field">
            <span>Zip code</span>
            <input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="75230" maxLength={5} />
          </label>
          <label className="ph-field">
            <span>Phone number (required for estimate requests)</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="214-555-0100" type="tel" />
          </label>
          <label className="ph-field">
            <span>Password (8+ characters)</span>
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="••••••••" />
          </label>
          {error && <AuthError>{error}</AuthError>}
          <button type="button" className="ph-btn-primary" disabled={!canSubmitSignUp || submitting} onClick={handleSignUp}>
            {submitting ? "Creating account…" : "Create account"}
          </button>
          {!canSubmitSignUp && signUpMissing.length > 0 && (
            <p className="ph-muted small" style={{ marginTop: 8, textAlign: "center" }}>
              Still need: {signUpMissing.join(", ")}.
            </p>
          )}
        </>
      ) : (
        <>
          <h2>Welcome back</h2>
          <p className="ph-muted">Sign in to your account.</p>
          <label className="ph-field">
            <span>Email</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" type="email" />
          </label>
          <label className="ph-field">
            <span>Password</span>
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="••••••••" />
          </label>
          {error && <AuthError>{error}</AuthError>}
          <button type="button" className="ph-btn-primary" disabled={!canSubmitSignIn || submitting} onClick={handleSignIn}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
          <ForgotPassword email={email} />
        </>
      )}
    </div>
  );
}

/**
 * Contractor sign-up / sign-in, mirroring HomeownerAuth -- same Supabase
 * Auth calls, same session model. The difference is what happens after:
 * a brand-new contractor account has no business profile yet, so
 * onSignedUp here does NOT collect business details (no businessName,
 * trade, etc. on this form) -- it just creates the auth account, and the
 * parent routes a fresh signup straight to ContractorOnboarding to build
 * their actual listing. onSignedIn fetches whatever profile (if any)
 * already exists for this account.
 */
function ContractorAuth({ onSignedUp, onSignedIn }) {
  // Default to "signup": this view is landed on straight from contractor ads,
  // so the visitor almost never has an account yet. Sign-in stays one tap away.
  const [mode, setMode] = useState("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const canSubmitSignUp = email.trim().includes("@") && password.length >= 8;
  const canSubmitSignIn = email.trim().includes("@") && password.length > 0;

  const handleSignUp = async () => {
    setSubmitting(true);
    setError(null);
    try {
      // Try signing in first -- if this email already has an account (e.g.
      // a homeowner account), this will succeed and we can just use the
      // existing account for the contractor profile too, without creating
      // a duplicate. If it fails with "invalid credentials" the email is
      // genuinely new and we proceed to create a new account.
      const { error: signInAttemptError } = await supabaseAuth.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (!signInAttemptError) {
        // Signed in successfully -- existing account, just proceed.
        await onSignedIn();
        return;
      }

      // Only try creating a new account if the error was "invalid credentials"
      // (wrong password or no account) -- not if it was something else.
      const isInvalidCredentials =
        signInAttemptError.message?.toLowerCase().includes("invalid") ||
        signInAttemptError.message?.toLowerCase().includes("credentials") ||
        signInAttemptError.status === 400;

      if (!isInvalidCredentials) {
        throw signInAttemptError;
      }

      // Genuinely new email -- create the account.
      const { data, error: signUpError } = await supabaseAuth.auth.signUp({
        email: email.trim(),
        password,
      });
      if (signUpError) throw signUpError;
      if (!data.session) {
        setError("Check your email to confirm your account, then sign in.");
        setMode("signin");
        return;
      }
      await onSignedUp();
    } catch (err) {
      setError(err.message || "Could not create your account.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignIn = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const { error: signInError } = await supabaseAuth.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) throw signInError;
      await onSignedIn();
    } catch (err) {
      setError(err.message || "Could not sign in.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ph-auth-card">
      <div className="ph-auth-mode-switch">
        <button type="button" className={mode === "signin" ? "is-active" : ""} onClick={() => { setMode("signin"); setError(null); }}>
          Sign in
        </button>
        <button type="button" className={mode === "signup" ? "is-active" : ""} onClick={() => { setMode("signup"); setError(null); }}>
          Create account
        </button>
      </div>

      {mode === "signup" ? (
        <>
          <h2>Create your contractor account</h2>
          <p className="ph-muted">
            Set up a login, then build your business profile. Your listing won't be visible to homeowners until an
            admin approves it.
          </p>
          <label className="ph-field">
            <span>Email</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourbusiness.com" type="email" />
          </label>
          <label className="ph-field">
            <span>Password (8+ characters)</span>
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="••••••••" />
          </label>
          {error && <AuthError>{error}</AuthError>}
          <button type="button" className="ph-btn-primary" disabled={!canSubmitSignUp || submitting} onClick={handleSignUp}>
            {submitting ? "Creating account…" : "Create account"}
          </button>
        </>
      ) : (
        <>
          <h2>Contractor sign in</h2>
          <p className="ph-muted">Sign in to manage your listing, quotes, and payments.</p>
          <label className="ph-field">
            <span>Email</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourbusiness.com" type="email" />
          </label>
          <label className="ph-field">
            <span>Password</span>
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="••••••••" />
          </label>
          {error && <AuthError>{error}</AuthError>}
          <button type="button" className="ph-btn-primary" disabled={!canSubmitSignIn || submitting} onClick={handleSignIn}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
          <ForgotPassword email={email} />
        </>
      )}
    </div>
  );
}
function HomeownerAccountBar({ homeowner, onOpenProfile, onLogout }) {
  return (
    <div className="ph-account-bar">
      <div className="ph-account-id">
        <div className="ph-avatar">{initials(homeowner.name)}</div>
        <div>
          <div className="ph-account-name">{homeowner.name}</div>
          <div className="ph-account-zip">Zip {homeowner.zip}</div>
        </div>
      </div>
      <div className="ph-account-actions">
        <button type="button" className="ph-btn-secondary" onClick={onOpenProfile}>
          My profile
        </button>
        <button type="button" className="ph-btn-secondary" onClick={onLogout}>
          Log out
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Homeowner profile page: contact info, favorites, and history
// ---------------------------------------------------------------------------
function HomeownerProfilePage({ homeowner, contractors, quoteRequests, onUpdate, onClose, onToggleFavorite, onSubmitReview }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(homeowner.name);
  const [zip, setZip] = useState(homeowner.zip);
  const [phone, setPhone] = useState(homeowner.phone || "");
  const [reviewingJobId, setReviewingJobId] = useState(null);
  const [reviewedJobIds, setReviewedJobIds] = useState(new Set());

  const favorites = contractors.filter((c) => homeowner.favoriteContractorIds.includes(c.id));
  const myRequests = quoteRequests.filter((qr) => idsMatch(qr.homeownerId, homeowner.id));

  const completedJobsForMe = [];
  contractors.forEach((c) => {
    (c.completedJobs || []).forEach((job) => {
      if (idsMatch(job.homeownerId, homeowner.id)) {
        completedJobsForMe.push({ contractor: c, job });
      }
    });
  });

  // Find out which of this homeowner's jobs already have a review, across
  // every contractor they've worked with, so we know whether to show
  // "Leave a review" or "Reviewed" for each job. One listForContractor call
  // per contractor they've used -- a small, bounded number for one person's
  // job history, not a directory-wide N+1.
  useEffect(() => {
    let cancelled = false;
    const contractorIds = [...new Set(completedJobsForMe.map(({ contractor }) => contractor.id))];
    if (contractorIds.length === 0) return;

    Promise.all(
      contractorIds.map((cId) => apiCall("reviews", { action: "listForContractor", contractorId: cId }))
    )
      .then((results) => {
        if (cancelled) return;
        const myJobIds = new Set();
        results.forEach((data) => {
          (data.reviews || []).forEach((r) => {
            if (idsMatch(r.homeownerId, homeowner.id)) myJobIds.add(r.jobId);
          });
        });
        setReviewedJobIds(myJobIds);
      })
      .catch(() => {
        // Non-critical -- if this fails, jobs just won't show as
        // "reviewed" yet; the user can still try to leave one and the
        // backend will reject a true duplicate.
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeowner.id, completedJobsForMe.length]);

  const saveEdits = () => {
    onUpdate({ name: name.trim(), zip: zip.trim(), phone: phone.trim() || null });
    setEditing(false);
  };

  const handleSubmitReview = async (contractor, job, { rating, text }) => {
    await onSubmitReview({
      contractorId: contractor.id,
      homeownerId: homeowner.id,
      jobId: job.id,
      rating,
      text,
    });
    setReviewedJobIds((prev) => new Set(prev).add(job.id));
    setReviewingJobId(null);
  };

  return (
    <div className="ph-profile-page">
      <div className="ph-profile-page-head">
        <h2>Your profile</h2>
        <button type="button" className="ph-btn-secondary" onClick={onClose}>
          Back to directory
        </button>
      </div>

      <div className="ph-card ph-profile-card">
        {editing ? (
          <>
            <label className="ph-field">
              <span>Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="ph-field">
              <span>Zip code</span>
              <input value={zip} onChange={(e) => setZip(e.target.value)} maxLength={5} />
            </label>
            <label className="ph-field">
              <span>Phone number (shared with contractors when you accept an estimate request)</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="214-555-0100" type="tel" />
            </label>
            <button type="button" className="ph-btn-primary" onClick={saveEdits}>
              Save
            </button>
          </>
        ) : (
          <>
            <div className="ph-profile-grid">
              <div>
                <div className="ph-profile-label">Name</div>
                <div>{homeowner.name}</div>
              </div>
              <div>
                <div className="ph-profile-label">Email</div>
                <div>{homeowner.email}</div>
              </div>
              <div>
                <div className="ph-profile-label">Zip code</div>
                <div>{homeowner.zip}</div>
              </div>
              <div>
                <div className="ph-profile-label">Phone</div>
                <div>{homeowner.phone || <span className="ph-muted small">Not added — needed for estimate requests</span>}</div>
              </div>
            </div>
            <button type="button" className="ph-btn-secondary" onClick={() => setEditing(true)}>
              Edit
            </button>
          </>
        )}
      </div>

      <div className="ph-section">
        <h3>Favorite contractors</h3>
        {favorites.length === 0 && <p className="ph-muted">No favorites yet — tap the star on a contractor's card to save them here.</p>}
        <div className="ph-directory-grid">
          {favorites.map((c) => (
            <div className="ph-card" key={c.id}>
              <div className="ph-card-top">
                <div className="ph-card-id">
                  <div className="ph-avatar">{initials(c.businessName)}</div>
                  <div>
                    <div className="ph-card-name" style={{ cursor: "default" }}>{c.businessName}</div>
                    <div className="ph-card-trade">{c.trade}</div>
                  </div>
                </div>
                <button type="button" className="ph-favorite-btn is-favorite" onClick={() => onToggleFavorite(c.id)} aria-label="Remove favorite">
                  ★
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="ph-section">
        <h3>Quote request history</h3>
        {myRequests.length === 0 && <p className="ph-muted">No quote requests sent yet.</p>}
        {myRequests.map((qr) => (
          <div className="ph-qr-row" key={qr.id}>
            <div>
              <div className="ph-qr-desc">{qr.description}</div>
              <div className="ph-qr-meta">
                Sent to {qr.recipients.map((r) => contractors.find((c) => idsMatch(c.id, r.contractorId))?.businessName).join(", ")}
              </div>
            </div>
            <div className="ph-qr-statuses">
              {qr.recipients.map((r) => (
                <span key={r.contractorId} className={`ph-status-chip ${r.status}`}>{r.status}</span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="ph-section">
        <h3>Job history</h3>
        {completedJobsForMe.length === 0 && <p className="ph-muted">No completed jobs yet.</p>}
        {completedJobsForMe.map(({ contractor, job }) => {
          const canReview = job.status === "confirmed" || job.status === "paid";
          const alreadyReviewed = reviewedJobIds.has(job.id);
          return (
            <div className="ph-job-history-row" key={job.id}>
              <div className="ph-qr-row" style={{ border: "none", padding: "14px 0 6px" }}>
                <div>
                  <div className="ph-qr-desc">{job.description}</div>
                  <div className="ph-qr-meta">{contractor.businessName} — ${job.reportedAmount.toLocaleString()}</div>
                </div>
                <span className={`ph-status-chip ${job.status === "paid" || job.status === "confirmed" ? "responded" : job.status === "disputed" ? "declined" : "sent"}`}>
                  {job.status.replace("_", " ")}
                </span>
              </div>

              {canReview && (
                <div className="ph-job-review-area">
                  {alreadyReviewed ? (
                    <span className="ph-status-chip responded">✓ reviewed</span>
                  ) : reviewingJobId === job.id ? (
                    <ReviewForm
                      onSubmit={(payload) => handleSubmitReview(contractor, job, payload)}
                      onCancel={() => setReviewingJobId(null)}
                    />
                  ) : (
                    <button type="button" className="ph-btn-secondary" onClick={() => setReviewingJobId(job.id)}>
                      Leave a review
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Delete account */}
      <div style={{ marginTop: 40, paddingTop: 20, borderTop: "1px solid var(--ph-sand-line)" }}>
        <p className="ph-muted small" style={{ marginBottom: 8 }}>Need to delete your account? Email us at <a href="mailto:harry@harryslistdfw.com" style={{ color: "var(--ph-clay)" }}>harry@harryslistdfw.com</a> and we'll remove your data within 48 hours.</p>
      </div>
    </div>
  );
} // end HomeownerProfilePage

// ---------------------------------------------------------------------------
// Inline review form -- star picker + text, shown under a job once the
// homeowner clicks "Leave a review". Submits via onSubmit and reports back
// success so the parent can mark this job as reviewed and collapse the form.
// ---------------------------------------------------------------------------
function ReviewForm({ onSubmit, onCancel }) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    if (!rating) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ rating, text: text.trim() });
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="ph-review-form">
      <div className="ph-review-form-stars">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            type="button"
            key={n}
            className={`ph-review-star-btn ${n <= (hoverRating || rating) ? "is-filled" : ""}`}
            onMouseEnter={() => setHoverRating(n)}
            onMouseLeave={() => setHoverRating(0)}
            onClick={() => setRating(n)}
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="How did the job go? (optional)"
      />
      {error && <p className="ph-stripe-inline-error">{error}</p>}
      <div className="ph-inbox-actions">
        <button type="button" className="ph-btn-primary" disabled={!rating || submitting} onClick={handleSubmit}>
          {submitting ? "Submitting…" : "Submit review"}
        </button>
        <button type="button" className="ph-btn-secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
      </div>
    </div>
  );
}
// ---------------------------------------------------------------------------
// ReviewPromptModal -- shown when a homeowner marks a job complete.
// Prompts for a star rating. Skippable but encouraged.
// ---------------------------------------------------------------------------
function ReviewPromptModal({ contractorName, onSubmit, onSkip }) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (withReview) => {
    setSubmitting(true);
    await onSubmit(withReview && rating > 0 ? { rating, text: text.trim() } : null);
    setSubmitting(false);
  };

  return (
    <Modal onClose={() => handleSubmit(false)}>
      <div className="ph-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Job marked complete</h2>
        <p className="ph-muted">How did {contractorName} do? Reviews help other homeowners find trustworthy contractors.</p>

        <div className="ph-review-form-stars" style={{ margin: "20px 0 12px" }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              className={`ph-review-star-btn ${n <= (hoverRating || rating) ? "is-filled" : ""}`}
              onMouseEnter={() => setHoverRating(n)}
              onMouseLeave={() => setHoverRating(0)}
              onClick={() => setRating(n)}
              aria-label={`${n} star${n === 1 ? "" : "s"}`}
            >★</button>
          ))}
        </div>

        {rating > 0 && (
          <label className="ph-field">
            <span>Tell others about your experience (optional)</span>
            <textarea
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What did they do well? Would you hire them again?"
            />
          </label>
        )}

        <div className="ph-inbox-actions" style={{ marginTop: 16 }}>
          <button
            type="button"
            className="ph-btn-primary"
            disabled={submitting}
            onClick={() => handleSubmit(true)}
          >
            {rating > 0 ? (submitting ? "Submitting…" : "Submit review") : "Mark complete without review"}
          </button>
          {rating > 0 && (
            <button type="button" className="ph-btn-secondary" disabled={submitting} onClick={() => handleSubmit(false)}>
              Skip review
            </button>
          )}
        </div>
        <p className="ph-muted small" style={{ marginTop: 10 }}>
          You'll need to review all completed jobs before sending new quote requests.
        </p>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// ReviewGateModal -- shown when a homeowner tries to send a new quote request
// but has unreviewed completed jobs. Shows inline review forms so they can
// review and then immediately proceed to send their request.
// ---------------------------------------------------------------------------
function ReviewGateModal({ onClose, unreviewedJobs, onReviewSubmitted }) {
  const [ratings, setRatings] = useState({});
  const [texts, setTexts] = useState({});
  const [hoverRatings, setHoverRatings] = useState({});
  const [submitting, setSubmitting] = useState({});
  const [submitted, setSubmitted] = useState(new Set());

  const allReviewed = unreviewedJobs.length > 0 && unreviewedJobs.every((j) => submitted.has(j.jobId));

  const [reviewErrors, setReviewErrors] = useState({});

  const handleSubmitReview = async (job) => {
    const rating = ratings[job.jobId];
    if (!rating) return;
    setSubmitting((prev) => ({ ...prev, [job.jobId]: true }));
    setReviewErrors((prev) => ({ ...prev, [job.jobId]: null }));
    try {
      await onReviewSubmitted(job, { rating, text: (texts[job.jobId] || "").trim() });
      setSubmitted((prev) => new Set([...prev, job.jobId]));
    } catch (err) {
      setReviewErrors((prev) => ({ ...prev, [job.jobId]: err.message || "Could not submit review." }));
    } finally {
      setSubmitting((prev) => ({ ...prev, [job.jobId]: false }));
    }
  };

  return (
    <Modal onClose={onClose}>
      <div className="ph-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <button type="button" className="ph-modal-close" onClick={onClose} aria-label="Close">×</button>
        <h2>Leave a review to continue</h2>
        <p className="ph-muted" style={{ marginBottom: 20 }}>
          You have {unreviewedJobs.length} completed job{unreviewedJobs.length > 1 ? "s" : ""} waiting for a review. Leave your review{unreviewedJobs.length > 1 ? "s" : ""} below and your quote request will go out right after.
        </p>

        {unreviewedJobs.map((job) => (
          <div key={job.jobId} style={{
            background: submitted.has(job.jobId) ? "var(--ph-green-tint)" : "var(--ph-bg)",
            border: `1px solid ${submitted.has(job.jobId) ? "#c7e0c2" : "var(--ph-sand-line)"}`,
            borderRadius: 10, padding: 16, marginBottom: 14,
          }}>
            <div style={{ fontWeight: 700, color: "var(--ph-ink)", marginBottom: 2 }}>{job.contractorName}</div>
            <div className="ph-muted small" style={{ marginBottom: 10 }}>{job.description}</div>

            {submitted.has(job.jobId) ? (
              <div style={{ color: "var(--ph-green-text)", fontWeight: 600, fontSize: 13 }}>✓ Review submitted</div>
            ) : (
              <>
                {/* Stars */}
                <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
                  {[1,2,3,4,5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`ph-review-star-btn ${n <= ((hoverRatings[job.jobId] || 0) || (ratings[job.jobId] || 0)) ? "is-filled" : ""}`}
                      onMouseEnter={() => setHoverRatings((p) => ({ ...p, [job.jobId]: n }))}
                      onMouseLeave={() => setHoverRatings((p) => ({ ...p, [job.jobId]: 0 }))}
                      onClick={() => setRatings((p) => ({ ...p, [job.jobId]: n }))}
                    >★</button>
                  ))}
                </div>
                {ratings[job.jobId] > 0 && (
                  <textarea
                    rows={2}
                    value={texts[job.jobId] || ""}
                    onChange={(e) => setTexts((p) => ({ ...p, [job.jobId]: e.target.value }))}
                    placeholder="What did they do well? (optional)"
                    style={{ width: "100%", fontSize: 13, marginBottom: 8, padding: "8px 10px", border: "1.5px solid var(--ph-sand)", borderRadius: 6, fontFamily: "inherit", resize: "vertical" }}
                  />
                )}
                <button
                  type="button"
                  className="ph-btn-primary"
                  style={{ fontSize: 12, padding: "6px 14px" }}
                  disabled={!ratings[job.jobId] || submitting[job.jobId]}
                  onClick={() => handleSubmitReview(job)}
                >
                  {submitting[job.jobId] ? "Submitting…" : "Submit review"}
                </button>
                {reviewErrors[job.jobId] && (
                  <p style={{ fontSize: 12, color: "var(--ph-red-text)", marginTop: 6 }}>{reviewErrors[job.jobId]}</p>
                )}
              </>
            )}
          </div>
        ))}

        {allReviewed && (
          <button
            type="button"
            className="ph-btn-primary"
            style={{ width: "100%", marginTop: 8 }}
            onClick={onClose}
          >
            Continue to quote request →
          </button>
        )}
      </div>
    </Modal>
  );
}

function HomeownerView({
  contractors,
  setContractors,
  quoteRequests,
  setQuoteRequests,
  homeownerJobs,
  onConfirmJob,
  onDisputeJob,
  currentHomeowner,
  onToggleFavorite,
  onToggleThumbsUp,
  onRequireAuth,
}) {
  const [tradeFilter, setTradeFilter] = useState("All trades");
  const [cityFilter, setCityFilter] = useState("All cities");
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [reviewPrompt, setReviewPrompt] = useState(null); // { quoteRequestId, contractorId, contractorName }
  const [pendingReviewJobs, setPendingReviewJobs] = useState([]); // jobs needing review before new request
  const [showReviewGate, setShowReviewGate] = useState(false);
  const [unreviewedJobsForGate, setUnreviewedJobsForGate] = useState([]);
  const [profileContractor, setProfileContractor] = useState(null);
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [quoteTargetContractors, setQuoteTargetContractors] = useState([]);
  const [confirmation, setConfirmation] = useState(null);
  const [disputingJob, setDisputingJob] = useState(null);
  const [disputeNote, setDisputeNote] = useState("");
  const [estimateRequests, setEstimateRequests] = useState([]);

  // Load estimate requests for the homeowner
  useEffect(() => {
    if (!currentHomeowner) return;
    let cancelled = false;
    apiCall("estimates", { action: "listForHomeowner" })
      .then((data) => { if (!cancelled) setEstimateRequests(data.estimateRequests || []); })
      .catch(() => { if (!cancelled) setEstimateRequests([]); });
    return () => { cancelled = true; };
  }, [currentHomeowner?.id]);

  const handleRespondToEstimate = async (estimateRequestId, status) => {
    try {
      const data = await apiCall("estimates", { action: "respond", estimateRequestId, status });
      setEstimateRequests((prev) => prev.map((r) => r.id === estimateRequestId ? data.estimateRequest : r));
    } catch (err) {
      setConfirmation({ text: err.message, isError: true });
      setTimeout(() => setConfirmation(null), 5000);
    }
  };

  const handleAcceptQuote = async (quoteRequestId, contractorId) => {
    try {
      await apiCall("quotes", { action: "acceptQuote", quoteRequestId, contractorId });
      setQuoteRequests((prev) => prev.map((qr) =>
        qr.id !== quoteRequestId ? qr : {
          ...qr,
          recipients: qr.recipients.map((r) =>
            idsMatch(r.contractorId, contractorId) ? { ...r, homeownerAccepted: true } : r
          ),
        }
      ));
      setConfirmation("Quote accepted! The contractor has been notified and will be in touch.");
      setTimeout(() => setConfirmation(null), 5000);
    } catch (err) {
      setConfirmation({ text: err.message, isError: true });
      setTimeout(() => setConfirmation(null), 5000);
    }
  };

  const handleMarkComplete = (quoteRequestId, contractorId) => {
    const contractor = contractors.find((c) => idsMatch(c.id, contractorId));
    setReviewPrompt({
      quoteRequestId,
      contractorId,
      contractorName: contractor?.businessName || "this contractor",
    });
  };

  const submitMarkComplete = async (quoteRequestId, contractorId, review) => {
    try {
      await apiCall("quotes", { action: "markComplete", quoteRequestId, contractorId });
      setQuoteRequests((prev) =>
        prev.map((qr) =>
          qr.id !== quoteRequestId ? qr : {
            ...qr,
            recipients: qr.recipients.map((r) =>
              idsMatch(r.contractorId, contractorId) ? { ...r, homeownerMarkedComplete: true } : r
            ),
          }
        )
      );
      // If they left a review, submit it
      if (review && currentHomeowner) {
        // Find the most recent confirmed/paid job for this contractor+homeowner pair
        const contractor = contractors.find((c) => idsMatch(c.id, contractorId));
        const job = contractor?.completedJobs?.find(
          (j) => idsMatch(j.homeownerId, currentHomeowner.id) &&
            (j.status === "confirmed" || j.status === "paid")
        );
        if (job) {
          try {
            await apiCall("reviews", {
              action: "create",
              contractorId,
              homeownerId: currentHomeowner.id,
              jobId: job.id,
              rating: review.rating,
              text: review.text,
            });
            // Update contractor reviews locally
            setContractors((prev) => prev.map((c) =>
              !idsMatch(c.id, contractorId) ? c : {
                ...c,
                reviews: [{ id: Date.now(), rating: review.rating, text: review.text, homeownerId: currentHomeowner.id, jobId: job.id, createdAt: new Date().toISOString() }, ...(c.reviews || [])]
              }
            ));
          } catch {
            // Review submit failed silently -- job still marked complete
          }
        }
      }
    } catch (err) {
      setConfirmation({ text: err.message, isError: true });
      setTimeout(() => setConfirmation(null), 5000);
    }
    setReviewPrompt(null);
  };

  // Auto-open quote modal if ?request=contractorId is in the URL
  // (set by the "Request a quote" button on the public profile page)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestId = params.get("request");
    if (!requestId || contractors.length === 0) return;
    const target = contractors.find((c) => String(c.id) === String(requestId));
    if (target) {
      if (currentHomeowner) {
        // Signed in — open quote modal directly
        setQuoteTargetContractors([target]);
        setShowQuoteModal(true);
      }
      // Whether signed in or not, clean up the URL param
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [contractors, currentHomeowner]);

  const filtered = useMemo(() => {
    return contractors.filter((c) => {
      if (c.status !== "approved" && c.status !== "pending_review") return false;
      if (contractorIsSuspended(c)) return false;
      if (tradeFilter !== "All trades" && c.trade !== tradeFilter) return false;
      if (cityFilter !== "All cities") {
        if (c.serviceArea.mode === "ALL_DFW") return true;
        const cityZips = INDEX.cityToZips.get(cityFilter);
        let covers = false;
        cityZips.forEach((z) => {
          if (c.serviceArea.zipCodes.has(z)) covers = true;
        });
        if (!covers) return false;
      }
      return true;
    });
  }, [contractors, tradeFilter, cityFilter]);

  const toggleSelect = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectedContractors = contractors.filter((c) => selectedIds.has(c.id));
  // Who a quote request actually goes to: a profile-popup / public-profile
  // "Request a quote" click targets that one contractor (quoteTargetContractors);
  // otherwise it's the checkbox selection. The modal and the submit handler
  // MUST use the same list -- they previously diverged, so a profile-initiated
  // request submitted the (possibly empty or unrelated) checkbox selection.
  const quoteContractors = quoteTargetContractors.length > 0 ? quoteTargetContractors : selectedContractors;
  const allCities = [...INDEX.cityToZips.keys()];

  // Build jobsToConfirm from homeownerJobs (independent of contractor objects)
  // so confirmation works even if the contractor isn't in the approved directory
  const jobsToConfirm = (homeownerJobs || [])
    .filter((job) => job.status === "pending_confirmation" && idsMatch(job.homeownerId, currentHomeowner?.id))
    .map((job) => ({
      job,
      contractor: contractors.find((c) => idsMatch(c.id, job.contractorId)) || {
        id: job.contractorId,
        businessName: "Contractor",
      },
    }));

  const myQuoteRequests = currentHomeowner
    ? quoteRequests.filter((qr) => idsMatch(qr.homeownerId, currentHomeowner.id))
    : [];

  // Count responded quotes the homeowner hasn't acted on yet, so returning
  // visitors see an in-app nudge (not just the email).
  const newResponseCount = myQuoteRequests.reduce((sum, qr) => {
    return sum + qr.recipients.filter(
      (r) => r.status === "responded" && !r.homeownerAccepted && !r.homeownerMarkedComplete && !r.jobReported
    ).length;
  }, 0);

  const handleSubmitQuote = async (form) => {
    try {
      const data = await apiCall("quotes", {
        action: "create",
        description: form.description,
        budget: form.budget,
        timeline: form.timeline,
        zip: form.zip,
        address: form.address || null,
        contractorIds: quoteContractors.map((c) => c.id),
      });

      // Upload photos in parallel after the quote request is created
      if (form.photos && form.photos.length > 0) {
        await Promise.allSettled(
          form.photos.map((photo) =>
            apiCall("quotes", {
              action: "uploadPhoto",
              quoteRequestId: data.quoteRequest.id,
              fileBase64: photo.base64,
              thumbnailBase64: photo.thumbnailBase64,
              fileName: photo.fileName,
              contentType: photo.contentType,
            })
          )
        );
      }

      setQuoteRequests((prev) => [data.quoteRequest, ...prev]);
      setShowQuoteModal(false);
      setConfirmation(`Quote request sent to ${quoteContractors.length} contractor${quoteContractors.length === 1 ? "" : "s"}.`);
      setSelectedIds(new Set());
      setQuoteTargetContractors([]);
      setTimeout(() => setConfirmation(null), 4000);
    } catch (err) {
      setConfirmation({ text: "Could not send quote request: " + err.message, isError: true });
      setTimeout(() => setConfirmation(null), 5000);
    }
  };

  const submitDispute = () => {
    onDisputeJob(disputingJob.contractorId, disputingJob.jobId, disputeNote);
    setDisputingJob(null);
    setDisputeNote("");
  };

  return (
    <div>
      {newResponseCount > 0 && (
        <button
          type="button"
          className="ph-response-banner"
          onClick={() => {
            document.getElementById("my-quote-requests")?.scrollIntoView({ behavior: "smooth" });
          }}
        >
          ▲ You have {newResponseCount} new quote response{newResponseCount === 1 ? "" : "s"} — tap to review
        </button>
      )}
      <div className="ph-trust-banner">
        <strong>No pay-per-lead. Ever.</strong>
        <span>
          Contractors never pay to be listed or to receive your request. They only pay a small percentage after
          a job is done and you've confirmed it — so nobody here is buying their way to the top of your search.
        </span>
        <span style={{ marginTop: 4, color: "rgba(253,251,246,0.6)", fontSize: 12 }}>
          ✓ All reviews are from verified completed jobs — not open to the public.
        </span>
      </div>

      {jobsToConfirm.length > 0 && (
        <div className="ph-section">
          <h3>Jobs awaiting your confirmation</h3>
          <p className="ph-muted small">
            A contractor reported one of these jobs as complete. Confirm the amount if it's correct, or dispute
            it if something's wrong — this is what starts their payment clock with the platform, not a charge to you.
          </p>
          {jobsToConfirm.map(({ contractor, job }) => {
            const hasQuote = job.quotedAmount != null;
            const isHigherThanQuoted = hasQuote && job.reportedAmount > job.quotedAmount;
            const delta = hasQuote ? job.reportedAmount - job.quotedAmount : null;
            const daysSinceReported = Math.floor((Date.now() - new Date(job.reportedAt).getTime()) / (24 * 60 * 60 * 1000));
            const daysUntilAutoConfirm = Math.max(0, AUTO_CONFIRM_DAYS - daysSinceReported);
            return (
              <div className={`ph-card ph-confirm-card ${isHigherThanQuoted ? "is-over-quote" : ""}`} key={job.id}>
                <div className="ph-qr-desc">{job.description}</div>
                <div className="ph-card-meta">
                  <span>{contractor.businessName}</span>
                </div>

                <div className="ph-confirm-amounts">
                  {hasQuote && (
                    <div className="ph-confirm-amount-row">
                      <span className="ph-confirm-amount-label">Originally quoted</span>
                      <span className="ph-confirm-amount-value">${job.quotedAmount.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="ph-confirm-amount-row">
                    <span className="ph-confirm-amount-label">Invoice total</span>
                    <span className={`ph-confirm-amount-value ${isHigherThanQuoted ? "is-higher" : ""}`}>
                      ${job.reportedAmount.toLocaleString()}
                    </span>
                  </div>
                </div>

                {job.invoiceLineItems && job.invoiceLineItems.length > 0 && (
                  <button
                    type="button"
                    className="ph-btn-secondary"
                    style={{ fontSize: 12, padding: "5px 12px", alignSelf: "flex-start" }}
                    onClick={() => {
                      window.open(`/quote-preview?contractor=${encodeURIComponent(contractor.businessName)}&trade=${encodeURIComponent(contractor.trade || "")}&customer=${encodeURIComponent(job.homeownerName || "")}&address=${encodeURIComponent(job.address || "")}&description=${encodeURIComponent(job.description)}&items=${encodeURIComponent(JSON.stringify(job.invoiceLineItems))}&total=${job.reportedAmount}&message=${encodeURIComponent(job.invoiceNote || "")}&type=invoice`, "_blank", "noopener,noreferrer");
                    }}
                  >
                    View invoice →
                  </button>
                )}

                {isHigherThanQuoted && (
                  <div className="ph-confirm-warning">
                    ⚠ This is ${delta.toLocaleString()} more than the original quote of ${job.quotedAmount.toLocaleString()}.
                    If the scope of work didn't change, dispute this before confirming.
                  </div>
                )}

                <div
                  className="ph-auto-confirm-notice"
                  style={{
                    background: daysUntilAutoConfirm <= 2 ? "#FAE5DE" : "#E3EEDF",
                    border: `1px solid ${daysUntilAutoConfirm <= 2 ? "#E3BCA8" : "#c7e0c2"}`,
                    color: daysUntilAutoConfirm <= 2 ? "#A8442B" : "#2C6B3F",
                  }}
                >
                  {daysUntilAutoConfirm <= 0
                    ? "This will be automatically confirmed shortly if no action is taken."
                    : `If you don't confirm or dispute within ${daysUntilAutoConfirm} day${daysUntilAutoConfirm === 1 ? "" : "s"}, it'll be automatically confirmed.`}
                </div>

                <div className="ph-inbox-actions">
                  <button className="ph-btn-primary" onClick={() => onConfirmJob(contractor.id, job.id)}>
                    Confirm — that's correct
                  </button>
                  <button
                    className="ph-btn-secondary"
                    onClick={() => setDisputingJob({ contractorId: contractor.id, jobId: job.id })}
                  >
                    Dispute
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Auto-scrolling trade marquee */}
      <div className="ph-marquee-wrap">
        <div className="ph-marquee-track">
          {[...TRADES, ...TRADES].map((t, i) => (
            <button
              key={i}
              type="button"
              className={`ph-trade-pill ${tradeFilter === t ? "is-active" : ""}`}
              onClick={() => setTradeFilter(tradeFilter === t ? "All trades" : t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="ph-filter-bar">
        <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)}>
          <option>All cities</option>
          {allCities.map((c) => <option key={c}>{c}</option>)}
        </select>
        <button
          type="button"
          className={tradeFilter !== "All trades" ? "ph-btn-primary" : "ph-btn-secondary"}
          style={{ fontSize: 13 }}
          onClick={() => setShowTradeModal(true)}
        >
          {tradeFilter !== "All trades" ? `✕ ${tradeFilter}` : "Filter by trade"}
        </button>
        <div className="ph-filter-spacer" />
        <div className="ph-selected-pill">
          {selectedIds.size} selected
        </div>
        <button
          type="button"
          className="ph-btn-primary"
          disabled={selectedIds.size === 0}
          onClick={() => {
            // Signed-out visitors can browse and select contractors, but need
            // an account to actually submit a request -- prompt sign-in here
            // rather than letting them fill out the whole form first.
            if (!currentHomeowner) {
              onRequireAuth?.();
              return;
            }
            // Block if homeowner has any completed jobs without a review
            // Check 1: jobs homeowner marked complete but hasn't reviewed
            const hasUnreviewedMarked = myQuoteRequests.some((qr) =>
              qr.recipients.some((r) => {
                if (!r.homeownerMarkedComplete) return false;
                const c = contractors.find((con) => idsMatch(con.id, r.contractorId));
                const job = c?.completedJobs?.find(
                  (j) => idsMatch(j.homeownerId, currentHomeowner?.id) &&
                    (j.status === "confirmed" || j.status === "paid")
                );
                if (!job) return false;
                return !c?.reviews?.some((rev) =>
                  idsMatch(rev.homeownerId, currentHomeowner?.id) && idsMatch(rev.jobId, job.id)
                );
              })
            );
            // Check 2: contractor-reported confirmed/paid jobs without a review
            const hasUnreviewedConfirmed = contractors.some((c) =>
              (c.completedJobs || []).some((job) => {
                if (!idsMatch(job.homeownerId, currentHomeowner?.id)) return false;
                if (job.status !== "confirmed" && job.status !== "paid") return false;
                return !c.reviews?.some((rev) =>
                  idsMatch(rev.homeownerId, currentHomeowner?.id) && idsMatch(rev.jobId, job.id)
                );
              })
            );
            const hasUnreviewed = hasUnreviewedMarked || hasUnreviewedConfirmed;

            // Build the list of unreviewed jobs for the inline review modal
            const unreviewedJobs = [];
            myQuoteRequests.forEach((qr) => {
              qr.recipients.forEach((r) => {
                if (!r.homeownerMarkedComplete) return;
                const c = contractors.find((con) => idsMatch(con.id, r.contractorId));
                const job = c?.completedJobs?.find(
                  (j) => idsMatch(j.homeownerId, currentHomeowner?.id) &&
                    (j.status === "confirmed" || j.status === "paid")
                );
                if (!job) return;
                const hasReview = c?.reviews?.some((rev) =>
                  idsMatch(rev.homeownerId, currentHomeowner?.id) && idsMatch(rev.jobId, job.id)
                );
                if (!hasReview) {
                  unreviewedJobs.push({
                    jobId: job.id,
                    contractorId: c.id,
                    contractorName: c.businessName,
                    description: qr.description,
                    homeownerId: currentHomeowner.id,
                  });
                }
              });
            });

            if (hasUnreviewed) {
              setUnreviewedJobsForGate(unreviewedJobs);
              setShowReviewGate(true);
            } else {
              setShowQuoteModal(true);
            }
          }}
        >
          Request a quote
        </button>
      </div>

      {/* Trade filter modal -- slides up from bottom, 2-col icon grid */}
      {showTradeModal && (
        <div className="ph-trade-modal-overlay" onClick={() => setShowTradeModal(false)}>
          <div className="ph-trade-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ph-trade-modal-handle" />
            <div className="ph-trade-modal-header">
              <span className="ph-trade-modal-title">Filter by trade</span>
              <button className="ph-trade-modal-close" onClick={() => setShowTradeModal(false)}>×</button>
            </div>
            <button className="ph-trade-all-btn" onClick={() => { setTradeFilter("All trades"); setShowTradeModal(false); }}>
              <div className="ph-trade-all-icon"><i className="ti ti-layout-grid" style={{ color: "#fff", fontSize: 12 }} aria-hidden="true" /></div>
              <span className="ph-trade-all-label">All trades</span>
            </button>
            <div className="ph-trade-modal-body">
              <div className="ph-trade-modal-grid">
                {[
                  { cat: "Exterior", trades: [
                    { name: "Roofing", icon: "ti-home" },
                    { name: "Fencing", icon: "ti-border-all" },
                    { name: "Gutters & Drainage", icon: "ti-droplet" },
                    { name: "Siding & Exterior", icon: "ti-building" },
                    { name: "Windows & Doors", icon: "ti-window" },
                    { name: "Painting — Exterior", icon: "ti-paint" },
                  ]},
                  { cat: "Landscaping & Outdoor", trades: [
                    { name: "Landscaping & Lawn Care", icon: "ti-plant" },
                    { name: "Mulch & Hardscape", icon: "ti-shovel" },
                    { name: "Tree Service", icon: "ti-tree" },
                    { name: "Irrigation & Sprinklers", icon: "ti-ripple" },
                    { name: "Pool & Spa", icon: "ti-waves" },
                    { name: "Outdoor Lighting", icon: "ti-bulb" },
                    { name: "Concrete & Driveways", icon: "ti-road" },
                  ]},
                  { cat: "Mechanical & Systems", trades: [
                    { name: "HVAC", icon: "ti-snowflake" },
                    { name: "Plumbing", icon: "ti-tool" },
                    { name: "Electrical", icon: "ti-bolt" },
                    { name: "Insulation", icon: "ti-stack" },
                    { name: "Solar", icon: "ti-solar-panel" },
                    { name: "Home Automation", icon: "ti-device-laptop" },
                  ]},
                  { cat: "Interior", trades: [
                    { name: "Painting — Interior", icon: "ti-brush" },
                    { name: "Flooring", icon: "ti-layout-board" },
                    { name: "Tile & Stonework", icon: "ti-grid-pattern" },
                    { name: "Carpentry & Trim", icon: "ti-axe" },
                    { name: "Kitchen Remodel", icon: "ti-chef-hat" },
                    { name: "Bathroom Remodel", icon: "ti-bath" },
                    { name: "Basement & Additions", icon: "ti-stairs" },
                  ]},
                  { cat: "Maintenance & Cleaning", trades: [
                    { name: "Pressure Washing", icon: "ti-wash" },
                    { name: "House Cleaning", icon: "ti-sparkles" },
                    { name: "Junk Removal", icon: "ti-trash" },
                    { name: "Pest Control", icon: "ti-bug" },
                    { name: "Chimney & Fireplace", icon: "ti-flame" },
                  ]},
                  { cat: "Youth & Student Businesses", trades: [
                    { name: "Car Detailing", icon: "ti-car" },
                    { name: "Window Cleaning", icon: "ti-window" },
                    { name: "Gutter Cleaning", icon: "ti-droplet-half" },
                    { name: "Holiday Lighting", icon: "ti-christmas-tree" },
                    { name: "Moving Help", icon: "ti-package" },
                    { name: "Furniture Assembly", icon: "ti-armchair" },
                    { name: "TV & Electronics Setup", icon: "ti-device-tv" },
                    { name: "Garage Organization", icon: "ti-box" },
                  ]},
                  { cat: "General", trades: [
                    { name: "General Contractor", icon: "ti-hammer" },
                    { name: "Handyman", icon: "ti-tools" },
                  ]},
                ].map(({ cat, trades }) => (
                  <React.Fragment key={cat}>
                    <div className="ph-trade-category-label">{cat}</div>
                    {trades.map(({ name, icon }) => (
                      <button
                        key={name}
                        className={`ph-trade-modal-item ${tradeFilter === name ? "is-active" : ""}`}
                        onClick={() => { setTradeFilter(name); setShowTradeModal(false); }}
                      >
                        <div className="ph-trade-item-icon">
                          <i className={`ti ${icon}`} aria-hidden="true" />
                        </div>
                        <span className="ph-trade-item-label">{name}</span>
                      </button>
                    ))}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmation && (
        <div className={`ph-confirmation ${typeof confirmation === "object" && confirmation.isError ? "ph-confirmation-error" : ""}`}>
          {typeof confirmation === "object" ? confirmation.text : confirmation}
        </div>
      )}

      <div className="ph-directory-grid">
        {filtered.map((c) => (
          <ContractorCard
            key={c.id}
            contractor={c}
            selected={selectedIds.has(c.id)}
            onToggleSelect={toggleSelect}
            onViewProfile={setProfileContractor}
            isFavorite={!!currentHomeowner && currentHomeowner.favoriteContractorIds.includes(c.id)}
            onToggleFavorite={currentHomeowner ? onToggleFavorite : null}
          />
        ))}
        {filtered.length === 0 && (
          <div className="ph-empty">
            {tradeFilter !== "All trades" || cityFilter !== "All cities" ? (
              <>
                <strong>No contractors match these filters yet.</strong>
                <p className="ph-muted small" style={{ marginTop: 6 }}>
                  Try removing a filter to see more. We're adding contractors across DFW regularly.
                </p>
                <button
                  type="button"
                  className="ph-btn-secondary"
                  style={{ marginTop: 10 }}
                  onClick={() => { setTradeFilter("All trades"); setCityFilter("All cities"); }}
                >
                  Clear filters
                </button>
              </>
            ) : (
              <>
                <strong>No contractors listed here just yet.</strong>
                <p className="ph-muted small" style={{ marginTop: 6 }}>
                  Harry's List is growing across Dallas–Fort Worth — new contractors are being added regularly.
                  Check back soon, or send a request and we'll help connect you.
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {currentHomeowner && myQuoteRequests.length > 0 && (
        <div className="ph-section" id="my-quote-requests">
          <h3>Your quote requests</h3>
          {myQuoteRequests.map((qr) => (
            <div className="ph-qr-card" key={qr.id}>
              <div className="ph-qr-desc">{qr.description}</div>
              <div className="ph-qr-meta">{qr.timeline}{qr.budget ? ` · Budget ${qr.budget}` : ""}</div>
              <div className="ph-qr-recipients">
                {qr.recipients.map((r) => {
                  const c = contractors.find((c) => idsMatch(c.id, r.contractorId));
                  return (
                    <div className="ph-qr-recipient-row" key={r.contractorId}>
                      <span className="ph-qr-recipient-name">{c ? c.businessName : "Contractor"}</span>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                        {r.status === "responded" && r.quote ? (
                          <div style={{ textAlign: "right" }}>
                            <span className="ph-qr-recipient-quote">
                              <span className="ph-qr-quote-price">${r.quote.price.toLocaleString()}</span>
                              {r.quote.message && <span className="ph-muted small"> — {r.quote.message}</span>}
                            </span>
                            {r.quote.lineItems && r.quote.lineItems.length > 0 && (
                              <div style={{ marginTop: 8 }}>
                                <button
                                  type="button"
                                  className="ph-btn-secondary"
                                  style={{ fontSize: 11, padding: "4px 10px" }}
                                  onClick={() => {
                                    const contractor = contractors.find((con) => idsMatch(con.id, r.contractorId));
                                    window.open(`/quote-preview?contractor=${encodeURIComponent(contractor?.businessName || "Contractor")}&trade=${encodeURIComponent(contractor?.trade || "")}&description=${encodeURIComponent(qr.description)}&items=${encodeURIComponent(JSON.stringify(r.quote.lineItems))}&total=${r.quote.price}&message=${encodeURIComponent(r.quote.message || "")}`, "_blank", "noopener,noreferrer");
                                  }}
                                >
                                  View itemized quote →
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          (() => {
                            const c = contractors.find((con) => idsMatch(con.id, r.contractorId));
                            if (r.status === "sent" && c?.isSuspended) {
                              return <span className="ph-status-chip declined" title="This contractor has an overdue fee and is temporarily unlisted.">⚠ contractor suspended</span>;
                            }
                            return <span className={`ph-status-chip ${r.status}`}>{r.status}</span>;
                          })()
                        )}
                        {r.status === "responded" && !r.jobReported && !r.homeownerMarkedComplete && (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                            {!r.homeownerAccepted ? (
                              <button
                                className="ph-btn-primary"
                                style={{ fontSize: 11, padding: "5px 12px" }}
                                onClick={() => handleAcceptQuote(qr.id, r.contractorId)}
                              >
                                ✓ Accept quote
                              </button>
                            ) : (
                              <span className="ph-status-chip responded">✓ Accepted</span>
                            )}
                            <button
                              className="ph-btn-secondary"
                              style={{ fontSize: 11, padding: "3px 10px" }}
                              onClick={() => handleMarkComplete(qr.id, r.contractorId)}
                            >
                              Mark job as complete
                            </button>
                          </div>
                        )}
                        {r.homeownerMarkedComplete && !r.jobReported && (
                          <span className="ph-muted small" style={{ color: "#E8A33D" }}>⚠ You marked this complete — awaiting contractor report</span>
                        )}
                        {r.jobReported && (
                          <span className="ph-muted small" style={{ color: "#2C6B3F" }}>✓ Contractor reported</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {currentHomeowner && estimateRequests.filter((r) => r.status === "pending").length > 0 && (
        <div className="ph-section">
          <h3>Estimate requests from contractors</h3>
          <p className="ph-muted" style={{ marginBottom: 12 }}>A contractor wants to visit in person before quoting. Accept to share your phone number with them.</p>
          {estimateRequests.filter((r) => r.status === "pending").map((er) => (
            <div className="ph-qr-card" key={er.id} style={{ border: "1.5px solid #E8A33D" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10 }}>
                {er.contractor?.logoUrl ? (
                  <img src={er.contractor.logoUrl} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover" }} />
                ) : (
                  <div className="ph-avatar" style={{ width: 40, height: 40, fontSize: 14 }}>{er.contractor ? initials(er.contractor.businessName) : "?"}</div>
                )}
                <div>
                  <div style={{ fontWeight: 700, color: "var(--ph-ink)" }}>{er.contractor?.businessName || "Contractor"}</div>
                  <div className="ph-muted small">{er.contractor?.trade} · {er.contractor?.yearsInBusiness} years in business</div>
                </div>
              </div>
              {er.quoteDescription && <div className="ph-muted small" style={{ marginBottom: 8 }}>For: <em>{er.quoteDescription}</em></div>}
              {er.message && <p style={{ fontSize: 13.5, color: "var(--ph-ink-soft)", marginBottom: 12, fontStyle: "italic" }}>"{er.message}"</p>}
              <div className="ph-inbox-actions">
                <button className="ph-btn-primary" onClick={() => handleRespondToEstimate(er.id, "accepted")}>
                  Accept & share my phone
                </button>
                <button className="ph-btn-secondary" onClick={() => handleRespondToEstimate(er.id, "declined")}>
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {reviewPrompt && (
        <ReviewPromptModal
          contractorName={reviewPrompt.contractorName}
          onSubmit={(review) => submitMarkComplete(reviewPrompt.quoteRequestId, reviewPrompt.contractorId, review)}
          onSkip={() => setReviewPrompt(null)}
        />
      )}
      {showReviewGate && (
        <ReviewGateModal
          onClose={() => {
            setShowReviewGate(false);
            setShowQuoteModal(true); // open quote modal after all reviews done
          }}
          unreviewedJobs={unreviewedJobsForGate}
          onReviewSubmitted={async (job, review) => {
            await apiCall("reviews", {
              action: "create",
              contractorId: job.contractorId,
              homeownerId: job.homeownerId,
              jobId: job.jobId,
              rating: review.rating,
              text: review.text,
            });
            // Update contractor reviews locally
            setContractors((prev) => prev.map((c) =>
              !idsMatch(c.id, job.contractorId) ? c : {
                ...c,
                reviews: [{ id: Date.now(), rating: review.rating, text: review.text, homeownerId: job.homeownerId, jobId: job.jobId, createdAt: new Date().toISOString() }, ...(c.reviews || [])]
              }
            ));
          }}
        />
      )}

      <ContractorProfileModal
        contractor={profileContractor}
        onClose={() => setProfileContractor(null)}
        currentHomeowner={currentHomeowner}
        onToggleThumbsUp={onToggleThumbsUp}
        onRequireAuth={onRequireAuth}
        onRequestQuote={(c) => {
          setProfileContractor(null);
          setQuoteTargetContractors([c]);
          setShowQuoteModal(true);
        }}
      />
      {showQuoteModal && (
        <QuoteRequestModal
          contractors={quoteContractors}
          onClose={() => { setShowQuoteModal(false); setQuoteTargetContractors([]); }}
          onSubmit={handleSubmitQuote}
          defaultZip={currentHomeowner ? currentHomeowner.zip : ""}
        />
      )}
      {disputingJob && (
        <Modal onClose={() => setDisputingJob(null)}>
          <div className="ph-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="ph-modal-close" onClick={() => setDisputingJob(null)} aria-label="Close">×</button>
            <h2>Dispute this job amount</h2>
            <p className="ph-muted small">
              The contractor will see your note and can send a corrected amount for you to confirm.
              This doesn't affect any conversation you're having with them directly.
            </p>
            <label className="ph-field">
              <span>What's wrong with the reported amount?</span>
              <textarea
                rows={3}
                value={disputeNote}
                onChange={(e) => setDisputeNote(e.target.value)}
                placeholder="e.g. We agreed on $1,400, not $1,850."
              />
            </label>
            <button className="ph-btn-primary" onClick={submitDispute}>
              Submit dispute
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contractor onboarding / profile editor
// ---------------------------------------------------------------------------
function ContractorOnboarding({ onCreate, onEdit, editingContractor }) {
  const isEditing = !!editingContractor;

  const [businessName, setBusinessName] = useState(editingContractor ? editingContractor.businessName : "");
  const [trade, setTrade] = useState(editingContractor ? editingContractor.trade : TRADES[0]);
  const [bio, setBio] = useState(editingContractor ? editingContractor.bio : "");
  const [years, setYears] = useState(editingContractor ? String(editingContractor.yearsInBusiness || "") : "");
  const [license, setLicense] = useState(editingContractor && editingContractor.licenseInfo !== "Not provided" ? editingContractor.licenseInfo : "");
  const [serviceArea, setServiceArea] = useState(
    editingContractor
      ? {
          mode: editingContractor.serviceArea.mode,
          zipCodes: new Set(editingContractor.serviceArea.zipCodes),
        }
      : { mode: "CUSTOM", zipCodes: new Set() }
  );
  const [logoFile, setLogoFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const canSubmit = businessName.trim() && bio.trim() && resolveSelection(serviceArea).size > 0 && !submitting;

  // Load a decoded <img> onto a 200px white-background canvas and stage it as a
  // small PNG. Final step for every logo, whatever the source format was.
  const stageLogoFromImage = (img) => {
    const size = 200;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    const pad = 12;
    const scale = Math.min((size - pad * 2) / img.width, (size - pad * 2) / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    const dataUrl = canvas.toDataURL("image/png");
    setLogoFile({ base64: dataUrl.split(",")[1], fileName: "logo.png", contentType: "image/png", previewUrl: dataUrl });
    setSubmitError(null);
  };

  // Load any Blob/File into an <img>, then stage it. onFail runs if it can't decode.
  const loadBlobAndStage = (blob, onFail) => {
    const img = new Image();
    const u = URL.createObjectURL(blob);
    img.onload = () => { URL.revokeObjectURL(u); stageLogoFromImage(img); };
    img.onerror = () => { URL.revokeObjectURL(u); onFail(); };
    img.src = u;
  };

  // Lazily pull the HEIC->JPEG converter from CDN, only when we actually hit a
  // HEIC file -- keeps the library off the normal upload path.
  const loadHeicConverter = () =>
    new Promise((resolve, reject) => {
      if (typeof window !== "undefined" && window.heic2any) return resolve(window.heic2any);
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js";
      s.async = true;
      s.onload = () => (window.heic2any ? resolve(window.heic2any) : reject(new Error("converter unavailable")));
      s.onerror = () => reject(new Error("converter failed to load"));
      document.head.appendChild(s);
    });

  // Convert a (likely HEIC / iPhone) photo to JPEG, then stage it.
  const convertAndStageLogo = (file) => {
    setSubmitError("Converting your photo… one sec.");
    loadHeicConverter()
      .then((heic2any) => heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 }))
      .then((out) => {
        const jpeg = Array.isArray(out) ? out[0] : out;
        loadBlobAndStage(jpeg, () => setSubmitError("We couldn't read that photo. Please try a different one."));
      })
      .catch(() => setSubmitError("We couldn't read that photo. Please try a different one (a screenshot works too)."));
  };

  const handleLogoPick = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setSubmitError("That image is very large (over 20MB) — please pick a smaller one.");
      return;
    }
    const isHeic = /\.(heic|heif)$/i.test(file.name) || file.type === "image/heic" || file.type === "image/heif";
    if (isHeic) {
      convertAndStageLogo(file);
      return;
    }
    // Normal formats load directly. If the browser still can't decode it (e.g.
    // an iPhone HEIC that arrived with a .jpg name), fall back to conversion.
    loadBlobAndStage(file, () => convertAndStageLogo(file));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (isEditing) {
        await onEdit(
          editingContractor.id,
          {
            businessName,
            trade,
            yearsInBusiness: Number(years) || 0,
            bio,
            licenseInfo: license || "Not provided",
            serviceArea,
            // status is intentionally NOT sent -- it's managed server-side
            // (an approved listing goes to re-review automatically when a
            // sensitive field changes; see updateMyContractor).
          },
          logoFile
        );
      } else {
        await onCreate(
          {
            businessName,
            trade,
            yearsInBusiness: Number(years) || 0,
            bio,
            licenseInfo: license || "Not provided",
            serviceArea,
            status: "pending",
            thumbsUp: 0,
            thumbsDown: 0,
            reviews: [],
          },
          logoFile
        );
      }
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ph-onboard">
      <h2>{isEditing ? "Edit your contractor profile" : "Build your contractor profile"}</h2>
      <p className="ph-muted">
        {isEditing
          ? "Update your profile and resubmit it for review. It will go back to pending until an admin reviews it again."
          : "Your profile is what homeowners see in the directory. You can't post ads here — homeowners browse and choose who to send quote requests to."}
      </p>

      <label className="ph-field">
        <span>Business name</span>
        <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="e.g. Preston Hollow Mulchachos" />
      </label>

      <div className="ph-field-row">
        <label className="ph-field">
          <span>Trade / category</span>
          <select value={trade} onChange={(e) => setTrade(e.target.value)}>
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
        <label className="ph-field">
          <span>Years in business</span>
          <input value={years} onChange={(e) => setYears(e.target.value)} placeholder="3" />
        </label>
      </div>

      <label className="ph-field">
        <span>Bio</span>
        <textarea rows={3} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="What you do and what makes your work stand out." />
      </label>

      <label className="ph-field">
        <span>License / insurance info (optional for now)</span>
        <input value={license} onChange={(e) => setLicense(e.target.value)} placeholder="e.g. Insured — General Liability on file" />
      </label>

      <label className="ph-field">
        <span>Logo {isEditing ? "(leave blank to keep your current logo)" : "(optional)"}</span>
        <input type="file" accept="image/*" onChange={handleLogoPick} />
        {logoFile ? (
          <div className="ph-logo-preview">
            <img src={logoFile.previewUrl} alt="Logo preview" />
            <span className="ph-muted small">{logoFile.fileName}</span>
          </div>
        ) : (
          isEditing &&
          editingContractor.logoUrl && (
            <div className="ph-logo-preview">
              <img src={editingContractor.logoUrl} alt="Current logo" />
              <span className="ph-muted small">Current logo</span>
            </div>
          )
        )}
        <p className="ph-muted small">PNG, JPEG, or WebP, under 5MB.</p>
      </label>

      <div className="ph-field">
        <span>Service area</span>
        <p className="ph-muted small">
          Pick every zip code, city, or region you're willing to drive to. Homeowners outside this area won't see you in their search.
        </p>
        <ServiceAreaPicker selection={serviceArea} onChange={setServiceArea} />
      </div>

      {submitError && <p className="ph-stripe-inline-error">{submitError}</p>}

      <button type="button" className="ph-btn-primary" disabled={!canSubmit} onClick={handleSubmit}>
        {submitting ? "Submitting…" : isEditing ? "Resubmit for approval" : "Submit profile for approval"}
      </button>
      {!canSubmit && !submitting && (() => {
        const missing = [];
        if (!businessName.trim()) missing.push("business name");
        if (!bio.trim()) missing.push("a short bio");
        if (resolveSelection(serviceArea).size === 0) missing.push("at least one service area zip");
        return missing.length > 0 ? (
          <p className="ph-muted small" style={{ marginTop: 8, textAlign: "center" }}>
            Still need: {missing.join(", ")}.
          </p>
        ) : null;
      })()}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contractor inbox view
// ---------------------------------------------------------------------------

/** A report is "low" if it's more than 10% below the contractor's quoted price.
 *  Must match LOW_REPORT_THRESHOLD in jobs.js. */
const LOW_REPORT_THRESHOLD = 0.10;

function checkIsLowReport(qr, contractorId, amount) {
  const myRecipient = qr.recipients.find((r) => idsMatch(r.contractorId, contractorId));
  const quotedPrice = myRecipient?.quote?.price;
  if (!quotedPrice || quotedPrice <= 0) return false;
  return amount < quotedPrice * (1 - LOW_REPORT_THRESHOLD);
}

/** Fetches and displays photos attached to a quote request. Lazy -- only loads when the card is rendered. */
function QuotePhotos({ quoteRequestId }) {
  const [photos, setPhotos] = useState([]);
  const [lightbox, setLightbox] = useState(null);

  useEffect(() => {
    let cancelled = false;
    apiCall("quotes", { action: "listPhotos", quoteRequestId })
      .then((data) => { if (!cancelled && data.photos?.length > 0) setPhotos(data.photos); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [quoteRequestId]);

  if (photos.length === 0) return null;

  return (
    <div>
      <div className="ph-muted small" style={{ marginBottom: 6, fontWeight: 600 }}>Photos from homeowner</div>
      <div className="ph-quote-photo-grid">
        {photos.map((photo) => (
          <div
            className="ph-quote-photo-item"
            key={photo.id}
            role="button"
            tabIndex={0}
            aria-label="View job photo full size"
            onClick={() => setLightbox(photo.publicUrl)}
            onKeyDown={activateOnKey(() => setLightbox(photo.publicUrl))}
            style={{ cursor: "zoom-in" }}
          >
            <img src={photo.thumbnailUrl} alt="Job photo" className="ph-quote-photo-img" loading="lazy" />
          </div>
        ))}
      </div>
      {lightbox && (
        <div className="cd-lightbox" onClick={() => setLightbox(null)}>
          <button className="ph-modal-close" onClick={() => setLightbox(null)} aria-label="Close">×</button>
          <img src={lightbox} alt="Full size" className="cd-lightbox-img" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

function ContractorInbox({ contractor, quoteRequests, onRespond, onReportJob, onEditProfile }) {
  const [reportingFor, setReportingFor] = useState(null);
  const [amountInput, setAmountInput] = useState("");
  const [lowReportReason, setLowReportReason] = useState("");
  const [invoiceLineItems, setInvoiceLineItems] = useState([]);
  const [invoiceNote, setInvoiceNote] = useState("");
  const [composingFor, setComposingFor] = useState(null);
  const [quotePrice, setQuotePrice] = useState("");
  const [quoteMessage, setQuoteMessage] = useState("");
  const [requestingEstimateFor, setRequestingEstimateFor] = useState(null);
  const [estimateMessage, setEstimateMessage] = useState("");
  const [estimateSubmitting, setEstimateSubmitting] = useState(false);
  const [estimateSuccess, setEstimateSuccess] = useState(new Set()); // quoteRequestIds that were sent

  const handleRequestEstimate = async (qrId) => {
    setEstimateSubmitting(true);
    try {
      await apiCall("estimates", { action: "request", quoteRequestId: qrId, message: estimateMessage.trim() || null });
      setEstimateSuccess((prev) => new Set([...prev, qrId]));
      setRequestingEstimateFor(null);
      setEstimateMessage("");
    } catch (err) {
      setEstimateMessage(err.message);
    } finally {
      setEstimateSubmitting(false);
    }
  };

  const myRequests = quoteRequests.filter((qr) =>
    qr.recipients.some((r) => idsMatch(r.contractorId, contractor.id))
  );

  if (contractor.status === "pending") {
    return (
      <div className="ph-pending-banner">
        <strong>Your profile is pending approval.</strong>
        <p>Once approved, you'll start receiving quote requests from homeowners in your service area.</p>
      </div>
    );
  }

  if (contractor.status === "rejected") {
    return (
      <div className="ph-rejected-banner">
        <strong>Your profile wasn't approved.</strong>
        <p>
          This listing isn't visible to homeowners and won't receive quote requests. You can edit your profile
          — for example with updated license/insurance info or a clearer bio — and resubmit it for review.
        </p>
        <button type="button" className="ph-btn-primary" onClick={() => onEditProfile(contractor)}>
          Edit profile
        </button>
      </div>
    );
  }

  const startReporting = (qr) => {
    setReportingFor(qr.id);
    setLowReportReason("");
    setInvoiceNote("");
    // Pre-fill invoice from quote line items if they exist
    const myRecipient = qr.recipients.find((r) => idsMatch(r.contractorId, contractor.id));
    if (myRecipient?.quote?.lineItems && myRecipient.quote.lineItems.length > 0) {
      setInvoiceLineItems(myRecipient.quote.lineItems.map((item) => ({ ...item })));
    } else {
      // Fall back to single line item pre-filled with quote price
      const quotedPrice = myRecipient?.quote?.price;
      setInvoiceLineItems([{ description: qr.description, qty: 1, unitPrice: quotedPrice ? String(quotedPrice) : "" }]);
    }
  };

  const invoiceTotal = invoiceLineItems.reduce((sum, item) => {
    return sum + (parseFloat(item.qty) || 1) * (parseFloat(item.unitPrice) || 0);
  }, 0);

  const addInvoiceLineItem = () => setInvoiceLineItems((prev) => [...prev, { description: "", qty: 1, unitPrice: "" }]);
  const removeInvoiceLineItem = (i) => setInvoiceLineItems((prev) => prev.filter((_, idx) => idx !== i));
  const updateInvoiceLineItem = (i, field, value) => setInvoiceLineItems((prev) => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item));

  const submitReport = (qr) => {
    const amount = invoiceTotal;
    if (!amount || amount <= 0) return;
    const myRecipient = qr.recipients.find((r) => idsMatch(r.contractorId, contractor.id));
    const quotedPrice = myRecipient?.quote?.price;
    const isLow = quotedPrice && amount < quotedPrice * 0.9;
    if (isLow && !lowReportReason.trim()) return;
    const validItems = invoiceLineItems.filter((l) => l.description.trim() && parseFloat(l.unitPrice) > 0);
    onReportJob(qr, amount, lowReportReason.trim() || undefined, validItems.length > 0 ? validItems : null, invoiceNote.trim() || undefined);
    setReportingFor(null);
    setInvoiceLineItems([]);
    setLowReportReason("");
    setInvoiceNote("");
  };

  const [lineItems, setLineItems] = useState([{ description: "", qty: 1, unitPrice: "" }]);
  const [showLineItems, setShowLineItems] = useState(false);

  const startComposing = (qr) => {
    setComposingFor(qr.id);
    setQuotePrice("");
    setQuoteMessage("");
    setLineItems([{ description: "", qty: 1, unitPrice: "" }]);
    setShowLineItems(false);
  };

  const lineItemsTotal = lineItems.reduce((sum, item) => {
    const price = parseFloat(item.unitPrice) || 0;
    const qty = parseFloat(item.qty) || 1;
    return sum + price * qty;
  }, 0);

  const addLineItem = () => setLineItems((prev) => [...prev, { description: "", qty: 1, unitPrice: "" }]);
  const removeLineItem = (i) => setLineItems((prev) => prev.filter((_, idx) => idx !== i));
  const updateLineItem = (i, field, value) => setLineItems((prev) => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item));

  const submitQuote = (qr) => {
    const validLineItems = showLineItems ? lineItems.filter((l) => l.description.trim() && parseFloat(l.unitPrice) > 0) : [];
    const price = showLineItems ? lineItemsTotal : parseFloat(quotePrice);
    if (!price || price <= 0) return;
    onRespond(qr.id, contractor.id, "responded", {
      price,
      message: quoteMessage.trim(),
      lineItems: validLineItems.length > 0 ? validLineItems : null,
    });
    setComposingFor(null);
    setQuotePrice("");
    setQuoteMessage("");
    setLineItems([{ description: "", qty: 1, unitPrice: "" }]);
    setShowLineItems(false);
  };

  const [acceptedEstimates, setAcceptedEstimates] = React.useState([]);

  useEffect(() => {
    let cancelled = false;
    apiCall("estimates", { action: "listForContractor" })
      .then((data) => { if (!cancelled) setAcceptedEstimates((data.estimateRequests || []).filter((r) => r.status === "accepted")); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [contractor.id]);

  return (
    <div>
      {contractor.status === "pending_review" && (
        <div className="ph-reviewing-notice">
          <strong>Your recent edit is being re-reviewed.</strong> Your listing is still live with your
          update -- this doesn't affect anything below.
        </div>
      )}
      {acceptedEstimates.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--ph-ink)", marginBottom: 12 }}>Accepted estimate requests</h3>
          {acceptedEstimates.map((er) => (
            <div className="ph-card" key={er.id} style={{ marginBottom: 10, border: "1.5px solid #4CAF50", background: "#F1FFF3" }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{er.quoteDescription}</div>
              {er.homeownerPhone ? (
                <div style={{ fontSize: 14, color: "var(--ph-ink)" }}>
                  📞 Homeowner's phone: <strong>{er.homeownerPhone}</strong>
                </div>
              ) : (
                <div className="ph-muted small">Homeowner hasn't added a phone number yet — they've been notified to add one.</div>
              )}
            </div>
          ))}
        </div>
      )}
      <h2>Quote requests</h2>
      {myRequests.length === 0 && (
        <div className="ph-empty" style={{ padding: "40px 0" }}>
          <strong>No quote requests yet.</strong>
          <p className="ph-muted small" style={{ marginTop: 6 }}>
            They'll appear here automatically as homeowners in your service area reach out.
            Adding portfolio photos and a clear bio helps you show up well when they do.
          </p>
        </div>
      )}
      {myRequests.map((qr) => {
        const myRecipient = qr.recipients.find((r) => idsMatch(r.contractorId, contractor.id));
        const myStatus = myRecipient?.status;
        const alreadyReported = myRecipient?.jobReported;
        const parsedAmount = parseFloat(amountInput) || 0;
        const lowReport = reportingFor === qr.id && checkIsLowReport(qr, contractor.id, parsedAmount);
        const quotedPrice = myRecipient?.quote?.price;

        return (
          <div className="ph-card ph-inbox-card" key={qr.id}>
            <div className="ph-qr-desc">{qr.description}</div>
            <div className="ph-card-meta">
              <span>Zip {qr.zip || "—"}</span>
              <span>Budget {qr.budget || "Not specified"}</span>
              <span>{qr.timeline}</span>
            </div>
            <QuotePhotos quoteRequestId={qr.id} />

            {myStatus === "sent" && composingFor === qr.id && (
              <div className="ph-compose-quote">
                {/* Toggle between simple price and itemized */}
                <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                  <button
                    type="button"
                    className={!showLineItems ? "ph-btn-primary" : "ph-btn-secondary"}
                    style={{ fontSize: 12, padding: "6px 14px" }}
                    onClick={() => setShowLineItems(false)}
                  >
                    Simple price
                  </button>
                  <button
                    type="button"
                    className={showLineItems ? "ph-btn-primary" : "ph-btn-secondary"}
                    style={{ fontSize: 12, padding: "6px 14px" }}
                    onClick={() => setShowLineItems(true)}
                  >
                    Itemized quote
                  </button>
                </div>

                {!showLineItems ? (
                  <label className="ph-field">
                    <span>Your price</span>
                    <div className="ph-report-row">
                      <span className="ph-report-prefix">$</span>
                      <input
                        className="ph-report-input"
                        value={quotePrice}
                        onChange={(e) => setQuotePrice(e.target.value)}
                        placeholder="450"
                        inputMode="decimal"
                        autoFocus
                      />
                    </div>
                  </label>
                ) : (
                  <div className="ph-line-items">
                    <div className="ph-line-items-header">
                      <span>Description</span>
                      <span>Qty</span>
                      <span>Unit price</span>
                      <span>Total</span>
                      <span></span>
                    </div>
                    {lineItems.map((item, i) => (
                      <div className="ph-line-item-row" key={i}>
                        <input
                          className="ph-line-item-desc"
                          value={item.description}
                          onChange={(e) => updateLineItem(i, "description", e.target.value)}
                          placeholder="e.g. Labor"
                        />
                        <input
                          className="ph-line-item-num"
                          value={item.qty}
                          onChange={(e) => updateLineItem(i, "qty", e.target.value)}
                          inputMode="decimal"
                          placeholder="1"
                        />
                        <input
                          className="ph-line-item-num"
                          value={item.unitPrice}
                          onChange={(e) => updateLineItem(i, "unitPrice", e.target.value)}
                          inputMode="decimal"
                          placeholder="0.00"
                        />
                        <span className="ph-line-item-total">
                          ${((parseFloat(item.qty) || 1) * (parseFloat(item.unitPrice) || 0)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <button
                          type="button"
                          className="ph-line-item-remove"
                          onClick={() => removeLineItem(i)}
                          disabled={lineItems.length === 1}
                        >×</button>
                      </div>
                    ))}
                    <button type="button" className="ph-btn-secondary" style={{ fontSize: 12, padding: "5px 12px", marginTop: 8 }} onClick={addLineItem}>
                      + Add line item
                    </button>
                    <div className="ph-line-items-total">
                      <span>Total</span>
                      <span>${lineItemsTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                )}

                <label className="ph-field" style={{ marginTop: 12 }}>
                  <span>Message to the homeowner (optional)</span>
                  <textarea
                    rows={3}
                    value={quoteMessage}
                    onChange={(e) => setQuoteMessage(e.target.value)}
                    placeholder="What's included, when you could start, anything they should know."
                  />
                </label>
                <div className="ph-inbox-actions">
                  <button
                    className="ph-btn-primary"
                    disabled={showLineItems ? lineItemsTotal <= 0 : !quotePrice || parseFloat(quotePrice) <= 0}
                    onClick={() => submitQuote(qr)}
                  >
                    Send quote to homeowner
                  </button>
                  <button className="ph-btn-secondary" onClick={() => setComposingFor(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {myStatus === "sent" && composingFor !== qr.id && (
              <div className="ph-inbox-actions">
                {estimateSuccess.has(qr.id) ? (
                  <span className="ph-status-chip" style={{ background: "#E3EEDF", color: "#2C6B3F" }}>✓ Estimate request sent</span>
                ) : requestingEstimateFor === qr.id ? (
                  <div style={{ width: "100%" }}>
                    <label className="ph-field" style={{ marginBottom: 8 }}>
                      <span>Message to homeowner (optional)</span>
                      <textarea
                        rows={2}
                        value={estimateMessage}
                        onChange={(e) => setEstimateMessage(e.target.value)}
                        placeholder="e.g. I'd like to see the scope of work before providing an accurate quote."
                      />
                    </label>
                    <div className="ph-inbox-actions">
                      <button className="ph-btn-primary" disabled={estimateSubmitting} onClick={() => handleRequestEstimate(qr.id)}>
                        {estimateSubmitting ? "Sending…" : "Send estimate request"}
                      </button>
                      <button className="ph-btn-secondary" onClick={() => { setRequestingEstimateFor(null); setEstimateMessage(""); }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button className="ph-btn-primary" onClick={() => startComposing(qr)}>
                      Send a quote
                    </button>
                    <button className="ph-btn-secondary" onClick={() => { setRequestingEstimateFor(qr.id); }}>
                      Request in-person estimate
                    </button>
                    <button className="ph-btn-secondary" onClick={() => onRespond(qr.id, contractor.id, "declined")}>
                      Decline
                    </button>
                  </>
                )}
              </div>
            )}

            {myStatus === "responded" && (
              <div className="ph-sent-quote-summary">
                <span className="ph-fee-owed-label">Your quote</span>
                <span className="ph-fee-owed-amount">${myRecipient.quote ? myRecipient.quote.price.toLocaleString() : "—"}</span>
                {myRecipient.quote && myRecipient.quote.message && (
                  <p className="ph-muted small">{myRecipient.quote.message}</p>
                )}
              </div>
            )}

            {myStatus === "responded" && !alreadyReported && (
              <div className="ph-inbox-actions">
                {reportingFor === qr.id ? (
                  <div className="ph-invoice-builder">
                    <div className="ph-invoice-builder-header">
                      <span>Invoice</span>
                      <span className="ph-muted small">Pre-filled from your quote — adjust if scope changed</span>
                    </div>

                    {/* Line items */}
                    <div className="ph-line-items">
                      <div className="ph-line-items-header">
                        <span>Description</span>
                        <span>Qty</span>
                        <span>Unit price</span>
                        <span>Total</span>
                        <span></span>
                      </div>
                      {invoiceLineItems.map((item, i) => (
                        <div className="ph-line-item-row" key={i}>
                          <input
                            className="ph-line-item-desc"
                            value={item.description}
                            onChange={(e) => updateInvoiceLineItem(i, "description", e.target.value)}
                            placeholder="e.g. Labor"
                          />
                          <input
                            className="ph-line-item-num"
                            value={item.qty}
                            onChange={(e) => updateInvoiceLineItem(i, "qty", e.target.value)}
                            inputMode="decimal"
                            placeholder="1"
                          />
                          <input
                            className="ph-line-item-num"
                            value={item.unitPrice}
                            onChange={(e) => updateInvoiceLineItem(i, "unitPrice", e.target.value)}
                            inputMode="decimal"
                            placeholder="0.00"
                          />
                          <span className="ph-line-item-total">
                            ${((parseFloat(item.qty) || 1) * (parseFloat(item.unitPrice) || 0)).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                          </span>
                          <button
                            type="button"
                            className="ph-line-item-remove"
                            onClick={() => removeInvoiceLineItem(i)}
                            disabled={invoiceLineItems.length === 1}
                          >×</button>
                        </div>
                      ))}
                      <button type="button" className="ph-btn-secondary" style={{ fontSize: 12, padding: "5px 12px", marginTop: 8 }} onClick={addInvoiceLineItem}>
                        + Add line item
                      </button>
                      <div className="ph-line-items-total">
                        <span>Invoice total</span>
                        <span>${invoiceTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>

                    {/* Low report warning */}
                    {quotedPrice && invoiceTotal > 0 && invoiceTotal < quotedPrice * 0.9 && (
                      <div className="ph-low-report-warning">
                        <span className="ph-low-report-label">
                          ⚠ This is more than 10% below your quoted price of ${quotedPrice?.toLocaleString() ?? "—"}. Please explain why.
                        </span>
                        <textarea
                          className="ph-low-report-reason"
                          rows={3}
                          value={lowReportReason}
                          onChange={(e) => setLowReportReason(e.target.value)}
                          placeholder="e.g. Homeowner asked us to skip the back beds — scope was reduced on-site."
                        />
                      </div>
                    )}

                    {/* Note */}
                    <label className="ph-field" style={{ marginTop: 8 }}>
                      <span>Note to homeowner (optional)</span>
                      <textarea
                        rows={2}
                        value={invoiceNote}
                        onChange={(e) => setInvoiceNote(e.target.value)}
                        placeholder="e.g. Thank you for your business! Payment due within 30 days."
                      />
                    </label>

                    <div className="ph-inbox-actions">
                      <button
                        className="ph-btn-primary"
                        disabled={invoiceTotal <= 0 || (quotedPrice && invoiceTotal < quotedPrice * 0.9 && !lowReportReason.trim())}
                        onClick={() => submitReport(qr)}
                      >
                        Send invoice & mark complete
                      </button>
                      <button className="ph-btn-secondary" onClick={() => setReportingFor(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span className="ph-status-chip responded">responded</span>
                    <button className="ph-btn-secondary" onClick={() => startReporting(qr)}>
                      Send invoice & mark complete
                    </button>
                  </>
                )}
              </div>
            )}

            {myStatus === "responded" && alreadyReported && (
              <div className="ph-inbox-actions">
                <span className="ph-status-chip responded">job reported</span>
              </div>
            )}

            {/* Show accepted badge when homeowner accepted the quote */}
            {myStatus === "responded" && !alreadyReported && myRecipient?.homeownerAccepted && (
              <div style={{ marginBottom: 8 }}>
                <span className="ph-status-chip responded">✓ Homeowner accepted your quote</span>
              </div>
            )}

            {/* Show address + phone when homeowner accepted */}
            {myRecipient?.homeownerAccepted && (qr.address || qr.homeownerPhone) && (
              <div style={{ marginTop: 4, marginBottom: 8, background: "var(--ph-green-tint)", border: "1px solid #c7e0c2", borderRadius: 8, padding: "10px 14px", fontSize: 13 }}>
                <div style={{ fontWeight: 700, color: "var(--ph-green-text)", marginBottom: 6 }}>📬 Homeowner contact info</div>
                {qr.address && <div style={{ color: "var(--ph-ink)", marginBottom: 2 }}>📍 {qr.address}</div>}
                {qr.homeownerPhone && <div style={{ color: "var(--ph-ink)" }}>📞 {qr.homeownerPhone}</div>}
              </div>
            )}

            {/* Show address + phone once homeowner marks complete (job confirmed) */}
            {myRecipient?.homeownerMarkedComplete && (qr.address || qr.homeownerPhone) && (
              <div style={{ marginTop: 8, background: "var(--ph-green-tint)", border: "1px solid #c7e0c2", borderRadius: 8, padding: "10px 14px", fontSize: 13 }}>
                <div style={{ fontWeight: 700, color: "var(--ph-green-text)", marginBottom: 6 }}>✓ Job confirmed — homeowner contact info</div>
                {qr.address && <div style={{ color: "var(--ph-ink)", marginBottom: 2 }}>📍 {qr.address}</div>}
                {qr.homeownerPhone && <div style={{ color: "var(--ph-ink)" }}>📞 {qr.homeownerPhone}</div>}
              </div>
            )}

            {myStatus !== "sent" && myStatus !== "responded" && (
              <div className="ph-inbox-actions">
                <span className={`ph-status-chip ${myStatus}`}>
                  {alreadyReported ? "job reported" : myStatus}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stripe checkout modal
// ---------------------------------------------------------------------------
function StripeCheckoutModal({ job, contractor, onClose, onSuccess }) {
  const [stage, setStage] = useState("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const elementsContainerRef = useRef(null);
  const stripeRef = useRef(null);
  const elementsRef = useRef(null);
  const paymentElementRef = useRef(null);

  const fee = feeOwedForAmount(job.reportedAmount);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (
        STRIPE_PUBLISHABLE_KEY.includes("REPLACE_WITH_YOUR") ||
        CREATE_PAYMENT_INTENT_URL.includes("YOUR-BACKEND-URL")
      ) {
        setStage("not_configured");
        return;
      }

      try {
        const Stripe = await loadStripeJs();
        if (cancelled) return;
        const stripe = Stripe(STRIPE_PUBLISHABLE_KEY);
        stripeRef.current = stripe;

        // Uses apiCall so the Supabase session token is attached (M-8): the
        // backend verifies the caller and that this job is theirs. contractorId
        // is resolved server-side from the session, so we no longer send it.
        const data = await apiCall("create-payment-intent", { jobId: job.id });
        if (cancelled) return;

        // Founding-member perk: the backend already settled this job as paid
        // with a $0 fee, so there's no Stripe payment to collect. Show the
        // waived state instead of mounting a payment form.
        if (data.feeWaived) {
          setStage("waived");
          return;
        }

        const elements = stripe.elements({ clientSecret: data.clientSecret });
        elementsRef.current = elements;
        const paymentElement = elements.create("payment");
        paymentElementRef.current = paymentElement;
        if (elementsContainerRef.current) {
          paymentElement.mount(elementsContainerRef.current);
        }
        setStage("ready");
      } catch (err) {
        if (!cancelled) {
          setErrorMessage(err.message || "Something went wrong starting the payment.");
          setStage("error");
        }
      }
    }

    init();
    return () => {
      cancelled = true;
      if (paymentElementRef.current) {
        paymentElementRef.current.unmount();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async () => {
    if (!stripeRef.current || !elementsRef.current) return;
    setStage("submitting");
    const { error } = await stripeRef.current.confirmPayment({
      elements: elementsRef.current,
      confirmParams: { return_url: window.location.href },
      redirect: "if_required",
    });
    if (error) {
      setErrorMessage(error.message || "Payment failed. Please try again.");
      setStage("ready");
      return;
    }
    onSuccess();
  };

  return (
    <Modal onClose={onClose}>
      <div className="ph-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="ph-modal-close" onClick={onClose} aria-label="Close">×</button>
        <h2>Pay platform fee</h2>
        <p className="ph-muted">
          {job.description} — <strong>${fee.toLocaleString()}</strong>
        </p>

        {stage === "not_configured" && (
          <div className="ph-stripe-config-notice">
            <strong>Stripe isn't configured yet.</strong>
            <p>
              This checkout uses real Stripe Elements, but it needs two things filled in before it can run:
              your Stripe publishable key (<code>STRIPE_PUBLISHABLE_KEY</code>) and your deployed backend's
              URL (<code>CREATE_PAYMENT_INTENT_URL</code>), both near the top of this file. See{" "}
              <code>backend/create-payment-intent.js</code> for the server-side function to deploy first —
              it creates the PaymentIntent that this form confirms.
            </p>
          </div>
        )}

        {stage === "loading" && <p className="ph-muted">Loading secure payment form…</p>}

        {stage === "waived" && (
          <div className="ph-fee-waived">
            <strong>★ Founding member — fee waived.</strong>
            <p className="ph-muted small" style={{ marginTop: 4 }}>
              This job's platform fee is on the house. Nothing to pay — you're all set.
            </p>
          </div>
        )}

        {stage === "error" && (
          <div className="ph-stripe-error">
            <strong>Couldn't load payment form.</strong>
            <p>{errorMessage}</p>
          </div>
        )}

        <div
          ref={elementsContainerRef}
          className="ph-stripe-element-container"
          style={{ display: stage === "ready" || stage === "submitting" ? "block" : "none" }}
        />

        {stage === "ready" && errorMessage && <p className="ph-stripe-inline-error">{errorMessage}</p>}

        {(stage === "ready" || stage === "submitting") && (
          <button type="button" className="ph-btn-primary" disabled={stage === "submitting"} onClick={handleSubmit}>
            {stage === "submitting" ? "Processing…" : `Pay $${fee.toLocaleString()}`}
          </button>
        )}

        <p className="ph-muted small ph-stripe-footnote">
          Card details are entered directly into Stripe's secure form and never pass through this app's servers.
        </p>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Payments panel
// ---------------------------------------------------------------------------
function PaymentsPanel({ contractor, onRefreshJobs, onEditAmount }) {
  const jobs = contractor.completedJobs || [];
  const suspended = contractorIsSuspended(contractor);
  const [checkoutJob, setCheckoutJob] = useState(null);
  const [processingJobId, setProcessingJobId] = useState(null);
  const [editingJobId, setEditingJobId] = useState(null);
  const [editAmountInput, setEditAmountInput] = useState("");
  const [editLowReportReason, setEditLowReportReason] = useState("");
  const [editError, setEditError] = useState(null);
  const [editSubmitting, setEditSubmitting] = useState(false);

  /**
   * Payment confirmation no longer calls markPaid directly -- that call is
   * gone entirely from the frontend now. Instead, Stripe's webhook (running
   * server-to-server, can't be faked from the browser) marks the job paid
   * in the database a moment after this resolves. We show a brief
   * "processing" state and poll the job list a few times until feePaid
   * flips true, which is usually near-instant but can take a couple
   * seconds depending on webhook delivery time.
   */
  const handleCheckoutSuccess = () => {
    const jobId = checkoutJob.id;
    setProcessingJobId(jobId);
    setCheckoutJob(null);

    let attempts = 0;
    const maxAttempts = 10; // ~20 seconds total at 2s intervals
    const poll = async () => {
      attempts += 1;
      const paid = await onRefreshJobs(jobId);
      if (paid || attempts >= maxAttempts) {
        setProcessingJobId(null);
        return;
      }
      setTimeout(poll, 2000);
    };
    setTimeout(poll, 1500); // give the webhook a moment to land before the first check
  };

  const startEditing = (job) => {
    setEditingJobId(job.id);
    setEditAmountInput(String(job.reportedAmount));
    setEditLowReportReason("");
    setEditError(null);
  };

  const submitEdit = async (job) => {
    const newAmount = parseFloat(editAmountInput);
    if (!newAmount || newAmount <= 0) return;
    setEditSubmitting(true);
    setEditError(null);
    try {
      await onEditAmount(job.id, newAmount, editLowReportReason.trim() || undefined);
      setEditingJobId(null);
      setEditAmountInput("");
      setEditLowReportReason("");
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditSubmitting(false);
    }
  };

  return (
    <div>
      <div className="ph-fee-explainer">
        <strong>How payment works here</strong>
        <p>
          No pay-per-lead, ever. Browsing the directory, getting found, and receiving quote requests all cost
          nothing. The only thing you ever owe is a small percentage of jobs you actually complete and get paid
          for — and the rate goes down as the job gets bigger.
        </p>
        <div className="ph-fee-table">
          {FEE_BRACKETS.map((b) => (
            <div className="ph-fee-tier" key={b.label}>
              <span className="ph-fee-tier-label">{b.label}</span>
              <span className="ph-fee-tier-rate">{(b.rate * 100).toFixed(1)}%</span>
            </div>
          ))}
        </div>
        <p className="ph-muted small">
          Brackets are marginal, like a tax bracket — only the portion of a job inside each range is charged that
          rate. Payment is due within {PAYMENT_DUE_DAYS} days of the homeowner confirming the job amount.
        </p>
      </div>

      {suspended && (
        <div className="ph-suspended-banner">
          <strong>Your profile is hidden from the directory.</strong>
          <p>You have a confirmed job with payment more than {PAYMENT_DUE_DAYS} days overdue. Pay the fee owed below to be relisted immediately.</p>
        </div>
      )}

      <h2>Your jobs</h2>
      {jobs.length === 0 && <p className="ph-muted">No completed jobs reported yet.</p>}
      {jobs.map((job) => {
        const fee = job.status !== "pending_confirmation" ? feeOwedForAmount(job.reportedAmount) : null;
        const overdue = isPaymentOverdue(job) && !job.feePaid;
        const isProcessing = processingJobId === job.id;

        // Calculate days remaining before suspension
        const daysRemaining = (() => {
          if (!job.confirmedAt || job.feePaid || job.status !== "confirmed") return null;
          const confirmed = new Date(job.confirmedAt);
          const deadline = new Date(confirmed.getTime() + PAYMENT_DUE_DAYS * 24 * 60 * 60 * 1000);
          const now = new Date();
          const diff = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));
          return diff;
        })();
        return (
          <div className="ph-card ph-job-card" key={job.id}>
            <div className="ph-qr-desc">{job.description}</div>
            <div className="ph-card-meta">
              <span>Homeowner: {job.homeowner}</span>
              <span>Reported amount: ${job.reportedAmount.toLocaleString()}</span>
            </div>

            {/* Countdown banner -- shown on unpaid confirmed jobs */}
            {daysRemaining !== null && !job.feePaid && (
              <div style={{
                background: daysRemaining <= 2 ? "#FAE5DE" : daysRemaining <= 5 ? "#FBF1DE" : "#E3EEDF",
                border: `1px solid ${daysRemaining <= 2 ? "#E3BCA8" : daysRemaining <= 5 ? "#EAD7AC" : "#c7e0c2"}`,
                borderRadius: 6, padding: "8px 12px", fontSize: 12.5, fontWeight: 600,
                color: daysRemaining <= 2 ? "#A8442B" : daysRemaining <= 5 ? "#7A5A1A" : "#2C6B3F",
              }}>
                {daysRemaining <= 0
                  ? "⚠ Payment overdue — your listing is now hidden from homeowners"
                  : daysRemaining === 1
                  ? "⚠ 1 day left to pay — your listing will be hidden tomorrow"
                  : `${daysRemaining} days left to pay — listing hidden after ${PAYMENT_DUE_DAYS} days`}
              </div>
            )}

            {job.status === "pending_confirmation" && (
              <div className="ph-job-status-row">
                <span className="ph-status-chip sent">awaiting homeowner confirmation</span>
                <button type="button" className="ph-btn-secondary" onClick={() => startEditing(job)}>
                  Edit amount
                </button>
              </div>
            )}

            {job.status === "disputed" && editingJobId !== job.id && (
              <div className="ph-job-status-row">
                <span className="ph-status-chip declined">disputed by homeowner</span>
                <span className="ph-muted small">{job.disputeNote}</span>
                <button type="button" className="ph-btn-secondary" onClick={() => startEditing(job)}>
                  Edit amount
                </button>
              </div>
            )}

            {editingJobId === job.id && (
              <div className="ph-edit-amount-form">
                {job.status === "disputed" && (
                  <p className="ph-muted small">
                    Homeowner's note: <em>{job.disputeNote}</em>
                  </p>
                )}
                <div className="ph-report-row">
                  <span className="ph-report-prefix">$</span>
                  <input
                    className="ph-report-input"
                    value={editAmountInput}
                    onChange={(e) => {
                      setEditAmountInput(e.target.value);
                      setEditLowReportReason("");
                    }}
                    inputMode="decimal"
                  />
                  <button
                    type="button"
                    className="ph-btn-primary"
                    disabled={!editAmountInput || parseFloat(editAmountInput) <= 0 || editSubmitting}
                    onClick={() => submitEdit(job)}
                  >
                    {editSubmitting ? "Saving…" : "Save corrected amount"}
                  </button>
                  <button type="button" className="ph-btn-secondary" onClick={() => setEditingJobId(null)} disabled={editSubmitting}>
                    Cancel
                  </button>
                </div>
                {job.quotedAmount != null &&
                  parseFloat(editAmountInput) > 0 &&
                  parseFloat(editAmountInput) < job.quotedAmount * 0.9 && (
                    <div className="ph-low-report-warning">
                      <span className="ph-low-report-label">
                        ⚠ This is more than 10% below your quoted price of ${job.quotedAmount.toLocaleString()}. Please explain why.
                      </span>
                      <textarea
                        className="ph-low-report-reason"
                        rows={3}
                        value={editLowReportReason}
                        onChange={(e) => setEditLowReportReason(e.target.value)}
                        placeholder="e.g. Homeowner asked us to skip the back beds — scope was reduced on-site."
                      />
                    </div>
                  )}
                {editError && <p className="ph-stripe-inline-error">{editError}</p>}
                <p className="ph-muted small">
                  Saving sends this back to the homeowner for a fresh confirmation.
                </p>
              </div>
            )}

            {(job.status === "confirmed" || job.status === "paid") && (
              <div className="ph-fee-owed-row">
                <div>
                  <span className="ph-fee-owed-label">Platform fee owed</span>
                  <span className="ph-fee-owed-amount">${fee.toLocaleString()}</span>
                  <span className="ph-muted small"> ({(effectiveFeeRate(job.reportedAmount) * 100).toFixed(1)}% effective rate)</span>
                </div>
                {job.feePaid ? (
                  <span className="ph-status-chip responded">paid</span>
                ) : isProcessing ? (
                  <span className="ph-status-chip sent">confirming payment…</span>
                ) : overdue ? (
                  <button className="ph-btn-primary ph-btn-danger" onClick={() => setCheckoutJob(job)}>
                    Pay now — listing hidden
                  </button>
                ) : (
                  <button className="ph-btn-primary" onClick={() => setCheckoutJob(job)}>
                    Pay fee{daysRemaining !== null && daysRemaining <= 5 ? ` — ${daysRemaining}d left` : ""}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {checkoutJob && (
        <StripeCheckoutModal
          job={checkoutJob}
          contractor={contractor}
          onClose={() => setCheckoutJob(null)}
          onSuccess={handleCheckoutSuccess}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root customer-facing app
// ---------------------------------------------------------------------------
export default function CustomerApp() {
  const [contractors, setContractors] = useState([]);
  const [quoteRequests, setQuoteRequests] = useState([]);
  const [currentHomeowner, setCurrentHomeowner] = useState(null);
  const [homeownerJobs, setHomeownerJobs] = useState([]);
  const [showWelcome, setShowWelcome] = useState(false);
  const [checkingHomeownerSession, setCheckingHomeownerSession] = useState(true);
  const [homeownerScreen, setHomeownerScreen] = useState("directory");
  const [loadingContractors, setLoadingContractors] = useState(true);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    supabaseAuth.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      if (!data?.session) { setCheckingHomeownerSession(false); return; }
      try {
        const result = await apiCall("homeowners", { action: "getCurrent" });
        if (cancelled) return;
        if (result.homeowner) {
          setCurrentHomeowner(result.homeowner);
          await loadHomeownerData(result.homeowner.id);
        }
      } catch {
        // Session exists but no homeowner profile -- that's fine.
      } finally {
        if (!cancelled) setCheckingHomeownerSession(false);
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiCall("contractors", { action: "list" })
      .then((data) => {
        if (cancelled) return;
        const normalized = data.contractors.map(normalizeContractor);
        // Sort by weighted score: thumbsUp × 2 + avgRating × reviewCount
        // Contractors with no reviews fall back to thumbs up only
        normalized.sort((a, b) => {
          const avgA = a.reviews.length > 0 ? a.reviews.reduce((s, r) => s + r.rating, 0) / a.reviews.length : 0;
          const avgB = b.reviews.length > 0 ? b.reviews.reduce((s, r) => s + r.rating, 0) / b.reviews.length : 0;
          const scoreA = (a.thumbsUp * 2) + (avgA * a.reviews.length);
          const scoreB = (b.thumbsUp * 2) + (avgB * b.reviews.length);
          if (scoreB !== scoreA) return scoreB - scoreA;
          // Tiebreak: newer first
          return new Date(b.createdAt) - new Date(a.createdAt);
        });
        setContractors(normalized);
        setLoadingContractors(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err.message);
        setLoadingContractors(false);
      });
    return () => { cancelled = true; };
  }, []);

  /** Pulls in a contractor's own jobs and quote requests after sign-in. */
  const handleConfirmJob = async (contractorId, jobId) => {
    try {
      const data = await apiCall("jobs", { action: "confirm", jobId });
      setHomeownerJobs((prev) => prev.map((j) => idsMatch(j.id, jobId) ? data.job : j));
      setContractors((prev) =>
        prev.map((c) =>
          !idsMatch(c.id, contractorId)
            ? c
            : { ...c, completedJobs: (c.completedJobs || []).map((j) => (idsMatch(j.id, jobId) ? data.job : j)) }
        )
      );
    } catch (err) {
      setLoadError(err.message);
    }
  };

  const handleDisputeJob = async (contractorId, jobId, note) => {
    try {
      const data = await apiCall("jobs", { action: "dispute", jobId, note });
      setHomeownerJobs((prev) => prev.map((j) => idsMatch(j.id, jobId) ? data.job : j));
      setContractors((prev) =>
        prev.map((c) =>
          !idsMatch(c.id, contractorId)
            ? c
            : { ...c, completedJobs: (c.completedJobs || []).map((j) => (idsMatch(j.id, jobId) ? data.job : j)) }
        )
      );
    } catch (err) {
      setLoadError(err.message);
    }
  };

  /**
   * Called right after Supabase Auth sign-up succeeds (a real session now
   * exists). Creates the matching homeowners row via the backend's
   * "afterSignUp" action, which derives identity from the verified session
   * token rather than anything passed in -- name/zip are the only profile
   * fields the client supplies.
   */
  const handleHomeownerSignedUp = async ({ name, zip, phone }) => {
    try {
      const data = await apiCall("homeowners", { action: "afterSignUp", name, zip, phone: phone || null });
      setCurrentHomeowner(data.homeowner);
      await loadHomeownerData(data.homeowner.id);
      if (!localStorage.getItem("harryslist_welcomed")) {
        setShowWelcome(true);
      }
    } catch (err) {
      setLoadError(err.message);
    }
  };

  /**
   * Called right after Supabase Auth sign-in succeeds. Fetches the
   * homeowner profile linked to this now-active session.
   */
  const handleHomeownerSignedIn = async () => {
    try {
      const data = await apiCall("homeowners", { action: "getCurrent" });
      if (data.homeowner) {
        setCurrentHomeowner(data.homeowner);
        await loadHomeownerData(data.homeowner.id);
        if (!localStorage.getItem("harryslist_welcomed")) {
          setShowWelcome(true);
        }
      } else {
        setHomeownerScreen("register");
      }
    } catch (err) {
      setLoadError(err.message);
    }
  };

  /** Shared by sign-up and sign-in: pulls in this homeowner's quote/job history. */
  const loadHomeownerData = async (homeownerId) => {
    const [quotesData, jobsData] = await Promise.all([
      apiCall("quotes", { action: "listForHomeowner" }),
      apiCall("jobs", { action: "listForHomeowner" }),
    ]);
    setQuoteRequests((prev) => {
      const others = prev.filter((qr) => qr.homeownerId !== homeownerId);
      return [...others, ...quotesData.quoteRequests];
    });
    // Store jobs independently so confirmation works even if contractor isn't in directory
    setHomeownerJobs(jobsData.jobs || []);
    // Also merge into contractor objects for review/sorting purposes
    setContractors((prev) =>
      prev.map((c) => {
        const jobsForThisContractor = jobsData.jobs.filter((j) => idsMatch(j.contractorId, c.id));
        if (jobsForThisContractor.length === 0) return c;
        const existingIds = new Set((c.completedJobs || []).map((j) => j.id));
        const newOnes = jobsForThisContractor.filter((j) => !existingIds.has(j.id));
        return { ...c, completedJobs: [...(c.completedJobs || []), ...newOnes] };
      })
    );
  };

  const handleHomeownerLogout = async () => {
    await supabaseAuth.auth.signOut();
    setCurrentHomeowner(null);
  };

  const handleUpdateHomeowner = async (updates) => {
    try {
      const data = await apiCall("homeowners", { action: "update", updates });
      setCurrentHomeowner(data.homeowner);
    } catch (err) {
      setLoadError(err.message);
    }
  };

  const handleToggleFavorite = async (contractorId) => {
    if (!currentHomeowner) return;
    try {
      const data = await apiCall("homeowners", { action: "toggleFavorite", contractorId });
      setCurrentHomeowner(data.homeowner);
    } catch (err) {
      setLoadError(err.message);
    }
  };

  /**
   * Submits a star review for a confirmed/paid job. The backend independently
   * verifies the job actually belongs to this contractor/homeowner pair and
   * is actually confirmed -- this call can't be used to fake a review for a
   * job that never happened, even if someone tampered with the frontend.
   * Lets the error propagate so HomeownerProfilePage's ReviewForm can show
   * it inline (e.g. "you've already reviewed this job") rather than it
   * silently failing.
   */
  const handleSubmitReview = async ({ contractorId, homeownerId, jobId, rating, text }) => {
    const data = await apiCall("reviews", {
      action: "create",
      contractorId,
      homeownerId,
      jobId,
      rating,
      text,
    });
    setContractors((prev) =>
      prev.map((c) =>
        !idsMatch(c.id, contractorId) ? c : { ...c, reviews: [data.review, ...(c.reviews || [])] }
      )
    );
  };

  /**
   * Toggles a thumbs up for a contractor. Updates the contractor's
   * thumbsUp count locally right away -- we already know the new boolean
   * state from the backend response, so we just bump the count by ±1
   * rather than refetching the whole contractor -- so the UI feels
   * instant without a second round trip.
   */
  const handleToggleThumbsUp = async (contractorId) => {
    if (!currentHomeowner) return;
    try {
      const data = await apiCall("reviews", {
        action: "toggleThumbsUp",
        contractorId,
      });
      setContractors((prev) =>
        prev.map((c) =>
          !idsMatch(c.id, contractorId)
            ? c
            : { ...c, thumbsUp: Math.max(0, c.thumbsUp + (data.thumbsUp ? 1 : -1)) }
        )
      );
    } catch (err) {
      setLoadError(err.message);
    }
  };

  return (
    <div className="ph-app">
      <style>{CUSTOMER_STYLES}</style>

      <header className="ph-header">
        <div className="ph-header-brand">
          <div className="ph-header-titles">
            <p className="ph-header-title">Harry's List</p>
            <span className="ph-header-subtitle">DFW Trade Directory</span>
          </div>
        </div>
        <a href="/contractors" className="ph-contractor-link">Are you a contractor? →</a>
      </header>

      <main className="ph-main">
        {loadError && (
          <div className="ph-load-error-banner">
            <span>{loadError}</span>
            <button type="button" className="ph-modal-close" onClick={() => setLoadError(null)} aria-label="Dismiss">×</button>
          </div>
        )}

        {loadingContractors || checkingHomeownerSession ? (
          <p className="ph-muted">Loading…</p>
        ) : (
          <>
            {!currentHomeowner && homeownerScreen === "register" && (
              <FadeIn keyValue="homeowner-register">
                <div className="ph-auth-card">
                  <h2>Complete your profile</h2>
                  <p className="ph-muted">Your email is confirmed — just fill in a few details to finish setting up your account.</p>
                  <HomeownerCompleteProfile onComplete={async ({ name, zip, phone }) => {
                    try {
                      const data = await apiCall("homeowners", { action: "afterSignUp", name, zip, phone });
                      setCurrentHomeowner(data.homeowner);
                      await loadHomeownerData(data.homeowner.id);
                      setHomeownerScreen("directory");
                    } catch (err) {
                      setLoadError(err.message);
                    }
                  }} />
                </div>
              </FadeIn>
            )}

            {!currentHomeowner && homeownerScreen === "signin" && (
              <FadeIn keyValue="homeowner-auth">
                <div className="ph-auth-card">
                  <button type="button" className="ph-link-btn" onClick={() => setHomeownerScreen("directory")}>
                    ← Back to browsing
                  </button>
                  <HomeownerAuth onSignedUp={handleHomeownerSignedUp} onSignedIn={handleHomeownerSignedIn} />
                </div>
              </FadeIn>
            )}

            {/*
             * Browsing the directory no longer requires an account (matches
             * the "no account needed to browse" promise on the homepage).
             * Signed-in homeowners see their account bar and profile/directory
             * screens as before; signed-out visitors see a lightweight guest
             * bar instead, and are only prompted to sign in when they try to
             * actually request a quote or thumbs up a contractor.
             */}
            {(currentHomeowner || (homeownerScreen !== "register" && homeownerScreen !== "signin")) && (
              <>
                {currentHomeowner && showWelcome && (
                  <WelcomeModal onClose={() => {
                    localStorage.setItem("harryslist_welcomed", "true");
                    setShowWelcome(false);
                  }} />
                )}
                {currentHomeowner && (
                  <button
                    type="button"
                    className="ph-info-btn"
                    onClick={() => setShowWelcome(true)}
                    aria-label="How Harry's List works"
                    title="How it works"
                  >
                    ?
                  </button>
                )}
                <FadeIn keyValue={`homeowner-${homeownerScreen}`}>
                  <div>
                  {currentHomeowner ? (
                    <HomeownerAccountBar
                      homeowner={currentHomeowner}
                      onOpenProfile={() => setHomeownerScreen("profile")}
                      onLogout={() => {
                        handleHomeownerLogout();
                        setHomeownerScreen("directory");
                      }}
                    />
                  ) : (
                    <div className="ph-guest-bar">
                      <span className="ph-guest-bar-text">Browsing as a guest</span>
                      <button type="button" className="ph-btn-secondary" onClick={() => setHomeownerScreen("signin")}>
                        Sign in
                      </button>
                    </div>
                  )}
                  {homeownerScreen === "profile" && currentHomeowner ? (
                    <HomeownerProfilePage
                      homeowner={currentHomeowner}
                      contractors={contractors}
                      quoteRequests={quoteRequests}
                      onUpdate={handleUpdateHomeowner}
                      onClose={() => setHomeownerScreen("directory")}
                      onToggleFavorite={handleToggleFavorite}
                      onSubmitReview={handleSubmitReview}
                    />
                  ) : (
                    <HomeownerView
                      contractors={contractors}
                      setContractors={setContractors}
                      quoteRequests={quoteRequests}
                      setQuoteRequests={setQuoteRequests}
                      homeownerJobs={homeownerJobs}
                      onConfirmJob={handleConfirmJob}
                      onDisputeJob={handleDisputeJob}
                      currentHomeowner={currentHomeowner}
                      onToggleFavorite={handleToggleFavorite}
                      onToggleThumbsUp={handleToggleThumbsUp}
                      onRequireAuth={() => setHomeownerScreen("signin")}
                    />
                  )}
                </div>
              </FadeIn>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

/**
 * Gate shown to a contractor who's either not signed in, or signed in but
 * hasn't built a business profile yet (a brand-new account). Renders
 * ContractorAuth first; once signed up/in, if there's still no profile,
 * shows ContractorOnboarding directly so a new contractor goes straight
 * from "create account" to "build my listing" in one flow, rather than
 * landing on an empty inbox with no path forward.
 */
// ---------------------------------------------------------------------------
// ContractorDashboard -- the "home" screen, shown first after sign-in.
// Summarizes new requests, recent jobs, earnings, and fees at a glance.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// ContractorPortfolio -- photo grid with upload and delete for the contractor's
// portfolio. Homeowners see a read-only version in the profile card popup.
// ---------------------------------------------------------------------------
function ContractorPortfolio({ contractor }) {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [captionFor, setCaptionFor] = useState(null); // photoId being captioned
  const [captionText, setCaptionText] = useState("");

  useEffect(() => {
    let cancelled = false;
    apiCall("contractors", { action: "listPortfolioPhotos", contractorId: contractor.id })
      .then((data) => { if (!cancelled) { setPhotos(data.photos); setLoading(false); } })
      .catch((err) => { if (!cancelled) { setError(err.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [contractor.id]);

  const [lightboxUrl, setLightboxUrl] = useState(null);

  /**
   * Compresses an image to fit under maxBytes. Returns { base64, contentType }.
   * Also generates a thumbnail at THUMB_WIDTH px wide for fast grid loading.
   */
  const THUMB_WIDTH = 400;

  const processImage = (file) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't read that photo. If it's an iPhone HEIC, upload a JPEG or add it from your phone.")); };
      img.onload = () => {
        URL.revokeObjectURL(url);
        const MAX_BYTES = 2.5 * 1024 * 1024;

        // Full-size canvas -- scale down if needed
        const fullCanvas = document.createElement("canvas");
        let { width, height } = img;
        if (file.size > MAX_BYTES) {
          const scale = Math.sqrt(MAX_BYTES / file.size) * 0.9;
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        fullCanvas.width = width;
        fullCanvas.height = height;
        fullCanvas.getContext("2d").drawImage(img, 0, 0, width, height);

        // Thumbnail canvas -- always 400px wide
        const thumbCanvas = document.createElement("canvas");
        const thumbScale = Math.min(1, THUMB_WIDTH / img.naturalWidth);
        thumbCanvas.width = Math.round(img.naturalWidth * thumbScale);
        thumbCanvas.height = Math.round(img.naturalHeight * thumbScale);
        thumbCanvas.getContext("2d").drawImage(img, 0, 0, thumbCanvas.width, thumbCanvas.height);

        // Try progressively lower quality until full fits under MAX_BYTES
        const tryQuality = (q) => {
          const dataUrl = fullCanvas.toDataURL("image/jpeg", q);
          const base64 = dataUrl.split(",")[1];
          const bytes = Math.round((base64.length * 3) / 4);
          if (bytes <= MAX_BYTES || q <= 0.4) {
            const thumbBase64 = thumbCanvas.toDataURL("image/jpeg", 0.75).split(",")[1];
            resolve({ base64, thumbnailBase64: thumbBase64, contentType: "image/jpeg" });
          } else {
            tryQuality(Math.max(q - 0.1, 0.4));
          }
        };
        tryQuality(0.85);
      };
      img.src = url;
    });
  };

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of files) {
        const { base64, thumbnailBase64, contentType } = await processImage(file);
        const data = await apiCall("contractors", {
          action: "uploadPortfolioPhoto",
          fileBase64: base64,
          thumbnailBase64,
          fileName: file.name.replace(/\.[^.]+$/, ".jpg"),
          contentType,
        });
        setPhotos((prev) => [data.photo, ...prev]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const [pendingDelete, setPendingDelete] = useState(null);

  const handleDelete = async (photoId) => {
    setPendingDelete(photoId);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await apiCall("contractors", { action: "deletePortfolioPhoto", photoId: pendingDelete });
      setPhotos((prev) => prev.filter((p) => p.id !== pendingDelete));
    } catch (err) {
      setError(err.message);
    } finally {
      setPendingDelete(null);
    }
  };

  return (
    <div className="cd-content">
      <div className="cd-page-header">
        <div>
          <div className="cd-page-title">Portfolio</div>
          <div className="cd-muted" style={{ fontSize: 12, marginTop: 2 }}>
            {photos.length}/20 photos · PNG, JPEG or WebP · auto-compressed if needed
          </div>
        </div>
        <label className={`cd-btn cd-btn-primary ${uploading ? "cd-btn-disabled" : ""}`} style={{ cursor: uploading ? "not-allowed" : "pointer" }}>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            style={{ display: "none" }}
            onChange={handleFileChange}
            disabled={uploading || photos.length >= 20}
          />
          {uploading ? "Uploading…" : "+ Add photos"}
        </label>
      </div>

      {error && (
        <div className="ph-load-error-banner" style={{ marginBottom: 16 }}>
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18 }}>×</button>
        </div>
      )}

      {loading && <p className="cd-muted">Loading photos…</p>}

      {!loading && photos.length === 0 && (
        <div className="cd-portfolio-empty">
          <i className="ti ti-photo-off" style={{ fontSize: 40, color: "#C4B8AA", display: "block", marginBottom: 12 }} aria-hidden="true" />
          <div style={{ fontWeight: 600, color: "#6B5840", marginBottom: 6 }}>No portfolio photos yet</div>
          <div className="cd-muted" style={{ fontSize: 13 }}>Upload photos of past work to show homeowners what you can do.</div>
        </div>
      )}

      <div className="cd-portfolio-grid">
        {photos.map((photo) => (
          <div className="cd-portfolio-item" key={photo.id}>
            <img
              src={photo.thumbnailUrl}
              alt={photo.caption || "Portfolio photo"}
              className="cd-portfolio-img"
              loading="lazy"
              role="button"
              tabIndex={0}
              aria-label={`View portfolio photo${photo.caption ? `: ${photo.caption}` : ""} full size`}
              onClick={() => setLightboxUrl(photo.publicUrl)}
              onKeyDown={activateOnKey(() => setLightboxUrl(photo.publicUrl))}
            />
            <div className="cd-portfolio-overlay">
              {captionFor === photo.id ? (
                <div className="cd-caption-edit" onClick={(e) => e.stopPropagation()}>
                  <input
                    className="cd-caption-input"
                    value={captionText}
                    onChange={(e) => setCaptionText(e.target.value)}
                    placeholder="Add a caption…"
                    autoFocus
                  />
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <button className="cd-btn cd-btn-primary" style={{ padding: "5px 12px", fontSize: 12 }}
                      onClick={async () => {
                        try {
                          const data = await apiCall("contractors", {
                            action: "updatePhotoCaption",
                            photoId: photo.id,
                            caption: captionText.trim() || null,
                          });
                          setPhotos((prev) => prev.map((p) => p.id === photo.id ? data.photo : p));
                        } catch {
                          // Caption update failed -- revert local state
                        }
                        setCaptionFor(null);
                      }}>Save</button>
                    <button className="cd-btn cd-btn-secondary" style={{ padding: "5px 12px", fontSize: 12 }}
                      onClick={() => setCaptionFor(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  {photo.caption && <div className="cd-portfolio-caption">{photo.caption}</div>}
                  <div className="cd-portfolio-actions">
                    <button className="cd-portfolio-btn" onClick={(e) => { e.stopPropagation(); setCaptionFor(photo.id); setCaptionText(photo.caption || ""); }}>
                      <i className="ti ti-pencil" aria-hidden="true" /> Caption
                    </button>
                    {pendingDelete === photo.id ? (
                      <>
                        <button className="cd-portfolio-btn cd-portfolio-btn-danger" onClick={(e) => { e.stopPropagation(); confirmDelete(); }}>
                          Confirm delete
                        </button>
                        <button className="cd-portfolio-btn" onClick={(e) => { e.stopPropagation(); setPendingDelete(null); }}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button className="cd-portfolio-btn cd-portfolio-btn-danger" onClick={(e) => { e.stopPropagation(); handleDelete(photo.id); }}>
                        <i className="ti ti-trash" aria-hidden="true" /> Delete
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox -- click thumbnail to see full-size */}
      {lightboxUrl && (
        <div className="cd-lightbox" onClick={() => setLightboxUrl(null)}>
          <button className="ph-modal-close" onClick={() => setLightboxUrl(null)} aria-label="Close">×</button>
          <img src={lightboxUrl} alt="Full size" className="cd-lightbox-img" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

function ContractorDashboard({ contractor, quoteRequests, onNavigate }) {
  const jobs = contractor.completedJobs || [];
  const newRequests = quoteRequests.filter((qr) =>
    qr.recipients.some((r) => idsMatch(r.contractorId, contractor.id) && r.status === "sent")
  );
  const recentJobs = jobs.slice(0, 3);
  const monthlyEarnings = jobs
    .filter((j) => j.status === "confirmed" || j.status === "paid")
    .reduce((s, j) => s + j.reportedAmount, 0);
  const feesOwed = jobs
    .filter((j) => (j.status === "confirmed") && !j.feePaid)
    .reduce((s, j) => s + feeOwedForAmount(j.reportedAmount), 0);
  const thumbsUp = contractor.thumbsUp || 0;
  const completedCount = jobs.filter((j) => j.status === "paid" || j.status === "confirmed").length;

  return (
    <div className="cd-content">
      <div className="cd-page-header">
        <div className="cd-page-title">Dashboard</div>
        <div className="cd-page-actions">
          <button className="cd-btn cd-btn-secondary" onClick={() => onNavigate("onboard")}>Edit profile</button>
        </div>
      </div>

      {contractor.isFoundingMember && (
        <div className="cd-founding-banner">
          <span className="cd-founding-badge">★ Founding Member</span>
          <span className="cd-founding-text">
            {(() => {
              const remaining = Math.max(0, 1 - (contractor.foundingFreeJobsUsed || 0));
              return remaining > 0
                ? `Zero platform fees on your next ${remaining} completed job${remaining === 1 ? "" : "s"}.`
                : "Thanks for being one of our founding contractors.";
            })()}
          </span>
        </div>
      )}

      {/* Stat cards */}
      <div className="cd-stat-grid">
        <div className="cd-stat-card">
          <div className="cd-stat-label">New requests</div>
          <div className="cd-stat-value">{newRequests.length}</div>
          <div className="cd-stat-sub">{newRequests.length === 1 ? "waiting on your quote" : "waiting on quotes"}</div>
        </div>
        <div className="cd-stat-card">
          <div className="cd-stat-label">Jobs completed</div>
          <div className="cd-stat-value">{completedCount}</div>
          <div className="cd-stat-sub">confirmed or paid</div>
        </div>
        <div className="cd-stat-card">
          <div className="cd-stat-label">Thumbs up</div>
          <div className="cd-stat-value">{thumbsUp}</div>
          <div className="cd-stat-sub">from homeowners</div>
        </div>
        <div className="cd-stat-card">
          <div className="cd-stat-label">Fees owed</div>
          <div className="cd-stat-value">${feesOwed.toLocaleString()}</div>
          <div className="cd-stat-sub cd-stat-warn">{feesOwed > 0 ? `pay before ${PAYMENT_DUE_DAYS}-day deadline` : "all paid up"}</div>
        </div>
      </div>

      {/* New requests */}
      {newRequests.length > 0 && (
        <div className="cd-section">
          <div className="cd-section-header">
            <span>New quote requests</span>
            <button className="cd-section-link" onClick={() => onNavigate("inbox")}>View all →</button>
          </div>
          <div className="cd-list">
            {newRequests.slice(0, 3).map((qr) => (
              <div className="cd-list-row" key={qr.id}>
                <div className="cd-list-icon"><i className="ti ti-mail" aria-hidden="true" /></div>
                <div className="cd-list-body">
                  <div className="cd-list-title">{qr.description}</div>
                  <div className="cd-list-meta">Zip {qr.zip || "—"} · {qr.budget ? `Budget ${qr.budget}` : "No budget given"} · {qr.timeline}</div>
                </div>
                <span className="cd-chip cd-chip-new">New</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom two-col */}
      <div className="cd-two-col">
        <div className="cd-card">
          <div className="cd-section-header"><span>Recent jobs</span><button className="cd-section-link" onClick={() => onNavigate("payments")}>View all →</button></div>
          {recentJobs.length === 0 && <p className="cd-muted">No completed jobs yet.</p>}
          {recentJobs.map((job) => (
            <div className="cd-job-row" key={job.id}>
              <div>
                <div className="cd-job-name">{job.description}</div>
                <div className="cd-list-meta">{job.status === "paid" ? "Paid" : job.status === "confirmed" ? "Confirmed · fee due" : job.status.replace("_", " ")}</div>
              </div>
              <div className="cd-job-amount">${job.reportedAmount.toLocaleString()}</div>
            </div>
          ))}
        </div>

        <div className="cd-card">
          <div className="cd-section-header"><span>Monthly earnings</span></div>
          <div className="cd-earnings-total">${monthlyEarnings.toLocaleString()}</div>
          <div className="cd-earnings-sub">from {completedCount} job{completedCount === 1 ? "" : "s"}</div>
          <div className="cd-divider" />
          <div className="cd-stat-label">Platform fees owed</div>
          <div className="cd-fees-amount">${feesOwed.toFixed(2)}</div>
          <div className="cd-stat-sub">{feesOwed > 0 ? `Pay before ${PAYMENT_DUE_DAYS}-day deadline` : "All paid up ✓"}</div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ContractorShell -- the sidebar + main content wrapper for signed-in
// contractors. Replaces the old tab-bar toolbar entirely.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// ContractorTutorial -- an interactive, stepped walkthrough of how the platform
// works for contractors. Launched on demand from the mobile "More" menu.
// ---------------------------------------------------------------------------
function ContractorTutorial({ onClose }) {
  const steps = [
    { icon: "ti-inbox", title: "Requests come to you", body: "Homeowners in your area send quote requests straight to you — no pay-per-lead, no bidding wars. You only hear from people who want your work." },
    { icon: "ti-send", title: "Send your quote", body: "Open a request and send your price right in the app. The homeowner's contact details unlock once they accept your quote." },
    { icon: "ti-circle-check", title: "Get the job confirmed", body: "After you finish the work, the homeowner confirms it's done and the final amount. That confirmation is what starts payment — not you chasing an invoice." },
    { icon: "ti-credit-card", title: "Only pay after you're paid", body: "You keep 96–99% of every job. A small platform fee (1–4%) is owed only after a confirmed job — never up front. And as a founding member, your first job's fee is on us." },
    { icon: "ti-star", title: "Reviews grow your business", body: "Every confirmed job earns a verified review. Real reviews bring more homeowners — and no one can fake or buy their way past you." },
    { icon: "ti-qrcode", title: "Bring your own customers", body: "Share your Harry's List profile or QR code with existing customers to collect reviews and run their jobs through the app too." },
  ];
  const [step, setStep] = useState(0);
  const s = steps[step];
  const isLast = step === steps.length - 1;
  return (
    <Modal onClose={onClose}>
      <div className="ph-modal ct-tutorial" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="ct-tut-progress">
          {steps.map((_, i) => (
            <span key={i} className={`ct-tut-dot ${i === step ? "is-active" : ""} ${i < step ? "is-done" : ""}`} />
          ))}
        </div>
        <div className="ct-tut-icon"><i className={`ti ${s.icon}`} aria-hidden="true" /></div>
        <h2 style={{ textAlign: "center" }}>{s.title}</h2>
        <p className="ph-muted" style={{ textAlign: "center", lineHeight: 1.6, marginBottom: 28 }}>{s.body}</p>
        <div className="ct-tut-nav">
          {step > 0 ? (
            <button type="button" className="ph-btn-secondary" onClick={() => setStep(step - 1)}>Back</button>
          ) : (
            <span />
          )}
          {isLast ? (
            <button type="button" className="ph-btn-primary" onClick={onClose}>Got it</button>
          ) : (
            <button type="button" className="ph-btn-primary" onClick={() => setStep(step + 1)}>Next</button>
          )}
        </div>
        <button type="button" className="ct-tut-skip" onClick={onClose}>Skip tutorial</button>
      </div>
    </Modal>
  );
}

function ContractorShell({
  contractor, quoteRequests, screen, onNavigate, onLogout,
  children,
}) {
  const newCount = quoteRequests.filter((qr) =>
    qr.recipients.some((r) => idsMatch(r.contractorId, contractor.id) && r.status === "sent")
  ).length;

  const statusLabel =
    contractor.status === "pending" ? "Pending approval" :
    contractor.status === "rejected" ? "Not approved" :
    contractorIsSuspended(contractor) ? "Suspended" :
    "● Active";
  const statusOk = contractor.status === "approved" && !contractorIsSuspended(contractor);

  const navItems = [
    { id: "dashboard", icon: "ti-layout-dashboard", label: "Dashboard",  mobileLabel: "Home" },
    { id: "inbox",     icon: "ti-inbox",             label: "Quote requests", mobileLabel: "Requests", badge: newCount },
    { id: "payments",  icon: "ti-credit-card",        label: "Payments",   mobileLabel: "Payments" },
  ];
  const accountItems = [
    { id: "onboard",   icon: "ti-user",               label: "My profile", mobileLabel: "Profile" },
    { id: "portfolio", icon: "ti-photo",               label: "Portfolio",  mobileLabel: "Portfolio" },
    { id: "invoice",   icon: "ti-file-invoice",        label: "Invoice preview", mobileLabel: "Invoice" },
    { id: "share",     icon: "ti-qrcode",              label: "Share",      mobileLabel: "Share" },
  ];

  const allNavItems = [...navItems, ...accountItems];

  // Mobile bottom bar: 4 always-visible daily-drivers; the rest live under "More".
  const [moreOpen, setMoreOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);

  // Show the how-it-works tutorial automatically the first time a contractor
  // lands on their dashboard, then remember it so it never auto-opens again.
  // They can always re-open it from the "More" menu.
  useEffect(() => {
    try {
      if (!localStorage.getItem("harryslist_contractor_tutorial_seen")) {
        setTutorialOpen(true);
      }
    } catch (e) { /* private mode -- just skip the auto-open */ }
  }, []);
  const dismissTutorial = () => {
    try { localStorage.setItem("harryslist_contractor_tutorial_seen", "true"); } catch (e) {}
    setTutorialOpen(false);
  };
  const primaryMobileItems = [navItems[0], navItems[1], navItems[2], accountItems[0]];
  const moreMobileItems = [accountItems[1], accountItems[2], accountItems[3]];

  const suspended = contractorIsSuspended(contractor);

  // If suspended, force payments screen -- only place they can act
  const effectiveScreen = suspended && screen !== "payments" ? "payments" : screen;

  return (
    <div className="cd-shell">
      {/* Suspension overlay -- blurs everything except payments */}
      {suspended && effectiveScreen !== "payments" && (
        <div className="cd-suspension-overlay" />
      )}

      {/* Sidebar -- desktop only */}
      <aside className="cd-sidebar">
        <div className="cd-sidebar-brand">
          <div className="cd-brand-name">Harry's List</div>
          <div className="cd-brand-sub">Contractor Portal</div>
        </div>
        <div className="cd-sidebar-user">
          <div className="cd-sidebar-avatar">{initials(contractor.businessName)}</div>
          <div className="cd-sidebar-user-info">
            <div className="cd-sidebar-user-name">{contractor.businessName}</div>
            <div className={`cd-sidebar-user-status ${statusOk ? "is-active" : "is-warn"}`}>{statusLabel}</div>
          </div>
        </div>
        <nav className="cd-sidebar-nav">
          <div className="cd-nav-label">Workspace</div>
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`cd-nav-item ${effectiveScreen === item.id ? "is-active" : ""} ${suspended && item.id !== "payments" ? "is-locked" : ""}`}
              onClick={() => !suspended && onNavigate(item.id)}
              title={suspended && item.id !== "payments" ? "Pay your overdue fee to unlock" : ""}
            >
              <i className={`ti ${item.icon}`} aria-hidden="true" />
              {item.label}
              {item.badge > 0 && <span className="cd-nav-badge">{item.badge}</span>}
              {suspended && item.id !== "payments" && <i className="ti ti-lock" style={{ marginLeft: "auto", fontSize: 12, opacity: 0.5 }} aria-hidden="true" />}
            </button>
          ))}
          <div className="cd-nav-label">Account</div>
          {accountItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`cd-nav-item ${effectiveScreen === item.id ? "is-active" : ""} ${suspended ? "is-locked" : ""}`}
              onClick={() => !suspended && onNavigate(item.id)}
              title={suspended ? "Pay your overdue fee to unlock" : ""}
            >
              <i className={`ti ${item.icon}`} aria-hidden="true" />
              {item.label}
              {suspended && <i className="ti ti-lock" style={{ marginLeft: "auto", fontSize: 12, opacity: 0.5 }} aria-hidden="true" />}
            </button>
          ))}
        </nav>
        <div className="cd-sidebar-footer">
          <button type="button" className="cd-signout-btn" onClick={onLogout}>
            <i className="ti ti-logout" aria-hidden="true" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content area */}
      <div className="cd-main">
        {suspended && (
          <div className="cd-suspension-banner">
            <div className="cd-suspension-icon">⚠</div>
            <div>
              <div className="cd-suspension-title">Your listing has been suspended</div>
              <div className="cd-suspension-body">
                You have a platform fee that's more than {PAYMENT_DUE_DAYS} days overdue. Your business is hidden from the homeowner directory until payment is made. Pay below to be relisted immediately — no other action needed.
              </div>
            </div>
          </div>
        )}
        {children}
      </div>

      {/* Top tab bar -- mobile only */}
      <nav className="cd-top-nav">
        {primaryMobileItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`cd-top-nav-item ${effectiveScreen === item.id ? "is-active" : ""} ${suspended && item.id !== "payments" ? "is-locked" : ""}`}
            onClick={() => !suspended || item.id === "payments" ? onNavigate(item.id) : null}
          >
            <div className="cd-top-nav-icon">
              <i className={`ti ${item.icon}`} aria-hidden="true" />
              {item.badge > 0 && <span className="cd-top-nav-badge">{item.badge}</span>}
            </div>
            <span className="cd-top-nav-label">{item.mobileLabel || item.label}</span>
          </button>
        ))}
      </nav>

      <button
        type="button"
        className={`cd-fab ${moreMobileItems.some((i) => i.id === effectiveScreen) ? "is-active" : ""}`}
        onClick={() => setMoreOpen(true)}
        aria-label="More options"
      >
        <i className="ti ti-dots" aria-hidden="true" />
      </button>

      {moreOpen && (
        <div className="cd-more-backdrop" onClick={() => setMoreOpen(false)}>
          <div className="cd-more-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="cd-more-handle" />
            <button
              type="button"
              className="cd-more-item cd-more-tutorial"
              onClick={() => { setMoreOpen(false); setTutorialOpen(true); }}
            >
              <i className="ti ti-help" aria-hidden="true" />
              <span>How it works</span>
            </button>
            {moreMobileItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`cd-more-item ${effectiveScreen === item.id ? "is-active" : ""} ${suspended ? "is-locked" : ""}`}
                onClick={() => {
                  if (suspended) return;
                  onNavigate(item.id);
                  setMoreOpen(false);
                }}
              >
                <i className={`ti ${item.icon}`} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            ))}
            <button
              type="button"
              className="cd-more-item cd-more-signout"
              onClick={() => { setMoreOpen(false); onLogout(); }}
            >
              <i className="ti ti-logout" aria-hidden="true" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      )}
      {tutorialOpen && <ContractorTutorial onClose={dismissTutorial} />}
    </div>
  );
}

function ContractorAuthGate({ onSignedUp, onSignedIn, onCreate }) {
  const [state, setState] = useState("checking"); // "checking" | "auth" | "onboarding"

  // On mount, check if there's already an active Supabase session. If so,
  // skip the auth form entirely and go straight to onboarding -- the person
  // is already signed in (possibly as a homeowner using the same account)
  // and just needs to build a contractor profile.
  useEffect(() => {
    supabaseAuth.auth.getSession().then(({ data }) => {
      if (data?.session) {
        setState("onboarding");
      } else {
        setState("auth");
      }
    });
  }, []);

  const handleSignedUp = async () => {
    await onSignedUp();
    setState("onboarding");
  };

  const handleSignedIn = async () => {
    await onSignedIn();
    setState("onboarding");
  };

  if (state === "checking") return <p className="ph-muted">Loading…</p>;

  if (state === "onboarding") {
    return <ContractorOnboarding onCreate={onCreate} onEdit={() => {}} editingContractor={null} />;
  }

  return <ContractorAuth onSignedUp={handleSignedUp} onSignedIn={handleSignedIn} />;
}

// ---------------------------------------------------------------------------
// Styles -- customer-facing only
// ---------------------------------------------------------------------------
const CUSTOMER_STYLES = `
:root {
  --ph-bg: #FBF7F0;
  --ph-surface: #FFFFFF;
  --ph-ink: #1C2B22;
  --ph-ink-soft: #3D4F42;
  --ph-taupe: #6B5840;
  --ph-taupe-soft: #8A7A65;
  --ph-clay: #C1622A;
  --ph-clay-tint: #FBE9DD;
  --ph-clay-dark: #A8511F;
  --ph-clay-tint: #FBE9DD;
  --ph-gold: #E8A33D;
  --ph-sand: #E4D7C2;
  --ph-sand-line: #EDE3D2;
  --ph-green-tint: #E3EEDF;
  --ph-green-text: #2C6B3F;
  --ph-red-tint: #FAE5DE;
  --ph-red-text: #A8442B;
  --ph-shadow-sm: 0 1px 2px rgba(28,43,34,0.06), 0 1px 1px rgba(28,43,34,0.04);
  --ph-shadow-md: 0 4px 14px rgba(28,43,34,0.08), 0 1px 3px rgba(28,43,34,0.06);
  --ph-shadow-lg: 0 16px 40px rgba(28,43,34,0.14), 0 4px 10px rgba(28,43,34,0.06);
  --ph-radius-sm: 8px;
  --ph-radius-md: 12px;
  --ph-radius-lg: 18px;
  --ph-serif: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, "Times New Roman", serif;
  --ph-sans: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Helvetica, Arial, sans-serif;
  --ph-mono: "SF Mono", ui-monospace, "Courier New", monospace;
}

* { box-sizing: border-box; }

.ph-app {
  font-family: var(--ph-sans);
  color: var(--ph-ink);
  background: var(--ph-bg);
  min-height: 100%;
  font-size: 15px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

.ph-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 28px;
  background: var(--ph-ink);
  background-image: linear-gradient(165deg, #20342a 0%, var(--ph-ink) 60%);
  color: var(--ph-bg);
}
.ph-header-brand { display: flex; align-items: center; gap: 10px; }
.ph-header-titles { display: flex; flex-direction: column; line-height: 1.15; }
.ph-header-title {
  font-family: var(--ph-serif);
  font-size: 22px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: #FDFBF6;
  margin: 0;
}
.ph-header-subtitle {
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ph-gold);
  margin-top: 3px;
}
.ph-contractor-link {
  font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.65); text-decoration: none;
  padding: 6px 12px; border: 1px solid rgba(255,255,255,0.2); border-radius: 6px;
  transition: all 0.15s ease;
}
.ph-contractor-link:hover { color: #fff; border-color: rgba(255,255,255,0.5); background: rgba(255,255,255,0.08); }
.ph-forgot-btn {
  background: none; border: none; cursor: pointer; font-size: 12px; color: var(--ph-taupe);
  font-family: inherit; text-decoration: underline; padding: 0;
}
.ph-forgot-btn:hover { color: var(--ph-ink); }
.ph-forgot-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.ph-role-switch {
  display: flex;
  gap: 3px;
  background: rgba(255,255,255,0.08);
  border-radius: 999px;
  padding: 4px;
}
.ph-role-switch button {
  background: transparent;
  border: none;
  color: rgba(253,251,246,0.72);
  padding: 8px 18px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
  font-family: inherit;
}
.ph-role-switch button:hover { color: #FDFBF6; }
.ph-role-switch button.is-active {
  background: var(--ph-clay);
  color: #FFF8EE;
  box-shadow: 0 2px 8px rgba(0,0,0,0.18);
}

.ph-main { max-width: 1020px; margin: 0 auto; padding: 32px 24px 80px; }

@keyframes ph-fadein {
  from { opacity: 0; }
  to   { opacity: 1; }
}
.ph-fadein {
  animation: ph-fadein 200ms ease both;
}

.ph-btn-primary {
  background: var(--ph-clay);
  color: #FFF8EE;
  border: none;
  padding: 11px 20px;
  border-radius: var(--ph-radius-sm);
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.05s ease, box-shadow 0.15s ease;
  box-shadow: var(--ph-shadow-sm);
  font-family: inherit;
}
.ph-btn-primary:hover:not(:disabled) { background: var(--ph-clay-dark); box-shadow: var(--ph-shadow-md); }
.ph-btn-primary:active:not(:disabled) { transform: translateY(1px); }
.ph-btn-primary:disabled { background: var(--ph-sand); color: var(--ph-taupe-soft); cursor: not-allowed; box-shadow: none; }

.ph-btn-secondary {
  background: var(--ph-surface);
  color: var(--ph-ink-soft);
  border: 1.5px solid var(--ph-sand);
  padding: 10px 19px;
  border-radius: var(--ph-radius-sm);
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;
  font-family: inherit;
}
.ph-btn-secondary:hover:not(:disabled) { border-color: var(--ph-taupe-soft); color: var(--ph-ink); }
.ph-btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }

.ph-btn-danger { background: var(--ph-red-text); }
.ph-btn-danger:hover:not(:disabled) { background: #8f3a24; }

/* Trade marquee */
.ph-marquee-wrap {
  overflow: hidden;
  margin-bottom: 14px;
  mask-image: linear-gradient(to right, transparent, black 60px, black calc(100% - 60px), transparent);
  -webkit-mask-image: linear-gradient(to right, transparent, black 60px, black calc(100% - 60px), transparent);
}
.ph-marquee-track {
  display: flex;
  gap: 8px;
  width: max-content;
  animation: ph-marquee 120s linear infinite;
}
.ph-marquee-track:hover { animation-play-state: paused; }
@keyframes ph-marquee {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}
/* Accessibility: honor the OS "reduce motion" setting -- the infinite trade
   marquee and other animations can trigger motion sickness. This freezes the
   marquee (showing a static row) and neutralizes transitions/animations. */
@media (prefers-reduced-motion: reduce) {
  .ph-marquee-track { animation: none; flex-wrap: wrap; }
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
    scroll-behavior: auto !important;
  }
}
.ph-trade-pill {
  flex-shrink: 0;
  background: var(--ph-surface);
  border: 1.5px solid var(--ph-sand-line);
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ph-taupe);
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s ease;
  white-space: nowrap;
}
.ph-trade-pill:hover { border-color: var(--ph-clay); color: var(--ph-clay); }
.ph-trade-pill.is-active { background: var(--ph-clay); border-color: var(--ph-clay); color: #fff; }

/* Trade filter modal */
.ph-trade-modal-overlay {
  position: fixed; inset: 0; background: rgba(28,43,34,0.45);
  z-index: 1000; display: flex; align-items: flex-end; justify-content: center;
  animation: ph-fadein 200ms ease both;
}
.ph-trade-modal {
  background: var(--ph-surface); width: 100%; max-width: 520px;
  border-radius: 20px 20px 0 0; display: flex; flex-direction: column;
  max-height: 85vh;
}
.ph-trade-modal-handle {
  width: 36px; height: 4px; background: var(--ph-sand-line);
  border-radius: 99px; margin: 10px auto 0; flex-shrink: 0;
}
.ph-trade-modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 16px 8px; border-bottom: 1px solid var(--ph-sand-line); flex-shrink: 0;
}
.ph-trade-modal-title { font-size: 14px; font-weight: 700; color: var(--ph-ink); font-family: var(--ph-serif); }
.ph-trade-modal-close {
  width: 26px; height: 26px; border-radius: 50%; background: var(--ph-bg);
  border: none; font-size: 15px; cursor: pointer; display: flex;
  align-items: center; justify-content: center; color: var(--ph-taupe);
}
.ph-trade-all-btn {
  display: flex; align-items: center; gap: 8px; padding: 8px 16px;
  border-bottom: 1px solid var(--ph-sand-line); background: var(--ph-bg);
  border-top: none; border-left: none; border-right: none;
  cursor: pointer; font-family: inherit; width: 100%;
}
.ph-trade-all-icon {
  width: 24px; height: 24px; border-radius: 6px; background: var(--ph-ink);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.ph-trade-all-label { font-size: 12px; font-weight: 700; color: var(--ph-ink); }
.ph-trade-modal-body { padding: 6px 12px 24px; overflow-y: auto; }
.ph-trade-category-label {
  grid-column: 1 / -1; font-size: 7.5px; font-weight: 700;
  letter-spacing: 0.1em; text-transform: uppercase; color: var(--ph-taupe-soft);
  padding: 8px 4px 3px;
}
.ph-trade-modal-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px; }
.ph-trade-modal-item {
  display: flex; align-items: center; gap: 7px; padding: 6px 8px;
  border-radius: 8px; cursor: pointer; background: none; border: none;
  font-family: inherit; text-align: left; transition: background 0.12s ease;
}
.ph-trade-modal-item:hover { background: var(--ph-bg); }
.ph-trade-modal-item.is-active { background: var(--ph-clay-tint); }
.ph-trade-item-icon {
  width: 22px; height: 22px; border-radius: 6px; background: var(--ph-bg);
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; color: var(--ph-taupe); flex-shrink: 0;
}
.ph-trade-modal-item.is-active .ph-trade-item-icon { background: var(--ph-clay); color: #fff; }
.ph-trade-item-label { font-size: 11px; font-weight: 600; color: var(--ph-ink); line-height: 1.2; }
.ph-trade-modal-item.is-active .ph-trade-item-label { color: var(--ph-clay); }

@media (min-width: 640px) {
  .ph-trade-modal-overlay { align-items: center; }
  .ph-trade-modal { border-radius: 16px; max-height: 80vh; }
  .ph-trade-modal-handle { display: none; }
}

.ph-filter-bar { display: flex; gap: 10px; align-items: center; margin-bottom: 22px; flex-wrap: wrap; }
.ph-filter-bar select {
  border: 1.5px solid var(--ph-sand);
  background: var(--ph-surface);
  border-radius: var(--ph-radius-sm);
  padding: 10px 14px;
  font-size: 13.5px;
  color: var(--ph-ink);
  font-family: inherit;
  cursor: pointer;
}
.ph-filter-bar select:focus { outline: none; border-color: var(--ph-clay); }
.ph-filter-spacer { flex: 1; }
.ph-selected-pill {
  font-size: 12.5px;
  color: var(--ph-taupe);
  background: var(--ph-sand-line);
  padding: 8px 14px;
  border-radius: 999px;
  font-weight: 600;
}

/* Floating how-it-works info button */
.ph-info-btn {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--ph-ink);
  color: #fff;
  border: none;
  font-size: 18px;
  font-weight: 700;
  font-family: var(--ph-serif);
  cursor: pointer;
  z-index: 90;
  box-shadow: 0 4px 14px rgba(0,0,0,0.25);
  transition: background 0.15s ease, transform 0.1s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ph-info-btn:hover { background: var(--ph-clay); transform: scale(1.08); }
@media (max-width: 768px) { .ph-info-btn { bottom: 16px; right: 16px; width: 36px; height: 36px; font-size: 16px; } }

.ph-confirmation {
  background: var(--ph-green-tint);
  color: var(--ph-green-text);
  border: 1px solid #c7e0c2;
  border-radius: var(--ph-radius-sm);
  padding: 12px 16px;
  font-size: 13.5px;
  margin-bottom: 16px;
  font-weight: 500;
}
.ph-confirmation-error {
  background: var(--ph-red-tint);
  color: var(--ph-red-text);
  border-color: #E3BCA8;
}

.ph-response-banner {
  display: block;
  width: 100%;
  text-align: center;
  background: var(--ph-clay);
  color: #fff;
  border: none;
  border-radius: var(--ph-radius-md);
  padding: 12px 16px;
  margin-bottom: 16px;
  font-size: 14px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
}
.ph-response-banner:hover { background: var(--ph-clay-dark); }
.ph-trust-banner {
  background: var(--ph-ink);
  background-image: linear-gradient(135deg, #233a2d 0%, var(--ph-ink) 100%);
  color: #FDFBF6;
  border-radius: var(--ph-radius-lg);
  padding: 18px 22px;
  margin-bottom: 24px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  box-shadow: var(--ph-shadow-md);
}
.ph-trust-banner strong { font-size: 15px; font-family: var(--ph-serif); }
.ph-trust-banner span { font-size: 13px; color: rgba(253,251,246,0.78); line-height: 1.6; }

.ph-directory-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 16px; align-items: stretch; }
.ph-empty {
  color: var(--ph-taupe-soft);
  padding: 56px 0;
  text-align: center;
  grid-column: 1 / -1;
  font-size: 14px;
}

.ph-card {
  background: var(--ph-surface);
  border: 1px solid var(--ph-sand-line);
  border-radius: var(--ph-radius-md);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-shadow: var(--ph-shadow-sm);
  transition: box-shadow 0.18s ease, transform 0.18s ease;
}
.ph-directory-grid .ph-card:hover { box-shadow: var(--ph-shadow-md); transform: translateY(-1px); }
.ph-card.is-selected { border-color: var(--ph-clay); box-shadow: 0 0 0 2px var(--ph-clay-tint), var(--ph-shadow-md); }

.ph-card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
.ph-card-id { display: flex; gap: 12px; align-items: flex-start; }
.ph-avatar {
  width: 42px; height: 42px; border-radius: 10px;
  background: var(--ph-ink);
  background-image: linear-gradient(145deg, #2d4536, var(--ph-ink));
  color: #FDFBF6;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 13px; flex-shrink: 0;
  font-family: var(--ph-serif);
}
.ph-avatar.lg { width: 56px; height: 56px; font-size: 18px; border-radius: 13px; }
/* Bigger logo on the directory cards (both uploaded logos and initials fallback) */
.ph-card-id .ph-avatar { width: 72px; height: 72px; border-radius: 16px; font-size: 22px; }
/* Zoom the logo to fill the box: the white-background step bakes ~6% padding
   around each logo, so scaling ~1.14x crops that margin and the mark goes
   edge to edge. Works on already-uploaded logos without re-processing. */
.ph-avatar-logo { overflow: hidden; background: #fff; padding: 0; }
.ph-avatar-logo img { width: 100%; height: 100%; object-fit: cover; transform: scale(1.14); display: block; }
.ph-card-name {
  background: none; border: none; padding: 0; font-size: 15px; font-weight: 700;
  color: var(--ph-ink); text-align: left; cursor: pointer; font-family: var(--ph-serif);
  text-decoration: underline; text-decoration-color: transparent; text-decoration-thickness: 1.5px;
  transition: text-decoration-color 0.15s ease;
}
.ph-card-name:hover { text-decoration-color: var(--ph-clay); }
.ph-founder-badge {
  display: inline-block;
  margin-top: 6px;
  background: linear-gradient(135deg, #F3E4C4 0%, #E8CF9E 100%);
  color: #7A5A1E;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.03em;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid #DECB87;
}
.ph-card-trade {
  font-size: 11.5px; color: var(--ph-clay); margin-top: 3px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.04em;
}
.ph-card-bio {
  font-size: 13px; color: var(--ph-ink-soft); margin: 0; line-height: 1.5;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  min-height: 39px;
}
.ph-card-meta { display: flex; gap: 16px; flex-wrap: wrap; font-size: 12px; color: var(--ph-taupe-soft); }
.ph-meta-icon { margin-right: 5px; font-style: normal; }
.ph-card-bottom { display: flex; justify-content: space-between; align-items: center; padding-top: 10px; border-top: 1px solid var(--ph-sand-line); }
.ph-rating-text { font-size: 12.5px; color: var(--ph-taupe); margin-left: 5px; font-weight: 600; }
.ph-rating-text.muted { color: var(--ph-taupe-soft); font-weight: 400; }
.ph-thumbs { display: flex; gap: 10px; font-size: 12px; font-weight: 700; }
.ph-thumb.up { color: var(--ph-green-text); }
.ph-thumb.down { color: var(--ph-red-text); }

.ph-stars { font-size: 14px; letter-spacing: 1px; }
.ph-star { color: var(--ph-sand); }
.ph-star.filled { color: var(--ph-gold); }

.ph-select-toggle { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--ph-taupe); cursor: pointer; white-space: nowrap; font-weight: 600; }
.ph-select-toggle input { accent-color: var(--ph-clay); width: 15px; height: 15px; }
.ph-card-actions { display: flex; gap: 8px; margin-top: auto; padding-top: 4px; }
.ph-card-view-btn {
  flex: 0 0 auto; padding: 10px 16px; border-radius: var(--ph-radius-md);
  border: 1px solid var(--ph-sand-line); background: var(--ph-surface);
  color: var(--ph-ink); font-family: inherit; font-size: 13.5px; font-weight: 600;
  cursor: pointer; transition: border-color 0.15s ease, background 0.15s ease;
}
.ph-card-view-btn:hover { border-color: var(--ph-clay); color: var(--ph-clay); }
.ph-card-select-btn {
  flex: 1 1 auto; padding: 10px 16px; border-radius: var(--ph-radius-md);
  border: 1px solid var(--ph-clay); background: var(--ph-surface);
  color: var(--ph-clay); font-family: inherit; font-size: 13.5px; font-weight: 700;
  cursor: pointer; transition: background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
}
.ph-card-select-btn:hover { background: rgba(193, 98, 42, 0.08); }
.ph-card-select-btn.is-selected {
  background: var(--ph-clay); color: #fff;
  box-shadow: 0 2px 8px rgba(193, 98, 42, 0.3);
}

.ph-no-fee-badge {
  align-self: flex-start; font-size: 11px; font-weight: 700; color: var(--ph-green-text); background: var(--ph-green-tint);
  border-radius: 999px; padding: 4px 11px; letter-spacing: 0.01em;
}

.ph-section { margin-top: 44px; }
.ph-section h3 { font-size: 17px; margin-bottom: 14px; font-family: var(--ph-serif); font-weight: 700; }
.ph-qr-row {
  display: flex; justify-content: space-between; gap: 14px; padding: 14px 0; border-bottom: 1px solid var(--ph-sand-line); align-items: flex-start;
}
.ph-qr-desc { font-size: 13.5px; font-weight: 700; margin-bottom: 4px; }
.ph-qr-meta { font-size: 12px; color: var(--ph-taupe-soft); }
.ph-qr-statuses { display: flex; gap: 6px; flex-wrap: wrap; }

.ph-qr-card {
  background: var(--ph-surface); border: 1px solid var(--ph-sand-line); border-radius: var(--ph-radius-md); padding: 16px 18px;
  margin-bottom: 12px; max-width: 660px; box-shadow: var(--ph-shadow-sm);
}
.ph-qr-recipients { margin-top: 12px; display: flex; flex-direction: column; gap: 10px; }
.ph-qr-recipient-row {
  display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; padding-top: 10px; border-top: 1px solid var(--ph-sand-line);
}
.ph-qr-recipient-row:first-child { padding-top: 0; border-top: none; }
.ph-qr-recipient-name { font-size: 13.5px; font-weight: 700; flex-shrink: 0; }
.ph-qr-recipient-quote { text-align: right; font-size: 13px; }
.ph-qr-quote-price { font-weight: 700; font-family: var(--ph-mono); color: var(--ph-clay-dark); }

.ph-compose-quote {
  background: var(--ph-bg); border: 1px solid var(--ph-sand-line); border-radius: var(--ph-radius-sm); padding: 14px; display: flex; flex-direction: column; gap: 4px;
}
.ph-line-items { display: flex; flex-direction: column; gap: 6px; }
.ph-line-items-header {
  display: grid; grid-template-columns: 1fr 60px 90px 80px 24px;
  gap: 6px; font-size: 10.5px; font-weight: 700; color: var(--ph-taupe-soft);
  text-transform: uppercase; letter-spacing: 0.05em; padding: 0 4px;
}
.ph-line-item-row {
  display: grid; grid-template-columns: 1fr 60px 90px 80px 24px;
  gap: 6px; align-items: center;
}
.ph-line-item-desc, .ph-line-item-num {
  font-family: var(--ph-sans); font-size: 13px; padding: 7px 9px;
  border: 1.5px solid var(--ph-sand); border-radius: 6px; background: var(--ph-surface);
  color: var(--ph-ink);
}
.ph-line-item-desc:focus, .ph-line-item-num:focus { outline: none; border-color: var(--ph-clay); }
.ph-line-item-total { font-size: 13px; font-weight: 600; color: var(--ph-ink); font-family: var(--ph-mono); text-align: right; }
.ph-line-item-remove {
  background: none; border: none; font-size: 18px; color: var(--ph-taupe-soft);
  cursor: pointer; padding: 0; line-height: 1;
}
.ph-line-item-remove:hover { color: var(--ph-red-text); }
.ph-line-item-remove:disabled { opacity: 0.2; cursor: not-allowed; }
.ph-line-items-total {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 4px 4px; border-top: 1.5px solid var(--ph-sand-line); margin-top: 4px;
  font-size: 14px; font-weight: 700; color: var(--ph-ink);
}
.ph-line-items-total span:last-child { font-family: var(--ph-mono); color: var(--ph-clay-dark); }
.ph-sent-quote-summary {
  background: var(--ph-bg); border-radius: var(--ph-radius-sm); padding: 12px 14px; display: flex; flex-direction: column; gap: 4px;
}
.ph-sent-quote-summary p { margin: 2px 0 0; }
.ph-status-chip {
  font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; padding: 4px 10px; border-radius: 999px;
}
.ph-status-chip.sent { background: var(--ph-sand-line); color: var(--ph-taupe); }
.ph-status-chip.responded { background: var(--ph-green-tint); color: var(--ph-green-text); }
.ph-status-chip.declined { background: var(--ph-red-tint); color: var(--ph-red-text); }

.ph-modal-overlay {
  position: fixed; inset: 0; background: var(--ph-bg); display: flex; align-items: flex-start; justify-content: center;
  z-index: 1000; overflow-y: auto; cursor: pointer; padding: 60px 24px 60px;
  animation: ph-fadein 200ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
.ph-modal {
  background: var(--ph-surface); border-radius: var(--ph-radius-lg); padding: 40px; width: 100%;
  max-width: 620px; position: relative; box-shadow: var(--ph-shadow-lg); cursor: default;
  height: fit-content; align-self: flex-start;
}
.ph-modal-close {
  position: fixed; top: 20px; right: 24px; background: var(--ph-ink); border: none; width: 44px; height: 44px; border-radius: 50%;
  font-size: 22px; color: #FDFBF6; cursor: pointer; line-height: 1; display: flex; align-items: center; justify-content: center;
  z-index: 1001; box-shadow: var(--ph-shadow-md); transition: background 0.15s ease, transform 0.1s ease;
}
.ph-modal-close:hover { background: var(--ph-clay); transform: scale(1.08); }
.ph-modal h2 { font-size: 20px; margin: 0 0 8px; font-family: var(--ph-serif); font-weight: 700; }
.ph-modal-head { display: flex; gap: 16px; align-items: center; margin-bottom: 16px; }
.ph-profile-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 18px 0; font-size: 13.5px; }
.ph-profile-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ph-taupe-soft); margin-bottom: 4px; font-weight: 700; }
.ph-divider { border-top: 1px solid var(--ph-sand-line); margin: 18px 0; }
.ph-review { padding: 12px 0; border-bottom: 1px solid var(--ph-sand-line); }
.ph-review p { margin: 5px 0; font-size: 13.5px; }
.ph-card-review {
  margin: 2px 0 0; padding-top: 8px; border-top: 1px solid var(--ph-sand-line);
  font-size: 12.5px; font-style: italic; color: var(--ph-ink-soft); line-height: 1.45;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  min-height: 46px;
}
.ph-card-review-tag { font-style: normal; font-size: 11.5px; color: var(--ph-taupe-soft); white-space: nowrap; }
.ph-card-review.is-clickable { cursor: pointer; transition: color 0.12s ease; }
.ph-card-review.is-clickable:hover { color: var(--ph-ink); }
.ph-review-author { font-size: 12px; color: var(--ph-taupe-soft); }
.ph-muted { color: var(--ph-taupe-soft); }
.ph-muted.small { font-size: 12px; }

.ph-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; font-size: 13px; font-weight: 700; color: var(--ph-ink-soft); }
.ph-field.inline { margin-bottom: 0; flex-direction: row; align-items: center; gap: 10px; }
.ph-field input, .ph-field textarea, .ph-field select {
  font-family: var(--ph-sans); font-weight: 400; font-size: 16px; padding: 11px 13px; border: 1.5px solid var(--ph-sand);
  border-radius: var(--ph-radius-sm); background: var(--ph-surface); color: var(--ph-ink); transition: border-color 0.15s ease;
}
.ph-field input:focus, .ph-field textarea:focus, .ph-field select:focus { outline: none; border-color: var(--ph-clay); }
.ph-field input[type="file"] { padding: 9px 13px; font-size: 13px; cursor: pointer; }
.ph-field input[type="file"]::-webkit-file-upload-button {
  background: var(--ph-ink); color: #FDFBF6; border: none; padding: 8px 16px; border-radius: 6px; font-size: 12.5px;
  font-weight: 600; cursor: pointer; margin-right: 12px; font-family: var(--ph-sans);
}
.ph-field input[type="file"]::-webkit-file-upload-button:hover { background: #2a3f31; }
.ph-field textarea { resize: vertical; }
.ph-field-row { display: flex; gap: 16px; }
.ph-field-row .ph-field { flex: 1; }

.ph-onboard { max-width: 660px; }
.ph-onboard h2 { font-size: 21px; margin-bottom: 6px; font-family: var(--ph-serif); font-weight: 700; }

.ph-contractor-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-wrap: wrap; gap: 12px; }
.ph-tab-switch { display: flex; gap: 3px; background: var(--ph-sand-line); border-radius: 999px; padding: 4px; }
.ph-tab-switch button { background: transparent; border: none; padding: 8px 16px; border-radius: 999px; font-size: 13px; cursor: pointer; color: var(--ph-taupe); font-weight: 600; font-family: inherit; transition: background 0.15s ease, color 0.15s ease; }
.ph-tab-switch button.is-active { background: var(--ph-surface); font-weight: 700; color: var(--ph-ink); box-shadow: var(--ph-shadow-sm); }

.ph-pending-banner { background: #FBF1DE; border: 1px solid #EAD7AC; border-radius: var(--ph-radius-md); padding: 18px; font-size: 13.5px; }
.ph-reviewing-notice { background: #FBF1DE; border: 1px solid #EAD7AC; border-radius: var(--ph-radius-md); padding: 10px 14px; font-size: 13px; margin-bottom: 16px; }
.ph-rejected-banner { background: var(--ph-red-tint); border: 1px solid #E3BCA8; border-radius: var(--ph-radius-md); padding: 18px; font-size: 13.5px; color: var(--ph-red-text); }
.ph-rejected-banner strong { display: block; margin-bottom: 6px; font-size: 14.5px; }
.ph-inbox-card { max-width: 660px; }
.ph-inbox-actions { display: flex; gap: 10px; margin-top: 6px; align-items: center; }

.ph-fee-explainer {
  background: var(--ph-surface); border: 1px solid var(--ph-sand-line); border-radius: var(--ph-radius-lg); padding: 22px; margin-bottom: 24px;
  max-width: 660px; box-shadow: var(--ph-shadow-sm);
}
.ph-fee-explainer strong { font-size: 15px; display: block; margin-bottom: 8px; font-family: var(--ph-serif); }
.ph-fee-explainer p { font-size: 13.5px; color: var(--ph-ink-soft); line-height: 1.6; margin: 0 0 14px; }
.ph-fee-table { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px; }
.ph-fee-tier {
  display: flex; justify-content: space-between; background: var(--ph-bg); border-radius: var(--ph-radius-sm); padding: 10px 14px; font-size: 13.5px;
}
.ph-fee-tier-label { color: var(--ph-taupe); }
.ph-fee-tier-rate { font-weight: 700; font-family: var(--ph-mono); color: var(--ph-clay-dark); }

.ph-suspended-banner {
  background: var(--ph-red-tint); border: 1px solid #E3BCA8; border-radius: var(--ph-radius-md); padding: 16px 18px; margin-bottom: 22px;
  font-size: 13.5px; color: var(--ph-red-text);
}
.ph-suspended-banner strong { display: block; margin-bottom: 5px; }

.ph-job-card { max-width: 660px; }
.ph-job-status-row { display: flex; align-items: center; gap: 10px; }
.ph-fee-owed-row {
  display: flex; justify-content: space-between; align-items: center; padding-top: 10px; border-top: 1px solid var(--ph-sand-line);
}
.ph-fee-owed-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ph-taupe-soft); display: block; font-weight: 700; }
.ph-fee-owed-amount { font-size: 20px; font-weight: 700; font-family: var(--ph-mono); color: var(--ph-ink); margin-right: 4px; }

.ph-invoice-builder {
  display: flex; flex-direction: column; gap: 12px; width: 100%;
  background: var(--ph-bg); border: 1.5px solid var(--ph-sand-line);
  border-radius: var(--ph-radius-sm); padding: 16px;
}
.ph-invoice-builder-header {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 14px; font-weight: 700; color: var(--ph-ink);
  padding-bottom: 10px; border-bottom: 1px solid var(--ph-sand-line);
}

.ph-report-form { display: flex; flex-direction: column; gap: 10px; width: 100%; }

.ph-report-row { display: flex; align-items: center; gap: 8px; }
.ph-report-prefix { font-size: 13.5px; color: var(--ph-taupe-soft); }
.ph-report-input {
  width: 110px; font-size: 16px; padding: 9px 10px; border: 1.5px solid var(--ph-sand); border-radius: var(--ph-radius-sm); font-family: var(--ph-mono);
}
.ph-report-input:focus { outline: none; border-color: var(--ph-clay); }

.ph-low-report-warning {
  background: #FBF1DE;
  border: 1.5px solid #EAD7AC;
  border-radius: var(--ph-radius-sm);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ph-low-report-label {
  font-size: 12.5px;
  font-weight: 600;
  color: #7A5A1A;
}
.ph-low-report-reason {
  font-family: var(--ph-sans);
  font-size: 13.5px;
  padding: 9px 11px;
  border: 1.5px solid #EAD7AC;
  border-radius: var(--ph-radius-sm);
  background: var(--ph-surface);
  color: var(--ph-ink);
  resize: vertical;
}
.ph-low-report-reason:focus { outline: none; border-color: var(--ph-clay); }

.ph-edit-amount-form {
  display: flex; flex-direction: column; gap: 10px; background: var(--ph-bg); border: 1px solid var(--ph-sand-line);
  border-radius: var(--ph-radius-sm); padding: 14px; margin-top: 8px; max-width: 560px;
}

.ph-job-history-row { border-bottom: 1px solid var(--ph-sand-line); padding-bottom: 10px; }
.ph-job-history-row:last-child { border-bottom: none; }
.ph-job-review-area { padding: 4px 0 10px; }

.ph-review-form {
  display: flex; flex-direction: column; gap: 10px; background: var(--ph-bg);
  border: 1px solid var(--ph-sand-line); border-radius: var(--ph-radius-sm); padding: 14px; max-width: 480px;
}
.ph-review-form-stars { display: flex; gap: 4px; }
.ph-review-star-btn {
  background: none; border: none; font-size: 26px; line-height: 1; cursor: pointer; color: var(--ph-sand);
  padding: 0; transition: color 0.1s ease;
}
.ph-review-star-btn:hover, .ph-review-star-btn.is-filled { color: var(--ph-gold); }
.ph-review-form textarea {
  font-family: var(--ph-sans); font-size: 13.5px; padding: 9px 11px; border: 1.5px solid var(--ph-sand);
  border-radius: var(--ph-radius-sm); resize: vertical; color: var(--ph-ink);
}
.ph-review-form textarea:focus { outline: none; border-color: var(--ph-clay); }

.ph-thumbs-up-row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 4px 0 16px;
  background: var(--ph-bg); border-radius: var(--ph-radius-sm); padding: 12px 14px;
}
.ph-thumbs-up-count { font-size: 13.5px; font-weight: 700; color: var(--ph-green-text); }
.ph-btn-thumbsup {
  background: var(--ph-surface); border: 1.5px solid var(--ph-sand); color: var(--ph-ink-soft); padding: 8px 16px;
  border-radius: var(--ph-radius-sm); font-size: 12.5px; font-weight: 600; cursor: pointer; transition: all 0.15s ease;
}
.ph-btn-thumbsup:hover:not(:disabled) { border-color: var(--ph-green-text); color: var(--ph-green-text); }
.ph-btn-thumbsup.is-active { background: var(--ph-green-tint); border-color: var(--ph-green-text); color: var(--ph-green-text); }
.ph-btn-thumbsup:disabled { opacity: 0.6; cursor: not-allowed; }

.ph-confirm-card { max-width: 660px; border-color: var(--ph-gold); box-shadow: 0 0 0 1px rgba(232,163,61,0.25), var(--ph-shadow-sm); }
.ph-confirm-card.is-over-quote { border-color: var(--ph-red-text); box-shadow: 0 0 0 1px rgba(168,68,43,0.3), var(--ph-shadow-sm); }

.ph-confirm-amounts {
  display: flex; flex-direction: column; gap: 6px; background: var(--ph-bg); border-radius: var(--ph-radius-sm);
  padding: 12px 14px; margin: 4px 0;
}
.ph-confirm-amount-row { display: flex; justify-content: space-between; align-items: center; font-size: 13.5px; }
.ph-confirm-amount-label { color: var(--ph-taupe); }
.ph-confirm-amount-value { font-weight: 700; font-family: var(--ph-mono); color: var(--ph-ink); }
.ph-confirm-amount-value.is-higher { color: var(--ph-red-text); }

.ph-confirm-warning {
  background: var(--ph-red-tint); border: 1px solid #E3BCA8; border-radius: var(--ph-radius-sm); padding: 10px 13px;
  font-size: 12.5px; color: var(--ph-red-text); line-height: 1.5; font-weight: 500; margin: 4px 0;
}
.ph-auto-confirm-notice {
  border-radius: var(--ph-radius-sm); padding: 8px 13px; font-size: 12px; font-weight: 600; margin: 4px 0;
}

.ph-avatar-img { object-fit: contain; background: #fff; padding: 2px; }
.ph-logo-preview { display: flex; align-items: center; gap: 12px; margin-top: 10px; }
.ph-logo-preview img { width: 52px; height: 52px; border-radius: var(--ph-radius-sm); object-fit: cover; border: 1px solid var(--ph-sand-line); }

.ph-load-error-banner {
  display: flex; justify-content: space-between; align-items: center; gap: 10px; background: var(--ph-red-tint); border: 1px solid #E3BCA8;
  border-radius: var(--ph-radius-md); padding: 12px 16px; margin-bottom: 18px; font-size: 13.5px; color: var(--ph-red-text);
}

.ph-stripe-element-container { margin: 16px 0; min-height: 40px; }
.ph-stripe-config-notice {
  background: #FBF1DE; border: 1px solid #EAD7AC; border-radius: var(--ph-radius-md); padding: 16px 18px; margin: 16px 0; font-size: 13.5px;
}
.ph-stripe-config-notice strong { display: block; margin-bottom: 8px; }
.ph-stripe-config-notice code {
  background: rgba(28,43,34,0.06); padding: 2px 6px; border-radius: 4px; font-size: 12px; font-family: var(--ph-mono);
}
.ph-stripe-error {
  background: var(--ph-red-tint); border: 1px solid #E3BCA8; border-radius: var(--ph-radius-md); padding: 14px 16px; margin: 16px 0; font-size: 13.5px; color: var(--ph-red-text);
}
.ph-stripe-inline-error { color: var(--ph-red-text); font-size: 13px; margin: 10px 0; font-weight: 500; }
.ph-stripe-footnote { margin-top: 14px; }

.ph-card-top-actions { display: flex; align-items: center; gap: 12px; }
.ph-favorite-btn {
  background: none; border: none; font-size: 21px; line-height: 1; cursor: pointer; color: var(--ph-sand); padding: 0; transition: color 0.15s ease;
}
.ph-favorite-btn:hover { color: var(--ph-gold); }
.ph-favorite-btn.is-favorite { color: var(--ph-gold); }

.ph-founding-offer {
  display: flex; gap: 13px; align-items: flex-start;
  background: linear-gradient(135deg, #FBF3E2 0%, #F4E6C9 100%);
  border: 1px solid #E8CF9E; border-radius: var(--ph-radius-lg);
  padding: 15px 17px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(122,90,30,0.10);
}
.ph-founding-offer-badge {
  background: linear-gradient(135deg, #E8A33D 0%, #C8872A 100%); color: #3A2A0E;
  font-weight: 700; font-size: 11px; letter-spacing: 0.04em; white-space: nowrap;
  padding: 5px 11px; border-radius: 999px; margin-top: 1px;
}
.ph-founding-offer-body { display: flex; flex-direction: column; gap: 3px; }
.ph-founding-offer-body strong { font-size: 14.5px; color: #6B4E14; font-family: var(--ph-serif); font-weight: 700; }
.ph-founding-offer-body span { font-size: 12.5px; color: #7A5A1E; line-height: 1.5; }
.ph-auth-card {
  background: var(--ph-surface); border: 1px solid var(--ph-sand-line); border-radius: var(--ph-radius-lg); padding: 32px; max-width: 460px;
  box-shadow: var(--ph-shadow-md); margin: 48px auto 0; min-height: 420px;
}
.ph-auth-card h2 { font-size: 21px; margin: 0 0 8px; font-family: var(--ph-serif); font-weight: 700; }

.ph-link-btn {
  background: none; border: none; padding: 0; margin-bottom: 16px; cursor: pointer;
  color: var(--ph-taupe); font-size: 13px; font-weight: 600; font-family: inherit;
}
.ph-link-btn:hover { color: var(--ph-ink); text-decoration: underline; }

.ph-guest-bar {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  background: var(--ph-surface); border: 1px solid var(--ph-sand-line); border-radius: var(--ph-radius-md);
  padding: 12px 16px; margin-bottom: 16px;
}
.ph-guest-bar-text { font-size: 13.5px; color: var(--ph-ink-soft); font-weight: 600; }

.ph-auth-mode-switch {
  display: flex; gap: 3px; background: var(--ph-sand-line); border-radius: 999px; padding: 4px; margin-bottom: 20px;
}
.ph-auth-mode-switch button {
  flex: 1; background: transparent; border: none; padding: 9px 16px; border-radius: 999px; font-size: 13px;
  cursor: pointer; color: var(--ph-taupe); font-weight: 600; font-family: inherit; transition: background 0.15s ease, color 0.15s ease;
}
.ph-auth-mode-switch button.is-active { background: var(--ph-surface); font-weight: 700; color: var(--ph-ink); box-shadow: var(--ph-shadow-sm); }

.ph-account-bar {
  display: flex; justify-content: space-between; align-items: center; background: var(--ph-surface); border: 1px solid var(--ph-sand-line);
  border-radius: var(--ph-radius-md); padding: 14px 18px; margin-bottom: 22px; box-shadow: var(--ph-shadow-sm);
}
.ph-account-id { display: flex; align-items: center; gap: 12px; }
.ph-account-name { font-size: 14.5px; font-weight: 700; }
.ph-account-zip { font-size: 12px; color: var(--ph-taupe-soft); }
.ph-account-actions { display: flex; gap: 10px; }

.ph-profile-page { max-width: 780px; }
.ph-profile-page-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; }
.ph-profile-page-head h2 { font-size: 21px; margin: 0; font-family: var(--ph-serif); font-weight: 700; }
.ph-profile-card-modal { max-width: 540px; }

.ph-profile-bio { font-size: 14px; color: var(--ph-ink-soft); line-height: 1.7; margin: 0 0 20px; }

.ph-profile-stats {
  display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px;
  background: var(--ph-bg); border-radius: var(--ph-radius-sm); padding: 16px;
}
.ph-profile-stat { display: flex; flex-direction: column; gap: 3px; }
.ph-profile-stat-label { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ph-taupe-soft); }
.ph-profile-stat-value { font-size: 13.5px; color: var(--ph-ink); font-weight: 500; }

.ph-profile-reviews-summary { display: flex; align-items: center; gap: 8px; margin-bottom: 20px; }
.ph-profile-reviews { margin: -6px 0 20px; }
.ph-profile-review { padding: 12px 0; border-top: 1px solid var(--ph-sand-line); }
.ph-profile-review:first-child { border-top: none; padding-top: 0; }
.ph-profile-review-text { font-size: 13.5px; color: var(--ph-ink-soft); line-height: 1.55; margin: 6px 0 4px; }
.ph-profile-review-date { font-size: 11.5px; color: var(--ph-taupe-soft); }

.ph-profile-card-actions { display: flex; gap: 10px; align-items: center; padding-top: 20px; border-top: 1px solid var(--ph-sand-line); }

/* Quote request photo grid */
.ph-photo-upload-btn {
  display: inline-flex; align-items: center; gap: 6px;
  background: var(--ph-bg); border: 1.5px dashed var(--ph-sand); border-radius: var(--ph-radius-sm);
  padding: 9px 14px; font-size: 13px; font-weight: 600; color: var(--ph-taupe); cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;
}
.ph-photo-upload-btn:hover { border-color: var(--ph-clay); color: var(--ph-clay); }
.ph-quote-photo-grid {
  display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px;
}
.ph-quote-photo-item {
  position: relative; width: 80px; height: 80px; border-radius: 8px; overflow: hidden;
  background: var(--ph-sand-line); flex-shrink: 0;
}
.ph-quote-photo-img { width: 100%; height: 100%; object-fit: cover; display: block; }
.ph-quote-photo-remove {
  position: absolute; top: 3px; right: 3px; width: 20px; height: 20px; border-radius: 50%;
  background: rgba(0,0,0,0.6); border: none; color: #fff; font-size: 14px; line-height: 1;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
}

/* Portfolio photo grid -- homeowner-facing (read-only) */
.ph-portfolio-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
}
.ph-portfolio-thumb {
  width: 100%;
  aspect-ratio: 4/3;
  object-fit: cover;
  border-radius: 6px;
  display: block;
  background: var(--ph-sand-line);
  transition: transform 0.15s ease;
  cursor: zoom-in;
}
.ph-portfolio-thumb:hover { transform: scale(1.03); }

.ph-picker { border: 1.5px solid var(--ph-sand); border-radius: var(--ph-radius-md); padding: 14px; background: var(--ph-surface); }
.ph-picker-allbtn {
  display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; background: var(--ph-bg); border: 1.5px solid var(--ph-sand-line);
  border-radius: var(--ph-radius-sm); padding: 12px 14px; cursor: pointer; margin-bottom: 12px; transition: background 0.15s ease, border-color 0.15s ease;
}
.ph-picker-allbtn:hover { border-color: var(--ph-clay); }
.ph-picker-allbtn.is-active { background: var(--ph-ink); background-image: linear-gradient(135deg, #233a2d, var(--ph-ink)); border-color: var(--ph-ink); }
.ph-picker-allbtn.is-active .ph-picker-alltext strong,
.ph-picker-allbtn.is-active .ph-picker-alltext span { color: #FDFBF6; }
.ph-picker-alltext { display: flex; flex-direction: column; }
.ph-picker-alltext strong { font-size: 13.5px; }
.ph-picker-alltext span { font-size: 11.5px; color: var(--ph-taupe-soft); font-weight: 400; }
.ph-picker-count { font-size: 11.5px; color: var(--ph-taupe-soft); margin-bottom: 10px; font-family: var(--ph-mono); }

.ph-checkbox {
  width: 17px; height: 17px; border: 1.5px solid var(--ph-taupe-soft); border-radius: 5px; flex-shrink: 0; position: relative; display: inline-block;
  transition: background 0.12s ease, border-color 0.12s ease;
}
.ph-checkbox.checked { background: var(--ph-clay); border-color: var(--ph-clay); }
.ph-checkbox.checked::after {
  content: ""; position: absolute; left: 4.5px; top: 1.5px; width: 5px; height: 9px; border: solid #FFF8EE; border-width: 0 2px 2px 0; transform: rotate(45deg);
}
.ph-checkbox.indeterminate { background: var(--ph-gold); border-color: var(--ph-gold); }
.ph-checkbox.indeterminate::after { content: ""; position: absolute; left: 3.5px; top: 7px; width: 8px; height: 2px; background: #FFF8EE; }

.ph-region { border-bottom: 1px solid var(--ph-sand-line); padding: 8px 0; }
.ph-region:last-child { border-bottom: none; }
.ph-region-row { display: flex; align-items: center; gap: 4px; }
.ph-expand-btn { background: none; border: none; cursor: pointer; color: var(--ph-taupe-soft); font-size: 11px; width: 18px; }
.ph-row-checkbox-btn { display: flex; align-items: center; gap: 10px; background: none; border: none; cursor: pointer; padding: 5px 0; flex: 1; text-align: left; font-family: inherit; }
.ph-region-label { font-size: 13.5px; font-weight: 700; }
.ph-city-list { padding-left: 28px; }
.ph-city-block { margin: 6px 0; }
.ph-city-row { padding: 5px 0; }
.ph-city-label { font-size: 13.5px; font-weight: 600; }
.ph-zip-count { font-size: 11px; color: var(--ph-taupe-soft); margin-left: 5px; }
.ph-zip-grid { display: flex; flex-wrap: wrap; gap: 6px; padding: 6px 0 6px 26px; }
.ph-zip-chip {
  font-family: var(--ph-mono); font-size: 11px; border: 1.5px solid var(--ph-sand); background: var(--ph-surface); color: var(--ph-taupe);
  border-radius: 6px; padding: 4px 8px; cursor: pointer; transition: all 0.12s ease;
}
.ph-zip-chip:hover { border-color: var(--ph-clay); color: var(--ph-clay); }
.ph-zip-chip.is-checked { background: var(--ph-ink); border-color: var(--ph-ink); color: #FDFBF6; }

@media (max-width: 640px) {
  .ph-header { padding: 14px 18px; flex-wrap: wrap; gap: 10px; }
  .ph-main { padding: 22px 16px 60px; }
  .ph-profile-grid, .ph-fee-table, .ph-detail-grid { grid-template-columns: 1fr; }
  .ph-directory-grid { grid-template-columns: 1fr; }
  .ph-field-row { flex-direction: column; gap: 0; }
  .ph-onboard { max-width: 100%; }
  .ph-zip-grid { padding-left: 10px; }
}

/* ─────────────────────────────────────────────────────────────────────────────
   Contractor theme -- a more professional, tool-like version of the same
   brand. Same warm tones, tighter and crisper execution.
───────────────────────────────────────────────────────────────────────────── */
.is-contractor {
  --ph-bg: #F2EDE6;
  --ph-surface: #FFFFFF;
  --ph-ink: #1C2B22;
  --ph-ink-soft: #3D4F42;
  --ph-taupe: #6B5840;
  --ph-taupe-soft: #8A7A65;
  --ph-clay: #A8511F;
  --ph-clay-dark: #8C4118;
  --ph-clay-tint: #F5E0D4;
  --ph-gold: #C8872A;
  --ph-sand: #D4C4AE;
  --ph-sand-line: #E0D4C0;
  background: var(--ph-bg);
}

/* Header -- same dark green but slightly deeper, more authoritative */
.is-contractor .ph-header {
  background: #162219;
  background-image: linear-gradient(155deg, #162219 0%, #1C2B22 70%);
}
.is-contractor .ph-header-title {
  font-size: 20px;
  letter-spacing: -0.01em;
}
.is-contractor .ph-header-subtitle {
  color: #D4A855;
}

/* Cards -- slightly more defined borders, less hover lift */
.is-contractor .ph-card {
  border-color: #D8CCBA;
  box-shadow: 0 1px 3px rgba(28,43,34,0.07);
}
.is-contractor .ph-card:hover {
  transform: none;
  box-shadow: 0 2px 8px rgba(28,43,34,0.1);
}

/* Buttons -- slightly darker clay */
.is-contractor .ph-btn-primary { background: #A8511F; }
.is-contractor .ph-btn-primary:hover:not(:disabled) { background: #8C4118; }

/* Contractor toolbar -- elevated panel feel */
.is-contractor .ph-contractor-toolbar {
  background: var(--ph-surface);
  border: 1px solid var(--ph-sand-line);
  border-radius: 10px;
  padding: 14px 18px;
  margin-bottom: 24px;
  box-shadow: 0 1px 4px rgba(28,43,34,0.08);
}

/* Fee table */
.is-contractor .ph-fee-tier { background: #F6F1EA; }

/* Trust banner doesn't belong on contractor side */
.is-contractor .ph-trust-banner { display: none; }

/* No-fee badge -- irrelevant on contractor side */
.is-contractor .ph-no-fee-badge { display: none; }

/* ─────────────────────────────────────────────────────────────────────────────
   Contractor Dashboard Shell (cd-*)
   Completely separate visual system from the homeowner side.
───────────────────────────────────────────────────────────────────────────── */

/* Override main layout for shell -- shell is full-bleed, no ph-main padding */
.is-contractor .ph-main { padding: 0; max-width: 100%; }
.is-contractor .ph-header { display: none; }

.cd-shell {
  display: grid;
  grid-template-columns: 220px 1fr;
  min-height: 100vh;
  background: #F7F5F2;
}

/* Sidebar */
.cd-sidebar {
  background: #1C2B22;
  display: flex;
  flex-direction: column;
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
}
.cd-sidebar-brand {
  padding: 20px 20px 16px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
.cd-brand-name {
  font-size: 16px;
  font-weight: 700;
  color: #FDFBF6;
  font-family: "Iowan Old Style", "Palatino Linotype", Georgia, serif;
  letter-spacing: 0.01em;
}
.cd-brand-sub {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #C1622A;
  margin-top: 3px;
}
.cd-sidebar-user {
  padding: 14px 20px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  display: flex;
  align-items: center;
  gap: 10px;
}
.cd-sidebar-avatar {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: #C1622A;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 12px;
  color: #fff;
  flex-shrink: 0;
  font-family: var(--ph-serif);
}
.cd-sidebar-user-info { min-width: 0; }
.cd-sidebar-user-name {
  font-size: 12.5px;
  font-weight: 600;
  color: #FDFBF6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cd-sidebar-user-status {
  font-size: 11px;
  margin-top: 2px;
}
.cd-sidebar-user-status.is-active { color: #6FCF7F; }
.cd-sidebar-user-status.is-warn { color: #F0C060; }

.cd-sidebar-nav {
  padding: 12px 10px;
  flex: 1;
}
.cd-nav-label {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.28);
  padding: 10px 10px 4px;
}
.cd-nav-item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  color: rgba(255,255,255,0.52);
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  background: transparent;
  text-align: left;
  transition: all 0.12s ease;
  margin-bottom: 1px;
}
.cd-nav-item i { font-size: 16px; width: 18px; text-align: center; }
.cd-nav-item:hover { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.82); }
.cd-nav-item.is-active { background: rgba(193,98,42,0.2); color: #E8945A; }
.cd-nav-badge {
  margin-left: auto;
  background: #C1622A;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 10px;
}
.cd-sidebar-footer {
  padding: 14px 20px;
  border-top: 1px solid rgba(255,255,255,0.08);
}
.cd-signout-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: rgba(255,255,255,0.32);
  cursor: pointer;
  background: none;
  border: none;
  font-family: inherit;
  transition: color 0.15s ease;
}
.cd-signout-btn:hover { color: rgba(255,255,255,0.58); }
.cd-signout-btn i { font-size: 15px; }

/* Main content */
.cd-main {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  height: 100vh;
}
.cd-content {
  padding: 28px 32px 64px;
  flex: 1;
}
.cd-page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}
.cd-page-title {
  font-size: 20px;
  font-weight: 700;
  color: #1C2B22;
}
.cd-page-actions { display: flex; gap: 8px; }
.cd-btn {
  padding: 7px 14px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  font-family: inherit;
}
.cd-btn-primary { background: #C1622A; color: #fff; }
.cd-btn-primary:hover { background: #A8511F; }
.cd-btn-secondary { background: #EDE7DE; color: #6B5840; border: 1px solid #D8CCBA; }
.cd-btn-secondary:hover { background: #E4DAD0; }

/* Stat cards */
.cd-founding-banner {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  background: linear-gradient(135deg, #23361f 0%, #1C2B22 100%);
  border: 1px solid #E8A33D; border-radius: 12px; padding: 14px 18px; margin-bottom: 18px;
}
.cd-founding-badge {
  background: #E8A33D; color: #1C2B22; font-weight: 700; font-size: 12.5px;
  padding: 4px 12px; border-radius: 999px; white-space: nowrap;
}
.cd-founding-text { color: #F0E4CE; font-size: 13.5px; }
.ph-fee-waived { background: #E3EEDF; border: 1px solid #c7e0c2; border-radius: 8px; padding: 14px 16px; color: #2C6B3F; }
.cd-stat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 28px;
}
.cd-stat-card {
  background: #fff;
  border: 1px solid #E8E2DA;
  border-radius: 10px;
  padding: 16px 18px;
}
.cd-stat-label {
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #8A7A65;
  margin-bottom: 6px;
}
.cd-stat-value {
  font-size: 26px;
  font-weight: 700;
  color: #1C2B22;
  line-height: 1;
  font-family: ui-monospace, "SF Mono", monospace;
}
.cd-stat-sub { font-size: 11px; color: #8A7A65; margin-top: 5px; }
.cd-stat-warn { color: #A8511F; }

/* Sections */
.cd-section { margin-bottom: 28px; }
.cd-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 700;
  color: #1C2B22;
  margin-bottom: 12px;
}
.cd-section-link {
  font-size: 11.5px;
  font-weight: 600;
  color: #C1622A;
  background: none;
  border: none;
  cursor: pointer;
  font-family: inherit;
}
.cd-section-link:hover { text-decoration: underline; }

/* List rows */
.cd-list { display: flex; flex-direction: column; gap: 8px; }
.cd-list-row {
  background: #fff;
  border: 1px solid #E8E2DA;
  border-radius: 8px;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.cd-list-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: #F2EDE6;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.cd-list-icon i { font-size: 18px; color: #C1622A; }
.cd-list-body { flex: 1; min-width: 0; }
.cd-list-title {
  font-size: 13px;
  font-weight: 600;
  color: #1C2B22;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cd-list-meta { font-size: 11px; color: #8A7A65; margin-top: 2px; }

/* Chips */
.cd-chip {
  font-size: 10.5px;
  font-weight: 700;
  padding: 3px 9px;
  border-radius: 99px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  white-space: nowrap;
  flex-shrink: 0;
}
.cd-chip-new { background: #FBE9DD; color: #A8511F; }
.cd-chip-sent { background: #E3EEDF; color: #2C6B3F; }
.cd-chip-paid { background: #E3EEDF; color: #2C6B3F; }
.cd-chip-pending { background: #FBF1DE; color: #7A5A1A; }

/* Two col */
.cd-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.cd-card {
  background: #fff;
  border: 1px solid #E8E2DA;
  border-radius: 10px;
  padding: 18px;
}
.cd-job-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid #F2EDE6;
  font-size: 13px;
}
.cd-job-row:last-child { border-bottom: none; }
.cd-job-name { font-weight: 600; color: #1C2B22; margin-bottom: 2px; }
.cd-job-amount {
  font-weight: 700;
  color: #C1622A;
  font-family: ui-monospace, "SF Mono", monospace;
  font-size: 13.5px;
}
.cd-earnings-total {
  font-size: 30px;
  font-weight: 700;
  color: #1C2B22;
  font-family: ui-monospace, "SF Mono", monospace;
  line-height: 1;
}
.cd-earnings-sub { font-size: 12px; color: #8A7A65; margin-top: 4px; margin-bottom: 16px; }
.cd-divider { border-top: 1px solid #F2EDE6; margin: 14px 0; }
.cd-fees-amount {
  font-size: 20px;
  font-weight: 700;
  color: #C1622A;
  font-family: ui-monospace, "SF Mono", monospace;
  margin: 4px 0;
}
.cd-muted { color: #8A7A65; font-size: 13.5px; }

/* Suspension banner and locked nav */
.cd-suspension-banner {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  background: #FEF3C7;
  border-bottom: 2px solid #F59E0B;
  padding: 16px 24px;
  font-size: 13.5px;
}
.cd-suspension-icon { font-size: 22px; flex-shrink: 0; line-height: 1.2; }
.cd-suspension-title { font-weight: 700; color: #92400E; font-size: 14px; margin-bottom: 4px; }
.cd-suspension-body { color: #78350F; line-height: 1.6; }
.cd-nav-item.is-locked { opacity: 0.4; cursor: not-allowed; }
.cd-nav-item.is-locked:hover { background: none; color: rgba(255,255,255,0.52); }

@media (max-width: 768px) {
  .cd-shell { grid-template-columns: 1fr; }
  .cd-sidebar { display: none; }
  .cd-stat-grid { grid-template-columns: 1fr 1fr; }
  .cd-two-col { grid-template-columns: 1fr; }
  .cd-content { padding: calc(env(safe-area-inset-top, 0px) + 72px) 16px calc(env(safe-area-inset-bottom, 0px) + 90px); } /* top clears the floating pill below the island; bottom clears the FAB */
  .cd-page-header { flex-wrap: wrap; gap: 10px; }
}

/* Mobile nav: top pill (primary) + floating FAB (overflow) */
.cd-top-nav { display: none; }
.cd-fab { display: none; }

@media (max-width: 768px) {
  .cd-top-nav {
    display: flex;
    position: fixed;
    top: calc(env(safe-area-inset-top, 0px) + 10px);
    left: 12px; right: 12px;
    background: rgba(23, 36, 29, 0.82);
    -webkit-backdrop-filter: blur(16px) saturate(1.2);
    backdrop-filter: blur(16px) saturate(1.2);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 999px;
    z-index: 100;
    padding: 6px 7px;
    gap: 3px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.05);
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  .cd-top-nav::-webkit-scrollbar { display: none; }
  .cd-top-nav-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1 1 0;
    min-width: 0;
    padding: 7px 4px 6px;
    border-radius: 999px;
    background: none;
    border: none;
    cursor: pointer;
    font-family: inherit;
    color: rgba(255, 255, 255, 0.5);
    transition: background 0.2s ease, color 0.2s ease, box-shadow 0.2s ease, transform 0.12s ease;
    position: relative;
    gap: 3px;
    -webkit-tap-highlight-color: transparent;
  }
  .cd-top-nav-item.is-active {
    background: linear-gradient(160deg, #D4703A 0%, #B4531F 100%);
    color: #FFF6EC;
    box-shadow: 0 3px 10px rgba(180, 83, 31, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.18);
  }
  .cd-top-nav-item:active { transform: scale(0.94); }
  .cd-top-nav-icon { position: relative; font-size: 19px; line-height: 1; display: flex; }
  .cd-top-nav-icon i { font-size: 19px; }
  .cd-top-nav-badge {
    position: absolute;
    top: -5px; right: -7px;
    background: #E8945A;
    color: #2A1608;
    font-size: 9px;
    font-weight: 800;
    padding: 1px 4px;
    border-radius: 10px;
    min-width: 15px;
    text-align: center;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }
  .cd-top-nav-label {
    font-size: 9.5px;
    font-weight: 600;
    letter-spacing: 0.01em;
    white-space: nowrap;
    color: inherit;
  }

  .cd-fab {
    display: flex;
    align-items: center;
    justify-content: center;
    position: fixed;
    bottom: calc(env(safe-area-inset-bottom, 0px) + 18px);
    right: 18px;
    width: 56px; height: 56px;
    border-radius: 50%;
    background: linear-gradient(160deg, #D4703A 0%, #B4531F 100%);
    color: #FFF6EC;
    border: none;
    cursor: pointer;
    z-index: 100;
    box-shadow: 0 6px 20px rgba(180, 83, 31, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.2);
    transition: transform 0.14s ease, box-shadow 0.2s ease;
    -webkit-tap-highlight-color: transparent;
  }
  .cd-fab i { font-size: 26px; }
  .cd-fab:active { transform: scale(0.92); }
  .cd-fab.is-active {
    box-shadow: 0 6px 20px rgba(180, 83, 31, 0.6), 0 0 0 3px rgba(232, 148, 90, 0.4);
  }
}

.cd-more-backdrop {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(0, 0, 0, 0.42);
  display: flex; align-items: flex-end;
  animation: cd-fade-in 0.18s ease;
}
.cd-more-sheet {
  width: 100%;
  background: #FDFBF6;
  border-radius: 20px 20px 0 0;
  padding: 6px 14px calc(env(safe-area-inset-bottom, 0px) + 14px);
  box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.25);
  animation: cd-slide-up 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}
.cd-more-handle { width: 38px; height: 4px; border-radius: 999px; background: #DCD2C2; margin: 10px auto 8px; }
.cd-more-item {
  display: flex; align-items: center; gap: 14px; width: 100%;
  padding: 15px 12px; border: none; background: none; cursor: pointer;
  font-family: inherit; font-size: 15px; font-weight: 500; color: #1C2B22;
  border-radius: 12px; text-align: left;
}
.cd-more-item i { font-size: 21px; color: #8A7A65; width: 24px; text-align: center; }
.cd-more-item.is-active { background: rgba(193, 98, 42, 0.1); color: #B4531F; }
.cd-more-item.is-active i { color: #B4531F; }
.cd-more-item.is-locked { opacity: 0.4; }
.cd-more-signout { color: #A32D2D; }
.cd-more-signout i { color: #A32D2D; }
@keyframes cd-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes cd-slide-up { from { transform: translateY(100%); } to { transform: translateY(0); } }

.cd-more-tutorial { color: #B4531F; }
.cd-more-tutorial i { color: #B4531F; }

.ct-tutorial { text-align: center; }
.ct-tut-progress { display: flex; gap: 6px; justify-content: center; margin-bottom: 26px; }
.ct-tut-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--ph-sand-line); transition: all 0.25s ease; }
.ct-tut-dot.is-active { background: var(--ph-clay); width: 22px; border-radius: 999px; }
.ct-tut-dot.is-done { background: var(--ph-clay); opacity: 0.45; }
.ct-tut-icon {
  width: 70px; height: 70px; border-radius: 20px; margin: 0 auto 20px;
  background: linear-gradient(160deg, #E8A33D 0%, #C1622A 100%);
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 8px 22px rgba(193, 98, 42, 0.32);
}
.ct-tut-icon i { font-size: 34px; color: #fff; }
.ct-tut-nav { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.ct-tut-nav > button { min-width: 118px; }
.ct-tut-nav > span { flex: 0 0 118px; }
.ct-tut-skip {
  display: block; margin: 16px auto 0; background: none; border: none;
  color: var(--ph-taupe-soft); font-size: 13px; cursor: pointer; font-family: inherit;
}
.ct-tut-skip:hover { color: var(--ph-ink); }

/* Portfolio grid */
.cd-portfolio-empty {
  text-align: center;
  padding: 60px 24px;
  background: #fff;
  border: 1px dashed #D8CCBA;
  border-radius: 10px;
}
.cd-portfolio-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
  margin-top: 8px;
}
.cd-portfolio-item {
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  aspect-ratio: 4/3;
  background: #E8E2DA;
  cursor: pointer;
}
.cd-portfolio-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.2s ease;
}
.cd-portfolio-item:hover .cd-portfolio-img { transform: scale(1.03); }
.cd-portfolio-overlay {
  position: absolute;
  inset: 0;
  background: rgba(28,43,34,0);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 10px;
  transition: background 0.2s ease;
}
.cd-portfolio-item:hover .cd-portfolio-overlay { background: rgba(28,43,34,0.55); }
.cd-portfolio-caption {
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  text-shadow: 0 1px 3px rgba(0,0,0,0.5);
  margin-bottom: 6px;
  opacity: 0;
  transition: opacity 0.2s ease;
}
.cd-portfolio-item:hover .cd-portfolio-caption { opacity: 1; }
.cd-portfolio-actions {
  display: flex;
  gap: 6px;
  opacity: 0;
  transition: opacity 0.2s ease;
}
.cd-portfolio-item:hover .cd-portfolio-actions { opacity: 1; }
.cd-portfolio-btn {
  background: rgba(255,255,255,0.9);
  border: none;
  border-radius: 5px;
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  color: #1C2B22;
  display: flex;
  align-items: center;
  gap: 4px;
  font-family: inherit;
  transition: background 0.15s ease;
}
.cd-portfolio-btn:hover { background: #fff; }
.cd-portfolio-btn-danger { color: #991B1B; }
.cd-portfolio-btn i { font-size: 13px; }
.cd-caption-edit {
  background: rgba(28,43,34,0.85);
  border-radius: 6px;
  padding: 8px;
}
.cd-caption-input {
  width: 100%;
  background: rgba(255,255,255,0.15);
  border: 1px solid rgba(255,255,255,0.3);
  border-radius: 4px;
  padding: 5px 8px;
  font-size: 16px;
  color: #fff;
  font-family: inherit;
  outline: none;
}
.cd-caption-input::placeholder { color: rgba(255,255,255,0.5); }
.cd-btn-disabled { opacity: 0.6; }

/* Lightbox */
.cd-lightbox {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.9);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  cursor: zoom-out;
  animation: ph-fadein 150ms ease both;
}
.cd-lightbox-img {
  max-width: 100%;
  max-height: 90vh;
  object-fit: contain;
  border-radius: 4px;
  cursor: default;
  box-shadow: 0 8px 40px rgba(0,0,0,0.6);
}
`;


// ---------------------------------------------------------------------------
// ContractorPublicProfile -- public-facing page at /c/:contractorId
// No auth required. Shows full profile, portfolio, reviews, and a
// "Request a quote" button that links back to the main directory.
// ---------------------------------------------------------------------------
export function ContractorPublicProfile() {
  const [contractor, setContractor] = React.useState(null);
  const [photos, setPhotos] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [lightbox, setLightbox] = React.useState(null);

  React.useEffect(() => {
    const pathPart = window.location.pathname.split("/c/")[1];
    if (!pathPart) { setError("No contractor found."); setLoading(false); return; }
    let cancelled = false;

    // Try slug first, fall back to numeric id
    const isNumeric = /^\d+$/.test(pathPart);
    const lookupParam = isNumeric ? { contractorId: pathPart } : { slug: pathPart };

    Promise.allSettled([
      apiCall("contractors", { action: "getWithReviews", ...lookupParam }),
      apiCall("contractors", { action: "listPortfolioPhotos", ...lookupParam }),
    ]).then(([contractorResult, photosResult]) => {
      if (cancelled) return;
      if (contractorResult.status === "fulfilled") {
        setContractor(normalizeContractor(contractorResult.value.contractor));
      } else {
        setError("Contractor not found.");
      }
      if (photosResult.status === "fulfilled") setPhotos(photosResult.value.photos || []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const avgRating = contractor && contractor.reviews.length > 0
    ? contractor.reviews.reduce((s, r) => s + r.rating, 0) / contractor.reviews.length
    : null;

  return (
    <div className="ph-app">
      <style>{CUSTOMER_STYLES}</style>
      <style>{`
        .pp-wrap { max-width: 720px; margin: 0 auto; padding: 40px 24px 80px; }
        .pp-header { display: flex; gap: 20px; align-items: flex-start; margin-bottom: 28px; }
        .pp-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; background: var(--ph-bg); border-radius: var(--ph-radius-sm); padding: 16px; margin-bottom: 24px; }
        .pp-meta-item { display: flex; flex-direction: column; gap: 3px; }
        .pp-meta-label { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ph-taupe-soft); }
        .pp-meta-value { font-size: 13.5px; color: var(--ph-ink); font-weight: 500; }
        .pp-bio { font-size: 14.5px; color: var(--ph-ink-soft); line-height: 1.7; margin-bottom: 24px; }
        .pp-section-title { font-size: 15px; font-weight: 700; color: var(--ph-ink); margin: 28px 0 14px; font-family: var(--ph-serif); }
        .pp-photo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
        .pp-photo { width: 100%; aspect-ratio: 4/3; object-fit: cover; border-radius: 8px; cursor: zoom-in; transition: transform 0.15s ease; }
        .pp-photo:hover { transform: scale(1.02); }
        .pp-review { padding: 14px 0; border-bottom: 1px solid var(--ph-sand-line); }
        .pp-review:last-child { border-bottom: none; }
        .pp-review-text { font-size: 13.5px; color: var(--ph-ink-soft); margin: 6px 0 4px; line-height: 1.6; }
        .pp-review-date { font-size: 11.5px; color: var(--ph-taupe-soft); }
        .pp-cta { text-align: center; margin-top: 40px; padding-top: 24px; border-top: 1px solid var(--ph-sand-line); }
        .pp-back { font-size: 14px; color: var(--ph-taupe); text-decoration: none; display: inline-flex; align-items: center; gap: 6px; padding: 8px 4px; margin: 0 -4px 12px; }
        .pp-back:hover { color: var(--ph-ink); }
        @media (max-width: 640px) { .pp-meta { grid-template-columns: 1fr; } .pp-photo-grid { grid-template-columns: repeat(2, 1fr); } }
      `}</style>

      <header className="ph-header">
        <div className="ph-header-brand">
          <div className="ph-header-titles">
            <p className="ph-header-title">Harry's List</p>
            <span className="ph-header-subtitle">DFW Trade Directory</span>
          </div>
        </div>
        <a href="/#directory" className="ph-contractor-link">Browse directory →</a>
      </header>

      <main className="pp-wrap">
        {loading && <p className="ph-muted">Loading…</p>}
        {error && <p className="ph-muted">{error}</p>}

        {contractor && (
          <>
            <a href="/#directory" className="pp-back">← Back to directory</a>

            {/* Hero header */}
            <div className="pp-header">
              {contractor.logoUrl ? (
                <img className="ph-avatar lg ph-avatar-img" src={contractor.logoUrl} alt={`${contractor.businessName} logo`} style={{ width: 72, height: 72, borderRadius: 14 }} />
              ) : (
                <div className="ph-avatar lg" style={{ width: 72, height: 72, fontSize: 22, borderRadius: 14 }}>{initials(contractor.businessName)}</div>
              )}
              <div>
                <h1 style={{ margin: "0 0 4px", fontFamily: "var(--ph-serif)", fontSize: 26, fontWeight: 700, color: "var(--ph-ink)" }}>{contractor.businessName}</h1>
                <div className="ph-card-trade">{contractor.trade}</div>
                {avgRating && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                    <Stars value={Math.round(avgRating)} />
                    <span className="ph-rating-text">{avgRating.toFixed(1)} ({contractor.reviews.length} review{contractor.reviews.length === 1 ? "" : "s"})</span>
                  </div>
                )}
              </div>
            </div>

            {/* Bio */}
            <p className="pp-bio">{contractor.bio}</p>

            {/* Stats grid */}
            <div className="pp-meta">
              <div className="pp-meta-item">
                <span className="pp-meta-label">Years in business</span>
                <span className="pp-meta-value">{contractor.yearsInBusiness || "—"}</span>
              </div>
              <div className="pp-meta-item">
                <span className="pp-meta-label">License / insurance</span>
                <span className="pp-meta-value">{contractor.licenseInfo || "Not provided"}</span>
              </div>
              <div className="pp-meta-item">
                <span className="pp-meta-label">Service area</span>
                <span className="pp-meta-value">{describeServiceArea(contractor.serviceArea)}</span>
              </div>
              <div className="pp-meta-item">
                <span className="pp-meta-label">Thumbs up</span>
                <span className="pp-meta-value">▲ {contractor.thumbsUp} from homeowners</span>
              </div>
            </div>

            {/* Portfolio */}
            {photos.length > 0 && (
              <>
                <div className="pp-section-title">Past work</div>
                <div className="pp-photo-grid">
                  {photos.map((photo) => (
                    <img
                      key={photo.id}
                      src={photo.thumbnailUrl}
                      alt={photo.caption || "Portfolio photo"}
                      className="pp-photo"
                      loading="lazy"
                      title={photo.caption || ""}
                      role="button"
                      tabIndex={0}
                      aria-label={`View portfolio photo${photo.caption ? `: ${photo.caption}` : ""} full size`}
                      onClick={() => setLightbox(photo.publicUrl)}
                      onKeyDown={activateOnKey(() => setLightbox(photo.publicUrl))}
                    />
                  ))}
                </div>
              </>
            )}

            {/* Reviews */}
            {contractor.reviews.length > 0 && (
              <>
                <div className="pp-section-title">Reviews</div>
                <p style={{ fontSize: 12, color: "var(--ph-taupe-soft)", marginBottom: 12 }}>
                  ✓ All reviews are from verified completed jobs — only homeowners who hired and paid this contractor can leave a review.
                </p>
                {contractor.reviews.map((r) => (
                  <div className="pp-review" key={r.id}>
                    <Stars value={r.rating} />
                    {r.text && <p className="pp-review-text">"{r.text}"</p>}
                    <div className="pp-review-date">Verified homeowner · {new Date(r.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</div>
                  </div>
                ))}
              </>
            )}

            {/* CTA */}
            <div className="pp-cta">
              <a href={`/?request=${contractor.id}`} className="ph-btn-primary" style={{ display: "inline-block", textDecoration: "none", fontSize: 15, padding: "14px 28px" }}>
                Request a quote from {contractor.businessName}
              </a>
              <p className="ph-muted small" style={{ marginTop: 10 }}>Free · No obligation · No spam</p>
            </div>
          </>
        )}

        {lightbox && (
          <div className="cd-lightbox" onClick={() => setLightbox(null)}>
            <button className="ph-modal-close" onClick={() => setLightbox(null)} aria-label="Close">×</button>
            <img src={lightbox} alt="Full size" className="cd-lightbox-img" onClick={(e) => e.stopPropagation()} />
          </div>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ContractorShareScreen -- shown in the contractor dashboard under "Share"
// nav item. Shows their public profile URL and a QR code they can screenshot.
// ---------------------------------------------------------------------------
export function ContractorShareScreen({ contractor }) {
  const slug = contractor.slug || contractor.id;
  const profileUrl = `${window.location.origin}/c/${slug}`;
  const [copied, setCopied] = React.useState(false);

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(profileUrl)}&color=1C2B22&bgcolor=FDFBF6&margin=10`;

  const handleCopy = () => {
    navigator.clipboard.writeText(profileUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="cd-content">
      <div className="cd-page-header">
        <div className="cd-page-title">Share your profile</div>
      </div>

      <div className="cd-card" style={{ maxWidth: 480 }}>
        <div className="cd-stat-label" style={{ marginBottom: 8 }}>Your public profile link</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 24 }}>
          <input
            readOnly
            value={profileUrl}
            style={{ flex: 1, fontFamily: "ui-monospace, monospace", fontSize: 12, padding: "9px 12px", border: "1.5px solid #E8E2DA", borderRadius: 6, background: "#F7F5F2", color: "#1C2B22" }}
          />
          <button className="cd-btn cd-btn-primary" onClick={handleCopy} style={{ whiteSpace: "nowrap" }}>
            {copied ? "Copied!" : "Copy link"}
          </button>
        </div>

        <div style={{ textAlign: "center" }}>
          <div className="cd-stat-label" style={{ marginBottom: 12 }}>QR code — screenshot to share</div>
          <div style={{ background: "#FDFBF6", border: "1px solid #E8E2DA", borderRadius: 12, padding: 20, display: "inline-block" }}>
            <img
              src={qrUrl}
              alt="QR code for your Harry's List profile"
              width={200}
              height={200}
              style={{ display: "block", borderRadius: 4 }}
            />
          </div>
          <p className="cd-muted" style={{ marginTop: 12, fontSize: 12 }}>
            Screenshot this QR code and share it anywhere — texts, business cards, Instagram bio.
          </p>
          <a href={profileUrl} target="_blank" rel="noreferrer" className="cd-btn cd-btn-secondary" style={{ display: "inline-block", marginTop: 12, textDecoration: "none" }}>
            Preview your profile →
          </a>
        </div>
      </div>
    </div>
  );
}

// ContractorInvoicePreviewScreen -- lets a contractor see exactly what the
// invoice and quote documents look like to their customers, without waiting
// for a real job. Opens the real /quote-preview page (the same one customers
// see) pre-filled with the contractor's actual name/trade and sample items,
// so the preview can never drift from the real thing.
export function ContractorInvoicePreviewScreen({ contractor }) {
  const sampleItems = [
    { description: "Labor — sample line item", qty: 1, unitPrice: 850 },
    { description: "Materials — sample line item", qty: 1, unitPrice: 400 },
  ];
  const sampleTotal = sampleItems.reduce((s, it) => s + it.qty * it.unitPrice, 0);

  const buildUrl = (type) => {
    const params = new URLSearchParams({
      contractor: contractor.businessName || "Your business",
      trade: contractor.trade || "",
      customer: type === "invoice" ? "Jordan Alvarez (sample customer)" : "",
      address: type === "invoice" ? "1234 Elm St, Dallas, TX 75201" : "",
      description: "Sample job — this is what your customers will see.",
      items: JSON.stringify(sampleItems),
      total: String(sampleTotal),
      message:
        type === "invoice"
          ? "Thanks for your business! Payment details as discussed."
          : "Happy to answer any questions — just let me know.",
      type,
    });
    return `/quote-preview?${params.toString()}`;
  };

  return (
    <div className="cd-content">
      <div className="cd-page-header">
        <div className="cd-page-title">Invoice &amp; quote preview</div>
      </div>

      <div className="cd-card" style={{ maxWidth: 520 }}>
        <p className="cd-muted" style={{ marginTop: 0, marginBottom: 20, fontSize: 13.5, lineHeight: 1.6 }}>
          This is exactly what your customers see when you send a quote or invoice —
          led by your business name, with Harry's List only as a small footer credit.
          These samples use placeholder line items; your real ones are built from each job.
        </p>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a
            href={buildUrl("invoice")}
            target="_blank"
            rel="noreferrer"
            className="cd-btn cd-btn-primary"
            style={{ textDecoration: "none" }}
          >
            Preview invoice →
          </a>
          <a
            href={buildUrl("quote")}
            target="_blank"
            rel="noreferrer"
            className="cd-btn cd-btn-secondary"
            style={{ textDecoration: "none" }}
          >
            Preview quote →
          </a>
        </div>
      </div>
    </div>
  );
}



export {
  FadeIn,
  initials,
  ContractorAuth,
  ContractorAuthGate,
  ContractorOnboarding,
  ContractorInbox,
  ContractorPortfolio,
  ContractorDashboard,
  ContractorShell,
  PaymentsPanel,
  CUSTOMER_STYLES,
};
export function ContractorApp() {
  const [currentContractor, setCurrentContractor] = React.useState(null);
  const [checkingSession, setCheckingSession] = React.useState(true);
  const [quoteRequests, setQuoteRequests] = React.useState([]);
  const [contractorScreen, setContractorScreen] = React.useState("dashboard");
  const [loadError, setLoadError] = React.useState(null);

  React.useEffect(() => {
    let cancelled = false;
    supabaseAuth.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      if (!data?.session) { setCheckingSession(false); return; }
      try {
        const result = await apiCall("contractors", { action: "getMine" });
        if (cancelled) return;
        if (result.contractor) {
          setCurrentContractor(normalizeContractor(result.contractor));
          await loadContractorData(result.contractor.id);
        }
      } catch {
        // No contractor profile for this session.
      } finally {
        if (!cancelled) setCheckingSession(false);
      }
    });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadContractorData = async (contractorId) => {
    const [jobsData, quotesData] = await Promise.all([
      apiCall("jobs", { action: "listForContractor" }),
      apiCall("quotes", { action: "listForContractor" }),
    ]);
    setCurrentContractor((prev) => (prev ? { ...prev, completedJobs: jobsData.jobs } : prev));
    setQuoteRequests((prev) => {
      const others = prev.filter((qr) => !qr.recipients.some((r) => idsMatch(r.contractorId, contractorId)));
      return [...others, ...quotesData.quoteRequests];
    });
  };

  const handleContractorSignedUp = async () => setCheckingSession(false);

  const handleContractorSignedIn = async () => {
    try {
      const data = await apiCall("contractors", { action: "getMine" });
      if (data.contractor) {
        setCurrentContractor(normalizeContractor(data.contractor));
        await loadContractorData(data.contractor.id);
      }
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setCheckingSession(false);
    }
  };

  const handleContractorLogout = async () => {
    await supabaseAuth.auth.signOut();
    setCurrentContractor(null);
    setQuoteRequests([]);
    setContractorScreen("dashboard");
  };

  const handleCreateContractor = async (newContractor, logoFile) => {
    try {
      const s = { ...newContractor, serviceArea: { ...newContractor.serviceArea, zipCodes: [...newContractor.serviceArea.zipCodes] } };
      const data = await apiCall("contractors", { action: "create", contractor: s });
      let final = data.contractor;
      if (logoFile) {
        try { const u = await apiCall("contractors", { action: "uploadLogo", fileBase64: logoFile.base64, fileName: logoFile.fileName, contentType: logoFile.contentType }); final = u.contractor; }
        catch (err) { setLoadError("Profile created, but logo upload failed: " + err.message); }
      }
      setCurrentContractor(normalizeContractor(final));
      setContractorScreen("dashboard");
      // Meta Pixel: record a completed contractor signup as a conversion.
      // Guarded so it's a no-op if the Pixel isn't loaded (e.g. no ID set).
      if (typeof window !== "undefined" && typeof window.fbq === "function") {
        window.fbq("track", "CompleteRegistration", { content_name: "contractor_signup" });
      }
    } catch (err) { setLoadError(err.message); }
  };

  const handleEditContractor = async (_id, updates, logoFile) => {
    try {
      const s = { ...updates, serviceArea: { ...updates.serviceArea, zipCodes: [...updates.serviceArea.zipCodes] } };
      const data = await apiCall("contractors", { action: "update", updates: s });
      let final = data.contractor;
      if (logoFile) {
        try { const u = await apiCall("contractors", { action: "uploadLogo", fileBase64: logoFile.base64, fileName: logoFile.fileName, contentType: logoFile.contentType }); final = u.contractor; }
        catch (err) { setLoadError("Profile updated, but logo upload failed: " + err.message); }
      }
      setCurrentContractor((prev) => ({ ...normalizeContractor(final), completedJobs: prev?.completedJobs || [] }));
      setContractorScreen("dashboard");
    } catch (err) { setLoadError(err.message); }
  };

  const handleRespond = async (qrId, contractorId, status, quoteDetails) => {
    try {
      // contractorId still needed for local state update; backend derives it from session.
      await apiCall("quotes", { action: "respond", quoteRequestId: qrId, status, price: quoteDetails?.price, message: quoteDetails?.message, lineItems: quoteDetails?.lineItems || null });
      setQuoteRequests((prev) => prev.map((qr) => qr.id !== qrId ? qr : { ...qr, recipients: qr.recipients.map((r) => idsMatch(r.contractorId, contractorId) ? { ...r, status, ...(quoteDetails ? { quote: quoteDetails } : {}) } : r) }));
    } catch (err) { setLoadError(err.message); }
  };

  const handleReportJob = async (qr, amount, lowReportReason, invoiceLineItems, invoiceNote) => {
    const contractorId = currentContractor?.id;
    if (!contractorId) return;
    try {
      const data = await apiCall("jobs", { action: "report", quoteRequestId: qr.id, description: qr.description, reportedAmount: amount, lowReportReason: lowReportReason || undefined, invoiceLineItems: invoiceLineItems || undefined, invoiceNote: invoiceNote || undefined });
      setCurrentContractor((prev) => !prev ? prev : { ...prev, completedJobs: [...(prev.completedJobs || []), data.job] });
      await apiCall("quotes", { action: "markJobReported", quoteRequestId: qr.id });
      setQuoteRequests((prev) => prev.map((q) => q.id !== qr.id ? q : { ...q, recipients: q.recipients.map((r) => idsMatch(r.contractorId, contractorId) ? { ...r, jobReported: true } : r) }));
    } catch (err) { setLoadError(err.message); }
  };

  const handleEditReportedAmount = async (jobId, newAmount, lowReportReason) => {
    try {
      const data = await apiCall("jobs", { action: "editReportedAmount", jobId, newAmount, lowReportReason });
      setCurrentContractor((prev) => !prev ? prev : { ...prev, completedJobs: (prev.completedJobs || []).map((j) => idsMatch(j.id, jobId) ? data.job : j) });
    } catch (err) { setLoadError(err.message); }
  };

  const handleRefreshJobStatus = async (jobId) => {
    if (!currentContractor) return false;
    try {
      const data = await apiCall("jobs", { action: "listForContractor" });
      setCurrentContractor((prev) => !prev ? prev : { ...prev, completedJobs: data.jobs });
      const job = data.jobs.find((j) => idsMatch(j.id, jobId));
      return !!(job && job.feePaid);
    } catch { return false; }
  };

  return (
    <div className="ph-app is-contractor">
      <style>{CUSTOMER_STYLES}</style>
      {loadError && (
        <div style={{ position: "fixed", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 9999, background: "#FEE2E2", color: "#991B1B", padding: "10px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
          {loadError}<button onClick={() => setLoadError(null)} style={{ marginLeft: 12, background: "none", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 16, color: "#991B1B" }}>×</button>
        </div>
      )}
      {checkingSession && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#F7F5F2" }}>
          <p style={{ color: "#8A7A65", fontSize: 14 }}>Loading…</p>
        </div>
      )}
      {!checkingSession && !currentContractor && (
        <div style={{ minHeight: "100vh", background: "#1C2B22", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ marginBottom: 32, textAlign: "center" }}>
            <div style={{ fontFamily: "'Iowan Old Style', Georgia, serif", fontSize: 28, fontWeight: 700, color: "#FDFBF6", marginBottom: 6 }}>Harry's List</div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#C1622A" }}>Contractor Portal</div>
          </div>
          <ContractorAuthGate onSignedUp={handleContractorSignedUp} onSignedIn={handleContractorSignedIn} onCreate={handleCreateContractor} />
          <a
            href="/"
            style={{
              marginTop: 24,
              fontSize: 13,
              fontWeight: 600,
              color: "#FDFBF6",
              textDecoration: "none",
              border: "1px solid rgba(255,255,255,0.35)",
              borderRadius: 8,
              padding: "9px 18px",
            }}
          >
            ← Not a contractor? Back to the homeowner directory
          </a>
        </div>
      )}
      {!checkingSession && currentContractor && (
        <FadeIn keyValue={`contractor-${contractorScreen}`}>
          {(() => {
            const suspended = contractorIsSuspended(currentContractor);
            const activeScreen = suspended ? "payments" : contractorScreen;
            return (
              <ContractorShell contractor={currentContractor} quoteRequests={quoteRequests} screen={activeScreen} onNavigate={setContractorScreen} onLogout={handleContractorLogout}>
                {activeScreen === "dashboard" && <ContractorDashboard contractor={currentContractor} quoteRequests={quoteRequests} onNavigate={setContractorScreen} />}
                {activeScreen === "inbox" && (
                  <div className="cd-content">
                    <div className="cd-page-header"><div className="cd-page-title">Quote requests</div></div>
                    <ContractorInbox contractor={currentContractor} quoteRequests={quoteRequests} onRespond={handleRespond} onReportJob={handleReportJob} onEditProfile={() => setContractorScreen("onboard")} />
                  </div>
                )}
                {activeScreen === "payments" && (
                  <div className="cd-content">
                    <div className="cd-page-header"><div className="cd-page-title">Payments</div></div>
                    <PaymentsPanel contractor={currentContractor} onRefreshJobs={handleRefreshJobStatus} onEditAmount={handleEditReportedAmount} />
                  </div>
                )}
                {activeScreen === "onboard" && (
                  <div className="cd-content">
                    <div className="cd-page-header"><div className="cd-page-title">My profile</div></div>
                    <ContractorOnboarding onCreate={handleCreateContractor} onEdit={handleEditContractor} editingContractor={currentContractor} />
                  </div>
                )}
                {activeScreen === "portfolio" && <ContractorPortfolio contractor={currentContractor} />}
                {activeScreen === "invoice" && <ContractorInvoicePreviewScreen contractor={currentContractor} />}
                {activeScreen === "share" && <ContractorShareScreen contractor={currentContractor} />}
              </ContractorShell>
            );
          })()}
        </FadeIn>
      )}
    </div>
  );
}
