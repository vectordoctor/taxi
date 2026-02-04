const path = require("path");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");

const DB_PATH = process.env.SQLITE_PATH || path.join(__dirname, "../../data.sqlite");

let dbPromise;

async function getDb() {
  if (!dbPromise) {
    dbPromise = open({
      filename: DB_PATH,
      driver: sqlite3.Database
    });
    const db = await dbPromise;
    await db.exec(`
      CREATE TABLE IF NOT EXISTS bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_number TEXT NOT NULL,
        customer_name TEXT,
        pickup_location TEXT NOT NULL,
        pickup_lat REAL,
        pickup_lng REAL,
        dropoff_lat REAL,
        dropoff_lng REAL,
        waiting_return INTEGER NOT NULL DEFAULT 0,
        ride_duration_minutes INTEGER,
        ride_end_datetime TEXT,
        dropoff_location TEXT NOT NULL,
        ride_datetime TEXT NOT NULL,
        passengers INTEGER NOT NULL,
        waiting_minutes INTEGER NOT NULL,
        distance_km REAL NOT NULL,
        estimated_pickup_minutes INTEGER NOT NULL,
        fare_amount REAL NOT NULL,
        currency TEXT NOT NULL,
        status TEXT NOT NULL,
        driver_response TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS driver_status (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        driver_lat REAL,
        driver_lng REAL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    await ensureColumn(db, "bookings", "pickup_lat", "REAL");
    await ensureColumn(db, "bookings", "pickup_lng", "REAL");
    await ensureColumn(db, "bookings", "dropoff_lat", "REAL");
    await ensureColumn(db, "bookings", "dropoff_lng", "REAL");
    await ensureColumn(db, "bookings", "waiting_return", "INTEGER");
    await ensureColumn(db, "bookings", "ride_duration_minutes", "INTEGER");
    await ensureColumn(db, "bookings", "ride_end_datetime", "TEXT");
  }
  return dbPromise;
}

async function ensureColumn(db, table, column, type) {
  const info = await db.all(`PRAGMA table_info(${table});`);
  const exists = info.some((row) => row.name === column);
  if (!exists) {
    await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type};`);
  }
}

module.exports = { getDb };
