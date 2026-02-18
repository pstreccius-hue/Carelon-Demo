const express = require('express');
const http = require('http');
const { twiml: { VoiceResponse } } = require('twilio');
const { sendIdentify, sendTrack } = require('./segment');
const bodyParser = require('body-parser');
const cors = require('cors');
const { OpenAI } = require('openai');
const { sendSms, sendVoice } = require('./twilio');
const WebSocket = require('ws');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors({ origin: '*' }));
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

async function getSegmentProfileByPhone(phone) {
  const SEGMENT_SPACE_ID = process.env.SEGMENT_SPACE_ID;
  const SEGMENT_PROFILE_TOKEN = process.env.SEGMENT_PROFILE_TOKEN;
  const url = `https://profiles.segment.com/v1/spaces/${SEGMENT_SPACE_ID}/collections/users/profiles/user_id:${encodeURIComponent(phone)}/traits?limit=200`;
  const response = await axios.get(url, {
    headers: {
      Authorization: `Basic ${Buffer.from(SEGMENT_PROFILE_TOKEN + ':').toString('base64')}`
    }
  });
  console.log('SEGMENT API URL:', url);
  console.log('SEGMENT API RAW RESPONSE:', JSON.stringify(response.data, null, 2));
  return response.data.traits || {};
}

async function getTwilioMemoryProfileByPhone(phone) {
  const memStoreId = process.env.DEFAULT_TWILIO_MEM_STORE_ID;
  const twilioAuth = {
    username: process.env.TWILIO_SID,
    password: process.env.TWILIO_TOKEN
  };
  let profileId = null;
  let traits = {};
  try {
    const lookupUrl = `https://memory.twilio.com/v1/Stores/${memStoreId}/Profiles/Lookup`;
    const resp = await axios.post(lookupUrl, {
      idType: "phone",
      value: phone
    }, { auth: twilioAuth });
    // Try both .profiles array (newer APIs) and .id (older Memory)
    if (Array.isArray(resp.data.profiles) && resp.data.profiles.length > 0) {
      profileId = resp.data.profiles[0];
    } else if (resp.data.id) {
      profileId = resp.data.id;
    }

    if (profileId) {
      const profileUrl = `https://memory.twilio.com/v1/Stores/${memStoreId}/Profiles/${profileId}`;
      const profileResp = await axios.get(profileUrl, { auth: twilioAuth });
      traits = profileResp.data.traits || {};
    }
    return { profileId, traits };
  } catch (err) {
    console.error("Error fetching Twilio Memory profile by phone:", err?.response?.data || err?.message);
    return { profileId: null, traits: {} };
  }
}

//---- Conversation Intelligence Webhook (just analytics now) ----//
app.post('/webhook/conversational-intelligence', async (req, res) => {
  try {
    // Analytics and Segment event tracking only
    res.status(200).send('ok');
  } catch (err) {
    res.status(500).send('Webhook processing error');
  }
});

//------------- SIGNUP/OUTBOUND CALL FLOW ---------//
app.post('/api/signup', async (req, res) => {
  const user = req.body;
  const memStoreId = process.env.DEFAULT_TWILIO_MEM_STORE_ID;
  try {
    await sendIdentify(user);
    await sendTrack({
      userId: user.email || user.phone || user.name || 'anonymous-voice',
      event: "Program Enrolled",
      properties: { program: user.program }
    });
    await sendSms(user.phone, `Hi ${user.name}, welcome to the ${user.program}!`);
// --- HERE: Use Memory Profiles/Lookup for profileId ---
    let profileId = null;
try {
  const lookupUrl = `https://memory.twilio.com/v1/Stores/${memStoreId}/Profiles/Lookup`;
  const twilioAuth = {
    username: process.env.TWILIO_SID,
    password: process.env.TWILIO_TOKEN
  };
  const cleanPhone = (user.phone || "").replace(/[^+\d]/g, "");
  const resp = await axios.post(lookupUrl, {
    idType: "phone",
    value: cleanPhone
  }, { auth: twilioAuth });
  console.log('Lookup Memory response:', JSON.stringify(resp.data, null, 2));
  profileId = (resp.data.profiles && resp.data.profiles.length > 0)
    ? resp.data.profiles[0]
    : null;
  console.log("Resolved profileId via Lookup:", profileId);
} catch (err) {
  console.error("Error using Memory Profiles/Lookup:", err?.response?.data || err?.message);
}


    // Now trigger the call with real IDs
    await sendVoice(
      user.phone,
      user.name,
      user.program,
      memStoreId,
      profileId
    );

    res.json({ success: true, message: "Events sent and comms triggered." });
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

//----------------------------------------------------------
// Conversation Relay TwiML Route -- PERSONALIZED WELCOME
//----------------------------------------------------------
app.all('/api/ai-voice-convo', async (req, res) => {
  try {
    function xmlEscape(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

    // Print entire req.query for debugging
    console.log('ai-voice-convo: req.query:', JSON.stringify(req.query, null, 2));

    const { phone: queryPhone, memStoreId: queryMemStoreId, profileId: queryProfileId } = req.query;
    // Always log queryPhone. Make sure it's present and +E.164
    console.log('ai-voice-convo: queryPhone:', queryPhone);

    const userId = queryPhone || 'anonymous';
    console.log('ai-voice-convo: userId is', userId);

    // Use query params to fetch Memory traits (recommended)
    const memStoreId = queryMemStoreId || process.env.DEFAULT_TWILIO_MEM_STORE_ID;
    const profileId = queryProfileId && queryProfileId !== 'undefined' ? queryProfileId : null;

    // 1. Get Segment profile traits
    let traits = {};
    try {
      traits = await getSegmentProfileByPhone(userId);
      console.log('Segment traits for', userId, ':', JSON.stringify(traits, null, 2));
    } catch (e) {
      console.error('Failed to fetch Segment traits for welcome prompt:', e?.response?.data || e?.message);
    }

    const firstName = traits.name || "there";
    const activeProgram = traits.program || "one of our health programs";
    const additionalProgram = traits.additional_program || "";

    console.log('DEBUG: Extracted firstName:', firstName);
    console.log('DEBUG: Extracted activeProgram:', activeProgram);
    console.log('DEBUG: Extracted additionalProgram:', additionalProgram);

    // 2. Get Twilio Memory traits using profileId (if available)
    let twilioTraits = {};
    let favoriteExercise = null;
    if (profileId && memStoreId) {
      try {
        const profileUrl = `https://memory.twilio.com/v1/Stores/${memStoreId}/Profiles/${profileId}`;
        const twilioAuth = {
          username: process.env.TWILIO_SID,
          password: process.env.TWILIO_TOKEN
        };
        const profileResp = await axios.get(profileUrl, { auth: twilioAuth });
        twilioTraits = profileResp.data.traits || {};
        favoriteExercise = (twilioTraits.Contact && typeof twilioTraits.Contact.favoriteExercise === "string" && twilioTraits.Contact.favoriteExercise.trim() !== "")
          ? twilioTraits.Contact.favoriteExercise
          : null;
      } catch (e) {
        console.error('Failed to fetch Twilio traits by profileId for welcome prompt:', e?.response?.data || e?.message);
      }
    }
    if (!favoriteExercise) {
      favoriteExercise = "exercise";
    }

    const welcomePrompt =
      `Hello, ${firstName}! Welcome to the ${activeProgram}` +
      `${(additionalProgram && additionalProgram !== activeProgram) ? " and " + additionalProgram : ""} program${(additionalProgram && additionalProgram !== activeProgram) ? "s" : ""} at Carelon Health. ` +
      `I see your favorite exercise is ${favoriteExercise}. ` +
      `I'm here to provide tailored assistance and next steps. ` +
      `Would you like an overview of your program, hear about Wellness Coaching, Smoking Cessation, or Diabetes Prevention, or enroll in a new program?`;
    
    const wsUrl =
      `wss://carelon-demo.onrender.com/conversation-relay?userId=${encodeURIComponent(userId)}`
        + (memStoreId ? `&memStoreId=${encodeURIComponent(memStoreId)}` : '')
        + (profileId ? `&profileId=${encodeURIComponent(profileId)}` : '');

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

const server = http.createServer(app);
server.listen(process.env.PORT || 3001, () => console.log('Backend running on 3001'));

const wss = new WebSocket.Server({ server, path: '/conversation-relay' });
wss.on('connection', (ws, req) => {
  console.log('ConversationRelay WebSocket connected!');
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      const parsedUrl = req.url ? new URL('http://x' + req.url) : null;
      const userId = parsedUrl ? parsedUrl.searchParams.get('userId') || 'anonymous' : 'anonymous';
      const memStoreId = parsedUrl ? parsedUrl.searchParams.get('memStoreId') || process.env.DEFAULT_TWILIO_MEM_STORE_ID : process.env.DEFAULT_TWILIO_MEM_STORE_ID;
      const profileId = parsedUrl ? parsedUrl.searchParams.get('profileId') : null;

      // 1. Get Segment profile traits for personalization
      let profileTraits = {};
      try {
        if (userId && userId.startsWith('+')) {
          profileTraits = await getSegmentProfileByPhone(userId);
        }
      } catch (e) {
        console.error('Failed to fetch Segment traits for personalization:', e?.response?.data || e?.message);
      }

      // 2. Get Twilio Memory traits for this session (using profileId)
      let twilioTraits = {};
      let favoriteExercise = null;
      if (profileId && memStoreId) {
        try {
          const profileUrl = `https://memory.twilio.com/v1/Stores/${memStoreId}/Profiles/${profileId}`;
          const twilioAuth = {
            username: process.env.TWILIO_SID,
            password: process.env.TWILIO_TOKEN
          };
          const profileResp = await axios.get(profileUrl, { auth: twilioAuth });
          twilioTraits = profileResp.data.traits || {};
          favoriteExercise = (
            twilioTraits.Contact &&
            typeof twilioTraits.Contact.favoriteExercise === "string" &&
            twilioTraits.Contact.favoriteExercise.trim() !== ""
          ) ? twilioTraits.Contact.favoriteExercise : null;
        } catch (e) {
          console.error('Failed to fetch Twilio Memory traits for websocket personalization:', e?.response?.data || e?.message);
        }
      }
      if (!favoriteExercise) {
        favoriteExercise = "exercise";
      }

      const firstName = profileTraits.first_name || profileTraits.name || "there";
      const activeProgram = profileTraits.program || "one of our health programs";
      const additionalProgram = profileTraits.additional_program || "one of our health programs";

      switch (data.type) {
        case "setup":
          // Optionally: send an initial message or do nothing
          break;
        case "prompt":
          const userText = data.voicePrompt || '';
          // Build an AI prompt using full personalization
          const systemPrompt = `You are Carelon Health's automated agent on a phone call.
- Greet the user by first name (${firstName}).
- Mention their active program (${activeProgram}) and any additional programs (${additionalProgram}), and that their favorite exercise is ${favoriteExercise}. Then offer tailored assistance or next steps.
- If the user requests an overview of a program, provide a friendly, high-level (never clinical or with PII) overview, but only give the same program's overview once per call (do not repeat overviews already provided in the conversation history).
- The main program is "${activeProgram}". Other available programs are: Wellness Coaching, Smoking Cessation, Diabetes Prevention.
- If the user asks to enroll in another program, confirm their enrollment, thank them, and then ask if they have any more questions or want to enroll in any other programs.
- At all times, never provide medical advice.
- If user says they are done or do not have more questions, wish them well and say goodbye.
Always reply in a positive, conversational, and concise tone. When confirming enrollment, use the format "ENROLL: <Program Name>" in addition to your reply.`;

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

          ws.send(JSON.stringify({
            type: "text",
            token: reply,
            last: true
          }));

          // --- SEGMENT ENROLLMENT TRACKING ---
          const signupMatch = reply.match(/ENROLL: ([A-Za-z ]+)/i);
          if (signupMatch) {
            const newProgram = signupMatch[1].trim();
            await sendTrack({
              userId: userId,
              event: 'Additional Program Enrolled',
              properties: { program: newProgram }
            });
            await sendIdentify({
              userId: userId,
              traits: { last_enrolled_program: newProgram }
            });
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
