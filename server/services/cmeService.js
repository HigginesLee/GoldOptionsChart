const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
require('dotenv').config();

// 合约映射表
const contractCompasionTable = {
  "2509": "SEP 2025",
  "2510": "OCT 2025",
  "2511": "NOV 2025",
  "2512": "DEC 2025",
  "2601": "JAN 2026",
  "2602": "FEB 2026",
  "2603": "MAR 2026",
  "2604": "APR 2026",
  "2605": "MAY 2026",
  "2606": "JUN 2026",
  "2607": "JUL 2026",
  "2608": "AUG 2026",
  "2609": "DEC 2026"
};

const contractNum = {
  "SEP 2025": "U25",
  "OCT 2025": "V25",
  "NOV 2025": "X25",
  "DEC 2025": "Z25",
  "JAN 2026": "F26",
  "FEB 2026": "G26",
  "MAR 2026": "H26",
  "APR 2026": "J26",
  "MAY 2026": "K26",
  "JUN 2026": "M26",
  "JUL 2026": "N26",
  "AUG 2026": "Q26",
  "DEC 2026": "Z26",
};

// 创建代理实例
const proxyAgent = new HttpsProxyAgent({
  host: process.env.PROXY_HOST,
  port: process.env.PROXY_PORT
});

// 请求头配置
const headers = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2",
  "Sec-GPC": "1",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
  "referrer": "https://www.cmegroup.com/markets/metals/precious/gold.volume.options.html"
};

/**
 * 获取最新的交易日期
 */
async function getLatestTradeDate() {
  try {
    const url = `https://www.cmegroup.com/CmeWS/mvc/Volume/TradeDates?exchange=CBOT&isProtected&_t=${Date.now()}`;
    const response = await axios.get(url, {
      httpsAgent: proxyAgent,
      headers,
      withCredentials: true
    });
    return response.data[0]?.tradeDate;
  } catch (error) {
    console.error('获取交易日期失败:', error.message);
    throw new Error('获取交易日期失败');
  }
}

/**
 * 生成合约数据URL
 * @param {string} contractCode 合约代码（如2509）
 */
async function generateContractDataUrl(contractCode) {
  const contractName = contractCompasionTable[contractCode];
  if (!contractName) {
    throw new Error(`不支持的合约代码: ${contractCode}`);
  }
  
  const expirationCode = contractNum[contractName];
  if (!expirationCode) {
    throw new Error(`找不到合约代码映射: ${contractName}`);
  }
  
  const tradeDate = await getLatestTradeDate();
  console.log(`使用最新交易日期: ${tradeDate}, 合约: ${contractName}(${expirationCode})`);
  
  return `https://www.cmegroup.com/CmeWS/mvc/Volume/Options/Details?productid=${process.env.CME_PRODUCT_ID}&tradedate=${tradeDate}&expirationcode=${expirationCode}&reporttype=P&isProtected&_t=${Date.now()}`;
}

/**
 * 获取指定合约的期权数据
 * @param {string} contractCode 合约代码
 */
async function fetchOptionData(contractCode) {
  try {
    const url = await generateContractDataUrl(contractCode);
    console.log(`请求URL: ${url}`);
    
    const response = await axios.get(url, {
      httpsAgent: proxyAgent,
      headers,
      withCredentials: true
    });
    
    return {
      data: response.data,
      fetchTime: new Date().toISOString(),
      contractCode,
      contractName: contractCompasionTable[contractCode]
    };
  } catch (error) {
    console.error('获取期权数据失败:', error.message);
    if (error.response) {
      console.error('响应状态码:', error.response.status);
    }
    throw new Error(`获取${contractCode}合约数据失败: ${error.message}`);
  }
}

module.exports = {
  fetchOptionData,
  getSupportedContracts: () => Object.keys(contractCompasionTable)
};
