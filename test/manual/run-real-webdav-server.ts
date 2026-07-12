import { TestWebDAVServer } from '../helpers/webdav-server'

const server = new TestWebDAVServer({
  port: Number(process.env.AI_GIST_TEST_WEBDAV_PORT || 18765),
  host: process.env.AI_GIST_TEST_WEBDAV_HOST || '0.0.0.0',
  rootDir: process.env.AI_GIST_TEST_WEBDAV_ROOT,
  username: 'testuser',
  password: 'testpass'
})

await server.start()
console.log(JSON.stringify({ ready: true, rootDir: server.rootDir }))
await new Promise(() => undefined)
