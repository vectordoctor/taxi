require("dotenv").config();
const express = require("express");
const twilio = require("twilio");
const { parseBookingMessage } = require("./utils/messageParser");
const { calculateFare } = require("./services/fare");
const { estimatePickupMinutes } = require("./services/pickupEstimate");
const { getRouteMetrics } = require("./services/maps");
const { getSettings, updateSettings } = require("./services/settings");
const { haversineKm } = require("./services/distance");
const { getOptimalRoute } = require("./services/route");
const { reverseGeocode } = require("./services/geocode");
const {
  createBooking,
  updateBookingStatus,
  getBookingById,
  listBookings,
  setDriverLocation,
  getDriverLocation
} = require("./services/bookings");
const { sendWhatsAppMessage } = require("./services/notifications");
const { adminPageHtml } = require("./routes/adminPage");
const { bookingPageHtml, bookingResultHtml, bookingErrorHtml } = require("./routes/bookPage");

const app = express();
const port = process.env.PORT || 3000;
const host = process.env.HOST || (process.env.RENDER ? "0.0.0.0" : "127.0.0.1");

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

function normalizeNumber(value) {
  if (!value) return "";
  return value.replace(/^whatsapp:/, "");
}

function formatFareSummary(fare) {
  return `Fare estimate: ${fare.currency} ${fare.total.toFixed(2)} (includes base ${fare.currency} ${fare.base.toFixed(2)}, distance ${fare.currency} ${fare.distanceCost.toFixed(2)}, waiting ${fare.currency} ${fare.timeCost.toFixed(2)}, passengers ${fare.currency} ${fare.passengerCost.toFixed(2)}, surcharges ${fare.currency} ${fare.surchargeAmount.toFixed(2)}).`;
}

function bookingRequestTemplate(missing) {
  return `Thanks for your message. Please send booking details in this format:\n\nPickup: 123 Main St\nDropoff: 500 Market St\nDate: 2026-02-05\nTime: 14:30\nPassengers: 2\nWaiting: 5 (minutes, optional)\nDistance: 12 (km, optional)\nPickup_Distance: 4 (km from driver, optional)\n\nMissing: ${missing.join(", ")}`;
}

function driverBookingTemplate(booking, fare) {
  const gpsLine = booking.pickup_lat && booking.pickup_lng
    ? `Pickup GPS: ${booking.pickup_lat}, ${booking.pickup_lng}`
    : null;
  const dropoffGpsLine = booking.dropoff_lat && booking.dropoff_lng
    ? `Dropoff GPS: ${booking.dropoff_lat}, ${booking.dropoff_lng}`
    : null;
  return [
    `New ride request #${booking.id}`,
    `Pickup: ${booking.pickup_location}`,
    gpsLine,
    `Dropoff: ${booking.dropoff_location}`,
    dropoffGpsLine,
    `Date/Time: ${booking.ride_datetime}`,
    `Passengers: ${booking.passengers}`,
    `Waiting: ${booking.waiting_minutes} min`,
    booking.waiting_return ? "Return: waiting then back to pickup" : null,
    `Estimated pickup: ${booking.estimated_pickup_minutes} min`,
    `Fare estimate: ${fare.currency} ${fare.total.toFixed(2)}`,
    `Reply: ACCEPT ${booking.id} or DECLINE ${booking.id}`
  ].filter(Boolean).join("\n");
}

function isNightTime(date) {
  const hour = date.getHours();
  return hour >= 20 || hour < 6;
}

async function applyDriverDecision(bookingId, decision) {
  const booking = await getBookingById(bookingId);
  if (!booking) return { ok: false, error: `Booking ${bookingId} not found.` };

  if (decision === "accept") {
    await updateBookingStatus(bookingId, "accepted", "accepted");
    const publicBaseUrl = process.env.PUBLIC_BASE_URL;
    const trackingLink = publicBaseUrl ? ` Track your driver: ${publicBaseUrl}/track/${bookingId}` : "";
    await sendWhatsAppMessage(
      booking.customer_number,
      `Your ride request #${bookingId} is confirmed. Driver will arrive in about ${booking.estimated_pickup_minutes} minutes.${trackingLink}`
    );
    return { ok: true, message: `Accepted booking #${bookingId}. Customer notified.` };
  }

  if (decision === "decline") {
    await updateBookingStatus(bookingId, "declined", "declined");
    await sendWhatsAppMessage(
      booking.customer_number,
      `Sorry, your ride request #${bookingId} was declined. Please try another time.`
    );
    return { ok: true, message: `Declined booking #${bookingId}. Customer notified.` };
  }

  return { ok: false, error: "Unknown decision." };
}

app.post("/webhooks/whatsapp", async (req, res) => {
  const twiml = new twilio.twiml.MessagingResponse();

  const from = normalizeNumber(req.body.From);
  const body = String(req.body.Body || "").trim();
  const profileName = req.body.ProfileName || "Customer";

  const driverNumber = normalizeNumber(process.env.DRIVER_WHATSAPP_NUMBER || "");

  try {
    if (from && driverNumber && from === driverNumber) {
      if (/^loc/i.test(body)) {
        const coords = body.replace(/loc/i, "").trim().split(/[ ,]+/);
        const lat = Number(coords[0]);
        const lng = Number(coords[1]);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          await setDriverLocation(lat, lng);
          twiml.message("Driver location updated.");
        } else {
          twiml.message("Please send location as: LOC <lat> <lng>");
        }
        return res.type("text/xml").send(twiml.toString());
      }

      const acceptMatch = body.match(/^accept\s+(\d+)/i);
      const declineMatch = body.match(/^decline\s+(\d+)/i);

      if (acceptMatch) {
        const bookingId = Number(acceptMatch[1]);
        const result = await applyDriverDecision(bookingId, "accept");
        twiml.message(result.ok ? result.message : result.error);
        return res.type("text/xml").send(twiml.toString());
      }

      if (declineMatch) {
        const bookingId = Number(declineMatch[1]);
        const result = await applyDriverDecision(bookingId, "decline");
        twiml.message(result.ok ? result.message : result.error);
        return res.type("text/xml").send(twiml.toString());
      }

      twiml.message("Driver commands: ACCEPT <id>, DECLINE <id>, or LOC <lat> <lng>.");
      return res.type("text/xml").send(twiml.toString());
    }

    const bookingRequest = parseBookingMessage(body);
    if (bookingRequest.missing.length > 0) {
      twiml.message(bookingRequestTemplate(bookingRequest.missing));
      return res.type("text/xml").send(twiml.toString());
    }

    const settings = await getSettings();
    if (bookingRequest.passengers > settings.maxPassengers) {
      twiml.message(`Sorry, maximum passengers is ${settings.maxPassengers}. Please adjust and resend.`);
      return res.type("text/xml").send(twiml.toString());
    }

    let distanceKm = Number.isFinite(bookingRequest.distanceKm)
      ? bookingRequest.distanceKm
      : Number(process.env.DEFAULT_TRIP_DISTANCE_KM || 5);

    let estimatedPickupMinutes = estimatePickupMinutes({ driverDistanceKm: bookingRequest.driverDistanceKm });

    try {
      const driverLocation = await getDriverLocation();
      const driverOrigin = driverLocation?.lat && driverLocation?.lng
        ? `${driverLocation.lat},${driverLocation.lng}`
        : process.env.DEFAULT_DRIVER_ORIGIN;

      if (driverOrigin) {
        const pickupMetrics = await getRouteMetrics({
          origin: driverOrigin,
          destination: bookingRequest.pickupLocation,
          departureTime: Math.floor(Date.now() / 1000)
        });
        if (pickupMetrics?.durationMinutes) {
          estimatedPickupMinutes = pickupMetrics.durationMinutes;
        }
      }

      if (!Number.isFinite(bookingRequest.distanceKm)) {
        const tripMetrics = await getRouteMetrics({
          origin: bookingRequest.pickupLocation,
          destination: bookingRequest.dropoffLocation
        });
        if (tripMetrics?.distanceKm) {
          distanceKm = tripMetrics.distanceKm;
        }
      }
    } catch (error) {
      console.warn("Maps lookup failed, using defaults.", error.message);
    }
    const fare = calculateFare({
      distanceKm,
      rideDate: bookingRequest.rideDate,
      passengers: bookingRequest.passengers,
      waitingMinutes: bookingRequest.waitingMinutes,
      pricingOverrides: settings
    });

    const bookingId = await createBooking({
      customerNumber: from,
      customerName: profileName,
      pickupLocation: bookingRequest.pickupLocation,
      dropoffLocation: bookingRequest.dropoffLocation,
      rideDateTime: bookingRequest.rideDate.toISOString(),
      passengers: bookingRequest.passengers,
      waitingMinutes: bookingRequest.waitingMinutes,
      distanceKm,
      estimatedPickupMinutes,
      fareAmount: fare.total,
      currency: fare.currency,
      status: "pending"
    });

    twiml.message(`${formatFareSummary(fare)} Estimated pickup in ${estimatedPickupMinutes} minutes. Waiting for driver approval.`);

    if (driverNumber) {
      const booking = await getBookingById(bookingId);
      await sendWhatsAppMessage(driverNumber, driverBookingTemplate(booking, fare));
    }

    return res.type("text/xml").send(twiml.toString());
  } catch (error) {
    console.error(error);
    twiml.message("Sorry, something went wrong. Please try again in a moment.");
    return res.type("text/xml").send(twiml.toString());
  }
});

app.get("/bookings", async (req, res) => {
  const bookings = await listBookings(req.query.status);
  res.json(bookings);
});

app.get("/admin", (req, res) => {
  res.type("text/html").send(adminPageHtml());
});

app.get("/", (req, res) => {
  res.type("text/html").send(`<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Taxi Booking Server</title>
      <style>
        body { font-family: "Work Sans", "Segoe UI", sans-serif; background: #f6f4ef; color: #1b1b1b; padding: 40px; }
        .card { background: white; padding: 24px; border-radius: 16px; box-shadow: 0 12px 40px rgba(27,27,27,0.08); max-width: 520px; }
        a { color: #f05a28; font-weight: 600; text-decoration: none; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Taxi Booking Server</h1>
        <p>Status: running (Mauritius)</p>
        <p><a href="/admin">Open Admin UI</a></p>
        <p><a href="/book">Open Booking Form</a></p>
        <p><a href="/settings">Pricing Settings (Mauritius)</a></p>
      </div>
    </body>
  </html>`);
});

app.get("/book", (req, res) => {
  getSettings()
    .then((settings) => res.type("text/html").send(bookingPageHtml({ maxPassengers: settings.maxPassengers })))
    .catch(() => res.type("text/html").send(bookingPageHtml({ maxPassengers: 4 })));
});

app.post("/book/submit", async (req, res) => {
  try {
    const settings = await getSettings();
    const name = String(req.body.name || "").trim();
    const phone = String(req.body.phone || "").trim();
    const pickupLocation = String(req.body.pickup || "").trim();
    const dropoffLocation = String(req.body.dropoff || "").trim();
    const date = String(req.body.date || "").trim();
    const time = String(req.body.time || "").trim();
    const passengers = Number(req.body.passengers || 0);
    const waitingMinutes = Number(req.body.waiting || 0);
    const distanceInput = Number(req.body.distance || 0);
    const pickupLat = Number(req.body.pickup_lat || 0);
    const pickupLng = Number(req.body.pickup_lng || 0);
    const dropoffLat = Number(req.body.dropoff_lat || 0);
    const dropoffLng = Number(req.body.dropoff_lng || 0);
    const waitingReturn = req.body.waiting_return ? true : false;

    const hasPickupCoords = Number.isFinite(pickupLat) && pickupLat !== 0 && Number.isFinite(pickupLng) && pickupLng !== 0;
    const hasDropoffCoords = Number.isFinite(dropoffLat) && dropoffLat !== 0 && Number.isFinite(dropoffLng) && dropoffLng !== 0;
    if (!name || !phone || (!pickupLocation && !hasPickupCoords) || (!dropoffLocation && !hasDropoffCoords) || !date || !time || !passengers) {
      return res.status(400).type("text/html").send(bookingErrorHtml("Please fill in all required fields or use GPS for pickup/dropoff."));
    }

    if (passengers > settings.maxPassengers) {
      return res.status(400).type("text/html").send(bookingErrorHtml(`Maximum passengers is ${settings.maxPassengers}.`));
    }

    const rideDate = new Date(`${date} ${time}`);
    if (Number.isNaN(rideDate.getTime())) {
      return res.status(400).type("text/html").send(bookingErrorHtml("Invalid date or time."));
    }

    let distanceKm = Number.isFinite(distanceInput) && distanceInput > 0
      ? distanceInput
      : Number(process.env.DEFAULT_TRIP_DISTANCE_KM || 5);
    let distanceLocked = false;

    let estimatedPickupMinutes = estimatePickupMinutes({ driverDistanceKm: Number(process.env.DEFAULT_PICKUP_DISTANCE_KM || 5) });

    const pickupDestination = Number.isFinite(pickupLat) && pickupLat !== 0 && Number.isFinite(pickupLng) && pickupLng !== 0
      ? `${pickupLat},${pickupLng}`
      : pickupLocation;
    const dropoffDestination = Number.isFinite(dropoffLat) && dropoffLat !== 0 && Number.isFinite(dropoffLng) && dropoffLng !== 0
      ? `${dropoffLat},${dropoffLng}`
      : dropoffLocation;

    if (
      (!Number.isFinite(distanceInput) || distanceInput <= 0) &&
      Number.isFinite(pickupLat) && pickupLat !== 0 &&
      Number.isFinite(pickupLng) && pickupLng !== 0 &&
      Number.isFinite(dropoffLat) && dropoffLat !== 0 &&
      Number.isFinite(dropoffLng) && dropoffLng !== 0
    ) {
      const route = await getOptimalRoute({ pickupLat, pickupLng, dropoffLat, dropoffLng });
      distanceKm = route?.distanceKm || haversineKm(pickupLat, pickupLng, dropoffLat, dropoffLng);
      distanceLocked = true;
    }

    try {
      const driverOrigin = process.env.DEFAULT_DRIVER_ORIGIN;
      if (driverOrigin) {
        const pickupMetrics = await getRouteMetrics({
          origin: driverOrigin,
          destination: pickupDestination,
          departureTime: Math.floor(Date.now() / 1000)
        });
        if (pickupMetrics?.durationMinutes) {
          estimatedPickupMinutes = pickupMetrics.durationMinutes;
        }
      }

      if (!distanceLocked && (!Number.isFinite(distanceInput) || distanceInput <= 0)) {
        const tripMetrics = await getRouteMetrics({
          origin: pickupDestination,
          destination: dropoffDestination
        });
        if (tripMetrics?.distanceKm) {
          distanceKm = tripMetrics.distanceKm;
        }
      }
    } catch (error) {
      console.warn("Maps lookup failed for booking form, using defaults.", error.message);
    }

    if (!estimatedPickupMinutes) {
      const driverOrigin = process.env.DEFAULT_DRIVER_ORIGIN;
      if (driverOrigin && pickupDestination.includes(",")) {
        const [originLat, originLng] = driverOrigin.split(",").map(Number);
        const [destLat, destLng] = pickupDestination.split(",").map(Number);
        const pickupRoute = await getOptimalRoute({
          pickupLat: originLat,
          pickupLng: originLng,
          dropoffLat: destLat,
          dropoffLng: destLng
        });
        if (pickupRoute?.durationMinutes) {
          estimatedPickupMinutes = pickupRoute.durationMinutes;
        }
      }
    }

    const pricedDistanceKm = waitingReturn ? distanceKm * settings.returnTripMultiplier : distanceKm;
    const fare = calculateFare({
      distanceKm: pricedDistanceKm,
      rideDate,
      passengers,
      waitingMinutes,
      pricingOverrides: settings
    });

    let pickupLabel = pickupLocation || `GPS (${pickupLat.toFixed(5)}, ${pickupLng.toFixed(5)})`;
    let dropoffLabel = dropoffLocation || `GPS (${dropoffLat.toFixed(5)}, ${dropoffLng.toFixed(5)})`;
    try {
      const [pickupAddress, dropoffAddress] = await Promise.all([
        reverseGeocode(pickupLat, pickupLng),
        reverseGeocode(dropoffLat, dropoffLng)
      ]);
      if (pickupAddress) pickupLabel = pickupAddress;
      if (dropoffAddress) dropoffLabel = dropoffAddress;
    } catch (error) {
      console.warn("Reverse geocode failed, using GPS labels.");
    }

    const bookingId = await createBooking({
      customerNumber: phone,
      customerName: name,
      pickupLocation: pickupLabel,
      pickupLat: Number.isFinite(pickupLat) && pickupLat !== 0 ? pickupLat : null,
      pickupLng: Number.isFinite(pickupLng) && pickupLng !== 0 ? pickupLng : null,
      dropoffLocation: dropoffLabel,
      dropoffLat: Number.isFinite(dropoffLat) && dropoffLat !== 0 ? dropoffLat : null,
      dropoffLng: Number.isFinite(dropoffLng) && dropoffLng !== 0 ? dropoffLng : null,
      waitingReturn,
      rideDateTime: rideDate.toISOString(),
      passengers,
      waitingMinutes,
      distanceKm: pricedDistanceKm,
      estimatedPickupMinutes,
      fareAmount: fare.total,
      currency: fare.currency,
      status: "pending"
    });

    const driverNumber = normalizeNumber(process.env.DRIVER_WHATSAPP_NUMBER || "");
    if (driverNumber) {
      const booking = await getBookingById(bookingId);
      await sendWhatsAppMessage(driverNumber, driverBookingTemplate(booking, fare));
    }

    return res.type("text/html").send(bookingResultHtml({
      bookingId,
      fare,
      pickupMinutes: estimatedPickupMinutes,
      arrivalTimeIso: estimatedPickupMinutes ? new Date(Date.now() + estimatedPickupMinutes * 60000).toISOString() : null
    }));
  } catch (error) {
    console.error(error);
    return res.status(500).type("text/html").send(bookingErrorHtml("Something went wrong. Please try again."));
  }
});

app.get("/api/bookings", async (req, res) => {
  const bookings = await listBookings(req.query.status);
  res.json(bookings);
});

app.post("/api/route", async (req, res) => {
  try {
    const settings = await getSettings();
    const pickupLat = Number(req.body.pickup_lat || 0);
    const pickupLng = Number(req.body.pickup_lng || 0);
    const dropoffLat = Number(req.body.dropoff_lat || 0);
    const dropoffLng = Number(req.body.dropoff_lng || 0);
    const passengers = Number(req.body.passengers || 0);
    const waitingMinutes = Number(req.body.waiting || 0);
    const waitingReturn = req.body.waiting_return ? true : false;
    const date = String(req.body.date || "").trim();
    const time = String(req.body.time || "").trim();

    if (!pickupLat || !pickupLng || !dropoffLat || !dropoffLng) {
      return res.json({ ok: false });
    }
    if (passengers > settings.maxPassengers) {
      return res.json({ ok: false, error: "max_passengers" });
    }

    const rideDate = date && time ? new Date(`${date} ${time}`) : new Date();
    let route = await getOptimalRoute({ pickupLat, pickupLng, dropoffLat, dropoffLng });
    let distanceKm = route?.distanceKm || haversineKm(pickupLat, pickupLng, dropoffLat, dropoffLng);
    let travelMinutes = route?.durationMinutes || null;

    const pickupCoords = `${pickupLat},${pickupLng}`;
    const dropoffCoords = `${dropoffLat},${dropoffLng}`;
    const travelMetrics = await getRouteMetrics({
      origin: pickupCoords,
      destination: dropoffCoords,
      departureTime: Math.floor(Date.now() / 1000)
    });
    if (travelMetrics?.distanceKm) distanceKm = travelMetrics.distanceKm;
    if (travelMetrics?.durationMinutes) travelMinutes = travelMetrics.durationMinutes;

    const liveDriver = await getDriverLocation();
    const driverOrigin = liveDriver?.lat && liveDriver?.lng
      ? `${liveDriver.lat},${liveDriver.lng}`
      : process.env.DEFAULT_DRIVER_ORIGIN;
    let pickupEtaMinutes = null;
    if (driverOrigin) {
      const pickupMetrics = await getRouteMetrics({
        origin: driverOrigin,
        destination: pickupCoords,
        departureTime: Math.floor(Date.now() / 1000)
      });
      if (pickupMetrics?.durationMinutes) {
        pickupEtaMinutes = pickupMetrics.durationMinutes;
      } else if (route?.durationMinutes) {
        const [originLat, originLng] = driverOrigin.split(",").map(Number);
        const pickupRoute = await getOptimalRoute({
          pickupLat: originLat,
          pickupLng: originLng,
          dropoffLat: pickupLat,
          dropoffLng: pickupLng
        });
        pickupEtaMinutes = pickupRoute?.durationMinutes || null;
      }
    }

    const arrivalTime = pickupEtaMinutes ? new Date(Date.now() + pickupEtaMinutes * 60000) : null;
    const pricedDistanceKm = waitingReturn ? distanceKm * settings.returnTripMultiplier : distanceKm;
    const nightApplied = isNightTime(rideDate);
    const perKmApplied = nightApplied
      ? settings.perKm * (1 + settings.nightSurchargePercent / 100)
      : settings.perKm;
    const fare = calculateFare({
      distanceKm: pricedDistanceKm,
      rideDate,
      passengers,
      waitingMinutes,
      pricingOverrides: settings
    });

    let pickupAddress = null;
    let dropoffAddress = null;
    try {
      [pickupAddress, dropoffAddress] = await Promise.all([
        reverseGeocode(pickupLat, pickupLng),
        reverseGeocode(dropoffLat, dropoffLng)
      ]);
    } catch (error) {
      pickupAddress = null;
      dropoffAddress = null;
    }

    return res.json({
      ok: true,
      distanceKm,
      total: fare.total,
      currency: fare.currency,
      geometry: route?.geometry || null,
      travelMinutes,
      pickupEtaMinutes,
      arrivalTimeIso: arrivalTime ? arrivalTime.toISOString() : null,
      baseFare: fare.base,
      waitingMinutes,
      passengers,
      perKmApplied,
      perKmLabel: nightApplied ? "Night rate" : "Standard rate",
      pickupAddress,
      dropoffAddress
    });
  } catch (error) {
    return res.json({ ok: false });
  }
});

app.get("/settings", async (req, res) => {
  const settings = await getSettings();
  const saved = req.query.saved === "1";
  res.type("text/html").send(`<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Pricing Settings</title>
      <style>
        body { font-family: "Work Sans", "Segoe UI", sans-serif; background: #f6f4ef; color: #1b1b1b; padding: 32px; }
        .card { background: white; padding: 24px; border-radius: 16px; box-shadow: 0 12px 40px rgba(27,27,27,0.08); max-width: 640px; margin: 0 auto; }
        label { display: block; margin-top: 12px; font-weight: 600; }
        input { width: 100%; padding: 10px 12px; margin-top: 6px; border-radius: 10px; border: 1px solid #dedbd2; font-size: 14px; }
        button { margin-top: 18px; padding: 12px 18px; border-radius: 999px; border: none; background: #1f2a44; color: white; font-weight: 700; cursor: pointer; }
        .pill { display: inline-flex; padding: 6px 12px; border-radius: 999px; background: #e6f4ea; color: #1f7a3f; font-weight: 600; font-size: 12px; }
        a { color: #f05a28; font-weight: 600; text-decoration: none; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Pricing Settings (Mauritius)</h1>
        ${saved ? '<p class="pill">Saved successfully</p>' : ''}
        <p><a href="/">Back to Home</a></p>
        <form method="post" action="/settings">
          <label>Currency</label>
          <input name="currency" value="${settings.currency}" required />

          <label>Per KM Price (MUR)</label>
          <input name="perKm" type="number" step="0.1" value="${settings.perKm}" required />

          <label>Extra Passenger Percent (per passenger)</label>
          <input name="extraPassengerPercent" type="number" step="0.1" value="${settings.extraPassengerPercent}" required />

          <label>Waiting Price Per Minute (MUR)</label>
          <input name="waitingPerMinute" type="number" step="0.1" value="${settings.waitingPerMinute}" required />

          <label>Return Trip Multiplier</label>
          <input name="returnTripMultiplier" type="number" step="0.1" value="${settings.returnTripMultiplier}" required />

          <label>Night (8pm - 6am) Per-KM Increase (%)</label>
          <input name="nightSurchargePercent" type="number" step="0.1" value="${settings.nightSurchargePercent}" required />

          <label>Max Passengers</label>
          <input name="maxPassengers" type="number" min="1" max="4" value="${settings.maxPassengers}" required />

          <button type="submit">Save Settings</button>
        </form>
      </div>
    </body>
  </html>`);
});

app.post("/settings", async (req, res) => {
  await updateSettings({
    currency: String(req.body.currency || "MUR").trim(),
    perKm: Number(req.body.perKm || 0),
    extraPassengerPercent: Number(req.body.extraPassengerPercent || 0),
    waitingPerMinute: Number(req.body.waitingPerMinute || 0),
    returnTripMultiplier: Number(req.body.returnTripMultiplier || 2),
    nightSurchargePercent: Number(req.body.nightSurchargePercent || 0),
    maxPassengers: Math.min(4, Number(req.body.maxPassengers || 4))
  });
  res.redirect("/settings?saved=1");
});

app.post("/api/bookings/test", async (req, res) => {
  const settings = await getSettings();
  const testPickup = process.env.TEST_PICKUP || "123 Main St";
  const testDropoff = process.env.TEST_DROPOFF || "500 Market St";
  const rideDate = new Date(Date.now() + 60 * 60 * 1000);
  const passengers = Number(process.env.TEST_PASSENGERS || 2);
  const waitingMinutes = Number(process.env.TEST_WAITING_MINUTES || 0);
  const distanceKm = Number(process.env.DEFAULT_TRIP_DISTANCE_KM || 5);
  const estimatedPickupMinutes = estimatePickupMinutes({ driverDistanceKm: Number(process.env.DEFAULT_PICKUP_DISTANCE_KM || 5) });

  const fare = calculateFare({
    distanceKm,
    rideDate,
    passengers,
    waitingMinutes,
    pricingOverrides: settings
  });

  const bookingId = await createBooking({
    customerNumber: process.env.TEST_CUSTOMER_NUMBER || "+15550001111",
    customerName: "Test Customer",
    pickupLocation: testPickup,
    dropoffLocation: testDropoff,
    rideDateTime: rideDate.toISOString(),
    passengers,
    waitingMinutes,
    distanceKm,
    estimatedPickupMinutes,
    fareAmount: fare.total,
    currency: fare.currency,
    status: "pending"
  });

  res.json({ ok: true, id: bookingId });
});

app.post("/api/bookings/:id/accept", async (req, res) => {
  const bookingId = Number(req.params.id);
  const result = await applyDriverDecision(bookingId, "accept");
  if (!result.ok) return res.status(404).json({ error: result.error });
  return res.json({ ok: true });
});

app.post("/api/bookings/:id/decline", async (req, res) => {
  const bookingId = Number(req.params.id);
  const result = await applyDriverDecision(bookingId, "decline");
  if (!result.ok) return res.status(404).json({ error: result.error });
  return res.json({ ok: true });
});

app.post("/driver/location", async (req, res) => {
  const { lat, lng } = req.body;
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
    return res.status(400).json({ error: "lat and lng required" });
  }
  await setDriverLocation(Number(lat), Number(lng));
  return res.json({ ok: true });
});

app.get("/api/driver/location", async (req, res) => {
  const location = await getDriverLocation();
  if (!location || !location.lat || !location.lng) {
    return res.json({ ok: false });
  }
  return res.json({ ok: true, ...location });
});

app.get("/api/driver/eta/:id", async (req, res) => {
  const bookingId = Number(req.params.id);
  const booking = await getBookingById(bookingId);
  if (!booking) return res.json({ ok: false });

  const pickupLat = booking.pickup_lat;
  const pickupLng = booking.pickup_lng;
  if (!pickupLat || !pickupLng) return res.json({ ok: false });

  const driverLocation = await getDriverLocation();
  const driverOrigin = driverLocation?.lat && driverLocation?.lng
    ? `${driverLocation.lat},${driverLocation.lng}`
    : process.env.DEFAULT_DRIVER_ORIGIN;

  if (!driverOrigin) return res.json({ ok: false });

  const pickupDestination = `${pickupLat},${pickupLng}`;
  try {
    const pickupMetrics = await getRouteMetrics({
      origin: driverOrigin,
      destination: pickupDestination,
      departureTime: Math.floor(Date.now() / 1000)
    });
    let etaMinutes = pickupMetrics?.durationMinutes || null;
    if (!etaMinutes) {
      const [originLat, originLng] = driverOrigin.split(",").map(Number);
      const route = await getOptimalRoute({
        pickupLat: originLat,
        pickupLng: originLng,
        dropoffLat: pickupLat,
        dropoffLng: pickupLng
      });
      etaMinutes = route?.durationMinutes || null;
    }
    const arrivalTimeIso = etaMinutes ? new Date(Date.now() + etaMinutes * 60000).toISOString() : null;
    return res.json({ ok: true, etaMinutes, arrivalTimeIso });
  } catch (error) {
    return res.json({ ok: false });
  }
});

app.get("/track/:id", async (req, res) => {
  const bookingId = Number(req.params.id);
  const booking = await getBookingById(bookingId);
  if (!booking) {
    return res.status(404).type("text/html").send("<h1>Booking not found</h1>");
  }
  res.type("text/html").send(`<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Track Driver</title>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <style>
        body { font-family: "Work Sans", "Segoe UI", sans-serif; background: #f6f4ef; color: #1b1b1b; padding: 32px; }
        .card { background: white; padding: 24px; border-radius: 16px; box-shadow: 0 12px 40px rgba(27,27,27,0.08); max-width: 720px; margin: 0 auto; }
        #trackMap { height: 360px; border-radius: 12px; border: 1px solid #dedbd2; margin-top: 12px; }
        .pill { display: inline-flex; padding: 6px 12px; border-radius: 999px; background: #fdf3ee; color: #b34622; font-weight: 600; font-size: 12px; margin-top: 8px; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Track Your Driver</h1>
        <p>Booking #${bookingId} (${booking.status})</p>
        <div id="trackMap"></div>
        <div class="pill" id="status">Waiting for driver location...</div>
        <div class="pill" id="eta">ETA: --</div>
      </div>
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <script>
        const map = L.map('trackMap').setView([-20.3484, 57.5522], 11);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);
        const carIcon = L.icon({
          iconUrl: 'data:image/svg+xml;utf8,${encodeURIComponent(
            '<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\"><path fill=\"#1f2a44\" d=\"M6 38v-8l6-12a6 6 0 0 1 5-3h30a6 6 0 0 1 5 3l6 12v8a4 4 0 0 1-4 4h-2a6 6 0 0 1-12 0H24a6 6 0 0 1-12 0H10a4 4 0 0 1-4-4z\"/><circle cx=\"20\" cy=\"42\" r=\"5\" fill=\"#f05a28\"/><circle cx=\"44\" cy=\"42\" r=\"5\" fill=\"#f05a28\"/></svg>'
          )}',
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        });
        let driverMarker = null;
        let pickupMarker = null;
        const statusEl = document.getElementById('status');
        const etaEl = document.getElementById('eta');
        const pickupLat = ${booking.pickup_lat || "null"};
        const pickupLng = ${booking.pickup_lng || "null"};

        if (pickupLat && pickupLng) {
          pickupMarker = L.marker([pickupLat, pickupLng]).addTo(map).bindPopup('Pickup').openPopup();
          map.setView([pickupLat, pickupLng], 13);
        }

        async function refreshLocation() {
          const res = await fetch('/api/driver/location');
          const data = await res.json();
          if (!data.ok) {
            statusEl.textContent = 'Driver location not available yet';
            return;
          }
          statusEl.textContent = 'Driver is on the way';
          const latlng = [data.lat, data.lng];
          if (!driverMarker) {
            driverMarker = L.marker(latlng, { icon: carIcon }).addTo(map).bindPopup('Driver').openPopup();
            if (!pickupMarker) {
              map.setView(latlng, 13);
            }
          } else {
            driverMarker.setLatLng(latlng);
          }
        }

        async function refreshEta() {
          const res = await fetch('/api/driver/eta/${bookingId}');
          const data = await res.json();
          if (!data.ok || !data.etaMinutes) {
            etaEl.textContent = 'ETA: --';
            return;
          }
          const arrive = data.arrivalTimeIso ? new Date(data.arrivalTimeIso).toLocaleTimeString() : '';
          etaEl.textContent = 'ETA: ' + data.etaMinutes + ' min' + (arrive ? ' (Arrive ' + arrive + ')' : '');
        }

        refreshLocation();
        refreshEta();
        setInterval(refreshLocation, 5000);
        setInterval(refreshEta, 5000);
      </script>
    </body>
  </html>`);
});

app.listen(port, host, () => {
  console.log(`Server listening on http://${host}:${port}`);
});
