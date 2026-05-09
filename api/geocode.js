export default async function handler(req, res) {
  const { address } = req.query;
  if (!address) return res.status(400).json({ error: "No address" });

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
    const response = await fetch(url, {
      headers: { "User-Agent": "myADUscore.com - ADU eligibility tool" }
    });
    const data = await response.json();
    res.status(200).json(data);
  } catch {
    res.status(500).json({ error: "Geocoding failed" });
  }
}
