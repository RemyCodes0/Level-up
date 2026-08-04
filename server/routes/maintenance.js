// routes/maintenance.js — public status check, no auth. Polled by the
// frontend's app-wide gate (App.tsx) on every page load.
const express = require("express");
const { getPublicMaintenanceStatus } = require("../controllers/maintenanceController");

const router = express.Router();

router.get("/", getPublicMaintenanceStatus);

module.exports = router;
