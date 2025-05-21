import "dotenv/config";
import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import mysql from "mysql2/promise";

// Iniciar una aplicación Express
const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Configuración de la base de datos
const db = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "1234",
  database: process.env.DB_NAME || "ChatWebSocket",
});

// Generar PIN aleatorio
function generatePin() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // PIN de 6 dígitos
}

// Endpoint para crear usuario   //TODO: Cambiar a io.on("crear_usuario")
app.post("/api/users", async (req, res) => {
  const { nickname, device_id } = req.body;
  if (!nickname || !device_id) {
    return res
      .status(400)
      .json({ error: "Nickname y device_id son requeridos" });
  }
  try {
    const [existingUser] = await db.query(
      "SELECT id FROM users WHERE nickname = ?",
      [nickname]
    );
    let user_id;
    if (existingUser[0]) {
      user_id = existingUser[0].id;
    } else {
      const [result] = await db.query(
        "INSERT INTO users (nickname, device_id) VALUES (?, ?)",
        [nickname, device_id]
      );
      user_id = result.insertId;
    }

    // Buscar sesión activa
    const [session] = await db.query(
      `SELECT s.sala_id, r.pin FROM sessions s JOIN salas r ON s.sala_id = r.id WHERE s.user_id = ? AND s.device_id = ?`,
      [user_id, device_id]
    );
    if (session[0]) {
      // Ya tiene sesión activa, devolver info de la sala
      return res.json({ user_id, nickname, sala: { pin: session[0].pin } });
    }

    res.json({ user_id, nickname });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al crear el usuario" });
  }
});

// Crear una sala (HTTP endpoint)  //TODO: Cambiar a io.on("crear_sala")
app.post("/api/salas", async (req, res) => {
  const { max_users, creator_id } = req.body;
  if (!Number.isInteger(max_users) || max_users < 1 || max_users > 10) {
    return res
      .status(400)
      .json({ error: "El número máximo de usuarios debe estar entre 1 y 10" });
  }
  if (!creator_id) {
    return res.status(400).json({ error: "creator_id es requerido" });
  }

  // Validar máximo de 3 salas por usuario
  const [salasCreadas] = await db.query(
    "SELECT COUNT(*) as count FROM salas WHERE creator_id = ?",
    [creator_id]
  );
  if (salasCreadas[0].count >= 3) {
    return res.status(400).json({
      error:
        "Has excedido el número máximo de salas creadas (3). Borra alguna para crear una nueva.",
    });
  }

  let pin;
  try {
    do {
      pin = generatePin();
      const [rows] = await db.query("SELECT 1 FROM salas WHERE pin = ?", [pin]);
      if (rows.length === 0) break;
    } while (true);

    const [result] = await db.query(
      "INSERT INTO salas (pin, max_users, creator_id) VALUES (?, ?, ?)",
      [pin, max_users, creator_id]
    );
    res.json({ pin, sala_id: result.insertId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al crear la sala" });
  }
});

app.get("/api/salas/usuario/:userId", async (req, res) => {
  const { userId } = req.params;
  try {
    const [salas] = await db.query(
      "SELECT id, pin, max_users FROM salas WHERE creator_id = ?",
      [userId]
    );
    res.json(salas);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener las salas" });
  }
});

app.delete("/api/salas/:salaId", async (req, res) => {
  const { salaId } = req.params;
  try {
    await db.query("DELETE FROM sessions WHERE sala_id = ?", [salaId]);
    await db.query("DELETE FROM messages WHERE sala_id = ?", [salaId]);
    await db.query("DELETE FROM salas WHERE id = ?", [salaId]);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al borrar la sala" });
  }
});

const disconnectTimeouts = {};
const activeSockets = {};
const activeUsers = {};
const ipToSockets = new Map();

// Manejar conexiones
io.on("connection", (socket) => {
  console.log("Cliente conectado:", socket.id, "IP:", socket.handshake.address);
  const clientIp =
    socket.handshake.address.replace(/^::ffff:/, "") ||
    socket.handshake.address;
  console.log("Cliente conectado:", socket.id, "IP:", clientIp);
  console.log(
    "Estado de ipToSockets antes:",
    Array.from(ipToSockets.entries())
  );

  // Verificar si ya existe una sesión activa desde esta IP
  const previousSocketByIp = ipToSockets.get(clientIp);
  console.log(previousSocketByIp);
  if (previousSocketByIp && io.sockets.sockets.get(previousSocketByIp)) {
    console.log(
      `Sesión activa encontrada para IP ${clientIp}: socket ${previousSocketByIp}`
    );
    console.log(
      `Rechazando nuevo intento de conexión desde socket ${socket.id}`
    );
    socket.emit(
      "session_conflict",
      "Ya hay una sesión activa desde este dispositivo."
    );
    socket.disconnect(true);
    console.log(`Socket ${socket.id} desconectado por IP duplicada`);
    return; // Terminar la conexión
  }

  ipToSockets.set(clientIp, socket.id);
  console.log(
    "Estado de ipToSockets después:",
    Array.from(ipToSockets.entries())
  );

  // Unirse a una sala
  socket.on("join_room", async ({ pin, user_id, device_id }) => {
    try {
      socket.user_id = user_id;
      // Desconectar socket anterior si existe
      if (
        activeSockets[device_id] &&
        activeSockets[device_id].id !== socket.id
      ) {
        activeSockets[device_id].emit(
          "error",
          "Se ha iniciado sesión en otra pestaña o ventana."
        );
        activeSockets[device_id].disconnect(true);

        // Eliminar la sesión anterior
        await db.query("DELETE FROM sessions WHERE device_id = ?", [device_id]);
        console.log(
          "Desconectando socket anterior:",
          activeSockets[device_id].id
        );
        delete activeSockets[device_id];
      }
      activeSockets[device_id] = socket;

      if (activeUsers[user_id] && activeUsers[user_id].id !== socket.id) {
        activeUsers[user_id].emit(
          "session_conflict",
          "Se ha iniciado sesión en otro dispositivo."
        );
        activeUsers[user_id].disconnect(true);
        // Eliminar la sesión anterior
        await db.query(
          "DELETE FROM sessions WHERE user_id = ? AND device_id = ?",
          [user_id, activeUsers[user_id].device_id]
        );
        console.log("Desconectando socket anterior:", activeUsers[user_id].id);
        delete activeUsers[user_id];
      }
      activeUsers[user_id] = socket;

      if (disconnectTimeouts[device_id]) {
        clearTimeout(disconnectTimeouts[device_id]);
        delete disconnectTimeouts[device_id];
      }

      // Buscar la sala por PIN
      const [sala] = await db.query(
        "SELECT id, max_users FROM salas WHERE pin = ?",
        [pin]
      );
      if (!sala[0]) {
        return socket.emit("error", "Sala no encontrada");
      }
      const sala_id = sala[0].id;
      const max_users = sala[0].max_users;

      // Verificar cuántos usuarios hay actualmente en la sala
      const [usersMax] = await db.query(
        "SELECT u.nickname FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.sala_id = ?",
        [sala_id]
      );
      if (usersMax.length >= max_users) {
        return socket.emit(
          "error",
          `La sala ya está llena (${max_users} usuarios máximo)`
        );
      }

      // Verificar si ya existe una sesión para este user_id y device_id en esta sala
      const [existingSession] = await db.query(
        "SELECT id, sala_id FROM sessions WHERE user_id = ? AND device_id = ?",
        [user_id, device_id]
      );

      // Unir el socket a la sala de Socket.IO
      socket.join(pin);
      socket.device_id = device_id;

      if (!existingSession[0] || existingSession[0].sala_id !== sala_id) {
        // Elimina cualquier sesión previa (de otra sala)
        await db.query(
          "DELETE FROM sessions WHERE user_id = ? AND device_id = ?",
          [user_id, device_id]
        );
        // Crea la nueva sesión solo si no existe para esta sala
        await db.query(
          "INSERT INTO sessions (user_id, sala_id, device_id) VALUES (?, ?, ?)",
          [user_id, sala_id, device_id]
        );
      }

      // Obtener historial de mensajes
      const [messages] = await db.query(
        `SELECT m.message, u.nickname, m.create_at
         FROM messages m
         JOIN users u ON m.user_id = u.id
         WHERE m.sala_id = ?
         ORDER BY m.create_at ASC`,
        [sala_id]
      );
      socket.emit("message_history", messages);

      const [users] = await db.query(
        "SELECT u.nickname FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.sala_id = ?",
        [sala_id]
      );
      const [salaInfo] = await db.query(
        "SELECT max_users FROM salas WHERE id = ?",
        [sala_id]
      );
      io.to(pin).emit("user_list", {
        users: users.map((u) => u.nickname),
        max_users: salaInfo[0]?.max_users || 0,
      });

      // Notificar solo el último usuario que se unió
      if (users.length > 0) {
        const lastUser = users[users.length - 1].nickname;
        console.log(
          "Se unio el usuario",
          lastUser,
          " a la sala: ",
          pin,
          " Con socketId: ",
          socket.id
        );
        io.to(pin).emit("system_message", `Se ha unido ${lastUser}`);
      }

      // Notificar unión exitosa
      socket.emit("joined_room", { pin, user_id });
    } catch (error) {
      console.error(error);
      socket.emit("error", "Error al unirse a la sala");
    }
  });

  // Enviar mensaje
  socket.on("send_message", async ({ pin, message, user_id }) => {
    try {
      console.log("Mensaje recibido:", message);
      const [session] = await db.query(
        "SELECT s.id, s.sala_id FROM sessions s JOIN salas r ON s.sala_id = r.id WHERE s.user_id = ? AND r.pin = ?",
        [user_id, pin]
      );
      if (!session[0]) {
        socket.emit("error", "No estás en esta sala");
        return;
      }

      const [user] = await db.query("SELECT nickname FROM users WHERE id = ?", [
        user_id,
      ]);
      await db.query(
        "INSERT INTO messages (message, user_id, sala_id) VALUES (?, ?, ?)",
        [message, user_id, session[0].sala_id]
      );

      io.to(pin).emit("receive_message", {
        nickname: user[0].nickname,
        message,
        create_at: new Date().toISOString(),
      });
      console.log(`Mensaje en sala ${pin} de ${user[0].nickname}: ${message}`);
    } catch (error) {
      console.error(error);
      socket.emit("error", "Error al enviar el mensaje");
    }
  });

  // Manejar desconexión
  socket.on("disconnect", async () => {
    if (!socket.device_id) return;
    if (socket.user_id && activeUsers[socket.user_id] === socket) {
      delete activeUsers[socket.user_id];
    }
    disconnectTimeouts[socket.device_id] = setTimeout(async () => {
      try {
        const [session] = await db.query(
          "SELECT s.sala_id, r.pin FROM sessions s JOIN salas r ON s.sala_id = r.id WHERE s.device_id = ?",
          [socket.device_id]
        );
        if (session[0]) {
          const { sala_id, pin } = session[0];
          await db.query("DELETE FROM sessions WHERE device_id = ?", [
            socket.device_id,
          ]);

          const [users] = await db.query(
            "SELECT u.nickname FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.sala_id = ?",
            [sala_id]
          );
          const [salaInfo] = await db.query(
            "SELECT max_users FROM salas WHERE id = ?",
            [sala_id]
          );
          io.to(pin).emit("user_list", {
            users: users.map((u) => u.nickname),
            max_users: salaInfo[0]?.max_users || 0,
          });

          // Eliminar sala si está vacía
          const [sessions] = await db.query(
            "SELECT COUNT(*) as count FROM sessions WHERE sala_id = ?",
            [sala_id]
          );
          const [messageCount] = await db.query(
            "SELECT COUNT(*) AS count FROM messages WHERE sala_id = ?",
            [sala_id]
          );
          if (sessions[0].count === 0 && messageCount[0].count === 0) {
            await db.query("DELETE FROM salas WHERE id = ?", [sala_id]);
            console.log(`Sala ${pin} eliminada`);
          }
          console.log(`Cliente desconectado de la sala ${pin}`);
        }
      } catch (error) {
        console.error(error);
      }
      console.log(
        "Cliente desconectado:",
        socket.id,
        "IP:",
        socket.handshake.address
      );
      delete disconnectTimeouts[socket.device_id];
    }, 3000);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
