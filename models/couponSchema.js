const mongoose = require('mongoose');
const {Schema} = mongoose;

const couponSchema = new Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  couponType: {
    type: String,
    required: true,
    enum: ['fixedAmount', 'percentage'],
  }, 
  couponStatus: {
    type: String,
    required: true,
    enum: ['active', 'inactive', 'expired'],
  },
  discountValue: {
    type: Number,
    required: true,
  },
  minCartValue: {
    type: Number,
    default: 0, 
  },
  maxDiscount: {
    type: Number,
  },
  usageLimitPerUser: {
    type: Number,
    default: 1, 
  },
  totalUsageLimit: {
    type: Number, 
  },
  usedCount: {
    type: Number,
    default: 0,
  },
  startDate: {
    type: Date,
    required: true, 
  },
  endDate: {
    type: Date,
    required: true, 
  },
}, {timestamps: true});


const Coupon = mongoose.model('Coupon', couponSchema);

module.exports = Coupon;