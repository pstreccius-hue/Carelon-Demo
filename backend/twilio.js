const twilio = require('twilio');
const { TWILIO_SID, TWILIO_TOKEN, TWILIO_NUMBER } = process.env;
const client = twilio(TWILIO_SID, TWILIO_TOKEN);

exports.sendSms = (to, body) =>
  client.messages.create({ body, to, from: TWILIO_NUMBER });

// Updated: All new voice calls use your AI voice agent route
exports.sendVoice = (to, name, program, memStoreId, profileId) =>
  client.calls.create({
    to,
    from: TWILIO_NUMBER,
    url: `https://carelon-demo.onrender.com/api/ai-voice-convo?phone=${encodeURIComponent(to)}&memStoreId=${encodeURIComponent(memStoreId)}&profileId=${encodeURIComponent(profileId)}`,
    statusCallback: 'https://carelon-demo.onrender.com/voice-status',
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
  });
