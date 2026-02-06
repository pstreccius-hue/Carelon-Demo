const express = require('express');
const http = require('http');
const VoiceResponse = require('twilio').twiml.VoiceResponse;
const { sendIdentify, sendTrack } = require('./segment');
const bodyParser = require('body-parser');
const cors = require('cors');
const { OpenAI } = require('openai');
const { sendSms, sendVoice } = require('./twilio');
const axios = require('axios');
const WebSocket = require('ws');
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

//-------- DTMF DEMO (optional, remove if not needed) --------//
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
  console.log('TwiML sent to Twilio:');
  console.log(twiml);
  res.send(twiml.toString());
});

//-------- Conversation Relay TwiML Route --------//
app.post('/api/ai-voice-convo', (req, res) => {
  const userId = req.query.phone || 'anonymous';
  const firstName = req.query.firstName || 'Participant';
  const wsUrl = `wss://carelon-demo.onrender.com/conversation-relay`;

  // 100% bulletproof: single line, starts with <Response>, all quotes correct, no backtick
  const twiml =
    '<Response>' +
      '<Connect>' +
        `<ConversationRelay websocket-url="${wsUrl}?userId=${encodeURIComponent(userId)}&firstName=${encodeURIComponent(firstName)}"` +
        ' transcription-enabled="true"' +
        ` client-participant-identity="user_${userId}"` +
        ` client-display-name="${firstName}"` +
        ' bot-participant-identity="carelon_ai_agent"' +
        ' bot-display-name="Carelon AI Assistant"' +
        ' />' +
      '</Connect>' +
    '</Response>';

  res.type('text/xml');
  res.send(twiml);
});

//-------- HEALTH --------//
app.get('/health', (req, res) => res.send('OK'));

//------ CREATE HTTP + WebSocket SERVER ------//
const server = http.createServer(app);
server.listen(process.env.PORT || 3001, () => console.log('Backend running on 3001'));

//------ ConversationRelay WebSocket Handler ------//
const wss = new WebSocket.Server({ server, path: '/conversation-relay' });
wss.on('connection', (ws, req) => {
  console.log('ConversationRelay WebSocket connected!');
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      if (data.event === 'start') {
        ws.send(JSON.stringify({
          event: 'playText',
          participantIdentity: data.botParticipantIdentity,
          text: `Hello, ${req.url && new URL('http://x' + req.url).searchParams.get("firstName") || "there"}! How can I help you today?`,
        }));
      }
      else if (data.event === 'transcription') {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const userText = data.transcription?.transcript || '';
        const userId = req.url && new URL('http://x' + req.url).searchParams.get("userId");
        const firstName = req.url && new URL('http://x' + req.url).searchParams.get("firstName");
        const systemPrompt = `You are Carelon Health's automated agent. Always greet by first name (${firstName}). Answer high-level program questions, never specific treatment/PII.`;
        const messages = [
          { role: "system", content: systemPrompt },
          { role: "user", content: userText }
        ];
        const aiRes = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages,
        });
        const reply = aiRes.choices[0].message.content;
        ws.send(JSON.stringify({
          event: 'playText',
          participantIdentity: data.botParticipantIdentity,
          text: reply,
        }));

        const signupMatch = reply.match(/ENROLL: ([A-Za-z ]+)/i);
        if (signupMatch) {
          await axios.post('https://api.segment.io/v1/identify', {
            userId: userId,
            traits: { additional_program: signupMatch[1] }
          }, { auth: { username: process.env.SEGMENT_WRITE_KEY, password: "" } });
        }
      }
    } catch (err) {
      console.log('WebSocket error:', err);
    }
  });
  ws.on('close', () => {
    console.log('ConversationRelay WebSocket disconnected');
  });
});
