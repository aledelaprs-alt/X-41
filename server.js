const express = require('express');
const cors = require('cors');
const http = require('http');
const { WebSocketServer } = require('ws');

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' })); // Support larger payloads like photo drawings

// Port configuration for Render
const PORT = process.env.PORT || 3000;

// In-memory store for relay events (grouped by syncId)
// Format: { [syncId]: [RelayEvent, ...] }
const historyStore = {};

// Active WebSocket connections mapped by syncId
// Format: { [syncId]: Set(WebSocket) }
const topics = {};

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// GET: Fetch the history logs for a syncId
app.get('/api/history/:syncId', (req, res) => {
    const { syncId } = req.params;
    const history = historyStore[syncId] || [];
    res.json(history);
});

// POST: Publish a new event to a syncId (saves to history and broadcasts to WS)
app.post('/api/publish/:syncId', (req, res) => {
    const { syncId } = req.params;
    const event = req.body;

    if (!event || !event.id || !event.sender || !event.type || !event.payload) {
        return res.status(400).json({ error: 'Invalid RelayEvent object' });
    }

    // Append to history if it is not location/profile status update to prevent memory bloat
    if (event.type !== 'location' && event.type !== 'profile') {
        if (!historyStore[syncId]) {
            historyStore[syncId] = [];
        }
        const list = historyStore[syncId];
        if (!list.some(e => e.id === event.id)) {
            list.push(event);
            list.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            if (list.length > 1000) {
                historyStore[syncId] = list.slice(list.length - 1000);
            }
        }
    }

    // Broadcast to all connected WebSocket clients on this syncId
    broadcastToTopic(syncId, event);

    res.json({ success: true });
});

// POST: Restore multiple events for a syncId (restores from a browser local backup)
app.post('/api/restore/:syncId', (req, res) => {
    const { syncId } = req.params;
    const events = req.body;

    if (!events || !Array.isArray(events)) {
        return res.status(400).json({ error: 'Expected an array of RelayEvent objects' });
    }

    if (!historyStore[syncId]) {
        historyStore[syncId] = [];
    }

    const list = historyStore[syncId];
    let restoredCount = 0;

    events.forEach(event => {
        if (event && event.id && event.sender && event.type && event.payload) {
            if (!list.some(e => e.id === event.id)) {
                list.push(event);
                restoredCount++;
            }
        }
    });

    if (restoredCount > 0) {
        list.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        if (list.length > 1000) {
            historyStore[syncId] = list.slice(list.length - 1000);
        }
    }

    res.json({ success: true, restored: restoredCount });
});

// DELETE: Clear history for a syncId (administrative tool)
app.delete('/api/history/:syncId', (req, res) => {
    const { syncId } = req.params;
    historyStore[syncId] = [];
    res.json({ success: true, message: 'History cleared' });
});

// Create HTTP server
const server = http.createServer(app);

// Integrate WebSocket Server
const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws, req, syncId) => {
    if (!topics[syncId]) {
        topics[syncId] = new Set();
    }
    topics[syncId].add(ws);
    console.log(`[WS] Client connected to syncId: ${syncId}. Total: ${topics[syncId].size}`);

    // Keep connection alive with simple ping-pong
    ws.isAlive = true;
    ws.on('pong', () => {
        ws.isAlive = true;
    });

    ws.on('message', (message) => {
        try {
            // Optional: Support direct publishing over WebSocket
            const event = JSON.parse(message.toString());
            if (event && event.id && event.type && event.payload) {
                // Save to history if not location/profile
                if (event.type !== 'location' && event.type !== 'profile') {
                    if (!historyStore[syncId]) {
                        historyStore[syncId] = [];
                    }
                    const list = historyStore[syncId];
                    if (!list.some(e => e.id === event.id)) {
                        list.push(event);
                        if (list.length > 1000) {
                            historyStore[syncId] = list.slice(list.length - 1000);
                        }
                    }
                }
                // Broadcast
                broadcastToTopic(syncId, event, ws);
            }
        } catch (e) {
            console.error('[WS] Error processing direct message:', e.message);
        }
    });

    ws.on('close', () => {
        if (topics[syncId]) {
            topics[syncId].delete(ws);
            console.log(`[WS] Client disconnected from ${syncId}. Remaining: ${topics[syncId].size}`);
            if (topics[syncId].size === 0) {
                delete topics[syncId];
            }
        }
    });

    ws.on('error', (err) => {
        console.error(`[WS] Socket error on ${syncId}:`, err.message);
    });
});

// Handle HTTP Upgrade requests and route to the correct WebSocket topic
server.on('upgrade', (request, socket, head) => {
    const urlParts = request.url.split('/');
    // Expected URL structure: /ws/:syncId
    const wsIdx = urlParts.indexOf('ws');
    
    if (wsIdx !== -1 && urlParts[wsIdx + 1]) {
        const syncId = urlParts[wsIdx + 1].split('?')[0]; // strip query params
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request, syncId);
        });
    } else {
        socket.destroy();
    }
});

// Helper: Broadcast to all clients on a syncId topic
function broadcastToTopic(syncId, event, excludeWs = null) {
    const clients = topics[syncId];
    if (!clients) return;

    const rawMessage = JSON.stringify({
        // Structure designed to mimic ntfy.sh WS message
        event: 'message',
        topic: syncId,
        message: JSON.stringify(event)
    });

    clients.forEach(client => {
        if (client !== excludeWs && client.readyState === 1) { // 1 = OPEN
            client.send(rawMessage);
        }
    });
}

// Keep-alive ping interval to clean dead connections
const interval = setInterval(() => {
    wss.clients.forEach(ws => {
        if (ws.isAlive === false) {
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => {
    clearInterval(interval);
});

server.listen(PORT, () => {
    console.log(`[HTTP/WS] Server is running on port ${PORT}`);
});
