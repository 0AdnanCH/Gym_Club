const Category = require('../../models/categorySchema');


const categoryInfo = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 4;
    const skip = (page - 1) * limit;
    const categoryData = await Category.find({})
    .sort({createdAt: -1})
    .skip(skip)
    .limit(limit);
    
    const totalCategories = await Category.countDocuments(); 
    const totalPages = Math.ceil(totalCategories / limit);
    res.render('category', {
      category: categoryData,
      currentPage: page,
      totalPages,
      heading: 'Categories List'
    });
  } catch (error) {
    res.redirect('/admin/pageError');
  }
}

const addCategory = async (req, res) => {
  try {
    const {name, description} = req.body;
    const existingCategory = await Category.findOne({name: new RegExp(`^${name}$`, 'i')});
    if(existingCategory) {
      return res.status(409).json({success: false, message: 'Category already exists'});
    }
    const newCategory = new Category({
      name,
      description
    });
    await newCategory.save();
    return res.status(200).json({ success: true});
  } catch (error) {
    console.log('Add Category Error', error);
    return res.status(500).json({success: false, message: 'Internal Server Error'});
  }
}
const loadAddCategory = async (req, res) => {
  try {
    res.render('category-add', {heading: 'Create Category'});
  } catch (error) {
    console.log('category add load error', error);
    res.redirect('/admin/pageError');
  }
}
const changeStatus = async (req, res) => {
  try {
    const id = req.query.id;
    const value = req.query.status;
    if(!id || !value) {
      return res.status(404).json({success: false, message: 'credential not found'}); 
    }
    if(value === 'list') {
      await Category.updateOne({_id: id}, {$set: {isListed:true}});
      return res.status(200).json({success: true, isListed:true});
    } else if(value === 'unlist') {
      await Category.updateOne({_id: id}, {$set: {isListed:false}});
      return res.status(200).json({success: true, isListed:false});
    }
  } catch (error) {
    console.log('Category Unlist Error', error);
    res.status(500).json({success: false, message: 'Internal Server Error.'});
  }
}

const getEditCategory = async (req, res) => {
  try {
    const id = req.query.id;
    const category = await Category.findOne({_id: id});
    res.render('category-edit', {category, heading: 'Category Edit'});
  } catch (error) {
    console.log('Get Category Error', error);
    res.redirect('/admin/pageError');
  }
}

const editCategory = async (req, res) => {
  try {
    const id = req.params.id;
    const {name, description} = req.body;
    const existingCategory = await Category.findOne({name: new RegExp(`^${name}$`, 'i') ,_id:{$ne:id}});
    if(existingCategory) {
      return res.status(409).json({success: false, message: 'Category exits, please choose another name'});
    }
    const updateCategory = await Category.findByIdAndUpdate(id, {
      name,
      description
    }, {new: true});

    if(updateCategory) {
      return res.status(200).json({success: true});
    } else {
      return res.status(200).json({success: false, message: 'Category not found'});
    }
  } catch (error) {
    console.log('Edit Category Error', error);
    res.status(500).json({error: 'Internal server error'});
  }
}

module.exports = {
  categoryInfo,
  addCategory,
  loadAddCategory,
  changeStatus,
  getEditCategory,
  editCategory
}