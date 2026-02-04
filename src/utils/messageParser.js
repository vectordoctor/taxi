function normalize(text) {
  return text.trim();
}

function parseKeyValueLines(text) {
  const result = {};
  const lines = text.split(/\n|,/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(/^(pickup|dropoff|drop-off|date|time|datetime|passengers|pax|wait|waiting|distance|pickup_distance|pickup-distance)\s*[:=]\s*(.+)$/i);
    if (match) {
      const key = match[1].toLowerCase();
      const value = match[2].trim();
      result[key] = value;
    }
  }
  return result;
}

function parseDateTime({ dateStr, timeStr, datetimeStr }) {
  let candidate = null;
  if (datetimeStr) {
    candidate = datetimeStr;
  } else if (dateStr && timeStr) {
    candidate = `${dateStr} ${timeStr}`;
  }

  if (!candidate) return null;

  const isoCandidate = candidate.replace("/", "-");
  const date = new Date(isoCandidate);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function parseNumber(value) {
  if (!value) return null;
  const numeric = Number(String(value).replace(/[^0-9.]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function parseBookingMessage(text) {
  const normalized = normalize(text);
  const values = parseKeyValueLines(normalized);

  const pickupLocation = values.pickup;
  const dropoffLocation = values.dropoff || values["drop-off"];

  const rideDate = parseDateTime({
    dateStr: values.date,
    timeStr: values.time,
    datetimeStr: values.datetime
  });

  const passengers = parseNumber(values.passengers || values.pax);
  const waitingMinutes = parseNumber(values.wait || values.waiting) || 0;
  const distanceKm = parseNumber(values.distance);
  const driverDistanceKm = parseNumber(values.pickup_distance || values["pickup-distance"]);

  const missing = [];
  if (!pickupLocation) missing.push("pickup location");
  if (!dropoffLocation) missing.push("drop-off location");
  if (!rideDate) missing.push("date and time");
  if (!passengers) missing.push("number of passengers");

  return {
    pickupLocation,
    dropoffLocation,
    rideDate,
    passengers,
    waitingMinutes,
    distanceKm,
    driverDistanceKm,
    missing
  };
}

module.exports = { parseBookingMessage };
