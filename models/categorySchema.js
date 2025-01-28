const mongoose = require('mongoose');
const {Schema} = mongoose;

const categorySchema = new Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    sparse: true  
  },
  description: {
    type: String,
    required: true
  },
  offerApplied: {
    type: Schema.Types.ObjectId,
    ref: 'Offer'
  },
  isListed: {
    type: Boolean,
    default: true
  }
}, {timestamps: true});

const Category = mongoose.model('Category', categorySchema);

module.exports = Category;