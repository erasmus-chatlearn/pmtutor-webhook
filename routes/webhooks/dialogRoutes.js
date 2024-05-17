const express = require('express');
const dialogController = require('../../controllers/webhooks/dialogController');
const router = express.Router();
router.post('/latest', dialogController.useDefaultDialogService);
router.post('/:serviceName', dialogController.handleDynamicDialogService);
module.exports = router;
