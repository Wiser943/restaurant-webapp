const ContactInfo = require('../models/ContactInfo');

// GET /api/contact-info (public) - shown on the support page as a fallback
// for customers who'd rather call/WhatsApp/email than chat.
exports.getContactInfo = async (req, res, next) => {
  try {
    const info = await ContactInfo.findOne().sort({ createdAt: -1 });
    if (!info) {
      return res.status(404).json({ message: 'Contact details have not been set up yet.' });
    }
    res.json({ contactInfo: info });
  } catch (err) {
    next(err);
  }
};

// PUT /api/admin/contact-info (admin only) - creates or updates the single record
exports.updateContactInfo = async (req, res, next) => {
  try {
    const { phone, whatsapp, email, address, hours } = req.body;
    let info = await ContactInfo.findOne();

    if (!info) {
      info = new ContactInfo({ phone, whatsapp, email, address, hours });
    } else {
      Object.assign(info, { phone, whatsapp, email, address, hours });
    }

    await info.save();
    res.json({ contactInfo: info });
  } catch (err) {
    next(err);
  }
};
