const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Requires a valid logged-in user. Reads the token from the httpOnly
 * cookie (falls back to Authorization header for API/testing use).
 */
async function protect(req, res, next) {
  try {
    let token = req.cookies?.token;

    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ message: 'Not authenticated. Please log in.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-passwordHash');

    if (!user) {
      return res.status(401).json({ message: 'User no longer exists.' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired session.' });
  }
}

/**
 * Requires the logged-in user to be an admin. Use after `protect`.
 */
function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required.' });
  }
  next();
}

/**
 * Requires the logged-in user to be a delivery supplier. Use after `protect`.
 */
function supplierOnly(req, res, next) {
  if (req.user?.role !== 'supplier') {
    return res.status(403).json({ message: 'Supplier access required.' });
  }
  next();
}

module.exports = { protect, adminOnly, supplierOnly };
