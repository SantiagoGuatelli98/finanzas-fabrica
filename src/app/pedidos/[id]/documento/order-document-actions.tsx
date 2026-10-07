"use client";

import { useState } from "react";
import { toJpeg } from "html-to-image";

export function OrderDocumentActions({ orderNumber, message }: { orderNumber: string; message: string }) {
  const [text, setText] = useState(message);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function makeImage() {
    const node = document.getElementById("order-document");
    if (!node) throw new Error("No encontramos el documento.");
    const dataUrl = await toJpeg(node, { quality: 0.96, pixelRatio: 2, backgroundColor: "#ffffff", cacheBust: true });
    return await (await fetch(dataUrl)).blob();
  }

  async function downloadImage() {
    setBusy(true); setStatus("");
    try {
      const blob = await makeImage();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `${orderNumber}.jpg`; anchor.click();
      URL.revokeObjectURL(url);
      setStatus("Imagen descargada.");
    } catch { setStatus("No se pudo generar la imagen en este navegador."); }
    finally { setBusy(false); }
  }

  async function shareWhatsApp() {
    setBusy(true); setStatus("");
    try {
      if ("share" in navigator && "canShare" in navigator) {
        const blob = await makeImage();
        const file = new File([blob], `${orderNumber}.jpg`, { type: "image/jpeg" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], text, title: orderNumber });
          setStatus("El pedido se compartió desde el menú del dispositivo. Eso no modifica su estado.");
          return;
        }
      }
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
      setStatus("WhatsApp abrió el mensaje editable. Adjuntá la imagen descargada si hace falta.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") setStatus("No se compartió el pedido.");
      else setStatus("No se pudo abrir el menú para compartir.");
    } finally { setBusy(false); }
  }

  return <div className="document-actions">
    <div className="document-action-buttons"><button type="button" className="doc-button red" onClick={shareWhatsApp} disabled={busy}>{busy ? "Preparando…" : "Compartir por WhatsApp"}</button><button type="button" className="doc-button" onClick={() => window.print()}>Imprimir / guardar PDF</button><button type="button" className="doc-button" onClick={downloadImage} disabled={busy}>Descargar imagen</button></div>
    <label className="message-editor">Mensaje para WhatsApp<textarea value={text} onChange={(event) => setText(event.target.value)} rows={5} /></label>
    {status && <p className="share-status" role="status">{status}</p>}
  </div>;
}
