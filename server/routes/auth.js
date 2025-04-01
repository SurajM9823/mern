const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const nodemailer = require('nodemailer'); // Add this for email sending

// Email configuration (you'll need to configure this with your email service)
const transporter = nodemailer.createTransport({
  service: 'gmail', // or your email service
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Existing signup route remains unchanged
router.post('/signup', async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ message: 'All fields are required' });
  }
  if (!['owner', 'parent'].includes(role)) {
    return res.status(400).json({ message: 'Invalid role - must be "owner" or "parent"' });
  }
  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already exists' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ name, email, password: hashedPassword, role });
    await user.save();
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '1h' });
    res.status(201).json({ token, user: { id: user._id, name, email, role } });
  } catch (err) {
    console.error('Signup Error:', err.message, err.stack);
    res.status(500).json({ message: `Server error during signup: ${err.message}` });
  }
});

// Existing login route remains unchanged
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }
  try {
    const user = await User.findOne({ email });
    if (!user || !await bcrypt.compare(password, user.password)) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '1h' });
    res.json({ token, user: { id: user._id, name: user.name, email, role: user.role } });
  } catch (err) {
    console.error('Login Error:', err.message, err.stack);
    res.status(500).json({ message: `Server error during login: ${err.message}` });
  }
});

// New forgot password routes
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const resetCode = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
    user.resetCode = resetCode;
    user.resetCodeExpires = Date.now() + 3600000; // 1 hour expiration
    await user.save();

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Password Reset Code',
      text: `Your password reset code is: ${resetCode}. It expires in 1 hour.`
    };

    await transporter.sendMail(mailOptions);
    res.json({ message: 'Reset code sent to email' });
  } catch (err) {
    console.error('Forgot Password Error:', err.message, err.stack);
    res.status(500).json({ message: 'Server error during password reset' });
  }
});

router.post('/verify-reset-code', async (req, res) => {
  const { email, code } = req.body;
  try {
    const user = await User.findOne({ 
      email, 
      resetCode: code, 
      resetCodeExpires: { $gt: Date.now() }
    });
    
    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired reset code' });
    }
    res.json({ message: 'Code verified' });
  } catch (err) {
    res.status(500).json({ message: 'Server error during code verification' });
  }
});

router.post('/reset-password', async (req, res) => {
  const { email, code, newPassword } = req.body;
  try {
    const user = await User.findOne({ 
      email, 
      resetCode: code, 
      resetCodeExpires: { $gt: Date.now() }
    });
    
    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired reset code' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetCode = undefined;
    user.resetCodeExpires = undefined;
    await user.save();

    res.json({ message: 'Password reset successful' });
  } catch (err) {
    res.status(500).json({ message: 'Server error during password reset' });
  }
});

module.exports = router;