import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import {
  runScript,
  addScript,
  getScripts,
  getScriptRuns,
  updateScript,
  deleteScript,
  killScriptRuns,
} from "./services.js";
import { ScriptSocket } from "../sockets/ScriptSocket.js";
import { scriptSocket } from "../index.js";

const app = Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "scripts/"); // Store uploaded scripts in scripts/ directory
  },
  filename: (req, file, cb) => {
    // Generate unique filename with timestamp
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}-${timestamp}${ext}`);
  },
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    // Accept .bat, .cmd, .ps1 files
    const allowedExtensions = [".bat", ".cmd", ".ps1"];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Only .bat, .cmd, and .ps1 files are allowed"), false);
    }
  },
});

// Route to get all scripts
app.get("/", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 100,
      sortBy = "createdAt",
      sortOrder = "DESC",
      type,
      search,
    } = req.query;

    const options = {
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 100), // Max 100 items per page
      sortBy,
      sortOrder,
      type,
      search,
    };

    const result = await getScripts.getAllScripts(options);

    res.status(200).json({
      message: "Scripts retrieved successfully",
      ...result,
    });
  } catch (error) {
    console.error("Error retrieving scripts:", error);
    res.status(500).json({
      error: "Failed to retrieve scripts",
      details: error.message,
    });
  }
});

// Route to get a specific script by ID
app.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const script = await getScripts.getScriptById(id);

    if (!script) {
      return res.status(404).json({ error: "Script not found" });
    }

    res.status(200).json({
      message: "Script retrieved successfully",
      script,
    });
  } catch (error) {
    console.error("Error retrieving script:", error);
    res.status(500).json({
      error: "Failed to retrieve script",
      details: error.message,
    });
  }
});

// Route to get script runs for a specific script
app.get("/:id/runs", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "DESC",
      status,
    } = req.query;

    const options = {
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 100),
      sortBy,
      sortOrder,
      status,
    };

    const result = await getScriptRuns.getByScriptId(id, options);

    res.status(200).json({
      message: "Script runs retrieved successfully",
      ...result,
    });
  } catch (error) {
    console.error("Error retrieving script runs:", error);
    res.status(500).json({
      error: "Failed to retrieve script runs",
      details: error.message,
    });
  }
});

// Route to get all script runs (for monitoring dashboard)
app.get("/runs/all", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "DESC",
      status,
      scriptId,
      dateFrom,
      dateTo,
    } = req.query;

    const options = {
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 100),
      sortBy,
      sortOrder,
      status,
      scriptId: scriptId ? parseInt(scriptId) : undefined,
      dateFrom,
      dateTo,
    };

    const result = await getScriptRuns.getAllRuns(options);

    res.status(200).json({
      message: "All script runs retrieved successfully",
      ...result,
    });
  } catch (error) {
    console.error("Error retrieving all script runs:", error);
    res.status(500).json({
      error: "Failed to retrieve script runs",
      details: error.message,
    });
  }
});

// Route to get a specific script run by ID
app.get("/runs/:runId", async (req, res) => {
  try {
    const { runId } = req.params;
    const scriptRun = await getScriptRuns.getRunById(runId);

    if (!scriptRun) {
      return res.status(404).json({ error: "Script run not found" });
    }

    res.status(200).json({
      message: "Script run retrieved successfully",
      scriptRun,
    });
  } catch (error) {
    console.error("Error retrieving script run:", error);
    res.status(500).json({
      error: "Failed to retrieve script run",
      details: error.message,
    });
  }
});

// Route to get script file content for editing
app.get("/:id/content", async (req, res) => {
  try {
    const { id } = req.params;

    // Get script details
    const script = await getScripts.getScriptById(id);
    if (!script) {
      return res.status(404).json({ error: "Script not found" });
    }

    // Read script file content
    if (!fs.existsSync(script.filePath)) {
      return res.status(404).json({ error: "Script file not found on disk" });
    }

    const content = fs.readFileSync(script.filePath, "utf8");

    res.status(200).json({
      message: "Script content retrieved successfully",
      script: {
        id: script.id,
        name: script.name,
        description: script.description,
        type: script.type,
        content: content,
      },
    });
  } catch (error) {
    console.error("Error retrieving script content:", error);
    res.status(500).json({
      error: "Failed to retrieve script content",
      details: error.message,
    });
  }
});

// Route to add a new script
app.post("/add", upload.array("files"), async (req, res) => {
  try {
    const { name, description, type, scriptContent } = req.body;

    // Case 1: File upload
    if (req.files.length > 0) {
      const scripts = [];

      req.files.forEach((file) => {
        console.log(file.originalname);

        let nameWithoutExtension = path.parse(file.originalname).name; // Get name without extension

        let type =
          path.extname(file.originalname).slice(1).toLowerCase() === "bat"
            ? "batch"
            : path.extname(file.originalname).slice(1).toLowerCase() === "cmd"
            ? "cmd"
            : path.extname(file.originalname).slice(1).toLowerCase() === "ps1"
            ? "powershell"
            : null; // Get file type from extension
        if (!["batch", "powershell", "cmd"].includes(type)) {
          return res.status(400).json({
            error: "Invalid file type. Must be .bat, .cmd, or .ps1",
          });
        }
        let filePath = file.path;

        scripts.push({
          name: nameWithoutExtension,
          description: description || "",
          type,
          filePath,
        });
      });

      // save the scripts to the database
      const savedScripts = await addScript.saveMultipleToDatabase(scripts);

      return res.status(201).json({
        message: `${savedScripts.length} Scripts added successfully`,
        scripts: savedScripts,
      });
    }

    console.log(req.body);

    if (!name || !type) {
      return res.status(400).json({
        error: "Missing required fields: name and type are required",
      });
    }

    if (!["batch", "powershell", "cmd"].includes(type)) {
      return res.status(400).json({
        error: "Invalid script type. Must be 'batch' or 'powershell'",
      });
    }

    let filePath;

    // Case 2: Script content as text
    if (scriptContent) {
      filePath = await addScript.createScriptFile(name, scriptContent, type);
    } else {
      return res.status(400).json({
        error: "Either upload a file or provide scriptContent",
      });
    }

    // Add script to database
    const script = await addScript.saveToDatabase({
      name,
      description: description || "",
      type,
      filePath,
    });

    res.status(201).json({
      message: "Script added successfully",
      script: {
        id: script.id,
        name: script.name,
        description: script.description,
        type: script.type,
        filePath: script.filePath,
      },
    });
  } catch (error) {
    console.error("Error adding script:", error);
    res.status(500).json({
      error: "Failed to add script",
      details: error.message,
    });
  }
});

// kill script's running processes
app.post("/:id/kill", async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: "Missing required field: scriptId" });
  }

  const script = await getScripts.getScriptById(id);

  if (!script) {
    return res.status(404).json({ error: "Script not found" });
  }

  try {
    await killScriptRuns(script.id);
    return res.status(200).json({ message: "Script runs killed successfully" });
  } catch (error) {
    console.error("Error killing script runs:", error);
    return res.status(500).json({ error: "Failed to kill script runs" });
  }
});

app.post("/run", async (req, res) => {
  const { scriptId, executionPath } = req.body;

  if (!scriptId) {
    return res.status(400).json({ error: "Missing required field: scriptId" });
  }

  try {
    // Get script details from database
    const script = await getScripts.getScriptById(scriptId);

    if (!script) {
      return res.status(404).json({ error: "Script not found" });
    }

    // Run the script using database information
    const result = await runScript(
      script.id,
      script.filePath,
      script.type,
      executionPath
    );

    res.status(200).json({
      message: "Script execution started",
      id: result.scriptRunId,
      logFile: result.logFile,
      script: {
        id: script.id,
        name: script.name,
        type: script.type,
      },
    });
  } catch (error) {
    console.error("Error starting script execution:", error);
    res.status(500).json({
      error: "Failed to start script execution",
      details: error.message,
    });
  }
});

// Route to update a script
app.patch("/:id", upload.single("file"), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, type, scriptContent } = req.body;

    console.log("Updating script:", id, req.body);

    // Validate script type if provided
    if (type && !["batch", "powershell"].includes(type)) {
      return res.status(400).json({
        error: "Invalid script type. Must be 'batch' or 'powershell'",
      });
    }

    // Check if script exists
    const existingScript = await getScripts.getScriptById(id);
    if (!existingScript) {
      return res.status(404).json({ error: "Script not found" });
    }

    let updateData = {};

    // Update basic fields
    if (name) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (type) updateData.type = type;

    // Handle file/content updates
    if (req.file) {
      // New file uploaded
      updateData.filePath = req.file.path;
      updateData.replaceFile = true;
      updateData.oldFilePath = existingScript.filePath;
    } else if (scriptContent) {
      // New script content provided
      const newFilePath = await updateScript.createUpdatedScriptFile(
        existingScript,
        scriptContent,
        type || existingScript.type
      );
      updateData.filePath = newFilePath;
      updateData.replaceFile = true;
      updateData.oldFilePath = existingScript.filePath;
    }

    // Update the script
    const updatedScript = await updateScript.updateInDatabase(id, updateData);

    res.status(200).json({
      message: "Script updated successfully",
      script: {
        id: updatedScript.id,
        name: updatedScript.name,
        description: updatedScript.description,
        type: updatedScript.type,
        filePath: updatedScript.filePath,
      },
    });
  } catch (error) {
    console.error("Error updating script:", error);
    res.status(500).json({
      error: "Failed to update script",
      details: error.message,
    });
  }
});

// Route to delete a script
app.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { deleteRuns = true } = req.query; // Optional: delete associated runs

    // Check if script exists
    const existingScript = await getScripts.getScriptById(id);
    if (!existingScript) {
      return res.status(404).json({ error: "Script not found" });
    }

    // Delete the script and optionally its runs
    const deletionResult = await deleteScript.deleteFromDatabase(id, {
      deleteRuns: deleteRuns === "true",
      filePath: existingScript.filePath,
    });

    res.status(200).json({
      message: "Script deleted successfully",
      deletedScript: {
        id: existingScript.id,
        name: existingScript.name,
      },
      deletedRuns: deletionResult.deletedRuns || 0,
      fileDeleted: deletionResult.fileDeleted,
    });
  } catch (error) {
    console.error("Error deleting script:", error);
    res.status(500).json({
      error: "Failed to delete script",
      details: error.message,
    });
  }
});

// Route to delete a script run
app.delete("/runs/:runId", async (req, res) => {
  try {
    const { runId } = req.params;

    // Check if script run exists
    const existingRun = await getScriptRuns.getRunById(runId);
    if (!existingRun) {
      return res.status(404).json({ error: "Script run not found" });
    }

    // Delete the script run
    const deletionResult = await deleteScript.deleteRunById(runId);

    res.status(200).json({
      message: "Script run deleted successfully",
      deletedRun: {
        id: existingRun.id,
        status: existingRun.status,
      },
      logFileDeleted: deletionResult.logFileDeleted,
    });
  } catch (error) {
    console.error("Error deleting script run:", error);
    res.status(500).json({
      error: "Failed to delete script run",
      details: error.message,
    });
  }
});

// Route to get statistics for dashboard
app.get("/stats", async (req, res) => {
  try {
    const stats = await getScripts.getStatistics();

    res.status(200).json({
      message: "Statistics retrieved successfully",
      stats,
    });
  } catch (error) {
    console.error("Error retrieving statistics:", error);
    res.status(500).json({
      error: "Failed to retrieve statistics",
      details: error.message,
    });
  }
});

export default app;
