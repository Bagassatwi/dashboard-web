"use client";
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const API = process.env.NEXT_PUBLIC_API_URL;
const SLOTS = ["cam1", "cam2"], STALE_MS = 4000;
const blank = () => Object.fromEntries(SLOTS.map((s) => [s, { online: false, fire: false, name: "", prob: 0 }]));

function CamCard({ slot, cam, lastFrame, imgRef }) {
  const live = cam.online && Date.now() - lastFrame < STALE_MS;
  let pill = ["", "KAMERA OFF"];
  if (cam.online && cam.fire) pill = ["fire", "API TERDETEKSI"];
  else if (live) pill = ["on", "TERHUBUNG · LIVE"];
  else if (cam.online) pill = ["wait", "MENUNGGU VIDEO"];
  return (
    <div className="card">
      <div className="top">
        <b>{slot.toUpperCase().replace("CAM", "CAM ")} <span style={{ color: "var(--muted)", fontWeight: 400 }}>{cam.online ? cam.name : ""}</span></b>
        <span className={`pill ${pill[0]}`}><span className="dot" />{pill[1]}</span>
      </div>
      <div className={`screen ${live ? "show" : ""} ${cam.online && cam.fire ? "fire" : ""}`}>
        <img ref={imgRef} alt="" />
        <div className="ph">{cam.online ? "Menunggu video dari kamera..." : "Kamera tidak terbuka"}</div>
      </div>
      <div className="meta">{cam.online ? `Probabilitas api: ${(cam.prob * 100).toFixed(1)}%` : "-"}</div>
    </div>
  );
}

export default function Dashboard() {
  const [server, setServer] = useState(["", "Menyambung..."]);
  const [cams, setCams] = useState(blank);
  const [last, setLast] = useState({ cam1: 0, cam2: 0 });
  const [shots, setShots] = useState([]);
  const [histMsg, setHistMsg] = useState("Memuat...");
  const [toast, setToast] = useState("");
  const [, setTick] = useState(0);
  const imgs = useRef({ cam1: null, cam2: null }), urls = useRef({}), toastTimer = useRef();

  useEffect(() => {
    const key = localStorage.getItem("access_key") || "";
    const socket = io(API, { transports: ["websocket"], auth: { role: "dashboard", key } });

    socket.on("connect", () => setServer(["on", "Server terhubung"]));
    socket.on("disconnect", () => { setServer(["", "Server terputus"]); setCams(blank()); });
    socket.on("connect_error", (e) => {
      if (e.message === "unauthorized") {
        const k = prompt("Masukkan kunci akses");
        if (k) { localStorage.setItem("access_key", k); location.reload(); }
      } else setServer(["wait", "Gagal menyambung, mencoba lagi..."]);
    });
    socket.on("cameras", (list) => setCams(Object.fromEntries(
      list.map((d) => [d.slot, { online: d.online, fire: d.fire, name: d.name || "", prob: d.prob }]))));
    socket.on("frame", (d) => {
      const img = imgs.current[d.cam]; if (!img) return;
      const old = urls.current[d.cam];
      urls.current[d.cam] = img.src = URL.createObjectURL(new Blob([d.image], { type: "image/jpeg" }));
      if (old) URL.revokeObjectURL(old);
      setLast((p) => ({ ...p, [d.cam]: Date.now() }));
    });
    socket.on("detection", (item) => {
      setShots((p) => [item, ...p].slice(0, 48)); setHistMsg("");
      setToast(`Api terdeteksi di ${item.camera_name || item.camera}`);
      clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(""), 6000);
    });

    const tick = setInterval(() => setTick((n) => n + 1), 1000);   // evaluasi "menunggu video"
    fetch(`${API}/api/detections?limit=48`, { headers: { "X-Access-Key": key } })
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; })
      .then((d) => { setShots(d.items); setHistMsg(d.error || ""); })
      .catch((e) => setHistMsg("Gagal memuat riwayat: " + e.message));

    return () => { socket.disconnect(); clearInterval(tick); clearTimeout(toastTimer.current); };
  }, []);

  return (
    <>
      <header>
        <h1>Dashboard Deteksi Api</h1>
        <span className={`pill ${server[0]}`}><span className="dot" />{server[1]}</span>
      </header>
      <main>
        <section>
          <h2>Kamera Live (maks. 2)</h2>
          <div className="live">
            {SLOTS.map((s) => (
              <CamCard key={s} slot={s} cam={cams[s]} lastFrame={last[s]} imgRef={(el) => (imgs.current[s] = el)} />
            ))}
          </div>
        </section>
        <section className="card">
          <div className="top"><h2 style={{ margin: 0 }}>Riwayat Deteksi (database)</h2><span className="pill">{shots.length}</span></div>
          <div className="grid">
            {shots.map((i) => (
              <a key={i.id} className="shot" href={i.image_url} target="_blank" rel="noopener noreferrer">
                <img loading="lazy" src={i.image_url} alt="" />
                <div className="cap">
                  <span>{new Date(i.created_at).toLocaleString("id-ID")}</span>
                  <span>{i.camera_name || i.camera} · {((i.confidence || 0) * 100).toFixed(0)}%</span>
                </div>
              </a>
            ))}
            {!shots.length && <div className="empty">{histMsg || "Belum ada deteksi."}</div>}
          </div>
        </section>
      </main>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
