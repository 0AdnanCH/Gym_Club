const mongoose = require('mongoose');
const {Schema} = mongoose;

const walletSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  balance: {
    type: Number,
    default: 0.0,
  },
  isActive: {
    type: Boolean,
    default: true
  },
  transaction: [
    {
      date: {
        type: Date,
        default: Date.now
      },
      transactionType: {
        type: String,
        enum: ['payment', 'refund'],
        required: true
      },
      amount: {
        type: Number,
        min: 0.01,
        required: true
      }
    }
  ]
}, {timestamps: true});

const Wallet = mongoose.model('Wallet', walletSchema);

module.exports = Wallet;