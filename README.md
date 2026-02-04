# WhatsApp Taxi Booking Backend

Backend for an independent taxi driver that takes ride requests via WhatsApp (Twilio), calculates fares, and requires driver approval before confirming.

## Features
- WhatsApp booking flow (Twilio webhook)
- Fare calculation with configurable rules
- Pickup time estimation (configurable defaults)
- Driver approval workflow (accept/decline)
- SQLite storage with booking status
- Admin endpoints for bookings and driver location

## Setup
1. Install dependencies
   - `npm install`
2. Configure environment
   - Copy `.env.example` to `.env` and fill Twilio values
3. Run
   - `npm start`
   - If you get a port permission error in a restricted environment: `npm run start:local`

## WhatsApp Booking Format
Send:
```
Pickup: 123 Main St
Dropoff: 500 Market St
Date: 2026-02-05
Time: 14:30
Passengers: 2
Waiting: 5
Distance: 12
Pickup_Distance: 4
```
- `Distance` (km) and `Pickup_Distance` (km from driver) are optional. Defaults apply if missing.

## Driver Commands
- `ACCEPT <id>`
- `DECLINE <id>`
- `LOC <lat> <lng>`

## Endpoints
- `POST /webhooks/whatsapp` Twilio webhook
- `GET /bookings?status=pending`
- `GET /admin` Admin UI
- `GET /book` Customer booking form
- `GET /settings` Pricing settings (Mauritius)
- `GET /api/bookings?status=pending` Admin JSON API
- `POST /api/bookings/:id/accept`
- `POST /api/bookings/:id/decline`
- `POST /driver/location` JSON body `{ "lat": 37.1, "lng": -122.2 }`

## Pricing Rules
Edit `src/config/pricing.js` or set env vars to adjust base fare, per‑km rate, passenger percentage, waiting time per minute, time/day surcharges, holidays, and peak hours.

## Maps / Traffic Estimates
Set `MAPS_PROVIDER=google` and `GOOGLE_MAPS_API_KEY` to enable live distance and pickup ETA via the Google Distance Matrix API. If missing, defaults are used.

## Admin UI
Open `/admin` to review bookings and accept/decline without WhatsApp.

## Notes
- Pickup time estimation is based on configurable defaults (no live traffic API yet).
- For production, add webhook validation and integrate a real maps/traffic service.
