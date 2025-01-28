const mongoose = require('mongoose');
const {Schema} = mongoose;

const offerSchema = new Schema({
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  offerType: {
    type: String,
    required: true,
    enum: ['product', 'category', 'referral'],
  },
  appliedProducts: [
    {
      type: Schema.Types.ObjectId,
      ref: 'Product'
    }
  ],
  appliedCategories: [
    {
      type: Schema.Types.ObjectId,
      ref: 'Category',
    }
  ],
  appliedUsers: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
  offerStatus: {
    type: String,
    required: true,
    enum: ['active', 'inactive', 'expired'],
  },
  discountType: {
    type: String,
    required: true,
    enum: ['percentage', 'fixedAmount',],
  },
  discountVal: {
    type: Number,
    required: true,
  },
  maxDiscount: {
    type: Number,
  },
  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
    required: true,
  }
}, {timestamps: true});

const Offer = mongoose.model('Offer', offerSchema);

module.exports = Offer;

