// 全局配置
let config = {
  minPrice: 3100,
  maxPrice: 3800,
  showStockLabels: true,
  showChangeLabels: true,
  stepSize: 5,
  changeThreshold: 8,
  currentMaxItems: 200,
  apiBaseUrl: '/api'
};

// 全局变量
let callChart = null;
let putChart = null;
let callChartData = null;
let putChartData = null;
let maxPainPrice = null;
let currentOptionData = null;
let supportedContracts = [];

// DOM元素
const elements = {
  contractSelector: document.getElementById('contractSelector'),
  loadContractData: document.getElementById('loadContractData'),
  minPrice: document.getElementById('minPrice'),
  maxPrice: document.getElementById('maxPrice'),
  setPriceRange: document.getElementById('setPriceRange'),
  dataRange: document.getElementById('dataRange'),
  currentCount: document.getElementById('currentCount'),
  highlightMaxPain: document.getElementById('highlightMaxPain'),
  showStockLabels: document.getElementById('showStockLabels'),
  showChangeLabels: document.getElementById('showChangeLabels'),
  toggleStep: document.getElementById('toggleStep'),
  changeThreshold: document.getElementById('changeThreshold'),
  setThreshold: document.getElementById('setThreshold'),
  saveCombinedChart: document.getElementById('saveCombinedChart'),
  maxPainPrice: document.getElementById('maxPainPrice'),
  maxPainContracts: document.getElementById('maxPainContracts'),
  loadingIndicator: document.getElementById('loadingIndicator'),
  chartsContainer: document.getElementById('chartsContainer'),
  dataInfo: document.getElementById('dataInfo')
};

// 黄金期权最大痛苦价值计算器类
class GoldMaxPainCalculator {
  constructor(rawData, options = {}) {
    this.config = {
      contractMultiplier: options.contractMultiplier || 100,
      minOpenInterest: options.minOpenInterest || 0,
      oiField: options.oiField || 'atClose',
      useValueWeight: options.useValueWeight !== undefined ? options.useValueWeight : true
    };

    this.rawData = rawData;
    this.normalizedOptions = [];
    this.maxPainResult = null;
  }

  normalizeData() {
    if (!this.rawData?.monthData || !Array.isArray(this.rawData.monthData)) {
      throw new Error("无效数据格式：缺少monthData数组");
    }

    this.normalizedOptions = [];

    this.rawData.monthData.forEach(monthItem => {
      const optionType = monthItem.label === "Calls" ? "call" : "put";

      if (monthItem.strikeData && Array.isArray(monthItem.strikeData)) {
        monthItem.strikeData.forEach(strikeItem => {
          const openInterest = this.parseNumber(strikeItem[this.config.oiField]);

          if (openInterest < this.config.minOpenInterest) {
            return;
          }

          const strikePrice = this.parseNumber(strikeItem.strike);
          if (strikePrice < config.minPrice || strikePrice > config.maxPrice) {
            return;
          }

          const contractValue = openInterest * this.config.contractMultiplier;

          this.normalizedOptions.push({
            strike: strikePrice,
            type: optionType,
            openInterest: openInterest,
            contractValue: contractValue
          });
        });
      }
    });

    return this;
  }

  parseNumber(value) {
    if (typeof value === 'number') {
      return value;
    }

    if (typeof value === 'string') {
      const cleaned = value.replace(/[^0-9.-]/g, '');
      return parseFloat(cleaned) || 0;
    }

    return 0;
  }

  calculate() {
    if (this.normalizedOptions.length === 0) {
      this.normalizeData();
    }

    const strikePrices = [...new Set(
      this.normalizedOptions.map(option => option.strike)
    )].sort((a, b) => a - b);

    const painDetails = {};
    strikePrices.forEach(price => {
      painDetails[price] = this.calculatePainAtPrice(price);
    });

    this.maxPainResult = this.findMaxPainPoint(painDetails);

    return {
      maxPainPrice: this.maxPainResult.maxPrice,
      maxPainValue: this.maxPainResult.maxValue,
      details: painDetails
    };
  }

  calculatePainAtPrice(price) {
    return this.normalizedOptions.reduce((totalPain, option) => {
      if (option.type === 'call' && price <= option.strike) {
        return totalPain + (this.config.useValueWeight ? option.contractValue : option.openInterest);
      }

      if (option.type === 'put' && price >= option.strike) {
        return totalPain + (this.config.useValueWeight ? option.contractValue : option.openInterest);
      }

      return totalPain;
    }, 0);
  }

  findMaxPainPoint(painDetails) {
    let maxPrice = null;
    let maxValue = 0;

    Object.entries(painDetails).forEach(([priceStr, value]) => {
      const price = parseFloat(priceStr);
      if (value > maxValue) {
        maxValue = value;
        maxPrice = price;
      }
    });

    return { maxPrice, maxValue };
  }
}

// 数据处理函数
function processChartData(data, optionType, maxItems = 200) {
  const target = data.monthData.find(item => item.label === optionType);
  if (!target) return {
    strike: [],
    oi: [],
    change: [],
    originalData: []
  };

  // 原始数据处理
  let originalData = target.strikeData.map(item => ({
    strike: parseInt(item.strike),
    oi: parseInt(item.atClose.replace(/,/g, '')),
    change: parseInt(item.change.replace(/,/g, ''))
  }))
    .filter(item => item.strike >= config.minPrice && item.strike <= config.maxPrice)
    .sort((a, b) => a.strike - b.strike);

  // 应用步长过滤
  originalData = originalData.filter(item => item.strike % config.stepSize === 0);

  // 限制数据量
  let processedData = originalData;
  if (maxItems && maxItems > 0 && originalData.length > maxItems) {
    const midIndex = Math.floor(originalData.length / 2);
    const half = Math.floor(maxItems / 2);
    let start = midIndex - half;
    let end = midIndex + (maxItems - half);

    if (start < 0) {
      start = 0;
      end = maxItems;
    }
    if (end > originalData.length) {
      end = originalData.length;
      start = Math.max(0, end - maxItems);
    }

    processedData = originalData.slice(start, end);
  }

  // 排序数据
  const sortedData = [...processedData].sort((a, b) => a.strike - b.strike);

  return {
    strike: sortedData.map(item => item.strike),
    oi: sortedData.map(item => item.oi),
    change: sortedData.map(item => item.change),
    originalData: originalData
  };
}

// 初始化图表
function initChart(domId, optionType, data) {
  const myChart = echarts.init(document.getElementById(domId));
  const { strike, oi, change } = data;
  const mainColor = optionType === 'Calls' ? '#1890FF' : '#1890FF';
  const increaseColor = '#2FC25B';
  const decreaseColor = '#FF4D4F';

  // 标记线配置
  const markLines = [];

  if (maxPainPrice) {
    markLines.push({
      name: '最大痛苦价格',
      yAxis: maxPainPrice,
      lineStyle: {
        color: '#FF4D4F',
        width: 2,
        type: 'dashed'
      },
      label: {
        show: true,
        formatter: `最大痛苦: ${maxPainPrice}`,
        color: '#FF4D4F'
      }
    });
  }

  // 处理变动值数据
  const processedChangeData = change.map(value => {
    return {
      value: value,
      itemStyle: {
        opacity: Math.abs(value) < config.changeThreshold ? 0 : 1
      }
    };
  });

  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params) => {
        const strikePrice = params[0].axisValue;
        const oiValue = params[0].value;
        const changeValue = params[1].value;
        return `行权价：${strikePrice}<br>存量：${oiValue}<br>变动：${changeValue}`;
      }
    },
    legend: {
      data: ['存量', '变动'],
      textStyle: { color: '#ccc' },
      top: 0
    },
    xAxis: [
      {
        type: 'value',
        name: '存量',
        position: 'bottom',
        axisLabel: { color: '#ccc' },
        axisLine: { lineStyle: { color: '#666' } },
        splitLine: { lineStyle: { color: '#333' } },
        min: 0,
        max: function (value) {
          return value.max * 1.3;
        }
      },
      {
        type: 'value',
        name: '变动',
        position: 'top',
        axisLabel: {
          color: '#ccc',
          formatter: function (value) {
            return value > 0 ? `+${value}` : value;
          }
        },
        axisLine: { lineStyle: { color: '#666' } },
        splitLine: { show: false },
        min: function (value) {
          const range = Math.max(Math.abs(value.max), Math.abs(value.min)) * 2;
          return -range * 0.5;
        },
        max: function (value) {
          const range = Math.max(Math.abs(value.max), Math.abs(value.min)) * 2;
          return range * 0.5;
        }
      }
    ],
    yAxis: {
      type: 'category',
      data: strike,
      axisLabel: { color: '#ccc', interval: 0 },
      axisLine: { lineStyle: { color: '#666' } },
      splitLine: { lineStyle: { color: '#333' } },
      markLine: { data: markLines },
      inverse: false
    },
    series: [
      {
        name: '存量',
        type: 'line',
        data: oi,
        xAxisIndex: 0,
        smooth: false,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { color: mainColor, width: 2.5 },
        itemStyle: { color: mainColor },
        label: {
          show: config.showStockLabels,
          position: 'right',
          color: mainColor,
          formatter: function (params) {
            return params.value.toString();
          }
        }
      },
      {
        name: '变动',
        type: 'bar',
        data: processedChangeData,
        xAxisIndex: 1,
        barWidth: '40%',
        itemStyle: {
          color: function (params) {
            return params.value >= 0 ? increaseColor : decreaseColor;
          },
          borderRadius: 0
        },
        label: {
          show: config.showChangeLabels,
          position: 'right',
          color: function (params) {
            return params.value >= 0 ? increaseColor : decreaseColor;
          },
          formatter: function (params) {
            return params.value > 0 ? `+${params.value}` : params.value;
          }
        }
      }
    ],
    grid: {
      left: '10%',
      right: '25%',
      bottom: '5%',
      top: '2%',
      containLabel: true
    }
  };

  myChart.setOption(option);
  return myChart;
}

// 保存合并图表
function saveCombinedCharts() {
  if (!callChart || !putChart) {
    alert('图表未初始化');
    return;
  }

  // 获取图表数据URL
  const scale = 0.8;
  const callImgData = callChart.getDataURL({
    type: 'png',
    pixelRatio: 2,
    backgroundColor: '#1E1E1E',
    width: callChart.getWidth() * scale,
    height: callChart.getHeight() * scale
  });
  const putImgData = putChart.getDataURL({
    type: 'png',
    pixelRatio: 2,
    backgroundColor: '#1E1E1E',
    width: putChart.getWidth() * scale,
    height: putChart.getHeight() * scale
  });

  const callImg = new Image();
  const putImg = new Image();

  callImg.onload = function () {
    putImg.onload = function () {
      const titleHeight = 80;
      const canvasWidth = callImg.width + putImg.width;
      const canvasHeight = callImg.height + titleHeight;

      const canvas = document.createElement('canvas');
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext('2d');

      // 绘制背景
      ctx.fillStyle = '#1E1E1E';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      // 绘制标题
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 24px Arial';
      const mainTitle = '黄金期权分布可视化';
      const mainTitleX = (canvasWidth - ctx.measureText(mainTitle).width) / 2;
      ctx.fillText(mainTitle, mainTitleX, 30);

      ctx.font = '18px Arial';
      const callTitle = '看涨期权（存量折线 + 变动柱形）';
      const putTitle = '看跌期权（存量折线 + 变动柱形）';
      ctx.fillText(callTitle, 20, 60);
      ctx.fillText(putTitle, callImg.width + 20, 60);

      // 绘制图表
      ctx.drawImage(callImg, 0, titleHeight);
      ctx.drawImage(putImg, callImg.width, titleHeight);

      // 添加时间水印
      ctx.font = '14px Arial';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      const timeStr = new Date().toLocaleString();
      ctx.fillText(`生成时间: ${timeStr}`, 10, canvasHeight - 10);

      // 触发下载
      const link = document.createElement('a');
      link.download = `黄金期权合并图表_${new Date().getTime()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    putImg.src = putImgData;
  };
  callImg.src = callImgData;
}

// 更新图表显示
function updateCharts(maxItems = config.currentMaxItems) {
  if (!currentOptionData) return;
  
  config.currentMaxItems = maxItems;
  elements.currentCount.textContent = maxItems;
  elements.showStockLabels.classList.toggle('active', config.showStockLabels);
  elements.showChangeLabels.classList.toggle('active', config.showChangeLabels);
  elements.toggleStep.textContent = `切换步长 (当前: ${config.stepSize})`;
  elements.changeThreshold.value = config.changeThreshold;

  // 计算最大痛苦价格
  try {
    const calculator = new GoldMaxPainCalculator(currentOptionData.data);
    const painResult = calculator.calculate();
    maxPainPrice = painResult.maxPainPrice;
    elements.maxPainPrice.textContent = maxPainPrice || '无数据';
    elements.maxPainContracts.textContent = painResult.maxPainValue || '无数据';

    // 处理图表数据
    callChartData = processChartData(currentOptionData.data, 'Calls', maxItems);
    putChartData = processChartData(currentOptionData.data, 'Puts', maxItems);

    // 销毁旧图表
    if (callChart) callChart.dispose();
    if (putChart) putChart.dispose();

    // 创建新图表
    callChart = initChart('callChart', 'Calls', callChartData);
    putChart = initChart('putChart', 'Puts', putChartData);
    
    // 显示图表容器
    elements.chartsContainer.style.display = 'flex';
  } catch (error) {
    console.error('更新图表失败:', error);
    alert('更新图表失败: ' + error.message);
  }
}

// 启用/禁用控制按钮
function setControlsEnabled(enabled) {
  const controlButtons = [
    elements.dataRange, elements.highlightMaxPain, elements.showStockLabels,
    elements.showChangeLabels, elements.toggleStep, elements.changeThreshold,
    elements.setThreshold, elements.saveCombinedChart, elements.setPriceRange
  ];
  
  controlButtons.forEach(elem => {
    elem.disabled = !enabled;
  });
}

// API请求函数
async function fetchApi(url, options = {}) {
  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });
    
    if (!response.ok) {
      throw new Error(`HTTP错误: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('API请求失败:', error);
    throw error;
  }
}

// 加载支持的合约列表
async function loadSupportedContracts() {
  try {
    const response = await fetchApi(`${config.apiBaseUrl}/contracts`);
    if (response.success) {
      supportedContracts = response.data;
      
      // 清空并填充下拉框
      elements.contractSelector.innerHTML = '<option value="">请选择合约</option>';
      supportedContracts.forEach(contract => {
        const option = document.createElement('option');
        option.value = contract;
        option.textContent = contract;
        elements.contractSelector.appendChild(option);
      });
    }
  } catch (error) {
    alert('加载合约列表失败: ' + error.message);
  }
}

// 加载合约数据
async function loadContractData(contractCode) {
  if (!contractCode) {
    alert('请选择合约');
    return;
  }
  
  try {
    // 显示加载状态
    elements.loadingIndicator.style.display = 'block';
    elements.chartsContainer.style.display = 'none';
    setControlsEnabled(false);
    
    // 请求数据
    const response = await fetchApi(`${config.apiBaseUrl}/option-data/${contractCode}`);
    
    if (response.success) {
      currentOptionData = response.data;
      
      // 更新数据信息
      elements.dataInfo.textContent = `合约: ${currentOptionData.contractName}(${currentOptionData.contractCode}) | 加载时间: ${new Date(currentOptionData.fetchTime).toLocaleString()}`;
      
      // 更新图表
      updateCharts(config.currentMaxItems);
      
      // 启用控制按钮
      setControlsEnabled(true);
    } else {
      alert('加载数据失败: ' + response.message);
    }
  } catch (error) {
    alert('加载合约数据失败: ' + error.message);
  } finally {
    // 隐藏加载状态
    elements.loadingIndicator.style.display = 'none';
  }
}

// 滚动到指定价格位置
function scrollToPrice(chartId, price) {
  const chartWrapper = document.querySelector(`#${chartId}`).parentNode;
  const index = callChartData?.strike.indexOf(price);
  if (index !== -1) {
    chartWrapper.scrollTop = index * 38;
  }
}

// 初始化事件监听
function initEventListeners() {
  // 加载合约数据
  elements.loadContractData.addEventListener('click', () => {
    const selectedContract = elements.contractSelector.value;
    loadContractData(selectedContract);
  });

  // 价格范围设置
  elements.setPriceRange.addEventListener('click', () => {
    const newMin = parseInt(elements.minPrice.value);
    const newMax = parseInt(elements.maxPrice.value);

    if (!isNaN(newMin) && !isNaN(newMax) && newMin < newMax) {
      config.minPrice = newMin;
      config.maxPrice = newMax;
      updateCharts(config.currentMaxItems);
    } else {
      alert('请输入有效的价格范围（最小值 < 最大值）');
    }
  });

  // 数据量滑块
  elements.dataRange.addEventListener('input', (e) => {
    updateCharts(parseInt(e.target.value));
  });

  // 高亮最大痛苦价格
  elements.highlightMaxPain.addEventListener('click', () => {
    if (maxPainPrice) {
      scrollToPrice('callChart', maxPainPrice);
      scrollToPrice('putChart', maxPainPrice);
    }
  });

  // 显示/隐藏存量值标签
  elements.showStockLabels.addEventListener('click', () => {
    config.showStockLabels = !config.showStockLabels;
    updateCharts(config.currentMaxItems);
  });

  // 显示/隐藏变动值标签
  elements.showChangeLabels.addEventListener('click', () => {
    config.showChangeLabels = !config.showChangeLabels;
    updateCharts(config.currentMaxItems);
  });

  // 切换步长
  elements.toggleStep.addEventListener('click', () => {
    config.stepSize = config.stepSize === 5 ? 10 : 5;
    updateCharts(config.currentMaxItems);
  });

  // 设置变动值阈值
  elements.setThreshold.addEventListener('click', () => {
    const newThreshold = parseInt(elements.changeThreshold.value);
    if (!isNaN(newThreshold) && newThreshold >= 0) {
      config.changeThreshold = newThreshold;
      updateCharts(config.currentMaxItems);
    }
  });

  // 保存图表
  elements.saveCombinedChart.addEventListener('click', saveCombinedCharts);

  // 窗口大小调整
  window.addEventListener('resize', () => {
    if (callChart) callChart.resize();
    if (putChart) putChart.resize();
  });
}

// 初始化应用
async function initApp() {
  try {
    // 加载合约列表
    await loadSupportedContracts();
    
    // 初始化事件监听
    initEventListeners();
    
    console.log('应用初始化完成');
  } catch (error) {
    console.error('应用初始化失败:', error);
    alert('初始化失败: ' + error.message);
  }
}

// 启动应用
document.addEventListener('DOMContentLoaded', initApp);
