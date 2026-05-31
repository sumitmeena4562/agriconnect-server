const ErrorResponse = require('../utils/errorResponse');
const { traceMiddlewareStart, traceMiddlewareEnd, traceLogic } = require('./logger');

/**
 * Universal validation middleware using Zod.
 * Evaluates req.body against the provided schema and returns 400 if validation fails.
 */
const validateRequest = (schema) => {
    return (req, res, next) => {
        traceMiddlewareStart(req, 'validateRequest');
        const result = schema.safeParse(req.body);
        
        if (!result.success) {
            // Extract the first error message from Zod safely
            const errors = result.error.issues || result.error.errors || [];
            const errorMessage = errors[0]?.message || 'Invalid input data';
            
            traceMiddlewareEnd(req, 'validateRequest', 'Failed', errorMessage);
            traceLogic(req, 'Validation', `Failed: ${errorMessage}`, 'Failed');
            
            return next(new ErrorResponse(errorMessage, 400));
        }

        // Replace req.body with the sanitized/parsed data from Zod (removes unknown fields)
        req.body = result.data;
        
        traceMiddlewareEnd(req, 'validateRequest', 'Passed');
        traceLogic(req, 'Validation', 'Passed: Input schema validation successful', 'Passed');
        
        next();
    };
};

module.exports = validateRequest;
