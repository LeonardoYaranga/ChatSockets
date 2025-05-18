import { useEffect, useRef } from "react";
import type { Message } from "../types";

export const MessageList = ({
  messages,
  nickName,
}: {
  messages: Message[];
  nickName: string;
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div
      className="field messages-container"
      style={{ maxHeight: "300px", overflowY: "auto", marginBottom: "1rem" }}
    >
      {messages.map((msg, idx) => (
        <p
          key={idx}
          className={`message ${msg.nickname === nickName ? "me" : "other"}`}
        >
          <strong>{msg.nickname}</strong>: {msg.message}{" "}
          <small>({new Date(msg.create_at).toLocaleTimeString()})</small>
        </p>
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
};
