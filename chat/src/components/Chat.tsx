import React, { useEffect, useRef } from "react";
import { useState } from "react";
import { io, Socket } from "socket.io-client";

import { InputText } from "primereact/inputtext";
import { Toast } from "primereact/toast";
import { Button } from "primereact/button";
import { InputNumber } from "primereact/inputnumber";
import { InputTextarea } from "primereact/inputtextarea";
import { Card } from "primereact/card";
//VALOR DE LA VARIABLE DE ENTORNO en VITE
const API_URL = import.meta.env.VITE_SOCKET_SERVER_URL!;
console.log(API_URL);

interface Message {
  //  author: string;
  clientId: string;
  message: string;
  roomId?: string;
  //timestamp: string;
}

interface HostInfo {
  host: string;
  ip: string;
}

export const Chat: React.FC = () => {
  //usestate
  const [nickName, setNickName] = useState<string>("");
  const [tempNickName, setTempNickName] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState<string>("");
  const [hostInfo, setHostInfo] = useState<HostInfo>({
    host: "",
    ip: "",
  });
  const [connected, setConnected] = useState<boolean>(false);
  const socketRef = useRef<Socket | null>(null);
  const [roomId, setRoomId] = useState<string>("");
  const [pin, setPin] = useState<string>("");
  const [isInRoom, setIsInRoom] = useState<boolean>(false);
  const [currentRoom, setCurrentRoom] = useState<string>("");
  const [maxClients, setMaxClients] = useState<number>(10);
  const [joinRoomId, setJoinRoomId] = useState("");

  const [socket, setSocket] = useState<Socket | null>(null);
  const toast = useRef<Toast>(null);
  useEffect(() => {
    if (nickName) return;
    //crear la conexion

    setSocket((socketRef.current = io(API_URL)));
    socketRef.current.on("connect", () => {
      //
      setConnected(true);
    });
    socketRef.current.on("host_info", (data: HostInfo) => {
      setHostInfo(data);
    });
    socketRef.current.on(
      "room_created",
      ({ roomId, pin }: { roomId: string; pin: string }) => {
        setRoomId(roomId);
        setPin(pin);
        alert(`Room created with ID: ${roomId} and PIN: ${pin}`);
        console.log(`Room created with ID: ${roomId} and PIN: ${pin}`);
        // toast.current?.show({
        //   severity: "success",
        //   summary: "Sala Creada",
        //   detail: `Sala ${roomId} con PIN: ${pin}`,
        // });
      }
    );

    socketRef.current.on("room_joined", (data: { roomId: string }) => {
      setCurrentRoom(roomId);
      setIsInRoom(true);
      setRoomId(data.roomId);
      setMessages([]); // Limpiar mensajes al unirse a una nueva sala
      alert(`Joined room with ID: ${data.roomId}`);
      console.log(`Joined room with ID: ${data.roomId}`);
      // toast.current?.show({
      //   severity: "success",
      //   summary: "Sala Unida",
      //   detail: `Unido a la sala ${data.roomId}`,
      // });
    });

    socketRef.current.on("receive_message", (data: Message) => {
      setMessages((prev) => [...prev, data]);
    });

    socketRef.current.on(
      "user_joined",
      ({ clientId }: { clientId: string }) => {
        setMessages((prev) => [
          ...prev,
          { clientId, message: `${clientId} se unió a la sala` },
        ]);
      }
    );
    socketRef.current.on("user_left", ({ clientId }: { clientId: string }) => {
      setMessages((prev) => [
        ...prev,
        { clientId, message: `${clientId} salió de la sala` },
      ]);
    });

    socketRef.current.on("error", (error: string) => {
      console.error("Socket error:", error);
      // Handle error here, e.g., show a toast notification
      // toast.current?.show({
      //   severity: "error",
      //   summary: "Error",
      //   detail: error,
      // });
    });

    socketRef.current.on("disconnect", () => {
      setConnected(false);
      setIsInRoom(false);
      setCurrentRoom("");
      setMessages([]);
      // toast.current?.show({
      //   severity: "warn",
      //   summary: "Desconectado",
      //   detail: "Se perdió la conexión con el servidor",
      // });
    });
    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
      // socketRef.current?.on("disconnect", () => {
      //   setConnected(false);

      // });
    };
  }, []);

  const handleNickName = () => {
    const trimNickName = tempNickName.trim();
    if (!trimNickName) return;
    setNickName(trimNickName);
  };
  // Crear sala
  const createRoom = () => {
    if (!maxClients || maxClients < 1 || maxClients > 10) {
      // toast.current?.show({
      //   severity: "error",
      //   summary: "Error",
      //   detail: "Ingresa un número de clientes entre 1 y 10",
      // });
      return;
    }
    socketRef.current?.emit("create_room", { maxClients });
  };

  // Unirse a sala
  const joinRoom = () => {
    if (!joinRoomId || !pin) {
      // toast.current?.show({
      //   severity: "error",
      //   summary: "Error",
      //   detail: "Ingresa el ID de la sala y el PIN",
      // });
      return;
    }
    socketRef.current?.emit("join_room", {
      roomId: joinRoomId,
      pin,
      clientId: nickName,
    });
  };

  const sendMessage = () => {
    if (!message.trim() || !connected) return;
    const msg: Message = {
      clientId: nickName,
      message: message,
      roomId: currentRoom,
    };

    socketRef.current?.emit("send_message", msg);
    setMessages((prev) => [...prev, msg]); //Quiza esto puede poner 2 veces el mensaje
    setMessage("");
  };

  if (!nickName) {
    return (
      <div className="app">
        <Card title="Bienvenido">
          <div className="p-fluid">
            <div className="p-field">
              <label htmlFor="nickName">NickName</label>
              <InputText
                id="nickName"
                value={tempNickName}
                onChange={(e) => setTempNickName(e.target.value)}
                placeholder="Escribe tu NickName"
              />
            </div>
            <Button
              label="Conectar"
              icon="pi pi-check"
              className="p-button-raised p-button-info"
              onClick={handleNickName}
            />
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="p-4">
        <Toast ref={toast} />
        <h1>Chat con Socket.IO</h1>
        <div className="grid">
          <div className="col-12 md:col-6">
            <Card title="Crear Sala">
              <div className="p-fluid">
                <div className="field">
                  <label htmlFor="maxClients">Máximo de Clientes (1-10)</label>
                  <InputNumber
                    id="maxClients"
                    value={maxClients}
                    onValueChange={(e) => setMaxClients(e.value!)}
                    min={1}
                    max={10}
                    showButtons
                  />
                </div>
                <Button
                  label="Crear Sala"
                  onClick={createRoom}
                  disabled={!socket}
                />
              </div>
            </Card>
          </div>
        </div>

        <div className="col-12 md:col-6">
          <Card title="Unirse a Sala">
            <div className="p-fluid">
              <div className="field">
                <label htmlFor="joinRoomId">ID de la Sala</label>
                <InputText
                  id="joinRoomId"
                  value={joinRoomId}
                  onChange={(e) => setJoinRoomId(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="pin">PIN</label>
                <InputText
                  id="pin"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                />
              </div>
              <Button label="Unirse" onClick={joinRoom} disabled={!socket} />
            </div>
          </Card>
        </div>
      </div>

      {isInRoom && (
        <Card title={`Chat de ${nickName} con numero de sala ${currentRoom}`}>
          <div className="p-fluid">
            <div
              className="field messages-container"
              style={{
                maxHeight: "300px",
                overflowY: "auto",
                marginBottom: "1rem",
              }}
            >
              {messages.map((msg, index) => (
                <p
                  key={index}
                  className={`message ${
                    msg.clientId === nickName ? "me" : "other"
                  }`}
                >
                  <strong>{msg.clientId}</strong>: {msg.message}
                </p>
              ))}
            </div>

            <div className="field input-chat">
              <InputTextarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Escribe tu mensaje"
                rows={1}
                autoResize
                className="w-full"
              />
            </div>
            <div className="host-info">
              <p>
                Host: {hostInfo.host} - IP: {hostInfo.ip}
              </p>
            </div>
            <Button
              label="Enviar"
              icon="pi pi-send"
              className="p-button-raised p-button-success"
              onClick={sendMessage}
            />
          </div>
        </Card>
      )}
    </div>
  );
};
