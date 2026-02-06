const twilio = require('twilio');
const { TWILIO_SID, TWILIO_TOKEN, TWILIO_NUMBER } = process.env;
const client = twilio(TWILIO_SID, TWILIO_TOKEN);

exports.sendSms = (to, body) =>
  client.messages.create({ body, to, from: TWILIO_NUMBER });

// Updated: All new voice calls use your AI voice agent route
exports.sendVoice = (to, name, program) =>
  client.calls.create({
    to,
    from: TWILIO_NUMBER,
    url: `https://YOUR-RENDER-APP.onrender.com/api/ai-voice-convo?firstName=${encodeURIComponent(name.split(' ')[0])}&program=${encodeURIComponent(program)}&phone=${encodeURIComponent(to)}`
  });
