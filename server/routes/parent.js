const mongoose = require('mongoose');
const express = require('express');
const auth = require('../middleware/auth');
const router = express.Router();
const axios = require('axios');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const sendEmail = require('../utils/sendEmail'); // Import the email utility

const {
  Enrollment,
  Attendance,
  Progress,
  ChatMessage,
  Notification,
  Review,
  TrainingMaterial,
  Institute,
  Program,
  Coach,
  ProgramSchedule,
  User,
  EventEnrollment,
  Event
} = require('../models');

// Multer setup for image upload (unchanged)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage });

// Helper function to send notification email
const sendNotificationEmail = async (userId, notification) => {
  try {
    const user = await User.findById(userId).select('email');
    if (!user || !user.email) {
      console.log('User or email not found for ID:', userId);
      return;
    }
    const subject = `New Notification: ${notification.type.toUpperCase()}`;
    const text = `${notification.message}\n\nDetails: ${notification.details || 'None'}`;
    await sendEmail(user.email, subject, text);
  } catch (err) {
    console.error('Failed to send notification email:', err.message);
  }
};

// Get all institutes (unchanged)
router.get('/institutes', auth, async (req, res) => {
  console.log('Entering GET /institutes');
  try {
    console.log('Extracting query params:', req.query);
    const { location, sport, cost, rating } = req.query;
    console.log('Query params parsed - location:', location, 'sport:', sport, 'cost:', cost, 'rating:', rating);
    let query = {};
    console.log('Initial query object:', query);
    if (location) {
      query.address = new RegExp(location, 'i');
      console.log('Added location to query:', query);
    }
    if (sport) {
      query.sportsOffered = new RegExp(sport, 'i');
      console.log('Added sport to query:', query);
    }
    console.log('Executing Institute.find with query:', query);
    const institutes = await Institute.find(query);
    console.log('Institutes fetched:', institutes.length, 'items');
    res.json(institutes);
    console.log('Response sent with institutes');
  } catch (err) {
    console.error('Error in GET /institutes:', err.message, err.stack);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Get programs by institute (unchanged)
router.get('/programs/:instituteId', auth, async (req, res) => {
  console.log('Entering GET /programs/:instituteId');
  try {
    console.log('Params:', req.params);
    const programs = await Program.find({ institute: req.params.instituteId })
      .populate({
        path: 'assignedPrograms.coach',
        select: 'name experience achievements qualification user'
      })
      .populate('institute', 'name address staff facilities');
    console.log('Programs fetched:', programs.length, 'items');
    res.json(programs);
    console.log('Response sent with programs');
  } catch (err) {
    console.error('Error in GET /programs/:instituteId:', err.message, err.stack);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Enroll child in a program
router.post('/enroll', auth, async (req, res) => {
  console.log('Entering POST /enroll');
  const { childName, programId } = req.body;
  try {
    console.log('Request body:', { childName, programId });
    const program = await Program.findById(programId);
    if (!program) {
      console.log('Program not found:', programId);
      return res.status(404).json({ message: 'Program not found' });
    }
    const enrollment = new Enrollment({
      parent: req.user.id,
      childName,
      program: programId,
      institute: program.institute,
      status: 'pending',
      paymentStatus: 'pending'
    });
    await enrollment.save();
    console.log('Enrollment created:', enrollment);
    const notification = new Notification({
      user: req.user.id,
      type: 'enrollment',
      message: `Enrollment request for ${childName} in ${program.name} submitted`,
      details: 'Pending payment'
    });
    await notification.save();
    await sendNotificationEmail(req.user.id, notification); // Send email
    res.status(201).json(enrollment);
    console.log('Response sent with enrollment');
  } catch (err) {
    console.error('Error in POST /enroll:', err.message, err.stack);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Process fake payment (unchanged)
router.post('/payment', auth, async (req, res) => {
  console.log('Entering POST /payment');
  const { enrollmentId, amount, paymentToken } = req.body;
  try {
    console.log('Request body:', { enrollmentId, amount, paymentToken });
    const enrollment = await Enrollment.findById(enrollmentId).populate('program');
    if (!enrollment || enrollment.parent.toString() !== req.user.id) {
      console.log('Unauthorized or enrollment not found:', enrollmentId);
      return res.status(403).json({ message: 'Unauthorized' });
    }
    console.log('Simulating Khalti payment with token:', paymentToken);
    if (!paymentToken || paymentToken !== 'fake-khalti-token') {
      console.log('Payment failed: Invalid token');
      return res.status(400).json({ message: 'Payment failed: Invalid token' });
    }
    if (amount !== enrollment.program.pricing) {
      console.log('Payment amount mismatch:', amount, 'vs', enrollment.program.pricing);
      return res.status(400).json({ message: 'Payment amount mismatch' });
    }
    enrollment.paymentStatus = 'completed';
    enrollment.status = 'approved';
    await enrollment.save();
    console.log('Enrollment updated:', enrollment);
    const notification = new Notification({
      user: req.user.id,
      type: 'payment',
      message: `Payment of NPR ${amount} for ${enrollment.childName} in ${enrollment.program.name} completed`,
      details: 'Enrollment approved'
    });
    await notification.save();
    await sendNotificationEmail(req.user.id, notification); // Send email
    res.json({ message: 'Payment successful', enrollment });
    console.log('Response sent with payment confirmation');
  } catch (err) {
    console.error('Error in POST /payment:', err.message, err.stack);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Get enrollments (unchanged)
router.get('/enrollments', auth, async (req, res) => {
  try {
    const enrollments = await Enrollment.find({ parent: req.user.id })
      .populate({
        path: 'program',
        populate: {
          path: 'assignedPrograms.coach',
          select: 'name qualification experience achievements user image'
        }
      })
      .populate('institute');
    const filteredEnrollments = enrollments.filter(e => e.program !== null);
    if (!filteredEnrollments.length) {
      console.log('No valid enrollments found for parent:', req.user.id);
    }
    res.json(filteredEnrollments);
  } catch (err) {
    console.error('Error in GET /enrollments:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Get attendance (unchanged)
router.get('/attendance/:enrollmentId', auth, async (req, res) => {
  console.log('Entering GET /attendance/:enrollmentId');
  try {
    console.log('Params:', req.params);
    const enrollment = await Enrollment.findById(req.params.enrollmentId);
    if (!enrollment || enrollment.parent.toString() !== req.user.id) {
      console.log('Unauthorized:', req.params.enrollmentId);
      return res.status(403).json({ message: 'Unauthorized' });
    }
    const attendance = await Attendance.find({ enrollment: req.params.enrollmentId });
    console.log('Attendance fetched:', attendance.length, 'items');
    res.json(attendance);
    console.log('Response sent with attendance');
  } catch (err) {
    console.error('Error in GET /attendance/:enrollmentId:', err.message, err.stack);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Get progress (unchanged)
router.get('/progress/:enrollmentId', auth, async (req, res) => {
  console.log('Entering GET /progress/:enrollmentId');
  try {
    console.log('Params:', req.params);
    const enrollment = await Enrollment.findById(req.params.enrollmentId);
    if (!enrollment || enrollment.parent.toString() !== req.user.id) {
      console.log('Unauthorized:', req.params.enrollmentId);
      return res.status(403).json({ message: 'Unauthorized' });
    }
    const progress = await Progress.find({ enrollment: req.params.enrollmentId }).populate('coach');
    console.log('Progress fetched:', progress.length, 'items');
    res.json(progress);
    console.log('Response sent with progress');
  } catch (err) {
    console.error('Error in GET /progress/:enrollmentId:', err.message, err.stack);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Get notifications (unchanged)
router.get('/notifications', auth, async (req, res) => {
  console.log('Entering GET /notifications');
  try {
    console.log('Fetching notifications for user:', req.user.id);
    const notifications = await Notification.find({ user: req.user.id }).sort({ createdAt: -1 });
    console.log('Notifications fetched:', notifications.length, 'items');
    res.json(notifications);
    console.log('Response sent with notifications');
  } catch (err) {
    console.error('Error in GET /notifications:', err.message, err.stack);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Get owner user (unchanged)
router.get('/owner', auth, async (req, res) => {
  console.log('Entering GET /owner');
  try {
    const owner = await User.findOne({ role: 'owner' });
    if (!owner) {
      console.log('Owner not found');
      return res.status(404).json({ message: 'Owner not found' });
    }
    console.log('Owner fetched:', owner._id);
    res.json(owner);
    console.log('Response sent with owner');
  } catch (err) {
    console.error('Error in GET /owner:', err.message, err.stack);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Send chat message (unchanged)
router.post('/chat-message', auth, async (req, res) => {
  const { receiverId, content, enrollmentId } = req.body;
  try {
    if (req.user.role !== 'parent') {
      return res.status(403).json({ message: 'Access denied: Parent role required' });
    }
    if (!receiverId || !content) {
      return res.status(400).json({ message: 'Receiver ID and content are required' });
    }
    const receiver = await User.findById(receiverId);
    if (!receiver || receiver.role !== 'coach') {
      return res.status(404).json({ message: 'Receiver not found or not a coach' });
    }
    const message = new ChatMessage({
      sender: req.user.id,
      receiver: receiverId,
      content,
      enrollment: enrollmentId || null
    });
    await message.save();
    console.log('Parent message saved:', message);
    res.status(201).json(message);
  } catch (err) {
    console.error('Error sending parent message:', err.message, err.stack);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Fetch chat messages (unchanged)
router.get('/chat-messages', auth, async (req, res) => {
  try {
    if (req.user.role !== 'parent') {
      return res.status(403).json({ message: 'Access denied: Parent role required' });
    }
    const messages = await ChatMessage.find({
      $or: [{ sender: req.user.id }, { receiver: req.user.id }]
    })
      .populate('sender', 'name email role')
      .populate('receiver', 'name email role')
      .populate('enrollment', 'childName program')
      .sort({ createdAt: 1 });
    console.log('Parent messages fetched:', messages);
    res.json(messages);
  } catch (err) {
    console.error('Error fetching parent messages:', err.message, err.stack);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Get training materials (unchanged)
router.get('/materials/:programId', auth, async (req, res) => {
  console.log('Entering GET /materials/:programId');
  try {
    console.log('Params:', req.params);
    const enrollment = await Enrollment.findOne({
      parent: req.user.id,
      program: req.params.programId
    });
    if (!enrollment) {
      console.log('No enrollment found for parent:', req.user.id, 'and program:', req.params.programId);
      return res.status(403).json({ message: 'Unauthorized: No enrollment found for this program' });
    }
    const materials = await TrainingMaterial.find({ program: req.params.programId }).populate('coach');
    console.log('Materials fetched:', materials.length, 'items');
    const response = {
      materials,
      paymentStatus: enrollment.paymentStatus
    };
    res.json(response);
    console.log('Response sent with materials and payment status');
  } catch (err) {
    console.error('Error in GET /materials/:programId:', err.message, err.stack);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Post review (unchanged)
router.post('/reviews', auth, async (req, res) => {
  try {
    console.log('Entering POST /reviews');
    const { instituteId, coachId, programId, rating, comment } = req.body;
    if (!instituteId || !coachId || !programId || !rating || !comment) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'Unauthorized: Please login' });
    }
    const review = new Review({
      parent: req.user.id,
      institute: instituteId,
      coach: coachId,
      program: programId,
      rating: Number(rating),
      comment: comment.trim()
    });
    await review.save();
    console.log('Review saved:', review);
    res.status(201).json(review);
  } catch (err) {
    console.error('Error in POST /reviews:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Get reviews (unchanged)
router.get('/reviews/:programId', auth, async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const programId = req.params.programId;
    if (!mongoose.Types.ObjectId.isValid(programId)) {
      return res.status(400).json({ message: 'Invalid program ID' });
    }
    const programExists = await Program.exists({ _id: programId });
    if (!programExists) {
      return res.status(404).json({ message: 'Program not found' });
    }
    const reviews = await Review.find({
      program: programId,
      parent: req.user.id
    })
      .populate('coach institute program')
      .lean();
    res.json(reviews);
  } catch (err) {
    console.error('Error fetching reviews:', err);
    res.status(500).json({
      message: 'Server error while fetching reviews',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Get calendar events (unchanged)
router.get('/calendar-events', auth, async (req, res) => {
  console.log('Entering GET /calendar-events');
  try {
    if (!req.user?.id) {
      console.log('No user found in request');
      return res.status(401).json({ message: 'Unauthorized: No user found' });
    }
    const enrollments = await Enrollment.find({ parent: req.user.id }).select('program');
    if (!enrollments.length) {
      console.log('No enrollments found for parent:', req.user.id);
      return res.json([]);
    }
    const programIds = enrollments.map(e => e.program).filter(Boolean);
    if (!programIds.length) {
      console.log('No valid program IDs found');
      return res.json([]);
    }
    const programSchedules = await ProgramSchedule.find({ program: { $in: programIds } })
      .populate('program', 'name')
      .populate('coach', 'name');
    const events = programSchedules.flatMap(ps => {
      if (!ps.program) {
        console.warn('ProgramSchedule missing program reference:', ps._id);
        return [];
      }
      if (!Array.isArray(ps.schedule)) {
        console.warn('Invalid schedule array for ProgramSchedule:', ps._id);
        return [];
      }
      return ps.schedule.map((s, index) => {
        const start = new Date(s.date);
        if (isNaN(start.getTime())) {
          console.warn('Invalid date in schedule:', s.date, 'for ProgramSchedule:', ps._id);
          return null;
        }
        const durationMs = (ps.duration || 2) * 60 * 60 * 1000;
        const end = new Date(start.getTime() + durationMs);
        return {
          id: `${ps._id}-${index}`,
          title: `${ps.program.name || 'Unknown Program'} - ${s.activity || 'Training'}`,
          start,
          end,
          type: 'coach-schedule',
          programId: ps.program._id,
          programName: ps.program.name || 'Unknown Program',
          coachName: ps.coach?.name || 'Unknown Coach',
          time: s.time || 'TBD',
          activity: s.activity || 'Training',
          color: '#38a169'
        };
      }).filter(event => event !== null);
    });
    const currentDate = new Date();
    const upcomingEvents = events.filter(event => event.end > currentDate);
    console.log('Calendar events generated:', upcomingEvents.length);
    res.json(upcomingEvents);
  } catch (err) {
    console.error('Error in GET /calendar-events:', err.message, err.stack);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Initiate Payment and Update Status Immediately
router.post('/initiate-payment', auth, async (req, res) => {
  console.log('Entering POST /initiate-payment');
  const { enrollmentId, amount } = req.body;

  try {
    console.log('Request body:', { enrollmentId, amount });
    const enrollment = await Enrollment.findById(enrollmentId).populate('program');
    if (!enrollment || enrollment.parent.toString() !== req.user.id) {
      console.log('Enrollment not found or not authorized:', enrollmentId);
      return res.status(404).json({ message: 'Enrollment not found or not authorized' });
    }
    if (enrollment.paymentStatus !== 'pending') {
      console.log('Payment already completed or invalid for enrollment:', enrollmentId);
      return res.status(400).json({ message: 'Payment already completed or invalid' });
    }
    if (!enrollment.program || !enrollment.program.name) {
      console.log('Program data missing for enrollment:', enrollmentId);
      return res.status(400).json({ message: 'Program details missing for this enrollment' });
    }

    // Update paymentStatus to "completed" immediately for college project
    console.log('Updating payment status to completed for enrollment:', enrollmentId);
    enrollment.paymentStatus = 'completed';
    enrollment.paymentToken = `khalti-dummy-${Date.now()}`; // Dummy token
    await enrollment.save({ validateBeforeSave: true });
    console.log('Enrollment updated:', enrollment);

    // Create a notification
    const notification = new Notification({
      user: req.user.id,
      type: 'payment',
      message: `Payment of NPR ${amount} for ${enrollment.childName} in ${enrollment.program.name} completed`,
      details: 'Enrollment approved'
    });
    await notification.save();
    await sendNotificationEmail(req.user.id, notification); // Send email
    console.log('Notification created:', notification);

    // Khalti payload (still send to Khalti for payment experience)
    const returnUrl = `http://localhost:1000/api/parent/payment-success`;
    const amountInPaisa = amount * 100;
    const payload = {
      return_url: returnUrl,
      website_url: 'http://localhost:3000',
      amount: amountInPaisa,
      purchase_order_id: `Enrollment_${enrollmentId}`,
      purchase_order_name: enrollment.program.name,
      customer_info: {
        name: enrollment.childName,
        email: req.user.email || 'default@example.com',
        phone: req.user.phone || '9800000000'
      }
    };
    console.log('Khalti payload:', payload);

    const khaltiResponse = await axios.post(
      'https://dev.khalti.com/api/v2/epayment/initiate/',
      payload,
      {
        headers: {
          'Authorization': 'key dd058e04b9f04493993dcc5e8c31d5c2',
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('Khalti response:', khaltiResponse.data);

    // Respond with Khalti payment URL
    res.json({ paymentUrl: khaltiResponse.data.payment_url });
  } catch (err) {
    console.error('Initiate payment error:', err.response?.data || err.message);
    res.status(500).json({ message: 'Failed to initiate payment', error: err.message });
  }
});

// Payment Success (unchanged)
router.get('/payment-success', async (req, res) => {
  console.log('Entering GET /payment-success');
  const { pidx, txnId, amount, purchase_order_id } = req.query;

  try {
    console.log('Query params received:', { pidx, txnId, amount, purchase_order_id });
    if (!purchase_order_id) {
      console.log('Missing purchase_order_id');
      return res.redirect('http://localhost:3000/parent?payment=error&tab=enrollments');
    }

    const enrollmentId = purchase_order_id.replace('Enrollment_', '');
    console.log('Extracted enrollmentId:', enrollmentId);

    const enrollment = await Enrollment.findById(enrollmentId);
    if (!enrollment) {
      console.log('Enrollment not found:', enrollmentId);
      return res.redirect(`http://localhost:3000/parent?enrollmentId=${enrollmentId}&payment=error&tab=enrollments`);
    }

    // No need to update database here; just redirect
    console.log('Redirecting to ParentPanel with success');
    res.redirect(`http://localhost:3000/parent?enrollmentId=${enrollmentId}&payment=success&tab=enrollments`);
  } catch (err) {
    console.error('Payment success error:', err.message);
    res.redirect(`http://localhost:3000/parent?enrollmentId=${enrollmentId}&payment=error&tab=enrollments`);
  }
});

// Get all upcoming events (unchanged)
router.get('/events', auth, async (req, res) => {
  console.log('Entering GET /events');
  try {
    const events = await Event.find({ status: 'upcoming' })
      .populate('institute', 'name address')
      .sort({ date: 1 }); // Sort by date ascending
    console.log('Events fetched:', events.length, 'items');
    res.json(events);
  } catch (err) {
    console.error('Error in GET /events:', err.message, err.stack);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Enroll in an event
router.post('/event-enroll', auth, async (req, res) => {
  console.log('Entering POST /event-enroll');
  const { eventId, name, contactNumber, age } = req.body;
  try {
    console.log('Request body:', { eventId, name, contactNumber, age });
    const event = await Event.findById(eventId);
    if (!event) {
      console.log('Event not found:', eventId);
      return res.status(404).json({ message: 'Event not found' });
    }
    if (event.status !== 'upcoming') {
      console.log('Event is not upcoming:', eventId);
      return res.status(400).json({ message: 'Cannot enroll in a completed event' });
    }
    const eventEnrollment = new EventEnrollment({
      parent: req.user.id,
      event: eventId,
      name,
      contactNumber,
      age,
      status: 'pending'
    });
    await eventEnrollment.save();
    console.log('Event enrollment created:', eventEnrollment);

    const notification = new Notification({
      user: req.user.id,
      type: 'event_enrollment',
      message: `Enrollment request for ${name} in ${event.name} submitted`,
      details: 'Pending approval'
    });
    await notification.save();
    await sendNotificationEmail(req.user.id, notification); // Send email
    console.log('Notification created:', notification);

    res.status(201).json(eventEnrollment);
    console.log('Response sent with event enrollment');
  } catch (err) {
    console.error('Error in POST /event-enroll:', err.message, err.stack);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Get parent profile (unchanged)
router.get('/profile', auth, async (req, res) => {
  console.log('Entering GET /profile');
  try {
    const user = await User.findById(req.user.id).select('-password'); // Exclude password
    if (!user) {
      console.log('User not found:', req.user.id);
      return res.status(404).json({ message: 'User not found' });
    }
    console.log('Profile fetched:', user);
    res.json(user);
  } catch (err) {
    console.error('Error in GET /profile:', err.message, err.stack);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Update parent profile (unchanged)
router.put('/profile', auth, upload.single('image'), async (req, res) => {
  console.log('Entering PUT /profile');
  try {
    const { name, email, username } = req.body;
    const updateData = { name, email, username };
    
    if (req.file) {
      updateData.image = `/uploads/${req.file.filename}`;
      console.log('Image uploaded:', updateData.image);
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      console.log('User not found:', req.user.id);
      return res.status(404).json({ message: 'User not found' });
    }

    console.log('Profile updated:', user);
    res.json(user);
  } catch (err) {
    console.error('Error in PUT /profile:', err.message, err.stack);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;