const mqtt = require('mqtt');

const BROKER_URL = process.env.MQTT_BROKER_URL;
const client = mqtt.connect(BROKER_URL);

const TOPICS = {
    command: (zone) => `sprinkler/${zone}/command`,
    status: (zone) => `sprinkler/${zone}/status`,
    statusWildcard: 'sprinkler/+/status',
    sensorsWildcard: 'sprinkler/+/sensors',
};

let latestStatus = {};
let latestSensors = {};

client.on('connect', () => {
    console.log('Connected to MQTT broker');
    client.subscribe(TOPICS.statusWildcard);
    client.subscribe(TOPICS.sensorsWildcard);
});

client.on('message', (topic, message) => {
    const parts = topic.split('/'); // ["sprinkler", "<zone>", "status" | "sensors"]
    const zone = parts[1];
    const kind = parts[2];
    try {
        const payload = JSON.parse(message.toString());
        if (kind === 'status') latestStatus[zone] = payload;
        else if (kind === 'sensors') latestSensors[zone] = { ...payload, receivedAt: new Date().toISOString() };
    } catch (err) {
        console.error(`Bad ${kind} payload from ${zone}:`, message.toString());
    }
});

function startZone(zone, durationSeconds) {
    const payload = JSON.stringify({ action: 'start', durationSeconds });
    client.publish(TOPICS.command(zone), payload);
}

function stopZone(zone) {
    const payload = JSON.stringify({ action: 'stop' });
    client.publish(TOPICS.command(zone), payload);
}

function getStatus(zone) {
    return latestStatus[zone] || { watering: false, remainingSeconds: 0 };
}

function getSensors(zone) {
    return latestSensors[zone] || null;
}

module.exports = {
    startZone,
    stopZone,
    getStatus,
    getSensors,
};
