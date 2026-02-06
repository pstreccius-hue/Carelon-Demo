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

//----------------------------------------------------------
// Conversation Relay TwiML Route - COPY THIS EXACTLY
//----------------------------------------------------------
app.all('/api/ai-voice-convo', (req, res) => {
  // DO NOT encode here
  const userId = req.query.phone || 'anonymous'; // e.g., "+17017211093"
  const firstName = req.query.firstName || 'Participant';

  let wsUrl = 'wss://carelon-demo.onrender.com/conversation-relay?userId=' + userId + '&firstName=' + firstName;
  wsUrl = wsUrl.replace(/&/g, '&amp;');

  const twiml = '<Response><Connect><ConversationRelay websocket-url="' + wsUrl +
    '" transcription-enabled="true" client-participant-identity="user_' + userId +
    '" client-display-name="' + firstName +
    '" bot-participant-identity="carelon_ai_agent" bot-display-name="Carelon AI Assistant"/></Connect></Response>';

  res.type('text/xml');
  res.send(twiml);
});

//----------------------------------------------------------
// HEALTHCHECK
//----------------------------------------------------------
app.get('/health', (req, res) => res.send('OK'));

//----------------------------------------------------------
// WebSocket Server for Conversation Relay
//----------------------------------------------------------
const server = http.createServer(app);
server.listen(process.env.PORT || 3001, () => console.log('Backend running on 3001'));

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
        const systemPrompt = `You are Carelon Health's automated agent. Greet by first name (${firstName}). Answer high-level program questions, never specific treatment/PII.`;
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
