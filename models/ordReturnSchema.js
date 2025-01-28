const mongoose = require('mongoose');
const { bool } = require('sharp');
const {Schema} = mongoose;

const ordReturnSchema = new Schema({
  orderId: {
    type: Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  isAllItem: {
    type: Boolean
  },
  reasons: [
    {
      type: String
    }
  ],
  status: {
    type: String,
    required: true,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Pending'
  },
  items: [
    {
      itemId: {
        type: Schema.Types.ObjectId,
      },
      quantity: {
        type: Number
      },
      isAllItem: {
        type: Boolean
      }
    }
  ]
}, {timestamps: true});

const ordReturn = mongoose.model('ordReturn', ordReturnSchema);

module.exports = ordReturn;