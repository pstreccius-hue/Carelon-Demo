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

//---- NEW: Conversation Intelligence Webhook ----//
app.post('/webhook/conversational-intelligence', async (req, res) => {
  try {
    // Move your logging here, INSIDE the handler:
    console.log('===== FULL WEBHOOK PAYLOAD =====');
    console.log(JSON.stringify(req.body, null, 2));

    const operatorResults = req.body.operatorResults || [];
    if (operatorResults.length === 0) {
      return res.status(400).send('No operatorResults in payload');
    }
    // Process each operatorResult:
    for (const op of operatorResults) {
      const summary = op.result && op.result.explanation;
      let customerPhone = null;
      let customerProfileId = null;
      const customerParticipant = (op.executionDetails?.participants || []).find(p => p.type === 'CUSTOMER');
      if (customerParticipant) {
        customerPhone = customerParticipant.phone;
        customerProfileId = customerParticipant.profileId;
      }
      let userId = customerPhone || customerProfileId;
      if (userId && summary) {
        await sendIdentify({
          userId,
          traits: { most_recent_call_summary: summary }
        });
        console.log(`[CI webhook] Updated Segment for userId ${userId} with summary:`, summary);
      } else {
        console.warn('[CI webhook] Skipped posting to Segment - missing user or summary');
      }
    }
    res.status(200).send('ok');
  } catch (err) {
    console.error('CI Webhook Error:', err);
    res.status(500).send('Webhook processing error');
  }
});

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
    function xmlEscape(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

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
             url="${xmlEscape(wsUrl)}"
             transcriptionEnabled="true"
             clientParticipantIdentity="${xmlEscape("user_" + userId)}"
             clientDisplayName="Participant"
             botParticipantIdentity="carelon_ai_agent"
             botDisplayName="Carelon AI Assistant"
             welcomeGreeting="${xmlEscape(welcomePrompt)}"
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
// WebSocket Server for Conversation Relay - UPDATED PROTOCOL
//----------------------------------------------------------
const server = http.createServer(app);
server.listen(process.env.PORT || 3001, () => console.log('Backend running on 3001'));

const wss = new WebSocket.Server({ server, path: '/conversation-relay' });
wss.on('connection', (ws, req) => {
  console.log('ConversationRelay WebSocket connected!');
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      // Grab query params from initial websocket URL for context
      const parsedUrl = req.url ? new URL('http://x' + req.url) : null;
      const userId = parsedUrl ? parsedUrl.searchParams.get('userId') || 'anonymous' : 'anonymous';
      const firstName = parsedUrl ? parsedUrl.searchParams.get('firstName') || 'there' : 'there';
      const program = parsedUrl ? parsedUrl.searchParams.get('program') || 'our programs' : 'our programs';

      switch (data.type) {
        case "setup":
          // Optional: session state can be initialized here
          console.log("Setup event received:", data);
          break;
        case "prompt":
          // Twilio sends voice transcription as `data.voicePrompt`
          const userText = data.voicePrompt || '';
          console.log('User said:', userText);

          const systemPrompt = `You are Carelon Health's automated agent on a phone call.
- If the user requests an overview of a program, provide a friendly, high-level (never clinical or with PII) overview, but only give the same program's overview once per call (do not repeat overviews already provided in the conversation history).
- The main program is "${program}". Other available programs are: Wellness Coaching, Smoking Cessation, Diabetes Prevention.
- If the user asks to enroll in another program, confirm their enrollment, thank them, and then ask if they have any more questions or want to enroll in any other programs.
- At all times, never provide medical advice.
- If user says they are done or do not have more questions, wish them well and say goodbye.

Always reply in a positive, conversational, and concise tone. When confirming enrollment, use the format "ENROLL: <Program Name>" in addition to your reply. Remember not to repeat overviews you already provided.`;

          const messages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: userText }
          ];

          console.log('Sending to OpenAI:', messages);

          const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
          const aiRes = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages,
          });

          const reply = aiRes.choices[0].message.content;
          console.log('AI REPLY:', reply);

          // SEND IN THE EXPECTED FORMAT
          ws.send(JSON.stringify({
            type: "text",        // correct for ConversationRelay
            token: reply,        // agent reply text
            last: true
          }));

          // --- SEGMENT ENROLLMENT TRACKING ---
          const signupMatch = reply.match(/ENROLL: ([A-Za-z ]+)/i);
          if (signupMatch) {
            const newProgram = signupMatch[1].trim();
            // Track the enrollment analytics event
            await sendTrack(
              { phone: userId },
              'Program Enrolled',
              { program: newProgram }
            );
            // Update user trait (latest enrollment)
            await sendIdentify(
              { phone: userId, last_enrolled_program: newProgram }
            );
          }
          break;
        case "interrupt":
          console.log("Received interrupt event");
          break;
        default:
          console.warn("Unknown WebSocket message type:", data.type);
          break;
      }
    } catch (err) {
      console.log('WebSocket error:', err);
    }
  });

  ws.on('close', () => {
    console.log('ConversationRelay WebSocket disconnected');
  });
});
