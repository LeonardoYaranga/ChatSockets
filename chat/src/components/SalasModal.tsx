import { Button } from "primereact/button";
import { confirmDialog } from "primereact/confirmdialog";

export const SalasModal = ({ salas, onClose, onDelete }: any) => {
  const handleDelete = (salaId: number) => {
    confirmDialog({
      message: "¿Estás seguro de que deseas borrar esta sala?",
      header: "Confirmar borrado",
      icon: "pi pi-exclamation-triangle",
      acceptLabel: "Sí, borrar",
      rejectLabel: "Cancelar",
      accept: () => onDelete(salaId),
    });
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <h3>Salas creadas</h3>
        <ul className="salas-list">
          {salas.map((sala: any) => (
            <li key={sala.id}>
              PIN: {sala.pin} (Máx: {sala.max_users})
              <Button
                label="Borrar"
                className="p-button-danger p-button-text"
                style={{ marginLeft: 8 }}
                onClick={() => handleDelete(sala.id)}
              />
            </li>
          ))}
        </ul>
        <Button
          label="Cerrar"
          className="p-button-text"
          onClick={onClose}
          style={{ marginTop: "1rem" }}
        />
      </div>
      <div className="modal-backdrop" onClick={onClose} />
      <style>{`
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; display: flex; align-items: center; justify-content: center; z-index: 2000; }
        .modal-box { background: #fff; color: #111; padding: 2rem 2.5rem; border-radius: 12px; box-shadow: 0 4px 32px rgba(0,0,0,0.18); min-width: 320px; min-height: 180px; z-index: 2001; position: relative; text-align: center; }
        .salas-list { list-style: none; padding: 0; margin: 1rem 0; color: #111; }
        .salas-list li { margin-bottom: 0.5rem; font-size: 1.1rem; }
        .modal-backdrop { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.35); z-index: 2000; }
      `}</style>
    </div>
  );
};
