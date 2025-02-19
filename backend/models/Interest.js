// models/Interest.js
const { DataTypes } = require('sequelize');
const sequelize = require('../database');

const Interest = sequelize.define('Interest', {
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
  embedding: {
    type: DataTypes.JSON,
    allowNull: false,
  },
}, {
  timestamps: true,
  updatedAt: false,
});

module.exports = Interest;
