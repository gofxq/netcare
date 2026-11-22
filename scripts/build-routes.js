import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { localTools } from '../src/catalog.js'

const home = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8')

await Promise.all(localTools.filter(({ path }) => path !== '/').map(async ({ path, label }) => {
  const directory = new URL(`../dist${path}/`, import.meta.url)
  const html = home.replace('<title>本机 IP 查询 · NetCare</title>', `<title>${label} · NetCare</title>`)
  await mkdir(directory, { recursive: true })
  await writeFile(new URL('index.html', directory), html)
}))
