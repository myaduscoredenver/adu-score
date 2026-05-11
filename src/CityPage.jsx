import { useState } from "react";
import { Link } from "react-router-dom";
import Papa from "papaparse";

const CENSUS_GEO = "/api/geocode";

function toRad(d) { return d * Math.PI / 180; }
function distance(lat1, lng1, lat2, lng2) {
  const R = 3959;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function calcScore(lot_sf, bldg_sf, year_built) {
  const lotScore = lot_sf < 5000 ? 0 : lot_sf < 6000 ? 20 : lot_sf < 7500 ? 50 : lot_sf < 10000 ? 75 : 100;
  const ratio = lot_sf > 0 ? bldg_sf / lot_sf : 0;
  const ratioScore = ratio > 0.40 ? 0 : ratio > 0.25 ? 30 : ratio > 0.15 ? 60 : 100;
  const ageScore = !year_built || year_built == 0 ? 50 : year_built >= 2000 ? 10 : year_built >= 1980 ? 30 : year_built >= 1960 ? 65 : 100;
  const raw = Math.round(lotScore * 0.45 + ratioScore * 0.35 + ageScore * 0.20);
  return { adu_score: Math.min(90, raw), bucket: Math.min(90, raw) >= 65 ? "Likely" : Math.min(90, raw) >= 35 ? "Maybe" : "Unlikely" };
}

const CITIES = [
  { name: "Denver", slug: "denver", county: "Denver County", csv: "/parcels_final.csv" },
  { name: "Lakewood", slug: "lakewood", county: "Jefferson County", csv: "/jeffco_final.csv" },
  { name: "Arvada", slug: "arvada", county: "Jefferson County", csv: "/jeffco_final.csv" },
  { name: "Golden", slug: "golden", county: "Jefferson County", csv: "/jeffco_final.csv" },
  { name: "Wheat Ridge", slug: "wheat-ridge", county: "Jefferson County", csv: "/jeffco_final.csv" },
  { name: "Littleton", slug: "littleton", county: "Jefferson County", csv: "/jeffco_final.csv" },
];

const CITY_DATA = {
  denver: { parcels: "187,000", cost: "$260k–$520k", conversionCost: "$130k–$240k", blurb: "Denver is the state's most active ADU market. The city updated its ADU ordinance to allow accessory dwelling units in most residential zones citywide. Older neighborhoods like Washington Park, Capitol Hill, and Berkeley often have large lots with low building coverage — strong candidates for a detached ADU.", q1: "Denver's ADU ordinance permits ADUs in most single-family zones including E-SU-B, E-SU-D, E-SU-DX, and E-SU-G. No special approval or public hearing required.", q2: "Denver does not set a strict minimum lot size, but setback and coverage requirements typically require at least 5,000–6,000 square feet of lot area." },
  lakewood: { parcels: "42,000", cost: "$245k–$460k", conversionCost: "$125k–$235k", blurb: "Lakewood is one of the most practical ADU markets on the Front Range. The city's older housing stock — much of it built between 1950 and 1980 — sits on generous lots that score well for ADU potential. Colorado's statewide ADU law now requires Lakewood to permit ADUs on single-family lots.", q1: "Yes. Colorado HB24-1152 requires Lakewood to permit ADUs on single-family lots using an administrative approval process — no public hearing required.", q2: "Colorado's statewide law does not set a strict minimum, but practical setback and coverage constraints typically require at least 5,000–6,000 square feet of lot area." },
  arvada: { parcels: "38,000", cost: "$240k–$450k", conversionCost: "$125k–$230k", blurb: "Arvada is one of Jefferson County's largest cities and a strong ADU market. Established neighborhoods with large single-family lots and older homes are common throughout the city, creating significant ADU potential for homeowners looking to add rental income or multigenerational housing.", q1: "Yes. Under Colorado's statewide ADU law, Arvada must permit ADUs on single-family residential lots. The process is administrative — no public hearing or special approval required.", q2: "No strict minimum under state law, but setback and coverage requirements typically require at least 5,000–6,000 square feet." },
  golden: { parcels: "12,000", cost: "$250k–$470k", conversionCost: "$130k–$240k", blurb: "Golden is a smaller but high-value ADU market. As Jefferson County's seat, Golden combines mountain proximity with established neighborhoods and strong homeowner demographics. Many Golden properties have larger lots and older homes that score well for ADU eligibility.", q1: "Yes. Colorado HB24-1152 requires Golden to permit ADUs on single-family lots. Some properties near historic districts may have additional design considerations.", q2: "State law sets no strict minimum, but typical lot constraints require 5,000–6,000 square feet or more for a practical ADU project." },
  "wheat-ridge": { parcels: "14,000", cost: "$235k–$445k", conversionCost: "$120k–$225k", blurb: "Wheat Ridge is a compact, well-located city between Denver and Lakewood with a strong ADU candidate profile. Many homes were built in the 1950s and 1960s on rectangular lots with low building coverage — exactly the property type that scores well on our ADU eligibility tool.", q1: "Yes. Colorado's statewide ADU law requires Wheat Ridge to permit ADUs on single-family lots using an administrative approval process.", q2: "No strict minimum under state law. Practical constraints typically require 5,000–6,000 square feet, though Wheat Ridge's older lots are often well-suited." },
  littleton: { parcels: "22,000", cost: "$240k–$455k", conversionCost: "$125k–$230k", blurb: "Littleton spans both Jefferson and Arapahoe counties and offers a mix of lot sizes and housing ages that create varied ADU potential. Older neighborhoods near downtown Littleton often have generous lots, while newer subdivisions may face more constraints.", q1: "Yes. Colorado HB24-1152 requires Littleton to permit ADUs on single-family lots. Check your specific property for lot size and zoning constraints.", q2: "No strict minimum under state law. Setback and coverage rules typically require 5,000–6,000 square feet minimum for a workable ADU project." },
};

function Nav() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", background: "white", borderBottom: "0.5px solid #e0ddd8", position: "sticky", top: 0, zIndex: 100 }}>
      <Link to="/" style={{ textDecoration: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
          <span style={{ fontSize: "11px", color: "#2d6a4f", letterSpacing: "0.15em", textTransform: "uppercase", fontFamily: "Georgia, serif" }}>my</span>
          <span style={{ fontSize: "18px", fontWeight: "400", color: "#1a1a1a", fontFamily: "Georgia, serif" }}>ADUscore</span>
          <span style={{ fontSize: "18px", color: "#2d6a4f", fontFamily: "Georgia, serif" }}>.com</span>
        </div>
      </Link>
      <div style={{ position: "relative" }}>
        <button onClick={() => setOpen(!open)} style={{ background: "none", border: "0.5px solid #c4d4c8", borderRadius: "6px", padding: "6px 12px", fontSize: "12px", cursor: "pointer", color: "#1a1a1a", fontFamily: "Georgia, serif" }}>
          Cities ▾
        </button>
        {open && (
          <div style={{ position: "absolute", right: 0, top: "110%", background: "white", border: "0.5px solid #c4d4c8", borderRadius: "8px", width: "160px", zIndex: 200, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
            {CITIES.map(c => (
              <Link key={c.slug} to={`/${c.slug}`} onClick={() => setOpen(false)}
                style={{ display: "block", padding: "10px 14px", fontSize: "13px", color: "#1a1a1a", textDecoration: "none", borderBottom: "0.5px solid #f0f0f0", fontFamily: "Georgia, serif" }}>
                {c.name}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CityPage({ slug }) {
  const city = CITIES.find(c => c.slug === slug);
  const data = CITY_DATA[slug];
  const [address, setAddress] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [alley, setAlley] = useState(null);

  const otherCities = CITIES.filter(c => c.slug !== slug);

  function runCsvLookup(userLat, userLng, inputAddress) {
    Papa.parse(city.csv, {
      download: true, header: true,
      complete: (parsed) => {
        const rows = parsed.data.filter(r => r.lat && r.lng);
        const userNum = inputAddress.trim().match(/^\d+/)?.[0] || "";
        const nearby = rows.filter(r => distance(userLat, userLng, parseFloat(r.lat), parseFloat(r.lng)) < 0.05);
        let best = null;
        if (userNum) best = nearby.find(r => r.address && r.address.startsWith(userNum)) || null;
        if (!best) best = nearby[0] || null;
        if (!best) {
          setError("No ADU-eligible parcel found near that address. The property may be in a non-eligible zone.");
        } else {
          setResult(best);
        }
        setLoading(false);
      }
    });
  }

  async function handleSearch() {
    if (!address.trim()) return;
    setLoading(true); setResult(null); setError(""); setSearched(true);
    try {
      const geo = await fetch(`${CENSUS_GEO}?address=${encodeURIComponent(address + " " + city.name + " CO")}`);
      const geoData = await geo.json();
      const match = geoData?.result?.addressMatches?.[0];
      if (!match) { setError("Address not found. Please check the street number and name and try again."); setLoading(false); return; }
      runCsvLookup(parseFloat(match.coordinates.y), parseFloat(match.coordinates.x), address);
    } catch { setError("Something went wrong. Please try again."); setLoading(false); }
  }

  const baseScores = result ? calcScore(parseFloat(result.lot_sf)||0, parseFloat(result.bldg_sf)||0, parseFloat(result.year_built)||0) : null;
  const alleyBonus = alley === true ? 10 : 0;
  const adu_score = baseScores ? Math.min(100, baseScores.adu_score + alleyBonus) : null;
  const bucket = adu_score >= 65 ? "Likely" : adu_score >= 35 ? "Maybe" : "Unlikely";
  const bucketColor = bucket === "Likely" ? "#1b4332" : bucket === "Maybe" ? "#7c4a00" : "#7c1a1a";
  const barColor = bucket === "Likely" ? "#2d6a4f" : bucket === "Maybe" ? "#b45309" : "#b91c1c";

  if (!city || !data) return <div style={{ padding: "2rem", fontFamily: "Georgia, serif" }}>City not found.</div>;

  return (
    <div style={{ fontFamily: "Georgia, serif", background: "#f7f5f0", minHeight: "100vh" }}>
      <Nav />

      <div style={{ padding: "24px 20px", background: "white", borderBottom: "0.5px solid #e0ddd8" }}>
        <p style={{ fontSize: "11px", color: "#aaa", margin: "0 0 4px" }}>{city.county} · Colorado</p>
        <h1 style={{ fontSize: "22px", fontWeight: "400", color: "#1a1a1a", margin: "0 0 10px", lineHeight: 1.3 }}>Can I build an ADU in {city.name}, Colorado?</h1>
        <p style={{ fontSize: "13px", color: "#555", margin: 0, lineHeight: 1.7 }}>Yes — in most cases. Colorado's statewide ADU law (HB24-1152) requires {city.name} to permit accessory dwelling units on single-family lots. Check your specific property below.</p>
      </div>

      <div style={{ padding: "20px", background: "white", borderBottom: "0.5px solid #e0ddd8" }}>
        <p style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#aaa", textTransform: "uppercase", margin: "0 0 10px" }}>Check your {city.name} property</p>
        <input value={address} onChange={e => setAddress(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSearch()}
          placeholder={`Enter your ${city.name} address...`}
          style={{ width: "100%", boxSizing: "border-box", padding: "13px 16px", fontSize: "14px", border: "1px solid #c4d4c8", borderRadius: "8px", marginBottom: "8px", fontFamily: "Georgia, serif", outline: "none" }} />
        <button onClick={handleSearch} disabled={loading}
          style={{ width: "100%", padding: "13px", background: "#2d6a4f", color: "white", border: "none", borderRadius: "8px", fontSize: "14px", cursor: "pointer", fontFamily: "Georgia, serif" }}>
          {loading ? "Checking..." : "Check My Property"}
        </button>
        <p style={{ fontSize: "10px", color: "#aaa", textAlign: "center", margin: "8px 0 0" }}>No account required · Addresses not stored</p>
      </div>

      {error && <div style={{ padding: "20px" }}><p style={{ color: "#b91c1c", fontSize: "13px", margin: 0, padding: "12px 16px", background: "#fef2f2", borderRadius: "8px", border: "0.5px solid #fecaca" }}>{error}</p></div>}

      {result && (
        <div style={{ padding: "20px", background: "#f7f5f0" }}>
          <div style={{ border: "0.5px solid #d4ddd6", borderRadius: "12px", overflow: "hidden", background: "white", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
            <div style={{ background: bucketColor, padding: "18px 20px" }}>
              <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.55)", margin: "0 0 4px", letterSpacing: "0.08em", textTransform: "uppercase" }}>ADU potential score</p>
              <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
                <span style={{ fontSize: "42px", fontWeight: "500", color: "white", lineHeight: 1 }}>{adu_score}</span>
                <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.45)" }}>/ 100</span>
                <div style={{ marginLeft: "auto", background: "rgba(255,255,255,0.12)", borderRadius: "20px", padding: "5px 14px" }}>
                  <span style={{ fontSize: "13px", color: "white", fontWeight: "500" }}>{bucket}</span>
                </div>
              </div>
              <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", margin: "8px 0 0" }}>{result.address}, {city.name} CO</p>
            </div>
            <div style={{ padding: "18px 20px" }}>
              {[
                { label: "Lot size", value: `${Math.round(parseFloat(result.lot_sf)||0).toLocaleString()} sf`, pct: Math.min(100, ((parseFloat(result.lot_sf)||0) / 12000) * 100) },
                { label: "Coverage ratio", value: `${Math.round(((parseFloat(result.bldg_sf)||0) / (parseFloat(result.lot_sf)||1)) * 100)}%`, pct: Math.max(0, 100 - ((parseFloat(result.bldg_sf)||0) / (parseFloat(result.lot_sf)||1)) * 200) },
                { label: "Year built", value: result.year_built > 0 ? result.year_built : "Unknown", pct: Math.min(100, ((2026 - (parseFloat(result.year_built)||1980)) / 100) * 100) },
              ].map(r => (
                <div key={r.label} style={{ marginBottom: "14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                    <span style={{ fontSize: "13px", fontWeight: "500", color: "#1a1a1a" }}>{r.label}</span>
                    <span style={{ fontSize: "13px", color: "#555" }}>{r.value}</span>
                  </div>
                  <div style={{ height: "5px", background: "#e8ede9", borderRadius: "3px" }}>
                    <div style={{ width: `${r.pct}%`, height: "100%", background: barColor, borderRadius: "3px" }}></div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: "14px 20px", borderTop: "0.5px solid #e8ede9", background: "#fafaf8" }}>
              <p style={{ fontSize: "13px", fontWeight: "500", color: "#1a1a1a", margin: "0 0 10px" }}>Does this property have alley access?</p>
              <div style={{ display: "flex", gap: "8px" }}>
                {["Yes","No","Not sure"].map(opt => (
                  <button key={opt} onClick={() => setAlley(opt === "Yes" ? true : opt === "No" ? false : null)}
                    style={{ padding: "8px 16px", fontSize: "12px", borderRadius: "6px", cursor: "pointer", fontFamily: "Georgia, serif", border: "0.5px solid #2d6a4f", background: (opt === "Yes" && alley === true) || (opt === "No" && alley === false) ? "#2d6a4f" : "white", color: (opt === "Yes" && alley === true) || (opt === "No" && alley === false) ? "white" : "#2d6a4f" }}>
                    {opt}
                  </button>
                ))}
              </div>
              {alley === true && <p style={{ fontSize: "11px", color: "#2d6a4f", margin: "10px 0 0" }}>✅ +10 points added for alley access.</p>}
            </div>
            <div style={{ padding: "14px 20px", borderTop: "0.5px solid #e8ede9", display: "flex", gap: "8px" }}>
              <a href="https://www.angi.com" target="_blank" rel="noopener noreferrer" style={{ flex: 1, padding: "10px", background: "#1b4332", color: "white", borderRadius: "8px", fontSize: "12px", textAlign: "center", textDecoration: "none", display: "block" }}>Get builder quotes</a>
              <a href="https://www.lendingtree.com/home/heloc/" target="_blank" rel="noopener noreferrer" style={{ flex: 1, padding: "10px", background: "white", border: "0.5px solid #c4d4c8", borderRadius: "8px", fontSize: "12px", textAlign: "center", textDecoration: "none", color: "#1a1a1a", display: "block" }}>Explore HELOC rates</a>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: "20px", background: "white", borderBottom: "0.5px solid #e0ddd8" }}>
        <p style={{ fontSize: "11px", letterSpacing: "0.1em", color: "#aaa", textTransform: "uppercase", margin: "0 0 14px" }}>{city.name} ADU at a glance</p>
        {[
          ["ADU permitted?", "Yes — by state law", true],
          ["Parking required?", "No", false],
          ["Owner-occupancy required?", "No", false],
          ["Detached ADU cost", data.cost, false],
          ["Garage conversion cost", data.conversionCost, false],
          ["Parcels scored", data.parcels, false],
        ].map(([label, value, green], i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "0.5px solid #f0f0f0" }}>
            <span style={{ fontSize: "13px", color: "#555" }}>{label}</span>
            <span style={{ fontSize: "13px", fontWeight: "500", color: green ? "#2d6a4f" : "#1a1a1a" }}>{value}</span>
          </div>
        ))}
      </div>

      <div style={{ padding: "24px 20px", background: "#f7f5f0", borderBottom: "0.5px solid #e0ddd8" }}>
        <h2 style={{ fontSize: "17px", fontWeight: "400", color: "#1a1a1a", margin: "0 0 10px" }}>ADU rules in {city.name}, Colorado (2026)</h2>
        <p style={{ fontSize: "13px", color: "#555", margin: "0 0 12px", lineHeight: 1.75 }}>{data.blurb}</p>
        <h3 style={{ fontSize: "14px", fontWeight: "500", color: "#1a1a1a", margin: "0 0 8px" }}>Common questions</h3>
        <p style={{ fontSize: "13px", color: "#555", margin: "0 0 10px", lineHeight: 1.75 }}><strong style={{ fontWeight: "500", color: "#1a1a1a" }}>Does {city.name} allow ADUs?</strong> {data.q1}</p>
        <p style={{ fontSize: "13px", color: "#555", margin: 0, lineHeight: 1.75 }}><strong style={{ fontWeight: "500", color: "#1a1a1a" }}>What is the minimum lot size for an ADU in {city.name}?</strong> {data.q2}</p>
      </div>

      <div style={{ padding: "20px", background: "white", borderBottom: "0.5px solid #e0ddd8" }}>
        <p style={{ fontSize: "11px", letterSpacing: "0.1em", color: "#aaa", textTransform: "uppercase", margin: "0 0 12px" }}>Other cities we cover</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {otherCities.map(c => (
            <Link key={c.slug} to={`/${c.slug}`} style={{ fontSize: "12px", color: "#2d6a4f", textDecoration: "none", padding: "5px 12px", border: "0.5px solid #2d6a4f", borderRadius: "6px", fontFamily: "Georgia, serif" }}>{c.name}</Link>
          ))}
        </div>
      </div>

      <div style={{ padding: "20px", background: "#f7f5f0", borderBottom: "0.5px solid #e0ddd8" }}>
        <div style={{ borderLeft: "2px solid #c4d4c8", paddingLeft: "12px" }}>
          <p style={{ fontSize: "11px", color: "#999", margin: 0, lineHeight: 1.7 }}><span style={{ fontWeight: "500", color: "#666" }}>Informational use only.</span> Scores are estimates based on publicly available parcel data. Always verify eligibility with your local Community Planning and Development department before making any decisions.</p>
        </div>
      </div>

      <div style={{ padding: "20px", textAlign: "center", background: "white" }}>
        <p style={{ fontSize: "13px", fontWeight: "500", color: "#1a1a1a", margin: "0 0 4px" }}>myADUscore.com</p>
        <p style={{ fontSize: "10px", color: "#ccc", margin: 0 }}>Data sourced from {city.county} Open Data</p>
      </div>
    </div>
  );
}
