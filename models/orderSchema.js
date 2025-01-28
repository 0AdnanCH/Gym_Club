const mongoose = require('mongoose');
const {Schema} = mongoose;

const orderSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,  
  },
  orderedId: {
    type: String,
    required: true
  },
  razorpayOrderId: {
    type: String, 
    required: false
  },
  currency: {
    type: String,
    required: false
  },
  receipt: {
    type: String,
    required: false
  },
  address: {
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
      default: ''
    },
    alternatePhone: {
      type: String,
      default: ''
    },
    addressType: {
      type: String,
      required: true
  }},
  items: [
    {
      productId: {
        type: Schema.Types.ObjectId,
        ref: 'Product', 
        required: true,
      },
      color: {
        type: String,
        required: true
      },
      size: {
        type: String,
        required: true
      },
      quantity: {
        type: Number,
        required: true,
        min: 1, 
      },
      image: {
        type: String,
        required: true
      },
      price: {
        type: Number,
        required: true,
        min: 0, 
      },
      isCanceled: {
        type: Boolean,
        default: false,
      },
      isReturned: {
        type: Boolean,
        default: false
      },
      isRejected: {
        type: Boolean,
        default: false
      },
      returnedItem: {
        type: Number,
        required: false
      },
      canceledItems: {
        type: Number,
        required:false
      }
    },
  ],
  paymentStatus: {
    type: String,
    enum: ['Pending', 'Paid', 'Failed', 'Canceled', 'Refunded'],
    required: true,
  },
  paymentMethod: {
    type: String,
    enum: ['cod', 'razorpay', 'wallet'],
    required: true,
  },
  orderStatus: {
    type: String,
    enum: ['Pending', 'Confirmed', 'Shipped', 'Delivered', 'Canceled', 'Returned'],
    default: 'Pending',
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0, 
  },
  payableAmount: {
    type: Number,
    required: true,
    min: 0
  },
  shippingCost: {
    type: Number,
    required: true,
    default: 0,
    min: 0, 
  },
  appliedCoupon: {
    couponId: {
      type: Schema.Types.ObjectId,
      ref: 'Coupon',
    },
    discountPrice: {
      type: Number
    }
 }

}, {timestamps: true});

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;