const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { Institute, Coach, Program, Enrollment, User, Event, EventEnrollment } = require('../models');

// Middleware to verify JWT and ensure 'owner' role
const auth = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'No token provided' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    if (decoded.role !== 'owner') return res.status(403).json({ message: 'Access denied' });
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // Ensure this folder exists in your backend directory
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only images (jpeg, jpg, png) are allowed'));
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});


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


// Update institute profile with image uploads
router.put('/profile', auth, upload.array('images', 5), async (req, res) => {
  try {
    const instituteData = req.body;
    const files = req.files; // Array of uploaded files

    let institute = await Institute.findOne({ owner: req.user.id });
    if (!institute) {
      institute = new Institute({
        ...instituteData,
        owner: req.user.id,
        images: files ? files.map(file => `/uploads/${file.filename}`) : [],
      });
    } else {
      // Preserve existing images if no new ones are uploaded, or replace with new ones
      const updatedImages = files && files.length > 0 
        ? files.map(file => `/uploads/${file.filename}`)
        : institute.images || [];
      institute.set({
        ...instituteData,
        images: updatedImages,
      });
    }

    await institute.save();
    res.json(institute);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Get all coaches for the owner's institute
router.get('/coaches', auth, async (req, res) => {
  try {
    const institute = await Institute.findOne({ owner: req.user.id });
    if (!institute) return res.status(404).json({ message: 'Institute not found' });
    const coaches = await Coach.find({ institute: institute._id }).populate('assignedPrograms');
    res.json(coaches);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});


// POST /coaches - Add a new coach with image upload
router.post('/coaches', auth, upload.single('image'), async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    console.log('Received coach data:', req.body);
    const file = req.file; // Single uploaded file
    console.log('Uploaded file:', file);

    const { username, password, ...coachData } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    const institute = await Institute.findOne({ owner: req.user.id }).session(session);
    if (!institute) {
      return res.status(404).json({ message: 'Institute not found' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      name: coachData.name,
      email: coachData.email,
      password: hashedPassword,
      role: 'coach',
      username,
    });
    const savedUser = await user.save({ session });

    const coach = new Coach({
      ...coachData,
      institute: institute._id,
      user: savedUser._id,
      status: 'active',
      image: file ? `/uploads/${file.filename}` : null, // Store image path if uploaded
    });
    const savedCoach = await coach.save({ session });

    await session.commitTransaction();
    res.status(201).json(savedCoach);
  } catch (err) {
    await session.abortTransaction();
    console.error('Error in coach creation:', err);
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue)[0];
      return res.status(400).json({ message: `${field} already exists` });
    }
    res.status(500).json({ message: 'Server error', error: err.message });
  } finally {
    session.endSession();
  }
});


// PUT /coaches/:id - Update coach with image upload
router.put('/coaches/:id', auth, upload.single('image'), async (req, res) => {
  try {
    const { password, ...coachData } = req.body;
    const file = req.file; // Single uploaded file
    const institute = await Institute.findOne({ owner: req.user.id });
    if (!institute) return res.status(404).json({ message: 'Institute not found' });

    const coach = await Coach.findOne({ _id: req.params.id, institute: institute._id });
    if (!coach) return res.status(404).json({ message: 'Coach not found' });

    // Update password if provided
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      await User.findByIdAndUpdate(coach.user, { password: hashedPassword });
    }

    // Update image if a new one is uploaded, otherwise keep existing
    const updatedCoach = await Coach.findOneAndUpdate(
      { _id: req.params.id, institute: institute._id },
      {
        $set: {
          ...coachData,
          image: file ? `/uploads/${file.filename}` : coach.image,
        },
      },
      { new: true }
    );

    res.json(updatedCoach);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Toggle coach status
router.put('/coaches/:id/toggle-status', auth, async (req, res) => {
  try {
    const institute = await Institute.findOne({ owner: req.user.id });
    if (!institute) return res.status(404).json({ message: 'Institute not found' });

    const coach = await Coach.findOne({ _id: req.params.id, institute: institute._id });
    if (!coach) return res.status(404).json({ message: 'Coach not found' });

    const newStatus = coach.status === 'active' ? 'inactive' : 'active';
    const updatedCoach = await Coach.findOneAndUpdate(
      { _id: req.params.id },
      { $set: { status: newStatus } },
      { new: true }
    );

    res.json(updatedCoach);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Get all programs for the owner's institute
router.get('/programs', auth, async (req, res) => {
  try {
    const institute = await Institute.findOne({ owner: req.user.id });
    if (!institute) return res.status(404).json({ message: 'Institute not found' });

    const programs = await Program.find({ institute: institute._id }).populate('assignedPrograms.coach', 'name');
    res.json(programs);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});


// POST /programs
router.post('/programs', auth, async (req, res) => {
  try {
    const institute = await Institute.findOne({ owner: req.user.id });
    if (!institute) return res.status(404).json({ message: 'Institute not found' });
    console.log('Received program data:', req.body);

    const program = new Program({ ...req.body, institute: institute._id });
    await program.save();

    if (req.body.assignedPrograms && Array.isArray(req.body.assignedPrograms)) {
      console.log('Updating coaches with program ID:', program._id);
      for (const ap of req.body.assignedPrograms) {
        const coach = await Coach.findByIdAndUpdate(
          ap.coach,
          { $push: { assignedPrograms: program._id } },
          { new: true }
        );
        console.log('Updated coach:', coach);
      }
    }

    // Populate the coach field in assignedPrograms
    const populatedProgram = await Program.findById(program._id).populate('assignedPrograms.coach', 'name');
    res.status(201).json(populatedProgram);
  } catch (err) {
    console.error('Error adding program:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});


router.put('/programs/:id', auth, async (req, res) => {
  try {
    const institute = await Institute.findOne({ owner: req.user.id });
    if (!institute) return res.status(404).json({ message: 'Institute not found' });

    const existingProgram = await Program.findOne({ _id: req.params.id, institute: institute._id });
    if (!existingProgram) return res.status(404).json({ message: 'Program not found' });

    if (existingProgram.assignedPrograms && Array.isArray(existingProgram.assignedPrograms)) {
      console.log('Removing old coach assignments for program:', existingProgram._id);
      for (const ap of existingProgram.assignedPrograms) {
        await Coach.findByIdAndUpdate(ap.coach, { $pull: { assignedPrograms: existingProgram._id } });
      }
    }

    console.log('Updating program with data:', req.body);
    const updatedProgram = await Program.findOneAndUpdate(
      { _id: req.params.id, institute: institute._id },
      { $set: req.body },
      { new: true }
    );

    if (req.body.assignedPrograms && Array.isArray(req.body.assignedPrograms)) {
      console.log('Adding new coach assignments for program:', updatedProgram._id);
      for (const ap of req.body.assignedPrograms) {
        const coach = await Coach.findByIdAndUpdate(
          ap.coach,
          { $push: { assignedPrograms: updatedProgram._id } },
          { new: true }
        );
        console.log('Updated coach:', coach);
      }
    }

    // Populate the coach field in assignedPrograms
    const populatedProgram = await Program.findById(updatedProgram._id).populate('assignedPrograms.coach', 'name');
    res.json(populatedProgram);
  } catch (err) {
    console.error('Error updating program:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});


// Delete a program
router.delete('/programs/:id', auth, async (req, res) => {
  try {
    const institute = await Institute.findOne({ owner: req.user.id });
    if (!institute) return res.status(404).json({ message: 'Institute not found' });
    const program = await Program.findOneAndDelete({ _id: req.params.id, institute: institute._id });
    if (!program) return res.status(404).json({ message: 'Program not found' });
    // Remove program from coach assignments
    await Coach.updateMany({ assignedPrograms: program._id }, { $pull: { assignedPrograms: program._id } });
    res.json({ message: 'Program deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Get enrollments for the owner's institute
router.get('/enrollments', auth, async (req, res) => {
  try {
    const institute = await Institute.findOne({ owner: req.user.id });
    if (!institute) return res.status(404).json({ message: 'Institute not found' });
    const enrollments = await Enrollment.find({ institute: institute._id })
      .populate('parent', 'name email')
      .populate('program');
    res.json(enrollments);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Route to get enrollment details by ID
router.get('/enrollments/:id', async (req, res) => {
  try {
    const enrollmentId = req.params.id;
    const enrollment = await Enrollment.findById(enrollmentId)
      .populate('parent', 'name email')
      .populate('program', 'name')
      .populate('institute', 'name');
    
    if (!enrollment) {
      return res.status(404).json({ message: 'Enrollment not found' });
    }

    res.json(enrollment);
  } catch (error) {
    console.error('Error fetching enrollment details:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /events - Add a new event
router.post('/events', auth, upload.array('images', 5), async (req, res) => {
  try {
    const institute = await Institute.findOne({ owner: req.user.id });
    if (!institute) return res.status(404).json({ message: 'Institute not found' });

    const files = req.files; // Array of uploaded files
    console.log('Received event data:', req.body);
    console.log('Uploaded files:', files);

    const eventData = {
      ...req.body,
      institute: institute._id,
      images: files ? files.map(file => `/uploads/${file.filename}`) : [],
    };

    const event = new Event(eventData);
    const savedEvent = await event.save();

    res.status(201).json(savedEvent);
  } catch (err) {
    console.error('Error adding event:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// GET /events - Fetch all events
router.get('/events', auth, async (req, res) => {
  try {
    const institute = await Institute.findOne({ owner: req.user.id });
    if (!institute) return res.status(404).json({ message: 'Institute not found' });

    const events = await Event.find({ institute: institute._id });
    res.json(events);
  } catch (err) {
    console.error('Error fetching events:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// PUT /events/:id - Update an event with image upload
router.put('/events/:id', auth, upload.array('images', 5), async (req, res) => {
  try {
    const institute = await Institute.findOne({ owner: req.user.id });
    if (!institute) return res.status(404).json({ message: 'Institute not found' });

    const existingEvent = await Event.findOne({ _id: req.params.id, institute: institute._id });
    if (!existingEvent) return res.status(404).json({ message: 'Event not found' });

    const files = req.files; // Array of uploaded files
    console.log('Updating event with data:', req.body);
    console.log('Uploaded files:', files);

    // Use existing images if no new ones are uploaded, otherwise replace with new ones
    const updatedImages = files && files.length > 0 
      ? files.map(file => `/uploads/${file.filename}`)
      : existingEvent.images || [];

    const updatedEvent = await Event.findOneAndUpdate(
      { _id: req.params.id, institute: institute._id },
      { 
        $set: { 
          ...req.body,
          images: updatedImages,
        }
      },
      { new: true }
    );

    res.json(updatedEvent);
  } catch (err) {
    console.error('Error updating event:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// DELETE /events/:id - Delete an event (unchanged)
router.delete('/events/:id', auth, async (req, res) => {
  try {
    const institute = await Institute.findOne({ owner: req.user.id });
    if (!institute) return res.status(404).json({ message: 'Institute not found' });

    const event = await Event.findOneAndDelete({ _id: req.params.id, institute: institute._id });
    if (!event) return res.status(404).json({ message: 'Event not found' });

    res.json({ message: 'Event deleted' });
  } catch (err) {
    console.error('Error deleting event:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});


// Updated route to get only basic enrollment information
router.get('/enrollments/:id/details', auth, async (req, res) => {
  try {
    const institute = await Institute.findOne({ owner: req.user.id });
    if (!institute) return res.status(404).json({ message: 'Institute not found' });

    const enrollment = await Enrollment.findOne({ _id: req.params.id, institute: institute._id })
      .populate('parent', 'name email')
      .populate('program', 'name')
      .populate('institute', 'name');
    if (!enrollment) return res.status(404).json({ message: 'Enrollment not found' });

    res.json(enrollment); // Return only the enrollment object
  } catch (err) {
    console.error('Error fetching enrollment details:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});


// PUT /events/:id - Update an event
router.put('/events/:id', auth, async (req, res) => {
  try {
    const institute = await Institute.findOne({ owner: req.user.id });
    if (!institute) return res.status(404).json({ message: 'Institute not found' });

    const existingEvent = await Event.findOne({ _id: req.params.id, institute: institute._id });
    if (!existingEvent) return res.status(404).json({ message: 'Event not found' });

    console.log('Updating event with data:', req.body);
    const updatedEvent = await Event.findOneAndUpdate(
      { _id: req.params.id, institute: institute._id },
      { $set: req.body },
      { new: true }
    );

    res.json(updatedEvent);
  } catch (err) {
    console.error('Error updating event:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// DELETE /events/:id - Delete an event
router.delete('/events/:id', auth, async (req, res) => {
  try {
    const institute = await Institute.findOne({ owner: req.user.id });
    if (!institute) return res.status(404).json({ message: 'Institute not found' });

    const event = await Event.findOneAndDelete({ _id: req.params.id, institute: institute._id });
    if (!event) return res.status(404).json({ message: 'Event not found' });

    res.json({ message: 'Event deleted' });
  } catch (err) {
    console.error('Error deleting event:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// New route: Get event enrollment details
router.get('/events/:eventId/enrollments', auth, async (req, res) => {
  console.log('Entering GET /events/:eventId/enrollments');
  try {
    const eventId = req.params.eventId;
    const event = await Event.findById(eventId);
    if (!event) {
      console.log('Event not found:', eventId);
      return res.status(404).json({ message: 'Event not found' });
    }

    // Verify the event belongs to the owner's institute
    const institute = await Institute.findOne({ owner: req.user.id });
    if (!institute || event.institute.toString() !== institute._id.toString()) {
      console.log('Unauthorized access to event:', eventId);
      return res.status(403).json({ message: 'Unauthorized access to this event' });
    }

    const enrollments = await EventEnrollment.find({ event: eventId })
      .populate('parent', 'name email') // Populate parent details
      .select('name contactNumber age status createdAt parent');
    
    console.log('Event enrollments fetched:', enrollments.length, 'items');
    res.json(enrollments);
  } catch (err) {
    console.error('Error in GET /events/:eventId/enrollments:', err.message, err.stack);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});


module.exports = router;