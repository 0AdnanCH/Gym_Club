const User = require('../../models/userSchema');
const Order = require('../../models/orderSchema');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const PDFDocument = require('pdfkit');
const excelJS = require('exceljs');

const loadLogin = (req, res) => {
  try {
    if(req.session.admin) {
      return res.redirect('/admin');
    }
    res.render('admin-login', {message: null});
  } catch (error) {
    res.redirect('/admin/pageError');
  }
}

const login = async (req, res) => {
  try {
    const {email, password} = req.body;
    const admin = await User.findOne({email, isAdmin: true});
    if(admin) {
      const passwordMatch = await bcrypt.compare(password, admin.password);
      if(passwordMatch) {
        req.session.admin = admin._id;
        return res.status(200).json({success: true});
      } else {
        return res.status(401).json({success: false, message: 'Invalid credentials. Please try again.'});
      }
    } else {
      return res.status(401).json({success: false, message: 'Invalid credentials. Please try again.'});
    }
  } catch (error) {
    return res.status(500).json({redirectUrl: 'Server Error'});
  }
}



const loadDashboard = async (req, res) => {
  try {
    if(req.session.admin) {
      const salesData = await Order.aggregate([
        {
          $group: {
            _id: null, 
            totalOrders: { $sum: 1 },
            totalSalesCount: { $sum: { $sum: '$items.quantity' } }, 
            totalSalesAmount: { $sum: '$totalAmount' } 
          }
        }
      ]);
  
      const result = salesData.length > 0 ? salesData[0] : { totalOrders: 0, totalSalesCount: 0, totalSalesAmount: 0 };

      const order = await Order.find().sort({createdAt: -1}).limit(5).populate('userId', 'name').exec();

      res.render('dashboard', { order, result, heading: 'Welcome!'});
    } else {
      res.redirect('/admin/login');
    }
  
  } catch (error) {
      res.redirect('/admin/pageError')
  }
}

const yearChart = async (req, res) => {
  try {
    const year = req.query.year;
    const monthlyData = await getMonthlyOrderCounts(year);
    const completeOrderCounts = Array(12).fill(0);
    monthlyData.forEach(data => {
      const monthIndex = data._id - 1; 
      completeOrderCounts[monthIndex] = data.orderCount || 0;
    });
    res.status(200).json({ success: true, orderCounts: completeOrderCounts });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

const monthChart = async (req, res) => {
  try {
    const selectedMonth = req.query.selectedMonth; 
    const selectedYear = req.query.selectedYear;
    const dailyOrderCounts = await Order.aggregate([
      {
        $addFields: {
          istCreatedAt: {
            $add: ["$createdAt", 19800000], 
          },
        },
      },
      {
        $match: {
          istCreatedAt: {
            $gte: new Date(`${selectedYear}-${selectedMonth}-01`),
            $lte: new Date(`${selectedYear}-${selectedMonth}-31`),
          },
        },
      },
      {
        $group: {
          _id: { $dayOfMonth: { $toDate: "$istCreatedAt" } }, 
          orderCount: { $sum: 1 },
        },
      },
      {
        $sort: { "_id": 1 }, 
      },
    ]);

    const dailyCounts = Array.from({ length: 31 }, (_, i) => {
      return (
        dailyOrderCounts.find((entry) => entry._id === i + 1)?.orderCount || 0
      );
    });    
    res.status(200).json({ success: true, dailyCounts });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

const topProducts = async (req, res) => {
  try {
    const topProducts = await Order.aggregate([
      {
        $match: {
          orderStatus: {$nin: ['Returned', 'Canceled']},
          'items.isCanceled': {$ne: true},
          'items.isReturned': {$ne: true}
        }
      },
      {
        $unwind: '$items'
      },
      {
        $match: {
          'items.isCanceled': {$ne: true},
          'items.isReturned': {$ne: true}
        }
      },
      {
        $group: {
          _id: '$items.productId',
          totalSold: {$sum: '$items.quantity'}
        }
      },
      {
        $sort: {totalSold: -1}
      },
      {
        $limit: 10
      },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'productDetails'
        }
      },
      {
        $project: {
          _id: 0,
          productId: '$_id',
          totalSold: 1,
          productName: {$arrayElemAt: ['$productDetails.productName', 0]}
        }
      }
    ]);
    res.status(200).json({ success: true, data: topProducts });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
}

const topCategoreis = async (req, res) => {
  try {
    const topCategories = await Order.aggregate([
      {
        $match: {
          orderStatus: {$nin: ['Returned', 'Canceled']},
          'items.isCanceled': {$ne: true},
          'items.isReturned': {$ne: true}
        }
      },
      {
        $unwind: '$items'
      },
      {
        $match: {
          'items.isReturned': {$ne: true},
          'items.isCanceled': {$ne: true}
        }
      },
      {
        $lookup: {
          from: 'products',
          localField: 'items.productId',
          foreignField: '_id',
          as: 'productDetails'
        }
       },
       {
        $unwind: '$productDetails'
       },
       {
        $lookup: {
          from: 'categories',
          localField: 'productDetails.category',
          foreignField: '_id',
          as: 'categoryDetails'
        }
       },
       {
        $unwind: '$categoryDetails'
       },
       {
        $group: {
          _id: '$categoryDetails._id',
          categoryName: {$first: '$categoryDetails.name'},
          totalSold: {$sum: '$items.quantity'}
        }
       },
       {
        $sort: {totalSold: -1}
       }, 
       {
        $limit: 10
       }
    ]);
    res.status(200).json({ success: true, data: topCategories });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
}


async function getMonthlyOrderCounts(year) {
  year = Number(year);
  return await Order.aggregate([
    {
        $match: {
            createdAt: {
                $gte: new Date(`${year}-01-01`), 
                $lt: new Date(`${year + 1}-01-01`)
            }
        }
    },
    {
        $group: {
            _id: { $month: "$createdAt" }, 
            orderCount: { $sum: 1 } 
        }
    },
    {
        $sort: { _id: 1 } 
    }
  ]);

}

const pageError = (req, res) => {
  res.render('admin-error');
}

const logout = async (req, res) => {
  try {
    req.session.destroy(err => {
      if(err) {
        return res.status(500).json({success: false, message: 'Failed to logout'})
      }
      res.status(200).json({success: true});
    });
  } catch (error) {
    res.status(500).json({success: false, message: 'Internal server error'});
  }
}

async function salesreportOfMonth(startDate, endDate) {
  const IST_OFFSET = 5.5 * 60 * 60 * 1000;
  return await Order.aggregate([
    {
      $match: {
        createdAt: {
          $gte: new Date(new Date(`${startDate}T00:00:00.000Z`).getTime() - IST_OFFSET),
          $lte: new Date(new Date(`${endDate}T23:59:59.999Z`).getTime() - IST_OFFSET),
        },
      },
    },
    { $unwind: "$items" },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m-%d", date: { $add: ["$createdAt", IST_OFFSET] } },
        },
        date: {
          $first: {
            $dateToString: { format: "%Y-%m-%d", date: { $add: ["$createdAt", IST_OFFSET] } },
          },
        },
        numberOfOrders: { $addToSet: "$_id" },
        productsSold: { $sum: "$items.quantity" },
        totalSales: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
        discounts: { $sum: { $ifNull: ["$appliedCoupon.discountPrice", 0] } },
      },
    },
    {
      $project: {
        _id: 0,
        date: 1,
        numberOfOrders: { $size: "$numberOfOrders" },
        productsSold: 1,
        totalSales: 1,
        discounts: 1,
        netSales: { $subtract: ["$totalSales", "$discounts"] },
      },
    },
    { $sort: { date: 1 } },
  ]);
}

async function salesreportOfDay(date) {
  const IST_OFFSET = 5.5 * 60 * 60 * 1000;
  return result = await Order.aggregate([
    {
      $match: {
        createdAt: {
          $gte: new Date(new Date(`${date}T00:00:00.000Z`).getTime() - IST_OFFSET),
          $lte: new Date(new Date(`${date}T23:59:59.999Z`).getTime() - IST_OFFSET),
        },
      },
    },
    {
      $unwind: '$items'
    },
    {
      $group: {
        _id: "$_id", 
        orderId: { $first: "$orderedId" },
        customerName: { $first: "$address.name" },
        productsSold: { $sum: "$items.quantity" },
        totalSales: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
        discount: { $first: "$appliedCoupon.discountPrice" },
      },
    },
    {
      $project: {
        _id: 0,
        orderId: 1,
        customerName: 1,
        productsSold: 1,
        totalSales: 1,
        discount: { $ifNull: ["$discount", 0] },
        netSales: { $subtract: ["$totalSales", { $ifNull: ["$discount", 0] }] },
      },
    },
    {
      $sort: {orderId: 1}
    }
  ]);
}

const salesReport = async (req, res) => {
  try {
    const IST_OFFSET = 5.5 * 60 * 60 * 1000; 
    const order = await Order.findOne().sort({createdAt: 1}).select('createdAt');
    const startDate = order.createdAt.toISOString().split('T')[0];
    let endDate = new Date();
    endDate = new Date(endDate.getTime() + IST_OFFSET).toISOString().split('T')[0];
    const result = await salesreportOfMonth(startDate, endDate);
    if(!result || result.length === 0) {
      return res.render('sales-report', {result: null, total: null, heading: 'SALES REPORT'});
    }
    let total;
    if(result.length>0) {
      total = {
        totalProductSold : 0,
        allTotalSales : 0,
        totalDiscount: 0,
        totalNoOfOrders : 0,
        totalNetSales : 0
      }
      result.forEach(item => {
        total.totalProductSold += item.productsSold;
        total.allTotalSales += item.totalSales;
        total.totalDiscount += item.discounts
        total.totalNoOfOrders += item.numberOfOrders;
        total.totalNetSales += item.netSales
      });
    }

    res.render('sales-report', {result, total, heading: 'SALES REPORT'});
  } catch (error) {
    res.redirect('/admin/pageError');
  }
}

const salesReportbyDate = async (req, res) => {
  try {
    const startDate = req.query.srt_date;
    const endDate = req.query.end_date;
    let result;
    let total;
    if(startDate === endDate) {
      result = await salesreportOfDay(startDate);
      if(result.length>0) {
        total = {
          totalProductSold : 0,
          allTotalSales : 0,
          totalDiscount: 0,
          totalNetSales : 0
        }
        result.forEach(item => {
          total.totalProductSold += item.productsSold;
          total.allTotalSales += item.totalSales;
          total.totalDiscount += item.discount;
          total.totalNetSales += item.netSales;
        })
      }
    } else {
      result = await salesreportOfMonth(startDate, endDate)
      if(result.length>0) {
        total = {
          totalProductSold : 0,
          allTotalSales : 0,
          totalDiscount: 0,
          totalNoOfOrders : 0,
          totalNetSales : 0
        }
        result.forEach(item => {
          total.totalProductSold += item.productsSold;
          total.allTotalSales += item.totalSales;
          total.totalDiscount += item.discounts;
          total.totalNoOfOrders += item.numberOfOrders;
          total.totalNetSales += item.netSales;
        });
      }
    }
    if(result && total) {
      res.status(200).json({success: true, result, total})
    } else {
      res.status(404).json({success: false, message: 'Data not found.'});
    }

  } catch (error) {
    res.status(500).json({success: false, message: 'Internal server error'});
  }
}


const reportDownloadPdf = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let result;
    
    if (startDate === endDate) {
      result = await salesreportOfDay(startDate);
    } else {
      result = await salesreportOfMonth(startDate, endDate);
    }

    const doc = new PDFDocument({ margin: 50 });
    const tableTop = 150;
    const rowHeight = 30;

    res.setHeader('Content-type', 'application/pdf');
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="sales_report_${startDate}_to_${endDate}.pdf"`
    );

    doc.pipe(res);
    doc.fontSize(20).text("Sales Report", { align: "center" });
    doc.moveDown(); // Add some vertical 

    // Display date range
    doc.fontSize(10)
       .text(`From: ${startDate}`, 30)
       .moveDown(0.5)
       .text(`To: ${endDate}`, 30);
 
    // Define headers based on the report type
    const headers = startDate === endDate ? [
      { label: "Order ID", width: 140 },
      { label: "Name", width: 80 },
      { label: "Products Sold", width: 80 },
      { label: "Total Sales", width: 80 },
      { label: "Discounts", width: 80 },
      { label: "Net Sales", width: 80 },
    ] : [
      { label: "Date", width: 80 },
      { label: "Orders", width: 70 },
      { label: "Products Sold", width: 100 },
      { label: "Total Sales", width: 100 },
      { label: "Discounts", width: 100 },
      { label: "Net Sales", width: 100 },
    ];

    // Draw table headers
    let x = 30;
    headers.forEach(header => {
      doc.rect(x, tableTop, header.width, rowHeight).stroke();
      doc.text(header.label, x + 10, tableTop + 10);
      x += header.width;
    });

    // Initialize totals
    let total = startDate === endDate ? {
      totalProductSold: 0,
      allTotalSales: 0,
      totalDiscount: 0,
      totalNetSales: 0,
    } : {
      totalProductSold: 0,
      allTotalSales: 0,
      totalDiscount: 0,
      totalNoOfOrders: 0,
      totalNetSales: 0,
    };

    // Draw table data
    result.forEach((item, index) => {
      const y = tableTop + rowHeight + (index + 1) * rowHeight;

      const rowData = startDate === endDate ? [
        item.orderId,
        item.customerName,
        item.productsSold,
        `${item.totalSales.toFixed(2)}`,
        `${item.discount.toFixed(2)}`,
        `${item.netSales.toFixed(2)}`,
      ] : [
        item.date,
        item.numberOfOrders,
        item.productsSold,
        `${item.totalSales.toFixed(2)}`,
        `${item.discounts.toFixed(2)}`,
        `${item.netSales.toFixed(2)}`,
      ];

      let x = 30;
      rowData.forEach((data, i) => {
        const colWidth = headers[i].width;
        doc.rect(x, y, colWidth, rowHeight).stroke(); // Draw cell border
        doc.text(data, x + 10, y + 10); // Draw cell content
        x += colWidth;
      });

      // Update totals
      if (startDate === endDate) {
        total.totalProductSold += item.productsSold;
        total.allTotalSales += item.totalSales;
        total.totalDiscount += item.discount;
        total.totalNetSales += item.netSales;
      } else {
        total.totalProductSold += item.productsSold;
        total.allTotalSales += item.totalSales;
        total.totalDiscount += item.discounts;
        total.totalNoOfOrders += item.numberOfOrders;
        total.totalNetSales += item.netSales;
      }
    });

    // Draw total row
    const totalRowY = tableTop + rowHeight + (result.length + 1) * rowHeight;
    const totalRowData = startDate === endDate ? [
      "Total",
      '',
      total.totalProductSold,
      `${total.allTotalSales.toFixed(2)}`,
      `${total.totalDiscount.toFixed(2)}`,
      `${total.totalNetSales.toFixed(2)}`,
    ] : [
      "Total",
      total.totalNoOfOrders,
      total.totalProductSold,
      `${total.allTotalSales.toFixed(2)}`,
      `${total.totalDiscount.toFixed(2)}`,
      `${total.totalNetSales.toFixed(2)}`,
    ];

    let totalX = 30;
    totalRowData.forEach((data, i) => {
      const colWidth = headers[i].width;
      doc.rect(totalX, totalRowY, colWidth, rowHeight).stroke(); // Draw cell border
      doc.text(data, totalX + 10, totalRowY + 10); // Draw total cell content
      totalX += colWidth;
    });

    doc.end(); // Finalize the PDF document
  } catch (error) {
    res.status(500).json({message: 'Internal Server Error'});
  }
};

const reportDownloadExcel = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let result;
    
    if (startDate === endDate) {
      result = await salesreportOfDay(startDate);
    } else {
      result = await salesreportOfMonth(startDate, endDate);
    }
    const workbook = new excelJS.Workbook();
    const worksheet = workbook.addWorksheet(`Sales ${startDate} - ${endDate}`); // New Worksheet

    // Column for data in excel. key must match data key
    
    worksheet.columns = startDate === endDate ? [
      { header: "Order ID", key: "orderId", width: 25 }, 
      { header: "Name", key: "customerName", width: 15 },
      { header: "Products Sold", key: "productsSold", width: 15 },
      { header: "Total Sales", key: "totalSales", width: 15 },
      { header: "Discounts", key: "discount", width: 15 },
      { header: "Net Sales", key: "netSales", width: 15 },
  ] : [
    { header: "Date", key: "date", width: 15 }, 
    { header: "Orders", key: "numberOfOrders", width: 15 },
    { header: "Products Sold", key: "productsSold", width: 15 },
    { header: "Total Sales", key: "totalSales", width: 15 },
    { header: "Discounts", key: "discounts", width: 15 },
    { header: "Net Sales", key: "netSales", width: 15 },
];
  let total = startDate === endDate ? {
    orderId: 'Total',
    customerName: '',
    productsSold: 0,
    totalSales: 0,
    discount: 0,
    netSales: 0,
  } : {
    date: 'Total',
    numberOfOrders: 0,
    productsSold: 0,
    totalSales: 0,
    discounts: 0,
    netSales: 0,
  };
  result.forEach((data) => {
    if (startDate === endDate) {
      total.productsSold += data.productsSold;
      total.totalSales += data.totalSales;
      total.discount += data.discount;
      total.netSales += data.netSales;
    } else {
      total.productsSold += data.productsSold;
      total.totalSales += data.totalSales;
      total.discounts += data.discounts;
      total.numberOfOrders += data.numberOfOrders;
      total.netSales += data.netSales;
    }
  })

  
  // Looping through User data
  result.forEach((data) => {
    worksheet.addRow(data); // Add data in worksheet
  });

 
  const totalRow = worksheet.addRow(total);

  // Making first line in excel bold
  worksheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true };
  });
   // Style the total row
   totalRow.eachCell((cell) => {
    cell.font = { bold: true };
  });
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="users.xlsx"`
  );
  await workbook.xlsx.write(res);
  res.status(200).end();
  } catch (error) {
    res.status(500).json({message: 'Internal Server Error'});
  }
}



module.exports = {
  loadLogin,
  login,
  loadDashboard,
  pageError,
  logout,
  salesReport,
  salesReportbyDate,
  monthChart,
  yearChart,
  topProducts,
  topCategoreis,
  reportDownloadPdf,
  reportDownloadExcel
}