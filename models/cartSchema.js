const mongoose = require('mongoose');
const {Schema} = mongoose;

const cartItemSchema  = new Schema({
  productId: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true,  
  },
  price: {
    type: Number,
    required: true,
  },
  color: {
    type: String,
    required: true,
  },
  size: {
    type: String,
    required: true,
  },
  image: {
    type: String, 
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    default: 1,
    min: 1,
  },
  totalPrice: {
    type: Number,
    required: true,
  },
  isBlocked: {
    type: Boolean,
    default: false
  },
});
const cartSchema   = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,  
  },
  items: [cartItemSchema],
  subtotal: {
    type: Number,
    required: true,
    default: 0,
  },
  totalAmount: {
    type: Number,
    required: true,
    default: 0,
  }
}, {timestamps: true});

const Cart = mongoose.model('Cart', cartSchema);

module.exports = Cart;