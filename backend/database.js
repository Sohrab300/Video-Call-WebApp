const { Sequelize } = require('sequelize');

// Use the DATABASE_URL environment variable if available, otherwise fall back to your Render connection string.
const connectionString = process.env.DATABASE_URL || 
  'postgresql://golmaal_interests_db_3686_user:1vLo0UpvQqf8aZaOaty4x4YveT54D0tH@dpg-d0teskc9c44c739dlt00-a.oregon-postgres.render.com/golmaal_interests_db_3686';

const sequelize = new Sequelize(connectionString, {
  dialect: 'postgres',
  protocol: 'postgres',
  logging: false, // set to true for detailed SQL logging if needed
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false, // Use false for self-signed certificates; set to true in production if using a trusted CA
    },
    connectTimeout: 30000, // increase connection timeout to 30 seconds
  },
});

module.exports = sequelize;
