const express = require('express');
const http = require('http');
const { twiml: { VoiceResponse } } = require('twilio');
const { sendIdentify, sendTrack } = require('./segment');
const bodyParser = require('body-parser');
const cors = require('cors');
const { OpenAI } = require('openai');
const { sendSms, sendVoice } = require('./twilio');
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
// Conversation Relay TwiML Route
//----------------------------------------------------------
app.all('/api/ai-voice-convo', (req, res) => {
  try {
    const { phone, firstName, program } = req.query;
    const userId = phone || 'anonymous';
    const safeFirstName = (firstName || "there").replace(/[^a-zA-Z\- ]/g, "");
    const safeProgram = (program || "our programs").replace(/[^a-zA-Z\- ]/g, "");

    const wsUrl = `wss://carelon-demo.onrender.com/conversation-relay?userId=${encodeURIComponent(userId)}&firstName=${encodeURIComponent(safeFirstName)}&program=${encodeURIComponent(safeProgram)}`;
    const welcomePrompt =
      `Hello, ${safeFirstName}! Welcome to the ${safeProgram} program. Would you like a quick overview? ` +
      `We also offer Wellness Coaching, Smoking Cessation, and Diabetes Prevention programs. ` +
      `Would you like to hear a summary of these, or enroll in a different program today?`;

    const twiml =
      `<Response>
         <Connect>
           <ConversationRelay
             url="${wsUrl}"
             transcriptionEnabled="true"
             clientParticipantIdentity="user_${userId}"
             clientDisplayName="Participant"
             botParticipantIdentity="carelon_ai_agent"
             botDisplayName="Carelon AI Assistant"
             welcomeGreeting="${welcomePrompt.replace(/"/g, '&quot;')}"
           />
         </Connect>
       </Response>`;

    res.type('text/xml');
    res.send(twiml);
  } catch (err) {
    console.error('ai-voice-convo error:', err);
    res.status(500).send('Internal error');
  }
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
      // Grab query params from initial websocket URL for context (for /conversation-relay?userId=...&firstName=...&program=...)
      const parsedUrl = req.url ? new URL('http://x' + req.url) : null;
      const userId = parsedUrl ? parsedUrl.searchParams.get('userId') || 'anonymous' : 'anonymous';
      const firstName = parsedUrl ? parsedUrl.searchParams.get('firstName') || 'there' : 'there';
      const program = parsedUrl ? parsedUrl.searchParams.get('program') || 'our programs' : 'our programs';

      if (data.event === 'start') {
        ws.send(JSON.stringify({
          event: 'playText',
          participantIdentity: data.botParticipantIdentity,
          text: `Hello, ${firstName}! Welcome to the ${program} program. Would you like a quick overview? We also offer Wellness Coaching, Smoking Cessation, and Diabetes Prevention programs. Would you like to hear a summary of these, or enroll in a different program today?`,
        }));
      }
      else if (data.event === 'transcription') {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const userText = data.transcription?.transcript || '';
        // Use a system prompt that guides the AI to give program overviews and offer enrollments
        const systemPrompt =
          `You are Carelon Health's automated agent. Provide a friendly, high-level (never clinical or with PII) overview of the "${program}" program if asked, and describe the other programs: Wellness Coaching, Smoking Cessation, Diabetes Prevention. If the user wants to enroll, state "ENROLL: <Program Name>" in your reply. Never provide medical advice.`;

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

        // --- SEGMENT ENROLLMENT TRACKING ---
        const signupMatch = reply.match(/ENROLL: ([A-Za-z ]+)/i);
        if (signupMatch) {
          const newProgram = signupMatch[1].trim();
          // Track the enrollment analytics event
          await sendTrack(
            { phone: userId }, // mimic your 'user' obj at signup, or pass just userId if your helper supports it
            'Program Enrolled',
            { program: newProgram }
          );
          // Update user trait (latest enrollment)
          await sendIdentify(
            { phone: userId, last_enrolled_program: newProgram }
          );
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
