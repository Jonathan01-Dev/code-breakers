// packet.js
module.exports = {
    parseHello: (msg) => {
        const magic = msg.slice(0, 3).toString(); // "ARC"
        const version = msg.readUInt8(3);         // 1
        const type = msg.readUInt8(4);            // 1 (HELLO)
        const nodeId = msg.slice(5).toString();   // L'ID (Clé publique)

        if (magic === "ARC" && type === 1) {
            return { nodeId, version };
        }
        return null;
    }
};