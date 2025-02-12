const Order = require('../../models/orderSchema');
const ordReturn = require('../../models/ordReturnSchema');
const ObjectId = require('mongoose').Types.ObjectId;
const Wallet = require('../../models/walletSchema');
const Product = require('../../models/productSchema');

const getOrder = async (req, res) => {
  try {
    const page = req.query.page || 1;
    const limit = 10;
    const order = await Order.find().sort({createdAt: -1}).limit(limit*1).skip((page-1)*limit).populate('userId', 'name').exec();
    const count = await Order.find().countDocuments();

    const returnReq = await ordReturn.find({status: 'Pending'})
    .sort({createdAt: -1})
    .populate({
      path: 'orderId',
      populate: [
        {
          path: 'userId',
          select: 'email'
        },
        {
          path: 'items.productId',
          select: 'productName'
        }
      ]
    })
    .exec();
  
    for(let i = 0; i<returnReq.length; i++) {
      if(!returnReq[i].isAllItem) {
        for(let j = 0; j<returnReq[i].items.length; j++) {
          const itemName = returnReq[i].orderId.items.find(reitem => reitem._id.equals(new ObjectId(returnReq[i].items[j].itemId)));
          if(itemName) {
            returnReq[i].items[j].itemName = itemName.productId.productName;
          }
        }
      }
    }

    res.render('admin-order', {
      order,
      currentPage:page,
      totalPages: Math.ceil(count/limit),
      returnReq,
      heading: 'orders list'
    });
  } catch (error) {
   res.redirect('/admin/pageError');
  }
}

const getOrderDetails = async (req, res) => {
  try {
    const orderId = req.query.id;
    const order = await Order.findOne({_id:orderId})
    .populate('items.productId', 'productName')
    .populate('userId', 'email name')
    .exec();
    res.render('admin-orderDetails', {order, heading: 'Order Details'});
  } catch (error) {
    res.redirect('/admin/pageError');
  }
}
const changeOrderStatus = async (req, res) => {
  try {
    const orderId = req.query.id;
    const orderStatus = req.body.orderStatus;
    if(!orderId) {
      return res.status(404).json({success: false, message: 'Order id not found'});
    }
    const order = await Order.findOne({_id: orderId});
    if(!order) {
      return res.status(404).json({success: false, message: 'Order not found'});
    } 
    if(order.orderStatus === 'Canceled' || order.orderStatus === 'Delivered') {
      return res.status(400).json({success: false, message: `Cannot change status, Order already ${order.orderStatus}`});
    }
    let paymentStatus;
    if(orderStatus === 'Pending') {
      paymentStatus = 'Pending';
    } else if(orderStatus === 'Confirmed') {
      paymentStatus = 'Pending';
    } else if(orderStatus === 'Shipped') {
      paymentStatus = 'Pending';
    } else if(orderStatus === 'Delivered') {
      paymentStatus = 'Paid';
    }  else if(orderStatus === 'Canceled') {
      paymentStatus = 'Canceled';
    }
    const products = await Product.find({isBlocked: false});
    if(!products) {
      return res.status(404).json({success: false, message: 'Product not found, Order cancel Failed'});
    }
    if(orderStatus === 'Canceled' && order.paymentMethod === 'cod' || orderStatus === 'Canceled' && order.paymentMethod === 'wallet' || orderStatus === 'Canceled' && order.paymentMethod === 'razorpay' && order.paymentStatus === 'Paid') {
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
    if(orderStatus === 'Delivered' && order.paymentMethod === 'razorpay' && order.paymentStatus !== 'Paid') {
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
    }
    if(orderStatus === 'Canceled' && order.paymentStatus === 'Paid') {
      const wallet = await Wallet.findOne({userId: order.userId, isActive:true});
      let balance = order.payableAmount;
      const transaction = {
        transactionType: 'refund',
        amount: order.payableAmount
      }
      if(wallet) {
        balance += wallet.balance;
        await Wallet.updateOne({userId: order.userId, isActive:true}, {$set:{balance}, $push: {transaction}});
      } else {
        const newWallet = new Wallet({
          userId: order.userId,
          balance,
          transaction
        })
        await newWallet.save();
      }
    }
    const updateStatus = await Order.findOneAndUpdate({_id: orderId}, {$set: {orderStatus, paymentStatus}}, {new:true});
    if(updateStatus) {
      return res.status(200).json({success: true, orderStatus, paymentStatus});
    } else {
      return res.status(200).json({success: false, message: 'Failed to change status.'});
    }
  } catch (error) {
    res.status(500).json({success: false, message: 'Internal server error'});
  }
}

const acceptReturnReq = async (req, res) => {
  try {
    const returnId = req.query.id;
    const returnReq = await ordReturn.findOne({_id:returnId});
    let order = await Order.findOne({_id:returnReq.orderId})
    .populate("appliedCoupon.couponId")
    .exec();
    if(!returnReq) {
      return res.status(404).json({success: false, message: 'Return request not found.'});
    }
    if(!order) {
      return res.status(404).json({success: false, message: 'Order not found.'});
    }
    const products = await Product.find({isBlocked: false});
    if(!products) {
      return res.status(404).json({success: false, message: 'Product not found, Order Returned Failed'});
    }
    let wallet = await Wallet.findOne({userId: order.userId});
    let reFundAmount = 0;
    if(returnReq.isAllItem) {
      await Order.updateOne({_id:returnReq.orderId}, {$set: {orderStatus:'Returned', payableAmount:0, paymentStatus: 'Refunded' , 'items.$[].isReturned': true}});
      await ordReturn.updateOne({_id:returnId, status:'Pending'}, {$set: {status: "Approved"}});
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
      reFundAmount = order.payableAmount;
      if(wallet) {
        const transaction = {
          transactionType: 'refund',
          amount: reFundAmount
        }
        reFundAmount += wallet.balance;
        await Wallet.updateOne({userId: order.userId}, {$set:{balance:reFundAmount}, $push: {transaction}});
      } else {
        const newWallet = new Wallet({
          userId: order.userId,
          balance:reFundAmount,
          transaction
        })
        await newWallet.save();
      }
      return res.status(200).json({success: true});
    } else {

       for(let i = 0; i<returnReq.items.length; i++) {
        const itemId = returnReq.items[i].itemId;
        const quantity = returnReq.items[i].quantity;
        const selectedItem = order.items.find(item => item._id.equals(new ObjectId(itemId)));

        let payableAmount;
        let discountPrice;
        let balance;

              // if coupon exist
        if(order.appliedCoupon.discountPrice) {
          const totalwithoutCoupon = (order.payableAmount - order.shippingCost) + order.appliedCoupon.discountPrice;
          const totalwithoutReturnProduct = totalwithoutCoupon - (selectedItem.price * quantity);
          //if coupon value greater than min cart value
          if(totalwithoutReturnProduct>= order.appliedCoupon.couponId.minCartValue) {
            const disReturnitem = selectedItem.price * (order.appliedCoupon.discountPrice/totalwithoutCoupon); 
            discountPrice = order.appliedCoupon.discountPrice - (disReturnitem * quantity);
            discountPrice = Number(discountPrice.toFixed(2));
            payableAmount = (order.payableAmount - order.shippingCost) - ((selectedItem.price * quantity) - (disReturnitem * quantity))
            payableAmount = Number(payableAmount.toFixed(2));
            balance = (order.payableAmount - order.shippingCost) - payableAmount;
            balance = Number(balance.toFixed(2));
          } else {
            // if not
            payableAmount = Number(totalwithoutReturnProduct.toFixed(2));
            balance = (order.payableAmount - order.shippingCost) - payableAmount;
            balance = Number(balance.toFixed(2));
            discountPrice = 0;
          }
          payableAmount += order.shippingCost;
        } else {
          // if not coupon exist
          payableAmount = order.payableAmount - (selectedItem.price * quantity);
          payableAmount = Number(payableAmount.toFixed(2));
          balance = order.payableAmount - payableAmount;
          balance = Number(balance.toFixed(2));
        }

        payableAmount = payableAmount < 1 ? 0 : payableAmount;
        const itemQty = selectedItem.returnedItem + quantity || quantity;
        const isLastItem = selectedItem.quantity - itemQty;

        if(isLastItem < 1) {  
          order = await Order.findOneAndUpdate({_id: returnReq.orderId, "items._id":itemId}, {$set: { payableAmount, "appliedCoupon.discountPrice":discountPrice, "items.$.returnedItem":itemQty, "items.$.isReturned": true}}, {new: true}).populate("appliedCoupon.couponId").exec();
          let orderStatus = order.items.every(item => item.isCanceled === true || item.isReturned === true);
          if(orderStatus) {
            balance += order.shippingCost;
            payableAmount = 0;
            await Order.updateOne({_id: returnReq.orderId}, {$set: {payableAmount, orderStatus: "Returned", paymentStatus:"Refunded"}});
          }
        } else {
          order = await Order.findOneAndUpdate({_id: returnReq.orderId, "items._id":itemId}, {$set: { payableAmount, "appliedCoupon.discountPrice":discountPrice, "items.$.returnedItem":itemQty}}, {new: true}).populate("appliedCoupon.couponId").exec();
        }
        reFundAmount += balance;
        const product = await Product.findOne({_id: selectedItem.productId, isBlocked:false});
        const variant = product.variant.find(variant => variant.color === selectedItem.color);
        if(variant) {
          const newStock = variant[selectedItem.size] + quantity;
          variant[selectedItem.size] = newStock;
         }
         await product.save();
       }
       await ordReturn.updateOne({_id:returnId, status:'Pending'}, {$set: {status: "Approved"}});

       if(wallet) {
        const transaction = {
          transactionType: 'refund',
          amount: reFundAmount
        }
        reFundAmount += wallet.balance;
        await Wallet.updateOne({userId: order.userId}, {$set:{balance:reFundAmount}, $push: {transaction}});
      } else {
        const newWallet = new Wallet({
          userId: order.userId,
          balance:reFundAmount,
          transaction
        })
        await newWallet.save();
      }
       return res.status(200).json({success: true});
    }
    
  } catch (error) {
    res.status(500).json({success: false, message: 'Internal Server Error'});
  }
}

const rejectReturn = async (req, res) => {
  try {
    const returnId = req.query.id;
    const returnReq = await ordReturn.findOne({_id: returnId, status: 'Pending'});
    if(!returnReq) {
      return res.status(404).json({success: false, message: 'Return request not found'});
    }
    const order = await Order.findOne({_id: returnReq.orderId});
    if(!order) {
      return res.status(404).json({success: false, message: 'Order not found'});
    }
    let allItem;
    if(!returnReq.isAllItem) {
      for(let val of returnReq.items) {
        await Order.updateOne({_id: returnReq.orderId, 'items._id':val.itemId}, {$set: {'items.$.isRejected': true}});
      }
      let count = 0;
      order.items.forEach(item => {
        if(item.isRejected === true) {
          count++;
        }
      })
      allItem = count + returnReq.items.length === order.items.length ? true : false;
    }
    
    if(allItem) {
      await ordReturn.updateOne({_id:returnId, status: 'Pending'}, {$set: {isAllItem: true, status: 'Rejected'}});
      return res.status(200).json({success: true});
    } else {
      await ordReturn.updateOne({_id:returnId, status: 'Pending'}, {$set: {status: 'Rejected'}});
      return res.status(200).json({success: true});
    }
  } catch (error) {
    res.status(500).json({success: false, message: 'Internal Server Error'});
  }
}

module.exports = {
  getOrder,
  getOrderDetails,
  changeOrderStatus,
  acceptReturnReq,
  rejectReturn
}