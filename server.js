const express = require('express');
const mqtt = require('mqtt');
const { WebSocketServer } = require('ws');
const path = require('path');

const app = express();
const PORT = 8080;

app.use(express.static(path.join(__dirname, 'public')));
app.use('/node_modules', express.static(path.join(__dirname, 'node_modules')));

app.get('/dictionary.json', (req, res) => {
    res.sendFile(path.join(__dirname, 'dictionary.json'));
});

const server = app.listen(PORT, () => {
    console.log(`Open MCT Mission Control en http://localhost:${PORT}`);
});

const wss = new WebSocketServer({ server });
let connectedClients = [];

wss.on('connection', (ws) => {
    connectedClients.push(ws);
    ws.on('close', () => {
        connectedClients = connectedClients.filter(client => client !== ws);
    });
});

const mqttClient = mqtt.connect('mqtt://localhost:1883');

mqttClient.on('connect', () => {
    console.log('Conectado al Broker Mosquitto local.');
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
            
            // Extracción del estado de motores del arreglo estructurado de tu Jetson
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
            connectedClients.forEach(client => client.send(JSON.stringify(mctPacket)));
        });
    } catch (err) {
        // Ignora hilos vacíos o estados raw "online/offline"
    }
});