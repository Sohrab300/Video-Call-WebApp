// database.js
const { Sequelize } = require('sequelize');

// Use the DATABASE_URL environment variable if available, otherwise fall back to your Render connection string.
const connectionString = process.env.DATABASE_URL || 
  'postgresql://golmaal_interests_db_user:Xqsjb3ZHeMhTyIxIjLL3BtgtPFARvZeO@dpg-cuguall6l47c73bblck0-a/golmaal_interests_db';

const sequelize = new Sequelize(connectionString, {
  dialect: 'postgres',
  protocol: 'postgres',
  logging: false, // set to true for detailed SQL logging if needed
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false, // Use false for self-signed certificates; set to true in production if using a trusted CA
    },
  },
});

module.exports = sequelize;
