import React, { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { InputText } from "primereact/inputtext";
import { Toast } from "primereact/toast";
import { Button } from "primereact/button";
import { InputTextarea } from "primereact/inputtextarea";
import { Card } from "primereact/card";
import { RoomForm } from "./RoomForm";
import { MessageList } from "./MessageList";

const API_URL =
  import.meta.env.VITE_SOCKET_SERVER_URL || "http://localhost:5000";
console.log("API_URL:", API_URL);

interface Message {
  nickname: string;
  message: string;
  create_at: string;
}

export const Chat: React.FC = () => {
  const [nickName, setNickName] = useState<string>(
    () => localStorage.getItem("nickname") || ""
  );
  const [tempNickName, setTempNickName] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState<string>("");
  const [connected, setConnected] = useState<boolean>(false);
  const [pin, setPin] = useState<string>("");
  const [isInRoom, setIsInRoom] = useState<boolean>(false);
  const [currentPin, setCurrentPin] = useState<string>("");
  const [maxClients, setMaxClients] = useState<number>(10);
  const [userId, setUserId] = useState<number | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const toast = useRef<Toast>(null);
  const [showParticipants, setShowParticipants] = useState(false);
  const [participants, setParticipants] = useState<string[]>([]);
  const [socketReady, setSocketReady] = useState(false);
  const [wasSessionConflict, setWasSessionConflict] = useState(false);

  // Generar o recuperar device_id
  const [deviceId] = useState<string>(() => {
    const storedId = localStorage.getItem("device_id");
    if (storedId) return storedId;
    const newId = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      }
    );
    localStorage.setItem("device_id", newId);
    return newId;
  });

  // Inicializar socket y eventos
  useEffect(() => {
    socketRef.current = io(API_URL, {
      transports: ["websocket"],
      autoConnect: false,
    });
    const socket = socketRef.current;
    setSocketReady(true);

    socket.on("connect", () => {
      setConnected(true);
      console.log("Conectado al servidor");
    });

    socket.on(
      "room_created",
      ({ pin, sala_id }: { pin: string; sala_id: number }) => {
        setPin(pin);
        toast.current?.show({
          severity: "success",
          summary: "Sala Creada",
          detail: `Sala con PIN: ${pin}`,
        });
      }
    );

    socket.on(
      "joined_room",
      ({ pin, user_id }: { pin: string; user_id: number }) => {
        setCurrentPin(pin);
        setIsInRoom(true);
        setUserId(user_id);
        toast.current?.show({
          severity: "success",
          summary: "Sala Unida",
          detail: `Unido a la sala con PIN: ${pin}`,
        });
      }
    );

    socket.on("message_history", (messages: Message[]) => {
      setMessages(messages);
    });

    socket.on("receive_message", (data: Message) => {
      setMessages((prev) => [...prev, data]);
    });

    socket.on("system_message", (msg: string) => {
      setMessages((prev) => [
        ...prev,
        {
          nickname: "Sistema",
          message: msg,
          create_at: new Date().toISOString(),
        },
      ]);
    });

    socket.on("user_list", (users: string[]) => {
      setParticipants(users);
    });

    socket.on("error", (message: string) => {
      console.error("Error del servidor:", message);
      toast.current?.show({
        severity: "error",
        summary: "Error",
        detail: message,
      });
    });

    socket.on("session_conflict", (msg: string) => {
      setWasSessionConflict(true);
      toast.current?.show({
        severity: "warn",
        summary: "Sesión cerrada",
        detail: msg || "Se ha iniciado sesión en otro dispositivo.",
      });
      // Opcional: limpiar estado, cerrar sesión, etc.
      setNickName("");
      setUserId(null);
      setIsInRoom(false);
      setCurrentPin("");
      setPin("");
      setMessages([]);
      localStorage.removeItem("nickname");
      localStorage.removeItem("device_id");
    });

    socket.on("disconnect", () => {
      setConnected(false);
      setIsInRoom(false);
      setCurrentPin("");
      setMessages([]);
      if (!wasSessionConflict && nickName) {
        toast.current?.show({
          severity: "warn",
          summary: "Desconectado",
          detail: "Se perdió la conexión con el servidor",
        });
      }
      else {
        toast.current?.show({
          severity: "info",
          summary: "Sesión cerrada",
          detail: "Se ha cerrado la sesión por otro dispositivo",
        });
      }
      setWasSessionConflict(false); 
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    if ((socketReady && nickName && deviceId)) {
      autoLogin(nickName, deviceId);
    }
  }, [socketReady, nickName, deviceId]);

  // Función para autologin al recargar si hay nickname guardado
  const autoLogin = async (nickname: string, device_id: string) => {
    try {
      const response = await fetch(`${API_URL}/api/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname, device_id }),
      });
      const data = await response.json();
      if (response.ok) {
        setNickName(nickname);
        setUserId(data.user_id);

        // Solo emitir join_room si el socket NO está conectado
        if (!socketRef.current?.connected) {
          socketRef.current?.once("connect", () => {
            if (data.sala && data.sala.pin) {
              setPin(data.sala.pin);
              setCurrentPin(data.sala.pin);
              setIsInRoom(true);
              socketRef.current?.emit("join_room", {
                pin: data.sala.pin,
                user_id: data.user_id,
                device_id,
              });
            }
          });
          socketRef.current?.connect();
        } else {
          // Si ya está conectado, solo emite join_room una vez
          if (data.sala && data.sala.pin) {
            setPin(data.sala.pin);
            setCurrentPin(data.sala.pin);
            setIsInRoom(true);
            socketRef.current?.emit("join_room", {
              pin: data.sala.pin,
              user_id: data.user_id,
              device_id,
            });
          }
        }
      }
    } catch (error) {
      toast.current?.show({
        severity: "error",
        summary: "Error",
        detail: "Error al reconectar sesión",
      });
    }
  };

  const handleNickName = async (e?: React.KeyboardEvent<HTMLInputElement>) => {
    if (e && e.key !== "Enter" && e.type !== "click") return;
    const trimNickName = tempNickName.trim();
    if (!trimNickName) {
      toast.current?.show({
        severity: "error",
        summary: "Error",
        detail: "Ingresa un nickname válido",
      });
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: trimNickName, device_id: deviceId }),
      });
      const data = await response.json();
      if (response.ok) {
        setNickName(trimNickName);
        setUserId(data.user_id);
        localStorage.setItem("nickname", trimNickName); // Guardar nickname
        socketRef.current?.connect();

        // Si ya hay una sala activa, reconectar automáticamente
        if (data.sala && data.sala.pin) {
          setPin(data.sala.pin);
          setCurrentPin(data.sala.pin);
          setIsInRoom(true);
          socketRef.current?.emit("join_room", {
            pin: data.sala.pin,
            user_id: data.user_id,
            device_id: deviceId,
          });
        } else {
          toast.current?.show({
            severity: "success",
            summary: "Usuario Creado",
            detail: `Nickname ${trimNickName} registrado`,
          });
        }
      } else {
        toast.current?.show({
          severity: "error",
          summary: "Error",
          detail: data.error,
        });
      }
    } catch (error) {
      toast.current?.show({
        severity: "error",
        summary: "Error",
        detail: "Error al conectar con el servidor",
      });
    }
  };

  // Función para cerrar sesión
  const logout = () => {
    localStorage.removeItem("nickname");
    localStorage.removeItem("device_id");
    setNickName("");
    setUserId(null);
    setIsInRoom(false);
    setCurrentPin("");
    setPin("");
    setMessages([]);
    socketRef.current?.disconnect();
    toast.current?.show({
      severity: "info",
      summary: "Sesión cerrada",
      detail: "Has cerrado sesión correctamente",
    });
  };

  const createRoom = async () => {
    if (!maxClients || maxClients < 1 || maxClients > 10) {
      toast.current?.show({
        severity: "error",
        summary: "Error",
        detail: "Ingresa un número de clientes entre 1 y 10",
      });
      return;
    }
    try {
      const response = await fetch(`${API_URL}/api/salas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ max_users: maxClients }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast.current?.show({
          severity: "error",
          summary: "Error",
          detail: data.error,
        });
      } else {
        const messageSala = "Sala Creada con codigo " + data.pin;
        toast.current?.show({
          severity: "success",
          summary: messageSala,
        });
      }
    } catch (error) {
      console.error("Error al crear sala:", error);
      toast.current?.show({
        severity: "error",
        summary: "Error",
        detail: "Error al crear la sala",
      });
    }
  };

  const joinRoom = () => {
    if (!pin || !userId) {
      toast.current?.show({
        severity: "error",
        summary: "Error",
        detail: "Ingresa el PIN y asegúrate de estar registrado",
      });
      return;
    }
    console.log("Intentando unirse a sala con PIN:", pin, "user_id:", userId);
    socketRef.current?.emit("join_room", {
      pin,
      user_id: userId,
      device_id: deviceId,
    });
  };

  const sendMessage = () => {
    if (!message.trim() || !connected || !isInRoom) {
      toast.current?.show({
        severity: "error",
        summary: "Error",
        detail: "Escribe un mensaje y asegúrate de estar en una sala",
      });
      return;
    }
    socketRef.current?.emit("send_message", {
      pin: currentPin,
      message,
      user_id: userId,
    });
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
                onKeyDown={handleNickName}
                placeholder="Escribe tu NickName"
              />
            </div>
            <Button
              label="Conectar"
              icon="pi pi-check"
              className="p-button-raised p-button-info"
              onClick={() => handleNickName()}
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
        <Button
          label="Cerrar sesión"
          icon="pi pi-sign-out"
          className="p-button-raised p-button-secondary mb-3"
          onClick={logout}
        />
        <RoomForm
          maxClients={maxClients}
          setMaxClients={setMaxClients}
          createRoom={createRoom}
          pin={pin}
          setPin={setPin}
          joinRoom={joinRoom}
          connected={connected}
          userId={userId}
        />
      </div>
      <Button
        label="Mostrar participantes"
        icon="pi pi-users"
        className="p-button-raised p-button-info mb-3"
        onClick={() => setShowParticipants(true)}
      />

      {/* Modal de participantes */}
      {showParticipants && (
        <div className="modal-participants">
          <div className="modal-content">
            <h3>Participantes activos</h3>
            <ul>
              {participants.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <Button
              label="Cerrar"
              className="p-button-text"
              onClick={() => setShowParticipants(false)}
            />
          </div>
          <div
            className="modal-backdrop"
            onClick={() => setShowParticipants(false)}
          />
        </div>
      )}

      {isInRoom && (
        <Card title={`Chat de ${nickName} en sala ${currentPin}`}>
          <div className="p-fluid">
            <MessageList messages={messages} nickName={nickName} />
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