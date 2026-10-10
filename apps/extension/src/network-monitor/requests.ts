import type { NetmonFormEntry, NetmonHeader, NetmonParameter, NetmonRecord } from "./types"

export function queryParameters(url: string): NetmonParameter[] {
  try {
    return [...new URL(url).searchParams].map(([name, value]) => ({ name, value }))
  } catch {
    return []
  }
}

export function requestCopyReason(record: NetmonRecord): string | null {
  const body = record.requestBody
  if (body === undefined) return "此记录未采集请求体信息，无法完整复制请求"
  if (!body) return null
  if (body.kind === "unavailable") return body.description
  if (body.truncated) return "请求体已截断，无法完整复制请求"
  if ("note" in body && body.note) return body.note
  if (body.kind === "formdata" && body.entries.some((entry) => "file" in entry)) {
    return "仅采集了文件元数据，无法复制包含文件内容的请求"
  }
  if (record.method === "GET" || record.method === "HEAD") return "GET／HEAD 请求体无法可靠重放"
  return null
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

function copyHeaders(record: NetmonRecord): NetmonHeader[] {
  const multipart = record.requestBody?.kind === "formdata"
  const headers = record.requestHeaders.filter(
    (header) =>
      !multipart ||
      header.name.toLowerCase() !== "content-type" ||
      !/^multipart\/form-data(?:\s*;|\s*$)/i.test(header.value)
  )
  const body = record.requestBody
  if (
    body &&
    (body.kind === "text" || body.kind === "urlencoded") &&
    !headers.some((header) => header.name.toLowerCase() === "content-type")
  ) {
    return [
      ...headers,
      {
        name: "content-type",
        value:
          body.kind === "urlencoded" ? "application/x-www-form-urlencoded;charset=UTF-8" : "text/plain;charset=UTF-8"
      }
    ]
  }
  return headers
}

function textFormEntries(entries: NetmonFormEntry[]): NetmonParameter[] {
  return entries.filter((entry): entry is NetmonParameter => "value" in entry)
}

export function curlCopyReason(record: NetmonRecord): string | null {
  const reason = requestCopyReason(record)
  if (reason) return reason
  if (
    record.url.includes("\0") ||
    record.method.includes("\0") ||
    copyHeaders(record).some((header) => header.name.includes("\0") || header.value.includes("\0"))
  ) {
    return "请求信息包含 NUL 字符，不能安全转换为 shell 命令"
  }
  const body = record.requestBody
  if ((body?.kind === "text" || body?.kind === "urlencoded") && body.text.includes("\0")) {
    return "正文包含 NUL 字符，不能作为 shell 参数传给 Curl；仍可复制 Fetch"
  }
  if (body?.kind === "formdata") {
    if (body.entries.length === 0) return "空 FormData 不能通过此 Curl 命令完整重建；仍可复制 Fetch"
    if (
      textFormEntries(body.entries).some(
        (entry) => !entry.name || /[=\r\n\0]/.test(entry.name) || entry.value.includes("\0")
      )
    ) {
      return "此表单字段不能安全转换为 Curl；仍可复制 Fetch"
    }
  }
  return null
}

export function toCurl(record: NetmonRecord): string | null {
  if (curlCopyReason(record)) return null
  const lines = [`curl --globoff ${shellQuote(record.url)}`, `  -X ${shellQuote(record.method)}`]
  for (const header of copyHeaders(record)) {
    lines.push(`  -H ${shellQuote(header.value === "" ? `${header.name};` : `${header.name}: ${header.value}`)}`)
  }
  const body = record.requestBody
  if (body?.kind === "text" || body?.kind === "urlencoded") {
    lines.push(`  --data-raw ${shellQuote(body.text)}`)
  } else if (body?.kind === "formdata") {
    for (const entry of textFormEntries(body.entries)) {
      const value = entry.value.replace(/\r\n|\r|\n/g, "\r\n")
      lines.push(`  --form-string ${shellQuote(`${entry.name}=${value}`)}`)
    }
  }
  return lines.join(" \\\n")
}

export function toFetch(record: NetmonRecord): string | null {
  if (requestCopyReason(record)) return null
  const lines: string[] = []
  const body = record.requestBody
  if (body?.kind === "formdata") {
    lines.push("const formData = new FormData()")
    for (const entry of textFormEntries(body.entries)) {
      lines.push(`formData.append(${JSON.stringify(entry.name)}, ${JSON.stringify(entry.value)})`)
    }
  }
  const options = [`  method: ${JSON.stringify(record.method)}`]
  const headers = copyHeaders(record)
  if (headers.length) {
    options.push(
      `  headers: ${JSON.stringify(
        headers.map((header) => [header.name, header.value]),
        null,
        2
      ).replace(/\n/g, "\n  ")}`
    )
  }
  if (body?.kind === "text" || body?.kind === "urlencoded") options.push(`  body: ${JSON.stringify(body.text)}`)
  else if (body?.kind === "formdata") options.push("  body: formData")
  lines.push(`fetch(${JSON.stringify(record.url)}, {\n${options.join(",\n")}\n})`)
  return lines.join("\n")
}
