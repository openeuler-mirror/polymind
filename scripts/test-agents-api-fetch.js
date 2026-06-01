/**
 * 测试脚本：通过NEXT_PUBLIC_AGENTD_API_URL获取所有代理列表
 * 使用现代fetch API实现
 */

// 从环境变量获取API URL，如果未设置则使用默认值
const API_BASE_URL = process.env.NEXT_PUBLIC_AGENTD_API_URL || 'http://127.0.0.1:4523/m1/7187611-7775263-default';
const API_ENDPOINT = '/agents';
const TIMEOUT = 30000; // 30秒超时

console.log('🧪 Testing Agents API...');
console.log('🌍 API Base URL:', API_BASE_URL);
console.log('🔗 API Endpoint:', API_ENDPOINT);

/**
 * 带超时功能的fetch包装器
 */
function fetchWithTimeout(url, options = {}) {
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), TIMEOUT)
    )
  ]);
}

/**
 * 获取代理列表的主要函数
 */
async function fetchAgents() {
  try {
    const apiUrl = `${API_BASE_URL}${API_ENDPOINT}`;
    console.log(`\n📡 Making request to: ${apiUrl}`);
    
    const startTime = Date.now();
    const response = await fetchWithTimeout(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`✅ Request completed in ${duration}ms`);
    console.log('📊 Response Status:', response.status);
    console.log('🏷️  Response Headers:', Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const data = await response.json();
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      data: data
    };
  } catch (error) {
    if (error.name === 'AbortError' || error.message.includes('timeout')) {
      throw new Error('Request timed out after ' + TIMEOUT + 'ms');
    }
    throw error;
  }
}

/**
 * 格式化并显示代理信息
 */
function displayAgents(agentsData) {
  if (!agentsData.success) {
    console.log('\n❌ API returned with success=false');
    console.log('📝 Error message:', agentsData.message || 'Unknown error');
    return;
  }
  
  if (!Array.isArray(agentsData.data)) {
    console.log('\n⚠️ Unexpected response format: data is not an array');
    return;
  }
  
  console.log(`\n📋 Found ${agentsData.data.length} agents:`);
  
  if (agentsData.data.length === 0) {
    console.log('  No agents found.');
    return;
  }
  
  agentsData.data.forEach((agent, index) => {
    console.log(`\n${index + 1}. 🆔 ID: ${agent.id}`);
    console.log(`   📝 Name: ${agent.name || 'N/A'}`);
    console.log(`   💬 Description: ${agent.description || 'N/A'}`);
    console.log(`   ⚙️  Adapter: ${agent.adapterType || 'N/A'}`);
    console.log(`   🟢 Status: ${agent.status || 'N/A'}`);
    console.log(`   📅 Created: ${agent.createdAt || 'N/A'}`);
    console.log(`   🔄 Updated: ${agent.updatedAt || 'N/A'}`);
  });
}

/**
 * 主测试函数
 */
async function main() {
  try {
    console.log('\n🔄 Fetching agents list...');
    const result = await fetchAgents();
    
    console.log('\n🎉 Request successful!');
    console.log('📈 Response Data:', JSON.stringify(result.data, null, 2));
    
    displayAgents(result.data);
    
    console.log('\n✨ Test completed successfully!');
  } catch (error) {
    console.error('\n💥 Request failed!');
    console.error('❌ Error:', error.message);
    
    // 提供常见错误的解决建议
    if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
      console.error('\n💡 Possible solutions:');
      console.error('   1. Check if the agentd service is running');
      console.error('   2. Verify the API URL configuration');
      console.error('   3. Ensure the port 18080 is accessible');
    } else if (error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo')) {
      console.error('\n💡 Possible solutions:');
      console.error('   1. Check the hostname in your API URL');
      console.error('   2. Verify network connectivity');
      console.error('   3. Confirm DNS resolution is working');
    } else if (error.message.includes('timeout')) {
      console.error('\n💡 Possible solutions:');
      console.error('   1. Check if the server is responding slowly');
      console.error('   2. Verify network connectivity');
      console.error('   3. Increase the timeout value if needed');
    }
  }
}

// 运行主函数
main();

// 导出函数以便在其他地方使用（如果需要）
module.exports = { fetchAgents };