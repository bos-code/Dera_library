package expo.modules.deradocumentscanner

import java.io.BufferedInputStream
import java.io.InputStream
import java.io.OutputStream
import java.net.Inet4Address
import java.net.InetSocketAddress
import java.net.NetworkInterface
import java.net.ServerSocket
import java.net.Socket
import java.net.URLDecoder
import java.net.URLEncoder
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * "Send to computer": a tiny web server on the local Wi-Fi, running only while the transfer screen is open.
 * A browser on the same network can download library documents and upload files into Dera. No cloud.
 *
 * Every request needs the random access code shown on the phone (?t=CODE); without it the server answers 403.
 */
internal class TransferServer(
  private val catalog: () -> List<Entry>,
  private val openFile: (id: Long) -> Pair<InputStream, Long>?,
  private val receive: (name: String, body: InputStream, length: Long) -> Boolean,
) {
  data class Entry(val id: Long, val name: String, val title: String, val size: Long, val mime: String)

  val token: String = randomToken()
  private var server: ServerSocket? = null
  private var pool: ExecutorService? = null

  @Volatile
  var running = false
    private set

  /** Starts listening; returns the port (preferred one if free, otherwise any). */
  fun start(preferredPort: Int = 8765): Int {
    val socket = try {
      ServerSocket().apply {
        reuseAddress = true
        bind(InetSocketAddress(preferredPort))
      }
    } catch (_: Exception) {
      ServerSocket(0)
    }
    server = socket
    pool = Executors.newFixedThreadPool(4)
    running = true
    Thread({
      while (running) {
        val client = try {
          socket.accept()
        } catch (_: Exception) {
          break
        }
        pool?.execute { handle(client) }
      }
    }, "dera-transfer").apply { isDaemon = true }.start()
    return socket.localPort
  }

  fun stop() {
    running = false
    try {
      server?.close()
    } catch (_: Exception) {
    }
    pool?.shutdownNow()
    server = null
    pool = null
  }

  // region HTTP

  private fun handle(socket: Socket) {
    socket.use { s ->
      s.soTimeout = 30_000
      val input = BufferedInputStream(s.getInputStream())
      val out = s.getOutputStream()
      try {
        val requestLine = readLine(input) ?: return
        val parts = requestLine.split(" ")
        if (parts.size < 2) return respond(out, 400, "text/plain", "Bad request")
        val method = parts[0]
        val (path, query) = parts[1].split("?", limit = 2).let { it[0] to (it.getOrNull(1) ?: "") }
        val headers = mutableMapOf<String, String>()
        while (true) {
          val line = readLine(input) ?: break
          if (line.isEmpty()) break
          val idx = line.indexOf(':')
          if (idx > 0) headers[line.substring(0, idx).trim().lowercase()] = line.substring(idx + 1).trim()
        }
        val params = parseQuery(query)
        if (!authorized(params["t"])) return respond(out, 403, "text/plain", "Wrong or missing access code. Use the address shown in Dera.")
        when {
          method == "GET" && path == "/" -> respond(out, 200, "text/html; charset=utf-8", page())
          method == "GET" && path.startsWith("/f/") -> download(out, path.removePrefix("/f/").toLongOrNull())
          method == "POST" && path == "/upload" -> upload(out, input, params["name"], headers["content-length"]?.toLongOrNull())
          else -> respond(out, 404, "text/plain", "Not found")
        }
      } catch (_: Exception) {
        // Client went away or sent garbage; nothing to clean up beyond the socket.
      }
    }
  }

  private fun authorized(given: String?): Boolean =
    given != null && MessageDigest.isEqual(given.toByteArray(), token.toByteArray())

  private fun download(out: OutputStream, id: Long?) {
    val entry = catalog().firstOrNull { it.id == id } ?: return respond(out, 404, "text/plain", "Not found")
    val (stream, length) = openFile(entry.id) ?: return respond(out, 410, "text/plain", "The file is no longer available")
    stream.use {
      val encoded = URLEncoder.encode(entry.name, "UTF-8").replace("+", "%20")
      out.write(
        ("HTTP/1.1 200 OK\r\nContent-Type: ${entry.mime}\r\nContent-Length: $length\r\n" +
          "Content-Disposition: attachment; filename*=UTF-8''$encoded\r\nConnection: close\r\n\r\n").toByteArray()
      )
      it.copyTo(out)
      out.flush()
    }
  }

  private fun upload(out: OutputStream, input: InputStream, rawName: String?, length: Long?) {
    val name = rawName?.substringAfterLast('/')?.substringAfterLast('\\')?.trim()?.takeIf { it.isNotEmpty() && !it.startsWith(".") }
      ?: return respond(out, 400, "application/json", """{"ok":false,"error":"name"}""")
    if (length == null || length <= 0 || length > MAX_UPLOAD) return respond(out, 413, "application/json", """{"ok":false,"error":"size"}""")
    val body = LimitedInputStream(input, length)
    val ok = receive(name, body, length)
    respond(out, if (ok) 200 else 500, "application/json", if (ok) """{"ok":true}""" else """{"ok":false}""")
  }

  private fun respond(out: OutputStream, status: Int, type: String, body: String) {
    val bytes = body.toByteArray(Charsets.UTF_8)
    val reason = mapOf(200 to "OK", 400 to "Bad Request", 403 to "Forbidden", 404 to "Not Found", 410 to "Gone", 413 to "Payload Too Large", 500 to "Internal Server Error")[status] ?: "OK"
    out.write("HTTP/1.1 $status $reason\r\nContent-Type: $type\r\nContent-Length: ${bytes.size}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n".toByteArray())
    out.write(bytes)
    out.flush()
  }

  /** ASCII header line without the CRLF; null at end of stream. */
  private fun readLine(input: InputStream): String? {
    val sb = StringBuilder()
    while (true) {
      val c = input.read()
      if (c == -1) return if (sb.isEmpty()) null else sb.toString()
      if (c == '\n'.code) return sb.toString().trimEnd('\r')
      if (sb.length > 8192) return null
      sb.append(c.toChar())
    }
  }

  private fun parseQuery(q: String): Map<String, String> =
    q.split("&").filter { it.isNotEmpty() }.associate {
      val (k, v) = it.split("=", limit = 2).let { p -> p[0] to (p.getOrNull(1) ?: "") }
      URLDecoder.decode(k, "UTF-8") to URLDecoder.decode(v, "UTF-8")
    }

  // endregion

  private fun page(): String {
    val rows = catalog().joinToString("") { e ->
      "<li><a href=\"/f/${e.id}?t=$token\">${esc(e.title)}</a><span>${esc(e.name)} · ${size(e.size)}</span></li>"
    }
    return """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dera Library</title><style>
body{font:16px/1.5 system-ui,sans-serif;margin:0;background:#F2EEE6;color:#17160F}main{max-width:760px;margin:auto;padding:24px}
h1{font-size:28px;margin:0 0 4px}p{color:#56514A}#drop{border:2px dashed #2C5A4C;border-radius:16px;padding:24px;text-align:center;margin:16px 0;background:#fff}
input{margin-top:8px}ul{list-style:none;padding:0}li{background:#fff;border-radius:12px;padding:12px 16px;margin:8px 0;display:flex;flex-direction:column}
a{color:#2C5A4C;font-weight:600;text-decoration:none}li span{color:#6E6759;font-size:13px}#status{font-weight:600;color:#2C5A4C}
@media (prefers-color-scheme:dark){body{background:#0D0F0D;color:#F2EFE6}li,#drop{background:#191B18}a,#status{color:#8FD0B6}p,li span{color:#ADA99E}}
</style></head><body><main><h1>Dera Library</h1><p>Connected to your phone over Wi-Fi. Nothing goes through the internet.</p>
<div id="drop"><strong>Send files to your phone</strong><br><input id="file" type="file" multiple><div id="status"></div></div>
<h2>Download from your library</h2><ul>$rows</ul></main><script>
const t=new URLSearchParams(location.search).get("t");const st=document.getElementById("status");
async function send(files){for(const f of files){st.textContent="Sending "+f.name+"…";
const r=await fetch("/upload?t="+encodeURIComponent(t)+"&name="+encodeURIComponent(f.name),{method:"POST",body:f});
st.textContent=r.ok?"Sent "+f.name+" ✓":"Couldn't send "+f.name;}}
document.getElementById("file").onchange=e=>send(e.target.files);
const d=document.getElementById("drop");d.ondragover=e=>e.preventDefault();d.ondrop=e=>{e.preventDefault();send(e.dataTransfer.files)};
</script></body></html>"""
  }

  private fun esc(s: String) = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;")

  private fun size(b: Long): String = when {
    b < 1024 -> "$b B"
    b < 1024 * 1024 -> "${b / 1024} KB"
    else -> String.format("%.1f MB", b / 1048576.0)
  }

  /** Stops reading at the declared Content-Length so a client can't stream forever. */
  private class LimitedInputStream(private val inner: InputStream, private var remaining: Long) : InputStream() {
    override fun read(): Int = if (remaining <= 0) -1 else inner.read().also { if (it >= 0) remaining-- }
    override fun read(b: ByteArray, off: Int, len: Int): Int {
      if (remaining <= 0) return -1
      val n = inner.read(b, off, minOf(len.toLong(), remaining).toInt())
      if (n > 0) remaining -= n
      return n
    }
  }

  companion object {
    const val MAX_UPLOAD = 512L * 1024 * 1024

    private fun randomToken(): String {
      val chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // no 0/O/1/I: easy to read off a screen
      val rnd = SecureRandom()
      return (1..8).map { chars[rnd.nextInt(chars.length)] }.joinToString("")
    }

    /** This phone's address on the local network (Wi-Fi or hotspot), or null when offline. */
    fun localAddress(): String? =
      NetworkInterface.getNetworkInterfaces()?.toList().orEmpty()
        .filter { it.isUp && !it.isLoopback }
        .sortedBy { if (it.name.startsWith("wlan") || it.name.startsWith("ap")) 0 else 1 }
        .flatMap { it.inetAddresses.toList() }
        .firstOrNull { it is Inet4Address && it.isSiteLocalAddress }
        ?.hostAddress
  }
}
