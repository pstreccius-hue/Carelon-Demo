const express = require('express');
const VoiceResponse = require('twilio').twiml.VoiceResponse;
const { sendIdentify, sendTrack } = require('./segment');
const bodyParser = require('body-parser');
const cors = require('cors');
const { OpenAI } = require('openai');
const { sendSms, sendVoice } = require('./twilio');
require('dotenv').config();

const app = express();

// Wider CORS config for dev/demo:
app.use(cors({ origin: '*' }));

app.use(bodyParser.json());
// 👇 This parses form posts (needed for Twilio DTMF):
app.use(express.urlencoded({ extended: true }));

app.post('/api/signup', async (req, res) => {
  const user = req.body;
  try {
    await sendIdentify(user);
    await sendTrack(user, "Program Enrolled", { program: user.program });
    await sendSms(user.phone, `Hi ${user.name}, welcome to the ${user.program}!`);
    await sendVoice(user.phone, user.name, user.program);
    res.json({ success: true, message: "Events sent and comms triggered." });
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

app.post('/api/voice-twiml', (req, res) => {
  const name = req.query.name || 'Participant';
  const program = req.query.program || 'your program';
  const phone = req.query.phone || '';

  const twiml = new VoiceResponse();

  const gather = twiml.gather({
    input: 'dtmf',
    numDigits: 1,
    timeout: 5,
    action: `/api/voice-twiml-loop?name=${encodeURIComponent(name)}&program=${encodeURIComponent(program)}&phone=${encodeURIComponent(phone)}`
  });
  gather.say(
    { voice: 'Kimberly' },
    `Hello ${name}, this is Carelon Health! Congratulations on starting the ${program} program. Press 1 to hear this message again.`
  );

  res.type('text/xml');
  res.send(twiml.toString());
});

app.post('/api/voice-twiml-loop', async (req, res) => {
  const name = req.query.name || 'Participant';
  const program = req.query.program || 'your program';
  const phone = req.query.phone || '';
  const digit = req.body.Digits;

  const twiml = new VoiceResponse();

  if (digit === '1') {
    // Track repeat action in Segment!
    await sendTrack(
      { name, phone, program },
      "Voice: Requested Repeat Message",
      { action: "Repeat", interaction: "Press 1", program }
    );
    // Repeat the message (redirect back, preserve all params)
    twiml.redirect(`/api/voice-twiml?name=${encodeURIComponent(name)}&program=${encodeURIComponent(program)}&phone=${encodeURIComponent(phone)}`);
  } else {
    twiml.say({ voice: 'Kimberly' }, 'Goodbye.');
    twiml.hangup();
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

app.get('/health', (req, res) => res.send('OK'));

app.listen(process.env.PORT || 3001, () => console.log('Backend running on 3001'));
