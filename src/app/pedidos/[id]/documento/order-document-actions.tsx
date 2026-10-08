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
    window.open(`https://web.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    try {
      const blob = await makeImage();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `${orderNumber}.jpg`; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus("WhatsApp Web abrió el mensaje. Adjuntá la boleta descargada y tocá Enviar.");
    } catch {
      setStatus("WhatsApp Web abrió el mensaje. No se pudo descargar la boleta; probá «Descargar imagen».");
    } finally { setBusy(false); }
  }

  return <div className="document-actions">
    <div className="document-action-buttons"><button type="button" className="doc-button red" onClick={shareWhatsApp} disabled={busy}>{busy ? "Preparando…" : "Abrir WhatsApp Web"}</button><button type="button" className="doc-button" onClick={() => window.print()}>Imprimir / guardar PDF</button><button type="button" className="doc-button" onClick={downloadImage} disabled={busy}>Descargar imagen</button></div>
    <label className="message-editor">Mensaje para WhatsApp<textarea value={text} onChange={(event) => setText(event.target.value)} rows={5} /></label>
    {status && <p className="share-status" role="status">{status}</p>}
  </div>;
}
