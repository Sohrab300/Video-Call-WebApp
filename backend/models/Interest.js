// models/Interest.js
const { DataTypes } = require('sequelize');
const sequelize = require('../database'); // adjust path if necessary

const Interest = sequelize.define('Interest', {
  // Auto-generated primary key id is provided by default.
  socketId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  interest: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  matched: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  roomId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
}, {
  timestamps: true, // This will add createdAt and updatedAt fields
  updatedAt: false, // If you don’t need updatedAt, you can disable it.
});

module.exports = Interest;
