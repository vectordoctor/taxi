const twilio = require("twilio");

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER;

let client;

function getClient() {
  if (!client) {
    if (!accountSid || !authToken) {
      return null;
    }
    client = twilio(accountSid, authToken);
  }
  return client;
}

async function sendWhatsAppMessage(toNumber, body) {
  const twilioClient = getClient();
  if (!twilioClient || !fromNumber) {
    console.warn("Twilio not configured. Skipping WhatsApp message.");
    return null;
  }
  return twilioClient.messages.create({
    from: `whatsapp:${fromNumber}`,
    to: `whatsapp:${toNumber}`,
    body
  });
}

module.exports = { sendWhatsAppMessage };
