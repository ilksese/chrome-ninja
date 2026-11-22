import { startPageControlServer } from "../server.mjs"

const host = process.env.HOST || "127.0.0.1"
const port = readPort(process.argv.slice(2), process.env.PORT || 8788)

const service = await startPageControlServer({ host, port })
console.log(`page control: http://${service.host}:${service.port}`)

function readPort(args, fallback) {
  const index = args.indexOf("--port")
  const raw = index === -1 ? fallback : args[index + 1]
  const port = Number(raw)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`Invalid port: ${raw || "(missing)"}`)
    process.exit(1)
  }
  return port
}
