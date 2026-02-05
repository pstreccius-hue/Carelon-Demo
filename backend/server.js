const express = require('express');
const VoiceResponse = require('twilio').twiml.VoiceResponse;
const { sendIdentify, sendTrack } = require('./segment');
const bodyParser = require('body-parser');
const cors = require('cors');
const { OpenAI } = require('openai');
const { sendSms, sendVoice } = require('./twilio');
const axios = require('axios'); // Needed for Segment trait updates in AI route
require('dotenv').config();

const app = express();

// CORS config for dev/demo
app.use(cors({ origin: '*' }));
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

//-------- Existing SIGNUP FLOW --------//
app.post('/api/signup', async (req, res) => {
  const user = req.body;
  try {
    await sendIdentify(user);
    await sendTrack(user, "Program Enrolled", { program: user.program });
    await sendSms(user.phone, `Hi ${user.name}, welcome to the ${user.program}!`);
    await sendVoice(user.phone, user.name, user.program); // Uses the standard repeat-message voice route
    res.json({ success: true, message: "Events sent and comms triggered." });
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

//-------- TwiML Demo (Repeat/Press 1) --------//
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
    { voice: 'Polly.Kimberly', language: 'en-US' },
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
    await sendTrack(
      { name, phone, program },
      "Voice: Requested Repeat Message",
      { action: "Repeat", interaction: "Press 1", program }
    );
    twiml.redirect(`/api/voice-twiml?name=${encodeURIComponent(name)}&program=${encodeURIComponent(program)}&phone=${encodeURIComponent(phone)}`);
  } else {
    twiml.say({ voice: 'Polly.Kimberly', language: 'en-US' }, 'Goodbye.');
    twiml.hangup();
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

//-------- AI Agent Conversational Voice Route --------//

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const convoState = {}; // Simple in-memory, use Redis/DB for scale

app.post('/api/ai-voice-convo', async (req, res) => {
  const callSid = req.body.CallSid;
  let lastAIReply = `Hello! Thank you for signing up with Carelon Health. Do you have questions about other programs, or would you like to enroll in something else?`;

  try {
    // 1st turn or previous context
    if (req.body.SpeechResult) {
      convoState[callSid] = convoState[callSid] || [];
      convoState[callSid].push({ role: 'user', content: req.body.SpeechResult });

      const messages = [
        { role: "system", content: `You are Carelon Health's automated agent. Greet the caller, give them a quick overview of the program they signed up for, then discuss available wellness programs, but DO NOT answer health, treatment, or PII questions—instead, advise the caller to talk to their provider for such info. If they want to enroll in another program, confirm, and use ENROLL: [program name] in your reply.` },
        ...(convoState[callSid] || []),
      ];
      const aiRes = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages,
      });
      lastAIReply = aiRes.choices[0].message.content;

      // Detect enrollment with "ENROLL: <program>" pattern
      const signupMatch = lastAIReply.match(/ENROLL: ([A-Za-z ]+)/i);
      if (signupMatch) {
        await axios.post('https://api.segment.io/v1/identify', {
  userId: req.body.To, // <-- this is the recipient/user's phone number!
  traits: { additional_program: signupMatch[1] }
}, { auth: { username: process.env.SEGMENT_WRITE_KEY, password: "" } });

      convoState[callSid].push({ role: 'assistant', content: lastAIReply });
    } else {
      convoState[callSid] = [{ role: 'assistant', content: lastAIReply }];
    }

    const twiml = new VoiceResponse();
    const gather = twiml.gather({
      input: 'speech',
      timeout: 3,
      action: '/api/ai-voice-convo',
      method: 'POST'
    });
    gather.say({ voice: 'Polly.Kimberly', language: 'en-US' }, lastAIReply);

    // If timeout: end politely
    twiml.say({ voice: 'Polly.Kimberly', language: 'en-US' }, "Thank you for your time. Goodbye!");
    twiml.hangup();

    res.type('text/xml');
    res.send(twiml.toString());

  } catch (err) {
    // Graceful error handling
    const twiml = new VoiceResponse();
    twiml.say("Sorry, I'm having trouble at the moment. Please contact Carelon Health directly. Goodbye.");
    twiml.hangup();
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

app.get('/health', (req, res) => res.send('OK'));

app.listen(process.env.PORT || 3001, () => console.log('Backend running on 3001'));
