const express = require('express');
const mqtt = require('mqtt');
const { WebSocket, WebSocketServer } = require('ws');
const path = require('path');

const app = express();
const PORT = 8080;

app.use(express.static(path.join(__dirname, 'public')));
app.use('/node_modules', express.static(path.join(__dirname, 'node_modules')));

app.get('/dictionary.json', (req, res) => {
    res.sendFile(path.join(__dirname, 'dictionary.json'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 1. Explicitly listen on 0.0.0.0 for external network access
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`📡 Open MCT Mission Control listening on port ${PORT}`);
});

const wss = new WebSocketServer({ server });
let connectedClients = [];

wss.on('connection', (ws) => {
    connectedClients.push(ws);
    ws.on('close', () => {
        connectedClients = connectedClients.filter(client => client !== ws);
    });
});

const mqttClient = mqtt.connect('mqtt://127.0.0.1:1883');

mqttClient.on('connect', () => {
    console.log('✅ Conectado al Broker MQTT local.');
    mqttClient.subscribe('rover/odometry');
    mqttClient.subscribe('rover/sensors');
    mqttClient.subscribe('rover/telemetry');
});

mqttClient.on('message', (topic, message) => {
    try {
        const payload = JSON.parse(message.toString());
        const timestamp = Date.now();
        let telemetryData = {};

        if (topic === 'rover/odometry') {
            telemetryData['pos_x'] = payload.x || 0.0;
            telemetryData['pos_y'] = payload.y || 0.0;
            telemetryData['pos_theta'] = payload.theta || 0.0;
            telemetryData['vel_v'] = payload.v || 0.0;
            telemetryData['vel_omega'] = payload.omega || 0.0;
        } 
        else if (topic === 'rover/sensors' && payload.rover_sensors) {
            telemetryData['pitch'] = payload.rover_sensors.pitch || 0.0;
            telemetryData['heading'] = payload.rover_sensors.heading || 0.0;
        } 
        else if (topic === 'rover/telemetry' && payload.rover_state) {
            const state = payload.rover_state;
            telemetryData['peso'] = state.peso || 0.0;
            
            if (state.left_side && state.left_side.motors) {
                telemetryData['rpm_m_izq1'] = state.left_side.motors[0]?.rpm || 0.0;
                telemetryData['rpm_m_izq2'] = state.left_side.motors[1]?.rpm || 0.0;
            }
            if (state.right_side && state.right_side.motors) {
                telemetryData['rpm_m_der1'] = state.right_side.motors[0]?.rpm || 0.0;
                telemetryData['rpm_m_der2'] = state.right_side.motors[1]?.rpm || 0.0;
            }
        }

        Object.keys(telemetryData).forEach((key) => {
            const mctPacket = {
                id: key,
                value: telemetryData[key],
                utc: timestamp 
            };
            const packetStr = JSON.stringify(mctPacket);

            // 2. Only send to clients that are actively open
            connectedClients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(packetStr);
                }
            });
        });
    } catch (err) {
        // Ignores non-JSON or malformed packets
    }
});