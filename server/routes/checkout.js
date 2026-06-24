// import express from 'express';
// import whop from '../utils/whop.js';

// const router = express.Router();

// router.post('/create-checkout', async (req, res) => {
//   try {
//     const { orderId, priceInDollars } = req.body;

//     const checkout = await whop.checkoutConfigurations.create({
//       currency: 'usd',
//       plan: {
//         initial_price: priceInDollars,
//         plan_type: 'one_time', // or 'recurring'
//         company_id: process.env.WHOP_COMPANY_ID,
//         currency: 'usd',
//         payment_method_configuration: {
//           enabled: ['apple_pay', 'card', 'us_bank_transfer'],
//         },
//       },
//       metadata: {
//         order_id: orderId,
//       },
//     });

//     const checkoutLink = `https://whop.com/checkout/${checkout.plan.id}`;
//     res.json({ checkoutLink, planId: checkout.plan.id });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: 'Failed to create checkout' });
//   }
// });

// export default router;