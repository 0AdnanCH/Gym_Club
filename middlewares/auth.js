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
    res.status(500).json('Internal Server error');
  }
}

const adminAuth = async (req, res, next) => {
  try {
    const adminId = req.session.admin;
    if(adminId) {
      const admin = await User.findOne({_id: adminId, isAdmin:true});
      if(admin) {
        next();
      } else {
        res.redirect('/admin/login')
      }
    } else {
      res.redirect('/admin/login')
    }
  } catch (error) {
    res.status(500).json('Internal Server error');
  }
}

module.exports = {
  userAuth, 
  adminAuth,
}