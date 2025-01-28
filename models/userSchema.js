const mongoose = require('mongoose');
const {Schema} = mongoose;

const userSchema = new Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true 
  },
  phone: {
    type: String,
    required: false,
    unique: false,
    sparse: true,
    default: null
  },
  googleId: {
    type: String,
    required: false
  },
  password: {
    type: String,
    required: false
  },
  isBlocked: {
    type: Boolean,
    default: false
  },
  isAdmin: { 
    type: Boolean,
    default: false
  },
  cart: [{
    type: Schema.Types.ObjectId,
    ref: 'Cart'
  }],
  wallet:{
    type: Number,
    default: 0
  },
  wishlist: {
    type: Schema.Types.ObjectId,
    ref: 'Wishlist'
  },
  orderHistory: [{
    type: Schema.Types.ObjectId,
    ref: 'Order'
  }],
  referalCode: {
    type: String
  },
  redeemed: {
    type: Boolean
  },
  couponApplied: [
    {
      couponId: {
        type: Schema.Types.ObjectId,
        ref: 'Coupon'
      },
      count: {
        type: Number,
        default: 1
      }
    }
  ],
  redeemdUsers: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  searchHistory: [{
    category: {
      type: Schema.Types.ObjectId,
      ref: 'Category'
    },
    brand: {
      type: String
    },
    searchOn: {
      type: Date,
      dafault: Date.now
    }
  }]
}, {timestamps: true});


const User = mongoose.model('User', userSchema);

module.exports = User;

