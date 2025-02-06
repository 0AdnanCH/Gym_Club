const mongoose = require('mongoose');
const env = require('dotenv').config();


const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URL);
  } catch (error) {
    process.exit(1);
  }
}

module.exports = connectDB;