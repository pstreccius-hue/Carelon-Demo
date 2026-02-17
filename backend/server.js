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
const phoneToMemoryProfile = {};

const app = express();
app.use(cors({ origin: '*' }));
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

async function getSegmentProfileByPhone(phone) {
  const SEGMENT_SPACE_ID = process.env.SEGMENT_SPACE_ID;
  const SEGMENT_PROFILE_TOKEN = process.env.SEGMENT_PROFILE_TOKEN;
  const url = `https://profiles.segment.com/v1/spaces/${SEGMENT_SPACE_ID}/collections/users/profiles/phone:${encodeURIComponent(phone)}/traits?limit=200`;
  const response = await axios.get(url, {
    headers: {
      Authorization: `Basic ${Buffer.from(SEGMENT_PROFILE_TOKEN + ':').toString('base64')}`
    }
  });
  return response.data.traits || {};
}

//---- Conversation Intelligence Webhook with Memory API Phone Lookup ----//
app.post('/webhook/conversational-intelligence', async (req, res) => {
  try {
    const operatorResults = req.body.operatorResults || [];
    for (const op of operatorResults) {
      if (op.result && op.result.summary) {
        // ProfileId and MemStoreId extraction SAME as before!
        const customerParticipant = (op.executionDetails?.participants || []).find(
          p => p.type === 'CUSTOMER'
        );
        const profileId = customerParticipant && customerParticipant.profileId;
        const memStoreId = op.executionDetails?.context?.customerMemory?.memoryStoreId || "YOUR_MEM_STORE_ID";

        if (profileId && memStoreId) {
          try {
            const twilioAuth = {
              username: process.env.TWILIO_SID,
              password: process.env.TWILIO_TOKEN
            };
            const profileUrl = `https://memory.twilio.com/v1/Stores/${memStoreId}/Profiles/${profileId}`;
            const profileResp = await axios.get(profileUrl, { auth: twilioAuth });
            const traits = profileResp.data.traits || {};
            const phone = traits.Contact && traits.Contact.phone ? traits.Contact.phone : null;
            const favoriteExercise = traits.Contact && traits.Contact.favoriteExercise ? traits.Contact.favoriteExercise : "exercise";

            if (phone) {
              // Update Segment as before
              await sendIdentify({ userId: phone, traits: { favoriteExercise } });
              await sendTrack({
                userId: phone,
                event: 'AI Gen Call Summary - Twilio Memora',
                properties: {
                  most_recent_call_summary: op.result.summary,
                  mem_profile_id: profileId
                }
              });
              console.log(`[CI webhook] Sent Call Summary event to Segment for phone ${phone}`);

             
              console.log(`[CI webhook] Outbound call triggered to ${phone} (memStoreId: ${memStoreId}, profileId: ${profileId})`);
            } else {
              console.warn('[CI webhook] No phone found in Twilio Memory profile.', profileResp.data);
            }
          } catch (fetchErr) {
            console.error('Error fetching Twilio Memory profile:', fetchErr?.response?.data || fetchErr.message);
          }
        } else {
          console.warn('[CI webhook] Missing profileId or memStoreId.', { profileId, memStoreId });
        }
      }
    }
    res.status(200).send('ok');
  } catch (err) {
    console.error("CI Webhook Error:", err);
    res.status(500).send('Webhook processing error');
  }
});

app.post('/api/signup', async (req, res) => {
  const user = req.body;
  const memStoreId = process.env.DEFAULT_TWILIO_MEM_STORE_ID;
  let profileId = null;

  try {
    await sendIdentify(user);
    await sendTrack({
      userId: user.email || user.phone || user.name || 'anonymous-voice',
      event: "Program Enrolled",
      properties: { program: user.program }
    });
    await sendSms(user.phone, `Hi ${user.name}, welcome to the ${user.program}!`);

    // Use the Twilio Memory Store Lookup endpoint (idType: phone)
    try {
      const lookupUrl = `https://memory.twilio.com/v1/Stores/${memStoreId}/Profiles/Lookup`;
      const twilioAuth = {
        username: process.env.TWILIO_SID,
        password: process.env.TWILIO_TOKEN
      };
      const cleanPhone = user.phone.replace(/[^+\d]/g, ''); // Remove dashes/spaces, keep + and digits
      const resp = await axios.post(lookupUrl, {
        idType: "phone",
        value: cleanPhone
      }, { auth: twilioAuth });
      profileId = resp.data.id;
      console.log(`Profile ID found/created: ${profileId}`);
    } catch (err) {
      console.error('Error using Memory Profiles/Lookup:', err?.response?.data || err?.message);
    }
console.log('ProfileId to sendVoice:', profileId, 'MemStoreId:', memStoreId);
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

    // Extract ONLY from query parameters
    const { phone: queryPhone, memStoreId: queryMemStoreId, profileId: queryProfileId } = req.query;
    const userId = queryPhone || 'anonymous';

    // Use query param directly or a default as absolute fallback
    const memStoreId = queryMemStoreId || process.env.DEFAULT_TWILIO_MEM_STORE_ID || "YOUR_MEM_STORE_ID";
    const profileId = (queryProfileId && queryProfileId !== 'undefined') ? queryProfileId : null;

    console.log('ai-voice-convo -- userId:', userId);
    console.log('ai-voice-convo -- memStoreId:', memStoreId);
    console.log('ai-voice-convo -- profileId:', profileId);

    // 1. Get Segment profile traits for other personalization
    let profileTraits = {};
    try {
      if (userId && userId.startsWith('+')) {
        profileTraits = await getSegmentProfileByPhone(userId);
      }
    } catch (e) {
      console.error('Failed to fetch Segment traits for welcome prompt:', e?.response?.data || e?.message);
    }

    // 2. Get Twilio Memory traits and favoriteExercise directly
    let twilioTraits = {};
    let phone = null;
    let favoriteExercise = null;
    try {
      if (profileId && memStoreId) {
        const profileUrl = `https://memory.twilio.com/v1/Stores/${memStoreId}/Profiles/${profileId}`;
        const twilioAuth = {
          username: process.env.TWILIO_SID,
          password: process.env.TWILIO_TOKEN
        };
        const profileResp = await axios.get(profileUrl, { auth: twilioAuth });
        twilioTraits = profileResp.data.traits || {};

        console.log("Twilio Memory API raw traits:", JSON.stringify(twilioTraits, null, 2));

        phone = (twilioTraits.Contact && twilioTraits.Contact.phone) ? twilioTraits.Contact.phone : null;
        favoriteExercise = (twilioTraits.Contact && typeof twilioTraits.Contact.favoriteExercise === "string" && twilioTraits.Contact.favoriteExercise.trim() !== "")
          ? twilioTraits.Contact.favoriteExercise
          : null;
      } else {
        console.warn("Missing profileId or memStoreId in ai-voice-convo:", { profileId, memStoreId });
      }
    } catch (e) {
      console.error('Failed fetch Twilio Memory traits for welcome prompt:', e?.response?.data || e?.message);
      favoriteExercise = null;
    }

    if (!favoriteExercise) {
      favoriteExercise = "exercise";
    }

    const firstName = profileTraits.first_name || profileTraits.name || "there";
    const activeProgram = profileTraits.program || "one of our health programs";
    const additionalProgram = profileTraits.additional_program || "";

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

      // PERSONALIZATION: Fetch profile traits from Segment
      let profileTraits = {};
      try {
        if (userId && userId.startsWith('+')) {
          profileTraits = await getSegmentProfileByPhone(userId);
        }
      } catch (e) {
        console.error('Failed to fetch Segment traits for personalization:', e?.response?.data || e?.message);
      }
      const firstName = profileTraits.first_name || profileTraits.name || "there";
      const activeProgram = profileTraits.program || "one of our health programs";
      const additionalProgram = profileTraits.additional_program || "one of our health programs";
      const favoriteExercise =
        profileTraits.favoriteExercise ||
        profileTraits.favorite_exercise ||
        (profileTraits.Contact && (profileTraits.Contact.favoriteExercise || profileTraits.Contact.favorite_exercise)) ||
        "exercise";

            switch (data.type) {
        case "setup":
          break;
        case "prompt":
          const userText = data.voicePrompt || '';

          const systemPrompt = `You are Carelon Health's automated agent on a phone call.
- Greet the user by first name (${firstName}).
- Mention their active program (${activeProgram}) and any (${additionalProgram}), and that their favorite exercise is ${favoriteExercise}. Then offer tailored assistance or next steps.
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
