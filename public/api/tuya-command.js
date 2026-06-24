import crypto from 'crypto';

const TUYA_CLIENT_ID = process.env.TUYA_CLIENT_ID;
const TUYA_CLIENT_SECRET = process.env.TUYA_CLIENT_SECRET;
const TUYA_REGION = 'eu';

function generateSignature(method, path, payload, nonce, timestamp) {
  const contentHash = crypto.createHash('sha256').update(payload).digest('hex');
  const stringToSign = [method, contentHash, '', path].join('\n');
  const hmacSha256 = crypto.createHmac('sha256', TUYA_CLIENT_SECRET);
  hmacSha256.update(stringToSign + '\n' + timestamp + '\n' + nonce);
  return Buffer.from(hmacSha256.digest()).toString('base64');
}

async function callTuyaAPI(method, path, payload = '') {
  const timestamp = Date.now().toString();
  const nonce = crypto.randomBytes(16).toString('hex');
  const signature = generateSignature(method, path, payload, nonce, timestamp);

  const headers = {
    'client_id': TUYA_CLIENT_ID,
    'sign': signature,
    'sign_method': 'HMAC-SHA256',
    't': timestamp,
    'nonce': nonce,
    'Content-Type': 'application/json'
  };

  const url = `https://openapi.tuya${TUYA_REGION}.com${path}`;

  const response = await fetch(url, {
    method,
    headers,
    body: payload || undefined
  });

  return response.json();
}

const COMMAND_MAPPING = {
  switch: { code: 'switch', value: (val) => val },
  temp_set: { code: 'temp_set', value: (val) => val },
  mode: { code: 'mode', value: (val) => val },
  fan_level: { code: 'fan_level', value: (val) => val },
  swing: { code: 'swing', value: (val) => val }
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (!TUYA_CLIENT_ID || !TUYA_CLIENT_SECRET) {
      return res.status(500).json({
        success: false,
        error: 'Credenziali Tuya non configurate'
      });
    }

    const { device_id, command, value } = req.body;

    if (!device_id || !command) {
      return res.status(400).json({ success: false, error: 'Parametri mancanti' });
    }

    let tuya_command;
    if (COMMAND_MAPPING[command]) {
      tuya_command = {
        code: COMMAND_MAPPING[command].code,
        value: typeof COMMAND_MAPPING[command].value === 'function'
          ? COMMAND_MAPPING[command].value(value)
          : value
      };
    } else {
      return res.status(400).json({ success: false, error: `Comando non supportato: ${command}` });
    }

    const path = `/v1.0/devices/${device_id}/commands`;
    const payload = JSON.stringify({ commands: [tuya_command] });

    const result = await callTuyaAPI('POST', path, payload);

    if (result.success) {
      return res.status(200).json({ success: true, message: 'Comando inviato' });
    } else {
      return res.status(400).json({ success: false, error: result.msg || 'Errore Tuya' });
    }
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
