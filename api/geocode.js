export default async function handler(req, res) {
  const { address } = req.query;
  if (!address) return res.status(400).json({ error: "No address" });

  try {
    const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(address)}&benchmark=2020&format=json`;
    const response = await fetch(url);
    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: "Geocoding failed" });
  }
}