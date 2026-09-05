const express = require('express');
const router = express.Router();
const { handleWebhook } = require('../controllers/chowdeckWebhookController');

// IMPORTANT: this route must NOT go through express.json(). Signature
// verification needs the exact raw bytes Chowdeck sent - re-serializing a
// parsed JSON object (different key order/whitespace) would produce a
// different HMAC and every webhook would fail verification. That's why
// express.raw() is used here instead, and why this router is mounted in
// server.js BEFORE app.use(express.json()) — see server.js.
router.post('/', express.raw({ type: 'application/json' }), handleWebhook);

module.exports = router;
