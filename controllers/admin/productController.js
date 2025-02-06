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
    const productExists = await Product.findOne({productName: new RegExp(`^${product.name}$`, 'i')});
    if(!productExists) {
      const categoryId = await Category.findOne({name: product.category, isListed: true});
      if(!categoryId) {
        return res.status(404).json({success: false, message:'Category not found'});
      }

      const newProduct = new Product({
        productName: product.name,
        description: product.description,
        category: categoryId._id,
        regularPrice: product.price,
        salePrice: product.salePrice,
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
      productName: new RegExp(`^${data.name}$`, 'i'),
      _id:{$ne: id}
    })
    if(existingProduct) {
      return res.status(409).json({success:false, message: 'Product with this name already exists. Please try with another name!'});
    }
    const categoryId = await Category.findOne({name: data.category, isListed: true});
    if(!categoryId) {
      return res.status(404).json({success: false, message:'Category not found'});
    }

    const updateFields = {
      productName: data.name,
      description: data.description,
      category: categoryId._id,
      regularPrice: data.price,
      salePrice: data.salePrice,
    }

    await Product.findOneAndUpdate({_id: id}, {$set: updateFields}, {new:true});
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

const addVariant = async (req, res) => {
  try {
    const productId = req.body.productId;
    console.log(req.body);
    const product = await Product.findOne({_id: productId});
    if(!product) {
      return res.status(404).json({success: false, message: 'Product not found'});
    }
    const color = req.body.color;
    const existColor = product.variant.find(variant => variant.color === color);
    if(existColor) {
      return res.status(409).json({success: false, message: 'Color already exists'});
    }
    const { XS, S, L, M ,XL ,XXL, XXXL} = req.body;
    const image = [];
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
        image.push(path.join('resized', req.files[i].filename));
      }
    }
    const variant = {
      color, XS, S, M, L, XL, XXL, XXXL, image
    }
    console.log(variant);
    const addVariant = await Product.findOneAndUpdate({_id: productId}, {$push: {variant}}, {new: true});
    if(addVariant) {
      return res.status(200).json({success: true, noOfVariant:addVariant.variant.length});
    } else {
      return res.status(500).json({success: false, message: 'Failed to add variant'});
    }
  } catch (error) {
    console.log('product variant add error', error);
    res.status(500).json({success: false, message: 'Internal Server Error'});
  }
}

const editVariant = async (req, res) => {
  try {
    const productId = req.query.productId;
    const variantId = req.query.variantId;
    const product = await Product.findOne({_id: productId, 'variant._id': variantId});
    if(!product) {
      return res.status(404).json({success: false, message: 'Product not found'});
    }
    const color = req.body.color;
    const existColor = product.variant.find(variant => !variant._id.equals(new ObjectId(variantId)) && variant.color === color);
    if(existColor) {
      return res.status(409).json({success: false, message: 'Color already exists'});
    }
    const { XS, S, L, M ,XL ,XXL, XXXL} = req.body;
    const editVariant = await Product.findOneAndUpdate({_id: productId, 'variant._id': variantId}, {$set: {'variant.$.color': color, 'variant.$.XS': XS, 'variant.$.S':S, 'variant.$.M': M, 'variant.$.L':L, 'variant.$.XL': XL, 'variant.$.XXL': XXL, 'variant.$.XXXL': XXXL}});
    if(editVariant) {
      return res.status(200).json({success: true});
    } else {
      return res.status(500).json({success: false, message: 'Failed to edit variant'});
    }

  } catch (error) {
    console.log('product variant edit error', error);
    res.status(500).json({success: false, message: 'Internal Server Error'});
  }
}

const editVariantImage = async (req, res) => {
  try {
    const productId = req.query.productId;
    const variantId = req.query.variantId;
    const product = await Product.findOne({_id: productId, 'variant._id': variantId});
    if(!product) {
      return res.status(404).json({success: false, message: 'Product not found'});
    }
    const index = req.query.index;
    console.log(productId, variantId, index);
    console.log(req.files.length)
    let image;
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
        image = path.join('resized', req.files[i].filename);
      }
    }
    console.log(image)
    const updateImage = await Product.findOneAndUpdate({_id: productId, 'variant._id': variantId}, {$set: {[`variant.$.image.${index}`]: image}});
    if(updateImage) {
      return res.status(200).json({success: true, image});
    } else {
      return res.status(500).json({success: false, message: 'Failed to change image'});
    }
  } catch (error) {
    console.log('product variant edit image error', error);
    res.status(500).json({success: false, message: 'Internal Server Error'});
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
  getProductDetails,
  addVariant,
  editVariant,
  editVariantImage
}