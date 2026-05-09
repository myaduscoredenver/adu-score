import { useState } from "react";
import Papa from "papaparse";

const CENSUS_GEO = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";

function toRad(d) { return d * Math.PI / 180; }
function distance(lat1, lng1, lat2, lng2) {
  const R = 3959;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

const BOUNDS = {
  denver: { minLat: 39.614, maxLat: 39.914, minLng: -105.109, maxLng: -104.600 },
  jeffco: { minLat: 39.400, maxLat: 39.970, minLng: -105.600, maxLng: -104.900 }
};

function getRegion(lat, lng) {
  if (lat >= BOUNDS.denver.minLat && lat <= BOUNDS.denver.maxLat && lng >= BOUNDS.denver.minLng && lng <= BOUNDS.denver.maxLng) return "denver";
  if (lat >= BOUNDS.jeffco.minLat && lat <= BOUNDS.jeffco.maxLat && lng >= BOUNDS.jeffco.minLng && lng <= BOUNDS.jeffco.maxLng) return "jeffco";
  return null;
}

const CSV = { denver: "/parcels_final.csv", jeffco: "/jeffco_final.csv" };

const SAMPLE = {
  address: "2847 S Humboldt St", city: "Denver", lot_sf: 9200, bldg_sf: 1650,
  year_built: 1941, zone: "E-SU-DX", lot_score: 82, ratio_score: 75,
  age_score: 88, adu_score: 82, bucket: "Likely"
};

function calcScore(lot_sf, bldg_sf, year_built) {
  const lotScore = lot_sf < 5000 ? 0 : lot_sf < 6000 ? 20 : lot_sf < 7500 ? 50 : lot_sf < 10000 ? 75 : 100;
  const ratio = lot_sf > 0 ? bldg_sf / lot_sf : 0;
  const ratioScore = ratio > 0.40 ? 0 : ratio > 0.25 ? 30 : ratio > 0.15 ? 60 : 100;
  const ageScore = !year_built || year_built == 0 ? 50 : year_built >= 2000 ? 10 : year_built >= 1980 ? 30 : year_built >= 1960 ? 65 : 100;
  const raw = Math.round(lotScore * 0.45 + ratioScore * 0.35 + ageScore * 0.20);
  const score = Math.min(90, raw);
  const bucket = score >= 65 ? "Likely" : score >= 35 ? "Maybe" : "Unlikely";
  return { adu_score: score, bucket };
}

const HouseIcon = () => (
  <svg width="36" height="36" viewBox="0 0 32 32" fill="none" stroke="#2d6a4f" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 14L16 4l12 10v14H20v-8h-8v8H4V14z"/>
  </svg>
);
const ChartIcon = () => (
  <svg width="36" height="36" viewBox="0 0 32 32" fill="none" stroke="#2d6a4f" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="28" x2="28" y2="28"/>
    <rect x="5" y="18" width="5" height="10" rx="1"/>
    <rect x="13" y="11" width="5" height="17" rx="1"/>
    <rect x="21" y="5" width="5" height="23" rx="1"/>
  </svg>
);
const ClipboardIcon = () => (
  <svg width="36" height="36" viewBox="0 0 32 32" fill="none" stroke="#2d6a4f" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="8" y="5" width="16" height="22" rx="2"/>
    <path d="M12 5a2 2 0 012-2h4a2 2 0 012 2"/>
    <path d="M11 13l2 2 4-4"/>
    <path d="M11 20l2 2 4-4"/>
  </svg>
);

const editBtn = (onClick) => (
  <button onClick={onClick} style={{ fontSize: "10px", color: "#2d6a4f", background: "none", border: "0.5px solid #2d6a4f", borderRadius: "4px", padding: "2px 7px", cursor: "pointer", marginLeft: "8px", fontFamily: "Georgia, serif", flexShrink: 0 }}>Edit</button>
);

function ScoreBar({ label, value, score, note, color, onEdit, edited }) {
  const pct = Math.min(100, Math.max(0, score));
  return (
    <div style={{ marginBottom: "14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "5px" }}>
        <span style={{ fontSize: "13px", fontWeight: "500", color: "#1a1a1a" }}>{label}</span>
        <div style={{ display: "flex", alignItems: "center" }}>
          <span style={{ fontSize: "13px", color: "#555" }}>{value}{edited && <span style={{ fontSize: "10px", color: "#b45309", marginLeft: "4px" }}>edited</span>}</span>
          {onEdit && editBtn(onEdit)}
        </div>
      </div>
      <div style={{ height: "5px", background: "#e8ede9", borderRadius: "3px", marginBottom: "4px" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color || "#2d6a4f", borderRadius: "3px", transition: "width 0.6s ease" }}></div>
      </div>
      <p style={{ fontSize: "11px", color: "#888", margin: 0 }}>{note}</p>
    </div>
  );
}

function EditField({ label, value, onChange, onDone, unit }) {
  return (
    <div style={{ marginBottom: "14px", background: "#f0f7f4", borderRadius: "8px", padding: "10px 12px", border: "0.5px solid #c4d4c8" }}>
      <p style={{ fontSize: "11px", color: "#2d6a4f", margin: "0 0 6px", fontWeight: "500" }}>Edit {label}</p>
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <input type="number" value={value} onChange={e => onChange(e.target.value)}
          style={{ flex: 1, padding: "8px 10px", fontSize: "13px", border: "1px solid #c4d4c8", borderRadius: "6px", fontFamily: "Georgia, serif", outline: "none" }} />
        {unit && <span style={{ fontSize: "12px", color: "#888" }}>{unit}</span>}
        <button onClick={onDone} style={{ padding: "8px 12px", background: "#2d6a4f", color: "white", border: "none", borderRadius: "6px", fontSize: "12px", cursor: "pointer", fontFamily: "Georgia, serif" }}>Done</button>
      </div>
    </div>
  );
}

function ResultCard({ result, isSample }) {
  const [editing, setEditing] = useState(null);
  const [lotSf, setLotSf] = useState(parseFloat(result.lot_sf) || 0);
  const [bldgSf, setBldgSf] = useState(parseFloat(result.bldg_sf) || 0);
  const [yearBuilt, setYearBuilt] = useState(parseFloat(result.year_built) || 0);
  const [editedFields, setEditedFields] = useState({});
  const [isEdited, setIsEdited] = useState(false);
  const [alley, setAlley] = useState(null);

  const baseScores = calcScore(lotSf, bldgSf, yearBuilt);
  const alleyBonus = alley === true ? 10 : 0;
  const adu_score = Math.min(100, baseScores.adu_score + alleyBonus);
  const bucket = adu_score >= 65 ? "Likely" : adu_score >= 35 ? "Maybe" : "Unlikely";
  const bucketColor = bucket === "Likely" ? "#1b4332" : bucket === "Maybe" ? "#7c4a00" : "#7c1a1a";
  const barColor = bucket === "Likely" ? "#2d6a4f" : bucket === "Maybe" ? "#b45309" : "#b91c1c";
  const lotPct = Math.min(100, (Math.min(lotSf, 20000) / 12000) * 100);
  const ratioPct = lotSf > 0 ? Math.max(0, 100 - (bldgSf / lotSf) * 200) : 50;
  const agePct = yearBuilt > 0 ? Math.min(100, ((2026 - yearBuilt) / 100) * 100) : 50;

  function doneEditing(field, setter, val) {
    setter(parseFloat(val) || 0);
    setEditedFields(p => ({ ...p, [field]: true }));
    setIsEdited(true);
    setEditing(null);
  }

  const alleyBtnStyle = (active) => ({
    padding: "8px 20px", fontSize: "13px", borderRadius: "6px", cursor: "pointer",
    fontFamily: "Georgia, serif", border: "0.5px solid #2d6a4f",
    background: active ? "#2d6a4f" : "white", color: active ? "white" : "#2d6a4f",
    fontWeight: active ? "500" : "400"
  });

  return (
    <div style={{ border: "0.5px solid #d4ddd6", borderRadius: "12px", overflow: "hidden", background: "white", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
      <div style={{ background: bucketColor, padding: "18px 20px" }}>
        {isSample && <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.5)", margin: "0 0 6px", letterSpacing: "0.1em", textTransform: "uppercase" }}>Sample result</p>}
        {isEdited && <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.65)", margin: "0 0 4px" }}>⚠ Score reflects your edited values</p>}
        <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.55)", margin: "0 0 4px", letterSpacing: "0.08em", textTransform: "uppercase" }}>ADU potential score</p>
        <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
          <span style={{ fontSize: "42px", fontWeight: "500", color: "white", lineHeight: 1 }}>{adu_score}</span>
          <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.45)" }}>/ 100</span>
          <div style={{ marginLeft: "auto", background: "rgba(255,255,255,0.12)", borderRadius: "20px", padding: "5px 14px" }}>
            <span style={{ fontSize: "13px", color: "white", fontWeight: "500" }}>{bucket}</span>
          </div>
        </div>
        <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", margin: "8px 0 0" }}>{result.address}, {result.city}</p>
      </div>

      {!isSample && (
        <div style={{ padding: "10px 20px", background: "#fafaf8", borderBottom: "0.5px solid #e8ede9" }}>
          <span style={{ fontSize: "11px", color: "#888", fontStyle: "italic" }}>See something wrong? Fix it.</span>
        </div>
      )}

      <div style={{ padding: "18px 20px" }}>
        {editing === "lot" ? (
          <EditField label="Lot size" value={lotSf} onChange={setLotSf} onDone={() => doneEditing("lot", setLotSf, lotSf)} unit="sq ft" />
        ) : (
          <ScoreBar label="Lot size" value={`${Math.round(Math.min(lotSf,999999)).toLocaleString()} sf`} score={lotPct}
            note={lotSf >= 10000 ? "Large lot — excellent ADU potential" : lotSf >= 7500 ? "Good lot size — solid candidate" : lotSf >= 5000 ? "Adequate — may have constraints" : "Smaller lot — limited potential"}
            color={barColor} onEdit={!isSample ? () => setEditing("lot") : null} edited={editedFields.lot} />
        )}
        {editing === "bldg" ? (
          <EditField label="Building size" value={bldgSf} onChange={setBldgSf} onDone={() => doneEditing("bldg", setBldgSf, bldgSf)} unit="sq ft" />
        ) : (
          <ScoreBar label="Coverage ratio" value={lotSf > 0 ? `${Math.round((bldgSf / lotSf) * 100)}%` : "N/A"} score={ratioPct}
            note={ratioPct >= 70 ? "Low coverage — plenty of buildable space" : ratioPct >= 40 ? "Moderate coverage — some room to build" : "High coverage — limited space remaining"}
            color={barColor} onEdit={!isSample ? () => setEditing("bldg") : null} edited={editedFields.bldg} />
        )}
        {editing === "year" ? (
          <EditField label="Year built" value={yearBuilt} onChange={setYearBuilt} onDone={() => doneEditing("year", setYearBuilt, yearBuilt)} unit="" />
        ) : (
          <ScoreBar label="Year built" value={yearBuilt > 0 ? yearBuilt : "Unknown"} score={agePct}
            note={yearBuilt < 1960 ? "Older home — typical ADU candidate" : yearBuilt < 1990 ? "Mid-age home — good candidate" : "Newer home — may already be well-built out"}
            color={barColor} onEdit={!isSample ? () => setEditing("year") : null} edited={editedFields.year} />
        )}
        <div style={{ marginBottom: "14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
            <span style={{ fontSize: "13px", fontWeight: "500", color: "#1a1a1a" }}>Zoning</span>
            <span style={{ fontSize: "13px", color: "#2d6a4f", fontWeight: "500" }}>ADU permitted</span>
          </div>
          <div style={{ height: "5px", background: "#e8ede9", borderRadius: "3px", marginBottom: "4px" }}>
            <div style={{ width: "100%", height: "100%", background: barColor, borderRadius: "3px" }}></div>
          </div>
          <p style={{ fontSize: "11px", color: "#888", margin: 0 }}>{result.zone ? `${result.zone} · ` : ""}Residential zone — ADU permitted under Colorado HB24-1152</p>
        </div>
      </div>

      <div style={{ padding: "16px 20px", borderTop: "0.5px solid #e8ede9", background: "#fafaf8" }}>
        <p style={{ fontSize: "13px", fontWeight: "500", color: "#1a1a1a", margin: "0 0 4px" }}>Does this property have alley access?</p>
        <p style={{ fontSize: "11px", color: "#888", margin: "0 0 12px", lineHeight: 1.5 }}>Alley access makes ADU construction significantly easier and can unlock additional design options.</p>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={() => setAlley(true)} style={alleyBtnStyle(alley === true)}>Yes</button>
          <button onClick={() => setAlley(false)} style={alleyBtnStyle(alley === false)}>No</button>
          <button onClick={() => setAlley(null)} style={alleyBtnStyle(false)}>Not sure</button>
        </div>
        {alley === true && <p style={{ fontSize: "11px", color: "#2d6a4f", margin: "10px 0 0" }}>✅ +10 points added — alley access significantly increases ADU feasibility.</p>}
        {alley === false && <p style={{ fontSize: "11px", color: "#888", margin: "10px 0 0" }}>No alley access — maximum score is 90. ADUs are still very buildable without alley access.</p>}
      </div>

      <div style={{ padding: "14px 20px", borderTop: "0.5px solid #e8ede9", display: "flex", gap: "8px" }}>
        <a href="https://www.angi.com" target="_blank" rel="noopener noreferrer"
          style={{ flex: 1, padding: "10px", background: "#1b4332", color: "white", border: "none", borderRadius: "8px", fontSize: "12px", cursor: "pointer", textAlign: "center", textDecoration: "none", display: "block" }}>
          Get builder quotes
        </a>
        <a href="https://www.lendingtree.com/home/heloc/" target="_blank" rel="noopener noreferrer"
          style={{ flex: 1, padding: "10px", background: "white", border: "0.5px solid #c4d4c8", borderRadius: "8px", fontSize: "12px", cursor: "pointer", textAlign: "center", textDecoration: "none", color: "#1a1a1a", display: "block" }}>
          Explore HELOC rates
        </a>
      </div>
    </div>
  );
}

export default function App() {
  const [address, setAddress] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [region, setRegion] = useState(null);

  function runCsvLookup(userLat, userLng, inputAddress, reg) {
    const csvFile = CSV[reg];
    Papa.parse(csvFile, {
      download: true,
      header: true,
      complete: (parsed) => {
        const rows = parsed.data.filter(r => r.lat && r.lng);
        const userNum = inputAddress.trim().match(/^\d+/)?.[0] || "";
        const nearby = rows.filter(r => distance(userLat, userLng, parseFloat(r.lat), parseFloat(r.lng)) < 0.05);
        let best = null;
        if (userNum) best = nearby.find(r => r.address && r.address.startsWith(userNum)) || null;
        if (!best) best = nearby[0] || null;
        if (!best) {
          setError("Your property may not be covered by our current dataset, or may be in a zone that doesn't permit ADUs.");
        } else {
          setResult(best);
        }
        setLoading(false);
      }
    });
  }

  async function handleSearch() {
    if (!address.trim()) return;
    setLoading(true);
    setResult(null);
    setError("");
    setSuggestion(null);
    setSearched(true);

    try {
      const geo = await fetch(`${CENSUS_GEO}?address=${encodeURIComponent(address + " CO")}&benchmark=2020&format=json`);
      const geoData = await geo.json();
      const match = geoData?.result?.addressMatches?.[0];

      if (!match) {
        setError("Address not found. Please check the street number and name and try again.");
        setLoading(false);
        return;
      }

      const userLat = parseFloat(match.coordinates.y);
      const userLng = parseFloat(match.coordinates.x);
      const reg = getRegion(userLat, userLng);

      if (!reg) {
        setError("We currently cover Denver and Jefferson County (Lakewood, Arvada, Golden, Littleton, Wheat Ridge). More cities coming soon.");
        setLoading(false);
        return;
      }

      setRegion(reg);
      const matchedAddress = match.matchedAddress || address;
      const inputNum = address.trim().match(/^\d+/)?.[0] || "";
      const matchNum = matchedAddress.match(/^\d+/)?.[0] || "";
      const inputStreet = address.toLowerCase().replace(/[^a-z]/g, "").slice(0, 6);
      const matchStreet = matchedAddress.toLowerCase().replace(/[^a-z]/g, "").slice(0, 6);
      const isCloseMatch = inputNum === matchNum && inputStreet !== matchStreet;

      if (isCloseMatch) {
        setSuggestion({ shortName: matchedAddress.split(",")[0], lat: userLat, lng: userLng, reg });
        setLoading(false);
        return;
      }

      runCsvLookup(userLat, userLng, address, reg);

    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  function confirmSuggestion() {
    setLoading(true);
    const s = suggestion;
    setSuggestion(null);
    runCsvLookup(s.lat, s.lng, s.shortName, s.reg);
  }

  function rejectSuggestion() {
    setSuggestion(null);
    setError("");
    setSearched(false);
  }

  const coverageText = "Denver · Lakewood · Arvada · Golden · Littleton · Wheat Ridge · More cities coming soon";

  return (
    <div style={{ fontFamily: "Georgia, serif", background: "#f7f5f0", minHeight: "100vh" }}>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "16px 20px", background: "white", borderBottom: "0.5px solid #e0ddd8", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "2px" }}>
            <span style={{ fontSize: "11px", color: "#2d6a4f", letterSpacing: "0.15em", textTransform: "uppercase" }}>my</span>
            <span style={{ fontSize: "20px", fontWeight: "400", color: "#1a1a1a", letterSpacing: "-0.01em" }}>ADUscore</span>
            <span style={{ fontSize: "20px", color: "#2d6a4f" }}>.com</span>
          </div>
          <div style={{ height: "1px", background: "linear-gradient(to right, transparent, #2d6a4f, transparent)", marginTop: "3px", width: "140px" }}></div>
        </div>
      </div>

      <div style={{ position: "relative", width: "100%", height: "260px", overflow: "hidden" }}>
        <img src="/hero.png" alt="Denver craftsman home with ADU cottage at golden hour" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 40%" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.15) 55%, transparent 100%)" }}></div>
        <div style={{ position: "absolute", bottom: "18px", left: "20px", right: "20px" }}>
          <p style={{ fontSize: "10px", letterSpacing: "0.12em", color: "rgba(255,255,255,0.75)", textTransform: "uppercase", margin: "0 0 6px" }}>Free · Instant · No login</p>
          <h1 style={{ fontSize: "22px", fontWeight: "400", color: "white", margin: 0, lineHeight: 1.3 }}>Can you build an ADU<br />on your property?</h1>
        </div>
      </div>

      <div style={{ padding: "20px", background: "white", borderBottom: "0.5px solid #e0ddd8" }}>
        <p style={{ fontSize: "14px", color: "#555", margin: "0 0 14px", lineHeight: 1.6 }}>
          Enter your address for an instant eligibility score based on real parcel data — lot size, zoning, and building coverage.
        </p>
        <input value={address} onChange={e => setAddress(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSearch()}
          placeholder="Enter your address..."
          style={{ width: "100%", boxSizing: "border-box", padding: "13px 16px", fontSize: "14px", border: "1px solid #c4d4c8", borderRadius: "8px", background: "white", color: "#1a1a1a", marginBottom: "8px", fontFamily: "Georgia, serif", outline: "none" }} />
        <button onClick={handleSearch} disabled={loading}
          style={{ width: "100%", padding: "13px", background: "#2d6a4f", color: "white", border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: "500", cursor: "pointer", fontFamily: "Georgia, serif" }}>
          {loading ? "Checking..." : "Check My Property"}
        </button>
        <p style={{ fontSize: "10px", color: "#aaa", textAlign: "center", margin: "8px 0 0", lineHeight: 1.5 }}>
          No account required · Addresses not stored · No personal data collected
        </p>
      </div>

      {suggestion && (
        <div style={{ padding: "20px" }}>
          <div style={{ background: "white", border: "0.5px solid #c4d4c8", borderRadius: "10px", padding: "16px 20px" }}>
            <p style={{ fontSize: "13px", color: "#555", margin: "0 0 4px" }}>We found a close match — is this your property?</p>
            <p style={{ fontSize: "15px", fontWeight: "500", color: "#1a1a1a", margin: "0 0 14px" }}>{suggestion.shortName}</p>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={confirmSuggestion} style={{ flex: 1, padding: "10px", background: "#2d6a4f", color: "white", border: "none", borderRadius: "8px", fontSize: "13px", cursor: "pointer", fontFamily: "Georgia, serif" }}>Yes, that's it</button>
              <button onClick={rejectSuggestion} style={{ flex: 1, padding: "10px", background: "white", border: "0.5px solid #c4d4c8", borderRadius: "8px", fontSize: "13px", cursor: "pointer", fontFamily: "Georgia, serif", color: "#555" }}>No, try again</button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div style={{ padding: "20px" }}>
          <p style={{ color: "#b91c1c", fontSize: "13px", margin: 0, padding: "12px 16px", background: "#fef2f2", borderRadius: "8px", border: "0.5px solid #fecaca" }}>{error}</p>
        </div>
      )}

      {result && (
        <div style={{ padding: "20px", background: "#f7f5f0" }}>
          <ResultCard result={result} isSample={false} />
        </div>
      )}

      {!searched && (
        <div style={{ padding: "20px", background: "#f7f5f0", borderBottom: "0.5px solid #e0ddd8" }}>
          <ResultCard result={SAMPLE} isSample={true} />
        </div>
      )}

      <div style={{ padding: "28px 20px", background: "white", borderBottom: "0.5px solid #e0ddd8" }}>
        <p style={{ fontSize: "11px", letterSpacing: "0.1em", color: "#aaa", textTransform: "uppercase", margin: "0 0 20px", textAlign: "center" }}>How it works</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", textAlign: "center" }}>
          {[
            { icon: <HouseIcon />, title: "Enter your address", sub: "Denver metro residential addresses" },
            { icon: <ChartIcon />, title: "We score your parcel", sub: "Lot size, zoning, and coverage" },
            { icon: <ClipboardIcon />, title: "Get your result", sub: "Likely, Maybe, or Unlikely" },
          ].map((s, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
              <div style={{ width: "60px", height: "60px", borderRadius: "50%", background: "#f0f7f4", border: "0.5px solid #c4d4c8", display: "flex", alignItems: "center", justifyContent: "center" }}>{s.icon}</div>
              <p style={{ fontSize: "12px", fontWeight: "500", color: "#1a1a1a", margin: "0 0 2px", lineHeight: 1.3 }}>{s.title}</p>
              <p style={{ fontSize: "11px", color: "#999", margin: 0, lineHeight: 1.4 }}>{s.sub}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: "20px", display: "flex", justifyContent: "space-between", background: "#f7f5f0", borderBottom: "0.5px solid #e0ddd8" }}>
        {[["424k", "parcels scored"], ["Free", "always"], ["Instant", "real parcel data"]].map(([val, label]) => (
          <div key={label} style={{ textAlign: "center", flex: 1 }}>
            <p style={{ fontSize: "20px", fontWeight: "500", color: "#1a1a1a", margin: 0 }}>{val}</p>
            <p style={{ fontSize: "11px", color: "#999", margin: 0 }}>{label}</p>
          </div>
        ))}
      </div>

      <div style={{ padding: "24px 20px", background: "white", borderBottom: "0.5px solid #e0ddd8" }}>
        <h2 style={{ fontSize: "18px", fontWeight: "400", color: "#1a1a1a", margin: "0 0 12px" }}>ADU rules in the Denver metro area (2026)</h2>
        <p style={{ fontSize: "13px", color: "#555", margin: "0 0 12px", lineHeight: 1.75 }}>Colorado's HB24-1152, which took full effect June 30, 2025, requires all municipalities along the Front Range to allow ADUs on single-family lots. This includes Denver, Lakewood, Arvada, Golden, Littleton, Wheat Ridge, and dozens of other communities across the metro area.</p>
        <h3 style={{ fontSize: "15px", fontWeight: "400", color: "#1a1a1a", margin: "0 0 10px" }}>Common questions about ADUs in Colorado</h3>
        <p style={{ fontSize: "13px", color: "#555", margin: "0 0 12px", lineHeight: 1.75 }}><strong style={{ fontWeight: "500", color: "#1a1a1a" }}>Can I build an ADU in Denver?</strong> In most residential zones, yes. Denver updated its ADU ordinance to allow accessory dwelling units on single-family lots citywide, subject to lot size, setback, and coverage requirements.</p>
        <p style={{ fontSize: "13px", color: "#555", margin: "0 0 12px", lineHeight: 1.75 }}><strong style={{ fontWeight: "500", color: "#1a1a1a" }}>Can I build an ADU in Lakewood, Arvada, or Golden?</strong> Yes. Under Colorado's statewide ADU law, Jefferson County cities must permit ADUs on single-family lots. Local setback and coverage rules still apply.</p>
        <p style={{ fontSize: "13px", color: "#555", margin: "0 0 12px", lineHeight: 1.75 }}><strong style={{ fontWeight: "500", color: "#1a1a1a" }}>How much does an ADU cost in Colorado?</strong> Construction costs typically range from $150,000 to $350,000 depending on size, finishes, and site conditions. Many homeowners finance ADUs using a HELOC or cash-out refinance.</p>
        <p style={{ fontSize: "13px", color: "#555", margin: 0, lineHeight: 1.75 }}><strong style={{ fontWeight: "500", color: "#1a1a1a" }}>Does Colorado allow detached ADUs?</strong> Yes. Detached ADUs — backyard cottages or carriage houses — are permitted in most residential zones across the Denver metro area under state law.</p>
      </div>

      <div style={{ padding: "20px", background: "#f7f5f0", borderBottom: "0.5px solid #e0ddd8" }}>
        <div style={{ borderLeft: "2px solid #c4d4c8", paddingLeft: "12px" }}>
          <p style={{ fontSize: "11px", color: "#999", margin: 0, lineHeight: 1.7 }}>
            <span style={{ fontWeight: "500", color: "#666" }}>Informational use only.</span> Scores are estimates based on publicly available parcel and zoning data. This tool is not a substitute for professional planning advice. Always verify eligibility directly with your local Community Planning and Development department before making any decisions. Results may not reflect HOA restrictions, easements, historic overlays, or recent code changes.
          </p>
        </div>
      </div>

      <div style={{ padding: "24px 20px", textAlign: "center", background: "white" }}>
        <p style={{ fontSize: "14px", fontWeight: "500", color: "#1a1a1a", margin: "0 0 4px" }}>myADUscore.com</p>
        <p style={{ fontSize: "11px", color: "#aaa", margin: "0 0 12px" }}>{coverageText}</p>
        <p style={{ fontSize: "12px", color: "#888", margin: "0 0 4px" }}>Have a question?</p>
        <a href="mailto:myaduscore@gmail.com" style={{ fontSize: "13px", color: "#2d6a4f", textDecoration: "none" }}>myaduscore@gmail.com</a>
        <p style={{ fontSize: "10px", color: "#ccc", margin: "12px 0 0" }}>Data sourced from Denver Open Data Portal and Jefferson County</p>
      </div>

    </div>
  );
}
