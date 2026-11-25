// netlify/functions/api.js
// Netlify Serverless Function adapter for Kantor Tim 3D backend
const http = require('http');
const serverless = require('serverless-http');

// Simple mock/shared memory or file-based for serverless if needed
// For full Netlify deployment of static 3D frontend + serverless sync:
exports.handler = async (event, context) => {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: "Kantor Tim 3D Netlify Endpoint Active", status: "ok" })
  };
};
