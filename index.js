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
    origin: "*",
  },
});

app.use(cors());
app.use(express.json());

/* ================= MongoDB ================= */
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);


// collectons
let chatsCollection;


/* ================= Socket Storage ================= */
let adminSocketId = null;
const userSockets = {}; // { userId: socketId }

async function run() {
  await client.connect();
  const db = client.db("roy-tech");
  chatsCollection = db.collection("chats");
}

run();

/* ================= REST API ================= */
// Only user list
app.get("/users", async (req, res) => {
  const users = await chatsCollection.find().toArray();
  res.send(users);
});

/* ================= SOCKET.IO ================= */
io.on("connection", (socket) => {

  // User/Admin register
  socket.on("register", async ({ userId, role }) => {

    if (role === "admin") {
      adminSocketId = socket.id;
    } else {
      userSockets[userId] = socket.id;

      const isExist = await chatsCollection.findOne({ userId });

      if (!isExist) {
        await chatsCollection.insertOne({
          userId,
          chatStarted: new Date().toISOString(),
          chats: [],
        });
      }
    }
  });

  /* ===== User -> Admin ===== */
  socket.on("send_message_to_admin", async (data) => {

    console.log(adminSocketId)
    console.log('message from user', data)
    if (adminSocketId) {
      io.to(adminSocketId).emit("receive_message_from_user", data);
    }
    // 1️⃣ Save message in DB
    await chatsCollection.updateOne(
      { userId: data.userId },
      {
        $push: {
          chats: ({
            sender: "user",
            message: data.message,
            time: new Date().toISOString(),
          }),
        },
      }
    );
  });

  /* ===== Admin -> User ===== */
  socket.on("send_message_to_user", async (data) => {
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

    // save into mongodb
    await chatsCollection.updateOne(
      { userId: data.userId },
      {
        $push: {
          chats: ({
            sender: "admin",
            message: data.message,
            time: new Date().toISOString(),
          })
        }
      }
    )
  });

  /* ===== Disconnect ===== */
  socket.on("disconnect", () => {

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
});
