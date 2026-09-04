const PaymentInfo = require('../models/PaymentInfo');

// GET /api/payment-info (public) - shown at checkout so customers know
// where to transfer to, even before they've logged in to browse.
exports.getPaymentInfo = async (req, res, next) => {
  try {
    const info = await PaymentInfo.findOne().sort({ createdAt: -1 });
    if (!info) {
      return res.status(404).json({ message: 'Payment details have not been set up yet.' });
    }
    res.json({ paymentInfo: info });
  } catch (err) {
    next(err);
  }
};

// PUT /api/admin/payment-info (admin only) - creates or updates the single record
exports.updatePaymentInfo = async (req, res, next) => {
  try {
    const { bankName, accountNumber, accountName, instructions } = req.body;
    let info = await PaymentInfo.findOne();

    if (!info) {
      info = new PaymentInfo({ bankName, accountNumber, accountName, instructions });
    } else {
      Object.assign(info, { bankName, accountNumber, accountName, instructions });
    }

    await info.save();
    res.json({ paymentInfo: info });
  } catch (err) {
    next(err);
  }
};
