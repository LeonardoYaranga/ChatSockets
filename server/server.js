const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

// Estado del servidor
const rooms = new Map(); // Almacena salas: { roomId: { pin, clients, maxClients } }
const clientToRoom = new Map(); // Mapea clientes a salas

// Generar PIN aleatorio
function generatePin() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // PIN de 6 dígitos
}

// Crear una sala
function createRoom(roomId, maxClients) {
  if (!rooms.has(roomId)) {
    const pin = generatePin();
    rooms.set(roomId, {
      pin,
      clients: new Set(),
      maxClients
    });
    console.log(`Sala ${roomId} creada con PIN: ${pin}`);
    return pin;
  }
  return rooms.get(roomId).pin;
}

// Manejar conexiones WebSocket
wss.on('connection', (ws) => {
  console.log('Nuevo cliente conectado');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      // Crear sala
      if (data.type === 'create') {
        const { roomId, maxClients } = data;
        const pin = createRoom(roomId, maxClients);
        ws.send(JSON.stringify({ type: 'roomCreated', roomId, pin }));
      }

      // Unirse a sala
      if (data.type === 'join') {
        const { roomId, pin, clientId } = data;

        // Verificar si el cliente ya está en una sala
        if (clientToRoom.has(clientId)) {
          ws.send(JSON.stringify({ type: 'error', message: 'Ya estás conectado a una sala' }));
          return;
        }

        // Verificar sala y PIN
        const room = rooms.get(roomId);
        if (!room) {
          ws.send(JSON.stringify({ type: 'error', message: 'La sala no existe' }));
          return;
        }
        if (room.pin !== pin) {
          ws.send(JSON.stringify({ type: 'error', message: 'PIN incorrecto' }));
          return;
        }
        if (room.clients.size >= room.maxClients) {
          ws.send(JSON.stringify({ type: 'error', message: 'Sala llena' }));
          return;
        }

        // Añadir cliente a la sala
        room.clients.add(ws);
        clientToRoom.set(clientId, roomId);
        ws.send(JSON.stringify({ type: 'joined', roomId }));

        // Notificar a otros en la sala
        room.clients.forEach((client) => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'userJoined', clientId }));
          }
        });
      }

      // Mensaje en la sala
      if (data.type === 'message') {
        const { roomId, message, clientId } = data;
        const room = rooms.get(roomId);
        if (room && room.clients.has(ws)) {
          room.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: 'message', clientId, message }));
            }
          });
        }
      }
    } catch (error) {
      ws.send(JSON.stringify({ type: 'error', message: 'Mensaje inválido' }));
    }
  });

  ws.on('close', () => {
    const roomId = clientToRoom.get(ws);
    if (roomId) {
      const room = rooms.get(roomId);
      if (room) {
        room.clients.delete(ws);
        clientToRoom.delete(ws);

        // Notificar salida
        room.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'userLeft', clientId: ws }));
          }
        });

        // Eliminar sala si está vacía
        if (room.clients.size === 0) {
          rooms.delete(roomId);
          console.log(`Sala ${roomId} eliminada`);
        }
      }
    }
    console.log('Cliente desconectado');
  });
});

console.log('Servidor WebSocket iniciado en ws://localhost:8080');