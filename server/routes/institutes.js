const express = require('express');
const router = express.Router();
const Institute = require('../models');
const jwt = require('jsonwebtoken');

// Middleware to verify token
const auth = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'No token provided' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// Get institute profile
router.get('/profile', auth, async (req, res) => {
  try {
    const institute = await Institute.findOne({ owner: req.user.id });
    if (!institute) return res.status(404).json({ message: 'Institute not found' });
    res.json(institute);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Update institute profile
router.put('/profile', auth, async (req, res) => {
  const { name, facilities, sportsOffered, fees, images } = req.body;
  try {
    let institute = await Institute.findOne({ owner: req.user.id });
    if (!institute) {
      institute = new Institute({ owner: req.user.id, name, facilities, sportsOffered, fees, images });
    } else {
      institute.name = name || institute.name;
      institute.facilities = facilities || institute.facilities;
      institute.sportsOffered = sportsOffered || institute.sportsOffered;
      institute.fees = fees || institute.fees;
      institute.images = images || institute.images;
    }
    await institute.save();
    res.json(institute);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;