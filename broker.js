const { Aedes } = require('aedes');
const net = require('net');

const PORT = 1883;

async function startBroker() {
    // Correctly invoke the static method on the Aedes class
    const aedes = await Aedes.createBroker();
    
    // Bind the connection handler to the TCP server
    const server = net.createServer(aedes.handle);

    server.listen(PORT, '0.0.0.0', function () {
        console.log(`📡 Local MQTT Broker active on port ${PORT}`);
    });

    aedes.on('client', function (client) {
        console.log(`[MQTT] Client connected: ${client ? client.id : 'unknown'}`);
    });

    aedes.on('clientDisconnect', function (client) {
        console.log(`[MQTT] Client disconnected: ${client ? client.id : 'unknown'}`);
    });
}

startBroker().catch(err => {
    console.error("Failed to start MQTT broker:", err);
});