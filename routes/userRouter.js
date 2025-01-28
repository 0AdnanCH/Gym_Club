const express = require('express');
const passport = require('passport')
const userController = require('../controllers/user/userController');
const productController = require('../controllers/user/productController');
const cartController = require('../controllers/user/cartController');
const orderController = require('../controllers/user/orderController');
const wishlistController = require('../controllers/user/wishlistController');
const {userAuth} = require('../middlewares/auth');
const itemQty = require('../middlewares/cartWishQty');
const User = require('../models/userSchema');
const router = express.Router();

// signup management
router.get('/pageNotFound', userController.pageNotFound);
router.get('/errorPage', userController.errorPage);

router.get('/', userAuth, itemQty, userController.loadHomepage);

router.get('/signup', userController.loadSignup);
router.post('/signup', userController.signup);
router.get('/otp', userController.loadOtpPage);
router.post('/verify-otp', userController.verifyOtp);
router.post('/resend-otp', userController.resendOtp);
router.get('/auth/google', passport.authenticate('google', {scope:['profile', 'email']}));
router.get('/auth/google/callback', passport.authenticate('google', {failureRedirect: '/signup'}), async (req, res) => {
  try {
    const user = req.session.passport.user;
    const userData = await User.findOne({_id:user, isBlocked: false});
    if(userData) {
     return res.redirect('/');
    }
    req.session.destroy();
    return res.redirect('/login?message=User is blocked');
  } catch (error) {
    console.log('Passport error', error)
    res.redirect('/pageNotFound')
  }  
});


// login management
router.get('/login', userController.loadLogin);
router.post('/login', userController.login);


// logout management 
router.post('/logout', userController.logout);

// product management
router.get('/shop', userAuth, itemQty, userController.loadShoppingPage);
router.get('/productDetails', userAuth, itemQty, productController.productDetails);
router.post('/stockAvailable', userAuth, productController.stockAvailable);

//profile management
router.get('/account', userAuth, itemQty, userController.profileInformation);
router.patch('/changePassword', userAuth, userController.changePassword);
// router.post('/editEmailOtp', userAuth, userController.editEmailOtp);
// router.post('/emailOtp', userAuth, userController.otpEmailVerify);
// router.post('/emailResentOtp', userAuth, userController.editresendOtp);
router.patch('/editName', userAuth, userController.editName);

//forgot password
router.get('/forgotPassword', userAuth, userController.getForgotPassword);
router.post('/forgotPassword', userAuth, userController.forgotPassword);
router.post('/passwordOtp', userAuth, userController.passwordOtpVerify);
router.get('/resetPassword', userAuth, userController.getResetPassword);
router.patch('/resetPassword', userAuth, userController.resetPassword);
router.post('/passwordResentOtp', userAuth, userController.editresendOtp);


//addressManagement
router.get('/address', userAuth, itemQty, userController.getAddress);
router.post('/addAddress', userAuth, userController.addAddress);
router.put('/editAddress', userAuth, userController.editAddress);
router.delete('/deleteAddress', userAuth, userController.deleteAddress);


// cart management 
router.get('/getCart', userAuth, itemQty, cartController.getCart);
router.post('/addToCart', userAuth, cartController.addToCart);
router.patch('/qtyUpdate', userAuth, cartController.updateQuanity);
router.delete('/removeCartItem', userAuth, cartController.removeCartItem);

// order management
router.get('/getCheckout', userAuth, orderController.getCheckout);
router.get('/orderSubmit', userAuth, orderController.getPaySubmit);
router.post('/codpayment', userAuth, orderController.codpayment);
router.post('/walletPayment', userAuth, orderController.walletPayment)
router.get('/orders', itemQty, userAuth, userController.getOrders);
router.get('/orderDetails', itemQty, userAuth, orderController.getOrderDetails);
router.patch('/cancelOrder', userAuth, orderController.cancelOrder);
router.post('/createOrder', userAuth, orderController.createOrder);
router.post('/verifyPayment', userAuth, orderController.verifyPayment);
// router.post('/payment-failed', userAuth, orderController.paymentFailed)
router.post('/payment/webhook', userAuth, orderController.handleWebhook);
router.patch('/changeItemstatus', userAuth, orderController.changeItemStatus);
router.post('/returnOrder', userAuth, orderController.returnOrders);
router.patch('/cancelReturn', userAuth, orderController.cancelReturn);
router.post('/returnConfirmInd', userAuth, orderController.indiReturnConfrim);
router.patch('/cancelIndiReturn', userAuth, orderController.cancelIndiReturn);
router.get('/order/:orderId/invoice', userAuth, orderController.downloadInvoice);
router.post('/continue-razorpay', userAuth, orderController.continueRazorpay);
router.get('/paymentStatus', userAuth, orderController.paymentStatus)

// wishlist management
router.get('/wishlist', userAuth, itemQty, wishlistController.getWishlist);
router.post('/addtoWishlist', userAuth, wishlistController.addtoWishlist);
router.delete('/removeWishlitItem', userAuth, wishlistController.removeItem);

// coupon management
router.post('/applyCoupon', userAuth, orderController.applyCoupon);
router.delete('/removeCoupon', userAuth, orderController.removeCoupon);

// wallet management 
router.get('/wallet', userAuth, itemQty, orderController.getWallet);

module.exports = router;  
