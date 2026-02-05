const twilio = require('twilio');
const { TWILIO_SID, TWILIO_TOKEN, TWILIO_NUMBER } = process.env;

const client = twilio(TWILIO_SID, TWILIO_TOKEN);

exports.sendSms = (to, body) =>
  client.messages.create({ body, to, from: TWILIO_NUMBER });

exports.sendVoice = (to, name, program) =>
  client.calls.create({
    to,
    from: TWILIO_NUMBER,
    twiml: `<Response><Say voice="Kimberly-Neural">Hello ${name}, this is Caralon Health! Congratulations on starting the ${program} program. If you have questions, reply YES to your welcome text, you'll see that shortly!</Say></Response>`
  });
