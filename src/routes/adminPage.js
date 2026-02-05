function adminPageHtml(settings) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Super Admin</title>
  <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,600;0,700;1,700;1,800&family=Space+Grotesk:wght@400;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    :root {
      --bg: #1f1f1f;
      --surface: #ffffff;
      --text: #f5f5f5;
      --muted: #b9b9b9;
      --accent: #ffcc00;
      --accent-ink: #1a1a1a;
      --shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
      --radius: 16px;
      font-family: "Space Grotesk", "Work Sans", "Segoe UI", sans-serif;
    }
    body {
      margin: 0;
      background: radial-gradient(1200px 800px at 10% -20%, rgba(255, 204, 0, 0.12), transparent 60%), var(--bg);
      color: var(--text);
    }
    header {
      padding: 24px 32px;
      background: #171717;
      color: var(--text);
      border-bottom: 1px solid rgba(255,255,255,0.08);
    }
    h1, h2 {
      font-family: "Barlow Condensed", "Space Grotesk", sans-serif;
      font-style: italic;
      font-weight: 800;
      letter-spacing: 0.04em;
      margin: 0;
    }
    .header-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    .home-link {
      background: var(--accent);
      color: var(--accent-ink);
      padding: 8px 14px;
      border-radius: 999px;
      text-decoration: none;
      font-weight: 700;
    }
    main {
      padding: 24px 24px 48px;
    }
    .toolbar {
      display: flex;
      gap: 12px;
      align-items: center;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    .tabs {
      display: flex;
      gap: 10px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    .tab-btn {
      border-radius: 999px;
      padding: 10px 16px;
      border: 1px solid rgba(255,255,255,0.18);
      background: transparent;
      color: var(--text);
      font-weight: 700;
      cursor: pointer;
    }
    .tab-btn.active {
      background: var(--accent);
      color: var(--accent-ink);
    }
    button, select {
      border: none;
      border-radius: 999px;
      padding: 10px 16px;
      font-weight: 600;
      cursor: pointer;
    }
    button.primary {
      background: var(--accent);
      color: var(--accent-ink);
    }
    button.ghost {
      background: transparent;
      border: 1px solid rgba(255,255,255,0.2);
      color: var(--text);
    }
    .action-btn {
      background: #111111;
      color: #ffffff;
      border: 1px solid rgba(0,0,0,0.1);
      padding: 8px 14px;
      border-radius: 12px;
      font-weight: 700;
    }
    .action-btn.accept {
      background: var(--accent);
      color: var(--accent-ink);
      border-color: transparent;
    }
    .action-btn.decline {
      background: #222222;
      color: #ffffff;
    }
    .muted-text {
      color: #1b1b1b;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--surface);
      border-radius: var(--radius);
      overflow: hidden;
      box-shadow: var(--shadow);
    }
    th, td {
      padding: 12px 14px;
      text-align: left;
      border-bottom: 1px solid #eeeeee;
      font-size: 14px;
      vertical-align: top;
      color: #1b1b1b;
    }
    th {
      background: #f5f5f5;
      color: #111111;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    tr:last-child td { border-bottom: none; }
    .status {
      font-weight: 700;
      text-transform: capitalize;
    }
    .status.pending { color: #c06c00; }
    .status.accepted { color: #177245; }
    .status.declined { color: #9b1c1c; }
    .actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .empty {
      padding: 24px;
      text-align: center;
      color: var(--muted);
    }
    form label { display: block; margin-top: 12px; font-weight: 600; color: var(--text); }
    form input { width: 100%; padding: 12px 14px; margin-top: 6px; border-radius: 12px; border: 1px solid #e0e0e0; font-size: 16px; }
    form button { margin-top: 18px; padding: 12px 18px; border-radius: 999px; border: none; background: var(--accent); color: var(--accent-ink); font-weight: 800; cursor: pointer; width: 100%; }
    .pill { display: inline-flex; padding: 6px 12px; border-radius: 999px; background: #111111; color: var(--accent); font-weight: 600; font-size: 12px; }
    .calendar-title {
      margin: 8px 0 12px;
      font-size: 18px;
      color: var(--text);
    }
    .calendar-card {
      background: var(--surface);
      border-radius: 14px;
      padding: 12px 14px;
      margin-bottom: 10px;
      box-shadow: var(--shadow);
    }
    .calendar-date {
      font-weight: 700;
      margin-bottom: 8px;
    }
    .calendar-row {
      display: grid;
      gap: 4px;
      padding: 8px 0;
      border-bottom: 1px solid #eceae4;
    }
    .calendar-row:last-child { border-bottom: none; }
    .calendar-time { font-weight: 700; color: #1b1b1b; }
    .calendar-loc { color: #1f1f1f; font-size: 13px; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border-radius: 999px;
      background: #111111;
      color: var(--accent);
      font-weight: 700;
      font-size: 12px;
      margin-right: 6px;
      margin-top: 6px;
    }
    #driverMap { height: 240px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.12); margin: 12px 0 18px; }
    @media (max-width: 900px) {
      header { padding: 20px; }
      main { padding: 16px; }
      .toolbar { gap: 8px; }
      button, select { width: 100%; }
      table, thead, tbody, th, td, tr { display: block; }
      thead { display: none; }
      tr { border-bottom: 1px solid #eceae4; padding: 12px 0; }
      td { border: none; display: flex; justify-content: space-between; padding: 8px 12px; }
      td::before { content: attr(data-label); font-weight: 700; color: #1f2a44; }
      .actions { justify-content: flex-start; }
    }
  </style>
</head>
<body>
  <header>
    <div class="header-row">
      <div>
        <h1>Super Admin</h1>
        <p>Manage rides, pricing, and availability.</p>
      </div>
      <a class="home-link" href="/">Home</a>
    </div>
  </header>
  <main>
    <div class="tabs">
      <button class="tab-btn active" data-tab="rides">Rides</button>
      <button class="tab-btn" data-tab="settings">Pricing Settings</button>
    </div>

    <section id="tab-rides">
    <div class="toolbar">
      <button class="primary" id="refresh">Refresh</button>
      <button class="ghost" id="createTest">Create Test Booking</button>
      <select id="statusFilter">
        <option value="">All</option>
        <option value="pending">Pending</option>
        <option value="accepted">Accepted</option>
        <option value="declined">Declined</option>
        <option value="completed">Completed</option>
      </select>
      <span id="updated"></span>
      <span class="pill" id="driverLive">Driver location: --</span>
    </div>
    <div id="driverMap"></div>
    <div id="calendar"></div>
    <div id="tableWrap"></div>
    <div class="pill" id="todayEarnings">Today earnings: --</div>
    </section>

    <section id="tab-settings" style="display:none;">
      <h2>Pricing Settings (Mauritius)</h2>
      <p class="pill" id="saveStatus" style="display:none;">Saved</p>
      <form id="settingsForm">
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

        <label>Unavailable Mode</label>
        <input type="checkbox" name="unavailableMode" value="1" ${settings.unavailableMode ? "checked" : ""} />

        <label>Daily Unavailable Start</label>
        <input type="time" name="unavailableStart" value="${settings.unavailableStart}" required />

        <label>Daily Unavailable End</label>
        <input type="time" name="unavailableEnd" value="${settings.unavailableEnd}" required />

        <label>Driver Online</label>
        <input type="checkbox" name="driverOnline" value="1" ${settings.driverOnline ? "checked" : ""} />

        <button type="submit">Save Settings</button>
      </form>
    </section>
  </main>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const tableWrap = document.getElementById('tableWrap');
    const statusFilter = document.getElementById('statusFilter');
    const updated = document.getElementById('updated');
    const refreshBtn = document.getElementById('refresh');
    const createTestBtn = document.getElementById('createTest');
    const driverLive = document.getElementById('driverLive');
    const calendar = document.getElementById('calendar');
    const tabs = document.querySelectorAll('.tab-btn');
    const tabRides = document.getElementById('tab-rides');
    const tabSettings = document.getElementById('tab-settings');
    const settingsForm = document.getElementById('settingsForm');
    const saveStatus = document.getElementById('saveStatus');
    const todayEarnings = document.getElementById('todayEarnings');
    const driverMap = L.map('driverMap').setView([-20.3484, 57.5522], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(driverMap);
    let driverMarker = null;

    async function fetchBookings() {
      const status = statusFilter.value;
      const url = status ? '/api/bookings?status=' + encodeURIComponent(status) : '/api/bookings';
      const res = await fetch(url);
      const data = await res.json();
      renderTable(data);
      renderEarnings(data);
      renderCalendar(data.filter(b => b.status === 'accepted'));
      updated.textContent = 'Updated ' + new Date().toLocaleTimeString();
    }

    // Admin does not accept/decline bookings. Driver handles approvals.

    function renderTable(bookings) {
      if (!bookings.length) {
        tableWrap.innerHTML = '<div class="empty">No bookings to show.</div>';
        return;
      }
      const rows = bookings.map(function (b) {
        return '<tr>' +
          '<td data-label="ID">#' + b.id + '</td>' +
          '<td data-label="Status"><span class="status ' + b.status + '">' + b.status + '</span></td>' +
          '<td data-label="Customer">' + (b.customer_name || '') + '<br/>' + b.customer_number + '</td>' +
          '<td data-label="Pickup">' + b.pickup_location + '</td>' +
          '<td data-label="Dropoff">' + b.dropoff_location + '</td>' +
          '<td data-label="Date/Time" class="muted-text">' + new Date(b.ride_datetime).toLocaleString() + '</td>' +
          '<td data-label="Pax">' + b.passengers + '</td>' +
          '<td data-label="Fare">' + b.currency + ' ' + Number(b.fare_amount).toFixed(2) + '</td>' +
          '<td data-label="Fare Earn">' + b.currency + ' ' + Number(b.fare_amount).toFixed(2) + '</td>' +
          '<td data-label="Pickup ETA">' + b.estimated_pickup_minutes + ' min</td>' +
          '<td data-label="Return">' + (b.waiting_return ? 'Yes' : 'No') + '</td>' +
        '</tr>';
      }).join('');

      tableWrap.innerHTML = '<table>' +
        '<thead>' +
          '<tr>' +
            '<th>ID</th>' +
            '<th>Status</th>' +
            '<th>Customer</th>' +
            '<th>Pickup</th>' +
            '<th>Dropoff</th>' +
            '<th>Date/Time</th>' +
            '<th>Pax</th>' +
            '<th>Fare</th>' +
            '<th>Fare Earn</th>' +
            '<th>Pickup ETA</th>' +
            '<th>Return</th>' +
          '</tr>' +
        '</thead>' +
        '<tbody>' +
          rows +
        '</tbody>' +
      '</table>';
    }

    function renderEarnings(bookings) {
      const today = new Date().toDateString();
      const total = bookings
        .filter(b => b.status === 'accepted' && new Date(b.ride_datetime).toDateString() === today)
        .reduce((sum, b) => sum + Number(b.fare_amount || 0), 0);
      const currency = bookings.find(b => b.currency)?.currency || 'MUR';
      todayEarnings.textContent = 'Today earnings: ' + currency + ' ' + total.toFixed(2);
    }

    function renderCalendar(bookings) {
      if (!bookings.length) {
        calendar.innerHTML = '<div class="empty">No accepted rides yet.</div>';
        return;
      }
      const groups = {};
      bookings.forEach(b => {
        const date = new Date(b.ride_datetime).toLocaleDateString();
        const start = new Date(b.ride_datetime).toLocaleTimeString();
        const end = b.ride_end_datetime ? new Date(b.ride_end_datetime).toLocaleTimeString() : '--';
        if (!groups[date]) groups[date] = [];
        groups[date].push({
          id: b.id,
          start,
          end,
          pickup: b.pickup_location,
          dropoff: b.dropoff_location,
          distanceKm: b.distance_km,
          fareAmount: b.fare_amount,
          currency: b.currency || 'MUR'
        });
      });

      const cards = Object.keys(groups).map(date => {
        const rows = groups[date].map(item =>
          '<div class="calendar-row">' +
            '<div class="calendar-time">#' + item.id + ' • ' + item.start + ' - ' + item.end + '</div>' +
            '<div class="calendar-loc">' + item.pickup + ' → ' + item.dropoff + '</div>' +
            '<div>' +
              '<span class="badge">' + (item.distanceKm || 0).toFixed(2) + ' km</span>' +
              '<span class="badge">' + item.currency + ' ' + Number(item.fareAmount || 0).toFixed(2) + '</span>' +
            '</div>' +
          '</div>'
        ).join('');
        return '<div class="calendar-card">' +
          '<div class="calendar-date">' + date + '</div>' +
          rows +
        '</div>';
      }).join('');

      calendar.innerHTML = '<h2 class="calendar-title">Accepted Rides Calendar</h2>' + cards;
    }

    refreshBtn.addEventListener('click', fetchBookings);
    statusFilter.addEventListener('change', fetchBookings);
    createTestBtn.addEventListener('click', async function () {
      await fetch('/api/bookings/test', { method: 'POST' });
      await fetchBookings();
    });

    async function refreshDriverLive() {
      const res = await fetch('/api/driver/location?admin=1&includeAddress=1');
      const data = await res.json();
      if (data && data.ok) {
        const updatedAt = data.updated_at ? new Date(data.updated_at).toLocaleTimeString() : '';
        const address = data.address || (data.lat.toFixed(5) + ', ' + data.lng.toFixed(5));
        driverLive.textContent = 'Driver location: ' + address + (updatedAt ? ' (updated ' + updatedAt + ')' : '');
        const latlng = [data.lat, data.lng];
        if (!driverMarker) {
          driverMarker = L.marker(latlng).addTo(driverMap).bindPopup('Driver');
        } else {
          driverMarker.setLatLng(latlng);
        }
        driverMap.setView(latlng, 13);
      } else {
        driverLive.textContent = 'Driver location: not available';
      }
    }

    tabs.forEach(btn => {
      btn.addEventListener('click', () => {
        tabs.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const target = btn.getAttribute('data-tab');
        tabRides.style.display = target === 'rides' ? 'block' : 'none';
        tabSettings.style.display = target === 'settings' ? 'block' : 'none';
      });
    });

    settingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(settingsForm);
      const payload = Object.fromEntries(formData.entries());
      payload.unavailableMode = settingsForm.unavailableMode.checked;
      payload.driverOnline = settingsForm.driverOnline.checked;
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        saveStatus.style.display = 'inline-flex';
        setTimeout(() => { saveStatus.style.display = 'none'; }, 2000);
      }
    });

    fetchBookings();
    refreshDriverLive();
    setInterval(refreshDriverLive, 5000);
  </script>
</body>
</html>`;
}

module.exports = { adminPageHtml };
