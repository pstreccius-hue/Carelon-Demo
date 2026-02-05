const VoiceResponse = require('twilio').twiml.VoiceResponse;
const { sendTrack } = require('./segment'); // Make sure this is at top

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
    `Hello ${name}, this is Carelon Health! Congratulations on starting the ${program} program. 
    Press 1 to hear this message again.`
  );

  res.type('text/xml');
  res.send(twiml.toString());
});

  // If no input, fall through: Twilio will post to the action as well

  res.type('text/xml');
  res.send(twiml.toString());
});

// Handler for what happens after Gather (loop or goodbye)
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
