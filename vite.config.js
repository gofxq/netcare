import { defineConfig, loadEnv } from 'vite'
import { geoLookupPlugin } from './server/geo-lookup.js'

export default defineConfig(({ mode }) => ({
  esbuild: { jsx: 'automatic' },
  plugins: [geoLookupPlugin(loadEnv(mode, process.cwd(), 'NETCARE_'))],
}))
