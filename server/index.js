import "dotenv/config";
import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import dns from "dns";

//require("dotenv").config();
// const express = require("express");
// const http = require("http");
// const cors = require("cors");
// const {Server} = require("socket.io");
// const dns = require("dns");

//iniciar una aplicacion express
const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.CORS_ORIGIN } });

// Estado del servidor
const rooms = new Map(); // { roomId: { pin, clients, maxClients } }
const clientToRoom = new Map(); // { clientId: roomId }
const ipToRoom = new Map(); // { clientIp: roomId }
let nextRoomId = 1; // Contador para IDs de salas
// Generar PIN aleatorio
function generatePin() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // PIN de 6 dígitos
}
// Manejar conexiones
io.on("connection", (socket) => {
  const clientIp =
    socket.handshake.address.replace("::ffff:", "") || socket.handshake.address;
  console.log("Cliente conectado:", clientIp);

  dns.reverse(clientIp, (err, hostnames) => {
    const hostname = err ? clientIp : hostnames[0];
    console.log("Client hostname:", hostname);
    socket.emit("host_info", { host: hostname, ip: clientIp });
  });

  // Crear una sala
  socket.on("create_room", ({ maxClients }) => {
    // Validar maxClients
    if (!Number.isInteger(maxClients) || maxClients < 1 || maxClients > 10) {
      socket.emit("error", {
        message: "El número máximo de clientes debe estar entre 1 y 10",
      });
      return;
    }

    // Verificar si el cliente (IP) ya está en una sala
    if (ipToRoom.has(clientIp)) {
      socket.emit("error", {
        message: "Ya estás conectado a una sala desde esta IP",
      });
      return;
    }

    const roomId = nextRoomId.toString(); // Generar ID incremental
    const pin = generatePin();
    rooms.set(roomId, {
      pin,
      clients: new Set(),
      maxClients,
    });
    nextRoomId++;
    console.log(`Sala ${roomId} creada con PIN: ${pin}`);
    socket.emit("room_created", { roomId, pin });
  });

  // Unirse a una sala
  socket.on("join_room", ({ roomId, pin, clientId }) => {
    // Verificar si el cliente (clientId) ya está en una sala
    if (clientToRoom.has(clientId)) {
      socket.emit("error", { message: "Ya estás conectado a una sala" });
      return;
    }

    // Verificar si el cliente (IP) ya está en una sala
    if (ipToRoom.has(clientIp)) {
      socket.emit("error", {
        message: "Ya estás conectado a una sala desde esta IP",
      });
      return;
    }

    const room = rooms.get(roomId);
    if (!room) {
      socket.emit("error", { message: "La sala no existe" });
      return;
    }
    if (room.pin !== pin) {
      socket.emit("error", { message: "PIN incorrecto" });
      return;
    }
    if (room.clients.size >= room.maxClients) {
      socket.emit("error", { message: "Sala llena" });
      return;
    }

    // Unir al cliente a la sala
    room.clients.add(socket.id);
    clientToRoom.set(clientId, roomId);
    ipToRoom.set(clientIp, roomId);
    socket.join(roomId);
    socket.emit("joined_room", { roomId });

    io.to(roomId).emit("user_joined", { clientId });
    console.log(`Cliente ${clientId} se unió a la sala ${roomId}`);
  });

  // Enviar mensaje
  socket.on("send_message", ({ roomId, message, clientId }) => {
    const room = rooms.get(roomId);
    if (room && room.clients.has(socket.id)) {
      io.to(roomId).emit("receive_message", { clientId, message });
      console.log(`Mensaje en sala ${roomId} de ${clientId}: ${message}`);
    }
  });

  // Manejar desconexión
  socket.on("disconnect", () => {
    const roomId = clientToRoom.get(socket.id);
    if (roomId) {
      const room = rooms.get(roomId);
      if (room) {
        room.clients.delete(socket.id);
        clientToRoom.delete(socket.id);
        ipToRoom.delete(clientIp);
        io.to(roomId).emit("user_left", { clientId: socket.id });
        console.log(`Cliente ${socket.id} salió de la sala ${roomId}`);

        if (room.clients.size === 0) {
          rooms.delete(roomId);
          console.log(`Sala ${roomId} eliminada`);
        }
      }
    }
    console.log("Cliente desconectado:", clientIp);
  });

  // socket.on("send_message", (msg) => {
  //   console.log(`Mensaje recibido: de ${clientIp}: ${msg}`); //Esto no se hace, por privacidad
  //   socket.emit("receive_message", msg);
  // });
  // socket.on("disconnect", () => {
  //   console.log("Cliente desconectado:", clientIp);
  // });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
