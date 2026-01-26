const https = require('https');
const HuaweiCloudSigner = require('./huawei_signer.js');

const ACCESS_KEY = process.env.HUAWEI_ACCESS_KEY;
const SECRET_KEY = process.env.HUAWEI_SECRET_KEY;
const REGION = 'sa-brazil-1';

function httpsRequest(options, data = '') {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(body) });
        } catch (e) {
          resolve({ statusCode: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function getProjects() {
  if (!ACCESS_KEY || !SECRET_KEY) {
    throw new Error('Missing Huawei Cloud credentials. Set HUAWEI_ACCESS_KEY and HUAWEI_SECRET_KEY.');
  }
  const url = `https://iam.${REGION}.myhuaweicloud.com/v3/projects`;
  
  const options = {
    method: 'GET',
    url: url,
    headers: {
      'content-type': 'application/json'
    },
    params: {}
  };

  const signedHeaders = HuaweiCloudSigner.signRequest(options, ACCESS_KEY, SECRET_KEY);

  const requestOptions = {
    hostname: `iam.${REGION}.myhuaweicloud.com`,
    port: 443,
    path: '/v3/projects',
    method: 'GET',
    headers: signedHeaders
  };

  console.log('Fetching projects...');
  const response = await httpsRequest(requestOptions);
  
  if (response.statusCode === 200 && response.body.projects) {
    console.log('\n=== Project IDs ===');
    response.body.projects.forEach(p => {
      console.log(`ID: ${p.id}`);
      console.log(`Name: ${p.name}`);
      console.log(`Enabled: ${p.enabled}`);
      console.log('---');
    });
  } else {
    console.log('Error:', response.statusCode, JSON.stringify(response.body, null, 2));
  }
}

getProjects().catch(console.error);
