const mongoose = require('mongoose');
const {Schema} = mongoose;

const wishlistItemSchema  = new Schema({
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
  available: {
    type: Boolean,
    required: true
  }
});
const wishlistSchema   = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,  
  },
  items: [wishlistItemSchema],
}, {timestamps: true});

const Wishlist = mongoose.model('Wishlist', wishlistSchema);

module.exports = Wishlist;