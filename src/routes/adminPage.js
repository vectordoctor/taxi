function adminPageHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Taxi Bookings Admin</title>
  <style>
    :root {
      color-scheme: light;
      font-family: "Work Sans", "Segoe UI", sans-serif;
    }
    body {
      margin: 0;
      background: #f6f4ef;
      color: #1b1b1b;
    }
    header {
      padding: 24px 32px;
      background: #1f2a44;
      color: #f6f4ef;
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
    button, select {
      border: none;
      border-radius: 999px;
      padding: 10px 16px;
      font-weight: 600;
      cursor: pointer;
    }
    button.primary {
      background: #f05a28;
      color: white;
    }
    button.ghost {
      background: transparent;
      border: 1px solid #1f2a44;
      color: #1f2a44;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: white;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 12px 40px rgba(27, 27, 27, 0.08);
    }
    th, td {
      padding: 12px 14px;
      text-align: left;
      border-bottom: 1px solid #eceae4;
      font-size: 14px;
      vertical-align: top;
    }
    th {
      background: #fdf9f2;
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
      color: #6b6b6b;
    }
    .calendar-title {
      margin: 8px 0 12px;
      font-size: 18px;
      color: #1f2a44;
    }
    .calendar-card {
      background: white;
      border-radius: 14px;
      padding: 12px 14px;
      margin-bottom: 10px;
      box-shadow: 0 8px 24px rgba(27, 27, 27, 0.08);
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
    .calendar-time { font-weight: 600; color: #1f2a44; }
    .calendar-loc { color: #6b6b6b; font-size: 13px; }
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
    <h1>Taxi Bookings Admin</h1>
    <p>Review incoming requests and approve rides.</p>
  </header>
  <main>
    <div class="toolbar">
      <button class="primary" id="refresh">Refresh</button>
      <button class="ghost" id="driverLocation">Use My Current Location (Driver)</button>
      <button class="ghost" id="createTest">Create Test Booking</button>
      <select id="statusFilter">
        <option value="">All</option>
        <option value="pending">Pending</option>
        <option value="accepted">Accepted</option>
        <option value="declined">Declined</option>
        <option value="completed">Completed</option>
      </select>
      <span id="updated"></span>
    </div>
    <div id="calendar"></div>
    <div id="tableWrap"></div>
  </main>

  <script>
    const tableWrap = document.getElementById('tableWrap');
    const statusFilter = document.getElementById('statusFilter');
    const updated = document.getElementById('updated');
    const refreshBtn = document.getElementById('refresh');
    const createTestBtn = document.getElementById('createTest');
    const driverLocationBtn = document.getElementById('driverLocation');
    const calendar = document.getElementById('calendar');

    async function fetchBookings() {
      const status = statusFilter.value;
      const url = status ? '/api/bookings?status=' + encodeURIComponent(status) : '/api/bookings';
      const res = await fetch(url);
      const data = await res.json();
      renderTable(data);
      renderCalendar(data.filter(b => b.status === 'accepted'));
      updated.textContent = 'Updated ' + new Date().toLocaleTimeString();
    }

    async function updateStatus(id, action) {
      await fetch('/api/bookings/' + id + '/' + action, { method: 'POST' });
      await fetchBookings();
    }

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
          '<td data-label="Date/Time">' + new Date(b.ride_datetime).toLocaleString() + '</td>' +
          '<td data-label="Pax">' + b.passengers + '</td>' +
          '<td data-label="Fare">' + b.currency + ' ' + Number(b.fare_amount).toFixed(2) + '</td>' +
          '<td data-label="Pickup ETA">' + b.estimated_pickup_minutes + ' min</td>' +
          '<td data-label="Return">' + (b.waiting_return ? 'Yes' : 'No') + '</td>' +
          '<td>' +
            '<div class="actions">' +
              '<button class="ghost" onclick="updateStatus(' + b.id + ', \\'accept\\')">Accept</button>' +
              '<button class="ghost" onclick="updateStatus(' + b.id + ', \\'decline\\')">Decline</button>' +
            '</div>' +
          '</td>' +
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
            '<th>Pickup ETA</th>' +
            '<th>Return</th>' +
            '<th>Actions</th>' +
          '</tr>' +
        '</thead>' +
        '<tbody>' +
          rows +
        '</tbody>' +
      '</table>';
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
        groups[date].push({ id: b.id, start, end, pickup: b.pickup_location, dropoff: b.dropoff_location });
      });

      const cards = Object.keys(groups).map(date => {
        const rows = groups[date].map(item =>
          '<div class="calendar-row">' +
            '<div class="calendar-time">#' + item.id + ' • ' + item.start + ' - ' + item.end + '</div>' +
            '<div class="calendar-loc">' + item.pickup + ' → ' + item.dropoff + '</div>' +
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

    driverLocationBtn.addEventListener('click', function () {
      if (!navigator.geolocation) {
        alert('Geolocation is not supported by your browser.');
        return;
      }
      navigator.geolocation.getCurrentPosition(async function (pos) {
        await fetch('/driver/location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude
          })
        });
        await fetchBookings();
        alert('Driver location updated.');
      }, function () {
        alert('Unable to get your location.');
      });
    });

    fetchBookings();
  </script>
</body>
</html>`;
}

module.exports = { adminPageHtml };
