// models/Script.js
import { DataTypes } from "sequelize";
import sequelize from "../config/db/db.js";

const Script = sequelize.define("Script", {
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  description: DataTypes.TEXT,
  type: {
    type: DataTypes.ENUM("batch", "powershell"),
    allowNull: false,
  },
  filePath: {
    type: DataTypes.STRING,
    allowNull: false,
  },
});

const ScriptRun = sequelize.define("ScriptRun", {
  startTime: DataTypes.DATE,
  endTime: DataTypes.DATE,
  status: {
    type: DataTypes.ENUM("pending", "running", "completed", "failed"),
    defaultValue: "pending",
  },
  progress: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  logFile: DataTypes.STRING,
  pid: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
});

// Associations
Script.hasMany(ScriptRun, {
  foreignKey: "scriptId",
  onDelete: "CASCADE", // when script is deleted its runs are deleted too
  hooks: true,
});
ScriptRun.belongsTo(Script, { foreignKey: "scriptId" });

export { Script, ScriptRun };
