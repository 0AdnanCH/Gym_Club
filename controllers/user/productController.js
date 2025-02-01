const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const User = require('../../models/userSchema');
const Offer = require('../../models/offerSchema');
const {allProductOffer} = require('../user/userController');

const productDetails = async (req, res) => {
  try {
    const userId = req.session.user;
    const productId = req.query.id;
    const product = await Product.findById(productId)
    .populate('category')
    .populate('offerApplied')
    .exec();
    if(!product) {
      return res.redirect('/pageNotFound');
    }
    const category = await Category.findOne({_id:product.category, isListed:true}).populate('offerApplied').exec();
    if(!category) {
      return res.redirect('/pageNotFound');
    }
    product.offerApplied = await allProductOffer(product.offerApplied, category.offerApplied, product.salePrice);
    res.render('product-details', {
      product,
      category
    })
  } catch (error) {
    res.redirect('/pageNotFound');
  }
}
const stockAvailable = async (req, res) => {
  try {
    const productId = req.query.id;
    const {size, color} = req.body;
    if(!productId, !size, !color) {
      return res.status(400).json({success: false, message: 'Invalid credential'});
    }
    const product = await Product.findOne({_id:productId, isBlocked:false});
    if(!product) {
      return res.status(404).json({success: false, message: 'Product is not available'});
    }
    const variant = product.variant.find((variant) => variant.color === color);
    if(variant[size]>0) {
      return res.json({success: true, stock:true});
    } else {
      return res.json({success: true, stock:false});
    }
  } catch (error) {
    console.error('Product Stock Available Error', error);
    res.status(500).json({success: false, message: 'Internal server error'});
  }
}

module.exports = {
  productDetails,
  stockAvailable
}