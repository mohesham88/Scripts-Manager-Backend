// src/index.ts
import express from "express";
import "express-async-errors";
import bodyParser from "body-parser";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";

import { errorHandlerMiddleware } from "./middlewares/errorHandler.js";

import { SERVERCONFIG } from "./config/server.js";

import scriptsController from "./scripts/controller.js";
import { connectDB } from "./config/db/db.js";
import { ScriptSocket } from "./sockets/ScriptSocket.js";

const app = express();
const httpServer = createServer(app);

// Initialize Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

// Initialize script socket handler
const scriptSocket = new ScriptSocket(io);
scriptSocket.init();

// Export socket instance for use in other modules
export { scriptSocket };

app.use(
  cors({
    origin: "*",
    credentials: true,
    optionsSuccessStatus: 200,
    methods: "GET,POST,PUT,DELETE,OPTIONS",
  })
);
app.use(express.json());

app.use(bodyParser.urlencoded({ extended: false }));

const router = express.Router();

router.post("/test", (req, res) => {
  res.status(200).json({ message: "Server is running" });
});

router.use("/scripts", scriptsController);

// const socket = new ChatSocket(io); // sharing the session with socket.io so it could be used
// socket.init();

// make all endpoints start with the prefix api/v1
app.use("/", router);

app.use(errorHandlerMiddleware);

httpServer.listen(SERVERCONFIG.PORT, async () => {
  console.log(`Server is running on http://localhost:${SERVERCONFIG.PORT} `);

  try {
    await connectDB();
    console.log("Database connected successfully");
  } catch (err) {
    console.error("Database connection error:", err);
  }
});
