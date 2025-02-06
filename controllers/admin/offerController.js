const ObjectId = require('mongoose').Types.ObjectId;
const Offer = require('../../models/offerSchema');
const User = require('../../models/userSchema');
const Category = require('../../models/categorySchema');
const Product = require('../../models/productSchema');

const getAddOffer = async (req, res) => {
  try {
    const categories = await Category.find({isListed: true}, {name:1});
    const products = await Product.find({isBlocked: false, category:{$in:categories.map(category => category._id)}}, {productName:1});
    res.render('offer-add', {categories, products, heading: 'Offers Add'});
  } catch (error) {
    res.redirect('/admin/pageError');
  }
}

const getOffer = async (req, res) => {
  try {
    const page = req.query.page || 1;
    const limit = 4;
    const offers = await Offer.find()
    .sort({createdAt: -1})
    .populate("appliedProducts", "productName")
    .populate("appliedCategories", "name")
    .limit(limit*1)
    .skip((page-1)*limit)
    .exec();
    const count = await Offer.find().countDocuments();

    res.render('offer-list', {
      offers,
      currentPage:page,
      totalPages: Math.ceil(count/limit),
      heading: 'Offers'
    });
  } catch (error) {
    res.redirect('/admin/pageError');
  }
}

const createOffer = async (req, res) => {
  try {
    const {name, description, 
      offerType, offerStatus, 
      discountType, discountVal, 
      maxDiscount, startDate, 
      endDate,offerApplied} = req.body;
    const existOffer = await Offer.findOne({name: new RegExp(`^${name}$`, 'i')});
    if(existOffer) {
      return res.status(409).json({success: false, message: 'Offer aldready exists.'});
    }
    // if type product
    if(offerType === 'product') {
      const appliedProducts = offerApplied.map((id) => new ObjectId(id));
      const offer = new Offer({
        name,
        description,
        offerType, 
        offerStatus,
        appliedProducts,
        appliedCategories: null,
        discountType, 
        discountVal,
        maxDiscount, 
        startDate,
        endDate
      })
      const offSave = await offer.save();
      if(offSave) {
        await Product.updateMany({_id: {$in:appliedProducts}, isBlocked: false}, {$set:{offerApplied:offSave._id}});
        return res.status(200).json({success: true});
      } else {
        return res.status(500).json({success: false, message: 'Failed to create offer. please try again!'});
      }
    } else if(offerType === 'category') {  // if type category
      const appliedCategories = offerApplied.map((id) => new ObjectId(id));
      const offer = new Offer({
        name,
        description,
        offerType, 
        offerStatus,
        appliedCategories,
        appliedProducts: null,
        discountType, 
        discountVal,
        maxDiscount, 
        startDate,
        endDate
      })
      const offSave = await offer.save();
      if(offSave) {
        await Category.updateMany({_id: {$in:appliedCategories}, isListed:true}, {$set:{offerApplied:offSave._id}});
        return res.status(200).json({success: true});
      } else {
        return res.status(500).json({success: false, message: 'Failed to create offer. please try again!'});
      }
    } 
  } catch (error) {
    res.status(500).json({success: false, message: 'Internal Server Error'});
  }
}

const changeStatus = async (req, res) => {
  try {
    const offerId = req.query.id;
    const value = req.query.value;
    if(!offerId || !value) {
      return res.status(404).json({success: false, message: 'Credentials not found'});
    }
    if(value === 'active') {
      const offer = await Offer.findOne({_id: offerId});
      if(offer.startDate > new Date()) {
        // unprocessable able entity
        return res.status(422).json({success:false, message: 'This offer cannot be activated, start date is not valid.'})
      }
    }
    const changeStatus = await Offer.findOneAndUpdate({_id:offerId}, {$set: {offerStatus:value}}, {new: true});
    if(changeStatus) {
      return res.status(200).json({success:true, value});
    } else {
      return res.status(404).json({success: false, message: 'offer not Found.'});
    }
  } catch (error) {
    return res.status(500).json({success: false, message: 'Internal Server Error'});
  }
}

module.exports = {
  getAddOffer,
  createOffer,
  getOffer,
  changeStatus
}