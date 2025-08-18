import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    roomId: { type: String, index: true, required: true },
    userId: { type: String, required: true },
    username: { type: String, required: true },
    text: { type: String, required: true }
  },
  { timestamps: true }
);

export default mongoose.model('Message', messageSchema);


