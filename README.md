# NetCare

网络诊断工具。[功能参考](https://ip.skk.moe/)

## 运行

```bash
yarn install --frozen-lockfile
yarn dev
```

打开终端显示的本地地址。本机 IP 查询位于 `/`，网站分流位于 `/split-tunnel`，多出口 IP、DNS 出口和 IP 洞察分别位于 `/multi`、`/dns-exit-lookup` 和 `/query`。

## 功能

- 分别查询公网 IPv4 与 IPv6，显示归属地、运营商、ASN，支持复制 IP 和跳转到 IP 洞察。
- 对比两项国内与两项国际 IP 数据来源，测试八个网站的 HTTP 响应延迟。
- 查询 42 个目标的分流出口及归属地。浏览器会优先检测可见的网站，滚动后继续检测。
- 多出口检测从浏览器连接公网测速探针，按出口 IP 分组并显示探针地区、进度和失败数。
- DNS 出口检测展示权威 DNS 探针观察到的递归解析器地址和归属地。
- IP 洞察对比多个来源的 IPv4、IPv6 归属地和 ASN，支持通过 `/query?q=8.8.8.8` 分享查询。
- 支持失败重试、重新检测、三项隐私显示开关及浅色、深色和跟随系统主题。

检测请求由浏览器直接发出，因而会经过当前设备的代理或 VPN 规则。第三方接口、跨域权限和网络可达性会影响结果。隐藏开关只遮盖页面上的信息，便于截图或分享。

公网 IP 和归属地使用 IP.SB。国际数据来源分别使用 Cloudflare Trace 和 IPinfo 的公开接口。 [IP.SB API](https://ip.sb/api/) · [Cloudflare Trace](https://developers.cloudflare.com/fundamentals/reference/cdn-cgi-endpoint/) · [IPinfo API](https://support.ipinfo.io/hc/en-us/articles/30792479436562-What-Is-the-Difference-Between-Using-the-Authenticated-Free-Plan-and-the-Public-API-With-No-Account/)

iP138 年度站在本地预览时可能限制跨域读取。卡片会提供重试和直接打开该服务的入口。

## IP 洞察的可选数据源

公开数据源可以直接查询。若有本地 MMDB 数据库或数据供应商的 API 密钥，可在 `.env.local` 中配置并重启 `yarn dev` 或 `yarn preview`。使用绝对路径指定已有的兼容 MMDB 文件，密钥由本机查询服务读取。

| 数据源                                | 配置                                                            |
| ------------------------------------- | --------------------------------------------------------------- |
| DB-IP City Lite、GeoLite2 City        | `NETCARE_DBIP_MMDB`、`NETCARE_GEOLITE2_MMDB`                    |
| IPIP.net 2023、纯真 CZ88 的 MMDB 数据 | `NETCARE_IPIP_MMDB`、`NETCARE_CZ88_MMDB`                        |
| IP-API、ipdata、GEO IPIFY             | `NETCARE_IP_API_KEY`、`NETCARE_IPDATA_KEY`、`NETCARE_IPIFY_KEY` |
| ipregistry、IPstack                   | `NETCARE_IPREGISTRY_KEY`、`NETCARE_IPSTACK_KEY`                 |

## 检查和构建

```bash
yarn test
yarn build
yarn preview
```

生产构建输出到 `dist/`，其中包含五个页面的 HTML。支持目录索引的静态服务器可运行浏览器探测和公开查询。配置了数据库或密钥的来源使用本地 Vite 服务。
