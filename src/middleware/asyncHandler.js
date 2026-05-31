const asyncHandler = fn => (req, res, next) => {
    const startTime = process.hrtime();
    
    // Determine the function name, fallback to route-based resolution if anonymous
    let functionName = fn.name || '';
    if (!functionName || functionName === 'Anonymous' || functionName === 'wrapper') {
        if (req.route && req.route.path) {
            const routePath = req.route.path;
            if (routePath.includes('/:')) {
                const method = req.method.toLowerCase();
                if (method === 'get') functionName = 'getById';
                else if (method === 'put' || method === 'patch') functionName = 'update';
                else if (method === 'delete') functionName = 'delete';
                else functionName = method;
            } else {
                functionName = routePath.replace(/^\//, '').replace(/\//g, '_') || 'index';
            }
        } else {
            functionName = 'handler';
        }
    }
    
    // Guess Controller name from request baseUrl (e.g. /api/auth -> AuthController)
    let controllerName = 'ApiController';
    if (req.baseUrl) {
        const parts = req.baseUrl.split('/');
        const segment = parts[parts.length - 1] || parts[parts.length - 2] || 'api';
        controllerName = segment.charAt(0).toUpperCase() + segment.slice(1) + 'Controller';
    }
    
    if (req.logContext) {
        req.logContext.controller = {
            name: controllerName,
            functionName: functionName,
            status: 'Executing',
            startTime
        };
    }

    return Promise.resolve(fn(req, res, next))
        .then((val) => {
            if (req.logContext && req.logContext.controller) {
                const diff = process.hrtime(startTime);
                req.logContext.controller.durationMs = diff[0] * 1000 + diff[1] / 1000000;
                req.logContext.controller.status = 'Success';
            }
            return val;
        })
        .catch((err) => {
            if (req.logContext && req.logContext.controller) {
                const diff = process.hrtime(startTime);
                req.logContext.controller.durationMs = diff[0] * 1000 + diff[1] / 1000000;
                req.logContext.controller.status = 'Failed';
            }
            next(err);
        });
};

module.exports = asyncHandler;
