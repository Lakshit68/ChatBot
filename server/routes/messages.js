import { Router } from 'express';
import Message from '../models/Message.js';

const router = Router();

// GET /api/messages/:roomId?limit=50&before=<ISO>
router.get('/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const before = req.query.before ? new Date(req.query.before) : new Date();

    const messages = await Message.find({
      roomId,
      createdAt: { $lt: before }
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({ messages: messages.reverse() });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

export default router;


