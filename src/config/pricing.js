function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

module.exports = {
  currency: process.env.CURRENCY || "MUR",
  baseFare: toNumber(process.env.BASE_FARE, 4.0),
  perKm: toNumber(process.env.PRICE_PER_KM, 90),
  perMinute: toNumber(process.env.PRICE_PER_MINUTE, 0.35),
  nightSurchargePercent: toNumber(process.env.NIGHT_SURCHARGE_PERCENT, 20),
  weekendSurchargePercent: toNumber(process.env.WEEKEND_SURCHARGE_PERCENT, 10),
  extraPassengerPercent: toNumber(process.env.EXTRA_PASSENGER_PERCENT, 0),
  extraPassengerFee: toNumber(process.env.EXTRA_PASSENGER_FEE, 2.0),
  includedPassengers: toNumber(process.env.INCLUDED_PASSENGERS, 2),
  maxPassengers: toNumber(process.env.MAX_PASSENGERS, 4),
  waitingFreeMinutes: toNumber(process.env.WAITING_FREE_MINUTES, 3),
  waitingPerMinute: toNumber(process.env.WAITING_PER_MINUTE, 0.5),
  returnTripMultiplier: toNumber(process.env.RETURN_TRIP_MULTIPLIER, 2),
  peakHours: [
    { start: "07:00", end: "09:00", surchargePercent: 15 },
    { start: "17:00", end: "19:00", surchargePercent: 15 }
  ],
  holidays: ["2026-01-01", "2026-12-25"],
  holidaySurchargePercent: toNumber(process.env.HOLIDAY_SURCHARGE_PERCENT, 25)
};
