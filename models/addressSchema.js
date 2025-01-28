const mongoose = require('mongoose');
const {Schema} = mongoose;

const addressSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    required: true
  },
  pincode: {
    type: String,
    required: true
  },
  locality: {
    type: String,
    required: true
  },
  address: {
    type: String,
    required: true
  },
  place: {
    type: String,
    required: true
  },
  state: {
    type: String,
    required: true
  },
  landmark: {
    type: String,
  },
  alternatePhone: {
    type: String
  },
  addressType: {
    type: String,
    required: true
  },
  isBlocked: {
    type: Boolean,
    required: true,
    default: false
  }
}, {timestamps: true});


const Address = mongoose.model('Address', addressSchema);

module.exports = Address;
