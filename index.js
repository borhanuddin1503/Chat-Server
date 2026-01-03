const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const { MongoClient, ObjectId } = require("mongodb");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL
  },
});

app.use(cors());
app.use(express.json());

/* ================= MongoDB ================= */
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);


// collectons
let usersCollection;


/* ================= Socket Storage ================= */
let adminSocketId = null;
const userSockets = {}; // { userId: socketId }

async function run() {
  // await client.connect();
  const db = client.db("roy-tech");
  usersCollection = db.collection("users");
  console.log("✅ MongoDB Connected");
}

run();

/* ================= REST API ================= */
// Only user list
app.get("/users", async (req, res) => {
  const users = await usersCollection.find().toArray();
  res.send(users);
});

/* ================= SOCKET.IO ================= */
io.on("connection", (socket) => {
  console.log("🔌 Connected:", socket.id);

  // User/Admin register
  socket.on("register", ({ userId, role }) => {
    if (role === "admin") {
      adminSocketId = socket.id;
      console.log("👑 Admin connected");
    } else {
      userSockets[userId] = socket.id;
      console.log("🙋 User connected:", userId);
    }
  });

  /* ===== User -> Admin ===== */
  socket.on("send_message_to_admin", (data) => {
    if (adminSocketId) {
      io.to(adminSocketId).emit("receive_message_from_user", data);
    }
  });

  /* ===== Admin -> User ===== */
  socket.on("send_message_to_user", (data) => {
    /*
      data = {
        userId,
        message
      }
    */
    const targetSocket = userSockets[data.userId];
    if (targetSocket) {
      io.to(targetSocket).emit("receive_message_from_admin", data);
    }
  });

  /* ===== Disconnect ===== */
  socket.on("disconnect", () => {
    console.log("❌ Disconnected:", socket.id);

    if (socket.id === adminSocketId) {
      adminSocketId = null;
    }

    for (const userId in userSockets) {
      if (userSockets[userId] === socket.id) {
        delete userSockets[userId];
        break;
      }
    }
  });
});

/* ================= ROOT ================= */
app.get("/", (req, res) => {
  res.send("🚀 Chat Server Running");
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
