const express = require('express');
const router = express.Router();
router.get('/', (req, res) => res.send('Coaches route'));
module.exports = router;