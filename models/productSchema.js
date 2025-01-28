const mongoose = require('mongoose');
const { schema } = require('./userSchema');
const {Schema} = mongoose;


const productSchema = new Schema({
  productName: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  category: {
    type: Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  regularPrice: {
    type: Number,
    required: true
  },
  salePrice: {
    type: Number,
    required: true
  },
  isBlocked: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['Available', 'Out of stock', 'Discountinued'],
    required: true,
    default: 'Available'
  },
  variant:[
    {
      color:{
        type:String,
        default: 0,
        required: true
      },
      image: {
        type: [String],
        required: true
      },
      XS:{
        type:Number,
        default: 0,
        required: true
      },
      S:{
        type:Number,
        default: 0,
        required: true
      },
      M:{
        type:Number,
        default: 0,
        required: true
      },
      L:{
        type:Number,
        default: 0,
        required: true
      },
      XL:{
        type:Number,
        default: 0,
        required: true
      },
      XXL:{
        type:Number,
        default: 0,
        required: true
      },
      XXXL:{
        type:Number,
        default: 0,
        required: true
      }
    }
  ],
  offerApplied: {
    type: Schema.Types.ObjectId,
    ref: 'Offer'
  },
  viewCount: {
    type: Number,
  },
  saleCount: {
    type: Number,
  }
}, {timestamps: true});

const Product = mongoose.model('Product', productSchema);

module.exports = Product;