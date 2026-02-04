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
      padding: 24px 32px 48px;
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
    <div id="tableWrap"></div>
  </main>

  <script>
    const tableWrap = document.getElementById('tableWrap');
    const statusFilter = document.getElementById('statusFilter');
    const updated = document.getElementById('updated');
    const refreshBtn = document.getElementById('refresh');
    const createTestBtn = document.getElementById('createTest');
    const driverLocationBtn = document.getElementById('driverLocation');

    async function fetchBookings() {
      const status = statusFilter.value;
      const url = status ? '/api/bookings?status=' + encodeURIComponent(status) : '/api/bookings';
      const res = await fetch(url);
      const data = await res.json();
      renderTable(data);
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
          '<td>#' + b.id + '</td>' +
          '<td><span class="status ' + b.status + '">' + b.status + '</span></td>' +
          '<td>' + (b.customer_name || '') + '<br/>' + b.customer_number + '</td>' +
          '<td>' + b.pickup_location + '</td>' +
          '<td>' + b.dropoff_location + '</td>' +
          '<td>' + new Date(b.ride_datetime).toLocaleString() + '</td>' +
          '<td>' + b.passengers + '</td>' +
          '<td>' + b.currency + ' ' + Number(b.fare_amount).toFixed(2) + '</td>' +
          '<td>' + b.estimated_pickup_minutes + ' min</td>' +
          '<td>' + (b.waiting_return ? 'Yes' : 'No') + '</td>' +
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
