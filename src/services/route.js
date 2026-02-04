async function getOptimalRoute({ pickupLat, pickupLng, dropoffLat, dropoffLng }) {
  if (!pickupLat || !pickupLng || !dropoffLat || !dropoffLng) return null;
  const url = `https://router.project-osrm.org/route/v1/driving/${pickupLng},${pickupLat};${dropoffLng},${dropoffLat}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const route = data.routes && data.routes[0];
  if (!route) return null;
  const distanceKm = route.distance ? route.distance / 1000 : null;
  const durationMinutes = route.duration ? Math.round(route.duration / 60) : null;
  const geometry = route.geometry || null;
  if (!distanceKm) return null;
  return { distanceKm, durationMinutes, geometry };
}

module.exports = { getOptimalRoute };
