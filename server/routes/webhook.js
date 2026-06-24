import express from 'express';
import Order from '../models/Order.js'; // your MongoDB model

const router = express.Router();

router.post('/whop-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const event = JSON.parse(req.body);

  if (event.action === 'payment.succeeded') {
    const { metadata, id } = event.data;
    // Update your DB
    await Order.findOneAndUpdate(
      { orderId: metadata.order_id },
      { paymentStatus: 'paid', whopPaymentId: id }
    );
  }

  if (event.action === 'payment.failed') {
    // handle failure
  }

  res.json({ received: true });
});

export default router;