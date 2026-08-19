import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { CheckCircle2, XCircle, Keyboard, Camera, ScanLine } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import Avatar from '../Avatar';
import Badge from '../Badge';

const READER_ID = 'qr-reader';

export default function Scan() {
  const { auth } = useAuth();
  const [result, setResult] = useState(null);
  const [recent, setRecent] = useState([]);
  const [manualCode, setManualCode] = useState('');
  const [cameraError, setCameraError] = useState('');
  const scannerRef = useRef(null);
  const busyRef = useRef(false);

  function loadRecent() {
    api.scanRecent(auth.token).then(setRecent).catch(() => {});
  }

  useEffect(() => {
    loadRecent();
    const scanner = new Html5Qrcode(READER_ID);
    scannerRef.current = scanner;

    Html5Qrcode.getCameras()
      .then((cameras) => {
        if (!cameras.length) throw new Error('Aucune caméra détectée');
        return scanner.start(
          cameras[0].id,
          { fps: 10, qrbox: 200 },
          (decodedText) => handleScan(decodedText, false),
          () => {}
        );
      })
      .catch((err) => setCameraError(err.message || String(err)));

    return () => {
      if (scanner.isScanning) scanner.stop().then(() => scanner.clear()).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleScan(code, manual) {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const res = await api.scan(auth.token, code, manual);
      setResult({ ok: true, ...res });
      loadRecent();
    } catch (err) {
      setResult({ ok: false, error: err.message });
    } finally {
      setTimeout(() => {
        busyRef.current = false;
      }, 1500);
    }
  }

  function handleManualSubmit(e) {
    e.preventDefault();
    if (manualCode.trim()) {
      handleScan(manualCode.trim(), true);
      setManualCode('');
    }
  }

  return (
    <div className="scan-page">
      <div className="scan-hello">
        <div>
          <h2>Pointage</h2>
          <p>Caméra à gauche, saisie du matricule à droite — le reste du registre est sur Pointages.</p>
        </div>
      </div>

      <div className="scan-desk">
        <section className="panel scan-cam">
          <div className="panel-head">
            <div>
              <h3><Camera size={16} /> Caméra</h3>
              <p>Présenter le badge dans le cadre</p>
            </div>
          </div>
          <div className="scan-frame-wrap">
            <div id={READER_ID} />
          </div>
          {cameraError ? (
            <p className="scan-hint">Caméra indisponible : {cameraError}. Utilisez la saisie à droite.</p>
          ) : (
            <p className="scan-hint">Un badge = un pointage par jour. Le seuil de retard se règle dans Réglages.</p>
          )}
        </section>

        <section className="panel scan-side">
          <div className="panel-head">
            <div>
              <h3><Keyboard size={16} /> Saisie manuelle</h3>
              <p>Si la caméra est en panne</p>
            </div>
          </div>
          <form className="manual-entry" onSubmit={handleManualSubmit}>
            <input
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="Matricule, ex. EMP-001"
              autoComplete="off"
            />
            <button type="submit" className="primary-btn">Valider</button>
          </form>

          {result && (
            <div className={`scan-result ${result.ok ? 'success' : 'error'}`}>
              {result.ok ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
              {result.ok ? (
                <span>
                  <strong>{result.employee.name}</strong>
                  <em>{result.employee.site} · {new Date(result.time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    {result.status === 'RETARD' ? ` · Retard` : ''}</em>
                </span>
              ) : (
                <strong>{result.error}</strong>
              )}
            </div>
          )}

          <div className="scan-recent-head">
            <ScanLine size={14} /> Derniers badgeages
          </div>
          {recent.length === 0 ? (
            <p className="scan-hint" style={{ textAlign: 'left' }}>Aucun pointage pour l’instant aujourd’hui.</p>
          ) : (
            <div className="scroll-pane scan-recent-pane">
              <ul className="scan-recent">
                {recent.map((r) => (
                  <li key={r.id}>
                    <Avatar firstName={r.name.split(' ')[0]} lastName={r.name.split(' ')[1] || ''} size={28} />
                    <div>
                      <strong>{r.name}</strong>
                      <span>{r.matricule} · {new Date(r.time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <Badge value={r.status} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
