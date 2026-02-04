function bookingPageHtml(options) {
  const maxPassengers = options?.maxPassengers || 4;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Book a Ride</title>
  <style>
    body { font-family: "Work Sans", "Segoe UI", sans-serif; background: #f6f4ef; color: #1b1b1b; padding: 16px; }
    .card { background: transparent; padding: 0; border-radius: 0; box-shadow: none; max-width: 720px; margin: 0 auto; }
    label { display: block; margin-top: 12px; font-weight: 600; }
    input, textarea { width: 100%; padding: 12px 14px; margin-top: 6px; border-radius: 10px; border: 1px solid #dedbd2; font-size: 16px; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    button { margin-top: 18px; padding: 12px 18px; border-radius: 999px; border: none; background: #f05a28; color: white; font-weight: 700; cursor: pointer; width: 100%; }
    button.ghost { background: transparent; color: #1f2a44; border: 1px solid #1f2a44; }
    .hint { font-size: 12px; color: #6b6b6b; }
    #map { height: 260px; border-radius: 12px; margin-top: 14px; border: 1px solid #dedbd2; }
    .pill { display: inline-flex; padding: 6px 12px; border-radius: 999px; background: #fdf3ee; color: #b34622; font-weight: 700; font-size: 12px; margin-top: 8px; }
    .table-wrap { margin-top: 10px; overflow-x: auto; }
    .breakdown-table { width: 100%; border-collapse: collapse; background: #fff7f1; border-radius: 12px; overflow: hidden; }
    .breakdown-table th, .breakdown-table td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #f0e1d7; font-size: 13px; }
    .breakdown-table th { text-transform: uppercase; letter-spacing: 0.08em; font-size: 11px; color: #8b3b1c; width: 40%; }
    .breakdown-table tbody tr:last-child td { border-bottom: none; }
    @media (max-width: 720px) {
      body { padding: 12px; }
      .row { grid-template-columns: 1fr; }
      #map { height: 220px; }
      button { width: 100%; }
      .breakdown-table th, .breakdown-table td { font-size: 13px; }
    }
  </style>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
</head>
<body>
  <div class="card">
    <h1>Book a Ride</h1>
    <p>Fill out the details below and we'll confirm after driver approval.</p>
    <form method="post" action="/book/submit">
      <p class="hint">Set pickup and dropoff by placing pins on the map below.</p>

      <input type="hidden" name="pickup" />
      <input type="hidden" name="dropoff" />
      <input type="hidden" name="pickup_lat" />
      <input type="hidden" name="pickup_lng" />
      <input type="hidden" name="dropoff_lat" />
      <input type="hidden" name="dropoff_lng" />
      <div class="row">
        <button type="button" id="useLocation" class="ghost">Use My GPS Location</button>
        <button type="button" id="setPickup" class="ghost">Set Pickup Pin</button>
      </div>
      <div class="row">
        <button type="button" id="setDropoff" class="ghost">Set Dropoff Pin</button>
      </div>
      <div id="map"></div>
      <div class="pill" id="pinHint">Click the map to place pickup pin</div>

      <input type="hidden" name="distance" />

      <div class="pill" id="estimate">Distance: -- km | Fare: -- | Driver ETA: --</div>
      <div class="table-wrap">
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

      <button type="submit">Submit Booking</button>
    </form>
  </div>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const useLocationBtn = document.getElementById('useLocation');
    const setPickupBtn = document.getElementById('setPickup');
    const setDropoffBtn = document.getElementById('setDropoff');
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

    function drawRoute(geometry) {
      if (routeLayer) {
        map.removeLayer(routeLayer);
        routeLayer = null;
      }
      if (!geometry) return;
      routeLayer = L.geoJSON(geometry, { color: '#f05a28', weight: 4 }).addTo(map);
      map.fitBounds(routeLayer.getBounds(), { padding: [20, 20] });
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

    refreshDriverLocation();
    setInterval(refreshDriverLocation, 5000);
    refreshDriverStatus();
    setInterval(refreshDriverStatus, 15000);
  </script>
</body>
</html>`;
}

function bookingResultHtml({ bookingId, fare, pickupMinutes, arrivalTimeIso }) {
  const arrivalLine = arrivalTimeIso
    ? `<p>Arrive by: ${new Date(arrivalTimeIso).toLocaleTimeString()}</p>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Booking Submitted</title>
  <style>
    body { font-family: "Work Sans", "Segoe UI", sans-serif; background: #f6f4ef; color: #1b1b1b; padding: 32px; }
    .card { background: white; padding: 24px; border-radius: 16px; box-shadow: 0 12px 40px rgba(27,27,27,0.08); max-width: 640px; margin: 0 auto; }
    a { color: #f05a28; font-weight: 600; text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Booking Submitted</h1>
    <p>Your request #${bookingId} is pending driver approval.</p>
    <p>Fare estimate: ${fare.currency} ${fare.total.toFixed(2)}</p>
    <p>Estimated pickup: ${pickupMinutes} minutes</p>
    ${arrivalLine}
    <p><a href="/admin">View admin dashboard</a></p>
  </div>
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
  <style>
    body { font-family: "Work Sans", "Segoe UI", sans-serif; background: #f6f4ef; color: #1b1b1b; padding: 32px; }
    .card { background: white; padding: 24px; border-radius: 16px; box-shadow: 0 12px 40px rgba(27,27,27,0.08); max-width: 640px; margin: 0 auto; }
    a { color: #f05a28; font-weight: 600; text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Booking Error</h1>
    <p>${message}</p>
    <p><a href="/book">Back to booking form</a></p>
  </div>
</body>
</html>`;
}

module.exports = { bookingPageHtml, bookingResultHtml, bookingErrorHtml };
