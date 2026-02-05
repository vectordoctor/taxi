function bookingPageHtml(options) {
  const maxPassengers = options?.maxPassengers || 4;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Book a Ride</title>
  <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,600;0,700;1,700;1,800&family=Space+Grotesk:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #1f1f1f;
      --surface: #ffffff;
      --text: #f5f5f5;
      --muted: #b9b9b9;
      --ink: #1b1b1b;
      --accent: #ffcc00;
      --accent-ink: #1a1a1a;
      --border: rgba(255, 255, 255, 0.1);
      --shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
      --radius: 16px;
      font-family: "Space Grotesk", "Work Sans", "Segoe UI", sans-serif;
      color-scheme: light;
    }
    body {
      margin: 0;
      background: radial-gradient(1200px 800px at 20% -10%, rgba(255, 204, 0, 0.12), transparent 60%), var(--bg);
      color: var(--text);
    }
    main { width: 100%; padding: 20px 18px 56px; max-width: 980px; margin: 0 auto; }
    h1, h2 { font-family: "Barlow Condensed", "Space Grotesk", sans-serif; font-style: italic; font-weight: 800; letter-spacing: 0.04em; }
    h1 { font-size: clamp(24px, 3vw, 36px); margin: 8px 0 6px; }
    p { color: var(--muted); margin: 0 0 16px; }
    .section { background: var(--surface); color: var(--ink); border-radius: var(--radius); padding: 18px; box-shadow: var(--shadow); margin-top: 18px; }
    label { display: block; margin-top: 12px; font-weight: 600; color: #202020; }
    input, textarea, select {
      width: 100%; padding: 12px 14px; margin-top: 6px;
      border-radius: 12px; border: 1px solid #e0e0e0; font-size: 16px;
      background: #fff; color: #121212;
    }
    input:focus, textarea:focus, select:focus {
      outline: 2px solid rgba(255, 204, 0, 0.5);
      border-color: #ffcc00;
    }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .cta {
      margin-top: 16px; padding: 12px 18px; border-radius: 999px; border: none;
      background: var(--accent); color: var(--accent-ink); font-weight: 800; cursor: pointer; width: 100%;
      box-shadow: 0 10px 24px rgba(255, 204, 0, 0.25);
    }
    .home-link {
      background: var(--accent);
      color: var(--accent-ink);
      padding: 10px 16px;
      border-radius: 999px;
      text-decoration: none;
      font-weight: 800;
    }
    .ghost {
      margin-top: 12px; padding: 12px 18px; border-radius: 999px; border: 1px solid #2d2d2d;
      background: transparent; color: #2d2d2d; font-weight: 700; cursor: pointer; width: 100%;
    }
    .hint { font-size: 12px; color: #6b6b6b; }
    #map { height: 300px; border-radius: 14px; margin-top: 14px; border: 1px solid #e5e5e5; }
    .pill { display: inline-flex; padding: 6px 12px; border-radius: 999px; background: #1f1f1f; color: var(--accent); font-weight: 700; font-size: 12px; margin-top: 8px; }
    .table-wrap { margin-top: 10px; overflow-x: auto; }
    .breakdown-table { width: 100%; border-collapse: collapse; background: #111111; color: #f5f5f5; border-radius: 12px; overflow: hidden; }
    .breakdown-table th, .breakdown-table td { padding: 10px 12px; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.08); font-size: 13px; }
    .breakdown-table th { text-transform: uppercase; letter-spacing: 0.08em; font-size: 11px; color: #ffdd55; width: 40%; }
    .breakdown-table tbody tr:last-child td { border-bottom: none; }
    .step-title { color: var(--accent); font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; font-size: 12px; }
    @media (max-width: 720px) {
      main { padding: 16px 14px 48px; }
      .row { grid-template-columns: 1fr; }
      #map { height: 240px; }
    }
  </style>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
</head>
<body>
    <main>
    <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
      <div>
        <h1>Book a Ride</h1>
        <p>Set your pickup and dropoff pins first. We will confirm after driver approval.</p>
      </div>
      <a class="home-link" href="/">Home</a>
    </div>
    <form method="post" action="/book/submit">
      <div id="step1">
        <p class="step-title">Step 1</p>
        <p class="hint">Set pickup and dropoff by placing pins on the map below.</p>

        <input type="hidden" name="pickup" />
        <input type="hidden" name="dropoff" />
        <input type="hidden" name="pickup_lat" />
        <input type="hidden" name="pickup_lng" />
        <input type="hidden" name="dropoff_lat" />
        <input type="hidden" name="dropoff_lng" />
        <div class="section">
          <div class="row">
            <button type="button" id="useLocation" class="ghost">Use My GPS Location</button>
            <button type="button" id="setPickup" class="ghost">Set Pickup Pin</button>
          </div>
          <div class="row">
            <button type="button" id="setDropoff" class="ghost">Set Dropoff Pin</button>
          </div>
          <div id="map"></div>
          <div class="pill" id="pinHint">Click the map to place pickup pin</div>
        </div>

        <input type="hidden" name="distance" />

        <div class="pill" id="estimate">Distance: -- km | Fare: -- | Driver ETA: --</div>
        <div class="table-wrap section">
          <table class="breakdown-table">
            <tbody>
              <tr>
                <th>Driver Location</th>
                <td id="bd-driver">--</td>
              </tr>
              <tr>
                <th>Driver Status</th>
                <td id="bd-status">--</td>
              </tr>
              <tr>
                <th>Pickup ETA</th>
                <td id="bd-eta">--</td>
              </tr>
              <tr>
                <th>Fare</th>
                <td id="bd-fare">--</td>
              </tr>
              <tr>
                <th>Travel Time</th>
                <td id="bd-travel">--</td>
              </tr>
              <tr>
                <th>Per KM Applied</th>
                <td id="bd-perkm">--</td>
              </tr>
              <tr>
                <th>Distance</th>
                <td id="bd-distance">--</td>
              </tr>
              <tr>
                <th>Waiting (min)</th>
                <td id="bd-waiting">--</td>
              </tr>
              <tr>
                <th>Passengers</th>
                <td id="bd-passengers">--</td>
              </tr>
              <tr>
                <th>Pickup Address</th>
                <td id="bd-pickup">--</td>
              </tr>
              <tr>
                <th>Dropoff Address</th>
                <td id="bd-dropoff">--</td>
              </tr>
            </tbody>
          </table>
        </div>

        <button type="button" id="nextStep" class="cta">Next</button>
      </div>

      <div id="step2" style="display:none;">
        <p class="step-title">Step 2</p>
        <p class="hint">Enter ride details.</p>

        <label>Date</label>
        <input type="date" name="date" required />

        <label>Time</label>
        <input type="time" name="time" required />

        <div class="row">
          <div>
            <label>Passengers</label>
            <input type="number" name="passengers" min="1" max="${maxPassengers}" value="1" required />
            <div class="hint">Maximum ${maxPassengers} passengers</div>
          </div>
          <div id="waitingWrap" style="display:none;">
            <label>Waiting Minutes</label>
            <input type="number" name="waiting" min="0" value="0" />
          </div>
        </div>

        <label>Wait & return to pickup point?</label>
        <div class="row">
          <div>
            <input type="checkbox" name="waiting_return" value="1" />
            <span class="hint">Driver waits and returns to pickup location</span>
          </div>
        </div>

        <label>Name</label>
        <input name="name" required />

        <label>Phone</label>
        <input name="phone" placeholder="+15551234567" required />

        <div class="row">
          <button type="button" id="prevStep" class="ghost">Back</button>
          <button type="submit" class="cta">Submit Booking</button>
        </div>
      </div>
    </form>
  </main>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const useLocationBtn = document.getElementById('useLocation');
    const setPickupBtn = document.getElementById('setPickup');
    const setDropoffBtn = document.getElementById('setDropoff');
    const nextStepBtn = document.getElementById('nextStep');
    const prevStepBtn = document.getElementById('prevStep');
    const step1 = document.getElementById('step1');
    const step2 = document.getElementById('step2');
    const pinHint = document.getElementById('pinHint');
    const estimate = document.getElementById('estimate');
    const statusEl = document.createElement('div');
    statusEl.className = 'pill';
    statusEl.textContent = 'Driver status: checking...';
    estimate.parentNode.insertBefore(statusEl, estimate);
    const pickupLatInput = document.querySelector('input[name=\"pickup_lat\"]');
    const pickupLngInput = document.querySelector('input[name=\"pickup_lng\"]');
    const dropoffLatInput = document.querySelector('input[name=\"dropoff_lat\"]');
    const dropoffLngInput = document.querySelector('input[name=\"dropoff_lng\"]');
    const distanceInput = document.querySelector('input[name=\"distance\"]');
    const pickupText = document.querySelector('input[name=\"pickup\"]');
    const dropoffText = document.querySelector('input[name=\"dropoff\"]');
    const waitingWrap = document.getElementById('waitingWrap');
    const waitingInput = document.querySelector('input[name=\"waiting\"]');
    const waitingReturnCheckbox = document.querySelector('input[name=\"waiting_return\"]');
    const dateInput = document.querySelector('input[name=\"date\"]');
    const timeInput = document.querySelector('input[name=\"time\"]');

    let activePin = 'pickup';

    const map = L.map('map').setView([-20.3484, 57.5522], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    let pickupMarker = null;
    let dropoffMarker = null;
    let driverMarker = null;
    const carIcon = L.icon({
      iconUrl: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\"><path fill=\"#1f2a44\" d=\"M6 38v-8l6-12a6 6 0 0 1 5-3h30a6 6 0 0 1 5 3l6 12v8a4 4 0 0 1-4 4h-2a6 6 0 0 1-12 0H24a6 6 0 0 1-12 0H10a4 4 0 0 1-4-4z\"/><circle cx=\"20\" cy=\"42\" r=\"5\" fill=\"#f05a28\"/><circle cx=\"44\" cy=\"42\" r=\"5\" fill=\"#f05a28\"/></svg>'),
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    });

    let routeLayer = null;
    let driverRouteLayer = null;

    function drawRoute(geometry) {
      if (routeLayer) {
        map.removeLayer(routeLayer);
        routeLayer = null;
      }
      if (!geometry) return;
      routeLayer = L.geoJSON(geometry, { color: '#f05a28', weight: 4 }).addTo(map);
      map.fitBounds(routeLayer.getBounds(), { padding: [20, 20] });
    }

    function drawDriverRoute(geometry) {
      if (driverRouteLayer) {
        map.removeLayer(driverRouteLayer);
        driverRouteLayer = null;
      }
      if (!geometry) return;
      driverRouteLayer = L.geoJSON(geometry, { color: '#1f6feb', weight: 3, dashArray: '6 6' }).addTo(map);
    }

    function updateEstimate() {
      const payload = {
        pickup_lat: Number(pickupLatInput.value),
        pickup_lng: Number(pickupLngInput.value),
        dropoff_lat: Number(dropoffLatInput.value),
        dropoff_lng: Number(dropoffLngInput.value),
        passengers: Number(document.querySelector('input[name=\"passengers\"]').value),
        waiting: waitingReturnCheckbox.checked ? Number(waitingInput.value) : 0,
        waiting_return: waitingReturnCheckbox.checked,
        date: document.querySelector('input[name=\"date\"]').value,
        time: document.querySelector('input[name=\"time\"]').value
      };

      fetch('/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(r => r.json())
        .then(data => {
          if (data && data.ok) {
            const travel = data.travelMinutes ? (' | Travel: ' + data.travelMinutes + ' min') : '';
            const eta = data.pickupEtaMinutes ? (' | Driver ETA: ' + data.pickupEtaMinutes + ' min') : '';
            const arrival = data.arrivalTimeIso ? (' | Arrive: ' + new Date(data.arrivalTimeIso).toLocaleTimeString()) : '';
            estimate.textContent = 'Distance: ' + data.distanceKm.toFixed(2) + ' km | Fare: ' + data.currency + ' ' + data.total.toFixed(2) + travel + eta + arrival;
            distanceInput.value = data.distanceKm.toFixed(2);
            drawRoute(data.geometry);
            drawDriverRoute(data.driverGeometry);
            document.getElementById('bd-driver').textContent = data.driverAddress || '--';
            document.getElementById('bd-status').textContent = data.driverStatus === 'currently_in_ride' ? 'Currently in Ride' : 'Available';
            document.getElementById('bd-eta').textContent = data.pickupEtaMinutes
              ? (data.pickupEtaMinutes + ' min' + (data.arrivalTimeIso ? ' (Arrive ' + new Date(data.arrivalTimeIso).toLocaleTimeString() + ')' : ''))
              : '--';
            document.getElementById('bd-fare').textContent = data.currency + ' ' + data.total.toFixed(2);
            document.getElementById('bd-travel').textContent = data.travelMinutes ? data.travelMinutes + ' min' : '--';
            document.getElementById('bd-perkm').textContent = data.currency + ' ' + data.perKmApplied.toFixed(2) + ' (' + data.perKmLabel + ')';
            document.getElementById('bd-distance').textContent = data.distanceKm.toFixed(2) + ' km';
            document.getElementById('bd-waiting').textContent = String(data.waitingMinutes || 0);
            document.getElementById('bd-passengers').textContent = String(data.passengers || 1);
            document.getElementById('bd-pickup').textContent = data.pickupAddress || 'GPS pin set';
            document.getElementById('bd-dropoff').textContent = data.dropoffAddress || 'GPS pin set';
          } else {
            estimate.textContent = 'Distance: -- km | Fare: --';
            distanceInput.value = '';
            drawRoute(null);
            drawDriverRoute(null);
            document.getElementById('bd-driver').textContent = '--';
            document.getElementById('bd-status').textContent = '--';
            document.getElementById('bd-eta').textContent = '--';
            document.getElementById('bd-fare').textContent = '--';
            document.getElementById('bd-travel').textContent = '--';
            document.getElementById('bd-perkm').textContent = '--';
            document.getElementById('bd-distance').textContent = '--';
            document.getElementById('bd-waiting').textContent = '--';
            document.getElementById('bd-passengers').textContent = '--';
            document.getElementById('bd-pickup').textContent = '--';
            document.getElementById('bd-dropoff').textContent = '--';
          }
        })
        .catch(() => {
          estimate.textContent = 'Distance: -- km | Fare: --';
          distanceInput.value = '';
          drawRoute(null);
          drawDriverRoute(null);
          document.getElementById('bd-driver').textContent = '--';
          document.getElementById('bd-status').textContent = '--';
          document.getElementById('bd-eta').textContent = '--';
          document.getElementById('bd-fare').textContent = '--';
          document.getElementById('bd-travel').textContent = '--';
          document.getElementById('bd-perkm').textContent = '--';
          document.getElementById('bd-distance').textContent = '--';
          document.getElementById('bd-waiting').textContent = '--';
          document.getElementById('bd-passengers').textContent = '--';
          document.getElementById('bd-pickup').textContent = '--';
          document.getElementById('bd-dropoff').textContent = '--';
        });
    }

    function setPin(lat, lng, target) {
      if (target === 'pickup') {
        if (pickupMarker) map.removeLayer(pickupMarker);
        pickupMarker = L.marker([lat, lng]).addTo(map).bindPopup('Pickup').openPopup();
        pickupLatInput.value = lat.toFixed(6);
        pickupLngInput.value = lng.toFixed(6);
        pickupText.value = 'GPS (' + lat.toFixed(5) + ', ' + lng.toFixed(5) + ')';
        pinHint.textContent = 'Click the map to place dropoff pin';
        activePin = 'dropoff';
      } else {
        if (dropoffMarker) map.removeLayer(dropoffMarker);
        dropoffMarker = L.marker([lat, lng]).addTo(map).bindPopup('Dropoff').openPopup();
        dropoffLatInput.value = lat.toFixed(6);
        dropoffLngInput.value = lng.toFixed(6);
        dropoffText.value = 'GPS (' + lat.toFixed(5) + ', ' + lng.toFixed(5) + ')';
        pinHint.textContent = 'Pickup and dropoff pins set';
      }
      updateEstimate();
    }

    map.on('click', function (e) {
      setPin(e.latlng.lat, e.latlng.lng, activePin);
    });

    async function refreshDriverLocation() {
      const res = await fetch('/api/driver/location');
      const data = await res.json();
      if (!data.ok) return;
      const latlng = [data.lat, data.lng];
      if (!driverMarker) {
        driverMarker = L.marker(latlng, { icon: carIcon }).addTo(map).bindPopup('Driver');
        driverMarker.openPopup();
        map.setView(latlng, 12);
      } else {
        driverMarker.setLatLng(latlng);
      }
    }

    async function refreshDriverStatus() {
      const res = await fetch('/api/driver/status');
      const data = await res.json();
      if (!data.ok) return;
      if (data.status === 'currently_in_ride') {
        statusEl.textContent = 'Driver status: Currently in Ride';
      } else {
        statusEl.textContent = 'Driver status: Available';
      }
    }

    useLocationBtn.addEventListener('click', function () {
      if (!navigator.geolocation) {
        alert('Geolocation is not supported by your browser.');
        return;
      }
      navigator.geolocation.getCurrentPosition(function (pos) {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        setPin(Number(lat), Number(lng), 'pickup');
      }, function () {
        alert('Unable to get your location. Please click on the map to set your pickup pin.');
      });
    });

    setDropoffBtn.addEventListener('click', function () {
      activePin = 'dropoff';
      pinHint.textContent = 'Click the map to place dropoff pin';
    });

    setPickupBtn.addEventListener('click', function () {
      activePin = 'pickup';
      pinHint.textContent = 'Click the map to place pickup pin';
    });

    nextStepBtn.addEventListener('click', function () {
      step1.style.display = 'none';
      step2.style.display = 'block';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    prevStepBtn.addEventListener('click', function () {
      step2.style.display = 'none';
      step1.style.display = 'block';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    ['input[name=\"passengers\"]', 'input[name=\"waiting\"]', 'input[name=\"date\"]', 'input[name=\"time\"]', 'input[name=\"waiting_return\"]'].forEach(function (selector) {
      document.querySelector(selector).addEventListener('change', updateEstimate);
    });

    waitingReturnCheckbox.addEventListener('change', function () {
      if (waitingReturnCheckbox.checked) {
        waitingWrap.style.display = 'block';
      } else {
        waitingWrap.style.display = 'none';
        waitingInput.value = '0';
      }
      updateEstimate();
    });

    function setDefaultDateTime() {
      if (!dateInput.value) {
        dateInput.value = new Date().toISOString().slice(0, 10);
      }
      if (!timeInput.value) {
        const now = new Date();
        const rounded = new Date(now.getTime());
        const minutes = Math.ceil(rounded.getMinutes() / 5) * 5;
        rounded.setMinutes(minutes);
        if (rounded.getMinutes() === 60) {
          rounded.setHours(rounded.getHours() + 1);
          rounded.setMinutes(0);
        }
        timeInput.value = rounded.toTimeString().slice(0, 5);
      }
    }

    setDefaultDateTime();
    refreshDriverLocation();
    setInterval(refreshDriverLocation, 5000);
    refreshDriverStatus();
    setInterval(refreshDriverStatus, 15000);
  </script>
</body>
</html>`;
}

function bookingResultHtml({ bookingId, fare, pickupMinutes, arrivalTimeIso, phone }) {
  const arrivalLine = arrivalTimeIso
    ? `<p>Arrive by: ${new Date(arrivalTimeIso).toLocaleTimeString()}</p>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Booking Submitted</title>
  <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,600;0,700;1,700;1,800&family=Space+Grotesk:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #1f1f1f;
      --surface: #ffffff;
      --text: #f5f5f5;
      --muted: #b9b9b9;
      --accent: #ffcc00;
      --accent-ink: #1a1a1a;
      font-family: "Space Grotesk", "Work Sans", "Segoe UI", sans-serif;
    }
    body { font-family: inherit; background: var(--bg); color: var(--text); margin: 0; padding: 20px; }
    main { width: 100%; max-width: 760px; margin: 0 auto; }
    .card { background: var(--surface); color: #1b1b1b; padding: 18px; border-radius: 16px; box-shadow: 0 18px 40px rgba(0,0,0,0.35); margin-top: 16px; }
    a { color: var(--accent); text-decoration: none; font-weight: 700; }
    h1, h2 { font-family: "Barlow Condensed", "Space Grotesk", sans-serif; font-style: italic; font-weight: 800; letter-spacing: 0.04em; }
    .pill { display: inline-flex; padding: 6px 12px; border-radius: 999px; background: #111111; color: var(--accent); font-weight: 700; font-size: 12px; }
    .home-link { background: var(--accent); color: var(--accent-ink); padding: 10px 16px; border-radius: 999px; text-decoration: none; font-weight: 800; }
  </style>
</head>
<body>
  <main data-phone="${phone || ""}">
    <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
      <h1>Booking Submitted</h1>
      <a class="home-link" href="/">Home</a>
    </div>
    <div class="card">
      <p>Your request #${bookingId} is pending driver approval.</p>
      <p>Fare estimate: ${fare.currency} ${fare.total.toFixed(2)}</p>
      <p>Estimated pickup: ${pickupMinutes} minutes</p>
      ${arrivalLine}
      <p class="pill" id="statusPill">Status: checking...</p>
      <p id="trackLink" style="display:none;"><a href="/track/${bookingId}">Track driver</a></p>
    </div>
    <div class="card">
      <h2>Your Accepted Rides</h2>
      <div id="myRides">Loading...</div>
    </div>
  </main>
  <script>
    const bookingId = ${bookingId};
    const statusPill = document.getElementById('statusPill');
    const trackLink = document.getElementById('trackLink');
    const myRides = document.getElementById('myRides');
    const phone = document.querySelector('main').dataset.phone;

    async function refreshStatus() {
      const res = await fetch('/api/bookings/' + bookingId);
      const data = await res.json();
      if (!data || !data.ok) return;
      const status = data.booking.status || 'pending';
      statusPill.textContent = 'Status: ' + status;
      if (status === 'accepted') {
        trackLink.style.display = 'block';
      }
    }

    async function loadMyRides() {
      if (!phone) {
        myRides.textContent = 'No phone number available.';
        return;
      }
      const res = await fetch('/api/bookings?phone=' + encodeURIComponent(phone));
      const data = await res.json();
      const accepted = data.filter(b => b.status === 'accepted');
      if (!accepted.length) {
        myRides.textContent = 'No accepted rides yet.';
        return;
      }
      myRides.innerHTML = '<ul>' + accepted.map(b => '<li>#' + b.id + ' • ' + new Date(b.ride_datetime).toLocaleString() + ' • ' + b.pickup_location + ' → ' + b.dropoff_location + '</li>').join('') + '</ul>';
    }

    refreshStatus();
    loadMyRides();
    setInterval(refreshStatus, 10000);
  </script>
</body>
</html>`;
}

function bookingErrorHtml(message) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Booking Error</title>
  <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,600;0,700;1,700;1,800&family=Space+Grotesk:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #1f1f1f;
      --surface: #ffffff;
      --text: #f5f5f5;
      --muted: #b9b9b9;
      --accent: #ffcc00;
      --accent-ink: #1a1a1a;
      font-family: "Space Grotesk", "Work Sans", "Segoe UI", sans-serif;
    }
    body { font-family: inherit; background: var(--bg); color: var(--text); margin: 0; padding: 20px; }
    main { width: 100%; max-width: 760px; margin: 0 auto; }
    a { color: var(--accent); text-decoration: none; font-weight: 700; }
    h1 { font-family: "Barlow Condensed", "Space Grotesk", sans-serif; font-style: italic; font-weight: 800; letter-spacing: 0.04em; }
    .home-link { background: var(--accent); color: var(--accent-ink); padding: 10px 16px; border-radius: 999px; text-decoration: none; font-weight: 800; }
  </style>
</head>
<body>
  <main>
    <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
      <h1>Booking Error</h1>
      <a class="home-link" href="/">Home</a>
    </div>
    <p>${message}</p>
    <p><a href="/book">Back to booking form</a></p>
  </main>
</body>
</html>`;
}

module.exports = { bookingPageHtml, bookingResultHtml, bookingErrorHtml };
