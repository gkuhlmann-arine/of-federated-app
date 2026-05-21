import { useEffect, useRef, useState } from "react"

const BACKEND = "https://lux-sandbox-gkuhlmann.akeso.io"

const styles = {
  container: { fontFamily: "sans-serif", maxWidth: 800, margin: "0 auto", padding: 16 },
  header: { fontSize: 14, color: "#666", marginBottom: 16 },
  panel: { border: "1px solid #ddd", borderRadius: 4, padding: 12, marginBottom: 16 },
  panelTitle: { fontWeight: "bold", marginBottom: 8, fontSize: 14 },
  transcriptList: { listStyle: "none", margin: 0, padding: 0, maxHeight: 300, overflowY: "auto" as const },
  transcriptItem: { padding: "4px 0", borderBottom: "1px solid #f0f0f0", fontSize: 14 },
  pre: { margin: 0, fontSize: 12, whiteSpace: "pre-wrap" as const, wordBreak: "break-word" as const },
  endedBanner: { background: "#e8f5e9", border: "1px solid #4caf50", borderRadius: 4, padding: 12, marginBottom: 16, fontWeight: "bold" as const },
  errorBanner: { background: "#ffebee", border: "1px solid #ef5350", borderRadius: 4, padding: 12, marginBottom: 16 },
  button: { padding: "8px 16px", cursor: "pointer", fontSize: 14 },
} as const

// Fetch wrapper that injects Authorization and handles ALB sticky-session cookies.
// Follows 307/308 redirects manually to preserve the Authorization header
// (browsers strip auth headers on cross-origin redirects).
async function authFetch(url: string, token: string, options: RequestInit = {}): Promise<Response> {
  const headers = { ...options.headers, Authorization: `Bearer ${token}` }
  const fetchOptions: RequestInit = { ...options, headers, credentials: "include" as const }
  const response = await fetch(url, { ...fetchOptions, redirect: "manual" })
  if (response.status === 307 || response.status === 308) {
    const location = response.headers.get("Location")
    if (location) {
      const redirectUrl = new URL(location, url)
      redirectUrl.protocol = new URL(url).protocol
      return fetch(redirectUrl.toString(), fetchOptions)
    }
  }
  return response
}

export default function App() {
  const [callId, setCallId] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)

  const [transcriptSegments, setTranscriptSegments] = useState<string[]>([])
  const [extraction, setExtraction] = useState<Record<string, unknown>>({})
  const [callEnded, setCallEnded] = useState(false)
  const [sseError, setSseError] = useState<string | null>(null)
  const [facts, setFacts] = useState<string | null>(null)
  const [factsError, setFactsError] = useState<string | null>(null)
  const [loadingFacts, setLoadingFacts] = useState(false)

  const transcriptEndRef = useRef<HTMLLIElement>(null)
  const sseAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "LUX_CALL_STARTED") {
        setCallId(e.data.callId)
        setToken(e.data.token)
      }
    }
    window.addEventListener("message", handler)
    return () => window.removeEventListener("message", handler)
  }, [])

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [transcriptSegments])

  useEffect(() => {
    if (!callId || !token) return

    const abort = new AbortController()
    sseAbortRef.current = abort

    async function runSSE() {
      const response = await authFetch(
        `${BACKEND}/api/calls/${callId}/events`,
        token!,
        { headers: { Accept: "text/event-stream", "Cache-Control": "no-cache" }, signal: abort.signal }
      )

      if (!response.ok || !response.body) {
        setSseError(`SSE connection failed (${response.status}).`)
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buf = ""

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })

          const messages = buf.split("\n\n")
          buf = messages.pop() ?? ""

          for (const msg of messages) {
            if (!msg.trim() || msg.startsWith(":")) continue
            const eventMatch = msg.match(/^event: (.+)$/m)
            const dataMatch = msg.match(/^data: (.+)$/m)
            const eventType = eventMatch?.[1]?.trim()
            const data = dataMatch?.[1]?.trim() ?? ""

            if (eventType === "transcript_update") {
              try {
                const parsed = JSON.parse(data)
                const text: string = parsed.text ?? parsed.transcript ?? JSON.stringify(parsed)
                setTranscriptSegments((prev) => [...prev, text])
              } catch {
                setTranscriptSegments((prev) => [...prev, data])
              }
            } else if (eventType === "extraction_update") {
              try { setExtraction(JSON.parse(data)) } catch { /* ignore malformed */ }
            } else if (eventType === "stream_end") {
              setCallEnded(true)
              return
            }
          }
        }
      } catch (err) {
        if (!abort.signal.aborted) setSseError(`SSE connection lost: ${String(err)}`)
      }
    }

    runSSE()
    return () => abort.abort()
  }, [callId, token])

  async function handleGetFacts() {
    if (!callId || !token) return
    setLoadingFacts(true)
    setFactsError(null)
    try {
      const res = await authFetch(`${BACKEND}/api/notes/${callId}/facts`, token, { method: "POST" })
      if (!res.ok) throw new Error(`/api/notes/${callId}/facts returned ${res.status}`)
      const data = await res.json()
      setFacts(data.rendered ?? JSON.stringify(data, null, 2))
    } catch (err) {
      setFactsError(String(err))
    } finally {
      setLoadingFacts(false)
    }
  }

  if (!callId || !token) {
    return <div style={styles.container}>Waiting for a call…</div>
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>Call ID: {callId}</div>

      <div style={styles.panel}>
        <div style={styles.panelTitle}>Transcript</div>
        <ul style={styles.transcriptList}>
          {transcriptSegments.map((seg, i) => (
            <li key={i} style={styles.transcriptItem}>{seg}</li>
          ))}
          <li ref={transcriptEndRef} />
        </ul>
      </div>

      <div style={styles.panel}>
        <div style={styles.panelTitle}>Extraction</div>
        <pre style={styles.pre}>{JSON.stringify(extraction, null, 2)}</pre>
      </div>

      {sseError && <div style={styles.errorBanner}>{sseError}</div>}

      {callEnded && (
        <>
          <div style={styles.endedBanner}>Call ended</div>
          <button style={styles.button} onClick={handleGetFacts} disabled={loadingFacts}>
            {loadingFacts ? "Loading…" : "Get Facts"}
          </button>
        </>
      )}

      {factsError && <div style={styles.errorBanner}>{factsError}</div>}

      {facts && (
        <div style={styles.panel}>
          <div style={styles.panelTitle}>Facts</div>
          <pre style={styles.pre}>{facts}</pre>
        </div>
      )}
    </div>
  )
}
