const cmeService = require('../services/cmeService');

/**
 * 获取期权数据
 * @param {Request} req 
 * @param {Response} res 
 */
async function getOptionData(req, res) {
  try {
    const { contractCode } = req.params;
    
    if (!contractCode) {
      return res.status(400).json({
        success: false,
        message: '缺少合约代码参数'
      });
    }
    
    const data = await cmeService.fetchOptionData(contractCode);
    res.json({
      success: true,
      data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
}

/**
 * 获取支持的合约列表
 * @param {Request} req 
 * @param {Response} res 
 */
function getSupportedContracts(req, res) {
  try {
    const contracts = cmeService.getSupportedContracts();
    res.json({
      success: true,
      data: contracts
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
}

module.exports = {
  getOptionData,
  getSupportedContracts
};
