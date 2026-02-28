const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const fs = require('fs').promises;
const path = require('path');

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
}

const contractNum = {
  "SEP 2025": "U25",//09 合约 8月份参考
  "OCT 2025": "V25",//10 合约 9月份参考
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
}

const headers_standard = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2",
  "Sec-GPC": "1",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
  "referrer": "https://www.cmegroup.com/markets/metals/precious/gold.volume.options.html"
}
const proxyAgent = new HttpsProxyAgent({
  host: '127.0.0.1',
  port: 10808
});


async function fetchAndSaveData(url) {
  try {
    console.log(url)
    // 发送请求
    const response = await axios.get(url, {
      httpsAgent: proxyAgent,
      headers: headers_standard,
      withCredentials: true
    });

    console.log('请求成功，准备保存数据...');

    // 准备要写入的内容，格式化为JS模块导出形式
    const fileContent = `// CME Group数据 - 抓取时间: ${new Date().toString()}
const mockData = ${JSON.stringify(response.data, null, 2)};
`;

    // 保存文件路径
    const filePath = path.join(__dirname, 'data.js');

    // 写入文件
    await fs.writeFile(filePath, `${fileContent}\nwindow.mockData = mockData`, 'utf8');
    console.log(`数据已成功保存到: "${filePath}"`);

    return response.data;
  } catch (error) {
    console.error('操作失败:', error.message);
    if (error.response) {
      console.error('响应状态码:', error.response.status);
      console.error('响应数据:', error.response.data);
    }
  }
}

async function generateContractDataUrl(contractName) {
  const url = `https://www.cmegroup.com/CmeWS/mvc/Volume/TradeDates?exchange=CBOT&isProtected&_t=${new Date().valueOf()}`;
  const response = await axios.get(url, {
    httpsAgent: proxyAgent,
    headers: headers_standard,
    withCredentials: true
  });

  console.log("合约最新日期", response.data[0]["tradeDate"])
  const contractDataUrl = `https://www.cmegroup.com/CmeWS/mvc/Volume/Options/Details?productid=192&tradedate=${response.data[0]["tradeDate"]}&expirationcode=${contractNum[contractName]}&reporttype=P&isProtected&_t=${new Date().valueOf()}`;
  return contractDataUrl
}

(async function () {
  const args = process.argv.slice(2);

  // 检查是否有参数传入
  if (args.length > 0) {
    const firstArg = args[0];
    const numberValue = parseInt(firstArg.replace(/-/g, ''), 10);
    const queryContract = contractCompasionTable[numberValue]
    console.log('尝试获取合约', queryContract)
    fetchAndSaveData(await generateContractDataUrl(queryContract))
  } else {
    console.log('请选择合约月份(eg. node updata.js 2509)!!!');
  }
})()

