const { AsyncLocalStorage } = require('async_hooks');
const crypto = require('crypto');
const colors = require('colors');

// Setup Node AsyncLocalStorage for request tracing context
const requestStore = new AsyncLocalStorage();

const SENSITIVE_FIELDS = [
  'password',
  'confirmPassword',
  'token',
  'jwt',
  'accessToken',
  'refreshToken',
  'secret',
  'apiKey'
];

/**
 * Recursively masks sensitive fields in objects/arrays
 */
const recursiveMask = (data) => {
  if (data === null || data === undefined) return data;

  if (Array.isArray(data)) {
    return data.map(recursiveMask);
  }

  if (typeof data === 'object') {
    const masked = {};
    for (const [key, value] of Object.entries(data)) {
      if (SENSITIVE_FIELDS.includes(key)) {
        masked[key] = '********';
      } else if (typeof value === 'object') {
        masked[key] = recursiveMask(value);
      } else if (typeof value === 'string' && value.length > 200) {
        if (value.startsWith('data:') || value.includes(';base64,') || /^[A-Za-z0-9+/=]{50,}$/.test(value.substring(0, 100))) {
          masked[key] = value.substring(0, 50) + `... [Truncated Base64 Data, length: ${value.length}]`;
        } else if (value.length > 1000) {
          masked[key] = value.substring(0, 200) + `... [Truncated Long Text, length: ${value.length}]`;
        } else {
          masked[key] = value;
        }
      } else {
        masked[key] = value;
      }
    }
    return masked;
  }

  return data;
};

/**
 * Recursively masks sensitive fields in objects/arrays safely,
 * avoiding circular references and Mongoose class instances.
 */
const maskSensitiveData = (data) => {
  if (data === null || data === undefined) return data;

  try {
    // Convert to plain JSON to strip complex class prototypes, buffers, and circular references
    const plainData = JSON.parse(JSON.stringify(data));
    return recursiveMask(plainData);
  } catch (e) {
    return '[Circular or Non-Serializable Data]';
  }
};

/**
 * Safely stringifies and pretty prints JSON objects
 */
const prettyJSON = (obj, indent = 6) => {
  if (!obj || Object.keys(obj).length === 0) return '{}';
  const spaces = ' '.repeat(indent);
  const jsonStr = JSON.stringify(maskSensitiveData(obj), null, 2);
  return jsonStr.split('\n').map((line, idx) => idx === 0 ? line : spaces + line).join('\n');
};

/**
 * Tracing helper functions
 */
const traceMiddlewareStart = (req, name) => {
  if (req.logContext) {
    req.logContext.middlewares.push({
      name,
      status: 'Executing',
      startTime: process.hrtime()
    });
  }
};

const traceMiddlewareEnd = (req, name, status, errorMsg = '') => {
  if (req.logContext) {
    const mw = req.logContext.middlewares.find(m => m.name === name && m.status === 'Executing');
    if (mw) {
      const diff = process.hrtime(mw.startTime);
      mw.durationMs = diff[0] * 1000 + diff[1] / 1000000;
      mw.status = status;
      if (errorMsg) mw.error = errorMsg;
    }
  }
};

const traceLogic = (req, type, message, status) => {
  if (req.logContext) {
    req.logContext.businessLogic.push({
      type,
      message,
      status,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Core Request Logging Middleware
 */
const requestLogger = (req, res, next) => {
  const reqId = crypto.randomBytes(4).toString('hex').toUpperCase();
  const startTime = process.hrtime();

  const logContext = {
    id: reqId,
    startTime,
    client: {
      method: req.method,
      url: req.originalUrl || req.url,
      ip: req.ip || req.connection.remoteAddress || '127.0.0.1',
      userAgent: req.headers['user-agent'] || 'Unknown',
      timestamp: new Date().toISOString()
    },
    requestData: {
      headers: { ...req.headers },
      query: { ...req.query },
      params: { ...req.params },
      body: req.body ? { ...req.body } : {}
    },
    middlewares: [],
    controller: null,
    businessLogic: [],
    database: [],
    error: null,
    response: null
  };

  req.logContext = logContext;

  // Custom log method for developer convenience
  req.logStep = (message) => {
    traceLogic(req, 'Custom Step', message, 'Info');
  };

  // Intercept response payload
  const originalSend = res.send;
  res.send = function (body) {
    let responseData = body;
    try {
      // Attempt to parse JSON response for pretty printing/masking
      if (typeof body === 'string') {
        responseData = JSON.parse(body);
      }
    } catch (e) {
      // Not JSON, keep original body string
    }

    if (req.logContext) {
      req.logContext.response = {
        statusCode: res.statusCode,
        success: res.statusCode >= 200 && res.statusCode < 300,
        sizeBytes: body ? Buffer.byteLength(typeof body === 'string' ? body : JSON.stringify(body)) : 0,
        body: responseData
      };
    }

    return originalSend.apply(this, arguments);
  };

  // Intercept res.json to catch JSON directly
  const originalJson = res.json;
  res.json = function (obj) {
    if (req.logContext) {
      req.logContext.response = {
        statusCode: res.statusCode,
        success: res.statusCode >= 200 && res.statusCode < 300,
        sizeBytes: obj ? Buffer.byteLength(JSON.stringify(obj)) : 0,
        body: obj
      };
    }
    return originalJson.apply(this, arguments);
  };

  // When request ends, compute details and format/print logs
  res.on('finish', () => {
    const diff = process.hrtime(startTime);
    const totalTimeMs = diff[0] * 1000 + diff[1] / 1000000;

    const dbTimeMs = logContext.database.reduce((acc, q) => acc + (q.durationMs || 0), 0);
    const controllerTimeMs = logContext.controller ? (logContext.controller.durationMs || 0) : 0;
    const memUsage = process.memoryUsage();

    logContext.performance = {
      dbTime: `${dbTimeMs.toFixed(2)}ms`,
      controllerTime: `${controllerTimeMs.toFixed(2)}ms`,
      totalTime: `${totalTimeMs.toFixed(2)}ms`,
      memory: {
        heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        rss: `${(memUsage.rss / 1024 / 1024).toFixed(2)} MB`
      }
    };

    // Format & print tree logs to console
    printRequestFlow(logContext);
  });

  // Run the remaining middlewares/routes in the AsyncLocalStorage context
  requestStore.run(logContext, () => {
    next();
  });
};

/**
 * Format and print request trace in a clean tree structure
 */
function printRequestFlow(ctx) {
  const line = (str) => console.log(str);

  line('\n' + `🌳 REQUEST FLOW [${ctx.id}]`.green.bold);

  // CLIENT SECTION
  line(`├── 📥 CLIENT`.cyan);
  line(`│   ├── Method: `.cyan + `${ctx.client.method}`.yellow.bold);
  line(`│   ├── URL: `.cyan + `${ctx.client.url}`.white);
  line(`│   ├── IP Address: `.cyan + `${ctx.client.ip}`.white);
  line(`│   ├── User Agent: `.cyan + `${ctx.client.userAgent}`.white);
  line(`│   └── Timestamp: `.cyan + `${ctx.client.timestamp}`.white);
  line(`│`);


  // REQUEST DATA SECTION
  line(`├── 📦 REQUEST DATA`.yellow);
  line(`│   ├── Headers: `.yellow + prettyJSON(ctx.requestData.headers, 8).gray);
  line(`│   ├── Query Parameters: `.yellow + prettyJSON(ctx.requestData.query, 8).white);
  line(`│   ├── Route Parameters: `.yellow + prettyJSON(ctx.requestData.params, 8).white);
  line(`│   └── Request Body: `.yellow + prettyJSON(ctx.requestData.body, 8).white);
  line(`│`);

  // MIDDLEWARES SECTION
  line(`├── 🛡️ MIDDLEWARES`.magenta);
  if (ctx.middlewares.length === 0) {
    line(`│   └── (None executed)`.gray);
  } else {
    ctx.middlewares.forEach((mw, idx) => {
      const isLast = idx === ctx.middlewares.length - 1;
      const char = isLast ? '└──' : '├──';
      const statusColor = mw.status === 'Passed' ? mw.status.green : mw.status.red;
      const duration = mw.durationMs ? ` (${mw.durationMs.toFixed(2)}ms)` : '';
      const errMsg = mw.error ? ` - Error: ${mw.error}`.red : '';
      line(`│   ${char} ${mw.name}: `.magenta + statusColor + duration + errMsg);
    });
  }
  line(`│`);

  // CONTROLLER SECTION
  line(`├── 🎮 CONTROLLER`.blue);
  if (!ctx.controller) {
    line(`│   └── (None executed)`.gray);
  } else {
    const statusColor = ctx.controller.status === 'Success' ? ctx.controller.status.green : ctx.controller.status.red;
    const duration = ctx.controller.durationMs ? ` (${ctx.controller.durationMs.toFixed(2)}ms)` : '';
    line(`│   ├── Controller Name: `.blue + `${ctx.controller.name}`.white);
    line(`│   ├── Function Name: `.blue + `${ctx.controller.functionName || 'Anonymous'}`.white);
    line(`│   └── Execution Status: `.blue + statusColor + duration);
  }
  line(`│`);

  // BUSINESS LOGIC SECTION
  line(`├── ⚙️ BUSINESS LOGIC`.green);
  if (ctx.businessLogic.length === 0) {
    line(`│   └── (None logged)`.gray);
  } else {
    ctx.businessLogic.forEach((logic, idx) => {
      const isLast = idx === ctx.businessLogic.length - 1;
      const char = isLast ? '└──' : '├──';
      const statusColor = logic.status === 'Passed' || logic.status === 'Success' ? logic.status.green : logic.status.red;
      line(`│   ${char} [${logic.type}] ${logic.message} -> `.green + statusColor);
    });
  }
  line(`│`);

  // DATABASE SECTION
  line(`├── 🗄️ DATABASE`.cyan);
  if (ctx.database.length === 0) {
    line(`│   └── (No database operations)`.gray);
  } else {
    ctx.database.forEach((db, idx) => {
      const isLast = idx === ctx.database.length - 1;
      const duration = db.durationMs ? ` (${db.durationMs.toFixed(2)}ms)` : '';
      line(`│   ├── [OP ${idx + 1}] `.cyan + `${db.collection}.${db.operation}`.yellow.bold + duration);
      line(`│   │   ├── Query: `.cyan + prettyJSON(db.query, 12).white);

      if (db.data) {
        line(`│   │   ├── Data Sent: `.cyan + prettyJSON(db.data, 12).white);
      }

      if (db.docBefore) {
        line(`│   │   ├── Document Before: `.cyan + prettyJSON(db.docBefore, 12).gray);
      }

      if (db.docAfter) {
        line(`│   │   ├── Document After: `.cyan + prettyJSON(db.docAfter, 12).green);
      }

      const char = isLast ? '└──' : '├──';
      line(`│   │   ${char} Response: `.cyan + prettyJSON(db.response, 12).white);
      if (!isLast) line(`│   │`);
    });
  }
  line(`│`);

  // RESPONSE SECTION
  const status = ctx.response ? ctx.response.statusCode : 500;
  const statusStr = ctx.response ? `${ctx.response.statusCode}` : '500';
  const responseColor = status >= 200 && status < 300 ? statusStr.green.bold : statusStr.red.bold;
  const successStr = ctx.response && ctx.response.success ? 'Success'.green.bold : 'Failure'.red.bold;
  const sizeKb = ctx.response ? (ctx.response.sizeBytes / 1024).toFixed(2) : '0.00';

  line(`├── 📤 RESPONSE`.magenta);
  line(`│   ├── HTTP Status Code: `.magenta + responseColor);
  line(`│   ├── Success/Failure: `.magenta + successStr);
  line(`│   ├── Response Size: `.magenta + `${sizeKb} KB`.white);
  if (ctx.error) {
    line(`│   ├── Error Type: `.red.bold + `${ctx.error.name}`.red);
    line(`│   ├── Error Message: `.red.bold + `${ctx.error.message}`.red);
    line(`│   └── Stack Trace: `.red.bold + `\n${ctx.error.stack}`.red);
  } else {
    line(`│   └── Response Data: `.magenta + prettyJSON(ctx.response ? ctx.response.body : {}, 8).white);
  }
  line(`│`);

  // PERFORMANCE SECTION
  line(`└── ⏱️ PERFORMANCE`.yellow);
  line(`    ├── Database Time: `.yellow + `${ctx.performance.dbTime}`.white);
  line(`    ├── Controller Time: `.yellow + `${ctx.performance.controllerTime}`.white);
  line(`    ├── Total Request Time: `.yellow + `${ctx.performance.totalTime}`.white.bold);
  line(`    └── Memory Usage: `.yellow);
  line(`        ├── Heap Used: `.yellow + `${ctx.performance.memory.heapUsed}`.white);
  line(`        └── RSS: `.yellow + `${ctx.performance.memory.rss}`.white);
  line('=======================================================\n');
}

module.exports = {
  requestStore,
  requestLogger,
  traceMiddlewareStart,
  traceMiddlewareEnd,
  traceLogic
};
