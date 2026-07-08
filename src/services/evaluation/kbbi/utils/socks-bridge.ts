import { createServer, type Server } from 'node:http'
import { connect, type Socket } from 'node:net'

const SOCKS5_VERSION = 0x05
const SOCKS5_AUTH_NONE = 0x00
const SOCKS5_CMD_CONNECT = 0x01
const SOCKS5_ADDR_DOMAIN = 0x03

const SOCKS_HANDSHAKE_TIMEOUT_MS = 10_000

const socks5Connect = (
  targetHost: string,
  targetPort: number,
  socksHost: string,
  socksPort: number,
): Promise<Socket> =>
  new Promise((resolve, reject) => {
    const socket = connect({ host: socksHost, port: socksPort })
    const timer = setTimeout(() => {
      socket.destroy(new Error('SOCKS5 handshake timeout'))
    }, SOCKS_HANDSHAKE_TIMEOUT_MS)
    let phase: 'greeting' | 'connect' | 'done' = 'greeting'

    const finish = (err: Error | null): void => {
      clearTimeout(timer)
      socket.removeAllListeners('data')
      socket.removeAllListeners('error')
      if (err) {
        socket.destroy()
        reject(err)
      } else {
        resolve(socket)
      }
    }

    socket.on('error', (err) => finish(err))

    socket.once('connect', () => {
      socket.write(Buffer.from([SOCKS5_VERSION, 0x01, SOCKS5_AUTH_NONE]))
    })

    socket.on('data', (chunk) => {
      if (phase === 'greeting') {
        if (
          chunk.length < 2 ||
          chunk[0] !== SOCKS5_VERSION ||
          chunk[1] !== SOCKS5_AUTH_NONE
        ) {
          return finish(new Error('SOCKS5 greeting rejected'))
        }
        const hostBuf = Buffer.from(targetHost, 'utf8')
        if (hostBuf.length > 255) {
          return finish(new Error('SOCKS5 target hostname too long'))
        }
        const req = Buffer.alloc(7 + hostBuf.length)
        req[0] = SOCKS5_VERSION
        req[1] = SOCKS5_CMD_CONNECT
        req[2] = 0x00
        req[3] = SOCKS5_ADDR_DOMAIN
        req[4] = hostBuf.length
        hostBuf.copy(req, 5)
        req.writeUInt16BE(targetPort, 5 + hostBuf.length)
        socket.write(req)
        phase = 'connect'
        return
      }
      if (phase === 'connect') {
        if (chunk.length < 2 || chunk[0] !== SOCKS5_VERSION) {
          return finish(new Error('SOCKS5 reply malformed'))
        }
        if (chunk[1] !== 0x00) {
          return finish(new Error(`SOCKS5 CONNECT failed (rep=${chunk[1]})`))
        }
        phase = 'done'
        finish(null)
      }
    })
  })

const probeSocks5 = (host: string, port: number, timeoutMs = 1_500): Promise<boolean> =>
  new Promise((resolve) => {
    const sock = connect({ host, port })
    const timer = setTimeout(() => {
      sock.destroy()
      resolve(false)
    }, timeoutMs)
    sock.once('error', () => {
      clearTimeout(timer)
      resolve(false)
    })
    sock.once('connect', () => {
      clearTimeout(timer)
      sock.end()
      resolve(true)
    })
  })

export type SocksBridge = {
  url: string
  server: Server
  socksHost: string
  socksPort: number
}

export const startSocksBridge = async (
  socksHost: string,
  socksPort: number,
): Promise<SocksBridge> => {
  const server = createServer()
  server.on('connect', async (req, clientSocket, head) => {
    if (!req.url) {
      clientSocket.end('HTTP/1.1 400 Bad Request\r\n\r\n')
      return
    }
    const [host, portStr] = req.url.split(':')
    const port = Number(portStr) || 443
    try {
      const upstream = await socks5Connect(host, port, socksHost, socksPort)
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head.length > 0) upstream.write(head)
      upstream.pipe(clientSocket)
      clientSocket.pipe(upstream)
      const teardown = (): void => {
        clientSocket.destroy()
        upstream.destroy()
      }
      upstream.on('error', teardown)
      clientSocket.on('error', teardown)
      upstream.on('end', () => clientSocket.end())
      clientSocket.on('end', () => upstream.end())
    } catch {
      clientSocket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n')
    }
  })

  server.on('request', (req, res) => {
    res.writeHead(405, { 'content-type': 'text/plain' })
    res.end(
      'SOCKS bridge accepts HTTPS CONNECT only; all KBBI sources are HTTPS.',
    )
  })

  await new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve()),
  )
  const addr = server.address()
  const port =
    addr && typeof addr === 'object' && 'port' in addr ? addr.port : 0
  return {
    url: `http://127.0.0.1:${port}`,
    server,
    socksHost,
    socksPort,
  }
}

export const isSocks5Reachable = (
  host: string,
  port: number,
): Promise<boolean> => probeSocks5(host, port)

export const stopSocksBridge = (bridge: SocksBridge): Promise<void> =>
  new Promise((resolve) => bridge.server.close(() => resolve()))
