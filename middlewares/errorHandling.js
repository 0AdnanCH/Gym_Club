const pageNotFound = (req, res, next) => {
  res.status(400).redirect('/pageNotFound');
}
const errorHandler = (err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something went wrong!');
};



module.exports = {
  pageNotFound,
  errorHandler
}