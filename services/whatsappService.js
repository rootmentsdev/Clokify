const axios = require('axios');

async function sendWhatsAppMessage(to, message) {
  const phoneNumberId = process.env.WHATSAPP_META_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_META_TOKEN;

  // Validate required environment variables
  if (!phoneNumberId) {
    throw new Error('WHATSAPP_META_PHONE_NUMBER_ID environment variable is not set');
  }
  
  if (!token) {
    throw new Error('WHATSAPP_META_TOKEN environment variable is not set');
  }

  // Clean the token to remove any invalid characters
  const cleanToken = token.trim().replace(/[^\w\-\.]/g, '');
  
  const url = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;
  const data = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: message },
  };
  
  try {
    await axios.post(url, data, {
      headers: {
        Authorization: `Bearer ${cleanToken}`,
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('WhatsApp API Error:', error.response?.data || error.message);
    throw error;
  }
}

module.exports = { sendWhatsAppMessage }; 