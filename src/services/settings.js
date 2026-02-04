const { getDb } = require("../db");
const pricingDefaults = require("../config/pricing");

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function getSettings() {
  const db = await getDb();
  const rows = await db.all("SELECT key, value FROM settings");
  const map = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }

  return {
    currency: map.currency || pricingDefaults.currency,
    perKm: toNumber(map.perKm, pricingDefaults.perKm),
    waitingPerMinute: toNumber(map.waitingPerMinute, pricingDefaults.waitingPerMinute),
    extraPassengerPercent: toNumber(map.extraPassengerPercent, pricingDefaults.extraPassengerPercent),
    maxPassengers: toNumber(map.maxPassengers, pricingDefaults.maxPassengers),
    returnTripMultiplier: toNumber(map.returnTripMultiplier, pricingDefaults.returnTripMultiplier),
    nightSurchargePercent: toNumber(map.nightSurchargePercent, pricingDefaults.nightSurchargePercent),
    unavailableMode: map.unavailableMode === "true",
    unavailableStart: map.unavailableStart || "20:00",
    unavailableEnd: map.unavailableEnd || "06:00"
  };
}

async function updateSettings(values) {
  const db = await getDb();
  const entries = Object.entries(values);
  await db.exec("BEGIN TRANSACTION;");
  try {
    for (const [key, value] of entries) {
      if (value === undefined || value === null) continue;
      await db.run(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [key, String(value)]
      );
    }
    await db.exec("COMMIT;");
  } catch (error) {
    await db.exec("ROLLBACK;");
    throw error;
  }
}

module.exports = { getSettings, updateSettings };
