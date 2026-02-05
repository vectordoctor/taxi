require("dotenv").config();
const express = require("express");
const twilio = require("twilio");
const session = require("express-session");
const { parseBookingMessage } = require("./utils/messageParser");
const { calculateFare } = require("./services/fare");
const { estimatePickupMinutes } = require("./services/pickupEstimate");
const { getRouteMetrics } = require("./services/maps");
const { getSettings, updateSettings } = require("./services/settings");
const { haversineKm } = require("./services/distance");
const { getOptimalRoute } = require("./services/route");
const { reverseGeocode } = require("./services/geocode");
const { ensureSystemUsers, findUserByEmail, findUserById, createUser, verifyPassword } = require("./services/auth");
const {
  createBooking,
  updateBookingStatus,
  getBookingById,
  listBookings,
  listBookingsByPhone,
  listBookingsByCustomerId,
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
app.use(session({
  secret: process.env.SESSION_SECRET || "dev_secret_change_me",
  resave: false,
  saveUninitialized: false
}));

ensureSystemUsers().catch((error) => {
  console.warn("Failed to ensure system users.", error.message);
});

app.use(async (req, res, next) => {
  if (req.session.userId && !req.user) {
    req.user = await findUserById(req.session.userId);
  }
  return next();
});

function normalizeNumber(value) {
  if (!value) return "";
  return value.replace(/^whatsapp:/, "");
}

const AUTH_DISABLED = true;

async function requireAuth(req, res, next) {
  if (AUTH_DISABLED) return next();
  if (!req.session.userId) {
    return res.redirect("/login");
  }
  req.user = await findUserById(req.session.userId);
  if (!req.user) {
    req.session.destroy(() => {});
    return res.redirect("/login");
  }
  return next();
}

function requireRole(role) {
  return async (req, res, next) => {
    if (AUTH_DISABLED) return next();
    if (!req.session.userId) return res.redirect("/login");
    const user = await findUserById(req.session.userId);
    if (!user || user.role !== role) {
      return res.status(403).type("text/html").send("<h1>Access denied</h1>");
    }
    req.user = user;
    return next();
  };
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

function timeToMinutes(hhmm) {
  const [hh, mm] = String(hhmm).split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

function isWithinUnavailableWindow(date, startStr, endStr) {
  const startMin = timeToMinutes(startStr);
  const endMin = timeToMinutes(endStr);
  if (startMin === null || endMin === null) return false;
  const currentMin = date.getHours() * 60 + date.getMinutes();
  if (startMin <= endMin) {
    return currentMin >= startMin && currentMin < endMin;
  }
  return currentMin >= startMin || currentMin < endMin;
}

function estimateDurationMinutes(distanceKm, avgSpeedKmh) {
  if (!distanceKm || !avgSpeedKmh) return null;
  return Math.max(5, Math.round((distanceKm / avgSpeedKmh) * 60));
}

function formatRange(start, end) {
  return `${start.toLocaleString()} - ${end.toLocaleString()}`;
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
    if (settings.unavailableMode || isWithinUnavailableWindow(bookingRequest.rideDate, settings.unavailableStart, settings.unavailableEnd)) {
      twiml.message(`Sorry, the driver is unavailable between ${settings.unavailableStart} and ${settings.unavailableEnd}. Please choose another time.`);
      return res.type("text/xml").send(twiml.toString());
    }
    if (bookingRequest.passengers > settings.maxPassengers) {
      twiml.message(`Sorry, maximum passengers is ${settings.maxPassengers}. Please adjust and resend.`);
      return res.type("text/xml").send(twiml.toString());
    }

    let distanceKm = Number.isFinite(bookingRequest.distanceKm)
      ? bookingRequest.distanceKm
      : Number(process.env.DEFAULT_TRIP_DISTANCE_KM || 5);

    let estimatedPickupMinutes = estimatePickupMinutes({ driverDistanceKm: bookingRequest.driverDistanceKm });
    let travelMinutes = null;

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
        if (tripMetrics?.durationMinutes) {
          travelMinutes = tripMetrics.durationMinutes;
        }
      }
    } catch (error) {
      console.warn("Maps lookup failed, using defaults.", error.message);
    }

    if (!travelMinutes) {
      travelMinutes = estimateDurationMinutes(distanceKm, Number(process.env.AVG_SPEED_KMH || 25));
    }
    const rideEndDateTime = new Date(bookingRequest.rideDate.getTime() + ((travelMinutes || 0) + bookingRequest.waitingMinutes) * 60000);

    const acceptedBookings = await listBookings("accepted");
    const requestedStart = bookingRequest.rideDate;
    const requestedEnd = rideEndDateTime;
    const conflict = acceptedBookings.find((b) => {
      if (!b.ride_end_datetime) return false;
      const start = new Date(b.ride_datetime);
      const end = new Date(b.ride_end_datetime);
      return requestedStart < end && requestedEnd > start;
    });
    if (conflict) {
      const start = new Date(conflict.ride_datetime);
      const end = new Date(conflict.ride_end_datetime);
      twiml.message(`Sorry, that time is not available. Already accepted ${formatRange(start, end)}.`);
      return res.type("text/xml").send(twiml.toString());
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
      rideDurationMinutes: travelMinutes,
      rideEndDateTime: rideEndDateTime.toISOString(),
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

app.get("/api/bookings", async (req, res) => {
  if (req.query.phone) {
    const bookings = await listBookingsByPhone(String(req.query.phone));
    return res.json(bookings);
  }
  const bookings = await listBookings(req.query.status);
  return res.json(bookings);
});

app.get("/api/bookings/:id", async (req, res) => {
  const bookingId = Number(req.params.id);
  const booking = await getBookingById(bookingId);
  if (!booking) return res.status(404).json({ ok: false });
  return res.json({ ok: true, booking });
});

app.get("/admin", (req, res) => {
  res.redirect("/super-admin");
});

app.get("/super-admin", requireRole("admin"), async (req, res) => {
  const settings = await getSettings();
  res.type("text/html").send(adminPageHtml(settings));
});

app.get("/", (req, res) => {
  res.type("text/html").send(`<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Taxi Booking Server</title>
  <style>
    :root {
      --bg: #1f1f1f;
      --surface: #ffffff;
      --text: #f5f5f5;
          --muted: #b9b9b9;
          --accent: #ffcc00;
          --accent-ink: #1a1a1a;
          --shadow: 0 18px 40px rgba(0,0,0,0.35);
      font-family: "Space Grotesk", "Work Sans", "Segoe UI", sans-serif;
    }
        body { margin: 0; background: var(--bg); color: var(--text); padding: 24px 18px 40px; }
        main { max-width: 900px; margin: 0 auto; }
        h1 { font-family: "Barlow Condensed", "Space Grotesk", sans-serif; font-style: italic; font-weight: 800; letter-spacing: 0.04em; }
        .card { background: var(--surface); color: #1b1b1b; padding: 18px; border-radius: 16px; box-shadow: var(--shadow); margin-top: 18px; }
        a { color: var(--accent); font-weight: 700; text-decoration: none; }
        .cta { display: inline-flex; padding: 12px 18px; border-radius: 999px; background: var(--accent); color: var(--accent-ink); font-weight: 800; text-decoration: none; }
        .row { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-top: 14px; }
      </style>
      <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,600;0,700;1,700;1,800&family=Space+Grotesk:wght@400;600;700;800&display=swap" rel="stylesheet">
    </head>
    <body>
      <main>
        <h1>Taxi Booking</h1>
        <p>Status: running (Mauritius)</p>
        <div class="card">
          <div class="row">
            <a class="cta" href="/book">Book a Ride</a>
            <a class="cta" href="/my-rides">My Rides</a>
            <a class="cta" href="/driver-mode">Driver Mode</a>
            <a class="cta" href="/super-admin">Super Admin</a>
          </div>
        </div>
      </main>
    </body>
  </html>`);
});

app.get("/my-rides", (req, res) => {
  res.type("text/html").send(`<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>My Rides</title>
      <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,600;0,700;1,700;1,800&family=Space+Grotesk:wght@400;600;700;800&display=swap" rel="stylesheet">
      <style>
        :root {
          --bg: #1f1f1f;
          --surface: #ffffff;
          --text: #f5f5f5;
          --accent: #ffcc00;
          --accent-ink: #1a1a1a;
          --shadow: 0 18px 40px rgba(0,0,0,0.35);
          font-family: "Space Grotesk", "Work Sans", "Segoe UI", sans-serif;
        }
        body { font-family: inherit; background: var(--bg); color: var(--text); margin: 0; padding: 20px; }
        main { max-width: 860px; margin: 0 auto; }
        h1 { font-family: "Barlow Condensed", "Space Grotesk", sans-serif; font-style: italic; font-weight: 800; letter-spacing: 0.04em; margin: 0; }
        .home-link { background: var(--accent); color: var(--accent-ink); padding: 10px 16px; border-radius: 999px; text-decoration: none; font-weight: 800; }
        .card { background: var(--surface); color: #1b1b1b; padding: 18px; border-radius: 16px; box-shadow: var(--shadow); margin-top: 16px; }
        label { display: block; margin-top: 12px; font-weight: 700; color: #1b1b1b; }
        input { width: 100%; padding: 12px 14px; border-radius: 12px; border: 1px solid #e0e0e0; font-size: 16px; margin-top: 6px; }
        button { margin-top: 12px; padding: 12px 18px; border-radius: 999px; border: none; background: var(--accent); color: var(--accent-ink); font-weight: 800; cursor: pointer; width: 100%; }
        table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 12px; overflow: hidden; }
        th, td { padding: 10px 12px; border-bottom: 1px solid #eceae4; text-align: left; font-size: 14px; }
        th { text-transform: uppercase; font-size: 12px; letter-spacing: 0.08em; background: #f5f5f5; }
        a { color: #1b1b1b; font-weight: 700; text-decoration: none; }
        .muted { color: #6b6b6b; font-size: 13px; }
      </style>
    </head>
    <body>
      <main>
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
          <h1>My Rides</h1>
          <a class="home-link" href="/">Home</a>
        </div>
        <div class="card">
          <label>Enter your phone number</label>
          <input id="phone" placeholder="+230..." />
          <button id="load">Load My Rides</button>
          <p class="muted">We will show your accepted rides and tracking links.</p>
        </div>
        <div class="card">
          <div id="results" class="muted">No rides loaded yet.</div>
        </div>
      </main>
      <script>
        const phoneInput = document.getElementById('phone');
        const loadBtn = document.getElementById('load');
        const results = document.getElementById('results');

        async function loadRides() {
          const phone = phoneInput.value.trim();
          if (!phone) {
            results.textContent = 'Please enter your phone number.';
            return;
          }
          const res = await fetch('/api/bookings?phone=' + encodeURIComponent(phone));
          const data = await res.json();
          const accepted = data.filter(b => b.status === 'accepted');
          if (!accepted.length) {
            results.textContent = 'No accepted rides found.';
            return;
          }
          results.innerHTML = '<table><thead><tr><th>ID</th><th>Date/Time</th><th>Route</th><th>Track</th></tr></thead><tbody>' +
            accepted.map(b => '<tr>' +
              '<td>#' + b.id + '</td>' +
              '<td>' + new Date(b.ride_datetime).toLocaleString() + '</td>' +
              '<td>' + b.pickup_location + ' → ' + b.dropoff_location + '</td>' +
              '<td><a href="/track/' + b.id + '">Track driver</a></td>' +
            '</tr>').join('') +
          '</tbody></table>';
        }
        loadBtn.addEventListener('click', loadRides);
      </script>
    </body>
  </html>`);
});

app.get("/book", requireAuth, (req, res) => {
  getSettings()
    .then((settings) => res.type("text/html").send(bookingPageHtml({ maxPassengers: settings.maxPassengers })))
    .catch(() => res.type("text/html").send(bookingPageHtml({ maxPassengers: 4 })));
});

app.get("/signup", (req, res) => {
  res.status(503).type("text/html").send("<p>Signup is temporarily paused.</p>");
});

app.post("/signup", (req, res) => {
  res.status(503).type("text/html").send("<p>Signup is temporarily paused.</p>");
});

app.get("/login", (req, res) => {
  res.status(503).type("text/html").send("<p>Login is temporarily paused.</p>");
});

app.post("/login", (req, res) => {
  res.status(503).type("text/html").send("<p>Login is temporarily paused.</p>");
});

app.get("/logout", (req, res) => {
  res.redirect("/");
});

app.post("/book/submit", requireAuth, async (req, res) => {
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

    if (settings.unavailableMode || isWithinUnavailableWindow(new Date(`${date} ${time}`), settings.unavailableStart, settings.unavailableEnd)) {
      return res.status(400).type("text/html").send(bookingErrorHtml(`Driver is unavailable between ${settings.unavailableStart} and ${settings.unavailableEnd}. Please choose another time.`));
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
    let travelMinutes = null;

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
        if (tripMetrics?.durationMinutes) {
          travelMinutes = tripMetrics.durationMinutes;
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
    if (!travelMinutes) {
      travelMinutes = estimateDurationMinutes(distanceKm, Number(process.env.AVG_SPEED_KMH || 25));
    }

    const totalDuration = (travelMinutes || 0) + (waitingReturn ? Number(waitingMinutes || 0) : 0) + (waitingReturn ? (travelMinutes || 0) : 0);
    const rideEndDateTime = new Date(rideDate.getTime() + totalDuration * 60000);

    const acceptedBookings = await listBookings("accepted");
    const conflict = acceptedBookings.find((b) => {
      if (!b.ride_end_datetime) return false;
      const start = new Date(b.ride_datetime);
      const end = new Date(b.ride_end_datetime);
      return rideDate < end && rideEndDateTime > start;
    });
    if (conflict) {
      const start = new Date(conflict.ride_datetime);
      const end = new Date(conflict.ride_end_datetime);
      return res.status(400).type("text/html").send(bookingErrorHtml(`That time is not available. Already accepted ${formatRange(start, end)}.`));
    }

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
      customerId: req.user ? req.user.id : null,
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
      rideDurationMinutes: totalDuration,
      rideEndDateTime: rideEndDateTime.toISOString(),
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
      arrivalTimeIso: estimatedPickupMinutes ? new Date(Date.now() + estimatedPickupMinutes * 60000).toISOString() : null,
      phone
    }));
  } catch (error) {
    console.error(error);
    return res.status(500).type("text/html").send(bookingErrorHtml("Something went wrong. Please try again."));
  }
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
    let driverRoute = null;
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
      const [originLat, originLng] = driverOrigin.split(",").map(Number);
      driverRoute = await getOptimalRoute({
        pickupLat: originLat,
        pickupLng: originLng,
        dropoffLat: pickupLat,
        dropoffLng: pickupLng
      });
    }

    const arrivalTime = pickupEtaMinutes ? new Date(Date.now() + pickupEtaMinutes * 60000) : null;

    let driverAddress = null;
    if (liveDriver?.lat && liveDriver?.lng) {
      try {
        driverAddress = await reverseGeocode(liveDriver.lat, liveDriver.lng);
      } catch (error) {
        driverAddress = null;
      }
    }

    const now = new Date();
    const accepted = await listBookings("accepted");
    const currentRide = accepted.find((b) => b.ride_end_datetime && now >= new Date(b.ride_datetime) && now <= new Date(b.ride_end_datetime));
    const driverStatus = currentRide ? "currently_in_ride" : "available";
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
      dropoffAddress,
      driverLocation: liveDriver?.lat && liveDriver?.lng ? { lat: liveDriver.lat, lng: liveDriver.lng } : null,
      driverAddress,
      driverStatus,
      driverGeometry: driverRoute?.geometry || null
    });
  } catch (error) {
    return res.json({ ok: false });
  }
});

app.get("/settings", (req, res) => {
  res.redirect("/super-admin#settings");
});

app.post("/api/bookings/test", requireRole("admin"), async (req, res) => {
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

app.post("/api/bookings/:id/accept", requireRole("admin"), async (req, res) => {
  const bookingId = Number(req.params.id);
  const result = await applyDriverDecision(bookingId, "accept");
  if (!result.ok) return res.status(404).json({ error: result.error });
  return res.json({ ok: true });
});

app.post("/api/bookings/:id/decline", requireRole("admin"), async (req, res) => {
  const bookingId = Number(req.params.id);
  const result = await applyDriverDecision(bookingId, "decline");
  if (!result.ok) return res.status(404).json({ error: result.error });
  return res.json({ ok: true });
});

app.post("/api/driver/bookings/:id/accept", requireRole("driver"), async (req, res) => {
  const bookingId = Number(req.params.id);
  const result = await applyDriverDecision(bookingId, "accept");
  if (!result.ok) return res.status(404).json({ error: result.error });
  return res.json({ ok: true });
});

app.post("/api/driver/bookings/:id/decline", requireRole("driver"), async (req, res) => {
  const bookingId = Number(req.params.id);
  const result = await applyDriverDecision(bookingId, "decline");
  if (!result.ok) return res.status(404).json({ error: result.error });
  return res.json({ ok: true });
});

app.post("/driver/location", requireRole("driver"), async (req, res) => {
  const { lat, lng } = req.body;
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
    return res.status(400).json({ error: "lat and lng required" });
  }
  await setDriverLocation(Number(lat), Number(lng));
  return res.json({ ok: true });
});

app.get("/api/driver/location", async (req, res) => {
  const settings = await getSettings();
  const isAdmin = (req.user && req.user.role === "admin") || (AUTH_DISABLED && req.query.admin === "1");
  if (!isAdmin && settings.driverOnline === false) {
    return res.json({ ok: false });
  }
  const location = await getDriverLocation();
  if (!location || !location.lat || !location.lng) {
    return res.json({ ok: false });
  }
  let address = null;
  if (req.query.includeAddress === "1" || req.query.admin === "1") {
    try {
      address = await reverseGeocode(location.lat, location.lng);
    } catch (error) {
      address = null;
    }
  }
  return res.json({ ok: true, ...location, address });
});

app.get("/api/driver/active-booking", requireRole("driver"), async (req, res) => {
  const accepted = await listBookings("accepted");
  if (!accepted.length) return res.json({ ok: false });
  const now = new Date();
  const sorted = accepted.slice().sort((a, b) => new Date(a.ride_datetime) - new Date(b.ride_datetime));
  let current = sorted.find((b) => new Date(b.ride_datetime) >= now);
  if (!current) {
    current = sorted.find((b) => b.ride_end_datetime && now <= new Date(b.ride_end_datetime));
  }
  if (!current) current = sorted[0];
  if (!current.pickup_lat || !current.pickup_lng) return res.json({ ok: false });

  const driverLocation = await getDriverLocation();
  if (!driverLocation || !driverLocation.lat || !driverLocation.lng) {
    return res.json({ ok: false });
  }

  let route = null;
  try {
    route = await getOptimalRoute({
      pickupLat: driverLocation.lat,
      pickupLng: driverLocation.lng,
      dropoffLat: current.pickup_lat,
      dropoffLng: current.pickup_lng
    });
  } catch (error) {
    route = null;
  }

  return res.json({
    ok: true,
    booking: {
      id: current.id,
      customer_name: current.customer_name,
      pickup_location: current.pickup_location,
      pickup_lat: current.pickup_lat,
      pickup_lng: current.pickup_lng,
      ride_datetime: current.ride_datetime
    },
    route: route?.geometry || null,
    etaMinutes: route?.durationMinutes || null,
    distanceKm: route?.distanceKm || null
  });
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

app.get("/api/driver/status", async (req, res) => {
  const now = new Date();
  const accepted = await listBookings("accepted");
  const current = accepted.find((b) => b.ride_end_datetime && now >= new Date(b.ride_datetime) && now <= new Date(b.ride_end_datetime));
  if (current) {
    return res.json({ ok: true, status: "currently_in_ride", bookingId: current.id });
  }
  return res.json({ ok: true, status: "available" });
});

app.get("/driver", (req, res) => {
  res.redirect("/driver-mode");
});

app.get("/driver-mode", requireRole("driver"), (req, res) => {
  res.type("text/html").send(`<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Driver Mode</title>
      <style>
        :root {
          --bg: #1f1f1f;
          --surface: #ffffff;
          --text: #f5f5f5;
          --muted: #b9b9b9;
          --accent: #ffcc00;
          --accent-ink: #1a1a1a;
          --shadow: 0 18px 40px rgba(0,0,0,0.35);
          font-family: "Space Grotesk", "Work Sans", "Segoe UI", sans-serif;
        }
        body { font-family: inherit; background: var(--bg); color: var(--text); margin: 0; padding: 16px; }
        header { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
        h1, h2 { font-family: "Barlow Condensed", "Space Grotesk", sans-serif; font-style: italic; font-weight: 800; letter-spacing: 0.04em; margin: 0; }
        .home-link { background: var(--accent); color: var(--accent-ink); padding: 10px 16px; border-radius: 999px; text-decoration: none; font-weight: 800; }
        button { margin-top: 12px; padding: 12px 18px; border-radius: 999px; border: none; background: var(--accent); color: var(--accent-ink); font-weight: 800; cursor: pointer; width: 100%; }
        button.ghost { background: transparent; border: 1px solid rgba(255,255,255,0.2); color: var(--text); }
        .pill { display: inline-flex; padding: 6px 12px; border-radius: 999px; background: #111111; color: var(--accent); font-weight: 700; font-size: 12px; margin-top: 8px; }
        .card { background: var(--surface); color: #1b1b1b; padding: 16px; border-radius: 14px; margin-top: 14px; box-shadow: var(--shadow); }
        .booking { border-bottom: 1px solid #eceae4; padding: 12px 0; }
        .booking:last-child { border-bottom: none; }
        .muted { color: #6b6b6b; font-size: 13px; }
        .actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
        #map { height: 260px; border-radius: 12px; margin-top: 12px; border: 1px solid #dedbd2; }
      </style>
      <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,600;0,700;1,700;1,800&family=Space+Grotesk:wght@400;600;700;800&display=swap" rel="stylesheet">
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    </head>
    <body>
      <header>
        <h1>Driver Mode</h1>
        <a href="/" class="home-link">Home</a>
      </header>
      <p class="pill" id="status">Sharing location...</p>
      <button id="share">Use My Current Location (Driver)</button>

      <div class="card">
        <h2>Pending Bookings</h2>
        <div id="bookings" class="muted">Loading...</div>
      </div>
      <div class="card">
        <h2>Accepted Ride Route</h2>
        <div id="activeRide" class="muted">No accepted ride yet.</div>
        <div id="map"></div>
      </div>
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <script>
        const statusEl = document.getElementById('status');
        const shareBtn = document.getElementById('share');
        const bookingsEl = document.getElementById('bookings');
        const activeRideEl = document.getElementById('activeRide');

        const map = L.map('map').setView([-20.3484, 57.5522], 11);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);
        let routeLayer = null;
        let pickupMarker = null;
        let driverMarker = null;

        const carIcon = L.icon({
          iconUrl: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path fill="#1f2a44" d="M6 38v-8l6-12a6 6 0 0 1 5-3h30a6 6 0 0 1 5 3l6 12v8a4 4 0 0 1-4 4h-2a6 6 0 0 1-12 0H24a6 6 0 0 1-12 0H10a4 4 0 0 1-4-4z"/><circle cx="20" cy="42" r="5" fill="#f05a28"/><circle cx="44" cy="42" r="5" fill="#f05a28"/></svg>'),
          iconSize: [26, 26],
          iconAnchor: [13, 13]
        });
        async function sendLocation() {
          if (!navigator.geolocation) {
            statusEl.textContent = 'Geolocation not supported';
            return;
          }
          navigator.geolocation.getCurrentPosition(async function (pos) {
            await fetch('/driver/location', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude })
            });
            statusEl.textContent = 'Location updated at ' + new Date().toLocaleTimeString();
          }, function () {
            statusEl.textContent = 'Unable to get location';
          });
        }

        async function loadBookings() {
          const res = await fetch('/api/bookings?status=pending');
          const data = await res.json();
          if (!data || !data.length) {
            bookingsEl.textContent = 'No pending bookings.';
            return;
          }
          bookingsEl.innerHTML = data.map(b => {
            return '<div class="booking">' +
              '<div><strong>#' + b.id + '</strong> • ' + new Date(b.ride_datetime).toLocaleString() + '</div>' +
              '<div class="muted">' + (b.pickup_location || '') + ' → ' + (b.dropoff_location || '') + '</div>' +
              '<div class="muted">Passengers: ' + b.passengers + ' • Fare: ' + b.currency + ' ' + Number(b.fare_amount).toFixed(2) + '</div>' +
              '<div class="actions">' +
                '<button class="ghost" onclick="updateBooking(' + b.id + ', \\'accept\\')">Accept</button>' +
                '<button class="ghost" onclick="updateBooking(' + b.id + ', \\'decline\\')">Decline</button>' +
              '</div>' +
            '</div>';
          }).join('');
        }

        async function updateBooking(id, action) {
          await fetch('/api/driver/bookings/' + id + '/' + action, { method: 'POST' });
          await loadBookings();
        }

        async function refreshActiveRide() {
          const res = await fetch('/api/driver/active-booking');
          const data = await res.json();
          if (!data || !data.ok) {
            activeRideEl.textContent = 'No accepted ride yet.';
            if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
            if (pickupMarker) { map.removeLayer(pickupMarker); pickupMarker = null; }
            return;
          }
          const b = data.booking;
          activeRideEl.innerHTML = '<div><strong>#' + b.id + '</strong> • ' + (b.customer_name || 'Customer') + '</div>' +
            '<div class="muted">Pickup: ' + (b.pickup_location || 'GPS pin') + '</div>' +
            (data.etaMinutes ? '<div class="muted">ETA to pickup: ' + data.etaMinutes + ' min</div>' : '');
          if (b.pickup_lat && b.pickup_lng) {
            if (pickupMarker) map.removeLayer(pickupMarker);
            pickupMarker = L.marker([b.pickup_lat, b.pickup_lng]).addTo(map).bindPopup('Pickup');
          }
          if (data.route) {
            if (routeLayer) map.removeLayer(routeLayer);
            routeLayer = L.geoJSON(data.route, { color: '#1f6feb', weight: 4 }).addTo(map);
            map.fitBounds(routeLayer.getBounds(), { padding: [20, 20] });
          }
        }

        async function refreshDriverMarker() {
          const res = await fetch('/api/driver/location?admin=1');
          const data = await res.json();
          if (!data || !data.ok) return;
          const latlng = [data.lat, data.lng];
          if (!driverMarker) {
            driverMarker = L.marker(latlng, { icon: carIcon }).addTo(map).bindPopup('Driver');
          } else {
            driverMarker.setLatLng(latlng);
          }
        }

        window.updateBooking = updateBooking;
        shareBtn.addEventListener('click', sendLocation);
        setInterval(sendLocation, 15000);
        setInterval(loadBookings, 10000);
        setInterval(refreshActiveRide, 10000);
        setInterval(refreshDriverMarker, 5000);
        sendLocation();
        loadBookings();
        refreshActiveRide();
        refreshDriverMarker();
      </script>
    </body>
  </html>`);
});

app.get("/my-bookings", requireAuth, async (req, res) => {
  const bookings = await listBookingsByCustomerId(req.user.id);
  const rows = bookings.map((b) => {
    const status = b.status;
    const trackLink = status === "accepted" ? `<a href="/track/${b.id}">Track driver</a>` : "";
    return `<tr>
      <td>#${b.id}</td>
      <td>${new Date(b.ride_datetime).toLocaleString()}</td>
      <td>${status}</td>
      <td>${trackLink}</td>
    </tr>`;
  }).join("");
  res.type("text/html").send(`<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>My Bookings</title>
      <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,600;0,700;1,700;1,800&family=Space+Grotesk:wght@400;600;700;800&display=swap" rel="stylesheet">
      <style>
        :root {
          --bg: #1f1f1f;
          --surface: #ffffff;
          --text: #f5f5f5;
          --accent: #ffcc00;
          --accent-ink: #1a1a1a;
          --shadow: 0 18px 40px rgba(0,0,0,0.35);
          font-family: "Space Grotesk", "Work Sans", "Segoe UI", sans-serif;
        }
        body { font-family: inherit; background: var(--bg); color: var(--text); margin: 0; padding: 20px; }
        main { max-width: 820px; margin: 0 auto; }
        h1 { font-family: "Barlow Condensed", "Space Grotesk", sans-serif; font-style: italic; font-weight: 800; letter-spacing: 0.04em; }
        .home-link { background: var(--accent); color: var(--accent-ink); padding: 10px 16px; border-radius: 999px; text-decoration: none; font-weight: 800; }
        table { width: 100%; border-collapse: collapse; background: var(--surface); border-radius: 12px; overflow: hidden; box-shadow: var(--shadow); }
        th, td { padding: 10px 12px; border-bottom: 1px solid #eceae4; text-align: left; font-size: 14px; }
        th { text-transform: uppercase; font-size: 12px; letter-spacing: 0.08em; background: #f5f5f5; }
        a { color: var(--accent); font-weight: 700; text-decoration: none; }
      </style>
    </head>
    <body>
      <main>
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
        <h1>My Bookings</h1>
        <a class="home-link" href="/">Home</a>
      </div>
      <p><a href="/book">Book a ride</a></p>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Date/Time</th>
            <th>Status</th>
            <th>Track</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="4">No bookings yet.</td></tr>'}
        </tbody>
      </table>
      </main>
    </body>
  </html>`);
});

app.get("/api/settings", requireRole("admin"), async (req, res) => {
  const settings = await getSettings();
  res.json(settings);
});

app.post("/api/settings", requireRole("admin"), async (req, res) => {
  await updateSettings({
    currency: String(req.body.currency || "MUR").trim(),
    perKm: Number(req.body.perKm || 0),
    extraPassengerPercent: Number(req.body.extraPassengerPercent || 0),
    waitingPerMinute: Number(req.body.waitingPerMinute || 0),
    returnTripMultiplier: Number(req.body.returnTripMultiplier || 2),
    nightSurchargePercent: Number(req.body.nightSurchargePercent || 0),
    maxPassengers: Math.min(4, Number(req.body.maxPassengers || 4)),
    unavailableMode: req.body.unavailableMode ? "true" : "false",
    unavailableStart: String(req.body.unavailableStart || "20:00"),
    unavailableEnd: String(req.body.unavailableEnd || "06:00"),
    driverOnline: req.body.driverOnline ? "true" : "false"
  });
  res.json({ ok: true });
});

app.get("/track/:id", requireAuth, async (req, res) => {
  const bookingId = Number(req.params.id);
  const booking = await getBookingById(bookingId);
  if (!booking) {
    return res.status(404).type("text/html").send("<h1>Booking not found</h1>");
  }
  if (!AUTH_DISABLED && req.user.role === "customer" && booking.customer_id && booking.customer_id !== req.user.id) {
    return res.status(403).type("text/html").send("<h1>Access denied</h1>");
  }
  res.type("text/html").send(`<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Track Driver</title>
      <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,600;0,700;1,700;1,800&family=Space+Grotesk:wght@400;600;700;800&display=swap" rel="stylesheet">
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <style>
        :root {
          --bg: #1f1f1f;
          --surface: #ffffff;
          --text: #f5f5f5;
          --accent: #ffcc00;
          --accent-ink: #1a1a1a;
          --shadow: 0 18px 40px rgba(0,0,0,0.35);
          font-family: "Space Grotesk", "Work Sans", "Segoe UI", sans-serif;
        }
        body { font-family: inherit; background: var(--bg); color: var(--text); margin: 0; padding: 24px 16px 48px; }
        main { max-width: 820px; margin: 0 auto; }
        h1 { font-family: "Barlow Condensed", "Space Grotesk", sans-serif; font-style: italic; font-weight: 800; letter-spacing: 0.04em; margin: 0; }
        .home-link { background: var(--accent); color: var(--accent-ink); padding: 10px 16px; border-radius: 999px; text-decoration: none; font-weight: 800; }
        .card { background: var(--surface); color: #1b1b1b; padding: 18px; border-radius: 16px; box-shadow: var(--shadow); margin-top: 14px; }
        #trackMap { height: 360px; border-radius: 12px; border: 1px solid #dedbd2; margin-top: 12px; }
        .pill { display: inline-flex; padding: 6px 12px; border-radius: 999px; background: #111111; color: var(--accent); font-weight: 700; font-size: 12px; margin-top: 8px; }
      </style>
    </head>
    <body>
      <main>
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
        <h1>Track Your Driver</h1>
        <a class="home-link" href="/">Home</a>
      </div>
      <div class="card">
        <p>Booking #${bookingId} (${booking.status})</p>
        <div id="trackMap"></div>
        <div class="pill" id="status">Waiting for driver location...</div>
        <div class="pill" id="eta">ETA: --</div>
      </div>
      </main>
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
