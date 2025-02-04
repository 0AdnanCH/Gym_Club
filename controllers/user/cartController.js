const Cart = require('../../models/cartSchema');
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Address = require('../../models/addressSchema');
const Coupon = require('../../models/couponSchema');
const Offer = require('../../models/offerSchema');
const Category = require('../../models/categorySchema');
const {allProductOffer} = require('../user/userController');
const env = require('dotenv').config();


const getCart = async(req, res) => {
  try {
    const userId = req.session.user;
    if(!userId) {
      return res.redirect('/login');
    }
    const cart = await Cart.findOne({userId});
    let oldAmount = 0;
    const offer = await Offer.find()
    const products = await Product.find({isBlocked: false})
    .sort({createdAt: -1})
    .populate('offerApplied')
    .exec();
    let newItems;
    let subtotal
    let totalAmount;
    if(cart && Array.isArray(cart.items) && cart.items.length > 0) {
      newItems = cart.items.filter((item) => {
        const itemProduct = products.find((productItem) => productItem._id.equals(item.productId));
        if(!itemProduct) return false;
        const variant = itemProduct.variant.find((variant) => variant.color === item.color);
        if (variant[item.size] === 0 || variant[item.size] < item.quantity) {
          item.quantity = null;
          oldAmount += item.totalPrice;
        }
        if(itemProduct.offerApplied) {
          const productOffer = offer.find(off => off._id.equals(itemProduct.offerApplied));
          if(productOffer) {
            if(productOffer.offerStatus === 'inactive' || productOffer.offerStatus === 'expired') {
              item.price = itemProduct.salePrice;
              item.totalPrice = itemProduct.salePrice * item.quantity;
            }
          }
        } 
        return item.quantity !== null;
      });
      subtotal = cart.subtotal - oldAmount;
      totalAmount = cart.totalAmount - oldAmount;
    }
    let updatedCart;
    if(newItems) {
      updatedCart = await Cart.findOneAndUpdate({userId}, {$set: {items: newItems , subtotal, totalAmount}}, {new: true})
      .populate({
        path: 'items.productId',
        select: 'productName'
      })
      .exec();
    } else {
      updatedCart = cart;
    }
    const product = products.splice(0, 5);
    const category = await Category.find({isListed:true})
    .populate('offerApplied')
    .exec();
    for (const item of product) {
      const cate = category.find(cat => cat._id.equals(item.category));
      if(item.offerApplied || cate.offerApplied) { 
        item.offerApplied = await allProductOffer(item.offerApplied, cate.offerApplied, item.salePrice);
      }
    }
    if(cart && Array.isArray(updatedCart.items) && updatedCart.items.length > 0) {
      res.render('cart', {cart: updatedCart, product});
    } else {
      res.render('cart', {cart: null, product});
    }
  } catch (error) {
    console.error('Get Cart Error' ,error);
    res.redirect('/pageNotFound');
  }
}

const addToCart = async(req, res) => {
  try {
    const productId = req.query.id;
    const {color, size} = req.body;
    let quantity = req.body.quantity || 1;
    quantity = Number(quantity);
    const userId = req.session.user;
   
    if(userId) {
      const product = await Product.findOne({_id:productId, isBlocked:false})
      .populate('offerApplied', 'discountVal discountType maxDiscount')
      .exec();
      if(!product) {
        return res.status(404).json({success: false, message: 'Product is not available'});
      }
      const category = await Category.findOne({_id:product.category,isListed:true}).populate('offerApplied').exec();
      let outOfStock = false;
      let lessQuantity = false;
      let noOfquantity = 0;
      product.variant.forEach((variant) => {
        if(variant.color === color) {
          noOfquantity = variant[size];
          if(variant[size] < 1) {
            outOfStock = true;
          } else if(noOfquantity<quantity){
            lessQuantity = true;
          }
        } 
      })
      if(outOfStock) {
        return res.status(400).json({success: false, message: `Out of stock`});
      } else if (lessQuantity) {
        return res.status(400).json({success: false, message: `Only ${noOfquantity} items left in stock`});
      } 
      const variant = product.variant.find(item => item.color === color);
      const image = variant?.image[0];
        let price;     

          // const cate = category.find(cat => cat._id.equals(product.category));
          if(product.offerApplied || category.offerApplied) {
            product.offerApplied = await allProductOffer(product.offerApplied, category.offerApplied, product.salePrice);
          }
      
        if(product.offerApplied) {
          if(product.offerApplied.discountType === 'percentage') {
            let disValue = product.offerApplied.discountVal;
            let disPrice = product.salePrice * (disValue/100);
            let finaldisPrice = Math.min(disPrice, product.offerApplied.maxDiscount);
            price = product.salePrice - finaldisPrice;
            if(price<=0) {
              price = product.salePrice;
            }
          } else {
            let disPrice = product.offerApplied.discountVal;
            price = product.salePrice - disPrice;
            if(price<=0) {
              price = product.salePrice;
            }
          }
        } else {
          price = product.salePrice;
        }

        const totalPrice = price * quantity;
        let cart = await Cart.findOne({userId});
        if(cart) {
          const existingItem = cart.items.find((item) => {
            return (
              item.productId.equals(productId) &&
              item.color === color &&
              item.size === size
            );
          }); 
          if(existingItem) {
            existingItem.quantity += quantity;
            if(existingItem.quantity>noOfquantity) {
              return res.status(400).json({success: false, message: `Only ${noOfquantity} items left in stock`})
            } else if(existingItem.quantity>10) {
              return res.status(400).json({success: false, message: 'Only 10 items can add to Cart'})
            } 
            existingItem.totalPrice = existingItem.price * existingItem.quantity;
          } else {
            cart.items.push({productId, image, price,color, size, quantity, totalPrice});
          }
          cart.subtotal = cart.items.reduce((acc, item) => acc+=item.totalPrice, 0);
          cart.totalAmount = cart.subtotal
        } else {
          cart = new Cart({
            userId,
            items:[{productId,image, price, color, size, quantity, totalPrice}],
            subtotal: totalPrice,
            totalAmount: totalPrice
          })
        }

        await cart.save();
        res.status(200).json({success: true , itemQty:cart.items.length});

    } else {
      res.status(401).json({success: false, redirectUrl:'/login'});
    }
  } catch (error) {
    console.error('Cart Add Item Error' ,error);
    res.status(500).json({success: false, message: 'Internal server error'});
  }
}


const updateQuanity = async (req, res) => {
  try {
    const userId = req.session.user;
    if(userId) {
      const itemId = req.query.id;
      const quantity = Number(req.body.quantity);
      const cart = await Cart.findOne({userId, 'items._id': itemId});
      if(!cart) {
        return res.status(404).json({success: false, message: 'cart not found'});
      }
      const item = cart.items.find((item) => item._id.toString() === itemId);
      const productId = item.productId;
      const color = item.color;
      const size = item.size;
      const existsQty = item.quantity;
      const product = await Product.findOne({_id:productId, isBlocked:false});
      let outOfStock = false;
      let lessQuantity = false;
      let noOfquantity = 0;
      product.variant.forEach((variant) => {
        if(variant.color === color) {
          if(variant[size] < 1) {
            outOfStock = true;
          } else if(variant[size]<quantity){
            lessQuantity = true;
            noOfquantity = variant[size];
          }
        } 
      })
      if(outOfStock) {
        return res.status(400).json({success: false, message: `Out of stock`});
      } else if (lessQuantity) {
        return res.status(400).json({success: false, message: `Only ${noOfquantity} items left in stock.`, existsQty});
      } 
      const oldTotalprice = item.price * existsQty;
      const totalPrice = item.price * quantity;
      const subtotal = (cart.subtotal - oldTotalprice) + totalPrice;
      const totalAmount = subtotal;
      
      const updateCart = await Cart.findOneAndUpdate({userId, 'items._id': itemId}, {$set: {'items.$.quantity': quantity, 'items.$.totalPrice': totalPrice, subtotal, totalAmount}}, {new:true});
      if(updateCart) {
      return res.status(200).json({success: true, totalPrice, subtotal,totalAmount});
      } else {
        return res.status(500).json({success: false, message: 'cannot update quantity'});
      }
    } else {
      res.status(401).json({ success: false, redirectUrl:'/login'});
    }
 
  } catch (error) {
    console.error('Cart Quantity Update Error' ,error);
    res.status(500).json({success: false, message: 'Internal server error'});
  }
}

const removeCartItem = async (req, res) => {
  try {
    const userId = req.session.user;
    if(userId) {
      const itemId = req.query.id;
      const cart = await Cart.findOne({userId, 'items._id': itemId});
      if(!cart) {
        return res.status(404).json({success: false, message: 'cart not found'});
      }
      const item = cart.items.find((item) => item._id.equals(itemId));
      const subtotal = cart.subtotal - item.totalPrice;
      const totalAmount = cart.totalAmount - item.totalPrice;
      const deleteItem = await Cart.findOneAndUpdate({userId, 'items._id': itemId}, {$pull: {'items': {_id: itemId}}, $set: {subtotal, totalAmount}}, {new:true});
      if(deleteItem) {
        return res.status(200).json({success: true, subtotal, totalAmount, cartQty:deleteItem.items.length});
        } else {
          return res.status(500).json({success: false, message: 'Failed to remove item'});
        }
    } else {
      res.status(401).json({ success: false, redirectUrl:'/login'});
    }

  } catch (error) {
    console.error('Cart Remove Item Error' ,error);
    res.status(500).json({success: false, redirectUrl: 'Internal server error'});
  }
}


module.exports = {
  getCart,
  addToCart,
  updateQuanity,
  removeCartItem
}