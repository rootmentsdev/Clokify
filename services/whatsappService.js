const axios = require('axios');
const {
  metaToken,
  metaPhoneNumberId,
} = require('../config/whatsappConfig');

async function sendWhatsAppMessage(to, message) {
  const url = `https://graph.facebook.com/v17.0/${metaPhoneNumberId}/messages`;
  const data = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: message },
  };
  await axios.post(url, data, {
    headers: {
      Authorization: `Bearer ${metaToken}`,
      'Content-Type': 'application/json',
    },
  });
}

module.exports = { sendWhatsAppMessage }; 