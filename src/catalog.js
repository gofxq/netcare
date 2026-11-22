export const localTools = [
  { label: '本机 IP 查询', path: '/', icon: 'globe' },
  { label: '网站分流测试', path: '/split-tunnel', icon: 'route' },
  { label: '多出口 IP 查询', path: '/multi', icon: 'network' },
  { label: 'DNS 出口查询', path: '/dns-exit-lookup', icon: 'server' },
  { label: 'IP 洞察', path: '/query', icon: 'search' },
]

export const providers = [
  { id: 'ip138', name: 'iP138.com', region: 'domestic', mark: '138', color: 'blue' },
  { id: 'ipcn', name: 'IP.cn 查询网', region: 'domestic', mark: 'CN', color: 'purple' },
  { id: 'cloudflare', name: 'Cloudflare', region: 'international', mark: 'CF', color: 'orange' },
  { id: 'ipinfo', name: 'IPinfo.io', region: 'international', mark: 'IP', color: 'green' },
]

export const latencyTargets = [
  { name: '字节跳动', region: 'domestic', mark: '字', color: 'blue', url: 'https://lf3-zlink-tos.ugurl.cn/obj/zebra-public/resource_lmmizj_1632398893.png' },
  { name: 'Bilibili', region: 'domestic', mark: 'B', color: 'pink', url: 'https://i0.hdslb.com/bfs/face/member/noface.jpg@24w_24h_1c' },
  { name: '微信', region: 'domestic', mark: '微', color: 'green', url: 'https://res.wx.qq.com/a/wx_fed/assets/res/NTI4MWU5.ico' },
  { name: '淘宝', region: 'domestic', mark: '淘', color: 'orange', url: 'https://img.alicdn.com/imgextra/i2/O1CN01qnQCrN1VkzAWiU4Hs_!!6000000002692-2-tps-33-33.png' },
  { name: 'GitHub', region: 'international', mark: 'GH', color: 'slate', url: 'https://github.github.io/janky/images/bg_hr.png' },
  { name: 'jsDelivr', region: 'international', mark: 'JS', color: 'orange', url: 'https://cdn.jsdelivr.net/npm/latency-test@1.0.0/generate_200' },
  { name: 'Cloudflare', region: 'international', mark: 'CF', color: 'orange', url: 'https://latency-test.skk.moe/endpoint' },
  { name: 'YouTube', region: 'international', mark: 'YT', color: 'red', url: 'https://yt3.ggpht.com/favicon.ico' },
]

function trace(name, { host = name, region = 'international', category } = {}) {
  return { name, region, category, method: 'trace', url: `https://${host}/cdn-cgi/trace` }
}

export const splitTargets = [
  { name: '阿里巴巴', region: 'domestic', method: 'alibaba' },
  { name: '网易', region: 'domestic', method: 'header', header: 'cdn-user-ip', url: 'https://necaptcha.nosdn.127.net/ab7f4275c1744aa28e0a8f3a1c58c532.png' },
  { name: '字节跳动', region: 'domestic', method: 'header', url: 'https://perfops.byte-test.com/500b-bench.jpg' },
  { name: '腾讯', region: 'domestic', method: 'tencent' },
  trace('Cloudflare 中国网络', { host: 'perfops.cloudflareperf.com', region: 'domestic' }),
  trace('www.qualcomm.cn', { region: 'domestic' }),
  trace('www.cloudflare.com', { host: 'ip.skk.moe' }),
  trace('discord.com', { host: 'gateway.discord.gg' }),
  trace('www.visa.com'),
  trace('x.com'),
  trace('medium.com'),
  ...['chatgpt.com', 'sora.com', 'openai.com', 'claude.ai', 'grok.com', 'anthropic.com', 'www.perplexity.ai']
    .map((name) => trace(name, { category: 'AI' })),
  ...['e-hentai.org', 'missav.ws', 'missav.ai', 'missav.live', 'hanime1.me', 'hanimeone.me', 'hanime1.com', 'javchu.com', 'av.jkforum.net', 'javdb.com']
    .map((name) => trace(name, { category: 'NSFW' })),
  ...['coinbase.com', 'www.okx.com'].map((name) => trace(name, { category: 'Crypto' })),
  trace('cdn.jsdelivr.net', { host: 'testingcf.jsdelivr.net', category: 'Static' }),
  trace('cdnjs.cloudflare.com', { category: 'Static' }),
  trace('cloudflaremirrors.com', { category: 'Static' }),
  trace('registry.npmjs.org', { category: 'Static' }),
  trace('kali.download', { category: 'Static' }),
  trace('unpkg.com', { host: 'app.unpkg.com', category: 'Static' }),
  trace('crunchyroll.com'),
  trace('nodejs.org'),
  trace('gitlab.com'),
  ...[1, 2, 3].map((index) => ({
    name: `字节跳动 海外 ${index}`,
    region: 'international',
    method: 'header',
    url: `https://perfops${index}.byteperf.com/500b-bench.jpg`,
  })),
]
