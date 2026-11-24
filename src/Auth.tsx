import { useState } from "react";
import { api } from "./api";
import { errMsg } from "./labels";
import { Icon } from "./ui";
import { Logo } from "./visuals";

/** Connexion et création de compte : formulaire à droite, rappel de ce que le compte permet à gauche (sur grand écran). */
export function Login({ onAuth, startRegister = false }: { onAuth: (t: string, r: string, e: string) => void; startRegister?: boolean }) {
  const [mode, setMode] = useState<"login" | "register">(startRegister ? "register" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      const r = mode === "login" ? await api.login(email, password) : await api.register(email, password);
      onAuth(r.token, r.role, email.trim().toLowerCase());
    } catch (err) { setError(errMsg(err)); }
    setBusy(false);
  };

  return (
    <div className="auth">
      <aside className="auth-side">
        <Logo size={44} />
        <h2>Votre espace ExcelPro</h2>
        <ul>
          <li><Icon name="package" size={20} /><span>Suivez vos commandes, du rapport de vérification à la livraison.</span></li>
          <li><Icon name="server" size={20} /><span>Hébergez vos données Excel et ouvrez-les à vos applications.</span></li>
          <li><Icon name="globe" size={20} /><span>Publiez votre site web à une adresse en ligne.</span></li>
        </ul>
      </aside>
      <form className="auth-card" onSubmit={submit}>
        <div className="seg wide" role="tablist" aria-label="Mode">
          <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? "on" : ""} onClick={() => { setMode("login"); setError(""); }}>Connexion</button>
          <button type="button" role="tab" aria-selected={mode === "register"} className={mode === "register" ? "on" : ""} onClick={() => { setMode("register"); setError(""); }}>Créer un compte</button>
        </div>
        <h1>{mode === "login" ? "Content de vous revoir" : "Créez votre compte"}</h1>
        <label>E-mail<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Mot de passe <span className="muted">(8 caractères minimum)</span>
          <span className="pw">
            <input type={show ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
            <button type="button" className="icon-btn" aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"} aria-pressed={show} onClick={() => setShow(!show)}><Icon name={show ? "eyeoff" : "eye"} size={18} /></button>
          </span>
        </label>
        {error && <p className="alert err" role="alert"><Icon name="alert" size={18} />{error}</p>}
        <button className="primary big full" type="submit" disabled={busy}>{busy ? "Un instant…" : mode === "login" ? "Se connecter" : "Créer mon compte"}</button>
      </form>
    </div>
  );
}
