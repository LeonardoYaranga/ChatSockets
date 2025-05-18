import { InputNumber } from "primereact/inputnumber";
import { InputText } from "primereact/inputtext";
import { Button } from "primereact/button";

export const RoomForm = ({
  maxClients,
  setMaxClients,
  createRoom,
  pin,
  setPin,
  joinRoom,
  connected,
  userId,
}: any) => (
  <div className="grid">
    <div className="col-12 md:col-6">
      {/* Crear sala */}
      <div className="p-fluid">
        <label>Máximo de Clientes (1-10)</label>
        <InputNumber
          value={maxClients}
          onValueChange={(e) => setMaxClients(e.value!)}
          min={1}
          max={10}
          showButtons
        />
        <Button
          label="Crear Sala"
          onClick={createRoom}
          disabled={!connected || !userId}
        />
      </div>
    </div>
    <div className="col-12 md:col-6">
      {/* Unirse a sala */}
      <div className="p-fluid">
        <label>PIN</label>
        <InputText
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="Ingresa el PIN"
        />
        <Button
          label="Unirse"
          onClick={joinRoom}
          disabled={!connected || !userId}
        />
      </div>
    </div>
  </div>
);
