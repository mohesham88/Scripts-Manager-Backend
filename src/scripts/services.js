import { spawn } from "child_process";
import fs from "fs";
import path from "path";
// import { db } from './db'; // Your DB connection
import treeKill from "tree-kill";
import { Script, ScriptRun } from "./models.js";
import { Op } from "sequelize";
import { scriptSocket } from "../index.js";

import { PowerShell } from "node-powershell";

const running_processes = new Map();

export async function runScript(
  scriptId,
  scriptPath,
  type,
  executionPath = null
) {
  const timestamp = Date.now();
  const logDir = "logs";
  const logFile = path.join(logDir, `${scriptId}-${timestamp}.log`);

  // Ensure logs directory exists
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  const resolvedScriptPath = path.resolve(scriptPath);
  const scriptCommand =
    type === "ps1" || type === "powershell" ? "powershell.exe" : "cmd.exe";
  const args =
    type === "ps1" || type === "powershell"
      ? ["-ExecutionPolicy", "Bypass", "-File", resolvedScriptPath]
      : ["/c", resolvedScriptPath];

  console.log(`Running: ${scriptCommand} ${args.join(" ")}`);

  try {
    // Create log file write stream
    const logStream = fs.createWriteStream(logFile, { flags: "a" });

    const options = {
      detached: type === "ps1" || type === "powershell" ? false : true,
      shell: true, // Use shell to handle command execution
      stdio: ["pipe", "pipe", "pipe"], // return stdin to ignore
      windowsHide: true, // Hide the console window on Windows
    };

    // Create script run record in database
    const scriptRun = await ScriptRun.create({
      scriptId: scriptId,
      startTime: new Date(),
      status: "running",
      logFile: logFile,
      progress: 0,
      /*  pid: proc.pid, */
    });

    // Emit run started event
    scriptSocket.emitRunUpdate(scriptRun.id, {
      status: "running",
      startTime: scriptRun.startTime,
      progress: 0,
    });

    if (type === "ps1" || type === "powershell") {
      run_powershell_script(resolvedScriptPath, scriptRun, logStream);
      return { scriptRunId: scriptRun.id, logFile };
    }

    const proc = spawn(scriptCommand, args, options);

    // Pipe process output directly to log file
    proc.stdout.pipe(logStream);
    proc.stderr.pipe(logStream);

    proc.stdout.on("data", async (data) => {
      const text = data.toString();
      // console.log("stdout data:", text);
      const match = text.match(/PROGRESS:\s*(\d+)/i);
      if (match) {
        const progress = parseInt(match[1]);
        console.log("progress", progress);
        if (!isNaN(progress)) {
          await scriptRun.update({ progress });

          // scriptSocket.emitProgressUpdate(scriptRun.id, progress);
          scriptSocket.emitRunUpdate(scriptRun.id, {
            ...scriptRun,
            progress,
          });
        }
      }
      scriptSocket.emitRunUpdate(scriptRun.id, {
        log: text,
        type: "stdout",
        ...scriptRun,
      });
    });

    proc.stderr.on("data", (data) => {
      const text = data.toString();
      console.log("stderr data:", text);
      logStream.write(text);

      // Emit error log
      scriptSocket.emitRunUpdate(scriptRun.id, {
        log: text,
        type: "stderr",
      });
    });

    proc.on("exit", (code, signal) => {
      console.log(
        `Child process exited with code ${code} and signal ${signal}`
      );
      // Handle exit event
      if (code) {
        console.error("Child exited with code", code);
      } else if (signal) {
        console.error("Child was killed with signal", signal);
      } else {
        console.log("Child exited okay");
      }
    });

    proc.on("close", async (code) => {
      console.log("script closed with code:", code);

      const status = code === 0 ? "completed" : "failed";
      console.log(
        `Script ${scriptId} finished with status: ${status} (exit code: ${code})`
      );

      const endTime = new Date();

      // Update script run record
      await scriptRun.update({
        status: status,
        endTime: endTime,
        progress: 100,
      });

      // Emit completion event
      scriptSocket.emitRunComplete(scriptRun.id, status, endTime);

      logStream.end();
    });

    proc.on("error", async (error) => {
      // errors happening initializing the process
      console.error(`Script ${scriptId} error:`, error);

      const endTime = new Date();

      await scriptRun.update({
        status: "failed",
        endTime: endTime,
      });

      // Emit error event
      scriptSocket.emitRunError(scriptRun.id, error.message);
    });

    proc.unref(); // Let it run in background

    return { scriptRunId: scriptRun.id, logFile };
  } catch (error) {
    console.error("Error starting script:", error);
    throw error;
  }
}

async function script_run_update(data, scriptRun, logStream, error = false) {
  const text = data.toString();
  console.log(text);
  // console.log("stdout data:", text);
  const match = text.match(/PROGRESS:\s*(\d+)/i);
  if (match) {
    const progress = parseInt(match[1]);
    console.log("progress", progress);
    if (!isNaN(progress)) {
      await scriptRun.update({ progress });

      // scriptSocket.emitProgressUpdate(scriptRun.id, progress);
      scriptSocket.emitRunUpdate(scriptRun.id, {
        ...scriptRun,
        progress,
        log: text,
      });
    }
  }
  scriptSocket.emitRunUpdate(scriptRun.id, {
    log: text,
    type: "stdout",
    ...scriptRun,
  });
  logStream.write(text);
}

const bulk_map = new Map();

function check_bulk(data, scriptRunId) {
  const text = data.toString();
  const BULK_DELIMITER_LENGTH = 18;
  if (text.length === BULK_DELIMITER_LENGTH) {
    if (bulk_map.has(scriptRunId)) {
      if (bulk_map.get(scriptRunId) === text) {
        return true;
      }
      return false;
    } else {
      bulk_map.set(scriptRunId, text);
    }
    return true;
  }
  return false;
}

async function run_powershell_script(scriptPath, scriptRun, logStream) {
  const script = fs.readFileSync(scriptPath, "utf8");

  const ps = new PowerShell({
    verbose: true,
    executionPolicy: "Bypass",
    noProfile: false,
  });

  running_processes.set(scriptRun.id, ps);
  ps.streams.stdout.on("data", async (data) => {
    console.log("stdout data:", data);
    if (!check_bulk(data, scriptRun.id)) {
      script_run_update(data, scriptRun, logStream);
    }
  });

  ps.streams.stderr.on("data", async (data) => {
    if (!check_bulk(data, scriptRun.id)) {
      script_run_update(data, scriptRun, logStream, true);
    }
  });

  let status = "",
    endTime = new Date(),
    progress = 0;

  ps.invoke(script)
    .then((result) => {
      status = "completed";
      endTime = new Date();
      progress = 100;
    })
    .catch((error) => {
      status = "failed";
      endTime = new Date();
      progress = 100;
    })
    .finally(async () => {
      try {
        running_processes.delete(scriptRun.id);
        await scriptRun.update({
          status: status,
          endTime: endTime,
          progress: progress,
        });
        scriptSocket.emitRunComplete(scriptRun.id, status, endTime);
        bulk_map.delete(scriptRun.id);
        logStream.end();
        ps.dispose()
          .then(() => {})
          .catch((error) => {
            console.error(
              `Error disposing powershell process ${scriptRun.id}:`,
              error
            );
          });
      } catch (error) {
        console.error("Error deleting bulk map:", error);
      }
    });
}
// Service functions for adding scripts
export const addScript = {
  // Create a script file from text content
  async createScriptFile(name, scriptContent, type) {
    const scriptsDir = "scripts";

    // Ensure scripts directory exists
    if (!fs.existsSync(scriptsDir)) {
      fs.mkdirSync(scriptsDir, { recursive: true });
    }

    // Determine file extension based on script type
    const extension = type === "powershell" ? ".ps1" : ".bat";
    const timestamp = Date.now();
    const filename = `${name.replace(
      /[^a-zA-Z0-9]/g,
      "_"
    )}-${timestamp}${extension}`;
    const filePath = path.join(scriptsDir, filename);

    // Write script content to file
    fs.writeFileSync(filePath, scriptContent, "utf8");

    return filePath;
  },

  // Save script metadata to database
  async saveToDatabase(scriptData) {
    try {
      const script = await Script.create({
        name: scriptData.name,
        description: scriptData.description,
        type: scriptData.type,
        filePath: scriptData.filePath,
      });

      return script;
    } catch (error) {
      console.error("Error saving script to database:", error);
      throw error;
    }
  },

  async saveMultipleToDatabase(scripts) {
    try {
      const createdScripts = await Script.bulkCreate(scripts, {
        validate: true,
      });
      return createdScripts;
    } catch (error) {
      console.error("Error saving multiple scripts to database:", error);
      throw error;
    }
  },
};

// Service functions for retrieving scripts
export const getScripts = {
  // Get all scripts with pagination, sorting, and filtering
  async getAllScripts(options = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        sortBy = "createdAt",
        sortOrder = "DESC",
        type,
        search,
      } = options;

      // Calculate offset for pagination
      const offset = (page - 1) * limit;

      // Build where clause for filtering
      const whereClause = {};
      if (type && ["batch", "powershell"].includes(type)) {
        whereClause.type = type;
      }
      if (search) {
        whereClause[Op.or] = [
          { name: { [Op.like]: `%${search}%` } },
          { description: { [Op.like]: `%${search}%` } },
        ];
      }

      // Validate sort fields
      const allowedSortFields = ["name", "type", "createdAt", "updatedAt"];
      const validSortBy = allowedSortFields.includes(sortBy)
        ? sortBy
        : "createdAt";
      const validSortOrder = ["ASC", "DESC"].includes(sortOrder.toUpperCase())
        ? sortOrder.toUpperCase()
        : "DESC";

      // Get scripts with pagination
      const { count, rows } = await Script.findAndCountAll({
        where: whereClause,
        order: [[validSortBy, validSortOrder]],
        limit: parseInt(limit),
        offset: parseInt(offset),
        include: [
          {
            model: ScriptRun,
            attributes: ["id", "status", "startTime", "endTime"],
            order: [["createdAt", "DESC"]],
            limit: 3, // Show last 3 runs per script
            required: false,
          },
        ],
      });

      // Calculate pagination metadata
      const totalPages = Math.ceil(count / limit);
      const hasNextPage = page < totalPages;
      const hasPrevPage = page > 1;

      return {
        scripts: rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: count,
          itemsPerPage: parseInt(limit),
          hasNextPage,
          hasPrevPage,
        },
      };
    } catch (error) {
      console.error("Error retrieving scripts:", error);
      throw error;
    }
  },

  // Get script by ID
  async getScriptById(id) {
    try {
      const script = await Script.findByPk(id, {
        include: [
          {
            model: ScriptRun,
            order: [["createdAt", "DESC"]],
            limit: 5, // Get last 5 runs
          },
        ],
      });
      return script;
    } catch (error) {
      console.error("Error retrieving script:", error);
      throw error;
    }
  },

  // Get statistics for dashboard
  async getStatistics() {
    try {
      // Get total counts
      const totalScripts = await Script.count();
      const totalRuns = await ScriptRun.count();

      // Get counts by script type
      const scriptsByType = await Script.findAll({
        attributes: ["type", [Op.fn("COUNT", Op.col("id")), "count"]],
        group: ["type"],
        raw: true,
      });

      // Get counts by run status
      const runsByStatus = await ScriptRun.findAll({
        attributes: ["status", [Op.fn("COUNT", Op.col("id")), "count"]],
        group: ["status"],
        raw: true,
      });

      // Get recent activity (last 24 hours)
      const last24Hours = new Date();
      last24Hours.setHours(last24Hours.getHours() - 24);

      const recentRuns = await ScriptRun.count({
        where: {
          startTime: {
            [Op.gte]: last24Hours,
          },
        },
      });

      // Get currently running scripts
      const currentlyRunning = await ScriptRun.count({
        where: {
          status: "running",
        },
      });

      // Get success rate (last 100 runs)
      const last100Runs = await ScriptRun.findAll({
        attributes: ["status"],
        order: [["createdAt", "DESC"]],
        limit: 100,
        raw: true,
      });

      const successfulRuns = last100Runs.filter(
        (run) => run.status === "completed"
      ).length;
      const successRate =
        last100Runs.length > 0
          ? ((successfulRuns / last100Runs.length) * 100).toFixed(1)
          : 0;

      return {
        overview: {
          totalScripts,
          totalRuns,
          recentRuns,
          currentlyRunning,
          successRate: parseFloat(successRate),
        },
        scriptsByType: scriptsByType.reduce((acc, item) => {
          acc[item.type] = parseInt(item.count);
          return acc;
        }, {}),
        runsByStatus: runsByStatus.reduce((acc, item) => {
          acc[item.status] = parseInt(item.count);
          return acc;
        }, {}),
      };
    } catch (error) {
      console.error("Error retrieving statistics:", error);
      throw error;
    }
  },
};

// Service functions for retrieving script runs
export const getScriptRuns = {
  // Get all script runs for a specific script with pagination
  async getByScriptId(scriptId, options = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        sortBy = "createdAt",
        sortOrder = "DESC",
        status,
      } = options;

      const offset = (page - 1) * limit;

      // Build where clause
      const whereClause = { scriptId };
      if (
        status &&
        ["pending", "running", "completed", "failed"].includes(status)
      ) {
        whereClause.status = status;
      }

      // Validate sort fields
      const allowedSortFields = [
        "startTime",
        "endTime",
        "status",
        "progress",
        "createdAt",
      ];
      const validSortBy = allowedSortFields.includes(sortBy)
        ? sortBy
        : "createdAt";
      const validSortOrder = ["ASC", "DESC"].includes(sortOrder.toUpperCase())
        ? sortOrder.toUpperCase()
        : "DESC";

      const { count, rows } = await ScriptRun.findAndCountAll({
        where: whereClause,
        order: [[validSortBy, validSortOrder]],
        limit: parseInt(limit),
        offset: parseInt(offset),
        include: [
          {
            model: Script,
            attributes: ["name", "type"],
          },
        ],
      });

      const totalPages = Math.ceil(count / limit);

      return {
        scriptRuns: rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: count,
          itemsPerPage: parseInt(limit),
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      };
    } catch (error) {
      console.error("Error retrieving script runs:", error);
      throw error;
    }
  },

  // Get all script runs with pagination, sorting, and filtering
  async getAllRuns(options = {}) {
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
      } = options;

      const offset = (page - 1) * limit;

      // Build where clause for filtering
      const whereClause = {};
      if (
        status &&
        ["pending", "running", "completed", "failed"].includes(status)
      ) {
        whereClause.status = status;
      }
      if (scriptId) {
        whereClause.scriptId = scriptId;
      }
      if (dateFrom || dateTo) {
        whereClause.startTime = {};
        if (dateFrom) {
          whereClause.startTime[Op.gte] = new Date(dateFrom);
        }
        if (dateTo) {
          whereClause.startTime[Op.lte] = new Date(dateTo);
        }
      }

      // Validate sort fields
      const allowedSortFields = [
        "startTime",
        "endTime",
        "status",
        "progress",
        "createdAt",
      ];
      const validSortBy = allowedSortFields.includes(sortBy)
        ? sortBy
        : "createdAt";
      const validSortOrder = ["ASC", "DESC"].includes(sortOrder.toUpperCase())
        ? sortOrder.toUpperCase()
        : "DESC";

      const { count, rows } = await ScriptRun.findAndCountAll({
        where: whereClause,
        order: [[validSortBy, validSortOrder]],
        limit: parseInt(limit),
        offset: parseInt(offset),
        include: [
          {
            model: Script,
            attributes: ["name", "type", "description"],
          },
        ],
      });

      const totalPages = Math.ceil(count / limit);

      return {
        scriptRuns: rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: count,
          itemsPerPage: parseInt(limit),
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      };
    } catch (error) {
      console.error("Error retrieving all script runs:", error);
      throw error;
    }
  },

  // Get script run by ID
  async getRunById(id) {
    try {
      const scriptRun = await ScriptRun.findByPk(id, {
        include: [
          {
            model: Script,
            attributes: ["name", "type", "description"],
          },
        ],
      });
      return scriptRun;
    } catch (error) {
      console.error("Error retrieving script run:", error);
      throw error;
    }
  },
};

// Service functions for updating scripts
export const updateScript = {
  // Create updated script file from new content
  async createUpdatedScriptFile(existingScript, newContent, type) {
    const scriptsDir = "scripts";

    // Ensure scripts directory exists
    if (!fs.existsSync(scriptsDir)) {
      fs.mkdirSync(scriptsDir, { recursive: true });
    }

    // Determine file extension based on script type
    const extension = type === "powershell" ? ".ps1" : ".bat";
    const timestamp = Date.now();
    const filename = `${existingScript.name.replace(
      /[^a-zA-Z0-9]/g,
      "_"
    )}-updated-${timestamp}${extension}`;
    const filePath = path.join(scriptsDir, filename);

    // Write updated script content to file
    fs.writeFileSync(filePath, newContent, "utf8");

    return filePath;
  },

  // Update script in database
  async updateInDatabase(scriptId, updateData) {
    try {
      const script = await Script.findByPk(scriptId);
      if (!script) {
        throw new Error("Script not found");
      }

      // If we're replacing the file, delete the old one
      if (updateData.replaceFile && updateData.oldFilePath) {
        try {
          if (fs.existsSync(updateData.oldFilePath)) {
            fs.unlinkSync(updateData.oldFilePath);
            console.log(`Deleted old script file: ${updateData.oldFilePath}`);
          }
        } catch (error) {
          console.warn(`Failed to delete old script file: ${error.message}`);
        }
      }

      // Remove helper properties before updating
      const { replaceFile, oldFilePath, ...dbUpdateData } = updateData;

      // Update the script
      await script.update(dbUpdateData);

      return script;
    } catch (error) {
      console.error("Error updating script in database:", error);
      throw error;
    }
  },
};

// Service functions for deleting scripts
export const deleteScript = {
  // Delete script from database and optionally file system
  async deleteFromDatabase(scriptId, options = {}) {
    const { deleteRuns = false, filePath } = options;

    try {
      const script = await Script.findByPk(scriptId);
      if (!script) {
        throw new Error("Script not found");
      }

      let deletedRuns = 0;
      let fileDeleted = false;

      // Delete associated script runs if requested
      if (deleteRuns) {
        const runCount = await ScriptRun.destroy({
          where: { scriptId },
        });
        deletedRuns = runCount;
        console.log(`Deleted ${runCount} script runs for script ${scriptId}`);
      }

      // Delete the script file
      if (filePath) {
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            fileDeleted = true;
            console.log(`Deleted script file: ${filePath}`);
          }
        } catch (error) {
          console.warn(`Failed to delete script file: ${error.message}`);
        }
      }

      // Delete the script from database
      await script.destroy();

      return {
        deletedRuns,
        fileDeleted,
      };
    } catch (error) {
      console.error("Error deleting script:", error);
      throw error;
    }
  },

  // Delete script run by ID (for cleanup)
  async deleteRunById(runId) {
    try {
      const scriptRun = await ScriptRun.findByPk(runId);
      if (!scriptRun) {
        throw new Error("Script run not found");
      }

      // Delete associated log file if it exists
      if (scriptRun.logFile && fs.existsSync(scriptRun.logFile)) {
        try {
          fs.unlinkSync(scriptRun.logFile);
          console.log(`Deleted log file: ${scriptRun.logFile}`);
        } catch (error) {
          console.warn(`Failed to delete log file: ${error.message}`);
        }
      }

      // Delete the script run
      await scriptRun.destroy();

      return { logFileDeleted: true };
    } catch (error) {
      console.error("Error deleting script run:", error);
      throw error;
    }
  },
};

export const killScriptRuns = async (id) => {
  const res = await getScriptRuns.getByScriptId(id, {
    status: "running",
  });

  const runs = res.scriptRuns;

  // make all of them failed
  for (const run of runs) {
    await ScriptRun.update(
      {
        status: "failed",
      },
      {
        where: { id: run.id },
      }
    );
    scriptSocket.emitRunUpdate(run.id, {
      status: "failed",
      message: "Script run killed",
    });
  }

  let scriptType = "";
  if (runs.length > 0) {
    const script = await Script.findByPk(runs[0].scriptId);
    scriptType = script.type;
  }

  // kill the processes
  for (const run of runs) {
    console.log(`Disposing powershell run ${run.id}`);
    if (scriptType === "powershell" || scriptType === "ps1") {
      const ps = running_processes.get(run.id);
      try {
        ps.streams.stdout.destroy();
        ps.streams.stderr.destroy();
        ps.streams.stdin.destroy();
        await ps.dispose("SIGINT");
        console.log("killed");
      } catch (error) {
        // console.error(`Error disposing powershell process ${run.id}:`, error);
      }
      continue;
    }
    if (run.pid) {
      treeKill(run.pid, (error) => {
        if (error) {
          console.error(`Error killing process ${run.pid}:`, error);
        } else {
          console.log(`Killed process ${run.pid}`);
        }
      });
    }
  }
};
