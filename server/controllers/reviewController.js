const Review = require('../models/Review');
const Order = require('../models/Order');
const MenuItem = require('../models/MenuItem');

// Recomputes and caches ratingAvg/ratingCount on the menu item itself, so
// GET /api/menu doesn't need to aggregate reviews for every item on every
// page load — only whenever a review is actually added or moderated.
// Hidden reviews are excluded from both the average and the count.
async function recomputeMenuItemRating(menuItemId) {
  const stats = await Review.aggregate([
    { $match: { menuItem: menuItemId, hidden: { $ne: true } } },
    { $group: { _id: '$menuItem', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  const { avg = 0, count = 0 } = stats[0] || {};
  await MenuItem.findByIdAndUpdate(menuItemId, {
    ratingAvg: Math.round(avg * 10) / 10, // one decimal place, e.g. 4.3
    ratingCount: count,
  });
}

// GET /api/reviews/menu/:menuItemId (public)
exports.getMenuItemReviews = async (req, res, next) => {
  try {
    const reviews = await Review.find({ menuItem: req.params.menuItemId, hidden: { $ne: true } }).sort({ createdAt: -1 }).limit(50);
    const item = await MenuItem.findById(req.params.menuItemId).select('ratingAvg ratingCount');
    res.json({
      reviews,
      ratingAvg: item?.ratingAvg || 0,
      ratingCount: item?.ratingCount || 0,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/reviews/can-review/:menuItemId (logged in)
// Tells the item page whether to show a "leave a review" form: true only if
// the customer has a completed order containing this item that they haven't
// already reviewed.
exports.canReview = async (req, res, next) => {
  try {
    const orders = await Order.find({
      user: req.user._id,
      orderStatus: 'completed',
      'items.menuItem': req.params.menuItemId,
    }).select('_id').sort({ createdAt: -1 });

    if (!orders.length) return res.json({ canReview: false });

    const reviewedOrderIds = new Set(
      (await Review.find({
        menuItem: req.params.menuItemId,
        user: req.user._id,
        order: { $in: orders.map((o) => o._id) },
      }).select('order')).map((r) => r.order.toString())
    );

    const nextOrder = orders.find((o) => !reviewedOrderIds.has(o._id.toString()));
    res.json({ canReview: !!nextOrder, orderId: nextOrder?._id || null });
  } catch (err) {
    next(err);
  }
};

// POST /api/reviews  { menuItemId, orderId, rating, comment? }
exports.createReview = async (req, res, next) => {
  try {
    const { menuItemId, orderId, rating, comment } = req.body;

    const ratingNum = Number(rating);
    if (!menuItemId || !orderId || !ratingNum || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ message: 'A menu item, order, and a rating from 1 to 5 are required.' });
    }

    const order = await Order.findById(orderId);
    if (!order || order.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'That order does not belong to you.' });
    }
    if (order.orderStatus !== 'completed') {
      return res.status(400).json({ message: 'You can only review items from a delivered order.' });
    }
    if (!order.items.some((i) => i.menuItem.toString() === menuItemId)) {
      return res.status(400).json({ message: 'That item was not part of this order.' });
    }

    const existing = await Review.findOne({ menuItem: menuItemId, order: orderId, user: req.user._id });
    if (existing) {
      return res.status(409).json({ message: "You've already reviewed this item for this order." });
    }

    const review = await Review.create({
      menuItem: menuItemId,
      order: orderId,
      user: req.user._id,
      userName: req.user.name,
      rating: ratingNum,
      comment: (comment || '').trim().slice(0, 500),
    });

    await recomputeMenuItemRating(review.menuItem);

    res.status(201).json({ review });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "You've already reviewed this item for this order." });
    }
    next(err);
  }
};

// --- Admin moderation ---

// GET /api/admin/reviews?menuItemId=&hidden=
exports.getAllReviewsForAdmin = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.menuItemId) filter.menuItem = req.query.menuItemId;
    if (req.query.hidden === 'true') filter.hidden = true;
    if (req.query.hidden === 'false') filter.hidden = { $ne: true };

    const reviews = await Review.find(filter).populate('menuItem', 'name').sort({ createdAt: -1 }).limit(200);
    res.json({ reviews });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/reviews/:id  { hidden: true|false }
exports.setReviewHidden = async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ message: 'Review not found.' });

    review.hidden = !!req.body.hidden;
    await review.save();
    await recomputeMenuItemRating(review.menuItem);

    res.json({ review });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/admin/reviews/:id
exports.deleteReview = async (req, res, next) => {
  try {
    const review = await Review.findByIdAndDelete(req.params.id);
    if (!review) return res.status(404).json({ message: 'Review not found.' });
    await recomputeMenuItemRating(review.menuItem);
    res.json({ message: 'Review deleted.' });
  } catch (err) {
    next(err);
  }
};
