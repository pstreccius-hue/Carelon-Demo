const axios = require('axios');
const SEGMENT_WRITE_KEY = process.env.SEGMENT_WRITE_KEY;

exports.sendIdentify = user => axios.post(
  'https://api.segment.io/v1/identify',
  { userId: user.email || user.phone, traits: { name: user.name, email: user.email, phone: user.phone, program: user.program } },
  { auth: { username: SEGMENT_WRITE_KEY, password: '' } }
);

exports.sendTrack = (user, event, properties) => axios.post(
  'https://api.segment.io/v1/track',
  {
    userId: user.email || user.phone || user.name || 'anonymous-voice',
    event,
    properties,
  },
  { auth: { username: SEGMENT_WRITE_KEY, password: '' } }
);
