const User = require('../models/userSchema');
const Cart = require('../models/cartSchema');
const Wishlist = require('../models/wishlistSchema');

const cartWishlistQty = async (req, res, next) => {
  try {
    const userId = req.session.user;
    if(userId) {
      const cart = await Cart.findOne({userId});
      const wishlist = await Wishlist.findOne({userId});
      if(cart) {
        res.locals.cartQty = cart.items.length;
      }
      if(wishlist) {
        res.locals.wishlistQty = wishlist.items.length;
      }
      next();
    } else {
      next();
    }
  } catch (error) {
    res.status(500).json('Internal Server error');
  }
}

module.exports = cartWishlistQty;