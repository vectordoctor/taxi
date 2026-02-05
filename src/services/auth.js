const bcrypt = require("bcryptjs");
const { getDb } = require("../db");

async function findUserByEmail(email) {
  const db = await getDb();
  return db.get("SELECT * FROM users WHERE email = ?", [email]);
}

async function findUserById(id) {
  const db = await getDb();
  return db.get("SELECT * FROM users WHERE id = ?", [id]);
}

async function createUser({ email, password, role }) {
  const db = await getDb();
  const passwordHash = await bcrypt.hash(password, 10);
  const now = new Date().toISOString();
  const result = await db.run(
    "INSERT INTO users (email, password_hash, role, created_at) VALUES (?, ?, ?, ?)",
    [email, passwordHash, role, now]
  );
  return result.lastID;
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

async function ensureSystemUsers() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const driverEmail = process.env.DRIVER_EMAIL;
  const driverPassword = process.env.DRIVER_PASSWORD;

  if (adminEmail && adminPassword) {
    const existing = await findUserByEmail(adminEmail);
    if (!existing) {
      await createUser({ email: adminEmail, password: adminPassword, role: "admin" });
    }
  }

  if (driverEmail && driverPassword) {
    const existing = await findUserByEmail(driverEmail);
    if (!existing) {
      await createUser({ email: driverEmail, password: driverPassword, role: "driver" });
    }
  }
}

module.exports = {
  findUserByEmail,
  findUserById,
  createUser,
  verifyPassword,
  ensureSystemUsers
};
