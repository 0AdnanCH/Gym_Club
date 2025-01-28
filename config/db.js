const mongoose = require('mongoose');
const env = require('dotenv').config();


const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('mongoDB connected');
  } catch (error) {
    console.log('Failed to connect mongoose', error.message);
    process.exit(1);
  }
}

module.exports = connectDB;