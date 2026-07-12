const port = Number(process.argv[2])
const expression = Buffer.from(process.argv[3] || '', 'base64').toString('utf8')
const targetUrl = process.argv[4]
const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json())
const target = targets.find(candidate => candidate.type === 'page' && (!targetUrl || candidate.url === targetUrl))
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})
const result = await new Promise((resolve, reject) => {
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data))
    if (message.id !== 1) return
    message.error ? reject(new Error(message.error.message)) : resolve(message.result)
  })
  socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: {
    expression, awaitPromise: true, returnByValue: true
  } }))
})
socket.close()
if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
process.stdout.write(`${JSON.stringify(result.result.value, null, 2)}\n`)
