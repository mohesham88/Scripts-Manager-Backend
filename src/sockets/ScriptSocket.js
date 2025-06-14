import { Server } from "socket.io";
import fs from "fs";
import { ScriptRun } from "../scripts/models.js";

export class ScriptSocket {
  constructor(io) {
    this.io = io;
    this.logWatchers = new Map(); // Map to store file watchers and their positions
    this.runRooms = new Map(); // Map to store active run rooms
  }

  init() {
    this.io.on("connection", (socket) => {
      console.log("Client connected:", socket.id);

      // Handle joining a script run room
      socket.on("join-run", async (runId) => {
        //console.log("Joining run:", runId);
        // check if the status is completed
        const scriptRun = await ScriptRun.findByPk(runId);
        if (scriptRun.status !== "running") {
          socket.emit("run-complete", {
            runId,
            status: scriptRun.status,
            endTime: scriptRun.endTime,
          });
          return;
        }
        const roomName = `run-${runId}`;
        socket.join(roomName);
        this.runRooms.set(socket.id, roomName);
        console.log(`Client ${socket.id} joined room ${roomName}`);
      });

      // Handle watching script logs
      socket.on("watch-logs", async (runId) => {
        try {
          console.log("Watching logs for run:", runId);
          const scriptRun = await ScriptRun.findByPk(runId);
          if (!scriptRun || !scriptRun.logFile) {
            socket.emit("error", { message: "Log file not found" });
            return;
          }

          const logFile = scriptRun.logFile;
          console.log(`Watching log file: ${logFile}`);

          // Send initial log content
          if (fs.existsSync(logFile)) {
            const initialContent = fs.readFileSync(logFile, "utf8");
            socket.emit("log-update", {
              runId,
              content: initialContent,
              clear: true, // Signal frontend to clear existing content
            });

            // Store the current file size as our starting position
            const stats = fs.statSync(logFile);
            let position = stats.size;

            // Set up file watcher with position tracking
            const watcher = fs.watch(logFile, (eventType) => {
              if (eventType === "change") {
                // Read only the new content since last position
                const fd = fs.openSync(logFile, "r");
                const buffer = Buffer.alloc(16384); // 16KB buffer
                let newContent = "";

                while (true) {
                  const bytesRead = fs.readSync(
                    fd,
                    buffer,
                    0,
                    buffer.length,
                    position
                  );
                  if (bytesRead === 0) break;

                  newContent += buffer.slice(0, bytesRead).toString("utf8");
                  position += bytesRead;
                }

                fs.closeSync(fd);

                if (newContent) {
                  socket.emit("log-update", {
                    runId,
                    content: newContent,
                    clear: false, // Append to existing content
                  });
                }
              }
            });

            // Store watcher and position reference
            this.logWatchers.set(socket.id, {
              watcher,
              position,
              logFile,
            });
          }
        } catch (error) {
          console.error("Error setting up log watcher:", error);
          socket.emit("error", { message: "Failed to watch logs" });
        }
      });

      // Handle stopping log watching
      socket.on("stop-watching", () => {
        const watcherInfo = this.logWatchers.get(socket.id);
        if (watcherInfo) {
          console.log("Stopped log watcher for:", watcherInfo.logFile);
          watcherInfo.watcher.close();
          this.logWatchers.delete(socket.id);
        }
      });

      // Handle disconnection
      socket.on("disconnect", () => {
        console.log("Client disconnected:", socket.id);

        // Clean up watchers
        const watcherInfo = this.logWatchers.get(socket.id);
        if (watcherInfo) {
          watcherInfo.watcher.close();
          this.logWatchers.delete(socket.id);
        }

        // Leave rooms
        const roomName = this.runRooms.get(socket.id);
        if (roomName) {
          socket.leave(roomName);
          this.runRooms.delete(socket.id);
        }
      });
    });
  }

  // Method to emit script run updates
  emitRunUpdate(runId, data) {
    const roomName = `run-${runId}`;
    this.io.to(roomName).emit("run-update", { runId, ...data });
  }

  // Method to emit script run completion
  emitRunComplete(runId, status, endTime) {
    const roomName = `run-${runId}`;
    this.io.to(roomName).emit("run-complete", {
      runId,
      status,
      endTime,
    });
  }

  // Method to emit script run error
  emitRunError(runId, error) {
    const roomName = `run-${runId}`;
    this.io.to(roomName).emit("run-error", {
      runId,
      error,
    });
  }

  // Method to emit progress updates
  emitProgressUpdate(runId, progress) {
    const roomName = `run-${runId}`;
    this.io.to(roomName).emit("progress-update", {
      runId,
      progress,
    });
  }
}
