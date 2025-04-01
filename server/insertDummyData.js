require("dotenv").config();
const { MongoClient } = require("mongodb");

const uri = process.env.MONGO_URI; // Get MongoDB URI from .env file
const client = new MongoClient(uri);

async function deleteAllAttendanceRecords() {
  try {
    await client.connect();
    const db = client.db("PlayPulse"); // Change database name if needed
    const collection = db.collection("attendances");

    const result = await collection.deleteMany({}); // Deletes all records
    console.log(`✅ Deleted ${result.deletedCount} attendance records.`);
  } catch (error) {
    console.error("❌ Error deleting attendance records:", error);
  } finally {
    await client.close();
  }
}

deleteAllAttendanceRecords();
