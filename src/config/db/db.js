import { Sequelize } from "sequelize";
import chalk from "chalk";
const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: "./database.db", // SQLite file location
  logging: false, // Disable SQL logging
});

export async function initDB() {
  try {
    // Import models to register them with sequelize
    await import("../../scripts/models.js");

    // Sync database with models
    await sequelize.sync({ alter: true });
    console.log("Database Initialized and synced");
  } catch (error) {
    console.error("Database initialization failed:", error);
    throw error;
  }
}

export const connectDB = async () => {
  try {
    await sequelize.sync({
      // alter: true,
    });

    console.log(chalk.yellow.underline("Connected to SQLite database"));
  } catch (error) {
    console.error("Database connection failed:", error);
    throw error;
  }
};

export default sequelize;
