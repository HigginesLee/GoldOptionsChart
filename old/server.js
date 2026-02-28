const express = require('express');
const path = require('path');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const fs = require('fs').promises;

// 初始化日志
console.log('=== CME数据获取工具 ===');
console.log('开始初始化程序...');

// 创建Express应用
const app = express();
const port = 11462;

// 中间件配置
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

// 合约编号映射
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

// 请求头配置
const headers_standard = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2",
  "Sec-GPC": "1",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
  "referrer": "https://www.cmegroup.com/markets/metals/precious/gold.volume.options.html"
};

// 代理配置
let proxyAgent;
try {
  proxyAgent = new HttpsProxyAgent({
    host: '127.0.0.1',
    port: 10808
  });
  console.log('代理配置初始化成功 (127.0.0.1:10809)');
} catch (err) {
  console.error('⚠️ 代理配置初始化失败:', err.message);
  console.warn('⚠️ 警告: 将尝试不使用代理进行连接');
  proxyAgent = null; // 不使用代理
}

// 数据获取和保存函数
async function fetchAndSaveData(url, querycontractNum) {
  try {
    console.log('请求URL:', url);
    
    // 准备请求配置
    const requestConfig = {
      headers: headers_standard,
      withCredentials: true
    };
    
    // 如果代理可用，则添加代理配置
    if (proxyAgent) {
      requestConfig.httpsAgent = proxyAgent;
    }
    
    // 发送请求
    const response = await axios.get(url, requestConfig);
    console.log('请求成功，状态码:', response.status);

    // 准备要写入的内容
    const fileContent = `// CME Group数据 - 抓取时间: ${new Date().toString()}
const mockData = ${JSON.stringify(response.data, null, 2)};
`;

    // 确保data目录存在
    const dataDir = path.join(__dirname, 'data');
    try {
      await fs.access(dataDir);
    } catch {
      await fs.mkdir(dataDir);
      console.log('已创建数据存储目录: data/');
    }

    // 保存文件路径（带时间戳）
    const timestamp = new Date().toString().replace(/:/g, '-');
    const filePath = path.join(dataDir, `data-${querycontractNum}-数据抓取时间${timestamp}.js`);

    // 写入文件
    await fs.writeFile(filePath, `${fileContent}\nwindow.mockData = mockData`, 'utf8');
    console.log(`数据已保存到: ${filePath}`);

    return {
      success: true,
      message: `数据已成功保存到: "${filePath}"`,
      data: response.data
    };
  } catch (error) {
    console.error('操作失败:', error.message);
    let errorDetails = error.message;
    if (error.response) {
      errorDetails += `, 响应状态码: ${error.response.status}`;
    }
    return {
      success: false,
      message: `操作失败: ${errorDetails}`
    };
  }
}

// 生成合约数据URL
async function generateContractDataUrl(contractName) {
  try {
    const url = `https://www.cmegroup.com/CmeWS/mvc/Volume/TradeDates?exchange=CBOT&isProtected&_t=${new Date().valueOf()}`;
    
    // 准备请求配置
    const requestConfig = {
      headers: headers_standard,
      withCredentials: true
    };
    
    // 如果代理可用，则添加代理配置
    if (proxyAgent) {
      requestConfig.httpsAgent = proxyAgent;
    }
    
    const response = await axios.get(url, requestConfig);

    if (!response.data || response.data.length === 0) {
      throw new Error('未获取到合约日期数据');
    }
    
    console.log("合约最新日期:", response.data[0]["tradeDate"]);
    const contractDataUrl = `https://www.cmegroup.com/CmeWS/mvc/Volume/Options/Details?productid=192&tradedate=${response.data[0]["tradeDate"]}&expirationcode=${contractNum[contractName]}&reporttype=P&isProtected&_t=${new Date().valueOf()}`;
    return contractDataUrl;
  } catch (error) {
    console.error('生成合约URL失败:', error.message);
    throw error;
  }
}

// API端点：获取合约数据
app.post('/fetch-data', async (req, res) => {
  const { contractCode } = req.body;
  
  if (!contractCode) {
    return res.json({
      success: false,
      message: '请提供合约代码'
    });
  }
  
  try {
    const numberValue = parseInt(contractCode.replace(/-/g, ''), 10);
    const queryContract = contractCompasionTable[numberValue];
    
    if (!queryContract) {
      return res.json({
        success: false,
        message: `找不到合约代码 ${contractCode} 对应的合约`
      });
    }
    
    console.log('尝试获取合约:', queryContract);
    const url = await generateContractDataUrl(queryContract);
    const result = await fetchAndSaveData(url, numberValue);
    
    res.json(result);
  } catch (error) {
    res.json({
      success: false,
      message: `处理请求时出错: ${error.message}`
    });
  }
});

// API端点：获取所有可用合约
app.get('/contracts', (req, res) => {
  res.json({
    success: true,
    contracts: Object.keys(contractCompasionTable).map(code => ({
      code,
      name: contractCompasionTable[code]
    }))
  });
});

// 首页路由
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 创建前端页面内容
const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CME合约数据获取工具</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/font-awesome@4.7.0/css/font-awesome.min.css" rel="stylesheet">
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        primary: '#3b82f6',
                        secondary: '#10b981',
                        danger: '#ef4444',
                        dark: '#1e293b',
                    },
                    fontFamily: {
                        sans: ['Inter', 'system-ui', 'sans-serif'],
                    },
                }
            }
        }
    </script>
    <style type="text/tailwindcss">
        @layer utilities {
            .content-auto {
                content-visibility: auto;
            }
            .transition-custom {
                transition: all 0.3s ease;
            }
        }
    </style>
</head>
<body class="bg-gray-50 min-h-screen">
    <div class="container mx-auto px-4 py-8 max-w-4xl">
        <header class="mb-8 text-center">
            <h1 class="text-[clamp(1.8rem,4vw,2.5rem)] font-bold text-dark mb-2">CME合约数据获取工具</h1>
            <p class="text-gray-600">输入合约代码，获取并保存相关数据</p>
        </header>

        <main class="bg-white rounded-xl shadow-md p-6 mb-8 transform hover:shadow-lg transition-custom">
            <div class="flex flex-col md:flex-row gap-4 mb-6">
                <div class="flex-1">
                    <label for="contractCode" class="block text-sm font-medium text-gray-700 mb-1">合约代码</label>
                    <div class="relative">
                        <input 
                            type="text" 
                            id="contractCode" 
                            placeholder="例如: 2509" 
                            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition-custom"
                        >
                        <div class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                            <i class="fa fa-info-circle text-gray-400" title="输入合约代码，如2509表示2025年9月"></i>
                        </div>
                    </div>
                </div>
                <div class="flex items-end">
                    <button 
                        id="fetchButton" 
                        class="bg-primary hover:bg-primary/90 text-white font-medium px-6 py-2 rounded-lg transition-custom flex items-center gap-2"
                    >
                        <i class="fa fa-download"></i>
                        <span>获取数据</span>
                    </button>
                </div>
            </div>

            <div class="mb-6">
                <h2 class="text-lg font-semibold text-gray-800 mb-3">可用合约代码</h2>
                <div id="contractList" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-40 overflow-y-auto p-2 bg-gray-50 rounded-lg">
                    <!-- 合约列表将通过JavaScript动态生成 -->
                </div>
            </div>

            <div id="statusMessage" class="hidden p-4 rounded-lg mb-4"></div>

            <div id="loadingIndicator" class="hidden flex justify-center items-center py-6">
                <div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
            </div>

            <div id="resultContainer" class="hidden mt-6">
                <h2 class="text-lg font-semibold text-gray-800 mb-3">数据预览</h2>
                <div class="bg-gray-50 p-4 rounded-lg overflow-x-auto max-h-60 overflow-y-auto">
                    <pre id="resultPreview" class="text-sm text-gray-800"></pre>
                </div>
            </div>
        </main>

        <footer class="text-center text-gray-500 text-sm">
            <p>© 2023 CME合约数据获取工具 | 数据来源: CME Group</p>
        </footer>
    </div>

    <script>
        document.addEventListener('DOMContentLoaded', () => {
            const contractCodeInput = document.getElementById('contractCode');
            const fetchButton = document.getElementById('fetchButton');
            const statusMessage = document.getElementById('statusMessage');
            const loadingIndicator = document.getElementById('loadingIndicator');
            const resultContainer = document.getElementById('resultContainer');
            const resultPreview = document.getElementById('resultPreview');
            const contractList = document.getElementById('contractList');

            // 加载可用合约列表
            fetch('/contracts')
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        data.contracts.forEach(contract => {
                            const contractItem = document.createElement('div');
                            contractItem.className = 'bg-white p-2 rounded border border-gray-200 hover:border-primary cursor-pointer transition-custom';
                            contractItem.innerHTML = \`
                                <div class="font-medium">\${contract.code}</div>
                                <div class="text-xs text-gray-500">\${contract.name}</div>
                            \`;
                            contractItem.addEventListener('click', () => {
                                contractCodeInput.value = contract.code;
                            });
                            contractList.appendChild(contractItem);
                        });
                    }
                })
                .catch(error => {
                    showMessage('加载合约列表失败', 'error');
                    console.error('Error loading contracts:', error);
                });

            // 显示消息
            function showMessage(text, type = 'info') {
                statusMessage.textContent = text;
                statusMessage.classList.remove('hidden', 'bg-green-100', 'text-green-800', 'bg-red-100', 'text-red-800', 'bg-blue-100', 'text-blue-800');
                
                if (type === 'success') {
                    statusMessage.classList.add('bg-green-100', 'text-green-800');
                } else if (type === 'error') {
                    statusMessage.classList.add('bg-red-100', 'text-red-800');
                } else {
                    statusMessage.classList.add('bg-blue-100', 'text-blue-800');
                }
            }

            // 隐藏消息
            function hideMessage() {
                statusMessage.classList.add('hidden');
            }

            // 显示加载指示器
            function showLoading() {
                loadingIndicator.classList.remove('hidden');
                resultContainer.classList.add('hidden');
                hideMessage();
            }

            // 隐藏加载指示器
            function hideLoading() {
                loadingIndicator.classList.add('hidden');
            }

            // 处理获取数据
            fetchButton.addEventListener('click', async () => {
                const contractCode = contractCodeInput.value.trim();
                
                if (!contractCode) {
                    showMessage('请输入合约代码', 'error');
                    return;
                }

                showLoading();

                try {
                    const response = await fetch('/fetch-data', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ contractCode })
                    });

                    const result = await response.json();
                    hideLoading();

                    if (result.success) {
                        showMessage(result.message, 'success');
                        
                        // 显示数据预览（只显示前1000个字符）
                        const dataStr = JSON.stringify(result.data, null, 2);
                        resultPreview.textContent = dataStr.length > 1000 
                            ? dataStr.substring(0, 1000) + '...\\n\\n(数据已截断以提高性能)' 
                            : dataStr;
                        resultContainer.classList.remove('hidden');
                    } else {
                        showMessage(result.message, 'error');
                        resultContainer.classList.add('hidden');
                    }
                } catch (error) {
                    hideLoading();
                    showMessage('请求失败: ' + error.message, 'error');
                    console.error('Error:', error);
                }
            });

            // 支持回车键提交
            contractCodeInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    fetchButton.click();
                }
            });
        });
    </script>
</body>
</html>`;

// 启动服务器函数
async function startServer() {
  try {
    // 确保public目录存在
    const publicDir = path.join(__dirname, 'public');
    try {
      await fs.access(publicDir);
      console.log('public目录已存在');
    } catch {
      await fs.mkdir(publicDir);
      console.log('已创建public目录');
    }

    // 写入index.html文件
    await fs.writeFile(path.join(publicDir, 'index.html'), htmlContent, 'utf8');
    console.log('前端页面已准备就绪');

    // 启动服务器
    app.listen(port, () => {
      console.log(`\n服务器启动成功!`);
      console.log(`请在浏览器中访问: http://localhost:${port}`);
      console.log(`提示: 输入合约代码(如2509)并点击"获取数据"按钮开始`);
    });

  } catch (err) {
    console.error('\n❌ 服务器启动失败:');
    console.error('错误信息:', err.message);
    console.error('错误位置:', err.stack);
  }
}

// 启动服务器
startServer();
