const MAPS_PROVIDER = process.env.MAPS_PROVIDER || "";

function buildGoogleDistanceMatrixUrl({ origin, destination, departureTime }) {
  const params = new URLSearchParams({
    origins: origin,
    destinations: destination,
    key: process.env.GOOGLE_MAPS_API_KEY || ""
  });
  if (departureTime) {
    params.set("departure_time", String(departureTime));
  }
  return `https://maps.googleapis.com/maps/api/distancematrix/json?${params.toString()}`;
}

async function getGoogleRouteMetrics({ origin, destination, departureTime }) {
  if (!process.env.GOOGLE_MAPS_API_KEY) return null;
  const url = buildGoogleDistanceMatrixUrl({ origin, destination, departureTime });
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Google Maps API error: ${response.status}`);
  }
  const data = await response.json();
  const element = data.rows?.[0]?.elements?.[0];
  if (!element || element.status !== "OK") return null;

  const distanceKm = element.distance?.value ? element.distance.value / 1000 : null;
  const durationSeconds = element.duration_in_traffic?.value || element.duration?.value || null;
  const durationMinutes = durationSeconds ? Math.round(durationSeconds / 60) : null;

  if (!distanceKm || !durationMinutes) return null;
  return { distanceKm, durationMinutes };
}

async function getRouteMetrics({ origin, destination, departureTime }) {
  if (!origin || !destination) return null;
  if (MAPS_PROVIDER.toLowerCase() === "google") {
    return getGoogleRouteMetrics({ origin, destination, departureTime });
  }
  return null;
}

module.exports = { getRouteMetrics };
