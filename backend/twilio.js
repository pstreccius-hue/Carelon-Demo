const twilio = require('twilio');
const { TWILIO_SID, TWILIO_TOKEN, TWILIO_NUMBER } = process.env;
const client = twilio(TWILIO_SID, TWILIO_TOKEN);

exports.sendSms = (to, body) =>
  client.messages.create({ body, to, from: TWILIO_NUMBER });

// Initiate a call with all useful params in URL
exports.sendVoice = (to, name, program) =>
  client.calls.create({
    to,
    from: TWILIO_NUMBER,
    url: `https://carelon-demo.onrender.com/api/voice-twiml?name=${encodeURIComponent(name)}&program=${encodeURIComponent(program)}&phone=${encodeURIComponent(to)}`
  });
