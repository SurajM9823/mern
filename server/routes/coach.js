const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken'); // Added missing import
const auth = require('../middleware/auth'); // Use imported auth middleware
const { Coach, Program, Enrollment, Progress, Attendance, Message, Notification, TrainingMaterial, Gamification, ProgramSchedule, ChatMessage, User } = require('../models');
const multer = require('multer');
const path = require('path');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // Ensure this folder exists
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

// GET /coach/dashboard
router.get('/dashboard', auth, async (req, res) => {
  try {
    // Role check moved to auth middleware, but we can double-check here if needed
    if (req.user.role !== 'coach') {
      console.log('Role check failed, not coach:', req.user.role);
      return res.status(403).json({ message: 'Access denied: Coach role required' });
    }

    const coach = await Coach.findOne({ user: req.user.id }).populate('assignedPrograms');
    if (!coach) return res.status(404).json({ message: 'Coach not found' });

    const enrollments = await Enrollment.find({ program: { $in: coach.assignedPrograms } })
      .populate('parent', 'name email _id')
      .populate('program', 'name');
    const enrollmentIds = enrollments.map(e => e._id);

    const notifications = await Notification.find({ user: req.user.id, read: false });
    const progress = await Progress.find({ coach: coach._id }).populate('enrollment', 'childName');
    const attendance = await Attendance.find({ enrollment: { $in: enrollmentIds } });
    const materials = await TrainingMaterial.find({ coach: coach._id }).populate('program', 'name');
    const programSchedules = await ProgramSchedule.find({ coach: coach._id }).populate('program', 'name');
    const messages = await Message.find({
      $or: [
        { sender: req.user.id }, // Coach sent
        { receiver: req.user.id }, // Coach received
        { enrollment: { $in: enrollmentIds } } // Messages tied to enrollments
      ]
    }).sort({ createdAt: 1 });
    const rewards = await Gamification.find({
      $or: [
        { coach: coach._id },
        { userId: { $in: enrollments.map(e => e.parent._id) } }
      ]
    });
    const chatMessages = await ChatMessage.find({
      $or: [
        { sender: req.user.id },
        { receiver: req.user.id },
        { enrollment: { $in: enrollmentIds } }
      ]
    })
    .populate('sender', 'name email role')
    .populate('receiver', 'name email role')
    .populate('enrollment', 'childName program')
    .sort({ createdAt: 1 });

    console.log('Messages Fetched for Dashboard:', messages);

    res.json({
      coach,
      enrollments,
      notifications,
      progress,
      attendance,
      materials,
      programSchedules,
      chatMessages,
      rewards
    });
  } catch (err) {
    console.error('Error fetching dashboard data:', err.message, err.stack);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.get('/student/:enrollmentId', auth, async (req, res) => {
  const { enrollmentId } = req.params;
  console.log('Fetching student details for enrollment ID:', enrollmentId);
  try {
    if (req.user.role !== 'coach') {
      return res.status(403).json({ message: 'Access denied: Coach role required' });
    }

    const coach = await Coach.findOne({ user: req.user.id }).populate('assignedPrograms');
    if (!coach) return res.status(404).json({ message: 'Coach not found' });

    const enrollment = await Enrollment.findOne({
      _id: enrollmentId,
      program: { $in: coach.assignedPrograms }
    })
      .populate('parent', 'name email image') // Updated to include 'image'
      .populate('program', 'name sport pricing startDate duration ageGroup schedule description seatsAvailable');
    if (!enrollment) {
      console.log('Enrollment not found or not assigned to this coach');
      return res.status(404).json({ message: 'Enrollment not found' });
    }

    const progress = await Progress.find({ enrollment: enrollmentId }).populate('coach', 'name');
    const attendance = await Attendance.find({ enrollment: enrollmentId });
    const messages = await Message.find({
      $or: [{ sender: req.user.id, enrollment: enrollmentId }, { receiver: req.user.id, enrollment: enrollmentId }]
    }).populate('sender receiver', 'name');
    const notifications = await Notification.find({ user: enrollment.parent._id, enrollment: enrollmentId });
    const gamification = await Gamification.findOne({ userId: enrollment.parent._id });
    const trainingMaterials = await TrainingMaterial.find({ program: enrollment.program._id }).populate('coach', 'name');

    const studentDetails = {
      enrollment,
      progress,
      attendance,
      messages,
      notifications,
      gamification,
      trainingMaterials,
      otherPrograms: await Enrollment.find({
        parent: enrollment.parent._id,
        _id: { $ne: enrollmentId }
      }).populate('program', 'name'),
    };
    console.log('Sending student details:', studentDetails);
    res.json(studentDetails);
  } catch (err) {
    console.error('Error in /student/:enrollmentId route:', err.message, err.stack);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});


// POST /coach/schedule
router.post('/schedule', auth, async (req, res) => {
  const { programId, duration, schedule, startDate } = req.body;
  try {
    if (req.user.role !== 'coach') {
      return res.status(403).json({ message: 'Access denied: Coach role required' });
    }

    const coach = await Coach.findOne({ user: req.user.id });
    if (!coach.assignedPrograms.some(p => p.toString() === programId)) {
      return res.status(403).json({ message: 'Program not assigned to this coach' });
    }

    let programSchedule = await ProgramSchedule.findOne({ program: programId, coach: coach._id });
    if (programSchedule) {
      programSchedule.duration = duration;
      programSchedule.schedule = schedule;
      programSchedule.startDate = startDate || programSchedule.startDate;
      await programSchedule.save();
    } else {
      programSchedule = new ProgramSchedule({
        program: programId,
        coach: coach._id,
        duration,
        schedule,
        startDate: startDate || new Date()
      });
      await programSchedule.save();
    }
    res.status(201).json(programSchedule);
  } catch (err) {
    console.error('Error in /schedule route:', err.message, err.stack);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST /coach/attendance
router.post('/attendance', auth, async (req, res) => {
  const { enrollmentId, date, status } = req.body;
  console.log('Received attendance data:', { enrollmentId, date, status });

  try {
    if (req.user.role !== 'coach') {
      return res.status(403).json({ message: 'Access denied: Coach role required' });
    }

    const enrollment = await Enrollment.findById(enrollmentId).populate('parent');
    if (!enrollment) return res.status(404).json({ message: 'Enrollment not found' });

    const normalizedDate = new Date(date);
    normalizedDate.setUTCHours(0, 0, 0, 0);
    const dayStart = normalizedDate;
    const dayEnd = new Date(normalizedDate);
    dayEnd.setUTCHours(23, 59, 59, 999);

    const existingAttendance = await Attendance.findOne({
      enrollment: enrollmentId,
      date: { $gte: dayStart, $lte: dayEnd }
    });

    if (existingAttendance) {
      return res.status(400).json({ message: 'Attendance already recorded for this date' });
    }

    const attendance = new Attendance({
      enrollment: enrollmentId,
      date: normalizedDate,
      status
    });
    await attendance.save();

    if (status === 'present') {
      await Gamification.updateOne(
        { userId: enrollment.parent._id },
        { $inc: { points: 5 } },
        { upsert: true }
      );
    }

    console.log('Attendance and points updated successfully');
    res.status(201).json(attendance);
  } catch (err) {
    console.error('Error in /attendance route:', err.message, err.stack);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST /coach/progress
router.post('/progress', auth, async (req, res) => {
  const { enrollmentId, date, metrics, notes } = req.body;
  console.log('Received progress data:', { enrollmentId, date, metrics, notes });
  try {
    if (req.user.role !== 'coach') {
      return res.status(403).json({ message: 'Access denied: Coach role required' });
    }

    const coach = await Coach.findOne({ user: req.user.id });
    const progress = new Progress({ enrollment: enrollmentId, coach: coach._id, date, metrics, notes });
    await progress.save();
    console.log('Progress saved successfully');
    res.status(201).json(progress);
  } catch (err) {
    console.error('Error in /progress route:', err.message, err.stack);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.post('/chat-message', auth, async (req, res) => {
  const { receiverId, content, enrollmentId } = req.body;
  try {
    console.log('Incoming request:', { user: req.user, body: req.body });
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication failed: No user found' });
    }
    if (req.user.role !== 'coach') {
      return res.status(403).json({ message: 'Access denied: Coach role required' });
    }
    if (!receiverId || !content) {
      return res.status(400).json({ message: 'Receiver ID and content are required' });
    }

    const receiver = await User.findById(receiverId);
    if (!receiver || receiver.role !== 'parent') {
      return res.status(404).json({ message: 'Receiver not found or not a parent' });
    }

    const messageData = {
      sender: req.user.id,
      receiver: receiverId,
      content
    };
    if (enrollmentId) {
      const enrollment = await Enrollment.findById(enrollmentId);
      if (!enrollment) {
        return res.status(404).json({ message: 'Enrollment not found' });
      }
      messageData.enrollment = enrollmentId;
    }

    const message = new ChatMessage(messageData);
    await message.save();
    console.log('Coach message saved:', message);
    res.status(201).json(message);
  } catch (err) {
    console.error('Error sending coach message:', err.message, err.stack);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});


// GET /api/coach/chat-messages - Fetch all messages for the coach
router.get('/chat-messages', auth, async (req, res) => {
  try {
    const messages = await ChatMessage.find({
      $or: [{ sender: req.user.id }, { receiver: req.user.id }]
    })
      .populate('sender', 'name email role')
      .populate('receiver', 'name email role')
      .populate('enrollment', 'childName program')
      .sort({ createdAt: 1 });
    console.log('Coach messages fetched:', messages.length); // Log count
    res.json(messages);
  } catch (err) {
    console.error('Error fetching coach messages:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST /coach/notification
router.post('/notification', auth, async (req, res) => {
  const { userId, type, message, details } = req.body;
  console.log('Received notification data:', { userId, type, message, details });
  try {
    if (req.user.role !== 'coach') {
      return res.status(403).json({ message: 'Access denied: Coach role required' });
    }

    const notification = new Notification({ user: userId, type, message, details });
    await notification.save();
    console.log('Notification saved successfully');
    res.status(201).json(notification);
  } catch (err) {
    console.error('Error in /notification route:', err.message, err.stack);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST /coach/training-material
router.post('/training-material', auth, upload.single('file'), async (req, res) => {
  const { programId, title } = req.body;
  console.log('Received training material data:', { programId, title, file: req.file });

  try {
    if (req.user.role !== 'coach') {
      return res.status(403).json({ message: 'Access denied: Coach role required' });
    }

    const coach = await Coach.findOne({ user: req.user.id });
    if (!coach.assignedPrograms.some(p => p.toString() === programId)) {
      return res.status(403).json({ message: 'Program not assigned to this coach' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No PDF file uploaded' });
    }

    const serverUrl = process.env.SERVER_URL || 'http://localhost:5000';
    const fileUrl = `${serverUrl}/uploads/${req.file.filename}`;

    const material = new TrainingMaterial({
      program: programId,
      coach: coach._id,
      title,
      fileUrl
    });

    await material.save();
    console.log('Training material saved successfully:', material);
    res.status(201).json(material);
  } catch (err) {
    console.error('Error in /training-material route:', err.message, err.stack);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST /coach/gamification
router.post('/gamification', auth, async (req, res) => {
  const { userId, points, badge } = req.body;
  console.log('Received gamification data:', { userId, points, badge });
  try {
    if (req.user.role !== 'coach') {
      return res.status(403).json({ message: 'Access denied: Coach role required' });
    }

    let gamification = await Gamification.findOne({ userId });
    if (!gamification) {
      gamification = new Gamification({ userId, points: 0, badges: [] });
    }
    if (points) gamification.points += points;
    if (badge) gamification.badges.push(badge);
    await gamification.save();

    console.log('Gamification updated successfully:', gamification);
    res.json(gamification);
  } catch (err) {
    console.error('Error in /gamification route:', err.message, err.stack);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// GET /coach/schedule
router.get('/schedule', auth, async (req, res) => {
  try {
    if (req.user.role !== 'coach') {
      return res.status(403).json({ message: 'Access denied: Coach role required' });
    }

    console.log('Fetching schedule for coach with user ID:', req.user.id);
    const coach = await Coach.findOne({ user: req.user.id }).populate('assignedPrograms');
    if (!coach) {
      console.log('No coach found for user ID:', req.user.id);
      return res.status(404).json({ message: 'Coach not found' });
    }
    const schedule = coach.assignedPrograms.flatMap(program => program.schedule || []);
    console.log('Training schedule fetched:', schedule);
    res.json(schedule);
  } catch (err) {
    console.error('Error in /schedule route:', err.message, err.stack);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST /coach/reward
router.post('/reward', auth, async (req, res) => {
  const { programId, reward, pointsRequired } = req.body;
  console.log('Received reward data:', { programId, reward, pointsRequired });

  try {
    if (req.user.role !== 'coach') {
      return res.status(403).json({ message: 'Access denied: Coach role required' });
    }

    const coach = await Coach.findOne({ user: req.user.id });
    if (!coach.assignedPrograms.some(p => p.toString() === programId)) {
      return res.status(403).json({ message: 'Program not assigned to this coach' });
    }

    let gamification = await Gamification.findOne({ program: programId, coach: coach._id });
    if (gamification) {
      gamification.reward = reward;
      gamification.pointsRequired = pointsRequired;
      await gamification.save();
    } else {
      gamification = new Gamification({
        program: programId,
        coach: coach._id,
        reward,
        pointsRequired
      });
      await gamification.save();
    }

    console.log('Reward saved successfully:', gamification);
    res.status(201).json(gamification);
  } catch (err) {
    console.error('Error in /reward route:', err.message, err.stack);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;