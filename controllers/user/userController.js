const session = require('express-session');
const User = require('../../models/userSchema');
const Category = require('../../models/categorySchema');
const Product = require('../../models/productSchema');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');
const Offer = require('../../models/offerSchema');
const ObjectId = require('mongoose').Types.ObjectId;
const env = require('dotenv').config();
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const { name } = require('ejs');

const pageNotFound = async (req, res) => {
    res.render('page-404');
}


const loadHomepage = async (req, res) => {
  try {
    if(req.session.passport) {
      req.session.user = req.session.passport.user;      
    }
    const user = req.session.user; 
    const category = await Category.find({isListed:true})
    .populate('offerApplied')
    .exec();
    let product = await Product.find({
      isBlocked:false,
      category:{$in:category.map(category => category._id)}
    })
    .sort({createdAt: -1})
    .limit(5)
    .populate('offerApplied')
    .exec();
    for (const item of product) {
      const cate = category.find(cat => cat._id.equals(item.category));
      if(item.offerApplied || cate.offerApplied) { 
        item.offerApplied = await allProductOffer(item.offerApplied, cate.offerApplied, item.salePrice);
      }
    }
    res.render('home', {product});
    
  } catch (error) {
    console.log('Failed to load home page', error);
    res.redirect('/errorPage');
  }
}

const loadSignup = async (req, res) => {
  try {
    if(req.session.user) {
      return res.redirect('/')
    }
    return res.render('signup');
  } catch (error) {
    console.log('Signup page not loading', error);
    res.redirect('/errorPage');
  }
}

function generateOtp() {
  return Math.floor(100000 + Math.random()*900000).toString();
}

async function sendVerificationEmail(email, otp) {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: process.env.NODEMAILER_EMAIL,
        pass: process.env.NODEMAILER_PASSWORD
      }
    });

    const info = await transporter.sendMail({
      from: process.env.NODEMAILER_EMAIL,
      to: email,
      subject: 'Verify your account',
      text: `Your OTP is ${otp}`,
      html: `<b>Your OTP: ${otp}</b>`
    });

    return info.accepted.length > 0

  } catch (error) {
    console.error('Error sending on email', error);
    return false;
  }
}

const signup = async (req, res) => {
  try {
    const {name, email, password, cpassword} = req.body;
    if(password !== cpassword) {
      return res.status(400).json({success: false ,message: 'Password do not match'});
    }
    const findUser = await User.findOne({email});
    if(findUser) {
      return res.status(409).json({success: false, message: 'User with this email already exists.'});
    }
    const otp = generateOtp();
    const emailSent = await sendVerificationEmail(email, otp);
    if(!emailSent) {
      return res.status(400).json({success:false, message:'email error'});
    }

    req.session.userOtp = otp;
    req.session.userData = {name, email, password};

    res.status(200).json({success: true});
    console.log('OTP Send', otp);

  } catch (error) {
    console.error('Signup Error', error);
    res.redirect('/pageNotFound');
  }
}
const loadOtpPage = async (req, res) => {
  try {
    if(req.session.userOtp && req.session.userData) {
      return res.render('otp');
    } else {
      res.redirect('/pageNotFount');
    }
  } catch (error) {
    console.error('otp load error', error);
    res.redirect('/pageNOtFound');
  }
}

const securePassword = async (password) => {
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    return passwordHash;
  } catch (error) {
    return false
  }
}

const verifyOtp = async (req, res) => {
  try {
    const {otp} = req.body;
    console.log(otp);
    if(otp === req.session.userOtp) {
      const user = req.session.userData;
      const passwordHash = await securePassword(user.password);
      if(!passwordHash) {
        return res.status(500).json({success: false, message: 'Failed to sign, Please try again'});
      }
      const saveUserData = new User({
        name: user.name,
        email: user.email,
        password: passwordHash
      });

      await saveUserData.save();
      req.session.user = saveUserData._id;
      res.status(200).json({success: true});
    } else {
      res.status(400).json({success: false, message: 'Invalid OTP, Please try again'});
    }
  } catch (error) {
    console.error('Error Verifying OTP', error);
    res.status(500).json({success: false, message: 'Internal server error'});
  }
}

const resendOtp = async (req, res) => {
  try {
    const {email} = req.session.userData;
    if(!email) {
      return res.status(400).json({success: false, message: 'Email not found in session', redirectUrl: '/signup'});
    }
    const otp = generateOtp();
    req.session.userOtp = otp;
    const emailSent = await sendVerificationEmail(email, otp);
    if(emailSent) {
      console.log('Resend OTP:', otp);
      res.status(200).json({success: true, message: 'OTP Resend Successfully'})
    } else {
      res.status(500).json({success: false, message: 'Failed to resend OTP. Please try again'});
    }
  } catch (error) {
    console.error('Error resending OTP', error)
    res.status(500).json({success: false, message: 'Internal Server Error. Please try again'});
  }
}

const loadLogin = async (req, res) => {
  try {
    if(!req.session.user) {
      if(req.query.message === 'User is blocked') {
        const message = req.query.message
        return res.render('login', {message})
      }
      req.session.resetpass = null;
      return res.render('login')
    } else {
      res.redirect('/')
    }
  } catch (error) {
    res.redirect('/pageNotFound')
  }
}

const login = async (req, res) => {
  try {
    const {email, password} = req.body;
    const findUser = await User.findOne({isAdmin:0, email});
    if(!findUser) {
      return res.status(404).json({success: false, message: 'User not found'});
    }
    if(findUser.isBlocked) {
      return res.status(403).json({success: false, message: 'User is blocked by admin'});
    }
    const passwordMatch = await bcrypt.compare(password, findUser.password);
    if(!passwordMatch) {
      return res.status(401).json({success: false, message: 'Incorrect Password'});
    }
    req.session.user = findUser._id;
    req.session.email = email;
    res.status(200).json({success: true});
  } catch (error) {
    console.error('Login Error', error);
    res.status(500).json({success: false, message: 'login failed. Please try again later'});
  }
}

const logout = async (req, res) => {
  try {
    req.session.destroy((err) => {
      if(err) {
        console.log('Session destructioin error', err.message);
        return res.status(500).json({success: false, message: 'Failed to logout'});
      }
      return res.status(200).json({success: true});
    })
  } catch (error) {
    console.log('Logout Error', error);
    res.status(500).json({success: false, message: 'Internal server error'});
  }
}

const loadShoppingPage = async (req, res) => {
  try {
    const sort = req.query.sort || 'new';
    const search = req.query.search || '';
    const page = parseInt(req.query.page) || 1;
    const categories  = req.query.categories; 
    let sortby = {}
    if(sort === 'price_dec') {
      sortby = {salePrice:-1, createdAt: -1}
    }else if(sort === 'price_inc') {
      sortby = {salePrice:1, createdAt: -1}
    }else if(sort === 'name_asce') {
      sortby = {productName:1, createdAt: -1}
    } else if(sort === 'name_desc') {
      sortby = {productName:-1, createdAt: -1}
    } else if(sort === 'new') {
      sortby = {createdAt:-1}
    }
    const category = await Category.find({isListed:true}).populate('offerApplied').exec();
    const categoriesIds = category.map(category => category._id);
    let categoryIds = categories ? categories.split(',') : categoriesIds;
    categoryIds = categoryIds.map(val => new ObjectId(val))
    const limit = 16;
    const skip = (page-1)*limit;
    const offer = await Offer.find({offerStatus: {$nin: ['inactive', 'expired']} })
    let product;
    if(sort === 'popularity') {
      product = await Product.aggregate([
        { $match: { isBlocked: false, productName: {$regex: search, $options: 'i'}, category:{$in:categoryIds}}},
        { $lookup: { from: 'orders', localField: '_id', foreignField: 'items.productId', as: 'orderDetails' } },
        { $lookup: { from: 'offers', localField: 'offerApplied', foreignField: '_id', as: 'offerDetails'}},
        { $addFields: { salesCount: { $size: '$orderDetails' } } },
        { $sort: { salesCount: -1, createdAt:-1 } },
        { $skip:skip },
        { $limit: limit }
      ]); 
    
      for (const item of product) {
        const cate = category.find(cat => cat._id.equals(item.category));
        if(item.offerDetails && item.offerDetails.length > 0 || cate.offerApplied) { 
          item.offerDetails[0] = await allProductOffer(item.offerDetails[0], cate.offerApplied, item.salePrice);
        }
      }
    } else {
      product = await Product.find({
        productName: {$regex: search, $options: 'i'},
        isBlocked:false,
        category:{$in:categoryIds}
      })
      .sort(sortby)
      .collation({ locale: 'en', strength: 2 })
      .skip(skip)
      .limit(limit)
      .populate('offerApplied')
      .exec();

      for (const item of product) {
        const cate = category.find(cat => cat._id.equals(item.category));
        if(item.offerApplied || cate.offerApplied) { 
          item.offerApplied = await allProductOffer(item.offerApplied, cate.offerApplied, item.salePrice);
        }
      }
    }
    const totalProducts = await Product.find({
      productName: {$regex: search, $options: 'i'},
      isBlocked:false,
      category:{$in:categoryIds}
    }).countDocuments();
    const totalPages = Math.ceil(totalProducts/limit);
    const categoryInfo = category.map(category => ({_id:category._id,name:category.name}));
    res.render('shop', {
      product,
      category:categoryInfo,
      totalPages,
      currentPage:page,
      sort,
      search,
      categories
    })
  } catch (error) {
    console.log('Load Shopping Page Error', error);
    res.redirect('/pageNotFound');
  }
}



const profileInformation = async (req, res) => {
  try {
    if(!req.session.user) {
      res.redirect('/login');
    } else {
      const userId = req.session.user
      const passport = req.session.passport
      const userData = await User.findOne({_id:userId, isBlocked:false});
      res.render('profile-information', {userData, passport});
    }
  } catch (error) {
    res.redirect('/pageNotFound');
  }
}
const getOrders = async (req, res) => {
  try {
    const userId = req.session.user;
    const page = parseInt(req.query.page) || 1;
    if(!userId) {
     return res.redirect('/login');
    }
    const limit = 10;
    const skip = (page-1)*limit;
    const orders = await Order.find({userId}).sort({createdAt: -1}).skip(skip).limit(limit);
    const totalOrders = await Order.find({userId}).countDocuments();
    const totalPages = Math.ceil(totalOrders/limit);
    res.render('order-dashboard', {orders, currentPage: page, totalPages});
  } catch (error) {
    res.redirect('/pageNotFound');
  }
}
const getAddress = async (req, res) => {
  try {
    if(req.session.user) {
      const userId = req.session.user
      const userAddress = await Address.find({userId , isBlocked: false});
      res.render('user-address', {userId, userAddress});
    } else {
      res.redirect('/login');
    }
  } catch (error) {
    res.redirect('/pageNotFound');
  }
}


const changePassword = async (req, res) => {
  try {
    const userId = req.query.id;
    const{currentPassword, newPassword, confirmPassword } = req.body;
    const user = await User.findOne({_id:userId, isBlocked:false});
    if(!user) {
      return res.status(404).json({"success":false, "message": "User not found"});
    }
    const password = await bcrypt.compare(currentPassword, user.password);
    if(!password) {
      return res.status(401).json({"success":false, "message": "Incorrect Password"});
    }
    if(newPassword !== confirmPassword) {
      return res.status(401).json({"success":false, "message": "Password do not match"});
    }
    const hashpassword = await securePassword(newPassword);
    const updatePass = await User.findByIdAndUpdate(userId, {
      password:hashpassword
    }, {new: true})
    if(updatePass) {
      return res.status(200).json({"success":true});
    } else {
      return res.status(500).json({"success":false, "message": "Something went wrong! Please Try again"});
    }
  } catch (error) {
    console.error('Change Password Error', error);
    res.status(500).json({message: 'Internal server error'});
  }
}
const getForgotPassword = async (req, res) => {
  try {
    if(req.session.user) {
      res.render('forgot-pass', {user: true});
    } else {
      res.render('forgot-pass', {user: false});
    }
  } catch (error) {
    res.redirect('/pageNotFound');
  }
}
const forgotPassword = async (req, res) => {
  try {
    const {email} = req.body;
    const userData = await User.findOne({email});
    if(!userData) {
      return res.status(404).json({success: false, message: 'User not found'});
    } else if(userData.isBlocked) {
      return res.status(403).json({success: false, message: 'User is blocked'});
    } else {
      const otp = generateOtp();
      const emailSent = await sendVerificationEmail(email, otp);
      if(!emailSent) {
        return res.json('email error');
      }
      req.session.passwordOtp = otp;
      req.session.userEmail = email;
  
      res.status(200).json({success: true});
      console.log('OTP Send', otp);
    }
  } catch (error) {
    res.status(500).json({message: 'Internal server error'});
  }
}
const passwordOtpVerify = async (req, res) => {
  try {
    const otp = req.body.otpInput;
    console.log(otp)
    if(otp === req.session.passwordOtp) {
      req.session.resetpass = true;
      res.status(200).json({success: true, redirectUrl:'/resetPassword'});
    } else {
      res.status(401).json({success: false, message: 'Invalid OTP, Please try again'})
    }
  } catch (error) {
    res.status(500).json({message: 'Internal server error'});
  }
} 
const getResetPassword = async (req, res) => {
  try {
    if(req.session.resetpass) {
       res.render('reset-password')
    } else {
      res.redirect('/forgotPassword');
    }
  } catch (error) {
    res.redirect('pageNotFound');
  }
}
const resetPassword = async (req, res) => {
  try {
    const email = req.session.userEmail;
    const {password, repassword} = req.body;
    const user = await User.findOne({email});
    if(!user) {
      return res.status(404).json({success: false, message: 'User not found'});
    } else if(user.isBlocked) {
      return res.status(401).json({success: false, message: 'User is blocked'});
    } else if(password !== repassword) {
      return res.status(401).json({success: false, message: 'Password do not match'});
    } else {
      const passwordHash = await securePassword(password);
      const updatePass = await User.findOneAndUpdate({email}, {password:passwordHash}, {new:true});
      if(updatePass) {
        req.session.user = updatePass._id;
        req.session.userEmail = null;
        req.session.resetpass = null;
        return res.status(200).json({success:true, redirectUrl:'/'});
      } else {
        return res.status(500).json({success: false, message: 'Failed to change password, Please try again.'})
      }
    }
  } catch (error) {
    res.status(500).json({message: 'Internal server error'});
  }
}
const editresendOtp = async (req, res) => {
  try {
    const email = req.session.userEmail;
    if(!email) {
      return res.status(400).json({success: false, redirectUrl:'/forgotPassword'});
    }
    const otp = generateOtp();
    if(req.session.passwordOtp) {
      req.session.passwordOtp = otp;
    }
    if(req.session.emailOtp) {
      req.session.emailOtp = otp;
    }
    req.session.passwordOtp = otp;
    const emailSent = await sendVerificationEmail(email, otp);
    if(emailSent) {
      console.log('Resend OTP:', otp);
      res.status(200).json({success: true, message: 'OTP Resend Successfully'})
    } else {
      res.status(500).json({success: false, message: 'Failed to resend OTP. Please try again'});
    }
  } catch (error) {
    console.error('Error resending OTP', error)
    res.status(500).json({success: false, message: 'Internal Server Error. Please try again'});
  }
}

// const editEmailOtp = async (req, res) => {
//   try {
//     const id = req.query.id;
//     const email = req.body.email;
//     console.log(email)

//     const user = await User.findById(id);
//     if(!user) {
//       return res.json({success: false, message: 'User not found'});
//     }
//     if(user.isBlocked) {
//       return res.json({success: false, message: 'User is Blocked'});
//     }
//     const existEmail = await User.findOne({email, _id:{$ne:id}});    
//     if(existEmail) {
//       return res.json({success: false, message: 'User with this email already exists'});
//     }
//     const otp = generateOtp();
//     const emailSent = await sendVerificationEmail(email, otp);
//     if(!emailSent) {
//       return res.json('email error');
//     }
//     req.session.userEmail = user.email;
//     req.session.emailOtp = otp;
//     req.session.updateEmail = email;

//     res.json({success: true});
//     console.log('OTP Send', otp);
    
//   } catch (error) {
    
//   }
// }

// const otpEmailVerify = async (req, res) => {
//   try {
//     const otp = req.body.otpInput;
//     console.log(otp);
//     if(otp === req.session.emailOtp) {
//       const userId = req.session.user;
//       const email = req.session.updateEmail;
//       const updateEmail = await User.findByIdAndUpdate(userId, {email}, {new: true});
//       if(updateEmail) {
//         res.json({success: true, redirectUrl:'/account'});
//       } else {
//         res.status(500).json({success: false, message: 'Failed to change email, Please try again'})
//       }
     
//     } else {
//     res.status(400).json({success: false, message: 'Invalid OTP, Please try again'})
//   }
//   } catch (error) {
    
//   }
// }

const editName = async (req, res) => {
  try {
    const id = req.session.user;
    const name = req.body.name;
    const user = await User.findOne({_id:id});
    if(!user) {
     return res.status(404).json({success: false, message: 'User not found'});
    } else if(user.isBlocked) {
      return res.status(401).json({success: false, message: 'User is blocked'});
    }
    const updateName = await User.findByIdAndUpdate(id, {name}, {new: true});
    if(updateName) {
      return res.status(200).json({success: true});
    } else {
      return res.status(500).json({success: false, message: 'Failed to update Name. Please try again!'});
    }
  } catch (error) {
    res.status(500).json({success: false, message: 'Internal server error'});
  }
}

const addAddress = async (req, res) => {
  try {
    const userId = req.query.id;
    const user = await User.findOne({_id:userId, isBlocked:false});
    if(!user) {
      return res.status(404).json({success: false, message: 'User not found'});
    }
    const {name, pincode, locality, address, place, state, addressType} = req.body;
    const phone = req.body.phoneNo;
    const landmark = req.body.landmark || null;
    const alternatePhone = req.body.phoneNo2 || null;
      const newAddress = new Address({
        userId,
        name,
        phone,
        pincode,
        locality,
        address,
        place,
        state,
        landmark,
        alternatePhone,
        addressType
      });
       const addressSave = await newAddress.save();
      if(addressSave) {
        return res.status(200).json({success: true});
      } else {
        return res.status(500).json({success: false, message: 'Cannot add address, Please try again!'});
      }
  
  } catch (error) {
    res.status(500).json({success: false, message: 'Internal server error'});
  }
}

const editAddress = async (req, res) => {
  try {
    const addressId = req.query.id;
    const updateAddress = await Address.findOne({_id: addressId, isBlocked: false});
    if(!updateAddress) {
      return res.status(404).json({success: false, message: 'Cannot update, Address is not found'});
    }
    const {name, pincode, locality, address, place, state, addressType} = req.body;
    const phone = req.body.phoneNo;
    const landmark = req.body.landmark || null;
    const alternatePhone = req.body.phoneNo2 || null;
    const updatedAddress = await Address.findByIdAndUpdate(addressId, {
      name,
      phone,
      pincode,
      locality,
      address,
      place,
      state,
      landmark,
      alternatePhone,
      addressType
    }, {new: true});
    if(updatedAddress) {
      return res.status(200).json({success: true});
    } else {
      return res.status(500).json({success: false, message: 'Cannot update address, Please try again!'});
    }
  } catch (error) {
    res.status(500).json({success: false, message: 'Internal server error'});
  }
}
const deleteAddress = async (req, res) => {
  try {
      const addressId = req.query.id;
      const address = await Address.findById(addressId);
      if(address) {
        const dltAddress = await Address.findByIdAndUpdate(addressId, {isBlocked: true}, {new: true});
        if(dltAddress) {
          return res.status(200).json({success: true});
        } else {
          return res.status(500).json({success: false, message: 'Cannot delete address, Please try again!'});
        }
      } else {
        return res.status(404).json({success: false, message: 'address not found'});
      }      
    } catch (error) {
      res.status(500).json({message: 'Internal server error'});    
    }
  }

const allProductOffer = async (productOffer, categoryOffer, price) => {
  try {
    if(productOffer && categoryOffer) {
      if(String(productOffer.startDate) === String(categoryOffer.startDate)) {
        if(String(productOffer.createdAt)>String(categoryOffer.createdAt)) {
          categoryOffer.startDate = 0;
        } else {
          productOffer.startDate = 0;
        }
      }
      if(productOffer.offerStatus !== 'active') {
        productOffer = null;
      } else if(new Date(productOffer.endDate) < new Date() && productOffer.offerStatus !== 'expired') {
        await Offer.updateOne({_id:productOffer._id}, {$set: {offerStatus: 'expired'}});
        productOffer = null;
      } else if(new Date(productOffer.startDate) > new Date(categoryOffer.startDate )) {
        categoryOffer = null;
      } 
      if(categoryOffer) {
        if(categoryOffer.offerStatus !== 'active') {
          categoryOffer = null;
        } else if(new Date(categoryOffer.endDate) < new Date() && categoryOffer.offerStatus !== 'expired') {
          await Offer.updateOne({_id:categoryOffer._id}, {$set: {offerStatus: 'expired'}});
          categoryOffer = null;
        } else if(productOffer) {
          if(new Date(productOffer.startDate) < new Date(categoryOffer.startDate)) {
            productOffer = null;
          }
        } 
      }
    } else if(productOffer) {
      if(productOffer.offerStatus !== 'active') {
        productOffer = null;
      } else if(new Date(productOffer.endDate) < new Date() && productOffer.offerStatus !== 'expired') {
        await Offer.updateOne({_id:productOffer._id}, {$set: {offerStatus: 'expired'}});
        productOffer = null;
      } 
    } else if(categoryOffer) {
      if(categoryOffer.offerStatus !== 'active') {
        categoryOffer = null;
      } else if(new Date(categoryOffer.endDate) < new Date() && categoryOffer.offerStatus !== 'expired') {
        await Offer.updateOne({_id:categoryOffer._id}, {$set: {offerStatus: 'expired'}});
        categoryOffer = null;
      } 
    }
    let offerPrice;
    let offerDetails;
    if(productOffer) {
      if(productOffer.discountType === 'percentage') {
        offerPrice = offerAmount(productOffer.discountVal, productOffer.maxDiscount);
        offerDetails = offerPrice > 0 ? productOffer : null;
      } else {
        offerPrice = price - productOffer.discountVal;
        offerDetails = offerPrice > 0 ? productOffer : null;
      }
    } else if(categoryOffer) {
      if(categoryOffer.discountType === 'percentage') {
        offerPrice = offerAmount(categoryOffer.discountVal, categoryOffer.maxDiscount);
        offerDetails = offerPrice > 0 ? categoryOffer : null;
      } else {
        offerPrice = price - categoryOffer.discountVal;
        offerDetails = offerPrice > 0 ? categoryOffer : null;
      }
    }
    function offerAmount(discountVal, maxDiscount) {
      const disPrice = price * (discountVal/100);
      const finaldisPrice = Math.min(disPrice, maxDiscount);
      return price - finaldisPrice;
    }
    return offerDetails;
  } catch (error) {
    return false;
  }
}

const productOffer = async (productOffer, categoryOffer, price) => {
  try {
      // validating product offer active & product offer and category offer exists

      if(productOffer && categoryOffer) {
        // applied product offer expire date validating
        if(new Date(productOffer.endDate) < new Date() && productOffer.offerStatus !== 'expired') {
          await Offer.updateOne({_id:productOffer._id}, {$set: {offerStatus: 'expired'}});
          productOffer = null;
          // applied product offer status validating 
        } else if(productOffer.offerStatus !== 'active') {
          productOffer = null;
        }
        // applied category offer expire date validating
        if(new Date(categoryOffer.endDate) < new Date() && categoryOffer.offerStatus !== 'expired') {
          await Offer.updateOne({_id:categoryOffer._id}, {$set: {offerStatus: 'expired'}});
          categoryOffer = null;
          // applied category offer status validating
        } else if(categoryOffer.offerStatus !== 'active') {
          categoryOffer = null;
        }
        // only product offer exists
      } else if(productOffer) {
        // applied product offer expire date validating
        if(new Date(productOffer.endDate) < new Date() && productOffer.offerStatus !== 'expired') {
          await Offer.updateOne({_id:productOffer._id}, {$set: {offerStatus: 'expired'}});
          productOffer = null;
          // applied product offer status validating 
        } else if(productOffer.offerStatus !== 'active') {
          productOffer = null;
        }
        // only category offer exists
      } else if(categoryOffer) {
        // applied category offer expire date validating
        if(new Date(categoryOffer.endDate) < new Date() && categoryOffer.offerStatus !== 'expired') {
          await Offer.updateOne({_id:categoryOffer._id}, {$set: {offerStatus: 'expired'}});
          categoryOffer = null;
          // applied category offer status validating
        } else if(categoryOffer.offerStatus !== 'active') {
          categoryOffer = null;
        }
      }
      // variable for storing offer price
      let offerPrice;
      let offerDetails;
       // if product have product offer and category offer
    if(productOffer && categoryOffer) {
      // if category and product same startdate
      if(String(productOffer.startDate) === String(categoryOffer.startDate)) {
        if(String(productOffer.createdAt)>String(categoryOffer.createdAt)) {
          categoryOffer.startDate = 0;
        } else {
          productOffer.startDate = 0;
        }
      }
      // product offer is latest
      if(new Date(productOffer.startDate) > new Date(categoryOffer.startDate )) {
        // discount type is percentage
        if(productOffer.discountType === 'percentage') {
          offerPrice = offerAmount(productOffer.discountVal, productOffer.maxDiscount);
          offerPrice = offerPrice <= 0 ? null : offerPrice;
          // discount type is fixed amount
        } else {
          offerPrice = price - productOffer.discountVal;
          offerPrice = offerPrice <= 0 ? null : offerPrice;
        }
        offerDetails = offerPrice ? productOffer : offerDetails;
        // category offer is latest
      } else {
        // discount type is percentage
        if(categoryOffer.discountType === 'percentage') {
          offerPrice = offerAmount(categoryOffer.discountVal, categoryOffer.maxDiscount);
          offerPrice = offerPrice <= 0 ? null : offerPrice;
          // discount type is fixed amount
        } else {
          offerPrice = price - categoryOffer.discountVal;
          offerPrice = offerPrice <= 0 ? null : offerPrice;
        }
        offerDetails = offerPrice ? categoryOffer : offerDetails;
      }
      // only product offer exists
    } else if(productOffer) {
      // discount percentage type
      if(productOffer.discountType === 'percentage') {
        offerPrice = offerAmount(productOffer.discountVal, productOffer.maxDiscount);
        offerPrice = offerPrice <= 0 ? null : offerPrice;
        // discount fixed amount type
      } else {
        offerPrice = price - productOffer.discountVal;
        offerPrice = offerPrice <= 0 ? null : offerPrice;
      }
      offerDetails = offerPrice ? productOffer : offerDetails;

      // only category offer exists
    } else if(categoryOffer) {
      // discount percentage type
      if(categoryOffer.discountType === 'percentage') {
        offerPrice = offerAmount(categoryOffer.discountVal, categoryOffer.maxDiscount);
        offerPrice = offerPrice <= 0 ? null : offerPrice;
          // discount fixed amount type
      } else {
        offerPrice = price - categoryOffer.discountVal;
        offerPrice = offerPrice <= 0 ? null : offerPrice;
      }
      offerDetails = offerPrice ? categoryOffer : offerDetails;
    }

    // function for calculating offer
    function offerAmount(discountVal, maxDiscount) {
      const disPrice = price * (discountVal/100);
      const finaldisPrice = Math.min(disPrice, maxDiscount);
      return price - finaldisPrice;
    }

    // return offer price and offer details
    if(offerPrice && offerDetails) {
      return {
        offerPrice,
        offerDetails
      }
    } else {
      return false;
    }
  } catch (error) {
    return false;
  }
}

const errorPage = async (req, res) => {
  res.render('error-page');
}



module.exports = {
  pageNotFound,
  loadHomepage,
  loadSignup,
  signup,
  verifyOtp,
  resendOtp,
  loadLogin,
  login,
  logout,
  loadShoppingPage, 
  profileInformation,
  getOrders,
  getAddress,
  changePassword,
  getForgotPassword,
  forgotPassword,
  passwordOtpVerify,
  getResetPassword,
  resetPassword,
  editresendOtp,
  editName,
  addAddress,
  editAddress,
  deleteAddress,
  loadOtpPage,
  allProductOffer,
  errorPage
}
