import dotenv from 'dotenv'

dotenv.config()


export const SERVERCONFIG = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || 3000,
  // MONGO_URI: process.env.MONGO_URI || 'mongodb://localhost:27017/myapp',
  // SESSION_SECRET: process.env.SESSION_SECRET || 'defaultsecret',
  REACT_CLIENT: process.env.REACT_CLIENT || 'http://localhost:3000',
}

