// middleware/auth.js
const jwt = require('jsonwebtoken');
const { User } = require('../models/index'); // Match the import from your auth routes

module.exports = async (req, res, next) => {
  const authHeader = req.header('Authorization');
  if (!authHeader) {
    console.log('No Authorization header');
    return res.status(401).json({ message: 'No token, authorization denied' });
  }

  const token = authHeader.replace('Bearer ', '');
  if (!token) {
    console.log('Malformed Authorization header');
    return res.status(401).json({ message: 'Invalid token format' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    console.log('Decoded token:', decoded);

    const currentTime = Math.floor(Date.now() / 1000);
    if (decoded.exp < currentTime) {
      console.log('Token expired:', decoded.exp, 'vs', currentTime);
      return res.status(401).json({ message: 'Token has expired' });
    }

    if (typeof User.findById !== 'function') {
      console.error('User model issue:', User);
      throw new Error('User model is not properly defined');
    }

    req.user = await User.findById(decoded.id).select('-password');
    if (!req.user) {
      console.log('User not found for ID:', decoded.id);
      return res.status(401).json({ message: 'User not found' });
    }
    console.log('Authenticated user:', req.user);
    next();
  } catch (err) {
    console.error('Auth error:', err.message);
    return res.status(401).json({ message: 'Token is not valid', error: err.message });
  }
};