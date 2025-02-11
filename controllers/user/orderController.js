const ObjectId = require('mongoose').Types.ObjectId;
const Cart = require('../../models/cartSchema');
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');
const Wallet = require('../../models/walletSchema');
const Coupon = require('../../models/couponSchema');
const ordReturn = require('../../models/ordReturnSchema');
const PDFDocument = require('pdfkit');
const Razorpay = require('razorpay');
//const {nanoid} = require('nanoid');
const fs = require('fs');
const { validateWebhookSignature } = require('razorpay/dist/utils/razorpay-utils');
const env = require('dotenv').config();
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_ID,
  key_secret: process.env.RAZORPAY_SECRET
});


const getCheckout = async (req, res) => {
  try {
    if(!req.session.user) {
      return res.redirect('/login')
    }
    const userId = req.session.user;
    const cart = await Cart.findOne({userId}).populate({
      path:'items.productId',
      select: 'productName'
    });
    if(!cart) {
      return res.redirect('/shop');
    }
    const wallet = await Wallet.findOne({userId});
    let balance = wallet ? wallet.balance : 0;
    let coupon = req.session.coupon;
    if(coupon) {
      coupon = coupon.subtotal !== cart.totalAmount ? null : coupon;
    }
    const userAddress = await Address.find({userId , isBlocked: false});
    res.render('checkout', {userId, userAddress, cart, coupon, balance});
  } catch (error) {
    res.redirect('/pageNotFound');
  }
}

const getPaySubmit = async (req, res) => {
  try {
    const userId = req.session.user;
    const orderId = req.query.id;
    if(!userId) {
      return res.redirect('/login');
    } 
    if(!orderId) {
      return res.redirect('/pageNotFound');
    }
    const user = await User.findOne({_id:userId, isBlocked:false});
    const order = await Order.findOne({_id:orderId, userId})
    .populate({
      path:'items.productId',
      select:'productName'
    });
    return res.render('pay-submit', {user, order}); 
  } catch (error) {
    res.redirect('/pageNotFound');
  }
}



const codpayment = async (req, res) => {
  try {
    const userId = req.session.user;
    const coupon = req.session.coupon;
    if(!userId) {
      return res.status(401).json({success: false , redirectUrl: '/login'});
    }
    const addressId = req.query.id;
    if(!addressId) {
      return res.status(400).json({success: false, message: 'Please give shipping address, Order Failed.'});
    }
    const cart = await Cart.findOne({userId});
    if(!cart) {
      return res.status(400).json({success: false, message: 'No items in Cart, Order Failed.'});
    }
    const userAddress = await Address.findOne({_id:addressId, userId, isBlocked: false});
    if(!userAddress) {
      return res.status(404).json({success: false ,message: 'address not found, Order Failed.'});
    }
    let couponExist;
    if(coupon) {
      couponExist = await Coupon.findOne({_id: coupon.couponId, couponStatus:{$ne: 'inactive'}});
      if(!couponExist) {
        return res.status(404).json({success: false, message: 'Coupon does not exists', coupon:true});
      }
      const currentDate = new Date();
      const endDate = new Date(couponExist.endDate);
  
      if(endDate < currentDate) {
        await Coupon.updateOne({_id: couponExist._id}, {$set: {couponStatus: 'expired'}});
        return res.status(400).json({success: false, message: 'Coupon validity expired.', coupon: true});
      }
    }
 
    const products = await Product.find({isBlocked: false});
    if(!products) {
      return res.status(404).json({success: false ,message: 'Products not found, Order Failed.'});
    }
    
    for(const item of cart.items) {
      const existProduct = products.find((product) => product._id.equals(item.productId));
      if(existProduct) {
        const productVariant =  existProduct.variant.find((variant) => variant.color === item.color)
        if(productVariant) {
          if(productVariant[item.size] < item.quantity) {
            if(productVariant[item.size] === 0) {
              return res.status(400).json({success: false, message: `${existProduct.productName} out of stock, order Failed`});
            }
            return res.status(400).json({success: false, message: `${existProduct.productName} only ${productVariant[item.size]} available, order Failed`});
          }
          const newStock = productVariant[item.size] - item.quantity;
          productVariant[item.size] = newStock;
        }
        await existProduct.save();
      }
    }

    const address = {
      name: userAddress.name,
      phone: userAddress.phone,
      pincode: userAddress.pincode,
      locality: userAddress.locality,
      address: userAddress.address,
      place: userAddress.place,
      state: userAddress.state,
      landmark: userAddress.landmark || '',
      alternatePhone: userAddress.alternatePhone || '',
      addressType: userAddress.addressType
    }
    let items = cart.items.map((item) => {
      return {
        productId:item.productId,
        color: item.color,
        size: item.size,
        quantity: item.quantity,
        price: item.price,
        image: item.image,
        itemStatus: 'Pending'
      }
    });
    const paymentStatus = 'Pending';
    const orderStatus = 'Pending';
    const shippingCost = 5;
    const paymentMethod = 'cod';
    const orderedId = generateOrderId();
    if(coupon) {
      if(cart.totalAmount<couponExist.minCartValue) {
        return res.status(400).json({success: false, message: `cart amount must be greater than ${coupon.minCartValue}`});
      }
      let payableAmount;
      let discountPrice; 

      if(couponExist.couponType === 'percentage') {
        discountPrice = ((cart.totalAmount * couponExist.discountValue)/100).toFixed(2);
        if(discountPrice>couponExist.maxDiscount) {
          discountPrice = couponExist.maxDiscount;
        }
        if(discountPrice>cart.totalAmount) {
          return res.status(400).json({success: false, message: 'Cannot apply coupon.'})
        }
        payableAmount = (cart.totalAmount - discountPrice).toFixed(2);
      } else {
        if(cart.totalAmount<couponExist.discountValue) {
          return res.status(400).json({success: false, message: 'Cannot apply coupon.'});
        }
        discountPrice = couponExist.discountValue;
        payableAmount = (cart.totalAmount - discountPrice).toFixed(2);
      } 

      const exists = await User.findOneAndUpdate({_id:userId, isBlocked:false, "couponApplied.couponId": coupon.couponId}, {$inc: {"couponApplied.$.count": 1}}, {new:true});
      if(!exists) {
        const couponApplied = {
          couponId: coupon.couponId,
          count:1 
        }
        await User.updateOne({_id:userId, isBlocked:false}, {$push: {couponApplied}});
      } 
      await Coupon.updateOne({_id:coupon.couponId, couponStatus:{$ne:'inactive'}}, {$inc: {usedCount:1}});
      const appliedCoupon = {
        couponId:coupon.couponId,
        discountPrice:discountPrice
      }
      // const payableAmount = Number(coupon.payableAmount) + shippingCost;
      payableAmount = Number(payableAmount) + shippingCost;
      const totalAmount = cart.totalAmount;

      const newOrder = new Order({
        orderedId,
        userId,
        address,
        items,
        paymentStatus,
        orderStatus,
        totalAmount,
        payableAmount,
        shippingCost,
        paymentMethod,
        appliedCoupon
      });
     const ordered = await newOrder.save();
     if(ordered) {
      const deleteCart = await Cart.findOneAndDelete({userId});
      if(deleteCart) {
        req.session.coupon = null;
        return res.status(200).json({success: true, redirectUrl: `/orderSubmit?id=${ordered._id}`});
      } else {
        return res.status(500).json({success: false ,message: 'Failed to load order success page.'});
      }
     
     } else {
      return res.status(500).json({success: false ,message: 'Order Failed.'});
     }

    } else {
      const totalAmount = cart.totalAmount;
      const payableAmount = cart.totalAmount + shippingCost;
      const newOrder = new Order({
        orderedId,
        userId,
        address,
        items,
        paymentStatus,
        orderStatus,
        totalAmount,
        payableAmount,
        shippingCost,
        paymentMethod
      });
     const ordered = await newOrder.save();
     if(ordered) {
      const deleteCart = await Cart.findOneAndDelete({userId});
      if(deleteCart) {
        return res.status(200).json({success: true, redirectUrl: `/orderSubmit?id=${ordered._id}`});
      } else {
        return res.status(500).json({success: false ,message: 'Failed to load order success page.'});
      }
     
     } else {
      return res.status(500).json({success: false ,message: 'Order Failed.'});
     }
    }

  } catch (error) {
    return res.status(500).json({success:false, message: 'Internal server error'});
  }
}

const walletPayment = async (req, res) => {
  try {
    const userId = req.session.user;
    const coupon = req.session.coupon;
    if(!userId) {
      return res.status(401).json({success: false , redirectUrl: '/login'});
    }
    const addressId = req.query.addressId;
    if(!addressId) {
      return res.status(400).json({success: false, message: 'Please give shipping address, Order Failed.'});
    }
    const userWallet = await Wallet.findOne({userId, isActive: true});
    if(!userWallet) {
      return res.status(400).json({success: false, message: 'No money in wallet, Order Failed.'});
    }
    const cart = await Cart.findOne({userId});
    if(!cart) {
      return res.status(400).json({success: false, message: 'No items in Cart, Order Failed.'});
    }
    if(cart.totalAmount > userWallet.balance) {
      return res.status(400).json({success: false, message: 'Not enough money in wallet, Order Failed.'});
    }
    const userAddress = await Address.findOne({_id:addressId, userId, isBlocked: false});
    if(!userAddress) {
      return res.status(404).json({success: false ,message: 'address not found, Order Failed.'});
    }
    let couponExist;
    if(coupon) {
      couponExist = await Coupon.findOne({_id: coupon.couponId, couponStatus:{$ne: 'inactive'}});
      if(!couponExist) {
        return res.status(404).json({success: false, message: 'Coupon does not exists', coupon:true});
      }
      const currentDate = new Date();
      const endDate = new Date(couponExist.endDate);
  
      if(endDate < currentDate) {
        await Coupon.updateOne({_id: couponExist._id}, {$set: {couponStatus: 'expired'}});
        return res.status(400).json({success: false, message: 'Coupon validity expired.', coupon: true});
      }
    }
    const products = await Product.find({isBlocked: false});
    if(!products) {
      return res.status(404).json({success: false ,message: 'Products not found, Order Failed.'});
    }
    for(const item of cart.items) {
      const existProduct = products.find((product) => product._id.equals(item.productId));
      if(existProduct) {
        const productVariant =  existProduct.variant.find((variant) => variant.color === item.color)
        if(productVariant) {
          if(productVariant[item.size] < item.quantity) {
            if(productVariant[item.size] === 0) {
              return res.status(400).json({success: false, message: `${existProduct.productName} out of stock, order Failed`});
            }
            return res.status(400).json({success: false, message: `${existProduct.productName} only ${productVariant[item.size]} available, order Failed`});
          }
          const newStock = productVariant[item.size] - item.quantity;
          productVariant[item.size] = newStock;
        }
        await existProduct.save();
      }
    }
    const address = {
      name: userAddress.name,
      phone: userAddress.phone,
      pincode: userAddress.pincode,
      locality: userAddress.locality,
      address: userAddress.address,
      place: userAddress.place,
      state: userAddress.state,
      landmark: userAddress.landmark || '',
      alternatePhone: userAddress.alternatePhone || '',
      addressType: userAddress.addressType
    }
    let items = cart.items.map((item) => {
      return {
        productId:item.productId,
        color: item.color,
        size: item.size,
        quantity: item.quantity,
        price: item.price,
        image: item.image,
      }
    });
    const paymentStatus = 'Paid';
    const orderStatus = 'Pending';
    const paymentMethod = 'wallet';
    const shippingCost = 5;
    const orderedId = generateOrderId();
    if(coupon) {

      if(cart.totalAmount<couponExist.minCartValue) {
        return res.status(400).json({success: false, message: `cart amount must be greater than ${coupon.minCartValue}`});
      }
      let payableAmount;
      let discountPrice;  

      if(couponExist.couponType === 'percentage') {
        discountPrice = ((cart.totalAmount * couponExist.discountValue)/100).toFixed(2);
        if(discountPrice>couponExist.maxDiscount) {
          discountPrice = couponExist.maxDiscount;
        }
        if(discountPrice>cart.totalAmount) {
          return res.status(400).json({success: false, message: 'Cannot apply coupon.'})
        }
        payableAmount = (cart.totalAmount - discountPrice).toFixed(2);
      } else {
        if(cart.totalAmount<couponExist.discountValue) {
          return res.status(400).json({success: false, message: 'Cannot apply coupon.'});
        }
        discountPrice = couponExist.discountValue;
        payableAmount = (cart.totalAmount - discountPrice).toFixed(2);
      }    
      const exists = await User.findOneAndUpdate({_id:userId, isBlocked:false, "couponApplied.couponId": coupon.couponId}, {$inc: {"couponApplied.$.count": 1}}, {new:true});
      if(!exists) {
        const couponApplied = {
          couponId: coupon.couponId,
          count:1 
        }
        await User.updateOne({_id:userId, isBlocked:false}, {$push: {couponApplied}});
      } 
      await Coupon.updateOne({_id:coupon.couponId, couponStatus:{$ne:'inactive'}}, {$inc: {usedCount:1}});
      const appliedCoupon = {
        couponId:coupon.couponId,
        discountPrice:discountPrice
      }


      // const payableAmount = Number(coupon.payableAmount) + shippingCost;
      payableAmount = Number(payableAmount) + shippingCost;
      const totalAmount = cart.totalAmount;
    
      const newOrder = new Order({
        orderedId,
        userId,
        address,
        items,
        paymentStatus,
        orderStatus,
        totalAmount,
        payableAmount,
        paymentMethod,
        appliedCoupon,
        shippingCost
      });
     const ordered = await newOrder.save();
     if(ordered) {
      const balance = userWallet.balance - payableAmount;
      const transaction = {
        transactionType: 'payment',
        amount: payableAmount
      }
      await Wallet.updateOne({userId, isActive: true}, {$set: {balance}, $push: {transaction}});
      const deleteCart = await Cart.findOneAndDelete({userId});
      if(deleteCart) {
        req.session.coupon = null;
        return res.status(200).json({success: true, redirectUrl: `/orderSubmit?id=${ordered._id}`});
      } else {
        return res.status(500).json({success: false ,message: 'Failed to load order success page.'});
      }
     
     } else {
      return res.status(500).json({success: false ,message: 'Order Failed.'});
     }

    } else {
      const totalAmount = cart.totalAmount;
      const payableAmount = cart.totalAmount + shippingCost;
      const newOrder = new Order({
        orderedId,
        userId,
        address,
        items,
        paymentStatus,
        orderStatus,
        totalAmount,
        payableAmount,
        paymentMethod,
        shippingCost
      });
     const ordered = await newOrder.save();
     if(ordered) {
      const balance = userWallet.balance - payableAmount;
      const transaction = {
        transactionType: 'payment',
        amount: payableAmount
      }
      await Wallet.updateOne({userId, isActive: true}, {$set: {balance}, $push: {transaction}});
      const deleteCart = await Cart.findOneAndDelete({userId});
      if(deleteCart) {
        return res.status(200).json({success: true, redirectUrl: `/orderSubmit?id=${ordered._id}`});
      } else {
        return res.status(500).json({success: false ,message: 'Failed to load order success page.'});
      }
     
     } else {
      return res.status(500).json({success: false ,message: 'Order Failed.'});
     }
    }
  } catch (error) {
    res.status(500).json({success: false, message: 'Internal server error'});
  }
}

function generateOrderId() {
  const timestamp = Date.now();
  const randomNo = Math.floor(1000+Math.random() * 9000);
  return `ORD-${timestamp}-${randomNo}`
}

const getOrderDetails = async (req, res) => {
  try {
    const userId = req.session.user;
    if(!userId) {
      return res.redirect('/login');
    }
    const orderId = req.query.id;
    if(!orderId) {
      return res.redirect('/pageNotFound');
    }
    const order = await Order.findOne({_id:orderId, userId})
    .populate('items.productId', 'productName')
    .exec();
    const returnItem = await ordReturn.findOne({orderId, status: 'Pending'});
    const allRejected = await ordReturn.findOne({orderId, isAllItem: true,status: 'Rejected'});

    let aldreadyChangeStatus = false;
    if(returnItem && !allRejected) {
      aldreadyChangeStatus = false;
    } else {
      const returned = await ordReturn.findOne({orderId, status:'Approved'});
      if(returned) {
        aldreadyChangeStatus = true;
      } else {
        const rejected = await ordReturn.findOne({orderId, status:'Rejected'});
        if(rejected) {
          aldreadyChangeStatus = true;
        }
      }
    }
    let returnAllitem; 
    let retItems;

    if(returnItem && !allRejected) {
      returnAllitem = returnItem.isAllItem ? true : false;
      if(!returnAllitem) {
        retItems = returnItem.items.length > 0 ? returnItem.items : retItems;
      }
    }
    res.render('order-detail', {order, returnAllitem, retItems, allRejected, aldreadyChangeStatus});
  } catch (error) {
    res.redirect('/pageNotFound');
  }
}
const cancelOrder = async (req, res) => {
  try {
    const userId = req.session.user;
    if(!userId) {
      return res.status(401).json({success: false, redirectUrl:'/login'});
    }
    const orderId = req.query.id;
    if(!orderId) {
      return res.status(400).json({success: false, message: 'Invalid order id, Order cancel Failed'});
    }
    const order = await Order.findOne({_id:orderId, userId});
    if(!order) {
      return res.status(404).json({success: false, message: 'Order not found, Order cancel Failed'});
    }
    if(order.orderStatus === 'Delivered' || order.orderStatus === 'Canceled' || order.orderStatus === 'Returned') {
      return res.status(400).json({success: false, message: `Order is ${order.orderStatus}, Order cancel Failed`});
    }
    if(order.paymentMethod === 'cod' || order.paymentMethod === 'wallet' || order.paymentMethod === 'razorpay' && order.paymentStatus === 'Paid') {
      const products = await Product.find({isBlocked: false});
      if(!products) {
        return res.status(404).json({success: false, message: 'Product not found, Order cancel Failed'});
      }
      for(const item of order.items) {
        const existProduct = products.find((product) => product._id.equals(item.productId));
        if(existProduct) {
          const productVariant =  existProduct.variant.find((variant) => variant.color === item.color)
          if(productVariant) {
            const newStock = productVariant[item.size] + item.quantity;
            productVariant[item.size] = newStock;
          }
          await existProduct.save();
        }
      }
    }
    if(order.paymentStatus === 'Paid') {
      const wallet = await Wallet.findOne({userId, isActive:true});
      let balance = order.payableAmount;
      const transaction = {
        transactionType: 'refund',
        amount: order.payableAmount
      }
      if(wallet) {
        balance += wallet.balance;
        await Wallet.updateOne({userId, isActive:true}, {$set:{balance}, $push: {transaction}});
      } else {
        const newWallet = new Wallet({
          userId,
          balance,
          transaction
        })
        await newWallet.save();
      }
    }
    const cancelOrder = await Order.findOneAndUpdate({_id:orderId, userId}, {$set: {orderStatus: 'Canceled', payableAmount:0, paymentStatus: 'Canceled', "items.$[].isCanceled": true}}, {new:true});
    if(cancelOrder) { 
      return res.status(200).json({success: true})
    } else {
      return res.status(500).json({success: false, message:'Failed to Cancel Order'});
    }
  } catch (error) {
    res.status(500).json({success: false, message:'Internal server error'});
  }
}

const createOrder = async (req, res) => {
  try {
    // checking user session
    const userId = req.session.user;
    const email = req.session.email;
    if(!userId) {
      return res.status(401).json({success: false, redirectUrl:'/login'});
    }
    const coupon = req.session.coupon;
    let couponExist;
    if(coupon) {
      couponExist = await Coupon.findOne({_id: coupon.couponId, couponStatus:{$ne: 'inactive'}});
      if(!couponExist) {
        return res.status(404).json({success: false, message: 'Coupon does not exists', coupon: true});
      }
      const currentDate = new Date();
      const endDate = new Date(couponExist.endDate);
  
      if(endDate < currentDate) {
        await Coupon.updateOne({_id: couponExist._id}, {$set: {couponStatus: 'expired'}});
        return res.status(400).json({success: false, message: 'Coupon validity expired.', coupon: true});
      }
    }
    // checking user provided address id
    const addressId = req.query.id;
    if(!addressId) {
      return res.status(400).json({success: false, message: 'Please give shipping address, Order Failed.'});
    }
    // checking user cart exists
    const cart = await Cart.findOne({userId});
    if(!cart) {
      return res.status(400).json({success: false, message: 'No items in Cart, Order Failed.'});
    }
    // checking user address exists
    const userAddress = await Address.findOne({_id:addressId, userId, isBlocked: false});
    if(!userAddress) {
      return res.status(404).json({success: false ,message: 'shipping address not found, Order Failed.'});
    }
    
    const products = await Product.find({isBlocked: false});
    if(!products) {
      return res.status(404).json({success: false ,message: 'Product not found, Order Failed.'});
    }
    for(const item of cart.items) {
      const existProduct = products.find((product) => product._id.equals(item.productId));
      if(existProduct) {
        const productVariant =  existProduct.variant.find((variant) => variant.color === item.color)
        if(productVariant) {
          if(productVariant[item.size] < item.quantity) {
            if(productVariant[item.size] === 0) {
              return res.status(400).json({success: false, message: `${existProduct.productName} out of stock, order Failed`});
            }
            return res.status(400).json({success: false, message: `${existProduct.productName} only ${productVariant[item.size]} available, order Failed`});
          }
        }
      }
    }
    const address = {
      name: userAddress.name,
      phone: userAddress.phone,
      pincode: userAddress.pincode,
      locality: userAddress.locality,
      address: userAddress.address,
      place: userAddress.place,
      state: userAddress.state,
      landmark: userAddress.landmark || '',
      alternatePhone: userAddress.alternatePhone || '',
      addressType: userAddress.addressType
    }

    let items = cart.items.map((item) => {
      return {
        productId:item.productId,
        color: item.color,
        size: item.size,
        quantity: item.quantity,
        price: item.price,
        image: item.image,
      }
    });
    const paymentStatus = 'Pending';
    const orderStatus = 'Pending';
    const shippingCost = 5;
    const paymentMethod = 'razorpay';
    const orderedId = generateOrderId();
    let options;
    let razorpayOrder;
    let newOrder;
    if(coupon) {

      if(cart.totalAmount<couponExist.minCartValue) {
        return res.status(400).json({success: false, message: `cart amount must be greater than ${coupon.minCartValue}`});
      }
      let payableAmount;
      let discountPrice;  
      
      if(couponExist.couponType === 'percentage') {
        discountPrice = ((cart.totalAmount * couponExist.discountValue)/100).toFixed(2);
        if(discountPrice>couponExist.maxDiscount) {
          discountPrice = couponExist.maxDiscount;
        }
        if(discountPrice>cart.totalAmount) {
          return res.status(400).json({success: false, message: 'Cannot apply coupon.'})
        }
        payableAmount = (cart.totalAmount - discountPrice).toFixed(2);
      } else {
        if(cart.totalAmount<couponExist.discountValue) {
          return res.status(400).json({success: false, message: 'Cannot apply coupon.'});
        }
        discountPrice = couponExist.discountValue;
        payableAmount = (cart.totalAmount - discountPrice).toFixed(2);
      }

      const exists = await User.findOneAndUpdate({_id:userId, isBlocked:false, "couponApplied.couponId": coupon.couponId}, {$inc: {"couponApplied.$.count": 1}}, {new:true});
      if(!exists) {
        const couponApplied = {
          couponId: coupon.couponId,
          count:1 
        }
        await User.updateOne({_id:userId, isBlocked:false}, {$push: {couponApplied}});
      } 
      await Coupon.updateOne({_id:coupon.couponId, couponStatus:{$ne:'inactive'}}, {$inc: {usedCount:1}});
      const appliedCoupon = {
        couponId:coupon.couponId,
        discountPrice:discountPrice
      }
      const totalAmount = cart.totalAmount;
      payableAmount = Number(payableAmount) + shippingCost;
      options = {
        amount: payableAmount * 100, 
        currency: 'INR',
        receipt: 'receipt#1'
      }
      razorpayOrder = await razorpay.orders.create(options);
      // const payableAmount = Number(coupon.payableAmount) + shippingCost;
      newOrder = new Order({
        orderedId,
        userId,
        address,
        items,
        paymentStatus,
        orderStatus,
        totalAmount,
        payableAmount,
        paymentMethod,
        appliedCoupon,
        shippingCost,
        razorpayOrderId: razorpayOrder.id
      });
    } else {
      const totalAmount = cart.totalAmount;
      const payableAmount = cart.totalAmount + shippingCost;
      options = {
        amount: payableAmount * 100, 
        currency: 'INR',
        receipt: 'receipt#1'
      }
      razorpayOrder = await razorpay.orders.create(options);
      newOrder = new Order({
        orderedId,
        userId,
        address,
        items,
        paymentStatus,
        orderStatus,
        totalAmount,
        payableAmount,
        paymentMethod,
        shippingCost,
        razorpayOrderId: razorpayOrder.id
      });
    }
    if(newOrder) {
      await Cart.findOneAndDelete({userId});
      if(coupon) {
        req.session.coupon = null;
      }
      const orderPlaced = await newOrder.save();
      if(orderPlaced) {
        return res.status(200).json({success: true, razorpayOrder, email, userAddress, razorpayId: razorpay.key_id, orderId: orderPlaced._id });
      } else {
        return res.status(500).json({success: false, message: 'Something went wrong, Failed to place order'});
      }
    } else {
      return res.status(500).json({success: false, message: 'Something went wrong, Failed to place order'});
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

const verifyPayment = async (req, res) => {
  const userId = req.session.user;
  if(!userId) {
    return res.status(401).json({success: false, redirectUrl:'/login'});
  }
  const orderId = req.query.orderId;
  if(!orderId) {
    return res.status(401).json({success: false, message:'Invalid credential'});
  }
  const {razorpay_order_id, razorpay_payment_id} = req.body;
  const razorpay_signature = req.headers['x-razorpay-signature'];
  const secret = razorpay.key_secret;
  const body = razorpay_order_id + '|' + razorpay_payment_id;
  try {
    const isValidSignature = validateWebhookSignature(body, razorpay_signature, secret);
    if(isValidSignature) {
    const order = await Order.findOne({_id: orderId, userId});
    if(!order) {
      return res.status(404).json({success: false ,message: 'Order not found, Order verification Failed.'});
    }
    const products = await Product.find({isBlocked: false});
    if(!products) {
      return res.status(404).json({success: false ,message: 'Product not found, Order verification Failed.'});
    }
    for(const item of order.items) {
      const existProduct = products.find((product) => product._id.equals(item.productId));
      if(existProduct) {
        const productVariant =  existProduct.variant.find((variant) => variant.color === item.color)
        if(productVariant) {
          if(productVariant[item.size] < item.quantity) {
            if(productVariant[item.size] === 0) {
              return res.status(400).json({success: false, message: `${existProduct.productName} out of stock, order Failed`});
            }
            return res.status(400).json({success: false, message: `${existProduct.productName} only ${productVariant[item.size]} available, order Failed`});
          }
          const newStock = productVariant[item.size] - item.quantity;
          productVariant[item.size] = newStock;
        }
        await existProduct.save();
      }
    }
     const verifyPayment = await Order.findOneAndUpdate({_id: orderId, userId}, {$set: {paymentStatus: 'Paid'}}, {new: true})
     if(verifyPayment) {
      return res.status(200).json({success: true});
     } else {
      return res.status(404).json({success: false, message: 'Order not found'})
     }
    } else {
      res.status(400).json({ success: false, message: 'verification failed' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

const paymentFailed = async (req, res) => {
  try {
    const { message } = req.body; // Razorpay webhook sends payload
    return res.status(200).json({success: true, message: 'Payment Failed, retry'});
  } catch (error) {
    res.status(500).json({success: false, message: 'Internal server error'});
  }
}

const handleWebhook = async (req, res) => {
  try {
    const { event, payload } = req.body;
    if(event === 'payment.failed') {
     await Order.updateOne({razorpayOrderId: payload.payment.entity.order_id, paymentStatus: {$ne: 'Failed'}}, {$set: {paymentStatus: 'Failed'}}); 
    }
  } catch (error) {
    res.status(500).json({success: false, message: 'Internal server error'});
  }
}


const applyCoupon = async (req, res) => {
  try {
    const userId = req.session.user;
    if(!userId) {
      return res.status(401).json({success: false,redirectUrl: '/login'});
    }
    const user = await User.findOne({_id: userId, isBlocked:false});
    if(!user) {
      return res.status(404).json({success: false, message: 'User not found.'});
    }
    const {cartId, code} = req.body;
    const coupon = await Coupon.findOne({code, couponStatus: {$ne:'inactive'}});
    if(!coupon) {
      return res.status(404).json({success: false, message: 'Coupon does not exists'});
    }

    const currentDate = new Date();
    const endDate = new Date(coupon.endDate);

    if(endDate < currentDate) {
      await Coupon.updateOne({_id: coupon._id, code}, {$set: {couponStatus: 'expired'}});
      return res.status(400).json({success: false, message: 'Coupon validity expired.'});
    }

    if(coupon.usedCount >= coupon.totalUsageLimit) {
      return res.status(400).json({success: false, message: 'Coupon limit exceeded. Please try another coupon.'})
    }

    const cart = await Cart.findOne({_id:cartId});
    if(!cart) {
      return res.status(404).json({success: false, message: 'Cart do not found'});
    }
    // finding user aldready used this coupon
    const exists = user.couponApplied.find(existCoupon => existCoupon.couponId.equals(coupon._id));
    // checking user coupon limt
    if(exists) {
      if(exists.count >= coupon.usageLimitPerUser) {
        return res.status(400).json({success: false, message: 'Your limit exceeded.'});
      }
    }
      // checking amount greater than cart value
      if(cart.totalAmount<coupon.minCartValue) {
        return res.status(400).json({success: false, message: `cart amount must be greater than ${coupon.minCartValue}`});
      }
      let discountPrice;
      let payableAmount;
      // checking coupon type
      if(coupon.couponType === 'percentage') {
        discountPrice = ((cart.totalAmount * coupon.discountValue)/100).toFixed(2);
        if(discountPrice>coupon.maxDiscount) {
          discountPrice = coupon.maxDiscount;
        }
        if(discountPrice>cart.totalAmount) {
          return res.status(400).json({success: false, message: 'Cannot apply coupon.'})
        }
        payableAmount = (cart.totalAmount - discountPrice).toFixed(2);
      } else {
        if(cart.totalAmount<coupon.discountValue) {
          return res.status(400).json({success: false, message: 'Cannot apply coupon.'});
        }
        discountPrice = coupon.discountValue;
        payableAmount = (cart.totalAmount - discountPrice).toFixed(2);
      }

      const appliedCoupon = {
        cartId,
        couponId:coupon._id,
        discountPrice,
        payableAmount,
        subtotal:cart.totalAmount
      }

      if(appliedCoupon) {
        req.session.coupon = appliedCoupon;
        return res.status(200).json({success: true, payableAmount, discountPrice});
      } else {
        return res.status(500).json({success: false, message: 'Failed to apply coupon'});
      }

  } catch (error) {
    res.status(500).json({success: false, message: 'Internal server error'});
  }
}
const removeCoupon = async (req, res) => {
  try {
    if(!req.session.user) {
      return res.status(401).json({success: false, redirectUrl: '/login'});
    }
    const coupon = req.session.coupon;
    const totalAmount = coupon ? coupon.subtotal : null;
    if(totalAmount) {
      req.session.coupon = null;
      return res.status(200).json({success: true, totalAmount});
    } else {
      return res.status(500).json({success:false, message: 'Failed to remove coupon'});
    }
  } catch (error) {
    res.status(500).json({success: false, message: 'Remove coupon error'});
  }
}

const changeItemStatus = async (req, res) => {
  try {
    const userId = req.session.user;
    if(!userId) {
      return res.status(401).json({success: false,redirectUrl: '/login'});
    }
    const orderId = req.query.orderId;
    const itemId = req.query.itemId;
    const quantity = Number(req.body.quantity);
    if(!orderId || !itemId || !quantity) {
      return res.status(404).json({success: false, message: 'Credential not found'});
    }
 
    const order = await Order.findOne({_id: orderId, "items._id":itemId})
    .populate("appliedCoupon.couponId")
    .exec();
    if(!order) {
      return res.status(404).json({success: false, message: 'Order not found'});
    }
    if(order.orderStatus === 'Delivered' || order.orderStatus === 'Canceled' || order.orderStatus === 'Returned') {
      return res.status(400).json({success: false, message: `Order is ${order.orderStatus}, Order cancel Failed`});
    }
    const selectedItem = order.items.find(item => item._id.equals(new ObjectId(itemId)));
    if(selectedItem.isCanceled) {
      return res.status(400).json({success: false, message: `Product is aldready canceled, Order cancel Failed`});
    }
    let payableAmount;
    let discountPrice;
    let balance;

    // if coupon exist
    if(order.appliedCoupon.discountPrice) {
      const totalwithoutCoupon = (order.payableAmount - order.shippingCost) + order.appliedCoupon.discountPrice;
      const totalwithoutCancelProduct = totalwithoutCoupon - (selectedItem.price * quantity);
      //if coupon value greater than min cart value
      if(totalwithoutCancelProduct>= order.appliedCoupon.couponId.minCartValue) {
        const disCanceleditem = selectedItem.price * (order.appliedCoupon.discountPrice/totalwithoutCoupon); 
        discountPrice = order.appliedCoupon.discountPrice - (disCanceleditem * quantity);
        discountPrice = Number(discountPrice.toFixed(2));
        payableAmount = ((order.payableAmount - order.shippingCost) - ((selectedItem.price * quantity) - (disCanceleditem * quantity))).toFixed(2);
        payableAmount = Number(payableAmount);
        balance = ((order.payableAmount - order.shippingCost) - payableAmount).toFixed(2);
        balance = Number(balance);
      } else {
        // if not
        payableAmount = totalwithoutCancelProduct.toFixed(2);;
        payableAmount = Number(payableAmount);
        balance = ((order.payableAmount - order.shippingCost ) - payableAmount).toFixed(2);
        balance = Number(balance);
        discountPrice = 0;
      }
      payableAmount+=order.shippingCost;
    } else {
      // if not coupon exist
      payableAmount = (order.payableAmount - (selectedItem.price * quantity)).toFixed(2);
      payableAmount = Number(payableAmount);
      balance = (order.payableAmount - payableAmount).toFixed(2);
      balance = Number(balance);
    }

    let value = 'Canceled'
    payableAmount = payableAmount < 1 ? 0 : payableAmount;
    let firstCancel = selectedItem.canceledItems === 0 ? true : false;

    let itemQty;
    let isLastItem;
    if(value === 'Canceled') {
      itemQty = selectedItem.canceledItems + quantity || quantity;
      isLastItem = selectedItem.quantity - itemQty;
    } else if(value === 'Returned') {
      itemQty = selectedItem.returnedItem + quantity || quantity;
      isLastItem = selectedItem.quantity - itemQty;
    }
 
    let statusChange;
    if(isLastItem < 1) {
      statusChange = await Order.findOneAndUpdate({_id: orderId, "items._id":itemId}, {$set: { payableAmount, "appliedCoupon.discountPrice":discountPrice, "items.$.canceledItems":itemQty, "items.$.isCanceled": true}}, {new: true});
      let orderStatus = statusChange.items.every(item => item.isCanceled === true || item.isReturned === true);
      if(orderStatus) {
        balance += statusChange.shippingCost;
        payableAmount = 0;
        await Order.updateOne({_id: orderId}, {$set: {payableAmount, orderStatus: "Canceled", paymentStatus:"Canceled"}});
      }
    } else {
      statusChange = await Order.findOneAndUpdate({_id: orderId, "items._id":itemId}, {$set: { payableAmount, "appliedCoupon.discountPrice":discountPrice, "items.$.canceledItems":itemQty}}, {new: true});
    }
       console.log(balance)
    if(order.paymentStatus === 'Paid') {
      const wallet = await Wallet.findOne({userId, isActive:true});
      const transaction = {
        transactionType: 'refund',
        amount: balance
      }
      if(wallet) {
        balance += wallet.balance;
        await Wallet.updateOne({userId, isActive:true}, {$set:{balance}, $push: {transaction}});
      } else {
        const newWallet = new Wallet({
          userId,
          balance,
          transaction
        })
        await newWallet.save();
      }
    }
    if(order.paymentMethod === 'cod' || order.paymentMethod === 'wallet' || order.paymentMethod === 'razorpay' && order.paymentStatus === 'Paid') {
      const product = await Product.findOne({_id: selectedItem.productId, isBlocked:false});
      const variant = product.variant.find(variant => variant.color === selectedItem.color);
      if(variant) {
        const newStock = variant[selectedItem.size] + quantity;
        variant[selectedItem.size] = newStock;
      }
      await product.save();
    }
     if(isLastItem < 1) {
      return res.status(200).json({success: true, payableAmount, firstCancel, itemQty, isCanceled: true});
     } else {
      return res.status(200).json({success: true, payableAmount, itemQty, firstCancel, remainQty:selectedItem.quantity - itemQty});
     }
  } catch (error) {
    console.log(error)
    res.status(500).json({message: 'Internal server error'});
  }
}

const getWallet = async (req, res) => {
  try {
    const userId = req.session.user;
    const page = Number(req.query.page) || 1;
    const limit = 10;
    if(!userId) {
      return res.redirect('/login');
    }
    const wallet = await Wallet.findOne({userId, isActive:true});
    if(wallet) {
      const totalTransactions = wallet.transaction.length; 
      const transactions = wallet.transaction
      .sort((a, b) => new Date(b.date) - new Date(a.date)) 
      .slice((page - 1) * limit, page * limit) 
      return res.render('wallet', {balance: wallet.balance, transactions, currentPage: page, totalPages: Math.ceil(totalTransactions/limit)});
    } else {
      const wallet = new Wallet({userId})
      await wallet.save();
      return res.render('wallet', {balance: wallet.balance, transactions: null});
    }
  } catch (error) {
    res.redirect('/pageNotFound');
  }
}

const returnOrders = async (req, res) => {
  try {
    const orderId = req.query.id;
    const reasons = req.body.reason;
    const order = await Order.findOne({_id: orderId, orderStatus: 'Delivered'});
    if(!order) {
      return res.status(404).json({message: 'Order not found'});
    }
    const existOrder = await ordReturn.findOne({orderId , status: 'Pending'});
    if(existOrder) {
      await ordReturn.updateOne({orderId, status: 'Pending'}, {$set: {isAllItem: true}});
      return res.status(200).json({success: true});
    } else {
      const returnProduct = await new ordReturn({
        orderId,
        status: 'Pending',
        reasons,
        isAllItem: true
      }).save();
      if(returnProduct) {
        return res.status(200).json({success: true});
      } else {
        return res.status(500).json({success: false, message: 'Failed to confirm order'});
      }
    }
  } catch (error) {
    res.status(500).json({success: false, message: 'Internal server error'});
  }
}

const cancelReturn = async (req, res) => {
  try {
    const orderId = req.query.id;
    if(!orderId) {
      return res.status(401).json({success: false, message: 'Invalid credential'});
    }
    const order = await Order.findOne({_id: orderId, orderStatus: 'Delivered'});
    if(!order) {
      return res.status(404).json({message: 'Order not found'});
    }
    const cancelRet = await ordReturn.findOneAndDelete({orderId, status: 'Pending', isAllItem:true}, {new:true});
    if(cancelRet) {
      return res.status(200).json({success: true});
    } else {
      return res.status(500).json({success: false, message: 'Failed to cancel return request.'});
    }
  } catch (error) {
    res.status(500).json({success: false, message: 'Internal server error'});
  }
} 

const indiReturnConfrim = async (req, res) => {
  try {
    const orderId = req.query.id;
    const itemId = req.query.itemId;
    const reasons = req.body.reason;
    let quantity = Number(req.query.qty);
    const order = await Order.findOne({_id:orderId, 'items._id':itemId});
    if(!order) {
      return res.status(404).json({success: false, message: 'Order not found.'});
    }
    let isAllItem;
    let selectedItem = order.items.find(item => item._id.equals(new ObjectId(itemId)));
    const existOrder = await ordReturn.findOne({orderId, status: 'Pending'});
    if(existOrder) {
      const existItem = existOrder.items.find(item => item.itemId.equals(new ObjectId(itemId)));
      if(existItem) {
        quantity = existItem.quantity + quantity;
        if(selectedItem.quantity === quantity) {
          isAllItem = true;
        } else {
          isAllItem = false;
        }
      } else {
        if(selectedItem.quantity === quantity) {
          isAllItem = true;
        } else {
          isAllItem = false;
        }
      } 
      const items = {itemId, quantity, isAllItem};
      await ordReturn.updateOne({orderId, status: 'Pending'}, {$push:{items}, $set: {reasons}});
      if(selectedItem.quantity === quantity) {
        return res.status(200).json({success: true, isAllItem, quantity});
      } else {
        return res.status(200).json({success: true, quantity});
      }
    } else {
      if(selectedItem.quantity === quantity) {
        isAllItem = true;
      } else {
        isAllItem = false;
      }
      const items = {itemId, quantity, isAllItem};
      const returnItem = await new ordReturn({
        orderId,  
        status: 'Pending',
        items,
        isAllItem:false,
        reasons
      }).save();
      if(returnItem) {
        if(selectedItem.quantity === quantity) {
          return res.status(200).json({success: true, isAllItem, quantity});
        } else {
          return res.status(200).json({success: true, quantity});
        }
      } else {
        return res.status(500).json({success: false, message: 'Failed to confirm return order.'});
      }
    }
  } catch (error) {
    res.status(500).json({success: false, message: 'Internal server error'});
  }
}

const cancelIndiReturn = async (req, res) => {
  try {
    const orderId = req.query.id;
    const itemId = req.query.itemId;
    const order = await Order.findOne({_id: orderId, 'items._id': itemId});
    if(!order) {
      return res.status(404).json({success: false, message: 'Order not found'})
    }
    const cancelOrder = await ordReturn.findOneAndUpdate({orderId, status: 'Pending', 'items.itemId':itemId}, {$pull: {items: {itemId}}}, {new:true});
    if(cancelOrder) {
      if(cancelOrder.items.length === 0) {
        await ordReturn.deleteOne({orderId});
      }
      return res.status(200).json({success: true});
    } else {
      return res.status(404).json({success: false, message: 'Request not found'});
    }
  } catch (error) {
    res.status(500).json({success: false, message: 'Internal server error'});
  }
}

const downloadInvoice = async (req, res) => {
  try {
    const { orderId } = req.params; 
    const order = await Order.findById(orderId).populate('items.productId'); 
    
    if (!order) {
      return res.status(404).json({message: 'Order not found'});
    }

    const doc = new PDFDocument({ margin: 50 });
    const tableTop = 200; 
    const rowHeight = 30; 

    // Set response headers
    res.setHeader('Content-type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice_${orderId}.pdf"`);

    doc.pipe(res);

    // Title
    doc.fontSize(20).text('Invoice', { align: 'center' }).moveDown(1);

    // Order details
    doc.fontSize(12).text(`Order ID: ${order.orderedId}`);
    doc.text(`Date: ${new Date(order.createdAt).toLocaleDateString()}`);
    doc.text(`Customer Name: ${order.address.name}`);
    if(order.paymentMethod === 'cod') {
      doc.text('Payment Method: Cash on Delivery');
    } else if(order.paymentMethod === 'razorpay') {
      doc.text('Payment Method: Razorpay');
    } else if(order.paymentMethod === 'wallet') {
      doc.text('Payment Method: Wallet');
    }
    doc.text(`Payment Status: ${order.paymentStatus}`);
    doc.text(`Order Status: ${order.orderStatus}`);
    doc.text(`Shipping address: 
      Phone number: ${order.address.phone}
      ${order.address.locality}, ${order.address.address}
      ${order.address.place}, ${order.address.state} - ${order.address.pincode}`);
    doc.moveDown(2); // Add space before items table

    // Table Header
    const headers = [
      { label: "Product", width: 140 },
      { label: "Color", width: 80 },
      { label: "Size", width: 60 },
      { label: "Quantity", width: 80 },
      { label: "Unit Price", width: 80 },
      { label: "Total Price", width: 80 },
    ];

    const headerTopMargin = 50; // Margin above header
    const headerY = tableTop + headerTopMargin; // Calculate the y position for headers

    // Draw table headers
    let x = 50;
    headers.forEach(header => {
      doc.rect(x, headerY, header.width, rowHeight).stroke(); // Draw cell border
      doc.fontSize(12).text(header.label, x + 5, headerY + 5, { width: header.width - 10 }); // Adjusted padding
      x += header.width; // Move x position for next header
    });

    // Draw item rows
    order.items.forEach((item, index) => {
      const y = headerY + rowHeight + (index + 1) * rowHeight; // Calculate Y position for each row
      const rowData = [
        item.productId.productName,
        item.color,
        item.size,
        item.quantity,
        `$${item.price.toFixed(2)}`, // Unit Price
        `$${(item.price * item.quantity).toFixed(2)}`, // Total Price
      ];

      x = 50; // Reset x position for each row
      rowData.forEach((data, i) => {
        const colWidth = headers[i].width;
        doc.rect(x, y, colWidth, rowHeight).stroke(); // Draw cell border
        doc.fontSize(12).text(data, x + 5, y + 5, { width: colWidth - 10 }); // Adjusted padding
        x += colWidth; // Move x position for next cell
      });
    });

    // Total Amount
    doc.moveDown();
    // Total Amount Section
    const totalY = doc.y + 20; // Calculate Y position with a margin below the last row
    doc.text(`Total Amount: ${order.totalAmount}`, 50, totalY); // Align to left
    if (order.appliedCoupon.discountPrice>0) {
      doc.text(`Discount: ${order.appliedCoupon.discountPrice}`, 50, totalY + 20); // Align to left
      doc.text(`Shipping Cost: ${order.shippingCost}`, 50, totalY + 40);
      doc.text(`Payable Amount: ${order.payableAmount}`, 50, totalY + 60, { underline: true, fontSize: 14 });
    } else {
      doc.text(`Shipping Cost: ${order.shippingCost}`, 50, totalY + 20);
      doc.text(`Payable Amount: ${order.payableAmount}`, 50, totalY + 40, { underline: true, fontSize: 14 });
    }
     // Align to left

    // Finalize the PDF document
    doc.end();
  } catch (error) {
    res.status(500).json({success: false, message: 'Internal server error'});
  }
};

const continueRazorpay = async (req, res) => {
  try {
    const orderId = req.query.orderId;
    if(!orderId) {
      return res.status(401).json({success: false, message: 'Invalid credential'});
    }
    const userId = req.session.user;
    const order = await Order.findOne({_id: orderId, userId, paymentMethod: 'razorpay', paymentStatus: {$in: ['Pending', 'Failed']}});
    if(!order) {
      return res.status(404).json({success: false, message: 'Order not found'});
    }
    const products = await Product.find({isBlocked: false});
    if(!products) {
      return res.status(404).json({success: false ,message: 'Product not found, Payment Failed.'});
    }
    for(const item of order.items) {
      const existProduct = products.find((product) => product._id.equals(item.productId));
      if(existProduct) {
        const productVariant =  existProduct.variant.find((variant) => variant.color === item.color)
        if(productVariant) {
          if(productVariant[item.size] < item.quantity) {
            if(productVariant[item.size] === 0) {
              return res.status(400).json({success: false, message: `${existProduct.productName} out of stock, Payment Failed`});
            }
            return res.status(400).json({success: false, message: `${existProduct.productName} only ${productVariant[item.size]} available, Payment Failed`});
          }
        }
      }
    }
    res.status(200).json({success: true, razorpayOrderId:order.razorpayOrderId, amount: order.payableAmount * 100, currency: 'INR', razorpayId: razorpay.key_id, orderId: order._id});
  } catch (error) {
    res.status(500).json({success: false, message: 'Internal server error'});
  }
}

const paymentStatus = async (req, res) => {
  try {
    const orderId = req.query.orderId;
    if(!orderId) {
      res.status(401).json({success: false, message: 'Invalid credential'});
    }
    const userId = req.session.user;
    const paymentStatus = await Order.findOne({_id: orderId}, {_id:0, paymentStatus:1}); 
    if(paymentStatus) {
      res.status(200).json({success: true, paymentStatus: paymentStatus.paymentStatus});
    } else {
      res.status(404).json({success: false, message: 'Order not found'});
    }
  } catch (error) {
     res.status(500).json({success: false, message: 'Internal server error'});
  }
}

module.exports = {
  getCheckout,
  getPaySubmit,
  codpayment,
  walletPayment,
  getOrderDetails,
  cancelOrder,
  createOrder,
  verifyPayment,
  paymentFailed,
  applyCoupon,
  removeCoupon,
  changeItemStatus,
  getWallet,
  returnOrders,
  cancelReturn,
  indiReturnConfrim,
  cancelIndiReturn,
  downloadInvoice,
  handleWebhook,
  continueRazorpay,
  paymentStatus
}