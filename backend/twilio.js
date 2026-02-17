const twilio = require('twilio');
const { TWILIO_SID, TWILIO_TOKEN, TWILIO_NUMBER } = process.env;
const client = twilio(TWILIO_SID, TWILIO_TOKEN);

exports.sendSms = (to, body) =>
  client.messages.create({ body, to, from: TWILIO_NUMBER });

// Updated: All new voice calls use your AI voice agent route
exports.sendVoice = (to, name, program, memStoreId, profileId) => {
  const callUrl = `https://carelon-demo.onrender.com/api/ai-voice-convo?...&memStoreId=${encodeURIComponent(memStoreId)}&profileId=${encodeURIComponent(profileId)}`;
  console.log("Twilio Voice call URL:", callUrl);
  return client.calls.create({
    to,
    from: TWILIO_NUMBER,
    url: callUrl
  });
};
