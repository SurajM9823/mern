const mongoose = require('mongoose');

// Define all schemas
const progressSchema = new mongoose.Schema({
  enrollment: { type: mongoose.Schema.Types.ObjectId, ref: 'Enrollment', required: true },
  coach: { type: mongoose.Schema.Types.ObjectId, ref: 'Coach', required: true },
  date: { type: Date, required: true },
  metrics: { type: Number, required: true }, // Numeric value (e.g., 0-100)
  notes: String,
  progressScore: { type: Number }, // Computed score
  createdAt: { type: Date, default: Date.now }
});

const attendanceSchema = new mongoose.Schema({
  enrollment: { type: mongoose.Schema.Types.ObjectId, ref: 'Enrollment', required: true },
  date: { type: Date, required: true },
  status: { type: String, enum: ['present', 'absent'], default: 'present' },
  createdAt: { type: Date, default: Date.now }
});

const coachSchema = new mongoose.Schema({
  institute: { type: mongoose.Schema.Types.ObjectId, ref: 'Institute', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  qualification: { type: String, required: true },
  achievements: { type: String },
  experience: { type: String, required: true },
  salary: { type: Number, required: true },
  contactNumber: { type: String },
  assignedPrograms: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Program' }],
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  createdAt: { type: Date, default: Date.now },
  image: { type: String }, // Single image path (optional)
});

const enrollmentSchema = new mongoose.Schema({
  parent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  childName: { type: String, required: true },
  program: { type: mongoose.Schema.Types.ObjectId, ref: 'Program', required: true },
  institute: { type: mongoose.Schema.Types.ObjectId, ref: 'Institute', required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  paymentStatus: { type: String, enum: ['pending', 'completed'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

const gamificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // For student points
  program: { type: mongoose.Schema.Types.ObjectId, ref: 'Program' }, // For program-specific rewards
  coach: { type: mongoose.Schema.Types.ObjectId, ref: 'Coach' },
  points: { type: Number, default: 0 }, // Student points
  badges: [String],
  reward: String, // e.g., "Medal"
  pointsRequired: Number // Points needed to claim reward
});

const instituteSchema = new mongoose.Schema({
  name: { type: String, required: true },
  address: { type: String, required: true },
  sportsOffered: { type: String, required: true },
  facilities: { type: String, required: true },
  staff: { type: String },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
  estdDate: { type: Date },
  rewards: { type: String },
  branches: { type: String },
  totalStaff: { type: Number },
  contactNumber: { type: String, required: true },
  images: [{ type: String }], // Array of image paths
});

const messageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true },
  enrollment: { type: mongoose.Schema.Types.ObjectId, ref: 'Enrollment' },
  createdAt: { type: Date, default: Date.now }
});

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, required: true },
  message: { type: String, required: true },
  details: String,
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const programSchema = new mongoose.Schema({
  institute: { type: mongoose.Schema.Types.ObjectId, ref: 'Institute', required: true },
  name: { type: String, required: true },
  sport: { type: String, required: true },
  pricing: { type: Number, required: true },
  startDate: { type: Date, required: true },
  duration: { type: String, required: true }, // e.g., "6 weeks"
  ageGroup: { type: String, required: true },
  schedule: [{ date: Date, time: String }], // Legacy schedule field
  description: String,
  seatsAvailable: { type: Number, required: true, default: 20 },
  assignedPrograms: [{
    coach: { type: mongoose.Schema.Types.ObjectId, ref: 'Coach' },
    role: { type: String, default: 'Primary Coach' }
  }],
  createdAt: { type: Date, default: Date.now }
});

const eventSchema = new mongoose.Schema({
  institute: { type: mongoose.Schema.Types.ObjectId, ref: 'Institute', required: true },
  name: { type: String, required: true },
  place: { type: String, required: true },
  type: { type: String, required: true },
  date: { type: Date, required: true },
  description: { type: String },
  status: { type: String, enum: ['upcoming', 'completed'], default: 'upcoming' },
  createdAt: { type: Date, default: Date.now },
  images: [{ type: String }], // Array to store image paths
});

const eventEnrollmentSchema = new mongoose.Schema({
  parent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  name: { type: String, required: true }, // Child or participant name
  contactNumber: { type: String, required: true },
  age: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

const reviewSchema = new mongoose.Schema({
  parent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  institute: { type: mongoose.Schema.Types.ObjectId, ref: 'Institute', required: true },
  program: { type: mongoose.Schema.Types.ObjectId, ref: 'Program', required: true }, // Added this line
  coach: { type: mongoose.Schema.Types.ObjectId, ref: 'Coach' },
  rating: { type: Number, min: 1, max: 5, required: true },
  comment: { type: String },
  createdAt: { type: Date, default: Date.now }
});

const trainingMaterialSchema = new mongoose.Schema({
  program: { type: mongoose.Schema.Types.ObjectId, ref: 'Program', required: true },
  coach: { type: mongoose.Schema.Types.ObjectId, ref: 'Coach', required: true },
  title: { type: String, required: true },
  fileUrl: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  username: { type: String },
  role: { type: String, enum: ['owner', 'parent', 'coach'], default: 'parent', required: true },
  createdAt: { type: Date, default: Date.now },
  image: { type: String },
  resetCode: { type: String },
  resetCodeExpires: { type: Date }
});

const programScheduleSchema = new mongoose.Schema({
  program: { type: mongoose.Schema.Types.ObjectId, ref: 'Program', required: true },
  coach: { type: mongoose.Schema.Types.ObjectId, ref: 'Coach', required: true },
  duration: { type: Number, required: true },
  startDate: { type: Date, default: Date.now },
  schedule: [{
    date: { type: Date, required: true },
    activity: { type: String, required: true },
    time: { type: String, default: 'TBD' }
  }],
  createdAt: { type: Date, default: Date.now }
});

const chatMessageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true,
    trim: true
  },
  enrollment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Enrollment',
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Export all models
module.exports = {
  Progress: mongoose.model('Progress', progressSchema),
  Coach: mongoose.model('Coach', coachSchema),
  Enrollment: mongoose.model('Enrollment', enrollmentSchema),
  Gamification: mongoose.model('Gamification', gamificationSchema),
  Institute: mongoose.model('Institute', instituteSchema),
  Message: mongoose.model('Message', messageSchema),
  Notification: mongoose.model('Notification', notificationSchema),
  Program: mongoose.model('Program', programSchema),
  Event: mongoose.model('Event', eventSchema),
  Review: mongoose.model('Review', reviewSchema),
  Attendance: mongoose.model('Attendance', attendanceSchema),
  TrainingMaterial: mongoose.model('TrainingMaterial', trainingMaterialSchema),
  User: mongoose.model('User', userSchema),
  ChatMessage: mongoose.model('ChatMessage', chatMessageSchema),
  ProgramSchedule: mongoose.model('ProgramSchedule', programScheduleSchema), // Corrected typo
  EventEnrollment: mongoose.model('EventEnrollment', eventEnrollmentSchema)
};