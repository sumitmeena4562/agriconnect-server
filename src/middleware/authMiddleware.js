const jwt = require('jsonwebtoken');
const { traceMiddlewareStart, traceMiddlewareEnd, traceLogic } = require('./logger');

const protect = (req, res, next) => {
  traceMiddlewareStart(req, 'protect');
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    traceMiddlewareEnd(req, 'protect', 'Failed', 'No token provided');
    traceLogic(req, 'Authentication', 'Token validation failed: No token provided', 'Failed');
    return res.status(401).json({
      success: false,
      error: 'Not authorized to access this route. No token provided.'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, role, iat, exp }
    traceMiddlewareEnd(req, 'protect', 'Passed');
    traceLogic(req, 'Authentication', `Token verified successfully. User: ${decoded.id} (Role: ${decoded.role})`, 'Passed');
    next();
  } catch (error) {
    traceMiddlewareEnd(req, 'protect', 'Failed', 'Invalid token');
    traceLogic(req, 'Authentication', `Token verification failed: ${error.message}`, 'Failed');
    return res.status(401).json({
      success: false,
      error: 'Not authorized to access this route. Invalid token.'
    });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    traceMiddlewareStart(req, 'authorize');
    if (!req.user || !roles.includes(req.user.role)) {
      const errorMsg = req.user 
        ? `User role '${req.user.role}' is not in required roles [${roles.join(', ')}]`
        : 'User not authenticated';
      traceMiddlewareEnd(req, 'authorize', 'Failed', errorMsg);
      traceLogic(req, 'Authorization', `Failed: ${errorMsg}`, 'Failed');
      return res.status(403).json({
        success: false,
        error: `User role '${req.user ? req.user.role : 'guest'}' is not authorized to access this route`
      });
    }
    traceMiddlewareEnd(req, 'authorize', 'Passed');
    traceLogic(req, 'Authorization', `Passed: Role '${req.user.role}' matches required roles [${roles.join(', ')}]`, 'Passed');
    next();
  };
};

module.exports = { protect, authorize };
