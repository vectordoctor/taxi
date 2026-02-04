const DEFAULT_PICKUP_DISTANCE_KM = Number(process.env.DEFAULT_PICKUP_DISTANCE_KM || 5);
const AVG_SPEED_KMH = Number(process.env.AVG_SPEED_KMH || 25);
const TRAFFIC_FACTOR = Number(process.env.TRAFFIC_FACTOR || 1.2);

function estimatePickupMinutes({ driverDistanceKm }) {
  const distance = Number.isFinite(driverDistanceKm) ? driverDistanceKm : DEFAULT_PICKUP_DISTANCE_KM;
  const minutes = Math.max(3, Math.round((distance / AVG_SPEED_KMH) * 60 * TRAFFIC_FACTOR));
  return minutes;
}

module.exports = { estimatePickupMinutes };
