const connections = new Map(); // userId string -> Set of Response objects

/**
 * Register a client's response stream for SSE
 * @param {string|ObjectId} userId 
 * @param {Response} res 
 */
const addConnection = (userId, res) => {
    const idStr = userId.toString();
    if (!connections.has(idStr)) {
        connections.set(idStr, new Set());
    }
    connections.get(idStr).add(res);
    console.log(`[SSE] Connection established for user ${idStr}. Active streams for user: ${connections.get(idStr).size}`);
};

/**
 * Unregister a client's response stream on close
 * @param {string|ObjectId} userId 
 * @param {Response} res 
 */
const removeConnection = (userId, res) => {
    const idStr = userId.toString();
    if (connections.has(idStr)) {
        const userStreams = connections.get(idStr);
        userStreams.delete(res);
        if (userStreams.size === 0) {
            connections.delete(idStr);
        }
        console.log(`[SSE] Connection closed for user ${idStr}. Remaining streams: ${userStreams.size}`);
    }
};

/**
 * Send an event message to all active connection streams of a user
 * @param {string|ObjectId} userId 
 * @param {string} eventType 
 * @param {object} data 
 */
const sendToUser = (userId, eventType, data) => {
    if (!userId) return false;
    const idStr = userId.toString();
    const userStreams = connections.get(idStr);
    
    if (userStreams && userStreams.size > 0) {
        const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
        userStreams.forEach(res => {
            try {
                res.write(payload);
            } catch (err) {
                console.error(`[SSE] Error writing to user stream ${idStr}:`, err.message);
            }
        });
        console.log(`[SSE] Broadcasted ${eventType} to user ${idStr} on ${userStreams.size} stream(s)`);
        return true;
    }
    return false;
};

module.exports = {
    addConnection,
    removeConnection,
    sendToUser
};
