const express = require('express');
const router = express.Router();
const { getContactInfo } = require('../controllers/contactInfoController');

router.get('/', getContactInfo);

module.exports = router;
