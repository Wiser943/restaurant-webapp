const Banner = require('../models/Banner');
const { getIO } = require('../config/socket');

// GET /api/banners (public) - only active, non-expired banners, highest priority first
exports.getActiveBanners = async (req, res, next) => {
  try {
    const now = new Date();
    const banners = await Banner.find({
      isActive: true,
      startDate: { $lte: now },
      $or: [{ endDate: null }, { endDate: { $gte: now } }],
    }).sort({ priority: -1 });

    res.json({ banners });
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/banners (admin only)
exports.createBanner = async (req, res, next) => {
  try {
    const banner = await Banner.create(req.body);
    getIO().emit('banner:updated', banner);
    res.status(201).json({ banner });
  } catch (err) {
    next(err);
  }
};

// PUT /api/admin/banners/:id (admin only)
exports.updateBanner = async (req, res, next) => {
  try {
    const banner = await Banner.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!banner) return res.status(404).json({ message: 'Banner not found.' });

    getIO().emit('banner:updated', banner);
    res.json({ banner });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/admin/banners/:id (admin only)
exports.deleteBanner = async (req, res, next) => {
  try {
    const banner = await Banner.findByIdAndDelete(req.params.id);
    if (!banner) return res.status(404).json({ message: 'Banner not found.' });

    getIO().emit('banner:deleted', { id: banner._id });
    res.json({ message: 'Banner deleted.' });
  } catch (err) {
    next(err);
  }
};
