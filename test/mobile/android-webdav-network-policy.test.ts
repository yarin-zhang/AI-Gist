import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('Android WebDAV network policy', () => {
  it('allows user-configured HTTP WebDAV servers such as local NAS devices', async () => {
    const manifest = await readFile('android/app/src/main/AndroidManifest.xml', 'utf8')

    expect(manifest).toContain('android:usesCleartextTraffic="true"')
    expect(manifest).toContain('android.permission.INTERNET')
  })
})
