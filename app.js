const express = require('express');
const dotenv = require('dotenv')
dotenv.config();
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const passport = require('./config/passport');
const connectDB = require('./config/db');
const userRouter = require('./routes/userRouter');
const adminRouter = require('./routes/adminRouter');
const errorHandlerMiddleware = require('./middlewares/errorHandling');
const nocache = require('nocache');

const app = express();
connectDB();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
}));

app.use(nocache())
app.use(passport.initialize());
app.use(passport.session());

app.set('view engine', 'ejs');
app.set('views', [path.join(__dirname, 'views/user'), path.join(__dirname, 'views/admin')]);

app.use(express.static(path.join(__dirname, 'public/assets')));
app.use('/admin', express.static(path.join(__dirname, 'public/adminAssets')));

app.use('/', express.static(path.join(__dirname, 'uploads')));
app.use('/admin', express.static(path.join(__dirname, 'uploads')));

app.use('/', userRouter);
app.use('/admin', adminRouter);


app.use(errorHandlerMiddleware.pageNotFound);
app.use(errorHandlerMiddleware.errorHandler);

app.listen(process.env.PORT,()=> {
  console.log(`server running at http://localhost:${process.env.PORT}`);
});


module.exports = app;
