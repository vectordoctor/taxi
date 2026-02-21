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
    .version-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: #2a2a2a;
      color: #ffcc00;
      border: 1px solid rgba(255, 204, 0, 0.45);
      padding: 6px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.04em;
    }
    .header-actions {
      display: flex;
      gap: 8px;
      align-items: center;
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
      table-layout: fixed;
    }
    th, td {
      padding: 12px 14px;
      text-align: left;
      border-bottom: 1px solid #eeeeee;
      font-size: 14px;
      vertical-align: top;
      color: #1b1b1b;
      width: 14.285%;
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
      color: #1b1b1b;
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
    .day-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 10px;
      flex-wrap: wrap;
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
      <div class="header-actions">
        <span class="version-badge">v1.0</span>
        <a class="home-link" href="/">Home</a>
      </div>
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
      <span id="updated"></span>
      <span class="pill" id="driverLive">Driver location: --</span>
    </div>
    <div class="calendar-card">
      <div class="day-header">
        <div class="calendar-date">Daily Earnings (Last & Next 3 Weeks)</div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end;">
          <div class="badge" id="chartRange">--</div>
          <div class="badge" id="monthEarnings">Month: --</div>
        </div>
      </div>
      <canvas id="earningsChart" height="140" aria-label="Daily earnings chart" role="img"></canvas>
    </div>
    <div id="driverMap"></div>
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
    const updated = document.getElementById('updated');
    const refreshBtn = document.getElementById('refresh');
    const driverLive = document.getElementById('driverLive');
    const tabs = document.querySelectorAll('.tab-btn');
    const tabRides = document.getElementById('tab-rides');
    const tabSettings = document.getElementById('tab-settings');
    const settingsForm = document.getElementById('settingsForm');
    const saveStatus = document.getElementById('saveStatus');
    const todayEarnings = document.getElementById('todayEarnings');
    const chartCanvas = document.getElementById('earningsChart');
    const chartRange = document.getElementById('chartRange');
    const monthEarnings = document.getElementById('monthEarnings');
    const driverMap = L.map('driverMap').setView([-20.3484, 57.5522], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(driverMap);
    let driverMarker = null;

    async function fetchBookings() {
      const res = await fetch('/api/bookings?status=accepted');
      const data = await res.json();
      renderTable(data);
      renderEarnings(data);
      renderChart(data);
      updated.textContent = 'Updated ' + new Date().toLocaleTimeString();
    }

    // Admin does not accept/decline bookings. Driver handles approvals.

    function renderTable(bookings) {
      if (!bookings.length) {
        tableWrap.innerHTML = '<div class="empty">No bookings to show.</div>';
        return;
      }
      const groups = {};
      bookings.forEach(b => {
        const dateKey = new Date(b.ride_datetime).toDateString();
        if (!groups[dateKey]) groups[dateKey] = [];
        groups[dateKey].push(b);
      });
      const orderedDates = Object.keys(groups).sort((a, b) => new Date(a) - new Date(b));
      const sections = orderedDates.map(dateKey => {
        const dayBookings = groups[dateKey].sort((a, b) => new Date(a.ride_datetime) - new Date(b.ride_datetime));
        const currency = dayBookings.find(b => b.currency)?.currency || 'MUR';
        const dayTotal = dayBookings.reduce((sum, b) => sum + Number(b.fare_amount || 0), 0);
        const rows = dayBookings.map(function (b) {
          return '<tr>' +
            '<td data-label="Customer">' + (b.customer_name || '') + '<br/>' + b.customer_number + '</td>' +
            '<td data-label="Pickup">' + b.pickup_location + '</td>' +
            '<td data-label="Dropoff">' + b.dropoff_location + '</td>' +
            '<td data-label="Date/Time" class="muted-text">' + new Date(b.ride_datetime).toLocaleString() + '</td>' +
            '<td data-label="Pax">' + b.passengers + '</td>' +
            '<td data-label="Fare">' + b.currency + ' ' + Number(b.fare_amount).toFixed(2) + '</td>' +
            '<td data-label="Fare Earn">' + b.currency + ' ' + Number(b.fare_amount).toFixed(2) + '</td>' +
          '</tr>';
        }).join('');
        return '<div class="calendar-card">' +
          '<div class="day-header">' +
            '<div class="calendar-date">' + dateKey + '</div>' +
            '<div class="badge">Day Earnings: ' + currency + ' ' + dayTotal.toFixed(2) + '</div>' +
          '</div>' +
          '<table>' +
            '<thead>' +
              '<tr>' +
                '<th>Customer</th>' +
                '<th>Pickup</th>' +
                '<th>Dropoff</th>' +
                '<th>Date/Time</th>' +
                '<th>Pax</th>' +
                '<th>Fare</th>' +
                '<th>Fare Earn</th>' +
              '</tr>' +
            '</thead>' +
            '<tbody>' + rows + '</tbody>' +
          '</table>' +
        '</div>';
      }).join('');
      tableWrap.innerHTML = sections;
    }

    function renderEarnings(bookings) {
      const today = new Date().toDateString();
      const total = bookings
        .filter(b => b.status === 'accepted' && new Date(b.ride_datetime).toDateString() === today)
        .reduce((sum, b) => sum + Number(b.fare_amount || 0), 0);
      const currency = bookings.find(b => b.currency)?.currency || 'MUR';
      todayEarnings.textContent = 'Today earnings: ' + currency + ' ' + total.toFixed(2);
    }

    function renderChart(bookings) {
      const ctx = chartCanvas.getContext('2d');
      const today = new Date();
      const start = new Date(today);
      start.setDate(start.getDate() - 21);
      const end = new Date(today);
      end.setDate(end.getDate() + 21);
      chartRange.textContent = start.toLocaleDateString() + ' → ' + end.toLocaleDateString();

      const totals = {};
      const monthTotals = {};
      bookings.forEach(b => {
        const d = new Date(b.ride_datetime);
        const key = d.toDateString();
        totals[key] = (totals[key] || 0) + Number(b.fare_amount || 0);
        const monthKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        monthTotals[monthKey] = (monthTotals[monthKey] || 0) + Number(b.fare_amount || 0);
      });
      const labels = [];
      const values = [];
      const cursor = new Date(start);
      while (cursor <= end) {
        const key = cursor.toDateString();
        labels.push(cursor.toLocaleDateString());
        values.push(totals[key] || 0);
        cursor.setDate(cursor.getDate() + 1);
      }

      const maxVal = Math.max(10, ...values);
      const w = chartCanvas.width = chartCanvas.parentElement.clientWidth - 10;
      const h = chartCanvas.height = 140;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#111111';
      ctx.fillRect(0, 0, w, h);

      const padding = 18;
      const innerW = w - padding * 2;
      const innerH = h - padding * 2;
      const stepX = innerW / Math.max(1, values.length - 1);

      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.moveTo(padding, h - padding);
      ctx.lineTo(w - padding, h - padding);
      ctx.stroke();

      ctx.strokeStyle = '#ffcc00';
      ctx.lineWidth = 2;
      ctx.beginPath();
      values.forEach((val, i) => {
        const x = padding + i * stepX;
        const y = h - padding - (val / maxVal) * innerH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      ctx.fillStyle = '#ffcc00';
      values.forEach((val, i) => {
        const x = padding + i * stepX;
        const y = h - padding - (val / maxVal) * innerH;
        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.fillStyle = '#f5f5f5';
      ctx.font = '10px "Space Grotesk", sans-serif';
      values.forEach((_, i) => {
        if (i % 7 !== 0) return;
        const x = padding + i * stepX;
        const label = labels[i].slice(0, 5);
        ctx.fillText(label, x - 10, h - 4);
      });

      const monthKey = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
      const monthTotal = monthTotals[monthKey] || 0;
      monthEarnings.textContent = 'Month: ' + (bookings.find(b => b.currency)?.currency || 'MUR') + ' ' + monthTotal.toFixed(2);
    }

    refreshBtn.addEventListener('click', fetchBookings);

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
