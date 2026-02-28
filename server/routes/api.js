const express = require('express');
const router = express.Router();
const dataController = require('../controllers/dataController');

// 获取支持的合约列表
router.get('/contracts', dataController.getSupportedContracts);

// 获取指定合约的期权数据
router.get('/option-data/:contractCode', dataController.getOptionData);

module.exports = router;
