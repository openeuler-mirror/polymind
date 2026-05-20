const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// 读取环境变量或使用默认值
const API_BASE_URL = process.env.NEXT_PUBLIC_AGENTD_API_URL || 'http://localhost:18080';
const API_ENDPOINT = '/agents';

console.log('Testing Agents API...');
console.log('API Base URL:', API_BASE_URL);
console.log('API Endpoint:', API_ENDPOINT);

/**
 * 解析URL并发起HTTP请求
 */
function fetchAgents() {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE_URL + API_ENDPOINT);
    
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    console.log('Making request to:', `${url.protocol}//${url.hostname}:${url.port}${url.pathname}`);

    const protocol = url.protocol === 'https:' ? https : http;
    
    const req = protocol.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: response
          });
        } catch (error) {
          reject(new Error(`Failed to parse response as JSON: ${error.message}\nRaw response: ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });

    req.setTimeout(30000); // 30秒超时
    req.end();
  });
}

/**
 * 主测试函数
 */
async function testAgentsApi() {
  try {
    console.log('\nFetching agents list...');
    const result = await fetchAgents();
    
    console.log('\n✅ Request successful!');
    console.log('Status Code:', result.statusCode);
    console.log('Response Headers:', JSON.stringify(result.headers, null, 2));
    console.log('Response Data:', JSON.stringify(result.data, null, 2));
    
    if (result.data.success) {
      console.log('\n📋 Agents retrieved successfully:');
      if (Array.isArray(result.data.data)) {
        console.log(`Found ${result.data.data.length} agents`);
        result.data.data.forEach((agent, index) => {
          console.log(`${index + 1}. ID: ${agent.id}, Name: ${agent.name}, Status: ${agent.status}`);
        });
      } else {
        console.log('Unexpected response format: data is not an array');
      }
    } else {
      console.log('\n❌ API returned success=false');
      console.log('Error message:', result.data.message || 'Unknown error');
    }
  } catch (error) {
    console.error('\n❌ Request failed!');
    console.error('Error:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 The server might not be running. Please ensure the agentd service is started.');
    } else if (error.code === 'ENOTFOUND') {
      console.error('\n💡 Could not resolve the hostname. Please check the API URL configuration.');
    }
  }
}

// 运行测试
testAgentsApi();

module.exports = { fetchAgents };