/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin of blog-backend, e.g. https://api.example.com. Empty: demo mode with mock data. */
  readonly VITE_API_BASE_URL?: string;
  /** "true" only for the production deployment with a real API: lets search engines index the site. */
  readonly VITE_INDEXABLE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
