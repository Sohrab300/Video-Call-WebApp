const { Sequelize } = require('sequelize');

const connectionString = process.env.DATABASE_URL;
const sslRejectUnauthorized =
  process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true' || Boolean(process.env.DB_SSL_CA);

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required');
}

const sequelize = new Sequelize(connectionString, {
  dialect: 'postgres',
  protocol: 'postgres',
  logging: false, 
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: sslRejectUnauthorized,
      ...(process.env.DB_SSL_CA ? { ca: process.env.DB_SSL_CA } : {}),
    },
    connectTimeout: 30000, 
  },
});

module.exports = sequelize;
