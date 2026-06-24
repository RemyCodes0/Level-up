import Whop from '@whop/sdk';

const whop = new Whop({
  apiKey: process.env.WHOP_API_KEY,
});

export default whop;