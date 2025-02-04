const User = require('../models/userSchema');

const userAuth = async (req, res, next) => {
  try {
    const userId = req.session.user;
    if(userId) {
      const user = await User.findOne({_id: userId, isBlocked:false});
      if(!user) {
        req.session.user = null;
      } else {
        res.locals.user = user.name;
      }
      next();
    } else {
      next();
    }
  } catch (error) {
    console.log('Error in userAuth middleware', error);
    res.status(500).json('Internal Server error');
  }
}

const adminAuth = async (req, res, next) => {
  try {
    console.log('admin auth')
    const adminId = req.session.admin;
    if(adminId) {
      console.log('admin is there')
      const admin = await User.findOne({_id: adminId, isAdmin:true});
      if(admin) {
        console.log('admin is here')
        next();
      } else {
        res.redirect('/admin/login')
      }
    } else {
      res.redirect('/admin/login')
    }
  } catch (error) {
    console.log('Error in adminauth middleware', error);
    res.status(500).json('Internal Server error');
  }
}

module.exports = {
  userAuth, 
  adminAuth,
}