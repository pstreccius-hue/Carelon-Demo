const express = require('express');
const bodyParser = require('body-parser');
const { sendIdentify, sendTrack } = require('./segment');
const { sendSms, sendVoice } = require('./twilio');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

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

app.listen(process.env.PORT || 3001, () => console.log('Backend running on 3001'));
