const ObjectId = require('mongoose').Types.ObjectId;
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Offer = require('../../models/offerSchema');
const User = require('../../models/userSchema');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const getAddProduct = async (req, res) => {
  try {
    const category = await Category.find({isListed: true});
    res.render('product-add', {cat: category, heading: 'Create Product'});
  } catch (error) {
    console.log('Product Add Error', error);
    res.redirect('/admin/pageError');
  }
}
const addProduct = async (req, res) => {
  try {
    const product = req.body;
    console.log(product)
    const productExists = await Product.findOne({productName: new RegExp(`^${product.productName}$`, 'i')});
    if(!productExists) {
      const productColor = product.productColor
      const sizeXS = product.sizeXS 
      const sizeS = product.sizeS
      const sizeM = product.sizeM
      const sizeL = product.sizeL
      const sizeXL = product.sizeXL
      const sizeXXL = product.sizeXXL
      const size3XL = product.size3XL
      const images = [];
      if(req.files && req.files.length > 0) {
        const resizedDir = path.join('uploads', 'resized'); 

        if (!fs.existsSync(resizedDir)) {
          fs.mkdirSync(resizedDir, { recursive: true });
        }

        for (let i = 0; i < req.files.length; i++) {
          const originalImagePath = req.files[i].path;
          const resizedImagePath = path.join(resizedDir, req.files[i].filename);
          await sharp(originalImagePath)
            .resize({ width: 440, height: 440 })
            .toFile(resizedImagePath);
          images.push(path.join('resized', req.files[i].filename));
        }
      }
      const categoryId = await Category.findOne({name: product.category, isListed: true});
      if(!categoryId) {
        return res.status(404).json({success: false, message:'Category not found'});
      }

      let variantDocs = [];
      if(Array.isArray(productColor)){
          variantDocs = productColor.map((val) => {
           let extractVal = val.slice(1);
          const xs = sizeXS.find((size) => size.includes(val)) || 0; 
          const s = sizeS.find((size) => size.includes(val)) || 0;
          const m = sizeM.find((size) => size.includes(val)) || 0;
          const l = sizeL.find((size) => size.includes(val)) || 0;
          const xl = sizeXL.find((size) => size.includes(val)) || 0;
          const xxl = sizeXXL.find((size) => size.includes(val)) || 0;
          const xxxl = size3XL.find((size) => size.includes(val)) || 0;
            
          const productImage = []
          images.forEach((image) => {
            if(image.includes(extractVal)) {
              productImage.push(image);
            }
          })
          
          return {
            color: val,
            image: productImage,
            XS: parseInt(xs.replace(val, ''), 10), 
            S: parseInt(s.replace(val, ''), 10),
            M: parseInt(m.replace(val, ''), 10),
            L: parseInt(l.replace(val, ''), 10),
            XL: parseInt(xl.replace(val, ''), 10),
            XXL: parseInt(xxl.replace(val, ''), 10),
            XXXL: parseInt(xxxl.replace(val, ''), 10),
          };
        });
        
      } else {
        const variantObj = {
            color: productColor,
            image: images,
            XS: parseInt(sizeXS.replace(productColor, ''), 10), 
            S: parseInt(sizeS.replace(productColor, ''), 10),
            M: parseInt(sizeM.replace(productColor, ''), 10),
            L: parseInt(sizeL.replace(productColor, ''), 10),
            XL: parseInt(sizeXL.replace(productColor, ''), 10),
            XXL: parseInt(sizeXXL.replace(productColor, ''), 10),
            XXXL: parseInt(size3XL.replace(productColor, ''), 10),
          }
          variantDocs.push(variantObj)
        }

      const newProduct = new Product({
        productName: product.productName,
        description: product.description,
        category: categoryId._id,
        regularPrice: product.regularPrice,
        salePrice: product.salePrice,
        variant: variantDocs,
        status: 'Available',
      });
      await newProduct.save();
      return res.status(200).json({success: true});
    } else {
      //conflict
      return res.status(409).json({success: false, message:'Product already exist, Please try another another name'});
    }
  } catch (error) {
    console.error('Product Add Error', error);
    res.status(500).json({success: false, message: 'Internal Server Error'});
  }
}

const getAllProducts = async (req, res) => {
  try {
    const page = req.query.page || 1;
    const limit = 10;

    const productData = await Product.find()
    .sort({createdAt: -1})
    .limit(limit*1)
    .skip((page-1)*limit)
    .populate('category')
    .exec();

    const count =  await Product.find().countDocuments();

    res.render('products', {
      data: productData,
      currentPage: page,
      totalPages: Math.ceil(count/limit),
      heading: 'Product List'
    });

  } catch (error) {
    console.error('Product Get Error', error);
    res.redirect('/admin/pageError');
  }
}

const blockProduct = async (req, res) => {
  try {
    const id = req.query.id;
    console.log(id)
    if(!id) {
      return res.status(404).json({success: false, message: 'Product id not found'}); 
    }
    await Product.updateOne({_id:id}, {$set: {isBlocked: true}});
    return res.status(200).json({success: true});
  } catch (error) {
    console.error('Block Product Error', error);
    res.status(500).json({success: false, message: 'Internal server error'});
  }
}

const unblockProduct = async (req, res) => {
  try {
    const id = req.query.id;
    if(!id) {
      return res.status(404).json({success: false, message: 'Product id not found'}); 
    }
    await Product.updateOne({_id:id}, {$set: {isBlocked: false}});
    return res.json({success: true});
  } catch (error) {
    console.error('Unblock Product Error', error);
    res.status(500).json({success: false, message: 'Failed to unblock product'});
  }
}

const getEditProduct = async (req, res) => {
  try {
    let id = req.query.id;
    const product = await Product.findOne({_id:id})
    .populate('category', 'name').exec();
    const category = await Category.find({isListed: true});
    let index = 0
    res.render('product-edit', {product, category, index, heading: 'Product Edit'});
  } catch (error) {
    console.error('Get Edit Product Error', error);
    res.redirect('/admin/pageError');
  }
}

const editProduct = async (req, res) => {
  try {
     const id = req.params.id;
    const data = req.body;

    const existingProduct = await Product.findOne({
      productName: new RegExp(`^${data.productName}$`, 'i'),
      _id:{$ne: id}
    })
    if(existingProduct) {
      return res.status(409).json({success:false, message: 'Product with this name already exists. Please try with another name!'});
    }
    const productColor = data.productColor
    const sizeXS = data.sizeXS 
    const sizeS = data.sizeS
    const sizeM = data.sizeM
    const sizeL = data.sizeL
    const sizeXL = data.sizeXL
    const sizeXXL = data.sizeXXL
    const size3XL = data.size3XL

    const images = [];
    if(req.files && req.files.length > 0) {
      const resizedDir = path.join('uploads', 'resized'); // Create a subfolder for resized images

        // Ensure the resized directory exists
        if (!fs.existsSync(resizedDir)) {
          fs.mkdirSync(resizedDir, { recursive: true });
        }

        for (let i = 0; i < req.files.length; i++) {
          const originalImagePath = req.files[i].path;
          const resizedImagePath = path.join(resizedDir, req.files[i].filename); // Save resized image in the 'resized' folder
          await sharp(originalImagePath)
            .resize({ width: 440, height: 440 })
            .toFile(resizedImagePath);
          images.push(path.join('resized', req.files[i].filename)); // Save path relative to 'uploads'
        }
    }
    data.existImage.forEach((val) => {
      if(val) {
        images.push(val);
      }
    });
    const categoryId = await Category.findOne({name: data.category, isListed: true});
    if(!categoryId) {
      return res.status(404).json({success: false, message:'Category not found'});
    }
    let variantDocs = []
    if(Array.isArray(productColor)){
        variantDocs = productColor.map((val) => {
          let extractVal = val.slice(1);
        const xs = sizeXS.find((size) => size.includes(val)) || 0; // Default to 0 if not found
        const s = sizeS.find((size) => size.includes(val)) || 0;
        const m = sizeM.find((size) => size.includes(val)) || 0;
        const l = sizeL.find((size) => size.includes(val)) || 0;
        const xl = sizeXL.find((size) => size.includes(val)) || 0;
        const xxl = sizeXXL.find((size) => size.includes(val)) || 0;
        const xxxl = size3XL.find((size) => size.includes(val)) || 0;

        const productImage = []
        images.forEach((image) => {
          if(image.includes(extractVal)) {
            productImage.push(image);
          }
        })
      
  
        // Return the variant structure
        return {
          color: val,
          image: productImage,
          XS: parseInt(xs.replace(val, ''), 10), // Extract and convert the size
          S: parseInt(s.replace(val, ''), 10),
          M: parseInt(m.replace(val, ''), 10),
          L: parseInt(l.replace(val, ''), 10),
          XL: parseInt(xl.replace(val, ''), 10),
          XXL: parseInt(xxl.replace(val, ''), 10),
          XXXL: parseInt(xxxl.replace(val, ''), 10),
        };
      });
      // Save all variants in a single document
    } else {
      const variantObj = {
          color: productColor,
          image: images,
          XS: parseInt(sizeXS.replace(productColor, ''), 10), // Extract and convert the size
          S: parseInt(sizeS.replace(productColor, ''), 10),
          M: parseInt(sizeM.replace(productColor, ''), 10),
          L: parseInt(sizeL.replace(productColor, ''), 10),
          XL: parseInt(sizeXL.replace(productColor, ''), 10),
          XXL: parseInt(sizeXXL.replace(productColor, ''), 10),
          XXXL: parseInt(size3XL.replace(productColor, ''), 10),
        }
        variantDocs.push(variantObj)
      }

    const updateFields = {
      productName: data.productName,
      description: data.description,
      category: categoryId._id,
      regularPrice: data.regularPrice,
      salePrice: data.salePrice,
      variant:variantDocs
    }

    await Product.findByIdAndUpdate(id,updateFields, {new:true});
    res.status(200).json({success: true});
  } catch (error) {
    console.error('Edit Product Error', error);
    res.status(500).json({success: false, message: 'Internal Server Error'});
  }
}


const deleteSingleImage = async (req, res) => {
  try {
    const {imageNameToServer, productIdToServer} = req.body;
    const dltImage = imageNameToServer.split('{')[1];
    const productImage = await Product.findOne({_id:productIdToServer}, {_id:0,productImage:1});
    const imageName = productImage.productImage.find(image => image.includes(dltImage))
    
    const product = await Product.findByIdAndUpdate(productIdToServer, {$pull:{productImage:imageName}});
    
    const imagePath = path.join('uploads', imageName);

    if(fs.existsSync(imagePath)) {
      await fs.unlinkSync(imagePath);
      console.log(`Image ${dltImage} deleted successfully`);
    } else {
      console.log(`Image ${dltImage} not found`);
    }
    res.json({status:true});
  } catch (error) {
    console.error('Delete Image Error', error);
    res.redirect('/admin/pageError');
  }
}

const getProductDetails = async (req, res) => {
  try {
    const id = req.query.id;
    const product = await Product.findOne({_id:id})
    .populate('offerApplied')
    .exec();
    const category = await Category.findOne({_id:product.category})
    .populate('offerApplied')
    .exec();

    // validating product offer active & product offer and category offer exists

    if(product.offerApplied && category.offerApplied) {
      // applied product offer expire date validating
      if(new Date(product.offerApplied.endDate) < new Date() && product.offerApplied.offerStatus !== 'expired') {
        await Offer.updateOne({_id:product.offerApplied._id}, {$set: {offerStatus: 'expired'}});
        product.offerApplied = null;
        // applied product offer status validating 
      } else if(product.offerApplied.offerStatus !== 'active') {
        product.offerApplied = null;
      }
      // applied category offer expire date validating
      if(new Date(category.offerApplied.endDate) < new Date() && category.offerApplied.offerStatus !== 'expired') {
        await Offer.updateOne({_id:category.offerApplied._id}, {$set: {offerStatus: 'expired'}});
        category.offerApplied = null;
        // applied category offer status validating
      } else if(category.offerApplied.offerStatus !== 'active') {
        category.offerApplied = null;
      }
      // only product offer exists
    } else if(product.offerApplied) {
      // applied product offer expire date validating
      if(new Date(product.offerApplied.endDate) < new Date() && product.offerApplied.offerStatus !== 'expired') {
        await Offer.updateOne({_id:product.offerApplied._id}, {$set: {offerStatus: 'expired'}});
        product.offerApplied = null;
        // applied product offer status validating 
      } else if(product.offerApplied.offerStatus !== 'active') {
        product.offerApplied = null;
      }
      // only category offer exists
    } else if(category.offerApplied) {
      // applied category offer expire date validating
      if(new Date(category.offerApplied.endDate) < new Date() && category.offerApplied.offerStatus !== 'expired') {
        await Offer.updateOne({_id:category.offerApplied._id}, {$set: {offerStatus: 'expired'}});
        category.offerApplied = null;
        // applied category offer status validating
      } else if(category.offerApplied.offerStatus !== 'active') {
        category.offerApplied = null;
      }
    }
    // variable for storing offer price
    let offerPrice;
    // if product have product offer and category offer
    if(product.offerApplied && category.offerApplied) {
      // if category and product same startdate
      if(String(product.offerApplied.startDate) === String(category.offerApplied.startDate)) {
        if(String(product.offerApplied.createdAt)>String(category.offerApplied.createdAt)) {
          category.offerApplied.startDate = 0;
        } else {
          product.offerApplied.startDate = 0;
        }
      }
      // product offer is latest
      if(new Date(product.offerApplied.startDate) > new Date(category.offerApplied.startDate )) {
        // discount type is percentage
        if(product.offerApplied.discountType === 'percentage') {
          let disPrice = product.salePrice * (product.offerApplied.discountVal/100);
          let finaldisPrice = Math.min(disPrice, product.offerApplied.maxDiscount);
          offerPrice = product.salePrice - finaldisPrice;
          if(offerPrice<=0) {
            offerPrice = null;
          }
          // discount type is fixed amount
        } else {
          offerPrice = product.salePrice - product.offerApplied.discountVal;
          if(offerPrice<=0) {
            offerPrice = null;
          }
        }
        // category offer is latest
      } else {
        // discount type is percentage
        if(category.offerApplied.discountType === 'percentage') {
          let disPrice = product.salePrice * (category.offerApplied.discountVal/100);
          let finaldisPrice = Math.min(disPrice, category.offerApplied.maxDiscount);
          offerPrice = product.salePrice - finaldisPrice;
          if(offerPrice<=0) {
            offerPrice = null;
          }
          // discount type is fixed amount
        } else {
          offerPrice = product.salePrice - category.offerApplied.discountVal;
          if(offerPrice<=0) {
            offerPrice = null;
          }
        }
        if(offerPrice) {
          product.offerApplied = category.offerApplied;
        }
      }
      // only product offer exists
    } else if(product.offerApplied) {
      // discount percentage type
      if(product.offerApplied.discountType === 'percentage') {
        let disPrice = product.salePrice * (product.offerApplied.discountVal/100);
        let finaldisPrice = Math.min(disPrice, product.offerApplied.maxDiscount);
        offerPrice = product.salePrice - finaldisPrice;
        if(offerPrice<=0) {
          offerPrice = null;
        }
        // discount fixed amount type
      } else {
        offerPrice = product.salePrice - product.offerApplied.discountVal;
        if(offerPrice<=0) {
          offerPrice = null;
        }
      }
      // only category offer exists
    } else if(category.offerApplied) {
      // discount percentage type
      if(category.offerApplied.discountType === 'percentage') {
        let disPrice = product.salePrice * (category.offerApplied.discountVal/100);
        let finaldisPrice = Math.min(disPrice, category.offerApplied.maxDiscount);
        offerPrice = product.salePrice - finaldisPrice;
        if(offerPrice<=0) {
          offerPrice = null;
        }
          // discount fixed amount type
      } else {
        offerPrice = product.salePrice - category.offerApplied.discountVal;
        if(offerPrice<=0) {
          offerPrice = null;
        }
      }
      if(offerPrice) {
        product.offerApplied = category.offerApplied;
      }
    }
    res.render('adminProduct-details', {product, offerPrice, cateName:category.name, heading: 'Product Details'});
  } catch (error) {
    console.error('Admin Product Details Error', error);
    res.redirect('/admin/pageError');
  }
}


module.exports = {
  getAddProduct,
  addProduct,
  getAllProducts,
  blockProduct,
  unblockProduct,
  getEditProduct,
  editProduct,
  deleteSingleImage,
  getProductDetails
}