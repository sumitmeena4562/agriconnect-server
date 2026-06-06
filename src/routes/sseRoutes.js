const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { addConnection, removeConnection } = require('../utils/sseManager');

// @route   GET /api/v1/sse/stream
// @desc    Establishes a Server-Sent Events stream connection
// @access  Private (Query string JWT required)
router.get('/stream', (req, res) => {
    const token = req.query.token;

    if (!token) {
        return res.status(401).json({ 
            success: false, 
            error: 'Authentication failed. Token required in query parameters.' 
        });
    }

    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
        return res.status(401).json({ 
            success: false, 
            error: 'Authentication failed. Invalid or expired token.' 
        });
    }

    // Configure connection headers for SSE
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no' // Disables buffering on NGINX/reverse proxies
    });

    const userId = decoded.id;
    addConnection(userId, res);

    // Send connection acknowledgement event
    res.write(`event: CONNECTED\ndata: ${JSON.stringify({ success: true, message: 'Real-time event stream connected.' })}\n\n`);

    // Keep connection alive by sending a periodic comment ping (every 25 seconds)
    // SSE ignores lines starting with a colon, which acts as a harmless heartbeat
    const heartbeatInterval = setInterval(() => {
        try {
            res.write(':\n\n');
        } catch (err) {
            // Write failed, connection probably died
            clearInterval(heartbeatInterval);
        }
    }, 25000);

    // Cleanup connection on client close
    req.on('close', () => {
        clearInterval(heartbeatInterval);
        removeConnection(userId, res);
    });
});

module.exports = router;
