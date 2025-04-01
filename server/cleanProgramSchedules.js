const mongoose = require('mongoose');

const MONGO_URI = 'mongodb+srv://surajmahato9823:tFPd4DF25HEAxbZj@cluster0.anx8i.mongodb.net/PlayPulse?retryWrites=true&w=majority&appName=Cluster0';

// Define the ProgramSchedule schema
const programScheduleSchema = new mongoose.Schema({
  program: { type: mongoose.Schema.Types.ObjectId, ref: 'Program', required: true },
  coach: { type: mongoose.Schema.Types.ObjectId, ref: 'Coach' },
  duration: Number,
  schedule: [{
    date: { type: Date, required: true },
    time: String,
    activity: String
  }]
});

// Define the TrainingMaterial schema
const trainingMaterialSchema = new mongoose.Schema({
  program: { type: mongoose.Schema.Types.ObjectId, ref: 'Program', required: true },
  coach: { type: mongoose.Schema.Types.ObjectId, ref: 'Coach', required: true },
  title: { type: String, required: true },
  fileUrl: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

// Create models
const ProgramSchedule = mongoose.model('ProgramSchedule', programScheduleSchema);
const TrainingMaterial = mongoose.model('TrainingMaterial', trainingMaterialSchema);

async function deleteAllData() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    // Delete all documents from ProgramSchedule collection
    const programScheduleResult = await ProgramSchedule.deleteMany({});
    console.log(`Deleted ${programScheduleResult.deletedCount} documents from ProgramSchedule collection`);

    // Delete all documents from TrainingMaterial collection
    const trainingMaterialResult = await TrainingMaterial.deleteMany({});
    console.log(`Deleted ${trainingMaterialResult.deletedCount} documents from TrainingMaterial collection`);

    console.log('All data deletion completed successfully');
  } catch (error) {
    console.error('Error deleting data:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

deleteAllData().catch(console.error);