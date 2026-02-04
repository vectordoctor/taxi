const pricingDefaults = require("../config/pricing");

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function isNight(date) {
  const hour = date.getHours();
  return hour >= 20 || hour < 6;
}

function inPeakHour(date, pricing) {
  const hhmm = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return pricing.peakHours.find((window) => hhmm >= window.start && hhmm <= window.end);
}

function isHoliday(date, pricing) {
  const ymd = date.toISOString().slice(0, 10);
  return pricing.holidays.includes(ymd);
}

function getEffectivePricing(overrides) {
  const pricing = { ...pricingDefaults, ...(overrides || {}) };
  return {
    ...pricing,
    perKm: toNumber(pricing.perKm, pricingDefaults.perKm),
    waitingPerMinute: toNumber(pricing.waitingPerMinute, pricingDefaults.waitingPerMinute),
    extraPassengerPercent: toNumber(pricing.extraPassengerPercent, pricingDefaults.extraPassengerPercent)
  };
}

function calculateFare({ distanceKm, rideDate, passengers, waitingMinutes, pricingOverrides }) {
  const pricing = getEffectivePricing(pricingOverrides);
  const base = pricing.baseFare;
  const distanceCost = distanceKm * pricing.perKm;
  const timeCost = Math.max(0, waitingMinutes - pricing.waitingFreeMinutes) * pricing.waitingPerMinute;
  const extraPassengers = Math.max(0, passengers - pricing.includedPassengers);
  let passengerCost = 0;
  if (pricing.extraPassengerPercent > 0) {
    passengerCost = (base + distanceCost + timeCost) * (pricing.extraPassengerPercent / 100) * extraPassengers;
  } else {
    passengerCost = extraPassengers * pricing.extraPassengerFee;
  }

  let subtotal = base + distanceCost + timeCost + passengerCost;

  const surcharges = [];

  if (isNight(rideDate)) {
    surcharges.push({ label: "Night rate", percent: pricing.nightSurchargePercent });
  }
  if (isWeekend(rideDate)) {
    surcharges.push({ label: "Weekend", percent: pricing.weekendSurchargePercent });
  }
  if (isHoliday(rideDate, pricing)) {
    surcharges.push({ label: "Holiday", percent: pricing.holidaySurchargePercent });
  }
  const peak = inPeakHour(rideDate, pricing);
  if (peak) {
    surcharges.push({ label: "Peak hours", percent: peak.surchargePercent });
  }

  let surchargeAmount = 0;
  for (const s of surcharges) {
    surchargeAmount += (subtotal * s.percent) / 100;
  }

  const total = subtotal + surchargeAmount;

  return {
    currency: pricing.currency,
    base,
    distanceCost,
    timeCost,
    passengerCost,
    surchargeAmount,
    total,
    surcharges
  };
}

module.exports = { calculateFare };
