const Coupon = require('../../models/couponSchema');
const Category = require('../../models/categorySchema');
const Product = require('../../models/productSchema');

const getAddCoupon = async (req, res) => {
  try {
    res.render('coupon-add', {heading: 'Coupons Add'});
  } catch (error) {
    res.redirect('/admin/pageError');
  }
}
const addCoupon = async(req, res) => {
  try {
    const couponInfo = req.body;
    const isExists = await Coupon.findOne({code: couponInfo.code});
    if(isExists) {
      return res.status(409).json({success: false, message: 'Coupon code already exists.'});
    } 
    const coupon = new Coupon(couponInfo);
    const saveCoupon = await coupon.save();
    if(saveCoupon) {
      return res.status(200).json({success: true});
    } else {
      return res.status(500).json({success: false, message: 'Failed to create coupon'});
    }
  } catch (error) {
    return res.status(500).json({success: false, message: 'Internal server error'});
  }
}
const getCoupon = async (req, res) => {
  try {
    const page = req.query.page || 1;
    const limit = 4;
    const coupon = await Coupon.find().sort({createdAt: -1}).limit(limit*1).skip((page-1)*limit);
    const count = await Coupon.find().countDocuments();

    res.render('coupon-list', {
      coupon,
      currentPage:page,
      totalPages: Math.ceil(count/limit),
      heading: 'Coupons'
    });
  } catch (error) {
    res.redirect('/admin/pageError');
  }
}

const changeStatus = async (req, res) => {
  try {
    const couponId = req.query.id;
    const value = req.query.value;
    if(!couponId || !value) {
      return res.status(404).json({success: false, message: 'Credentials not found'});
    }
    if(value === 'active') {
      const coupon = await Coupon.findOne({_id:couponId});
      if(coupon.startDate > new Date()) {
        // unprocessable able entity
        return res.status(422).json({success: false, message: 'This offer cannot be activated, start date is not valid.'});
      }
    }
    const changeStatus = await Coupon.findOneAndUpdate({_id:couponId}, {$set: {couponStatus:value}}, {new: true});
    if(changeStatus) {
      return res.status(200).json({success:true, value});
    } else {
      return res.status(404).json({success: false, message: 'Coupon not Found.'});
    }
  } catch (error) {
    return res.status(500).json({success: false, message: 'Internal Server Error'});
  }
}

module.exports = {
  getAddCoupon,
  getCoupon,
  addCoupon,
  changeStatus
}