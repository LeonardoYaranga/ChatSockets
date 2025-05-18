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
      {messages.map((msg, idx) => {
        if (msg.nickname === "Sistema") {
          return (
            <div
              key={idx}
              className="message-row system-message"
              style={{
                display: "flex",
                justifyContent: "center",
                marginBottom: "0.5rem",
              }}
            >
              <div
                className="message-bubble system-bubble"
                style={{
                  background: "#ffeeba",
                  color: "#856404",
                  padding: "0.5rem 1rem",
                  borderRadius: "16px",
                  maxWidth: "80%",
                  textAlign: "center",
                  fontStyle: "italic",
                  fontWeight: 500,
                }}
              >
                {msg.message}{" "}
                <small style={{ fontSize: "0.8em", color: "#b79c3b" }}>
                  ({new Date(msg.create_at).toLocaleTimeString()})
                </small>
              </div>
            </div>
          );
        }

        return (
          <div
            key={idx}
            className={`message-row ${
              msg.nickname === nickName ? "me" : "other"
            }`}
            style={{
              display: "flex",
              justifyContent:
                msg.nickname === nickName ? "flex-end" : "flex-start",
              marginBottom: "0.5rem",
            }}
          >
            <div
              className={`message-bubble ${
                msg.nickname === nickName ? "me-bubble" : "other-bubble"
              }`}
              style={{
                background: msg.nickname === nickName ? "#cce5ff" : "#f1f1f1",
                color: "#222",
                padding: "0.5rem 1rem",
                borderRadius: "16px",
                maxWidth: "70%",
                textAlign: msg.nickname === nickName ? "right" : "left",
              }}
            >
              <strong>{msg.nickname}</strong>: {msg.message}{" "}
              <small style={{ fontSize: "0.8em", color: "#888" }}>
                ({new Date(msg.create_at).toLocaleTimeString()})
              </small>
            </div>
          </div>
        );
      })}
      <div ref={messagesEndRef} />
    </div>
  );
};
