const User = require('../../models/userSchema');


const customerInfo = async (req, res) => {
  try {
    let page = 1;
    if(req.query.page) {
      page = req.query.page
    }
    const limit = 5;
    const userData = await User.find({isAdmin:false})
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .exec();

    const count = await User.find({isAdmin:false}).countDocuments();

    res.render('customers', {
      data: userData,
      totalPages: Math.ceil(count/limit),
      currentPage: page,
      heading: 'Customer List'
    });

  } catch (error) {
    console.log('Customer info Error', error);
    res.redirect('/admin/pageError');
  }
}

const customerBlock = async (req, res) => {
  try {
    const id = req.query.id;
    const value = req.query.status;
    if(!id || !value) {
      return res.status(404).json({success: false, message: 'credential not found.'});
    }
    if(value === 'block') {
      await User.updateOne({_id: id}, {$set: {isBlocked: true}});
      return res.status(200).json({success: true, isBlocked:true});
    } else if(value === 'unblock') {
      await User.updateOne({_id: id}, {$set: {isBlocked: false}});
      return res.status(200).json({success: true, isBlocked:false});
    }
  } catch (error) {
    console.log('Customer block Error', error);
    res.status(500).json({success: false, message: 'Internal Server Error'});
  }
}


module.exports = {
  customerInfo,
  customerBlock
}