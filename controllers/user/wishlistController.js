const Product = require('../../models/productSchema');
const Wishlist = require('../../models/wishlistSchema');
const Offer = require('../../models/offerSchema');
const {allProductOffer} = require('../user/userController');
const { findOne } = require('../../models/cartSchema');
const Category = require('../../models/categorySchema');

const getWishlist = async (req, res) => {
  try {
    const userId = req.session.user;
    if(!userId) {
      return res.redirect('/login');
    }
    const wishlist = await Wishlist.findOne({userId});
    const offer = await Offer.find()
    const products = await Product.find({isBlocked: false})
    .sort({createdAt: -1});
    let newItem;
    if(wishlist && Array.isArray(wishlist.items) && wishlist.items.length > 0) {
    newItem = wishlist.items.map((item) => {
      const itemProduct = products.find((productItem) => productItem._id.equals(item.productId));
      const variant = itemProduct.variant.find((variant) => variant.color === item.color);
      if (variant[item.size] === 0) {
        item.available = false;
      } else {
        item.available = true;
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
      return item;
    });
  }
  let updateWishlist;
  if(newItem) {
     updateWishlist = await Wishlist.findOneAndUpdate({userId}, {$set: {items: newItem }}, {new: true}).populate('items.productId').exec();
  } else {
     updateWishlist = wishlist;
  }
    const product = products.slice(0, 8);
    if(wishlist && Array.isArray(wishlist.items) && wishlist.items.length > 0) {
         res.render('wishlist', {wishlist: updateWishlist.items, product});
    } else {
      res.render('wishlist', {wishlist, product});
    }
  } catch (error) {
    console.error('Get Wishlish Error', error);
    res.redirect('/pageNotFound');
  }
}
const addtoWishlist = async (req, res) => {
  try {
    const userId = req.session.user;
    if(!userId) {
      return res.status(401).json({success: false, redirectUrl: '/login'});
    }
    const productId = req.query.id;
    const {color, size} = req.body;
    const product = await Product.findOne({_id:productId, isBlocked:false})
    .populate('offerApplied');
    if(!product) {
      return res.status(404).json({success: false, message: 'Product is not available'});
    }
    const category = await Category.findOne({_id:product.category, isListed:true}).populate('offerApplied').exec();
  
    const productItem = product.variant.find(item => item.color === color);
    let available = true;
    let price;
    if(productItem[size]<1) {
      available = false;       
    }
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
    const items = {
      productId,
      price,
      color: color,
      size: size,
      image: productItem.image[0],
      available
    }
    const existItem = await Wishlist.findOne({userId, items: {$elemMatch: {productId,color, size}}});
    if(existItem) {
      return res.status(409).json({success: false, message: 'Product Already in Wishlist'});
    }
    const existsWishlist = await Wishlist.findOne({userId});
    if(existsWishlist) {
      const newItem = await Wishlist.findOneAndUpdate({userId}, {$push: {items}}, {new:true});
      if(newItem) {
        return res.status(200).json({success:true, itemQty:newItem.items.length});
      }
    }
    const newItem = new Wishlist({
      userId,
      items
    });
    await newItem.save();
    return res.status(200).json({success: true, itemQty:newItem.items.length});
  } catch (error) {
    console.error('Add to Wishlish Error', error);
    res.status(500).json({success: false, message:'Internal server error'});
  }
}
const removeItem = async (req, res) => {
  try {
    const userId = req.session.user;
    if(!userId) {
      return res.status(401).json({success: false, redirectUrl: '/login'});
    }
    const itemId = req.query.id;
    if(!itemId) {
      return res.status(400).json({success: false, message: 'Invalid credential'});
    }
    const deleteItem = await Wishlist.findOneAndUpdate({userId, 'items._id': itemId}, {$pull: {'items': {_id: itemId}}}, {new:true});
    if(deleteItem) {
      return res.status(200).json({success: true, itemQty: deleteItem.items.length});
    } else {
      return res.status(500).json({success: false, message: 'Failed to remove item'});
    }
  } catch (error) {
    console.error('Remove wishlist item error', error);
    res.status(500).json({success: false, message:'Internal server error'});
  }
}


module.exports = {
  getWishlist,
  addtoWishlist,
  removeItem,
}