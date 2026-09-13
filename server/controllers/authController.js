const User = require('../models/User');
const { generateToken, sendTokenCookie } = require('../utils/generateToken');

// POST /api/auth/signup
exports.signup = async (req, res, next) => {
  try {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required.' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }

    const passwordHash = await User.hashPassword(password);
    const user = await User.create({ name, email, phone, passwordHash });

    const token = generateToken(user._id, user.role);
    sendTokenCookie(res, token);

    res.status(201).json({
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/login
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email?.toLowerCase() });

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const token = generateToken(user._id, user.role);
    sendTokenCookie(res, token);

    res.json({
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/logout
exports.logout = (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
  });
  res.json({ message: 'Logged out.' });
};

// GET /api/auth/me
exports.getMe = async (req, res) => {
  res.json({ user: req.user });
};

// PATCH /api/auth/profile  { name?, phone?, avatarUrl? }
exports.updateProfile = async (req, res, next) => {
  try {
    const { name, phone, avatarUrl } = req.body;
    const user = await User.findById(req.user._id);
    if (name !== undefined) user.name = name.trim();
    if (phone !== undefined) user.phone = phone.trim();
    if (avatarUrl !== undefined) user.avatarUrl = avatarUrl.trim();
    await user.save();
    res.json({ user: await User.findById(user._id).select('-passwordHash') });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/auth/password  { currentPassword, newPassword }
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new password are required.' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters.' });
    }
    const user = await User.findById(req.user._id);
    if (!(await user.comparePassword(currentPassword))) {
      return res.status(401).json({ message: 'Current password is incorrect.' });
    }
    user.passwordHash = await User.hashPassword(newPassword);
    await user.save();
    res.json({ message: 'Password updated.' });
  } catch (err) {
    next(err);
  }
};

// GET /api/auth/addresses
exports.getAddresses = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('addresses');
    res.json({ addresses: user.addresses });
  } catch (err) {
    next(err);
  }
};

const MAX_SAVED_ADDRESSES = 2;

// POST /api/auth/addresses  { label, address, isDefault }
exports.addAddress = async (req, res, next) => {
  try {
    const { label, address, isDefault } = req.body;
    if (!address || address.trim().split(/\s+/).filter(Boolean).length < 4) {
      return res.status(400).json({ message: 'Please enter a full address of at least 4 words (street/house, area, city).' });
    }
    const user = await User.findById(req.user._id);
    if (user.addresses.length >= MAX_SAVED_ADDRESSES) {
      return res.status(400).json({ message: `You can save up to ${MAX_SAVED_ADDRESSES} addresses. Delete one before adding another.` });
    }
    if (isDefault) user.addresses.forEach((a) => { a.isDefault = false; });
    user.addresses.push({ label: label || 'Home', address: address.trim(), isDefault: Boolean(isDefault) || user.addresses.length === 0 });
    await user.save();
    res.status(201).json({ addresses: user.addresses });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/auth/addresses/:addressId  { label?, address?, isDefault? }
exports.updateAddress = async (req, res, next) => {
  try {
    const { label, address, isDefault } = req.body;
    if (address !== undefined && address.trim().split(/\s+/).filter(Boolean).length < 4) {
      return res.status(400).json({ message: 'Please enter a full address of at least 4 words (street/house, area, city).' });
    }
    const user = await User.findById(req.user._id);
    const entry = user.addresses.id(req.params.addressId);
    if (!entry) return res.status(404).json({ message: 'Address not found.' });

    if (label !== undefined) entry.label = label.trim() || 'Home';
    if (address !== undefined) entry.address = address.trim();
    if (isDefault) {
      user.addresses.forEach((a) => { a.isDefault = false; });
      entry.isDefault = true;
    }
    await user.save();
    res.json({ addresses: user.addresses });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/auth/addresses/:addressId
exports.deleteAddress = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    const wasDefault = user.addresses.find((a) => String(a._id) === req.params.addressId)?.isDefault;
    user.addresses = user.addresses.filter((a) => String(a._id) !== req.params.addressId);
    // If we just removed the default address, promote whichever is left so
    // there's always a sensible default for checkout to preselect.
    if (wasDefault && user.addresses.length) user.addresses[0].isDefault = true;
    await user.save();
    res.json({ addresses: user.addresses });
  } catch (err) {
    next(err);
  }
};
