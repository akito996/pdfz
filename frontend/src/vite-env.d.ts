/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" nella web app per iPhone (frontend/.env.web, vite build --mode web) */
  readonly VITE_WEB_APP?: string;
}
