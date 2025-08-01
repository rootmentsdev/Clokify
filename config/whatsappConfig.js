// WhatsApp configuration
require('dotenv').config();

module.exports = {
  metaToken: process.env.WHATSAPP_META_TOKEN,
  metaPhoneNumberId: process.env.WHATSAPP_META_PHONE_NUMBER_ID,
  verifyToken: process.env.META_VERIFY_TOKEN
}; 