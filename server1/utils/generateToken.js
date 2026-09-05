const jwt = require('jsonwebtoken');

function generateToken(userId, role) {
  return jwt.sign({ id: userId, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

/**
 * Sends the JWT as an httpOnly cookie. This is what makes auth work
 * cleanly whether the client is a browser tab or a Capacitor-wrapped
 * mobile WebView - no localStorage juggling needed.
 */
function sendTokenCookie(res, token) {
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
   secure: true, // Required when sameSite is 'none'
    sameSite: 'none', // Allows cross-domain cookie sending from Netlify to Vercel
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
}

module.exports = { generateToken, sendTokenCookie };
