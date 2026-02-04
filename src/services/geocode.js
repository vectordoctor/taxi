async function reverseGeocode(lat, lng) {
  if (!lat || !lng) return null;
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "taxi-booking-app/1.0 (local)"
    }
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data && data.display_name ? data.display_name : null;
}

module.exports = { reverseGeocode };
