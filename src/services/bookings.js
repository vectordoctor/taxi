const { getDb } = require("../db");

async function createBooking(data) {
  const db = await getDb();
  const now = new Date().toISOString();
  const result = await db.run(
    `INSERT INTO bookings (
      customer_id, customer_number, customer_name, pickup_location, pickup_lat, pickup_lng, dropoff_location, dropoff_lat, dropoff_lng, waiting_return,
      ride_datetime, passengers, waiting_minutes, distance_km, ride_duration_minutes, ride_end_datetime,
      estimated_pickup_minutes, fare_amount, currency, status,
      driver_response, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  , [
      data.customerId || null,
      data.customerNumber,
      data.customerName,
      data.pickupLocation,
      data.pickupLat || null,
      data.pickupLng || null,
      data.dropoffLocation,
      data.dropoffLat || null,
      data.dropoffLng || null,
      data.waitingReturn ? 1 : 0,
      data.rideDateTime,
      data.passengers,
      data.waitingMinutes,
      data.distanceKm,
      data.rideDurationMinutes || null,
      data.rideEndDateTime || null,
      data.estimatedPickupMinutes,
      data.fareAmount,
      data.currency,
      data.status,
      data.driverResponse || null,
      now,
      now
    ]
  );
  return result.lastID;
}

async function updateBookingStatus(id, status, driverResponse) {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.run(
    `UPDATE bookings SET status = ?, driver_response = ?, updated_at = ? WHERE id = ?`,
    [status, driverResponse || null, now, id]
  );
}

async function getBookingById(id) {
  const db = await getDb();
  return db.get(`SELECT * FROM bookings WHERE id = ?`, [id]);
}

async function listBookings(status) {
  const db = await getDb();
  if (status) {
    return db.all(`SELECT * FROM bookings WHERE status = ? ORDER BY created_at DESC`, [status]);
  }
  return db.all(`SELECT * FROM bookings ORDER BY created_at DESC`);
}

async function listBookingsByCustomerId(customerId) {
  const db = await getDb();
  return db.all(`SELECT * FROM bookings WHERE customer_id = ? ORDER BY created_at DESC`, [customerId]);
}

async function listBookingsByPhone(phone) {
  const db = await getDb();
  return db.all(`SELECT * FROM bookings WHERE customer_number = ? ORDER BY created_at DESC`, [phone]);
}

async function setDriverLocation(lat, lng) {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO driver_status (id, driver_lat, driver_lng, updated_at)
     VALUES (1, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET driver_lat = excluded.driver_lat, driver_lng = excluded.driver_lng, updated_at = excluded.updated_at`,
    [lat, lng, now]
  );
}

async function getDriverLocation() {
  const db = await getDb();
  return db.get(`SELECT driver_lat as lat, driver_lng as lng, updated_at FROM driver_status WHERE id = 1`);
}

module.exports = {
  createBooking,
  updateBookingStatus,
  getBookingById,
  listBookings,
  listBookingsByCustomerId,
  listBookingsByPhone,
  setDriverLocation,
  getDriverLocation
};
