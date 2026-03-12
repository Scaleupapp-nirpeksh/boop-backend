const express = require('express');
const router = express.Router();
const publicController = require('../controllers/public.controller');

// No authentication required for public routes

router.get('/profile/:userId', publicController.getPublicProfile);

module.exports = router;
