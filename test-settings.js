const http = require('http');

async function main() {
  const req = http.request({
    hostname: 'localhost',
    port: 8080,
    path: '/api/v1/settings/test-user',
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': 'test-user'
    }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => console.log('Status:', res.statusCode, 'Body:', data));
  });

  req.on('error', console.error);
  req.write(JSON.stringify({
    defaultView: 'board',
    theme: 'dark',
    ollamaModel: '',
    ollamaEndpoint: 'http://localhost:11434',
    projectLayout: 'standard',
    keyAction: 'keep',
    aiProvider: 'openai',
    agentIntegration: 'ollama'
  }));
  req.end();
}

main();
