const { Sequelize } = require('sequelize');

// Use the DATABASE_URL environment variable if available, otherwise fall back to your Render connection string.
const connectionString = process.env.DATABASE_URL || 
  'postgresql://postgres:HcVLKWeB7hdEzvqH@db.ycavrssuyrfqijxlzpxm.supabase.co:5432/postgres';

const sequelize = new Sequelize(connectionString, {
  dialect: 'postgres',
  protocol: 'postgres',
  logging: false, 
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false, 
    },
    connectTimeout: 30000, 
  },
});

module.exports = sequelize;
