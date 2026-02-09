const axios = require('axios');
const SEGMENT_WRITE_KEY = process.env.SEGMENT_WRITE_KEY;

exports.sendIdentify = async (user) => {
  try {
    const response = await axios.post(
      'https://api.segment.io/v1/identify',
      {
        userId: user.email || user.phone,
        traits: {
          name: user.name,
          email: user.email,
          phone: user.phone,
          program: user.program
        }
      },
      { auth: { username: SEGMENT_WRITE_KEY, password: '' } }
    );
    console.log('Segment identify response:', response.status, response.data);
    return response;
  } catch (err) {
    console.error('Segment identify API Error:', err.response ? err.response.data : err.message);
    throw err;
  }
};

exports.sendTrack = ({ userId, event, properties }) => axios.post(
  'https://api.segment.io/v1/track',
  { userId, event, properties },
  { auth: { username: SEGMENT_WRITE_KEY, password: '' } }
);
    console.log('Segment track response:', response.status, response.data);
    return response;
  } catch (err) {
    console.error('Segment track API Error:', err.response ? err.response.data : err.message);
    throw err;
  }
};
