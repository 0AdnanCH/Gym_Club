const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const adminController = require('../controllers/admin/adminController');
const customerController = require('../controllers/admin/customerController');
const categoryController = require('../controllers/admin/categoryController');
const productController = require('../controllers/admin/productController');
const orderController = require('../controllers/admin/orderController');
const couponController = require('../controllers/admin/couponController');
const offerController = require('../controllers/admin/offerController');
const auth = require('../middlewares/auth');
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // Directory to store files
  },
  filename: (req, file, cb) => {
    // Ensure unique filenames
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

// Create multer instance
const upload = multer({
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB limit
  fileFilter: (req, file, cb) => {
    // File type validation (e.g., images only)
    const fileTypes = /jpeg|jpg|png|gif/;
    const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = fileTypes.test(file.mimetype);

    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  },
});

// login management
router.get('/pageError', adminController.pageError);
router.get('/login', adminController.loadLogin);
router.post('/login', adminController.login);
router.get('/', auth.adminAuth, adminController.loadDashboard);
router.post('/logout', auth.adminAuth, adminController.logout);

// sales report management
router.get('/salesReport', auth.adminAuth, adminController.salesReport);
router.post('/salesReport', auth.adminAuth, adminController.salesReportbyDate);
router.get('/download/pdf', auth.adminAuth, adminController.reportDownloadPdf);
router.get('/download/excel', auth.adminAuth, adminController.reportDownloadExcel);


// admin dashboard management
router.get('/top-products', auth.adminAuth, adminController.topProducts);
router.get('/top-categories', auth.adminAuth, adminController.topCategoreis);
router.get('/orderMonthChart', auth.adminAuth, adminController.monthChart);
router.get('/orderYearlyChart', auth.adminAuth, adminController.yearChart);

// customer management
router.get('/users', auth.adminAuth, customerController.customerInfo);
router.patch('/blockUser', auth.adminAuth, customerController.customerBlock);

// category management
router.get('/category', auth.adminAuth, categoryController.categoryInfo);
router.post('/addCategory', auth.adminAuth, categoryController.addCategory);
router.get('/addCategory', auth.adminAuth, categoryController.loadAddCategory);
router.patch('/categoryListed', auth.adminAuth, categoryController.changeStatus);
router.get('/editCategory', auth.adminAuth, categoryController.getEditCategory);
router.put('/editCategory/:id', auth.adminAuth, categoryController.editCategory);

//product management
router.get('/addProducts', auth.adminAuth, productController.getAddProduct);
router.post('/addProducts', auth.adminAuth,productController.addProduct);
router.get('/products', auth.adminAuth, productController.getAllProducts);
router.patch('/blockProduct', auth.adminAuth, productController.blockProduct);
router.patch('/unblockProduct', auth.adminAuth, productController.unblockProduct);
router.get('/editProduct', auth.adminAuth, productController.getEditProduct);
router.put('/editProduct/:id', auth.adminAuth, productController.editProduct);
router.get('/productDetails', auth.adminAuth, productController.getProductDetails);
router.patch('/product/addVariant', auth.adminAuth, upload.array('images', 10), productController.addVariant);
router.patch('/product/editVariant', auth.adminAuth, productController.editVariant);
router.patch('/product/editImage', auth.adminAuth, upload.array('images', 10), productController.editVariantImage);

//order management
router.get('/order', auth.adminAuth, orderController.getOrder);
router.get('/orderDetails', auth.adminAuth, orderController.getOrderDetails);
router.patch('/changeOrderStatus', auth.adminAuth, orderController.changeOrderStatus);
router.patch('/acceptReturnReq', auth.adminAuth, orderController.acceptReturnReq);
router.patch('/rejectReturn', auth.adminAuth, orderController.rejectReturn);

// coupon management
router.get('/addCoupon', auth.adminAuth, couponController.getAddCoupon);
router.get('/coupon', auth.adminAuth, couponController.getCoupon);
router.post('/addCoupon', auth.adminAuth, couponController.addCoupon);
router.patch('/changeCouponStatus', auth.adminAuth, couponController.changeStatus);

// offer management 
router.get('/addOffer', auth.adminAuth, offerController.getAddOffer);
router.post('/createOffer', auth.adminAuth, offerController.createOffer);
router.get('/offers', auth.adminAuth, offerController.getOffer);
router.patch('/changeOfferStatus', auth.adminAuth, offerController.changeStatus);


module.exports = router;