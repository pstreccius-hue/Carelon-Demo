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

app.use(cors({ origin: '*' }));
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

//-------- SIGNUP FLOW --------//
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
  const program = req.query.program || 'a Carelon Health program';
   const firstName = req.query.firstName || 'Participant';

  const programOverviews = {
    "Diabetes Prevention": "Diabetes Prevention helps you adopt healthy habits to minimize your risk through lifestyle changes, coaching, and nutrition support.",
    "Heart Health": "Heart Health provides guidance and encouragement for a stronger cardiovascular system, including exercise, nutrition, and regular check-ins.",
    "Weight Loss": "Weight Loss helps you safely and sustainably shed pounds with personal coaching, nutrition tips, and weekly accountability."
  };
  const overview = programOverviews[program] || '';

   let lastAIReply;
  if (req.body.SpeechResult) {
    convoState[callSid] = convoState[callSid] || [];
    convoState[callSid].push({ role: 'user', content: req.body.SpeechResult });

    const systemPrompt = `You are Carelon Health's automated agent. Always greet and refer to the caller using their first name: "${firstName}". After greeting them, give a friendly, concise overview of the "${program}" program: "${overview}". Do NOT answer personal health or PII questions...`;
    const messages = [
      { role: "system", content: systemPrompt },
      ...(convoState[callSid] || [])
    ];
    const aiRes = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo', // or 'gpt-4'
      messages,
    });
    lastAIReply = aiRes.choices[0].message.content;
    convoState[callSid].push({ role: 'assistant', content: lastAIReply });

    // ✨ FIX: use req.body.To as userId (callee, the real user)
    const signupMatch = lastAIReply.match(/ENROLL: ([A-Za-z ]+)/i);
    if (signupMatch) {
      await axios.post('https://api.segment.io/v1/identify', {
        userId: req.body.To, // <-- THIS IS THE FIX!
        traits: { additional_program: signupMatch[1] }
      }, { auth: { username: process.env.SEGMENT_WRITE_KEY, password: "" } });
    }

  } else {
    // First answer: overview prompt
    const firstPrompt = `You are Carelon Health's automated agent. Greet the caller by name and give a brief but welcoming overview of the "${program}" program: "${overview}".`;
    const aiRes = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: "system", content: firstPrompt }]
    });
    lastAIReply = aiRes.choices[0].message.content;
    convoState[callSid] = [{ role: 'assistant', content: lastAIReply }];
  }

  const twiml = new VoiceResponse();
  const gather = twiml.gather({
    input: 'speech',
    timeout: 5,
    action: '/api/ai-voice-convo',
    method: 'POST'
  });
  gather.say({ voice: 'Polly.Kimberly', language: 'en-US' }, lastAIReply);

  twiml.say({ voice: 'Polly.Kimberly', language: 'en-US' }, "Thank you for your time. Goodbye!");
  twiml.hangup();

  res.type('text/xml');
  res.send(twiml.toString());
});

app.get('/health', (req, res) => res.send('OK'));

app.listen(process.env.PORT || 3001, () => console.log('Backend running on 3001'));
