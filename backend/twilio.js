const VoiceResponse = require('twilio').twiml.VoiceResponse;

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
app.post('/api/voice-twiml-loop', (req, res) => {
  const name = req.query.name || 'Participant';
  const program = req.query.program || 'your program';
  const digit = req.body.Digits;

  const twiml = new VoiceResponse();

  if (digit === '1') {
    // Repeat the message
    twiml.redirect(`/api/voice-twiml?name=${encodeURIComponent(name)}&program=${encodeURIComponent(program)}`);
  } else {
    // Goodbye if anything else (inc. timeout)
    twiml.say({ voice: 'Kimberly' }, 'Goodbye.');
    twiml.hangup();
  }

  res.type('text/xml');
  res.send(twiml.toString());
});
